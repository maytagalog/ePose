/**
 * Recompute JUnit testsuite root and per-suite counts from testcase elements.
 */

import {
    findCdataRanges,
    indexOfCloseOutsideCdata,
    lineAnchoredIndexOutsideCdata,
} from './junitXmlScan.mjs';

const TESTSUITE_OPEN = '<testsuite';
const TESTSUITE_CLOSE = '</testsuite>';
const TESTCASE_OPEN = '<testcase';
const TESTCASE_CLOSE = '</testcase>';

/** @param {string} xml */
export function parseTestsuitesRoot(xml) {
    const match = xml.match(/^(\s*<testsuites\b[^>]*>)([\s\S]*)(<\/testsuites>\s*)$/);
    if (!match) {
        return null;
    }
    return { openTag: match[1], inner: match[2], closeTag: match[3] };
}

/**
 * Top-level testsuite blocks only (ignores literal tags inside testcase system-out).
 * @param {string} inner
 */
export function splitTopLevelTestsuites(inner) {
    const cdataRanges = findCdataRanges(inner);
    const suites = [];
    let pos = 0;
    while (pos < inner.length) {
        const start = lineAnchoredIndexOutsideCdata(inner, 'testsuite', pos, cdataRanges);
        if (start === -1) {
            break;
        }
        const openEnd = inner.indexOf('>', start);
        if (openEnd === -1) {
            break;
        }
        let depth = 1;
        let cursor = openEnd + 1;
        let closedAt = -1;
        while (cursor < inner.length) {
            const nextOpen = lineAnchoredIndexOutsideCdata(inner, 'testsuite', cursor, cdataRanges);
            const nextClose = indexOfCloseOutsideCdata(inner, TESTSUITE_CLOSE, cursor, cdataRanges);
            if (nextClose === -1) {
                break;
            }
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth += 1;
                cursor = nextOpen + TESTSUITE_OPEN.length;
            } else {
                depth -= 1;
                cursor = nextClose + TESTSUITE_CLOSE.length;
                if (depth === 0) {
                    closedAt = cursor;
                    break;
                }
            }
        }
        if (closedAt === -1) {
            break;
        }
        suites.push(inner.slice(start, closedAt));
        pos = closedAt;
    }
    return suites;
}

/** @param {string} xml @param {RegExp} namePattern */
export function findTopLevelTestsuiteByName(xml, namePattern) {
    const root = parseTestsuitesRoot(xml.trim());
    const scan = root ? root.inner : xml;
    for (const suite of splitTopLevelTestsuites(scan)) {
        if (namePattern.test(suite.slice(0, 500))) {
            return suite;
        }
    }
    return null;
}

/** @param {string} xml @param {string} oldBlock @param {string} newBlock */
export function replaceXmlBlockOnce(xml, oldBlock, newBlock) {
    const idx = xml.indexOf(oldBlock);
    if (idx === -1) {
        throw new Error('Expected XML block not found for replacement.');
    }
    return xml.slice(0, idx) + newBlock + xml.slice(idx + oldBlock.length);
}

/**
 * Testcase blocks at top level of a testsuite inner (not inside nested markup in CDATA).
 * @param {string} suiteInner
 */
export function splitTopLevelTestcases(suiteInner) {
    const cdataRanges = findCdataRanges(suiteInner);
    const blocks = [];
    let pos = 0;
    while (pos < suiteInner.length) {
        const start = lineAnchoredIndexOutsideCdata(suiteInner, 'testcase', pos, cdataRanges);
        if (start === -1) {
            break;
        }
        const tagEnd = suiteInner.indexOf('>', start);
        if (tagEnd === -1) {
            break;
        }
        const isSelfClosing = suiteInner.charAt(tagEnd - 1) === '/';
        if (isSelfClosing) {
            const end = tagEnd + 1;
            blocks.push(suiteInner.slice(start, end));
            pos = end;
            continue;
        }
        const explicitClose = suiteInner.indexOf(TESTCASE_CLOSE, tagEnd);
        if (explicitClose === -1) {
            break;
        }
        let depth = 1;
        let cursor = tagEnd + 1;
        let closedAt = -1;
        while (cursor < suiteInner.length) {
            const nextOpen = lineAnchoredIndexOutsideCdata(suiteInner, 'testcase', cursor, cdataRanges);
            const nextClose = indexOfCloseOutsideCdata(suiteInner, TESTCASE_CLOSE, cursor, cdataRanges);
            if (nextClose === -1) {
                break;
            }
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth += 1;
                cursor = nextOpen + TESTCASE_OPEN.length;
            } else {
                depth -= 1;
                cursor = nextClose + TESTCASE_CLOSE.length;
                if (depth === 0) {
                    closedAt = cursor;
                    break;
                }
            }
        }
        if (closedAt === -1) {
            break;
        }
        blocks.push(suiteInner.slice(start, closedAt));
        pos = closedAt;
    }
    return blocks;
}

