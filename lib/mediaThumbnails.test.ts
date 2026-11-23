// Media thumbnail derivative storage, cache hits, regeneration, memory bounds and strict
// isolation from original collection media, Check Media, and Anki .apkg export.
import { createHash } from 'crypto';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const fixture = vi.hoisted(() => ({
    db: null as any,
    mediaFiles: new Map<string, Uint8Array>(),
    cacheFiles: new Map<string, { bytes: Uint8Array; mtime: number }>(),
}));

vi.mock('./db', () => ({
    getDB: () => fixture.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
}));
vi.mock('./mediaStore', async () => {
    const { sanitizeMediaFilename } = await import('./mediaFilename');
    return {
        sanitizeMediaFilename,
        ensureMediaDir: async () => 'file:///docs/tus-media/',
        listStoredMediaFilenames: async () => [...fixture.mediaFiles.keys()],
        readMediaBytes: async (name: string) => fixture.mediaFiles.get(sanitizeMediaFilename(name)) ?? null,
        readWebMediaBlob: async () => null,
        onMediaChanged: () => () => {},
    };
});

import { checkMedia } from './mediaCheck';
import { buildAnkiExport } from './exportAnkiPackage';
import { saveDeck, saveDeckConfig } from './deckManager';
import { createNote, saveNoteType } from './noteManager';
import { DEFAULT_DECK_CONFIG, type NoteType } from './models';
import { createMediaThumbnailManager, type NativeThumbnailAdapter, type WebThumbnailAdapter, type WebThumbnailRecord } from './mediaThumbnails';

function sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

