import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configsPlaywrightDir = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (configs/playwright is two levels below). */
export const repoRoot = path.resolve(configsPlaywrightDir, '../..');

export const testsDir = path.join(repoRoot, 'tests');

export function fromRepo(...segments: string[]): string {
    return path.join(repoRoot, ...segments);
}
