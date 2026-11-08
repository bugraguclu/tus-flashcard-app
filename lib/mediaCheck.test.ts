// Check Media, independently implemented from https://docs.ankiweb.net/media.html#checking-media
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, files: new Map<string, string>(), failMove: (_from: string): boolean => false }));
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
        moveAsync: async ({ from, to }: { from: string; to: string }) => {
            if (h.failMove(from)) throw new Error(`could not move ${from}`);
            h.files.set(to, h.files.get(from)!);
            h.files.delete(from);
        },
        readDirectoryAsync: async (dir: string) => [...new Set([...h.files.keys()].filter((key) => key.startsWith(dir)).map((key) => key.slice(dir.length).split('/')[0]))],
    }),
}));
import { checkMedia, moveUnusedMediaToTrash, restoreMediaTrash } from './mediaCheck';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.files.clear();
    h.failMove = () => false;
    for (const name of ['used.png', 'orphan.mp3', '_template.css', 'tusanki-source-a.apkg', 'tusanki-source-b.apkg', 'css.woff']) h.files.set(`file:///docs/tus-media/${name}`, 'x');
    h.db.runSync('INSERT INTO notes (id, data) VALUES (1, ?)', JSON.stringify({ fields: ['<img src="used.png">', '[sound:gone.mp3]'] }));
    h.db.runSync('INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)', 'T', JSON.stringify({ css: '@font-face { src: url("css.woff"); }', templates: [{ qfmt: '{{Front}}', afmt: '' }] }));
});

describe('Check Media', () => {
    it('reports unused and missing files, keeping _ files', async () => {
        const result = await checkMedia();
        // Package copies kept by earlier versions of the app are no longer used.
        expect(result.unused).toEqual(['orphan.mp3', 'tusanki-source-a.apkg', 'tusanki-source-b.apkg']);
        expect(result.missing).toEqual(['gone.mp3']);
        expect(result.storedCount).toBe(6);
    });

    it('moves unused files to the trash, skips a file used again since the check, and puts them back', async () => {
        const { unused } = await checkMedia();
        h.db.runSync('INSERT INTO notes (id, data) VALUES (2, ?)', JSON.stringify({ fields: ['<img src="orphan.mp3">'] }));
        const { moved } = await moveUnusedMediaToTrash(unused);
        expect(moved).toBe(2);
        expect(h.files.has('file:///docs/tus-media/orphan.mp3')).toBe(true);
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(false);
        expect([...h.files.keys()].some((key) => key.startsWith('file:///docs/tus-media-trash/') && key.endsWith('tusanki-source-b.apkg'))).toBe(true);
        expect(await restoreMediaTrash()).toEqual({ restored: 2, skipped: 0, failed: 0 });
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(true);
    });

    it('moves the files it can when one cannot be moved, and counts each', async () => {
        const { unused } = await checkMedia();
        h.failMove = (from) => from.endsWith('/tusanki-source-a.apkg');

        const result = await moveUnusedMediaToTrash(unused);

        expect(result).toMatchObject({ moved: 2, failed: 1 });
        expect(h.files.has('file:///docs/tus-media/tusanki-source-a.apkg')).toBe(true);
        expect(h.files.has('file:///docs/tus-media/orphan.mp3')).toBe(false);
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(false);
        // A check after the partial move lists only the file that stayed.
        expect((await checkMedia()).unused).toEqual(['tusanki-source-a.apkg']);
    });

    it('puts back the files it can when one cannot be restored, and counts each', async () => {
        const { unused } = await checkMedia();
        await moveUnusedMediaToTrash(unused);
        h.files.set('file:///docs/tus-media/orphan.mp3', 'new file with the same name');
        h.failMove = (from) => from.endsWith('/tusanki-source-b.apkg');

        expect(await restoreMediaTrash()).toEqual({ restored: 1, skipped: 1, failed: 1 });
        expect(h.files.has('file:///docs/tus-media/tusanki-source-a.apkg')).toBe(true);
        expect(h.files.has('file:///docs/tus-media/tusanki-source-b.apkg')).toBe(false);
    });
});
