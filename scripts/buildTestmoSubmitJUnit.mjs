import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PART1_FEATURE_CLASSNAME } from './part1TestmoConstants.mjs';
import {
    buildPart1CoverageFromSystemOut,
    parsePart1ConsoleEvents,
    rebuildPart1CoverageFromFeatureSubmitXml,
} from './part1TestmoCoverageFromEvents.mjs';
import {
    extractPart1FeatureCases,
    extractPart1TestcaseSystemOut,
    readPart1FeatureSuiteMeta,
} from './part1TestmoReporting.mjs';
import {
    PART2_AGGREGATE_TESTNAME,
    PART2_FEATURE_CLASSNAME,
} from './part2TestmoConstants.mjs';
import {
    buildPart2CoverageFromSystemOut,
    parsePart2ConsoleEvents,
    rebuildPart2CoverageFromFeatureSubmitXml,
} from './part2TestmoCoverageFromEvents.mjs';
import {
    attachmentsForCase,
    derivePart2RunIdentity,
    parsePlaywrightAttachmentLines,
    resolvePart2ArtifactManifest,
    sha256Hex,
} from './part2TestmoArtifacts.mjs';
import { recomputeJUnitCounts } from './junitCounts.mjs';
import {
    assertPart2SubmitProvenanceAligned,
    pickPart2JUnitSourcePath,
    readPart1SuiteMeta,
} from './part2SubmitProvenance.mjs';
import {
    extractPart2TestcaseSystemOut,
    readPart2SuiteMeta,
} from './part2TestmoReporting.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SECRET_JSON = /"(sharedReportUrl|accessToken|refreshToken|password|testmoToken|otp|authorization)"\s*:\s*"[^"]*"/gi;

