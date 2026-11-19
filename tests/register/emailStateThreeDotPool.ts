export type ThreeDotGaps = readonly [number, number, number];

function localPartWithSingleDotAt(local: string, position: number): string {
    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > local.length - 1
    ) {
        throw new Error(
            `Dot position must be a whole number from 0 to ${local.length - 1}. Got: ${position}`
        );
    }
    if (position === 0) {
        return local;
    }
    return `${local.slice(0, position)}.${local.slice(position)}`;
}

/**
 * Lexicographic gap triplets (i, j, k) with 1 <= i < j < k <= length - 1.
 * Adjacent gaps are allowed (e.g. [1,2,3] → a.a.r…); dots insert at distinct base indices, not consecutive dots in output.
 */
export function enumerateThreeDotGapTriplets(localBaseLength: number): ThreeDotGaps[] {
    const triplets: ThreeDotGaps[] = [];
    const maxGap = localBaseLength - 1;
    for (let p1 = 1; p1 <= maxGap - 2; p1++) {
        for (let p2 = p1 + 1; p2 <= maxGap - 1; p2++) {
            for (let p3 = p2 + 1; p3 <= maxGap; p3++) {
                triplets.push([p1, p2, p3]);
            }
        }
    }
    return triplets;
}

export function threeDotPoolSize(localBaseLength: number): number {
    return enumerateThreeDotGapTriplets(localBaseLength).length;
}

export function threeDotGapsAtIndex(localBaseLength: number, index: number): ThreeDotGaps {
    const triplets = enumerateThreeDotGapTriplets(localBaseLength);
    if (index < 0 || index >= triplets.length) {
        throw new Error(
            `Three-dot index ${index} is out of range (0..${triplets.length > 0 ? triplets.length - 1 : 0}).`
        );
    }
    return triplets[index]!;
}

export function emailWithThreeDotGaps(local: string, gaps: ThreeDotGaps): string {
    const [p1, p2, p3] = gaps;
    if (p1 < 1 || p3 > local.length - 1 || p2 <= p1 || p3 <= p2) {
        throw new Error(`Invalid three-dot gaps (${p1}, ${p2}, ${p3}) for local part length ${local.length}`);
    }
    let result = local;
    for (const position of [p3, p2, p1] as const) {
        result = `${result.slice(0, position)}.${result.slice(position)}`;
    }
    if ((result.match(/\./g) ?? []).length !== 3) {
        throw new Error('Internal error: three-dot local part does not contain exactly three dots');
    }
    if (result.startsWith('.') || result.endsWith('.') || result.includes('..')) {
        throw new Error('Invalid three-dot local part: leading, trailing, or consecutive dots');
    }
    const undotted = result.replace(/\./g, '');
    if (undotted !== local) {
        throw new Error('Three-dot insertion altered base character content');
    }
    return result;
}

export function buildThreeDotEmail(localBase: string, domain: string, gaps: ThreeDotGaps): string {
    return `${emailWithThreeDotGaps(localBase, gaps)}@${domain}`;
}

export function buildThreeDotEmailFromIndex(
    localBase: string,
    domain: string,
    index: number
): string {
    const gaps = threeDotGapsAtIndex(localBase.length, index);
    return buildThreeDotEmail(localBase, domain, gaps);
}

export function assertThreeDotIndexAvailable(
    nextThreeDotIndex: number,
    localBaseLength: number
): void {
    const poolSize = threeDotPoolSize(localBaseLength);
    if (nextThreeDotIndex >= poolSize) {
        throw new Error(
            'All three-dot Gmail variants for this base have already been consumed. ' +
                `nextThreeDotIndex is ${nextThreeDotIndex} (valid indices are 0 to ${poolSize > 0 ? poolSize - 1 : 0}). ` +
                'Four-dot allocation is not enabled; reconcile or choose a new base before running again.'
        );
    }
}

/** True when email is undotted, single-dot pool variant, or three-dot pool variant — never two-dot (change-email). */
export function isRegistrationPoolEmailExtended(
    localBase: string,
    domain: string,
    email: string
): boolean {
    const at = email.lastIndexOf('@');
    if (at < 0) {
        return false;
    }
    const local = email.slice(0, at);
    const emailDomain = email.slice(at + 1);
    if (emailDomain !== domain) {
        return false;
    }
  if (local === localBase) {
        return true;
    }
    const dotCount = (local.match(/\./g) ?? []).length;
    if (dotCount === 0) {
        return local === localBase;
    }
    if (dotCount === 1) {
        for (let p = 0; p <= localBase.length - 1; p++) {
            if (`${localPartWithSingleDotAt(localBase, p)}@${domain}` === email) {
                return true;
            }
        }
        return false;
    }
    if (dotCount === 2) {
        return false;
    }
    if (dotCount === 3) {
        const undotted = local.replace(/\./g, '');
        if (undotted !== localBase) {
            return false;
        }
        const triplets = enumerateThreeDotGapTriplets(localBase.length);
        for (const gaps of triplets) {
            if (buildThreeDotEmail(localBase, domain, gaps) === email) {
                return true;
            }
        }
        return false;
    }
    return false;
}