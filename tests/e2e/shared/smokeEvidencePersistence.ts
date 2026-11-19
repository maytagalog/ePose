import fs from 'node:fs';
import path from 'node:path';
import { smokeEvidenceDir } from './smokeRunContext';

export function persistSmokeEvidenceJson(
    relativeName: string,
    payload: unknown,
    options?: { repoRoot?: string }
): string | null {
    try {
        const dir = smokeEvidenceDir(options?.repoRoot);
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, relativeName);
        const tmp = `${target}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
        fs.renameSync(tmp, target);
        console.log(
            'SMOKE_EVIDENCE_PERSISTED',
            JSON.stringify({ relativePath: path.relative(process.cwd(), target) })
        );
        return target;
    } catch (error) {
        console.log(
            'SMOKE_EVIDENCE_PERSIST_FAILED',
            JSON.stringify({
                relativeName,
                message: error instanceof Error ? error.message : String(error),
            })
        );
        return null;
    }
}