import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPart2CoverageFromSystemOut } from './part2TestmoCoverageFromEvents.mjs';
import {
    assertPart2RunFingerprintsCompatible,
    mergePart2ConsoleTexts,
    part2RunFingerprintFromEvents,
    reconstructPart2DerivedFromConsoleText,
} from './reconstructPart2DerivedReporting.mjs';
import {
    FIXTURE_CUSTOMER_ID,
    FIXTURE_PART2_CONSOLE_TAIL,
    FIXTURE_RECORD_ID,
    FIXTURE_RUN_OUTPUT_ROOT,
    SYNTHETIC_PART2_ACCOUNT,
    loadFixtureText,
} from './testFixtures.mjs';

const TAIL = loadFixtureText(FIXTURE_PART2_CONSOLE_TAIL);

const CIRS_SNIPPET = `PART2_LOGIN_VERIFIED {"accountEmail":"${SYNTHETIC_PART2_ACCOUNT}","identityEvidenceStatus":"verified","profileEmailVerified":true,"sessionTakeoverDetected":false,"sessionTakeoverConfirmed":false}
PART2_CIRS_RECORD_NAVIGATION_VERIFIED {"accountEmail":"${SYNTHETIC_PART2_ACCOUNT}","customerId":"${FIXTURE_CUSTOMER_ID}","recordId":"${FIXTURE_RECORD_ID}","createAttempted":true,"createConfirmed":true,"recordIdentitySource":"api_and_route","recordPathname":"/customers/${FIXTURE_CUSTOMER_ID}/interaction-records/${FIXTURE_RECORD_ID}"}`;

test('mergePart2ConsoleTexts unions fragments with matching run identity', () => {
    const merged = mergePart2ConsoleTexts([CIRS_SNIPPET, TAIL]);
    assert.match(merged, /PART2_LOGIN_VERIFIED/);
    assert.match(merged, /PART2_ANALYSIS_REPORT_VERIFIED/);
    assert.match(merged, /PART2_RUN_COMPLETED/);
    assert.ok(!merged.includes('PART2_RUN_COMPLETED') || merged.split('PART2_RUN_COMPLETED').length === 2);
    const coverage = buildPart2CoverageFromSystemOut(merged, { markDerived: true });
    const nav = coverage.cases.find((c) => c.key === 'cirsRecordNavigation');
    assert.equal(nav?.status, 'Passed');
    assert.equal(nav?.verificationDetails?.customerId, FIXTURE_CUSTOMER_ID);
});

test('mergePart2ConsoleTexts rejects mismatched accountEmail', () => {
    const otherRun = TAIL.replaceAll(SYNTHETIC_PART2_ACCOUNT, 'other@example.com');
    assert.throws(() => mergePart2ConsoleTexts([CIRS_SNIPPET, otherRun]), /accountEmail mismatch/);
});

test('mergePart2ConsoleTexts rejects conflicting duplicate events', () => {
    const conflictingLogout = TAIL.replace(
        '"finalPathname":"/login"',
        '"finalPathname":"/customers"'
    );
    assert.throws(
        () => mergePart2ConsoleTexts([conflictingLogout, TAIL]),
        /Conflicting PART2_LOGOUT_VERIFIED/
    );
});

test('part2RunFingerprintFromEvents reads fixture tail anchor', () => {
    const events = mergePart2ConsoleTexts([TAIL]);
    const fp = part2RunFingerprintFromEvents(
        Object.fromEntries(
            events
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const space = line.indexOf(' ');
                    const event = line.slice(0, space);
                    const json = line.slice(space + 1);
                    if (!json.startsWith('{')) {
                        return null;
                    }
                    return [event, JSON.parse(json)];
                })
                .filter(Boolean)
        )
    );
    assert.equal(fp?.accountEmail, SYNTHETIC_PART2_ACCOUNT);
    assert.match(fp?.runOutputRoot ?? '', new RegExp(FIXTURE_RUN_OUTPUT_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('reconstructPart2DerivedFromConsoleText regenerates derived JUnit from tail', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derived-fixture-'));
    try {
        const result = reconstructPart2DerivedFromConsoleText(TAIL, { outDir: tmp });
        assert.ok(fs.existsSync(result.derivedPart2Path));
        const xml = fs.readFileSync(result.derivedPart2Path, 'utf8');
        assert.match(xml, /timestamp="2026-11-13T15:51:02.037Z"/);
        assert.match(xml, /time="0"/);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('assertPart2RunFingerprintsCompatible allows partial vs full fingerprints', () => {
    const anchor = {
        accountEmail: 'a@b.com',
        runOutputRoot: 'test-output/run-a',
        sourceCustomerId: 'c1',
        sourceAnalysisId: 'r1',
        featureOutcomes: null,
    };
    const other = { ...anchor, featureOutcomes: { login: 'passed' } };
    assertPart2RunFingerprintsCompatible(anchor, other);
});