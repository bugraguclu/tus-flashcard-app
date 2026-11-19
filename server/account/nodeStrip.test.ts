import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The server runs its .ts files with Node's type stripping (no build step), which refuses
 * TypeScript that needs code generation: parameter properties, enums, namespaces. Vitest
 * transpiles instead, so without this check such a file passes every test and fails to start.
 */
const ROOT = join(process.cwd(), 'server/account');

describe('account server source', () => {
    it('runs under Node type stripping', () => {
        const refused: string[] = [];
        for (const file of readdirSync(ROOT).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
            try {
                stripTypeScriptTypes(readFileSync(join(ROOT, file), 'utf8'));
            } catch (error) {
                refused.push(`${file}: ${(error as Error).message.split('\n')[0]}`);
            }
        }
        expect(refused).toEqual([]);
    });
});
