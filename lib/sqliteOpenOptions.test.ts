import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FTS_SAFE_SQLITE_OPEN_OPTIONS } from './sqliteOpenOptions';

const SOURCE_ROOTS = ['app', 'components', 'hooks', 'lib'];
const DIRECT_NATIVE_OPEN_RE = /\b(?:openDatabase|deserializeDatabase)(?:Sync|Async)\s*\(/;

function sourceFiles(root: string): string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
        return [fullPath];
    });
}

describe('native SQLite open options', () => {
    it('disables expo-sqlite teardown finalization that double-finalizes FTS statements', () => {
        expect(FTS_SAFE_SQLITE_OPEN_OPTIONS.finalizeUnusedStatementsBeforeClosing).toBe(false);
        expect(Object.isFrozen(FTS_SAFE_SQLITE_OPEN_OPTIONS)).toBe(true);
    });

    it('routes every native open through the FTS-safe connection factory', () => {
        const allowedFactory = path.join(process.cwd(), 'lib', 'sqliteOpenOptions.ts');
        const violations = SOURCE_ROOTS
            .flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
            .filter((file) => file !== allowedFactory)
            .flatMap((file) => {
                const source = fs.readFileSync(file, 'utf8');
                return DIRECT_NATIVE_OPEN_RE.test(source)
                    ? [path.relative(process.cwd(), file)]
                    : [];
            });

        expect(violations).toEqual([]);
    });
});
