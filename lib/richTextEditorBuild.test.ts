// The exported page and the client bundle may compile at different JS targets. The inherited
// page CSP must allow exactly the same constant editor script in both outputs.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
function scriptFromBuild(target: ts.ScriptTarget): { RICH_TEXT_EDITOR_SCRIPT: string; RICH_TEXT_EDITOR_SCRIPT_HASH: string } {
    const cache = new Map<string, { exports: any }>();
    const load = (name: string): any => {
        if (name === './templates') return { sanitizeUntrustedHtml: (s: string) => s };
        if (cache.has(name)) return cache.get(name)!.exports;
        const source = readFileSync(new URL(`${name}.ts`, import.meta.url), 'utf8');
        const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target } }).outputText;
        const module = { exports: {} }; cache.set(name, module);
        new Function('require', 'module', 'exports', js)(load, module, module.exports);
        return module.exports;
    };
    return load('./richTextEditorScript');
}
describe('production field script CSP across build targets', () => {
    it('keeps exactly the same script and hash after distinct server/client compilation', () => {
        const olderTarget = scriptFromBuild(ts.ScriptTarget.ES2018);
        const modernTarget = scriptFromBuild(ts.ScriptTarget.ES2022);
        expect(olderTarget.RICH_TEXT_EDITOR_SCRIPT_HASH).toBe(modernTarget.RICH_TEXT_EDITOR_SCRIPT_HASH);
        expect(olderTarget.RICH_TEXT_EDITOR_SCRIPT).toBe(modernTarget.RICH_TEXT_EDITOR_SCRIPT);
    });
});
