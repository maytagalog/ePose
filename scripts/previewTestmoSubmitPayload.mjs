#!/usr/bin/env node
/**
 * Local preview of the JUnit payload sent to Testmo (no CLI, no live submit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildTestmoSubmitJUnit,
    isTestmoSubmitFeatureOnlyXml,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';
import { pickPart2JUnitSourcePath } from './part2SubmitProvenance.mjs';
import { validateAggregateCombinedSmokeXml } from './submitSmokeResults.mjs';
import {
    computeSmokeTimingSummary,
    EXECUTION_MODE_PARALLEL,
    formatTimingPreviewForConsole,
    loadCombinedProvenance,
    resolveSmokeRunMeta,
} from './testmoSmokeRunTiming.mjs';
import { buildParallelSubmissionPlan, writeThreadSubmitArtifacts } from './testmoParallelSubmit.mjs';
import { assertAggregateReadyForSubmit } from './resultsRootState.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export function resolvePart2SourceForPreview({ resultsPath, baseXml, repoRoot = REPO_ROOT }) {
    const resultsDir = path.dirname(resultsPath);
    const featureOnlyInput = isTestmoSubmitFeatureOnlyXml(baseXml);
    return (
        pickPart2JUnitSourcePath({
            repoRoot,
            resultsDir,
            combinedXml: featureOnlyInput ? null : baseXml,
        }) ?? path.join(repoRoot, 'results-part2-derived.xml')
    );
}

export function previewTestmoSubmitPayload(options = {}) {
    const resultsPath = path.resolve(options.resultsPath ?? path.join(REPO_ROOT, 'results.xml'));
    if (!fs.existsSync(resultsPath)) {
        throw new Error(`Missing ${resultsPath}`);
    }
    const resultsRepoRoot = options.repoRoot ?? path.dirname(resultsPath);
    if (!options.skipAggregateReadyCheck) {
        assertAggregateReadyForSubmit(resultsRepoRoot, {
            resultsPath,
            backupDir: options.backupDir ?? path.join(resultsRepoRoot, 'results-backups'),
        });
    }
    const baseXml = fs.readFileSync(resultsPath, 'utf8');
    const featureOnlyInput = isTestmoSubmitFeatureOnlyXml(baseXml);
    const resultsDir = resultsRepoRoot;
    const writeSubmitFile = options.writeSubmitFile !== false;
    let part2SourcePath = resolvePart2SourceForPreview({ resultsPath, baseXml, repoRoot: resultsRepoRoot });
    let built;
    let validation;
    let outPath = path.join(path.dirname(resultsPath), 'results-testmo-submit.xml');

    if (featureOnlyInput) {
        validation = validateTestmoSubmitXml(baseXml);
        built = {
            xml: baseXml,
            enriched: true,
            preview: {
                part1FeatureCaseCount: validation.part1FeatureCount,
                part2FeatureCaseCount: validation.part2FeatureCount,
                totalUploadedTestcases: validation.totalUploadedTestcases,
                totalEquation: `${validation.part1FeatureCount} + ${validation.part2FeatureCount} = ${validation.totalUploadedTestcases}`,
                note: 'Input is already feature-only submit JUnit; not re-validated as aggregate.',
            },
        };
    } else {
        validateAggregateCombinedSmokeXml(baseXml);
        built = buildTestmoSubmitJUnit(baseXml, {
            repoRoot: resultsRepoRoot,
            resultsDir,
            ...(part2SourcePath ? { part2SourcePath } : {}),
        });
        part2SourcePath = built.part2SourcePath ?? part2SourcePath;
        if (writeSubmitFile) {
            fs.writeFileSync(outPath, built.xml, 'utf8');
        }
        validation = validateTestmoSubmitXml(built.xml);
    }

    const submitXml = featureOnlyInput ? baseXml : built.xml;
    const combinedForTiming = featureOnlyInput ? null : baseXml;
    let testmoTiming = null;
    let parallelSubmissionPlan = null;
    if (combinedForTiming && built.enriched) {
        const provenance = loadCombinedProvenance(resultsDir);
        const smokeMeta = resolveSmokeRunMeta({
            resultsPath,
            combinedXml: combinedForTiming,
            repoRoot: resultsRepoRoot,
        });
        const timingSummary = computeSmokeTimingSummary({
            combinedXml: combinedForTiming,
            submitXml,
            provenance,
            smokeMeta,
        });
        testmoTiming = {
            preview: formatTimingPreviewForConsole(timingSummary),
            summary: timingSummary,
        };
        if (timingSummary.executionMode === EXECUTION_MODE_PARALLEL && writeSubmitFile) {
            const threadArtifacts = writeThreadSubmitArtifacts({
                submitXmlPath: outPath,
                timingSummary,
            });
            parallelSubmissionPlan = buildParallelSubmissionPlan({
                runName: 'preview-only',
                tags: ['smoke-automation'],
                artifacts: threadArtifacts,
                timingSummary,
            });
        } else if (timingSummary.executionMode === EXECUTION_MODE_PARALLEL) {
            parallelSubmissionPlan = {
                submissionPlan: 'parallel-threads',
                note: 'Set writeSubmitFile to write thread JUnit splits and resource sidecars.',
            };
        }
    }

  const cliArgsShape =
        testmoTiming?.summary?.executionMode === EXECUTION_MODE_PARALLEL
            ? 'testmo automation:run:create → automation:run:submit-thread (Part 1) → submit-thread (Part 2) → automation:run:complete --no-measure-elapsed'
            : 'testmo automation:run:submit --results <results-testmo-submit.xml>';

    return {
        baseResultsPath: resultsPath,
        part2SourcePath,
        submitResultsPath: outPath,
        enriched: built.enriched,
        validation,
        preview: built.preview,
        derived: Boolean(built.coverage?.derived),
        testmoTiming,
        parallelSubmissionPlan,
        whatTestmoReceives: {
            cliArgsShape,
            totalEquation: built.preview?.totalEquation,
            part1FeatureCaseCount: built.preview?.part1FeatureCaseCount,
            part2FeatureCaseCount: built.preview?.part2FeatureCaseCount,
            totalUploadedTestcases: built.preview?.totalUploadedTestcases,
            part1Source: built.preview?.part1Source,
            part2Source: built.preview?.part2Source,
            part1FeatureCases: built.preview?.part1FeatureCases,
            part2FeatureCases: built.preview?.part2FeatureCases,
            artifacts: built.preview?.artifacts,
            manualAttachmentGap: built.preview?.manualAttachmentGap,
        },
    };
}

function main() {
    const resultsPath = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'results.xml'));
    const payload = previewTestmoSubmitPayload({ resultsPath });
    console.log(JSON.stringify(payload, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.stack ?? error.message);
        } else {
            console.error(String(error));
        }
        process.exit(1);
    }
}