import { sanitizePageLocation } from './smokePart2Reporting';

export function logPart1SmokeEvent(event: string, payload: Record<string, unknown>): void {
    console.log(event, JSON.stringify(payload));
}

const PART1_ACTIVE_COVERAGE = [
    'Registration',
    'Login',
    'Online Booking and confirmation email',
    'Customer Add/Edit/Delete',
    'My Page Profile (Furigana)',
    'Change Email',
    'Change Password',
    'Company Information',
    'Display Item Settings',
    'Credit-card Plan Purchase and Payment History',
    'Referral Coupon Email',
    'Withdrawal',
] as const;

const PART1_DEFERRED_COVERAGE = ['Posture Analysis', 'Referral Coupon Copy'] as const;

const PART1_DEFERRED_REASONS: Record<string, string> = {
    'Posture Analysis': 'outside Part 1 scope',
    'Referral Coupon Copy': 'pending product issue',
};

/** After allocator selected email; before registration UI navigation. */
export function logPart1RunStarted(accountEmail: string): void {
    logPart1SmokeEvent('PART1_RUN_STARTED', {
        smokePart: 1,
        environment: 'staging',
        accountEmail: accountEmail.trim(),
        accountSource: 'new_registration',
        activeCoverage: [...PART1_ACTIVE_COVERAGE],
        deferredCoverage: [...PART1_DEFERRED_COVERAGE],
        deferredReasons: { ...PART1_DEFERRED_REASONS },
    });
}

export type Part1RunCompletedParams = {
    registrationEmail: string;
    finalAccountEmail: string;
    accountWithdrawn: boolean;
    finalPageUrl?: string;
};

/** After full Part 1 flow succeeds (withdrawal verification included when accountWithdrawn is true). */
export function logPart1RunCompleted(params: Part1RunCompletedParams): void {
    const location = params.finalPageUrl
        ? sanitizePageLocation(params.finalPageUrl)
        : { origin: '', pathname: '' };
    logPart1SmokeEvent('PART1_RUN_COMPLETED', {
        smokePart: 1,
        environment: 'staging',
        registrationEmail: params.registrationEmail.trim(),
        finalAccountEmail: params.finalAccountEmail.trim(),
        accountWithdrawn: params.accountWithdrawn,
        finalOrigin: location.origin || undefined,
        finalPathname: location.pathname || undefined,
    });
}
