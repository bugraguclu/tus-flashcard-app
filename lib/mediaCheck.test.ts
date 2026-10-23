// Check Media, independently implemented from https://docs.ankiweb.net/media.html#checking-media
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, files: new Map<string, string>() }));
vi.mock('./db', () => ({ getDB: () => h.db }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('./mediaStore', () => ({
    ensureMediaDir: async () => 'file:///docs/tus-media/',
    listStoredMediaFilenames: async () => [...h.files.keys()].filter((path) => path.startsWith('file:///docs/tus-media/')).map((path) => path.slice('file:///docs/tus-media/'.length)),
}));
vi.mock('./files', () => ({
    getLegacyFileSystem: () => ({
        makeDirectoryAsync: async () => {},
        getInfoAsync: async (path: string) => ({ exists: h.files.has(path) || [...h.files.keys()].some((key) => key.startsWith(path)), isDirectory: !h.files.has(path) }),
        moveAsync: async ({ from, to }: { from: string; to: string }) => { h.files.set(to, h.files.get(from)!); h.files.delete(from); },
        readDirectoryAsync: async (dir: string) => [...new Set([...h.files.keys()].filter((key) => key.startsWith(dir)).map((key) => key.slice(dir.length).split('/')[0]))],
    }),
}));
import { checkMedia, moveUnusedMediaToTrash, restoreMediaTrash } from './mediaCheck';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.files.clear();
    for (const name of ['used.png', 'orphan.mp3', '_template.css', 'tusanki-source-a.apkg', 'tusanki-source-b.apkg', 'css.woff']) h.files.set(`file:///docs/tus-media/${name}`, 'x');
    h.db.runSync('INSERT INTO notes (id, data) VALUES (1, ?)', JSON.stringify({ fields: ['<img src="used.png">', '[sound:gone.mp3]'] }));
    h.db.runSync('INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)', 'T', JSON.stringify({ css: '@font-face { src: url("css.woff"); }', templates: [{ qfmt: '{{Front}}', afmt: '' }] }));
    h.db.runSync('INSERT INTO settings (key, value) VALUES (?, ?), (?, ?)',
        'anki_source_package_v1:a', JSON.stringify({ archiveName: 'tusanki-source-a.apkg', exactEligible: true, dirty: false }),
        'anki_source_package_v1:b', JSON.stringify({ archiveName: 'tusanki-source-b.apkg', exactEligible: true, dirty: true }));
});

describe('Check Media', () => {
    it('reports unused and missing files, keeping _ files and usable package copies', async () => {
        const result = await checkMedia();
        expect(result.unused).toEqual(['orphan.mp3', 'tusanki-source-b.apkg']);
        expect(result.missing).toEqual(['gone.mp3']);
        expect(result.storedCount).toBe(6);
    });

    it('moves unused files to the trash, skips a file used again since the check, and puts them back', async () => {
        const { unused } = await checkMedia();
        h.db.runSync('INSERT INTO notes (id, data) VALUES (2, ?)', JSON.stringify({ fields: ['<img src="orphan.mp3">'] }));
        const { moved } = await moveUnusedMediaToTrash(unused);
        expect(moved).toBe(1);
        expect(h.files.has('file:///docs/tus-media/orphan.mp3')).toBe(true);
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(false);
        expect([...h.files.keys()].some((key) => key.startsWith('file:///docs/tus-media-trash/') && key.endsWith('tusanki-source-b.apkg'))).toBe(true);
        expect(await restoreMediaTrash()).toEqual({ restored: 1, skipped: 0 });
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(true);
    });
});
