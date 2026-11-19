import { test, expect } from '@playwright/test';
import {
    DEFAULT_DOMAIN,
    DEFAULT_LOCAL_BASE,
    migrateRegistrationEmailStateIfNeeded,
    previewNextRegistrationAliases,
    readEmailState,
    resolveRegistrationAllocation,
    stateFilePath,
    type EmailState,
} from './emailState';
import {
    buildThreeDotEmail,
    buildThreeDotEmailFromIndex,
    emailWithThreeDotGaps,
    enumerateThreeDotGapTriplets,
    isRegistrationPoolEmailExtended,
    threeDotGapsAtIndex,
    threeDotPoolSize,
} from './emailStateThreeDotPool';
import { isRegistrationPoolEmail } from '../mypage/changeEmail/changeEmailState';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.describe('three-dot registration pool', () => {
    test('ordered triplets are unique and preserve base characters', () => {
        const triplets = enumerateThreeDotGapTriplets(DEFAULT_LOCAL_BASE.length);
        expect(triplets.length).toBe(threeDotPoolSize(DEFAULT_LOCAL_BASE.length));
        const locals = triplets.map((g) => emailWithThreeDotGaps(DEFAULT_LOCAL_BASE, g));
        expect(new Set(locals).size).toBe(locals.length);
        for (const local of locals) {
            expect(local.replace(/\./g, '')).toBe(DEFAULT_LOCAL_BASE);
            expect(local.startsWith('.')).toBe(false);
            expect(local.endsWith('.')).toBe(false);
            expect(local.includes('..')).toBe(false);
            expect((local.match(/\./g) ?? []).length).toBe(3);
        }
        for (let i = 1; i < triplets.length; i++) {
            const a = triplets[i - 1]!;
            const b = triplets[i]!;
            const lex =
                a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
            expect(lex).toBeLessThan(0);
        }
    });

    test('first three-dot alias matches index 0 gaps', () => {
        const gaps = threeDotGapsAtIndex(DEFAULT_LOCAL_BASE.length, 0);
        expect(gaps).toEqual([1, 2, 3]);
        const email = buildThreeDotEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, gaps);
        expect(email).toBe('a.a.r.dvarkomonstrosesquip1230000@gmail.com');
        expect(email).toBe(buildThreeDotEmailFromIndex(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0));
    });

    test('lex order advances k then j then i at [1,2,lastGap] → [1,3,4]', () => {
        const len = DEFAULT_LOCAL_BASE.length;
        const triplets = enumerateThreeDotGapTriplets(len);
        const lastGap = len - 1;
        const atOneTwoLast = triplets.findIndex((t) => t[0] === 1 && t[1] === 2 && t[2] === lastGap);
        expect(atOneTwoLast).toBeGreaterThanOrEqual(0);
        expect(triplets[atOneTwoLast + 1]).toEqual([1, 3, 4]);
        expect(triplets[1]).toEqual([1, 2, 4]);
        expect(triplets[2]).toEqual([1, 2, 5]);
    });

    test('registration pool classifier rejects two-dot and accepts three-dot', () => {
        expect(
            isRegistrationPoolEmail(
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                buildThreeDotEmailFromIndex(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0)
            )
        ).toBe(true);
        expect(
            isRegistrationPoolEmailExtended(
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                'aa.rd.vark@' + DEFAULT_DOMAIN
            )
        ).toBe(false);
    });

    test('preview does not mutate counters on disk', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epose-three-dot-preview-'));
        const statePath = stateFilePath(dir);
        fs.writeFileSync(
            statePath,
            JSON.stringify(
                {
                    schemaVersion: 3,
                    localBase: DEFAULT_LOCAL_BASE,
                    domain: DEFAULT_DOMAIN,
                    nextDotPosition: 30,
                    highWaterMark: 30,
                    allocationPool: 'three_dot',
                    nextThreeDotIndex: 0,
                    threeDotHighWaterMark: 0,
                    pendingVerification: null,
                },
                null,
                2
            )
        );
        const before = fs.readFileSync(statePath, 'utf8');
        const state = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        const preview = previewNextRegistrationAliases(
            state,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            5
        );
        expect(preview).toHaveLength(5);
        expect(preview[0]).toBe(buildThreeDotEmailFromIndex(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0));
        expect(preview[4]).toBe(buildThreeDotEmailFromIndex(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 4));
        expect(fs.readFileSync(statePath, 'utf8')).toBe(before);
        const afterRead = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        expect(afterRead.nextThreeDotIndex).toBe(0);
    });

    test('three-dot exhaustion is explicit (no four-dot fallback)', () => {
        const poolSize = threeDotPoolSize(DEFAULT_LOCAL_BASE.length);
        const state: EmailState = {
            schemaVersion: 3,
            localBase: DEFAULT_LOCAL_BASE,
            domain: DEFAULT_DOMAIN,
            nextDotPosition: 30,
            highWaterMark: 30,
            allocationPool: 'three_dot',
            nextThreeDotIndex: poolSize,
            threeDotHighWaterMark: poolSize,
            pendingVerification: null,
        };
        expect(() =>
            resolveRegistrationAllocation(state, undefined, undefined, DEFAULT_LOCAL_BASE.length)
        ).toThrow(/Four-dot allocation is not enabled/);
    });
});