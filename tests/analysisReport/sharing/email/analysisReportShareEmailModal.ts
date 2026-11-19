import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_DIALOG_TITLE,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../../analysisReportTestIds';

const ACTION_TIMEOUT_MS = 15000;

/** Staging share-email dialog: one block with label, line breaks, then address (no separate email node). */
export const ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL = 'メールアドレス';

export function normalizeShareEmailRecipientBlockText(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
}

/**
 * After whitespace normalization, the block must start with the label;
 * the remainder must be a single token equal to the recipient address.
 */
export function parseRecipientEmailFromLabelBlock(
    normalizedBlock: string,
    label: string = ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL
): string | null {
    if (!normalizedBlock.startsWith(label)) {
        return null;
    }
    const remainder = normalizedBlock.slice(label.length).trim();
    if (!remainder || /\s/.test(remainder)) {
        return null;
    }
    return remainder;
}

async function locateLeafRecipientLabelBlocks(innerDialog: Locator): Promise<Locator[]> {
    const divs = innerDialog.locator('div');
    const count = await divs.count();
    const matching: Locator[] = [];

    for (let i = 0; i < count; i++) {
        const div = divs.nth(i);
        if (!(await div.isVisible())) {
            continue;
        }
        const normalized = normalizeShareEmailRecipientBlockText(await div.innerText());
        if (parseRecipientEmailFromLabelBlock(normalized) === null) {
            continue;
        }

        const directChildDivs = div.locator(':scope > div');
        const childCount = await directChildDivs.count();
        let childAlsoMatches = false;
        for (let j = 0; j < childCount; j++) {
            const child = directChildDivs.nth(j);
            if (!(await child.isVisible())) {
                continue;
            }
            const childNormalized = normalizeShareEmailRecipientBlockText(await child.innerText());
            if (parseRecipientEmailFromLabelBlock(childNormalized) !== null) {
                childAlsoMatches = true;
                break;
            }
        }
        if (!childAlsoMatches) {
            matching.push(div);
        }
    }

    return matching;
}

export function analysisReportShareEmailDialogRoot(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailDialog);
}

export async function expectAnalysisReportShareEmailModalDialog(page: Page): Promise<Locator> {
    const root = analysisReportShareEmailDialogRoot(page);
    const dialogs = root.getByRole('dialog');
    await expect(dialogs).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const inner = dialogs.first();
    await expect(inner).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(root).toHaveAttribute('data-report-view', 'single', { timeout: ACTION_TIMEOUT_MS });
    await expect(
        inner.getByText(ANALYSIS_REPORT_SHARE_EMAIL_DIALOG_TITLE, { exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return inner;
}

export async function assertShareEmailModalDisplaysRecipient(
    innerDialog: Locator,
    recipientEmail: string
): Promise<void> {
    await expect(async () => {
        const blocks = await locateLeafRecipientLabelBlocks(innerDialog);
        expect(blocks.length).toBe(1);
        const normalized = normalizeShareEmailRecipientBlockText(await blocks[0]!.innerText());
        const displayed = parseRecipientEmailFromLabelBlock(normalized);
        expect(displayed).toBe(recipientEmail);
    }).toPass({ timeout: ACTION_TIMEOUT_MS });
}

export function analysisReportShareEmailSubmitButton(innerDialog: Locator): Locator {
    return innerDialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailSubmit);
}
