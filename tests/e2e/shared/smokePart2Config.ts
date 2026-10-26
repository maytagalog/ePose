/**
 * Dedicated full E2E smoke Part 2 existing account (separate from Part 1 email allocation).
 * Never log or attach password values.
 *
 * Analysis Report Gmail recipient will be configured separately.
 *
 */
export const SMOKE_PART2_ACCOUNT_EMAIL =
    process.env.EPOSE_SMOKE_PART2_EMAIL ?? '';

export const SMOKE_PART2_ACCOUNT_PASSWORD =
    process.env.EPOSE_SMOKE_PART2_PASSWORD ?? '';

export const SMOKE_PART2_UNCONFIGURED_EMAIL_MARKER = 'UNCONFIGURED_PART2';

/** Bounded wait for optional hourly automatic Limit Dialog after login (ms). */
export const SMOKE_PART2_LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS = 8000;

/** Staging screenshot 2026-10-25: visible copy inside role=dialog (aria-modal=true). */
export const SMOKE_PART2_LIMIT_DIALOG_IDENTIFYING_TEXT =
    '2週間のトライアルは終了いたしました。';

/** Current plan row inside the trial-ended Limit Dialog on staging (フリープラン account). */
export const SMOKE_PART2_LIMIT_DIALOG_CURRENT_PLAN_TEXT = 'フリープラン';

export type SmokePart2AccountCredentials = {
    email: string;
    password: string;
};

export class SmokePart2ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SmokePart2ConfigError';
    }
}

/** Validates explicit Part 2 credentials before any browser actions. */
export function validateSmokePart2AccountFields(
    email: string,
    password: string
): void {
    const trimmedEmail = email.trim();
    if (
        !trimmedEmail ||
        trimmedEmail.includes(SMOKE_PART2_UNCONFIGURED_EMAIL_MARKER)
    ) {
        throw new SmokePart2ConfigError(
            'Part 2 existing account email is not configured in tests/e2e/shared/smokePart2Config.ts.'
        );
    }
    if (!trimmedEmail.includes('@')) {
        throw new SmokePart2ConfigError(
            'Part 2 existing account email must look like a valid email address.'
        );
    }
    if (
        !password ||
        password.trim() === '' ||
        password.startsWith('UNCONFIGURED')
    ) {
        throw new SmokePart2ConfigError(
            'Part 2 existing account password is not configured in tests/e2e/shared/smokePart2Config.ts.'
        );
    }
}

export function resolveSmokePart2Account(): SmokePart2AccountCredentials {
    validateSmokePart2AccountFields(
        SMOKE_PART2_ACCOUNT_EMAIL,
        SMOKE_PART2_ACCOUNT_PASSWORD
    );
    return {
        email: SMOKE_PART2_ACCOUNT_EMAIL.trim(),
        password: SMOKE_PART2_ACCOUNT_PASSWORD,
    };
}
