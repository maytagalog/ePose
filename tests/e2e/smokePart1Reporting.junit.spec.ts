import { test } from '@playwright/test';
import { logPart1RunCompleted, logPart1RunStarted } from './shared/smokePart1Reporting';

/** Synthetic Part 1 reporting lines for local JUnit <system-out> verification only. */
test('synthetic Part 1 run started and completed for JUnit system-out', () => {
    logPart1RunStarted('synthetic-allocated@example.com');
    logPart1RunCompleted({
        registrationEmail: 'synthetic-allocated@example.com',
        finalAccountEmail: 'synthetic-changed@example.com',
        accountWithdrawn: true,
        finalPageUrl: 'https://app-stg.epose.com/login',
    });
});
