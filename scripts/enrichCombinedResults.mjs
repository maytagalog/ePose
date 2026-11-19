#!/usr/bin/env node
/**
 * Build results-testmo-submit.xml from combined aggregate results.xml (does not modify aggregates on disk).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestmoSubmitJUnit, validateTestmoSubmitXml } from './buildTestmoSubmitJUnit.mjs';
import { pickPart2JUnitSourcePath } from './part2SubmitProvenance.mjs';
import {
    DEFAULT_RESULTS_FILE,
    formatManilaTimestamp,
    validateAggregateCombinedSmokeXml,
} from './submitSmokeResults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export function enrichCombinedResultsFile(options = {}) {
    const resultsPath = path.resolve(options.resultsPath ?? DEFAULT_RESULTS_FILE);
    if (!fs.existsSync(resultsPath)) {
        throw new Error(`Missing ${resultsPath}`);
    }
    const baseXml = fs.readFileSync(resultsPath, 'utf8');
    validateAggregateCombinedSmokeXml(baseXml);

    const resultsDir = path.dirname(resultsPath);
    const part2SourcePath =
        options.part2SourcePath ??
        pickPart2JUnitSourcePath({ repoRoot: REPO_ROOT, resultsDir, combinedXml: baseXml }) ??
        path.join(REPO_ROOT, 'results-part2-derived.xml');
    const built = buildTestmoSubmitJUnit(baseXml, {
        repoRoot: REPO_ROOT,
        resultsDir,
        part2SourcePath,
    });
    if (!built.enriched) {
        throw new Error('Unable to enrich combined results: no Part 1/2 feature coverage reconstructable.');
    }

    const submitPath =
        options.submitPath ?? path.join(path.dirname(resultsPath), 'results-testmo-submit.xml');
    fs.writeFileSync(submitPath, built.xml, 'utf8');
    const validation = validateTestmoSubmitXml(built.xml);

    return {
        resultsPath,
        submitPath,
        validation,
        preview: built.preview,
        replacedFeatureCount: built.replacedFeatureCount ?? 0,
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = enrichCombinedResultsFile({
            part2SourcePath:
                process.env.SMOKE_PART2_JUNIT_SOURCE ??
                path.join(REPO_ROOT, 'results-part2-derived.xml'),
        });
        console.log(
            JSON.stringify(
                {
                    resultsPath: result.resultsPath,
                    submitPath: result.submitPath,
                    featureCount: result.validation.featureCount,
                    totalUploadedTestcases: result.validation.totalUploadedTestcases,
                    preview: result.preview,
                    replacedFeatureCount: result.replacedFeatureCount,
                },
                null,
                2
            )
        );
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}