#!/usr/bin/env node
/**
 * Combine separate Part 1 (results-part1.xml) and Part 2 (results-part2.xml)
 * into results.xml. Input part files are never modified.
 *
 * Optional: --with-share-email merges results-analysisReportShareEmail.xml as a third suite.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    detectSmokeBrowserTags,
    EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST,
    EXPECTED_SMOKE_TESTS,
    extractTestCases,
    formatManilaTimestamp,
    resolveExpectedSmokeTests,
    validateAnalysisReportShareEmailSmokeJUnitSource,
    validateSmokeResultsXml,
} from './submitSmokeResults.mjs';
import { writePart2TestmoSidecar } from './part2TestmoReporting.mjs';
import { loadResultsRootState, saveResultsRootState, sha256Hex } from './resultsRootState.mjs';
import { readSuiteBlockMeta } from './smokeJUnitExtract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RESULTS_ROOT = process.env.SMOKE_RESULTS_ROOT
    ? path.resolve(process.env.SMOKE_RESULTS_ROOT)
    : REPO_ROOT;

const PART1_SOURCE = path.join(RESULTS_ROOT, 'results-part1.xml');
const PART2_SOURCE = path.join(RESULTS_ROOT, 'results-part2.xml');
const SHARE_EMAIL_SOURCE = path.join(RESULTS_ROOT, 'results-analysisReportShareEmail.xml');
const OUTPUT = path.join(RESULTS_ROOT, 'results.xml');
const BACKUP_DIR = path.join(RESULTS_ROOT, 'results-backups');
const PROVENANCE = path.join(RESULTS_ROOT, 'results-combined-provenance.json');

function buildCombinePython({ withShareEmail }) {
    const shareBlock = withShareEmail
        ? `
part3_path = f"{repo}/results-analysisReportShareEmail.xml"
part3_root = load_root(part3_path)
part3_suite = find_smoke_suite(part3_root, "analysisReport/sharing/email/analysisReportShareEmail.spec.ts")
part3_tc = assert_testcase(
    part3_suite,
    "analysisReportShareEmailStandalone",
    "analysisReport/sharing/email/analysisReportShareEmail.spec.ts",
)
host3 = part3_suite.get("hostname") or ""
if not host3:
    raise SystemExit("Share-email testsuite must include hostname (browser project)")
if host1 != host3 or host2 != host3:
    raise SystemExit(
        f"Inconsistent browser hostname: part1={host1!r} part2={host2!r} shareEmail={host3!r}"
    )
suites.append(deepcopy(part3_suite))
meta["part3"] = {
    "sourceFile": "results-analysisReportShareEmail.xml",
    "suiteTimestamp": part3_suite.get("timestamp"),
    "hostname": host3,
    "testcaseTime": part3_tc.get("time"),
    "suiteFailures": int(part3_suite.get("failures") or "0"),
    "suiteErrors": int(part3_suite.get("errors") or "0"),
    "suiteSkipped": int(part3_suite.get("skipped") or "0"),
}
`
        : '';

    const testCount = withShareEmail ? '3' : '2';
    const combinedName = withShareEmail
        ? 'Combined staging smoke (Part 1, Part 2, and Analysis Report share email)'
        : 'Combined staging smoke (separate Part 1 and Part 2 executions)';

    return `
import json
import sys
import xml.etree.ElementTree as ET
from copy import deepcopy

repo = sys.argv[1]
part1_path = f"{repo}/results-part1.xml"
part2_path = f"{repo}/results-part2.xml"
out_path = f"{repo}/results.xml"

def load_root(path):
    tree = ET.parse(path)
    return tree.getroot()

def find_smoke_suite(root, classname_suffix):
    matches = []
    for suite in root.findall("testsuite"):
        name = suite.get("name") or ""
        if name == classname_suffix or name.endswith(classname_suffix):
            matches.append(suite)
    if len(matches) != 1:
        raise SystemExit(
            f"Expected exactly one testsuite for {classname_suffix}, found {len(matches)}"
        )
    return matches[0]

def assert_testcase(suite, expected_name, expected_classname):
    cases = suite.findall("testcase")
    if len(cases) != 1:
        raise SystemExit(
            f"Expected one testcase in {expected_classname}, found {len(cases)}"
        )
    tc = cases[0]
    if tc.get("name") != expected_name or tc.get("classname") != expected_classname:
        raise SystemExit(
            f"Unexpected testcase name={tc.get('name')!r} classname={tc.get('classname')!r}; "
            f"expected {expected_name!r} / {expected_classname!r}"
        )
    return tc

part1_root = load_root(part1_path)
part2_root = load_root(part2_path)

part1_suite = find_smoke_suite(part1_root, "e2e/fullE2ESmokePart1.spec.ts")
part2_suite = find_smoke_suite(part2_root, "e2e/fullE2ESmokePart2.spec.ts")

part1_tc = assert_testcase(part1_suite, "fullE2ESmokePart1", "e2e/fullE2ESmokePart1.spec.ts")
part2_tc = assert_testcase(part2_suite, "fullE2ESmokePart2", "e2e/fullE2ESmokePart2.spec.ts")

host1 = part1_suite.get("hostname") or ""
host2 = part2_suite.get("hostname") or ""
if not host1 or not host2:
    raise SystemExit("Both smoke testsuites must include hostname (browser project)")
if host1 != host2:
    raise SystemExit(f"Inconsistent browser hostname: part1={host1!r} part2={host2!r}")

suites = [deepcopy(part1_suite), deepcopy(part2_suite)]
meta = {
    "part1": {
        "sourceFile": "results-part1.xml",
        "suiteTimestamp": part1_suite.get("timestamp"),
        "hostname": host1,
        "testcaseTime": part1_tc.get("time"),
        "suiteFailures": int(part1_suite.get("failures") or "0"),
        "suiteErrors": int(part1_suite.get("errors") or "0"),
        "suiteSkipped": int(part1_suite.get("skipped") or "0"),
    },
    "part2": {
        "sourceFile": "results-part2.xml",
        "suiteTimestamp": part2_suite.get("timestamp"),
        "hostname": host2,
        "testcaseTime": part2_tc.get("time"),
        "suiteFailures": int(part2_suite.get("failures") or "0"),
        "suiteErrors": int(part2_suite.get("errors") or "0"),
        "suiteSkipped": int(part2_suite.get("skipped") or "0"),
    },
}
${shareBlock}
total_time = sum(float(s.get("time") or "0") for s in suites)
total_failures = sum(int(s.get("failures") or "0") for s in suites)
total_errors = sum(int(s.get("errors") or "0") for s in suites)
total_skipped = sum(int(s.get("skipped") or "0") for s in suites)

combined = ET.Element("testsuites")
combined.set("id", "")
combined.set("name", ${JSON.stringify(combinedName)})
combined.set("tests", "${testCount}")
combined.set("failures", str(total_failures))
combined.set("skipped", str(total_skipped))
combined.set("errors", str(total_errors))
combined.set("time", str(total_time))

for s in suites:
    combined.append(s)

tree = ET.ElementTree(combined)
ET.indent(tree, space="", level=0)
tree.write(out_path, encoding="unicode", xml_declaration=False)

meta["aggregateTime"] = total_time
meta["aggregateFailures"] = total_failures
meta["aggregateErrors"] = total_errors
meta["aggregateSkipped"] = total_skipped
print(json.dumps(meta))
`.trim();
}

function sha256File(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

function readSuiteSummary(xmlPath, suitePattern, testcaseNamePattern) {
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const rootMatch = xml.match(/<testsuites\b[^>]*>/);
    const suiteRe = new RegExp(
        `<testsuite\\b[^>]*name="[^"]*${suitePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>`
    );
    const suiteMatch = xml.match(suiteRe);
    const root = rootMatch?.[0] ?? '';
    const suite = suiteMatch?.[0] ?? '';
    const pick = (tag, attr) => {
        const m = tag.match(new RegExp(`${attr}="([^"]*)"`));
        return m?.[1] ?? null;
    };
    const stat = fs.statSync(xmlPath);
    const testcaseRe = new RegExp(
        `<testcase\\b[^>]*name="${testcaseNamePattern}"[^>]*time="([^"]*)"`
    );
    const tc = xml.match(testcaseRe);
    return {
        path: xmlPath,
        fileModifiedIso: stat.mtime.toISOString(),
        fileModifiedMs: stat.mtimeMs,
        testsuiteTimestamp: pick(suite, 'timestamp'),
        hostname: pick(suite, 'hostname'),
        testcaseTime: tc?.[1] ?? null,
        rootTests: pick(root, 'tests'),
        failures: pick(root, 'failures'),
        errors: pick(root, 'errors'),
        skipped: pick(root, 'skipped'),
        sha256: sha256File(xmlPath),
    };
}

function backupCombinedOutputIfPresent(now) {
    if (!fs.existsSync(OUTPUT)) {
        return null;
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = formatManilaTimestamp(now);
    let dest = path.join(BACKUP_DIR, `results-pre-combine-${stamp}.xml`);
    if (fs.existsSync(dest)) {
        dest = path.join(BACKUP_DIR, `results-pre-combine-${stamp}-${now.getTime()}.xml`);
    }
    fs.copyFileSync(OUTPUT, dest);
    return dest;
}

function extractTestcaseDurations(xml) {
    const durations = [];
    const re = /<testcase\b[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*time="([^"]*)"/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        durations.push({ name: m[1], classname: m[2], timeSeconds: Number(m[3]) });
    }
    return durations;
}

function printSourceTimestamps(entries) {
    console.log('');
    console.log('=== Smoke JUnit sources (confirm these match your intended runs) ===');
    for (const { label, summary, filePath } of entries) {
        console.log(`${label}: ${filePath}`);
        console.log(`  file modified (mtime): ${summary.fileModifiedIso}`);
        console.log(`  file SHA-256:          ${summary.sha256}`);
        console.log(`  testsuite timestamp:   ${summary.testsuiteTimestamp ?? '(missing)'}`);
        console.log(`  testcase duration:     ${summary.testcaseTime ?? '(missing)'} s`);
        console.log(`  browser (hostname):    ${summary.hostname ?? '(missing)'}`);
        console.log(
            `  counts failures/errors/skipped: ${summary.failures}/${summary.errors}/${summary.skipped}`
        );
    }
    console.log('==================================================================');
    console.log('');
}

function loadProvenance(provenancePath = PROVENANCE) {
    if (!fs.existsSync(provenancePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    } catch {
        return null;
    }
}

function assertShareEmailNotStale(part1Summary, part2Summary, shareSummary) {
    const latestPartMs = Math.max(part1Summary.fileModifiedMs, part2Summary.fileModifiedMs);
    if (shareSummary.fileModifiedMs + 1000 < latestPartMs) {
        throw new Error(
            `Stale share-email JUnit (${SHARE_EMAIL_SOURCE}): file mtime ${shareSummary.fileModifiedIso} is older than the latest Part 1/2 source (${new Date(latestPartMs).toISOString()}). Re-run the standalone share-email test before combining.`
        );
    }
}

function isCombineAlreadyUpToDate(inputSha256, withShareEmail, provenancePath) {
    const prior = loadProvenance(provenancePath);
    if (!prior?.combineInputSha256 || prior.combineInputSha256 !== inputSha256) {
        return false;
    }
    if (Boolean(prior.withShareEmail) !== withShareEmail) {
        return false;
    }
    if (!fs.existsSync(path.join(path.dirname(provenancePath), 'results.xml'))) {
        return false;
    }
    return true;
}

function backupCombinedOutputIfPresentAt(outputPath, backupDir, now) {
    if (!fs.existsSync(outputPath)) {
        return null;
    }
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = formatManilaTimestamp(now);
    let dest = path.join(backupDir, `results-pre-combine-${stamp}.xml`);
    if (fs.existsSync(dest)) {
        dest = path.join(backupDir, `results-pre-combine-${stamp}-${now.getTime()}.xml`);
    }
    fs.copyFileSync(outputPath, dest);
    return dest;
}

function printPartRunStatuses(part1Xml, part2Xml, part1Summary, part2Summary) {
    const part1Meta = readSuiteBlockMeta(
        part1Xml.match(/<testsuite[\s\S]*?<\/testsuite>/)?.[0] ?? part1Xml
    );
    const part2Meta = readSuiteBlockMeta(
        part2Xml.match(/<testsuite[\s\S]*?<\/testsuite>/)?.[0] ?? part2Xml
    );
    console.log('');
    console.log('=== Combined source runs (recombined executions) ===');
    console.log(
        `Part 1: suiteTimestamp=${part1Meta.suiteTimestamp ?? part1Summary.testsuiteTimestamp} status=${part1Meta.status} testcaseTime=${part1Meta.testcaseTime ?? part1Summary.testcaseTime}s`
    );
    console.log(
        `Part 2: suiteTimestamp=${part2Meta.suiteTimestamp ?? part2Summary.testsuiteTimestamp} status=${part2Meta.status} testcaseTime=${part2Meta.testcaseTime ?? part2Summary.testcaseTime}s`
    );
    console.log('====================================================');
    console.log('');
}

function parseArgs(argv) {
    return {
        withShareEmail: argv.includes('--with-share-email'),
    };
}

export function combineSmokeResults(options = {}) {
    const withShareEmail = Boolean(options.withShareEmail);
    const now = options.now ?? new Date();
    const resultsRoot = options.resultsRoot ? path.resolve(options.resultsRoot) : RESULTS_ROOT;
    const part1Source = path.join(resultsRoot, 'results-part1.xml');
    const part2Source = path.join(resultsRoot, 'results-part2.xml');
    const shareEmailSource = path.join(resultsRoot, 'results-analysisReportShareEmail.xml');
    const output = path.join(resultsRoot, 'results.xml');
    const backupDir = options.backupDir ?? path.join(resultsRoot, 'results-backups');
    const provenancePath = path.join(resultsRoot, 'results-combined-provenance.json');

    if (!fs.existsSync(part1Source)) {
        throw new Error(`Missing ${part1Source}. Run Part 1 smoke or publish first.`);
    }
    if (!fs.existsSync(part2Source)) {
        throw new Error(`Missing ${part2Source}. Run Part 2 smoke or publish first.`);
    }
    if (withShareEmail && !fs.existsSync(shareEmailSource)) {
        throw new Error(
            `Missing ${shareEmailSource}. Run Analysis Report share email with npm run pw:ar:share-email first.`
        );
    }

    const part1Summary = readSuiteSummary(part1Source, 'fullE2ESmokePart1.spec.ts', 'fullE2ESmokePart1');
    const part2Summary = readSuiteSummary(part2Source, 'fullE2ESmokePart2.spec.ts', 'fullE2ESmokePart2');
    const part1Xml = fs.readFileSync(part1Source, 'utf8');
    const part2Xml = fs.readFileSync(part2Source, 'utf8');

    let part2TestmoSidecar = null;
    try {
        const { outPath, sidecar } = writePart2TestmoSidecar(part2Source, { repoRoot: resultsRoot });
        part2TestmoSidecar = { outPath, hasCoverage: Boolean(sidecar.coverage) };
    } catch (error) {
        part2TestmoSidecar = {
            error: error instanceof Error ? error.message : String(error),
        };
    }

    const entries = [
        { label: 'Part 1', summary: part1Summary, filePath: part1Source },
        { label: 'Part 2', summary: part2Summary, filePath: part2Source },
    ];

    let shareSummary = null;
    if (withShareEmail) {
        shareSummary = readSuiteSummary(
            shareEmailSource,
            'analysisReportShareEmail.spec.ts',
            'analysisReportShareEmailStandalone'
        );
        entries.push({ label: 'Share email', summary: shareSummary, filePath: shareEmailSource });
        assertShareEmailNotStale(part1Summary, part2Summary, shareSummary);

        const shareXml = fs.readFileSync(shareEmailSource, 'utf8');
        const shareCases = extractTestCases(shareXml);
        const unexpected = shareCases.filter(
            (testCase) =>
                !(
                    testCase.name === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name &&
                    testCase.classname === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.classname
                )
        );
        if (unexpected.length > 0) {
            throw new Error(
                `Share-email JUnit must contain only testcase ${EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name}; found extra: ${unexpected.map((c) => c.name).join(', ')}`
            );
        }
        validateAnalysisReportShareEmailSmokeJUnitSource(shareXml);
    }

    printSourceTimestamps(entries);

    const inputSha256 = crypto
        .createHash('sha256')
        .update(
            [part1Summary.sha256, part2Summary.sha256, withShareEmail ? shareSummary.sha256 : ''].join(':')
        )
        .digest('hex');

    if (isCombineAlreadyUpToDate(inputSha256, withShareEmail, provenancePath)) {
        printPartRunStatuses(part1Xml, part2Xml, part1Summary, part2Summary);
        const combinedXml = fs.readFileSync(output, 'utf8');
        const { counts } = validateSmokeResultsXml(combinedXml);
        return {
            alreadyUpToDate: true,
            provenancePath,
            output,
            inputSha256,
            counts,
        };
    }

    const backupOutput = backupCombinedOutputIfPresentAt(output, backupDir, now);

    const pyPath = path.join(resultsRoot, '.combine-smoke-results.py');
    fs.writeFileSync(pyPath, buildCombinePython({ withShareEmail }), 'utf8');
    const run = spawnSync('python3', [pyPath, resultsRoot], {
        encoding: 'utf8',
        cwd: resultsRoot,
    });
    fs.unlinkSync(pyPath);

    if (run.status !== 0) {
        throw new Error(run.stderr || run.stdout || 'combine failed');
    }

    const meta = JSON.parse(run.stdout.trim());
    const combinedXml = fs.readFileSync(output, 'utf8');
    const { counts, cases } = validateSmokeResultsXml(combinedXml);
    const browserTags = detectSmokeBrowserTags(combinedXml);
    const expectedTests = resolveExpectedSmokeTests(combinedXml);

    for (const expected of expectedTests) {
        const match = cases.find(
            (c) => c.name === expected.name && c.classname === expected.classname
        );
        if (!match) {
            throw new Error(`Combined XML missing expected testcase ${expected.name}`);
        }
    }

    printPartRunStatuses(part1Xml, part2Xml, part1Summary, part2Summary);

    const note = withShareEmail
        ? 'JUnit combines separate executions from results-part1.xml, results-part2.xml, and results-analysisReportShareEmail.xml (inputs preserved).'
        : 'JUnit combines separate executions from results-part1.xml and results-part2.xml (inputs preserved).';

    const provenance = {
        combinedAt: now.toISOString(),
        executionMode: 'sequential',
        publicationKind: 'sequential_combine',
        aggregateReady: true,
        recombinationRequired: false,
        withShareEmail,
        combineInputSha256: inputSha256,
        note,
        inputsPreserved: {
            resultsPart1: part1Source,
            resultsPart2: part2Source,
            ...(withShareEmail ? { resultsAnalysisReportShareEmail: shareEmailSource } : {}),
        },
        priorResultsBackup: backupOutput,
        sources: {
            part1: 'results-part1.xml',
            part2: 'results-part2.xml',
            ...(withShareEmail ? { shareEmail: 'results-analysisReportShareEmail.xml' } : {}),
        },
        sourceFileStats: {
            part1: part1Summary,
            part2: part2Summary,
            ...(withShareEmail ? { shareEmail: shareSummary } : {}),
        },
        ...meta,
        validatedCounts: counts,
        validatedTestcases: cases,
        browserTags,
        part2TestmoSidecar,
    };
    fs.writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

    saveResultsRootState(
        {
            schemaVersion: 1,
            updatedAt: now.toISOString(),
            aggregateReady: true,
            recombinationRequired: false,
            executionMode: 'sequential',
            publicationKind: 'sequential_combine',
            combineInputSha256: inputSha256,
            files: {
                'results.xml': { sha256: sha256Hex(combinedXml) },
                'results-part1.xml': { sha256: part1Summary.sha256 },
                'results-part2.xml': { sha256: part2Summary.sha256 },
            },
        },
        resultsRoot,
        backupDir
    );

    const durations = extractTestcaseDurations(combinedXml);
    const summary = {
        provenancePath,
        withShareEmail,
        counts,
        durations,
        browserTags,
        alreadyUpToDate: false,
    };
    return { ...summary, output, inputSha256, provenance };
}

function main() {
    const { withShareEmail } = parseArgs(process.argv);
    try {
        const result = combineSmokeResults({ withShareEmail });
        if (result.alreadyUpToDate) {
            console.log('Combine already up to date for current Part 1/Part 2 inputs.');
        }
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
