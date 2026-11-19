/**
 * JUnit structural scan helpers: ignore markup-like tokens inside CDATA.
 */

/** @param {string} text */
export function findCdataRanges(text) {
    const ranges = [];
    let i = 0;
    while (i < text.length) {
        const open = text.indexOf('<![CDATA[', i);
        if (open === -1) {
            break;
        }
        const close = text.indexOf(']]>', open);
        if (close === -1) {
            break;
        }
        ranges.push([open, close + 3]);
        i = close + 3;
    }
    return ranges;
}

/** @param {readonly [number, number][]} ranges @param {number} index */
export function indexInsideCdataRanges(ranges, index) {
    for (const [start, end] of ranges) {
        if (index >= start && index < end) {
            return true;
        }
    }
    return false;
}

/**
 * @param {string} text
 * @param {readonly [number, number][]} cdataRanges
 * @param {number} index
 */
export function advancePastCdataContaining(text, cdataRanges, index) {
    for (const [start, end] of cdataRanges) {
        if (index >= start && index < end) {
            return end;
        }
    }
    return index + 1;
}

const LINE_ANCHORED_TESTSUITE_OPEN = /(?:^|\n)\s*<testsuite\b/g;
const LINE_ANCHORED_TESTCASE_OPEN = /(?:^|\n)\s*<testcase\b/g;

/**
 * @param {'testsuite' | 'testcase'} kind
 */
function lineAnchoredIndexOfRaw(inner, kind, from) {
    const re = kind === 'testsuite' ? LINE_ANCHORED_TESTSUITE_OPEN : LINE_ANCHORED_TESTCASE_OPEN;
    const token = kind === 'testsuite' ? '<testsuite' : '<testcase';
    re.lastIndex = from;
    const m = re.exec(inner);
    if (!m) {
        return -1;
    }
    return inner.indexOf(token, m.index);
}

/**
 * @param {string} inner
 * @param {'testsuite' | 'testcase'} kind
 * @param {number} from
 * @param {readonly [number, number][]} cdataRanges
 */
export function lineAnchoredIndexOutsideCdata(inner, kind, from, cdataRanges) {
    let pos = from;
    while (pos < inner.length) {
        const idx = lineAnchoredIndexOfRaw(inner, kind, pos);
        if (idx === -1) {
            return -1;
        }
        if (!indexInsideCdataRanges(cdataRanges, idx)) {
            return idx;
        }
        pos = advancePastCdataContaining(inner, cdataRanges, idx);
    }
    return -1;
}

/**
 * @param {string} inner
 * @param {string} token e.g. '</testsuite>'
 * @param {number} from
 * @param {readonly [number, number][]} cdataRanges
 */
export function indexOfCloseOutsideCdata(inner, token, from, cdataRanges) {
    let pos = from;
    while (pos < inner.length) {
        const idx = inner.indexOf(token, pos);
        if (idx === -1) {
            return -1;
        }
        if (!indexInsideCdataRanges(cdataRanges, idx)) {
            return idx;
        }
        pos = advancePastCdataContaining(inner, cdataRanges, idx);
    }
    return -1;
}