function classifyTestcase(block) {
    if (/<failure\b/.test(block)) {
        return 'failure';
    }
    if (/<error\b/.test(block)) {
        return 'error';
    }
    if (/<skipped\b/.test(block)) {
        return 'skipped';
    }
    return 'passed';
}

function sumTimes(blocks) {
    let total = 0;
    for (const block of blocks) {
        const m = block.match(/\btime="([^"]*)"/);
        if (m) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) {
                total += n;
            }
        }
    }
    return total;
}

function setAttr(tag, attr, value) {
    const re = new RegExp(`\\b${attr}="[^"]*"`);
    if (re.test(tag)) {
        return tag.replace(re, `${attr}="${value}"`);
    }
    return tag.replace(/\/?>$/, ` ${attr}="${value}">`);
}

function recomputeSuiteBlock(suite) {
    const open = suite.match(/^<testsuite\b[^>]*>/)?.[0];
    if (!open) {
        return suite;
    }
    const inner = suite.slice(open.length, -TESTSUITE_CLOSE.length);
    const blocks = splitTopLevelTestcases(inner);
    let failures = 0;
    let errors = 0;
    let skipped = 0;
    for (const block of blocks) {
        const kind = classifyTestcase(block);
        if (kind === 'failure') {
            failures += 1;
        } else if (kind === 'error') {
            errors += 1;
        } else if (kind === 'skipped') {
            skipped += 1;
        }
    }
    const suiteTime = sumTimes(blocks);
    let newOpen = setAttr(open, 'tests', String(blocks.length));
    newOpen = setAttr(newOpen, 'failures', String(failures));
    newOpen = setAttr(newOpen, 'errors', String(errors));
    newOpen = setAttr(newOpen, 'skipped', String(skipped));
    newOpen = setAttr(newOpen, 'time', String(suiteTime));
    return `${newOpen}${inner}${TESTSUITE_CLOSE}`;
}

export function recomputeJUnitCounts(xml) {
    const root = parseTestsuitesRoot(xml);
    if (!root) {
        return xml;
    }

    const suites = splitTopLevelTestsuites(root.inner);
    let cursor = 0;
    let rebuiltInner = '';
    let rootTests = 0;
    let rootFailures = 0;
    let rootErrors = 0;
    let rootSkipped = 0;
    let rootTime = 0;

    for (const suite of suites) {
        const start = root.inner.indexOf(suite, cursor);
        if (start === -1) {
            continue;
        }
        rebuiltInner += root.inner.slice(cursor, start);
        const newSuite = recomputeSuiteBlock(suite);
        rebuiltInner += newSuite;
        cursor = start + suite.length;

        const open = newSuite.match(/^<testsuite\b[^>]*>/)?.[0] ?? '';
        const testsMatch = open.match(/\btests="(\d+)"/);
        const failuresMatch = open.match(/\bfailures="(\d+)"/);
        const errorsMatch = open.match(/\berrors="(\d+)"/);
        const skippedMatch = open.match(/\bskipped="(\d+)"/);
        const timeMatch = open.match(/\btime="([^"]*)"/);
        rootTests += Number(testsMatch?.[1] ?? 0);
        rootFailures += Number(failuresMatch?.[1] ?? 0);
        rootErrors += Number(errorsMatch?.[1] ?? 0);
        rootSkipped += Number(skippedMatch?.[1] ?? 0);
        rootTime += Number(timeMatch?.[1] ?? 0);
    }
    rebuiltInner += root.inner.slice(cursor);

    let rebuilt = `${root.openTag}${rebuiltInner}${root.closeTag}`;
    const rootOpenMatch = rebuilt.match(/^<testsuites\b[^>]*>/);
    if (rootOpenMatch) {
        let rootOpen = rootOpenMatch[0];
        rootOpen = setAttr(rootOpen, 'tests', String(rootTests));
        rootOpen = setAttr(rootOpen, 'failures', String(rootFailures));
        rootOpen = setAttr(rootOpen, 'errors', String(rootErrors));
        rootOpen = setAttr(rootOpen, 'skipped', String(rootSkipped));
        rootOpen = setAttr(rootOpen, 'time', String(rootTime));
        rebuilt = rootOpen + rebuilt.slice(rootOpenMatch[0].length);
    }

    return rebuilt;
}