describe('native (iOS) thumbnail derivative lifecycle and media isolation', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let generateCalls: Array<{ sourceUri: string; destUri: string; targetEdge: number; preserveAlpha: boolean }>;
    let nativeAdapter: NativeThumbnailAdapter;
    let clock = 1000;

    beforeAll(async () => {
        SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    });

    beforeEach(() => {
        Platform.OS = 'web';
        fixture.db = createAppDb(SQL);
        fixture.mediaFiles.clear();
        fixture.cacheFiles.clear();
        generateCalls = [];
        clock = 1000;

        nativeAdapter = {
            getSourceUri: async (filename) => `file:///docs/tus-media/${filename}`,
            getCacheDir: async () => 'file:///caches/tus-media-thumbs/',
            getFileInfo: async (uri) => {
                if (uri.startsWith('file:///docs/tus-media/')) {
                    const name = uri.slice('file:///docs/tus-media/'.length);
                    const bytes = fixture.mediaFiles.get(name);
                    return bytes ? { exists: true, size: bytes.length, modificationTime: 100 } : { exists: false };
                }
                const cached = fixture.cacheFiles.get(uri);
                return cached ? { exists: true, size: cached.bytes.length, modificationTime: cached.mtime } : { exists: false };
            },
            generateDerivative: async (sourceUri, destUri, targetEdge, preserveAlpha) => {
                generateCalls.push({ sourceUri, destUri, targetEdge, preserveAlpha });
                // Derivatives live strictly in cacheDirectory, never in tus-media.
                expect(destUri.startsWith('file:///caches/tus-media-thumbs/')).toBe(true);
                expect(destUri.includes('tus-media/')).toBe(false);
                clock += 10;
                fixture.cacheFiles.set(destUri, { bytes: new Uint8Array([0xff, 0xd8, 0x01]), mtime: clock });
                return true;
            },
            listCacheFiles: async (cacheDir) => [...fixture.cacheFiles.keys()]
                .filter((uri) => uri.startsWith(cacheDir))
                .map((uri) => uri.slice(cacheDir.length)),
            deleteFile: async (uri) => { fixture.cacheFiles.delete(uri); },
            clearCacheDir: async (cacheDir) => {
                for (const uri of [...fixture.cacheFiles.keys()]) {
                    if (uri.startsWith(cacheDir)) fixture.cacheFiles.delete(uri);
                }
            },
        };
    });

    it('generates Retina derivatives in cacheDirectory, hits cache on reload, and regenerates after deletion', async () => {
        const originalBytes = new Uint8Array(64_000).fill(42);
        const originalHash = sha256(originalBytes);
        fixture.mediaFiles.set('anatomy.jpg', originalBytes);

        const manager = createMediaThumbnailManager({
            platform: 'native',
            getPixelRatio: () => 3,
            native: nativeAdapter,
        });

        const firstUri = await manager.load('anatomy.jpg');
        expect(firstUri).toMatch(/^file:\/\/\/caches\/tus-media-thumbs\/v1_[a-z0-9]+_132\.jpg$/);
        expect(generateCalls).toHaveLength(1);
        expect(generateCalls[0].targetEdge).toBe(132);
        expect(generateCalls[0].preserveAlpha).toBe(false);

        // Synchronous memory hit on repeat lookup.
        expect(manager.getCached('anatomy.jpg')).toBe(firstUri);
        expect(await manager.load('anatomy.jpg')).toBe(firstUri);
        expect(generateCalls).toHaveLength(1);

        // Fresh manager (simulating app relaunch): hits existing disk derivative without re-decoding!
        const relaunched = createMediaThumbnailManager({
            platform: 'native',
            getPixelRatio: () => 3,
            native: nativeAdapter,
        });
        expect(await relaunched.load('anatomy.jpg')).toBe(firstUri);
        expect(generateCalls).toHaveLength(1);

        // Deleting derivatives transparently regenerates them without touching the original file.
        await relaunched.clearAll();
        expect(fixture.cacheFiles.size).toBe(0);
        const regeneratedUri = await relaunched.load('anatomy.jpg');
        expect(regeneratedUri).toBe(firstUri);
        expect(generateCalls).toHaveLength(2);

        // Original media bytes and hash are byte-for-byte identical.
        expect(sha256(fixture.mediaFiles.get('anatomy.jpg')!)).toBe(originalHash);
    });

    it('keeps derivatives completely out of Check Media and Anki .apkg exports', async () => {
        const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 99, 88, 77]);
        const originalHash = sha256(originalBytes);
        fixture.mediaFiles.set('slide.png', originalBytes);

        const basicNoteType: NoteType = {
            id: 1,
            name: 'Basic',
            kind: 'standard',
            fields: [
                { name: 'Front', ord: 0, sticky: false, rtl: false },
                { name: 'Back', ord: 1, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
            css: '',
            sortFieldIdx: 0,
            mod: 1,
        };
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
        saveDeck({ id: 1, name: 'Histoloji', configId: 1, mod: 1, usn: -1, description: '', collapsed: false, isFiltered: false });
        saveNoteType(basicNoteType);
        createNote(basicNoteType, ['<img src="slide.png">', 'Epitel'], 1);

        const manager = createMediaThumbnailManager({
            platform: 'native',
            getPixelRatio: () => 3,
            native: nativeAdapter,
        });
        const thumbUri = await manager.load('slide.png');
        expect(thumbUri).toContain('tus-media-thumbs');
        expect(fixture.cacheFiles.size).toBe(1);

        // Check Media sees only the single user file — zero unused derivatives!
        const check = await checkMedia();
        expect(check.storedCount).toBe(1);
        expect(check.referencedCount).toBe(1);
        expect(check.unused).toEqual([]);
        expect(check.missing).toEqual([]);

        // Exported .apkg contains only the original media bytes with identical SHA-256 hash.
        const exported = await buildAnkiExport('apkg', 'Histoloji', true, undefined, {
            includeScheduling: false,
        });
        const zip = await JSZip.loadAsync(exported.bytes!);
        const mediaMap = JSON.parse(await zip.file('media')!.async('string')) as Record<string, string>;
        expect(Object.values(mediaMap)).toEqual(['slide.png']);
        const exportedSlide = await zip.file('0')!.async('uint8array');
        expect(sha256(exportedSlide)).toBe(originalHash);
    });

    it('invalidates cached derivative when the original file is replaced', async () => {
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(1000).fill(1));
        const manager = createMediaThumbnailManager({
            platform: 'native',
            getPixelRatio: () => 2,
            native: nativeAdapter,
        });

        const first = await manager.load('heart.jpg');
        expect(generateCalls).toHaveLength(1);

        // Overwrite with different size and notify invalidation.
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(2500).fill(2));
        await manager.invalidate(['heart.jpg']);
        expect(manager.getCached('heart.jpg')).toBeUndefined();

        const second = await manager.load('heart.jpg');
        expect(second).not.toBe(first);
        expect(generateCalls).toHaveLength(2);
    });

    it('regenerates when an original is replaced during native decoding, even with the same size and mtime', async () => {
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(1000).fill(1));
        const generate = nativeAdapter.generateDerivative;
        let finishDecode!: () => void;
        let first = true;
        nativeAdapter.generateDerivative = async (...args) => {
            if (first) {
                first = false;
                await new Promise<void>((resolve) => { finishDecode = resolve; });
            }
            return generate(...args);
        };
        const manager = createMediaThumbnailManager({ platform: 'native', native: nativeAdapter, getPixelRatio: () => 2 });
        const pending = manager.load('heart.jpg');
        await vi.waitFor(() => expect(finishDecode).toBeDefined());
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(1000).fill(2));
        await manager.invalidate(['heart.jpg']);
        finishDecode();
        expect(await pending).toContain('tus-media-thumbs');
        expect(generateCalls).toHaveLength(2);
    });
    it('never prunes a derivative that rows are still being served from memory', async () => {
        // An old derivative left on disk by an earlier session, then loaded from disk (no mtime touch).
        fixture.mediaFiles.set('old.jpg', new Uint8Array(10).fill(1));
        const seeding = createMediaThumbnailManager({ platform: 'native', native: nativeAdapter, getPixelRatio: () => 2 });
        await seeding.load('old.jpg');
        const manager = createMediaThumbnailManager({
            platform: 'native', native: nativeAdapter, getPixelRatio: () => 2, maxPersistentEntries: 5,
        });
        const shown = await manager.load('old.jpg');
        expect(shown).toBeTruthy();
        // 25 new derivatives trigger a prune down to 5 files.
        for (let i = 0; i < 25; i += 1) {
            fixture.mediaFiles.set(`n${i}.jpg`, new Uint8Array(10).fill(2));
            await manager.load(`n${i}.jpg`);
        }
        expect(fixture.cacheFiles.has(shown!)).toBe(true);
        expect(manager.getCached('old.jpg')).toBe(shown);
    });

    it('serves current media to a row that aborted and reloaded while the replaced decode still ran', async () => {
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(1000).fill(1));
        const generate = nativeAdapter.generateDerivative;
        let finishDecode!: () => void;
        let first = true;
        nativeAdapter.generateDerivative = async (...args) => {
            if (first) {
                first = false;
                await new Promise<void>((resolve) => { finishDecode = resolve; });
            }
            return generate(...args);
        };
        const manager = createMediaThumbnailManager({ platform: 'native', native: nativeAdapter, getPixelRatio: () => 2 });
        // The mounted row's first load is aborted when it hears about the invalidation...
        const controller = new AbortController();
        const stale = manager.load('heart.jpg', { signal: controller.signal });
        await vi.waitFor(() => expect(finishDecode).toBeDefined());
        fixture.mediaFiles.set('heart.jpg', new Uint8Array(1000).fill(2));
        await manager.invalidate(['heart.jpg']);
        controller.abort();
        // ...and its fresh load must not join the decode of the replaced file.
        const fresh = manager.load('heart.jpg');
        finishDecode();
        await stale;
        expect(await fresh).toContain('tus-media-thumbs');
        expect(generateCalls).toHaveLength(2);
    });
});

