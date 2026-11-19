import {
    COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_ID,
    COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_NAME,
} from './comparisonReportViewCustomerNavigation';

export type ComparisonReportViewSmokeTarget = {
    customerId: string;
    expectedFirstCustomerId: string;
    expectedFirstCustomerName: string;
};

export function resolveComparisonReportViewSmokeTarget(): ComparisonReportViewSmokeTarget {
    const customerId =
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim() || COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_ID;
    const expectedFirstCustomerId =
        process.env.COMPARISON_REPORT_VIEW_FIRST_CUSTOMER_ID?.trim() || COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_ID;
    const expectedFirstCustomerName =
        process.env.COMPARISON_REPORT_VIEW_FIRST_CUSTOMER_NAME?.trim() ||
        COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_NAME;

    return {
        customerId,
        expectedFirstCustomerId,
        expectedFirstCustomerName,
    };
}