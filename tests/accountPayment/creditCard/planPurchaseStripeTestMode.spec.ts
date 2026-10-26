import { test, expect } from '@playwright/test';
import {
    PlanPurchaseFlowError,
    buildStripeElementsSessionsRequestUrl,
    isStripeElementsSessionsUrl,
    parsePublishableKeyFromElementsSessionsUrl,
    recordStripePublishableKeyEvidence,
    resetStripeTestModeObservationForTests,
} from './planPurchaseFlow';

test.beforeEach(() => {
    resetStripeTestModeObservationForTests();
});

function mockObservationState() {
    return {
        started: true,
        verified: null as boolean | null,
        waiters: [] as Array<{ resolve: () => void; reject: (err: Error) => void }>,
        onResponse: () => {},
    };
}

test('parsePublishableKeyFromElementsSessionsUrl: reads key query param on elements/sessions', () => {
    const url = buildStripeElementsSessionsRequestUrl('pk_test_fixture_key');
    expect(isStripeElementsSessionsUrl(url)).toBe(true);
    expect(parsePublishableKeyFromElementsSessionsUrl(url)).toBe('pk_test_fixture_key');
});

test('parsePublishableKeyFromElementsSessionsUrl: rejects missing or malformed key', () => {
    const missing = new URL(`https://api.stripe.com/v1/elements/sessions`);
    missing.searchParams.set('type', 'setup_intent');
    expect(parsePublishableKeyFromElementsSessionsUrl(missing.toString())).toBeNull();

    const wrongHost = buildStripeElementsSessionsRequestUrl('pk_test_x').replace(
        'api.stripe.com',
        'other.stripe.com'
    );
    expect(parsePublishableKeyFromElementsSessionsUrl(wrongHost)).toBeNull();

    const notPk = new URL(`https://api.stripe.com/v1/elements/sessions`);
    notPk.searchParams.set('key', 'sk_test_secret');
    expect(parsePublishableKeyFromElementsSessionsUrl(notPk.toString())).toBeNull();
});

test('recordStripePublishableKeyEvidence: pk_test_ verifies and pk_live_ rejects', () => {
    const testState = mockObservationState();
    recordStripePublishableKeyEvidence(testState, 'pk_test_abc');
    expect(testState.verified).toBe(true);

    const liveState = mockObservationState();
    recordStripePublishableKeyEvidence(liveState, 'pk_live_abc');
    expect(liveState.verified).toBe(false);
});

test('recordStripePublishableKeyEvidence: live evidence is not overwritten by later pk_test_', () => {
    const state = mockObservationState();
    recordStripePublishableKeyEvidence(state, 'pk_live_abc');
    recordStripePublishableKeyEvidence(state, 'pk_test_abc');
    expect(state.verified).toBe(false);
});

test('recordStripePublishableKeyEvidence: malformed key leaves verification unset', () => {
    const state = mockObservationState();
    recordStripePublishableKeyEvidence(state, null);
    recordStripePublishableKeyEvidence(state, undefined);
    expect(state.verified).toBeNull();
});