describe('web thumbnail derivative cache, memory bounds and URL revocation', () => {
    it('retries current media and removes stale disk data when invalidation races a cache write', async () => {
        let source = new Blob(['old'], { type: 'image/jpeg' });
        const records = new Map<string, WebThumbnailRecord>();
        let finishWrite!: () => void;
        let writes = 0;
        const web: WebThumbnailAdapter = {
            readOriginalBlob: async () => source,
            readCachedRecord: async (key) => records.get(key) ?? null,
            writeCachedRecord: async (key, record) => {
                if (++writes === 1) await new Promise<void>((resolve) => { finishWrite = resolve; });
                records.set(key, record);
            },
            deleteCachedByPrefix: async (prefix) => {
                for (const key of records.keys()) if (key.startsWith(prefix)) records.delete(key);
            },
            clearCache: async () => { records.clear(); },
            pruneCache: async () => {},
            encodeDerivativeBlob: async (blob) => new Blob([`thumb:${await blob.text()}`]),
            createObjectUrl: () => 'blob:current',
            revokeObjectUrl: () => {},
        };
        const manager = createMediaThumbnailManager({ platform: 'web', web, getPixelRatio: () => 2 });
        const pending = manager.load('heart.jpg');
        await vi.waitFor(() => expect(finishWrite).toBeDefined());
        // Same byte length: freshness cannot be inferred from sourceSize after the race.
        source = new Blob(['new'], { type: 'image/jpeg' });
        await manager.invalidate(['heart.jpg']);
        finishWrite();

        expect(await pending).toBe('blob:current');
        expect(await records.get('heart.jpg::88')!.blob.text()).toBe('thumb:new');
        expect(writes).toBe(2);
    });

    it('reuses persistent derivatives without full-res decode and revokes evicted object URLs', async () => {
        const originalStore = new Map<string, Blob>();
        const thumbStore = new Map<string, WebThumbnailRecord>();
        const revokedUrls: string[] = [];
        let encodeCount = 0;
        let urlSeq = 0;

        for (let i = 1; i <= 4; i += 1) {
            originalStore.set(`img_${i}.jpg`, new Blob([new Uint8Array(10_000 + i)], { type: 'image/jpeg' }));
        }

        const webAdapter: WebThumbnailAdapter = {
            readOriginalBlob: async (filename) => originalStore.get(filename) ?? null,
            readCachedRecord: async (key) => thumbStore.get(key) ?? null,
            writeCachedRecord: async (key, record) => { thumbStore.set(key, record); },
            deleteCachedByPrefix: async (prefix) => {
                for (const key of [...thumbStore.keys()]) {
                    if (key.startsWith(prefix)) thumbStore.delete(key);
                }
            },
            pruneCache: async () => {},
            clearCache: async () => { thumbStore.clear(); },
            encodeDerivativeBlob: async (_sourceBlob, targetEdge) => {
                encodeCount += 1;
                return new Blob([`thumb-${targetEdge}-${encodeCount}`], { type: 'image/webp' });
            },
            createObjectUrl: () => `blob:thumb-${++urlSeq}`,
            revokeObjectUrl: (url) => { revokedUrls.push(url); },
        };

        const manager = createMediaThumbnailManager({
            platform: 'web',
            getPixelRatio: () => 2,
            maxMemoryEntries: 2,
            web: webAdapter,
        });

        const u1 = await manager.load('img_1.jpg');
        const u2 = await manager.load('img_2.jpg');
        expect(u1).toBe('blob:thumb-1');
        expect(u2).toBe('blob:thumb-2');
        expect(encodeCount).toBe(2);

        // Loading a 3rd thumbnail evicts img_1 from memory LRU and revokes its object URL!
        const u3 = await manager.load('img_3.jpg');
        expect(u3).toBe('blob:thumb-3');
        expect(manager.memoryCacheSize).toBe(2);
        expect(revokedUrls).toEqual(['blob:thumb-1']);

        // Reloading img_1 hits the persistent tus-media-thumbs store — ZERO full-res re-encode!
        const u1Again = await manager.load('img_1.jpg');
        expect(u1Again).toBe('blob:thumb-4');
        expect(encodeCount).toBe(3); // unchanged!
        expect(revokedUrls).toEqual(['blob:thumb-1', 'blob:thumb-2']);

        // Clearing the derivative cache regenerates img_1 cleanly from original tus-media.
        await manager.clearAll();
        expect(thumbStore.size).toBe(0);
        const u1Rebuilt = await manager.load('img_1.jpg');
        expect(u1Rebuilt).toBe('blob:thumb-5');
        expect(encodeCount).toBe(4);
        // Original store was never mutated.
        expect(originalStore.size).toBe(4);
    });
});
