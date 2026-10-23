// AGENTS.md: a split module must never import the file that re-exports it, because a load-time
// import cycle can hand a module an undefined constant. This guards the study/deck modules whose
// cycles have bitten before (filteredDecks -> settingsStore -> deckManager -> filteredDecks).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/** Runtime (non-type) relative imports and re-exports of one source file. */
function runtimeDeps(file: string): string[] {
    let source = '';
    try {
        source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
        return [];
    }
    const deps: string[] = [];
    const statement = /^(import|export)\s+(?!type\b)[^'";]*?from\s+['"](\.[^'"]+)['"]/gms;
    let match: RegExpExecArray | null;
    while ((match = statement.exec(source)) !== null) {
        let target = path.normalize(path.join(path.dirname(file), match[2]));
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
            if (fs.existsSync(path.join(ROOT, target + ext))) {
                target += ext;
                break;
            }
        }
        deps.push(target);
    }
    return deps;
}

/** One import chain that leads from `start` back to itself, or null. */
function findCycle(start: string): string[] | null {
    const previous = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    while (queue.length > 0) {
        const file = queue.shift()!;
        for (const dep of runtimeDeps(file)) {
            if (dep === start) {
                const chain = [start];
                for (let at: string | null = file; at && at !== start; at = previous.get(at) ?? null) chain.splice(1, 0, at);
                return [...chain, start];
            }
            if (!previous.has(dep)) {
                previous.set(dep, file);
                queue.push(dep);
            }
        }
    }
    return null;
}

describe('study and deck modules load without import cycles', () => {
    it.each([
        'lib/filteredDecks.ts',
        'lib/settingsStore.ts',
        'lib/deckStore.ts',
        'lib/deckTree.ts',
        'lib/studyQueue.ts',
        'lib/studyAnswer.ts',
        'lib/reviewerUndo.ts',
        'lib/queueBookkeeping.ts',
    ])('%s', (file) => {
        expect(findCycle(file)).toBeNull();
    });
});
