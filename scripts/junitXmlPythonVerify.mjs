import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const VERIFY_SCRIPT = String.raw`
import json
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1]
tree = ET.parse(path)
root = tree.getroot()

def attr(el, name, default=None):
    return el.get(name, default)

def count_status(suite):
    failures = errors = skipped = 0
    for tc in suite.findall("testcase"):
        if tc.find("failure") is not None:
            failures += 1
        elif tc.find("error") is not None:
            errors += 1
        elif tc.find("skipped") is not None:
            skipped += 1
    return failures, errors, skipped

suites = [child for child in root if child.tag == "testsuite"]
testcases = []
for suite in suites:
    for tc in suite.findall("testcase"):
        testcases.append(
            {
                "name": tc.get("name"),
                "classname": tc.get("classname"),
                "suite": suite.get("name"),
            }
        )

skipped_names = [
    tc.get("name")
    for suite in suites
    for tc in suite.findall("testcase")
    if tc.find("skipped") is not None
]

part1 = next(
    (
        s
        for s in suites
        if s.get("name", "").endswith("part1SmokeTestmoFeature.spec.ts")
        or s.get("name", "").endswith("fullE2ESmokePart1.spec.ts")
    ),
    None,
)
part2 = next(
    (
        s
        for s in suites
        if s.get("name", "").endswith("part2SmokeTestmoFeature.spec.ts")
        or s.get("name", "").endswith("fullE2ESmokePart2.spec.ts")
    ),
    None,
)

p1_fail, p1_err, p1_skip = count_status(part1) if part1 is not None else (0, 0, 0)
p2_fail, p2_err, p2_skip = count_status(part2) if part2 is not None else (0, 0, 0)

payload = {
    "valid": True,
    "suiteCount": len(suites),
    "testcaseCount": len(testcases),
    "root": {
        "tests": attr(root, "tests"),
        "failures": attr(root, "failures"),
        "errors": attr(root, "errors"),
        "skipped": attr(root, "skipped"),
        "time": attr(root, "time"),
    },
    "part1Suite": {
        "timestamp": attr(part1, "timestamp") if part1 is not None else None,
        "tests": attr(part1, "tests") if part1 is not None else None,
        "failures": str(p1_fail),
        "errors": str(p1_err),
        "skipped": str(p1_skip),
        "testcaseTime": (part1.find("testcase").get("time") if part1 is not None and part1.find("testcase") is not None else None),
    },
    "part2Suite": {
        "timestamp": attr(part2, "timestamp") if part2 is not None else None,
        "tests": attr(part2, "tests") if part2 is not None else None,
        "failures": str(p2_fail),
        "errors": str(p2_err),
        "skipped": str(p2_skip),
    },
    "skippedTestcaseNames": skipped_names,
    "testcaseNames": [t["name"] for t in testcases],
    "part1FeatureAutomationKeys": [
        t["name"]
        for t in testcases
        if t.get("classname") == "e2e/part1SmokeTestmoFeature.spec.ts"
    ],
    "part2FeatureAutomationKeys": [
        t["name"]
        for t in testcases
        if t.get("classname") == "e2e/part2SmokeTestmoFeature.spec.ts"
    ],
    "featureAutomationKeys": [
        t["name"]
        for t in testcases
        if t.get("classname") in (
            "e2e/part1SmokeTestmoFeature.spec.ts",
            "e2e/part2SmokeTestmoFeature.spec.ts",
        )
    ],
}

print(json.dumps(payload))
`;

/**
 * Parse JUnit XML with CPython xml.etree.ElementTree.
 * @param {string} xmlPath
 */
export function parseJUnitXmlWithPython(xmlPath) {
    if (!fs.existsSync(xmlPath)) {
        throw new Error(`Missing ${xmlPath}`);
    }
    const result = spawnSync('python3', ['-c', VERIFY_SCRIPT, xmlPath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
    });
    if (result.status !== 0) {
        throw new Error(
            `Python XML parse failed: ${result.stderr?.trim() || result.stdout?.trim() || result.status}`
        );
    }
    return JSON.parse(result.stdout.trim());
}