export function redactSecretsForTestmoPayload(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text
        .replace(SECRET_JSON, '"$1":"[redacted]"')
        .replace(/token=[^&\s"]+/gi, 'token=[redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
        .replace(/https:\/\/[^\s"]*shared-report[^\s"]*/gi, '[redacted-shared-report-url]');
}

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function caseStatusElement(caseResult) {
    if (caseResult.status === 'Failed') {
        const message = escapeXml(caseResult.outcomeDetail.slice(0, 500));
        return `<failure message="${message}">${message}</failure>`;
    }
    if (caseResult.status === 'Skipped') {
        const message = escapeXml(caseResult.outcomeDetail.slice(0, 500));
        return `<skipped message="${message}"/>`;
    }
    return '';
}

function buildPartFeatureSystemOut(marker, caseResult, runIdentity, attachmentLines) {
    const payload = {
        automationKey: caseResult.automationKey,
        key: caseResult.key,
        title: caseResult.title,
        status: caseResult.status,
        outcomeDetail: caseResult.outcomeDetail,
        verificationDetails: caseResult.verificationDetails ?? null,
        durationSeconds: caseResult.durationSeconds ?? 0,
        runIdentity,
        artifactDeliveryNote:
            'Binary files are referenced via [[ATTACHMENT|repo-relative-path]] when present on disk. Testmo CLI may ingest these; otherwise attach manually.',
    };
    let body = `${marker} ${redactSecretsForTestmoPayload(payload)}\n`;
    for (const rel of attachmentLines) {
        body += `[[ATTACHMENT|${rel}]]\n`;
    }
    return `<![CDATA[\n${body}]]>`;
}

function resolvePart2SourcePath(options, repoRoot, combinedXml) {
    if (options.part2SourcePath) {
        return path.resolve(options.part2SourcePath);
    }
    const resultsDir = options.resultsDir ?? repoRoot;
    return pickPart2JUnitSourcePath({ repoRoot, resultsDir, combinedXml });
}

export function isTestmoSubmitFeatureOnlyXml(xml) {
    const hasAggregate = /<testcase\b[^>]*name="(fullE2ESmokePart1|fullE2ESmokePart2)"/.test(xml);
    if (hasAggregate) {
        return false;
    }
    return extractPart1FeatureCases(xml).length > 0 || extractPart2FeatureCases(xml).length > 0;
}

function derivePart1RunIdentity({ systemOut, resultsPart1Sha256, suiteTimestamp, derived, events }) {
    const started = events?.PART1_RUN_STARTED;
    return {
        runId: started?.accountEmail ? `part1-${String(started.accountEmail).slice(0, 24)}` : null,
        resultsPart1Sha256,
        suiteTimestamp,
        derived: Boolean(derived),
        smokePart: 1,
    };
}

function buildAggregateDiagnosticsBody(part, systemOut, attachmentLines, runIdentity) {
    const marker = part === 1 ? 'TESTMO_PART1_AGGREGATE_DIAGNOSTICS' : 'TESTMO_PART2_AGGREGATE_DIAGNOSTICS';
    const excerpt = systemOut
        ? String(systemOut)
              .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
              .split(/\r?\n/)
              .filter((l) => l.trim().startsWith(`PART${part}_`))
              .slice(0, 200)
              .join('\n')
        : '';
    let body = `${marker} ${redactSecretsForTestmoPayload({
        smokePart: part,
        runIdentity,
        retainedEventLineCount: excerpt.split(/\r?\n/).filter(Boolean).length,
        note: 'Non-counted suite diagnostics extracted before aggregate exclusion from TestMo submit payload.',
    })}\n`;
    if (excerpt) {
        body += `${redactSecretsForTestmoPayload(excerpt)}\n`;
    }
    for (const rel of attachmentLines) {
        body += `[[ATTACHMENT|${rel}]]\n`;
    }
    return `<![CDATA[\n${body}]]>`;
}

function buildFeatureSuiteXml({
    classname,
    hostname,
    timestamp,
    smokeRole,
    runIdProperty,
    runIdentity,
    coverage,
    marker,
    manifest,
    attachmentsFor,
    suiteDiagnostics,
}) {
    const fragments = coverage.cases.map((caseResult) => {
        const relAttachments = attachmentsFor(manifest, caseResult.key).map((a) => a.relativePath);
        const statusXml = caseStatusElement(caseResult);
        const time = caseResult.durationSeconds ?? 0;
        const properties = [
            `<property name="testmo_automation_key" value="${escapeXml(caseResult.automationKey)}"/>`,
            `<property name="smoke_role" value="${smokeRole}"/>`,
            `<property name="${runIdProperty}" value="${escapeXml(runIdentity.runId ?? '')}"/>`,
        ].join('\n    ');
        return `  <testcase name="${escapeXml(caseResult.automationKey)}" classname="${classname}" time="${time}">
    <properties>
    ${properties}
    </properties>
    ${statusXml}
    <system-out>${buildPartFeatureSystemOut(marker, caseResult, runIdentity, relAttachments)}</system-out>
  </testcase>`;
    });

    const ts = timestamp ?? new Date().toISOString();
    return `<testsuite name="${classname}" hostname="${escapeXml(hostname ?? 'chromium')}" tests="${fragments.length}" failures="0" skipped="0" errors="0" time="0" timestamp="${escapeXml(ts)}">
${suiteDiagnostics ? `  <system-out>${suiteDiagnostics}</system-out>\n` : ''}${fragments.join('\n')}
</testsuite>`;
}

function buildFeatureOnlySubmitXml({
    part1Coverage,
    part2Coverage,
    part1RunIdentity,
    part2RunIdentity,
    part1Meta,
    part2Meta,
    part1Diagnostics,
    part2Diagnostics,
    part2Manifest,
}) {
    const hostname = part2Meta?.hostname ?? part1Meta?.hostname ?? 'chromium';
    const part1Suite = part1Coverage?.cases?.length
        ? buildFeatureSuiteXml({
              classname: PART1_FEATURE_CLASSNAME,
              hostname,
              timestamp: part1Meta?.timestamp,
              smokeRole: 'part1-feature',
              runIdProperty: 'part1_run_id',
              runIdentity: part1RunIdentity,
              coverage: part1Coverage,
              marker: 'TESTMO_PART1_FEATURE',
              manifest: part1Coverage.artifacts ?? [],
              attachmentsFor: () => [],
              suiteDiagnostics: part1Diagnostics,
          })
        : '';

    const part2Suite = part2Coverage?.cases?.length
        ? buildFeatureSuiteXml({
              classname: PART2_FEATURE_CLASSNAME,
              hostname,
              timestamp: part2Meta?.timestamp,
              smokeRole: 'part2-feature',
              runIdProperty: 'part2_run_id',
              runIdentity: part2RunIdentity,
              coverage: part2Coverage,
              marker: 'TESTMO_PART2_FEATURE',
              manifest: part2Manifest ?? [],
              attachmentsFor: attachmentsForCase,
              suiteDiagnostics: part2Diagnostics,
          })
        : '';

    const body = [part1Suite, part2Suite].filter(Boolean).join('\n');
    const inner = recomputeJUnitCounts(`<testsuites tests="0" failures="0" skipped="0" errors="0" time="0">\n${body}\n</testsuites>`);
    return inner;
}

/**
 * @param {string} combinedXml
 * @param {object} [options]
 */
export function buildTestmoSubmitJUnit(combinedXml, options = {}) {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const featureOnlyInput = isTestmoSubmitFeatureOnlyXml(combinedXml);

    let part1Coverage = featureOnlyInput
        ? rebuildPart1CoverageFromFeatureSubmitXml(combinedXml)
        : null;
    let part2Coverage = featureOnlyInput
        ? rebuildPart2CoverageFromFeatureSubmitXml(combinedXml)
        : null;

    let part2ProvenanceReplaced = false;
    let part2Xml = combinedXml;
    const part2Path = resolvePart2SourcePath(options, repoRoot, combinedXml);
    const explicitSource = Boolean(process.env.SMOKE_PART2_JUNIT_SOURCE);

    if (!featureOnlyInput && part2Path && fs.existsSync(part2Path)) {
        part2Xml = fs.readFileSync(part2Path, 'utf8');
        const provenance = assertPart2SubmitProvenanceAligned(combinedXml, part2Xml, { explicitSource });
        part2ProvenanceReplaced = Boolean(provenance?.replaced);
        if (part2ProvenanceReplaced) {
            part2Xml = fs.readFileSync(part2Path, 'utf8');
        }
    }

    const part1Meta = featureOnlyInput
        ? readPart1FeatureSuiteMeta(combinedXml)
        : readPart1SuiteMeta(combinedXml);
    const part2Meta = readPart2SuiteMeta(part2Xml) ?? readPart2SuiteMeta(combinedXml);

    if (!part1Coverage) {
        const part1SystemOut = extractPart1TestcaseSystemOut(combinedXml);
        part1Coverage = buildPart1CoverageFromSystemOut(part1SystemOut, {
            markDerived: !part1SystemOut?.includes('PART1_TESTMO_COVERAGE '),
        });
    }

    if (!part2Coverage) {
        const part2SystemOut =
            extractPart2TestcaseSystemOut(part2Xml) ?? extractPart2TestcaseSystemOut(combinedXml);
        part2Coverage = buildPart2CoverageFromSystemOut(part2SystemOut, {
            markDerived: !part2SystemOut?.includes('PART2_TESTMO_COVERAGE '),
        });
    }

    const part1Cases = part1Coverage?.cases?.length ?? 0;
    const part2Cases = part2Coverage?.cases?.length ?? 0;
    if (part1Cases === 0 && part2Cases === 0) {
        return {
            xml: combinedXml,
            enriched: false,
            preview: {
                note: 'No Part 1/2 feature coverage reconstructable from system-out.',
                part1FeatureCaseCount: 0,
                part2FeatureCaseCount: 0,
                totalUploadedTestcases: 0,
            },
        };
    }

    const part1SystemOut = featureOnlyInput
        ? null
        : extractPart1TestcaseSystemOut(combinedXml);
    const part2SystemOut = extractPart2TestcaseSystemOut(part2Xml);
    const part2Sha = part2Path && fs.existsSync(part2Path) ? sha256Hex(part2Xml) : null;
    const part1Sha = sha256Hex(combinedXml);

    const part1Events = parsePart1ConsoleEvents(part1SystemOut ?? '');
    const part2Events = parsePart2ConsoleEvents(part2SystemOut ?? '');
    const part1RunIdentity = derivePart1RunIdentity({
        systemOut: part1SystemOut,
        resultsPart1Sha256: part1Sha,
        suiteTimestamp: part1Meta?.timestamp ?? null,
        derived: Boolean(part1Coverage?.derived),
        events: part1Events,
    });
    const part2RunIdentity = derivePart2RunIdentity({
        systemOut: part2SystemOut,
        resultsPart2Sha256: part2Sha,
        suiteTimestamp: part2Meta?.timestamp ?? null,
        derived: Boolean(part2Coverage?.derived),
        events: part2Events,
    });

    const junitAttachmentLines = parsePlaywrightAttachmentLines(part2SystemOut ?? '');
    const part2Manifest = resolvePart2ArtifactManifest({
        repoRoot,
        runIdentity: part2RunIdentity,
        junitAttachmentLines,
        coverageArtifacts: part2Coverage?.artifacts ?? [],
    });
    part2Coverage.artifacts = part2Manifest;
    part2Coverage.runIdentity = part2RunIdentity;

    const part1AttachmentLines = parsePlaywrightAttachmentLines(part1SystemOut ?? '');
    const part1Diagnostics = buildAggregateDiagnosticsBody(
        1,
        part1SystemOut,
        part1AttachmentLines,
        part1RunIdentity
    );
    const part2Diagnostics = buildAggregateDiagnosticsBody(
        2,
        part2SystemOut,
        junitAttachmentLines,
        part2RunIdentity
    );

    const replacedPart1 = featureOnlyInput ? extractPart1FeatureCases(combinedXml).length : 0;
    const replacedPart2 = featureOnlyInput ? extractPart2FeatureCases(combinedXml).length : 0;

    const xml = buildFeatureOnlySubmitXml({
        part1Coverage,
        part2Coverage,
        part1RunIdentity,
        part2RunIdentity,
        part1Meta,
        part2Meta,
        part1Diagnostics,
        part2Diagnostics,
        part2Manifest,
    });

    const preview = buildPreview({
        part1Coverage,
        part2Coverage,
        part1Meta,
        part2Meta,
        part1RunIdentity,
        part2RunIdentity,
        part2Manifest,
        part2ProvenanceReplaced,
    });

    return {
        xml,
        enriched: true,
        alreadyEnrichedInput: featureOnlyInput,
        replacedFeatureCount: replacedPart1 + replacedPart2,
        part1Coverage,
        part2Coverage,
        coverage: { part1: part1Coverage, part2: part2Coverage },
        manifest: part2Manifest,
        part2SourcePath: part2Path,
        preview,
    };
}

function buildPreview({
    part1Coverage,
    part2Coverage,
    part1Meta,
    part2Meta,
    part1RunIdentity,
    part2RunIdentity,
    part2Manifest,
    part2ProvenanceReplaced,
}) {
    const part1FeatureCaseCount = part1Coverage?.cases?.length ?? 0;
    const part2FeatureCaseCount = part2Coverage?.cases?.length ?? 0;
    const totalUploadedTestcases = part1FeatureCaseCount + part2FeatureCaseCount;
    return {
        aggregateTestcasesExcluded: ['fullE2ESmokePart1', PART2_AGGREGATE_TESTNAME],
        part1FeatureCaseCount,
        part2FeatureCaseCount,
        totalUploadedTestcases,
        totalEquation: `${part1FeatureCaseCount} + ${part2FeatureCaseCount} = ${totalUploadedTestcases}`,
        part1Source: {
            suiteTimestamp: part1Meta?.timestamp ?? null,
            runIdentity: part1RunIdentity,
        },
        part2Source: {
            suiteTimestamp: part2Meta?.timestamp ?? null,
            replacedStaleCombinedSuite: Boolean(part2ProvenanceReplaced),
            runIdentity: part2RunIdentity,
        },
        part1FeatureCases: (part1Coverage?.cases ?? []).map((c) => ({
            automationKey: c.automationKey,
            status: c.status,
            outcomeDetail: c.outcomeDetail,
            hasVerificationDetails: Boolean(c.verificationDetails),
        })),
        part2FeatureCases: (part2Coverage?.cases ?? []).map((c) => ({
            automationKey: c.automationKey,
            status: c.status,
            outcomeDetail: c.outcomeDetail,
            hasVerificationDetails: Boolean(c.verificationDetails),
        })),
        featureCases: [...(part1Coverage?.cases ?? []), ...(part2Coverage?.cases ?? [])].map((c) => ({
            automationKey: c.automationKey,
            status: c.status,
            outcomeDetail: c.outcomeDetail,
            hasVerificationDetails: Boolean(c.verificationDetails),
        })),
        artifacts: part2Manifest.map((a) => ({
            relativePath: a.relativePath,
            included: a.included,
            reason: a.reason,
            delivery: a.delivery ?? (a.included ? 'junit-attachment-line' : 'not-submitted'),
        })),
        manualAttachmentGap:
            'Testmo CLI ingests [[ATTACHMENT|repo-relative-path]] lines when files exist; missing or runId-mismatched files stay in sidecar only.',
        note: 'Submit payload contains feature cases only (no fullE2ESmokePart1/fullE2ESmokePart2 aggregates).',
    };
}

export function extractPart2FeatureCases(xml) {
    const cases = [];
    const re = new RegExp(
        `<testcase\\b[^>]*name="([^"]+)"[^>]*classname="${PART2_FEATURE_CLASSNAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
        'g'
    );
    let match;
    while ((match = re.exec(xml)) !== null) {
        cases.push({ name: match[1], classname: PART2_FEATURE_CLASSNAME });
    }
    return cases;
}

export { extractPart1FeatureCases };

export function validateTestmoSubmitXml(xml, { expectedPart1Keys = null, expectedPart2Keys = null } = {}) {
    const aggregateRe =
        /<testcase\b[^>]*name="(fullE2ESmokePart1|fullE2ESmokePart2)"[^>]*classname="[^"]*fullE2ESmokePart[12]\.spec\.ts"/g;
    const aggregates = [...xml.matchAll(aggregateRe)];
    if (aggregates.length > 0) {
        throw new Error('TestMo submit JUnit must not include aggregate fullE2ESmokePart1/Part2 testcases.');
    }

    const part1Features = extractPart1FeatureCases(xml);
    const part2Features = extractPart2FeatureCases(xml);
    if (part1Features.length === 0 && part2Features.length === 0) {
        throw new Error('TestMo submit JUnit missing Part 1/2 feature testcases.');
    }

    const keys = [...part1Features, ...part2Features].map((f) => f.name);
    if (new Set(keys).size !== keys.length) {
        throw new Error('Duplicate feature automation keys in TestMo submit JUnit.');
    }

    const rootMatch = xml.match(/<testsuites\b[^>]*tests="(\d+)"/);
    const rootTests = rootMatch ? Number(rootMatch[1]) : keys.length;
    if (rootTests !== keys.length) {
        throw new Error(
            `Root tests count is ${rootTests}; expected ${keys.length} (Part 1 + Part 2 feature cases).`
        );
    }

    if (expectedPart1Keys) {
        for (const key of expectedPart1Keys) {
            if (!part1Features.some((f) => f.name === key)) {
                throw new Error(`Missing expected Part 1 feature automation key: ${key}`);
            }
        }
    }
    if (expectedPart2Keys) {
        for (const key of expectedPart2Keys) {
            if (!part2Features.some((f) => f.name === key)) {
                throw new Error(`Missing expected Part 2 feature automation key: ${key}`);
            }
        }
    }

    return {
        part1FeatureCount: part1Features.length,
        part2FeatureCount: part2Features.length,
        featureCount: keys.length,
        featureKeys: keys,
        totalUploadedTestcases: part1Features.length + part2Features.length,
    };
}

/** @deprecated Use validateTestmoSubmitXml for results-testmo-submit.xml */
export function validateTestmoEnrichedXml(xml, options = {}) {
    return validateTestmoSubmitXml(xml, options);
}

export function isCombinedResultsEnriched(xml) {
    return false;
}

export function stripPart2FeatureTestcases(suiteInner) {
    return suiteInner;
}

export function writeTestmoSubmitJUnit(combinedXmlPath, options = {}) {
    const xml = fs.readFileSync(combinedXmlPath, 'utf8');
    const built = buildTestmoSubmitJUnit(xml, options);
    const outPath =
        options.outputPath ?? path.join(path.dirname(combinedXmlPath), 'results-testmo-submit.xml');
    if (built.enriched) {
        fs.writeFileSync(outPath, built.xml, 'utf8');
    }
    return { ...built, outputPath: outPath };
}