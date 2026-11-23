/**
 * Local downscaled thumbnail derivatives for Kartlarım (card browser).
 *
 * Isolation guarantee:
 * - Original collection media (`documentDirectory/tus-media/` on iOS, IndexedDB `tus-media` on
 *   web) is strictly read-only here. Its bytes, hashes, Check Media accounting and `.apkg` exports
 *   never change.
 * - Derivatives live in disposable caches (`cacheDirectory/tus-media-thumbs/` on iOS, a separate
 *   IndexedDB `tus-media-thumbs` on web). Deleting them is always safe: any missing derivative is
 *   regenerated from the original on demand.
 */

import { PixelRatio, Platform } from 'react-native';
import {
    LruThumbnailCache,
    ThumbnailTaskQueue,
    computeThumbnailDimensions,
    shouldPreserveThumbnailAlpha,
    thumbnailCacheFilename,
    thumbnailTargetEdge,
} from './browserThumbnail';
import { getLegacyFileSystem, toFileUri } from './files';
import {
    ensureMediaDir,
    onMediaChanged,
    readWebMediaBlob,
    sanitizeMediaFilename,
} from './mediaStore';

export const NATIVE_THUMBNAIL_SUBDIR = 'tus-media-thumbs/';
export const WEB_THUMBNAIL_DB = 'tus-media-thumbs';
export const WEB_THUMBNAIL_STORE = 'thumbs';

export const MAX_MEMORY_THUMBNAILS = 160;
export const MAX_PERSISTENT_THUMBNAILS = 400;
export const THUMBNAIL_JPEG_QUALITY = 0.78;
/** Original blobs already within target dimensions and below this byte size need no re-encode. */
const SMALL_BLOB_PASSTHROUGH_BYTES = 16_384;

export interface WebThumbnailRecord {
    blob: Blob;
    sourceSize: number;
    targetEdge: number;
    updatedAt: number;
}

export interface NativeMediaFileInfo {
    exists: boolean;
    size?: number;
    modificationTime?: number;
}

export interface NativeThumbnailAdapter {
    getSourceUri: (filename: string) => Promise<string | null>;
    getCacheDir: () => Promise<string | null>;
    getFileInfo: (uri: string) => Promise<NativeMediaFileInfo>;
    generateDerivative: (
        sourceUri: string,
        destUri: string,
        targetEdge: number,
        preserveAlpha: boolean,
    ) => Promise<boolean>;
    listCacheFiles: (cacheDir: string) => Promise<string[]>;
    deleteFile: (uri: string) => Promise<void>;
    clearCacheDir: (cacheDir: string) => Promise<void>;
}

export interface WebThumbnailAdapter {
    readOriginalBlob: (filename: string) => Promise<Blob | null>;
    readCachedRecord: (key: string) => Promise<WebThumbnailRecord | null>;
    writeCachedRecord: (key: string, record: WebThumbnailRecord) => Promise<void>;
    deleteCachedByPrefix: (filenamePrefix: string) => Promise<void>;
    pruneCache: (maxEntries: number) => Promise<void>;
    clearCache: () => Promise<void>;
    encodeDerivativeBlob: (
        sourceBlob: Blob,
        targetEdge: number,
        preserveAlpha: boolean,
    ) => Promise<Blob | null>;
    createObjectUrl: (blob: Blob) => string;
    revokeObjectUrl: (url: string) => void;
}

export interface MediaThumbnailManagerDeps {
    platform: 'web' | 'native';
    getPixelRatio?: () => number;
    maxMemoryEntries?: number;
    maxPersistentEntries?: number;
    maxConcurrent?: number;
    native?: NativeThumbnailAdapter;
    web?: WebThumbnailAdapter;
}

export interface MediaThumbnailManager {
    getDefaultTargetEdge: () => number;
    getCached: (filename: string, targetEdge?: number) => string | null | undefined;
    load: (
        filename: string,
        options?: { targetEdge?: number; signal?: AbortSignal },
    ) => Promise<string | null>;
    invalidate: (filenames: readonly string[]) => Promise<void>;
    clearAll: () => Promise<void>;
    readonly memoryCacheSize: number;
}

function memoryKey(safeFilename: string, targetEdge: number): string {
    return `${safeFilename}\0${targetEdge}`;
}

function webRecordKey(safeFilename: string, targetEdge: number): string {
    return `${safeFilename}::${targetEdge}`;
}

// ---------- Default Web IndexedDB & Canvas helpers ----------

let thumbIdbPromise: Promise<IDBDatabase> | null = null;

function openThumbDb(): Promise<IDBDatabase> {
    if (thumbIdbPromise) return thumbIdbPromise;
    thumbIdbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(WEB_THUMBNAIL_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WEB_THUMBNAIL_STORE)) {
                request.result.createObjectStore(WEB_THUMBNAIL_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            thumbIdbPromise = null;
            reject(request.error ?? new Error('Thumbnail IndexedDB open failed'));
        };
    });
    return thumbIdbPromise;
}

async function thumbIdbGet(key: string): Promise<WebThumbnailRecord | null> {
    if (typeof indexedDB === 'undefined') return null;
    try {
        const db = await openThumbDb();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(WEB_THUMBNAIL_STORE, 'readonly')
                .objectStore(WEB_THUMBNAIL_STORE)
                .get(key);
            req.onsuccess = () => {
                const value = req.result as Partial<WebThumbnailRecord> | undefined;
                if (value && value.blob instanceof Blob && typeof value.sourceSize === 'number') {
                    resolve(value as WebThumbnailRecord);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => reject(req.error ?? new Error('Thumbnail IndexedDB read failed'));
        });
    } catch {
        return null;
    }
}

async function thumbIdbPut(key: string, record: WebThumbnailRecord): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openThumbDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(WEB_THUMBNAIL_STORE, 'readwrite');
            tx.objectStore(WEB_THUMBNAIL_STORE).put(record, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Thumbnail IndexedDB write failed'));
            tx.onabort = () => reject(tx.error ?? new Error('Thumbnail IndexedDB write aborted'));
        });
    } catch {
        // Cache writes are best-effort; memory cache still serves the current session.
    }
}

async function thumbIdbDeleteByPrefix(prefix: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openThumbDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(WEB_THUMBNAIL_STORE, 'readwrite');
            const store = tx.objectStore(WEB_THUMBNAIL_STORE);
            const keysReq = store.getAllKeys();
            keysReq.onsuccess = () => {
                for (const key of keysReq.result) {
                    if (typeof key === 'string' && key.startsWith(prefix)) {
                        store.delete(key);
                    }
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Thumbnail IndexedDB delete failed'));
            tx.onabort = () => reject(tx.error ?? new Error('Thumbnail IndexedDB delete aborted'));
        });
    } catch {
        // Ignore best-effort cleanup errors.
    }
}

async function thumbIdbPrune(maxEntries: number): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openThumbDb();
        const entries: Array<{ key: string; updatedAt: number }> = await new Promise((resolve, reject) => {
            const out: Array<{ key: string; updatedAt: number }> = [];
            const tx = db.transaction(WEB_THUMBNAIL_STORE, 'readonly');
            const req = tx.objectStore(WEB_THUMBNAIL_STORE).openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) {
                    resolve(out);
                    return;
                }
                const val = cursor.value as Partial<WebThumbnailRecord> | undefined;
                if (typeof cursor.key === 'string') {
                    out.push({ key: cursor.key, updatedAt: typeof val?.updatedAt === 'number' ? val.updatedAt : 0 });
                }
                cursor.continue();
            };
            req.onerror = () => reject(req.error ?? new Error('Thumbnail IndexedDB cursor failed'));
        });
        if (entries.length <= maxEntries) return;
        entries.sort((a, b) => a.updatedAt - b.updatedAt);
        const drop = entries.slice(0, entries.length - maxEntries);
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(WEB_THUMBNAIL_STORE, 'readwrite');
            const store = tx.objectStore(WEB_THUMBNAIL_STORE);
            for (const entry of drop) store.delete(entry.key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Thumbnail IndexedDB prune failed'));
            tx.onabort = () => reject(tx.error ?? new Error('Thumbnail IndexedDB prune aborted'));
        });
    } catch {
        // Ignore best-effort prune errors.
    }
}

async function thumbIdbClear(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
        const db = await openThumbDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(WEB_THUMBNAIL_STORE, 'readwrite');
            tx.objectStore(WEB_THUMBNAIL_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('Thumbnail IndexedDB clear failed'));
            tx.onabort = () => reject(tx.error ?? new Error('Thumbnail IndexedDB clear aborted'));
        });
    } catch {
        // Ignore best-effort clear errors.
    }
}

async function encodeWebThumbnailBlob(
    sourceBlob: Blob,
    targetEdge: number,
    preserveAlpha: boolean,
): Promise<Blob | null> {
    let source: ImageBitmap | HTMLImageElement | null = null;
    let tempUrl: string | null = null;
    let srcWidth = 0;
    let srcHeight = 0;

    try {
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(sourceBlob);
            source = bitmap;
            srcWidth = bitmap.width;
            srcHeight = bitmap.height;
        } else if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
            tempUrl = URL.createObjectURL(sourceBlob);
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const element = new Image();
                element.onload = () => resolve(element);
                element.onerror = () => reject(new Error('Image decode failed'));
                element.src = tempUrl!;
            });
            source = img;
            srcWidth = img.naturalWidth || img.width;
            srcHeight = img.naturalHeight || img.height;
        } else {
            return null;
        }

        const dims = computeThumbnailDimensions(srcWidth, srcHeight, targetEdge);
        if (!dims) return null;

        if (!dims.resized && sourceBlob.size <= SMALL_BLOB_PASSTHROUGH_BYTES) {
            return sourceBlob;
        }

        const mimeCandidates = preserveAlpha
            ? ['image/webp', 'image/png']
            : ['image/webp', 'image/jpeg'];

        if (typeof OffscreenCanvas !== 'undefined') {
            const canvas = new OffscreenCanvas(dims.width, dims.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
            ctx.drawImage(source, 0, 0, dims.width, dims.height);
            for (const type of mimeCandidates) {
                try {
                    const out = await canvas.convertToBlob({ type, quality: THUMBNAIL_JPEG_QUALITY });
                    if (out && out.size > 0) return out;
                } catch {
                    // Try next format.
                }
            }
            return null;
        }

        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = dims.width;
            canvas.height = dims.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
            ctx.drawImage(source, 0, 0, dims.width, dims.height);
            for (const type of mimeCandidates) {
                const out = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob((result) => resolve(result), type, THUMBNAIL_JPEG_QUALITY);
                });
                if (out && out.size > 0) return out;
            }
        }
        return null;
    } catch {
        return null;
    } finally {
        if (source && 'close' in source && typeof source.close === 'function') {
            source.close();
        }
        if (tempUrl && typeof URL !== 'undefined') {
            URL.revokeObjectURL(tempUrl);
        }
    }
}

const defaultWebAdapter: WebThumbnailAdapter = {
    readOriginalBlob: readWebMediaBlob,
    readCachedRecord: thumbIdbGet,
    writeCachedRecord: thumbIdbPut,
    deleteCachedByPrefix: thumbIdbDeleteByPrefix,
    pruneCache: thumbIdbPrune,
    clearCache: thumbIdbClear,
    encodeDerivativeBlob: encodeWebThumbnailBlob,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => {
        if (typeof URL !== 'undefined' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    },
};

// ---------- Default Native (iOS) filesystem & ImageManipulator helpers ----------

const defaultNativeAdapter: NativeThumbnailAdapter = {
    async getSourceUri(filename: string): Promise<string | null> {
        const dir = await ensureMediaDir();
        return dir ? `${dir}${filename}` : null;
    },
    async getCacheDir(): Promise<string | null> {
        const fs = getLegacyFileSystem();
        if (!fs.cacheDirectory) return null;
        const dir = `${fs.cacheDirectory}${NATIVE_THUMBNAIL_SUBDIR}`;
        try {
            const info = await fs.getInfoAsync(dir);
            if (!info.exists) {
                await fs.makeDirectoryAsync(dir, { intermediates: true });
            }
            return dir;
        } catch {
            try {
                await fs.makeDirectoryAsync(dir, { intermediates: true });
                return dir;
            } catch {
                return null;
            }
        }
    },
    async getFileInfo(uri: string): Promise<NativeMediaFileInfo> {
        try {
            const info = await getLegacyFileSystem().getInfoAsync(uri);
            if (!info.exists) return { exists: false };
            return {
                exists: true,
                size: 'size' in info && typeof info.size === 'number' ? info.size : undefined,
                modificationTime: 'modificationTime' in info && typeof info.modificationTime === 'number'
                    ? info.modificationTime
                    : undefined,
            };
        } catch {
            return { exists: false };
        }
    },
    async generateDerivative(
        sourceUri: string,
        destUri: string,
        targetEdge: number,
        preserveAlpha: boolean,
    ): Promise<boolean> {
        const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
        const fs = getLegacyFileSystem();
        const context = ImageManipulator.manipulate(toFileUri(sourceUri));
        let upright: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
        let resizer: ReturnType<typeof ImageManipulator.manipulate> | null = null;
        let output: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
        try {
            upright = await context.renderAsync();
            const dims = computeThumbnailDimensions(upright.width, upright.height, targetEdge);
            if (!dims) return false;
            if (dims.resized) {
                resizer = ImageManipulator.manipulate(upright).resize({
                    width: dims.width,
                    height: dims.height,
                });
                output = await resizer.renderAsync();
            } else {
                output = upright;
            }
            const saved = await output.saveAsync({
                format: preserveAlpha ? SaveFormat.PNG : SaveFormat.JPEG,
                compress: THUMBNAIL_JPEG_QUALITY,
            });
            try {
                await fs.deleteAsync(destUri, { idempotent: true });
                await fs.moveAsync({ from: saved.uri, to: destUri });
            } catch {
                await fs.copyAsync({ from: saved.uri, to: destUri });
                await fs.deleteAsync(saved.uri, { idempotent: true });
            }
            return true;
        } catch (error) {
            console.warn('[mediaThumbnails] native derivative generation failed:', error);
            return false;
        } finally {
            if (output && output !== upright) output.release();
            resizer?.release();
            upright?.release();
            context.release();
        }
    },
    async listCacheFiles(cacheDir: string): Promise<string[]> {
        try {
            return await getLegacyFileSystem().readDirectoryAsync(cacheDir);
        } catch {
            return [];
        }
    },
    async deleteFile(uri: string): Promise<void> {
        try {
            await getLegacyFileSystem().deleteAsync(uri, { idempotent: true });
        } catch {
            // Best-effort cleanup.
        }
    },
    async clearCacheDir(cacheDir: string): Promise<void> {
        try {
            const fs = getLegacyFileSystem();
            await fs.deleteAsync(cacheDir, { idempotent: true });
            await fs.makeDirectoryAsync(cacheDir, { intermediates: true });
        } catch {
            // Best-effort cleanup.
        }
    },
};

// ---------- Manager factory ----------

/** Creates an isolated thumbnail derivative manager (used both by the app singleton and unit tests). */
export function createMediaThumbnailManager(deps: MediaThumbnailManagerDeps): MediaThumbnailManager {
    const isWeb = deps.platform === 'web';
    const maxMemory = deps.maxMemoryEntries ?? MAX_MEMORY_THUMBNAILS;
    const maxPersistent = deps.maxPersistentEntries ?? MAX_PERSISTENT_THUMBNAILS;
    const maxConcurrent = deps.maxConcurrent ?? (isWeb ? 3 : 2);
    const getPixelRatio = deps.getPixelRatio ?? (() => (typeof PixelRatio?.get === 'function' ? PixelRatio.get() : 2));
    const web = deps.web ?? defaultWebAdapter;
    const native = deps.native ?? defaultNativeAdapter;

    const memoryCache = new LruThumbnailCache<string | null>(maxMemory, (evictedUri) => {
        if (isWeb && evictedUri) {
            web.revokeObjectUrl(evictedUri);
        }
    });
    const queue = new ThumbnailTaskQueue<string | null>(maxConcurrent);
    // A new decode must not read a persistent entry while its invalidation is still deleting it.
    let pendingCleanup = Promise.resolve();
    const cleanup = (work: () => Promise<void>) => {
        const task = pendingCleanup.then(work);
        pendingCleanup = task.catch(() => {});
        return task;
    };
    const waitForCleanup = async () => {
        let pending;
        do {
            pending = pendingCleanup;
            await pending;
        } while (pending !== pendingCleanup);
    };
    let writesSincePrune = 0;
    const PRUNE_INTERVAL = 25;
    // Track per-filename and global invalidations so an in-flight decode cannot repopulate
    // memoryCache with a pre-invalidation derivative or null miss.
    let globalGeneration = 0;
    const fileGenerations = new Map<string, number>();
    const currentGeneration = (safe: string) => (fileGenerations.get(safe) ?? 0) + globalGeneration;
    const storeInMemoryIfFresh = (safe: string, edge: number, value: string | null, startGen: number): string | null => {
        if (currentGeneration(safe) !== startGen) {
            if (isWeb && value) web.revokeObjectUrl(value);
            return null;
        }
        memoryCache.set(memoryKey(safe, edge), value);
        return value;
    };

    function getDefaultTargetEdge(): number {
        return thumbnailTargetEdge(getPixelRatio());
    }

    function getCached(filename: string, targetEdge?: number): string | null | undefined {
        const safe = sanitizeMediaFilename(filename);
        if (!safe) return null;
        const edge = targetEdge ?? getDefaultTargetEdge();
        return memoryCache.get(memoryKey(safe, edge));
    }

    async function maybePruneNative(cacheDir: string): Promise<void> {
        writesSincePrune += 1;
        if (writesSincePrune < PRUNE_INTERVAL) return;
        writesSincePrune = 0;
        const files = await native.listCacheFiles(cacheDir);
        if (files.length <= maxPersistent) return;
        const withTimes = await Promise.all(
            files.map(async (name) => {
                const uri = `${cacheDir}${name}`;
                const info = await native.getFileInfo(uri);
                return { uri, mtime: info.modificationTime ?? 0 };
            }),
        );
        withTimes.sort((a, b) => a.mtime - b.mtime);
        // A disk hit never touches mtime, so the derivatives rows are showing right now from
        // memory are often the oldest files. Deleting them would hand mounted rows dead URIs.
        const inUse = new Set(memoryCache.values().filter((value): value is string => typeof value === 'string'));
        const excess = withTimes
            .filter((entry) => !inUse.has(entry.uri))
            .slice(0, Math.max(0, withTimes.length - maxPersistent));
        await Promise.all(excess.map((entry) => native.deleteFile(entry.uri)));
    }

    async function maybePruneWeb(): Promise<void> {
        writesSincePrune += 1;
        if (writesSincePrune < PRUNE_INTERVAL) return;
        writesSincePrune = 0;
        await web.pruneCache(maxPersistent);
    }

    async function resolveWebThumbnail(safe: string, edge: number): Promise<string | null> {
        await waitForCleanup();
        const startGen = currentGeneration(safe);
        const sourceBlob = await web.readOriginalBlob(safe);
        if (!sourceBlob) {
            return storeInMemoryIfFresh(safe, edge, null, startGen);
        }

        const recordKey = webRecordKey(safe, edge);
        const cachedRecord = await web.readCachedRecord(recordKey);
        if (
            cachedRecord
            && cachedRecord.sourceSize === sourceBlob.size
            && cachedRecord.targetEdge === edge
        ) {
            const url = web.createObjectUrl(cachedRecord.blob);
            return storeInMemoryIfFresh(safe, edge, url, startGen);
        }

        const preserveAlpha = shouldPreserveThumbnailAlpha(safe);
        const derivative = await web.encodeDerivativeBlob(sourceBlob, edge, preserveAlpha);
        if (!derivative) {
            return storeInMemoryIfFresh(safe, edge, null, startGen);
        }
        if (currentGeneration(safe) !== startGen) return null;

        await web.writeCachedRecord(recordKey, {
            blob: derivative,
            sourceSize: sourceBlob.size,
            targetEdge: edge,
            updatedAt: Date.now(),
        });
        if (currentGeneration(safe) !== startGen) {
            // Invalidation may have finished before this older write committed. Leaving it
            // on disk would serve the old picture on the next load when byte sizes match.
            await cleanup(() => web.deleteCachedByPrefix(`${safe}::`));
            return null;
        }
        void maybePruneWeb();

        const url = web.createObjectUrl(derivative);
        return storeInMemoryIfFresh(safe, edge, url, startGen);
    }

    async function resolveNativeThumbnail(safe: string, edge: number): Promise<string | null> {
        await waitForCleanup();
        const startGen = currentGeneration(safe);
        const sourceUri = await native.getSourceUri(safe);
        if (!sourceUri) {
            return storeInMemoryIfFresh(safe, edge, null, startGen);
        }

        const sourceInfo = await native.getFileInfo(sourceUri);
        if (!sourceInfo.exists) {
            return storeInMemoryIfFresh(safe, edge, null, startGen);
        }

        const cacheDir = await native.getCacheDir();
        if (!cacheDir) return null;

        const preserveAlpha = shouldPreserveThumbnailAlpha(safe);
        const ext: 'png' | 'jpg' = preserveAlpha ? 'png' : 'jpg';
        const fingerprint = `${sourceInfo.size ?? 0}_${sourceInfo.modificationTime ?? 0}`;
        const thumbUri = `${cacheDir}${thumbnailCacheFilename(safe, edge, fingerprint, ext)}`;

        const existingThumb = await native.getFileInfo(thumbUri);
        if (existingThumb.exists) {
            return storeInMemoryIfFresh(safe, edge, thumbUri, startGen);
        }

        const ok = await native.generateDerivative(sourceUri, thumbUri, edge, preserveAlpha);
        if (!ok) {
            return storeInMemoryIfFresh(safe, edge, null, startGen);
        }
        if (currentGeneration(safe) !== startGen) {
            await cleanup(() => native.deleteFile(thumbUri));
            return null;
        }

        void maybePruneNative(cacheDir);
        return storeInMemoryIfFresh(safe, edge, thumbUri, startGen);
    }

    async function load(
        filename: string,
        options: { targetEdge?: number; signal?: AbortSignal } = {},
    ): Promise<string | null> {
        if (options.signal?.aborted) return null;
        const safe = sanitizeMediaFilename(filename);
        if (!safe) return null;
        await waitForCleanup();
        if (options.signal?.aborted) return null;

        const edge = options.targetEdge ?? getDefaultTargetEdge();
        const key = memoryKey(safe, edge);
        const cached = memoryCache.get(key);
        if (cached !== undefined) return cached;

        const generation = currentGeneration(safe);
        // The queue shares one job between waiters with the same key. Keying it by generation
        // keeps a load that starts after an invalidation from joining a decode still running for
        // the replaced media, whose stale result would come back as null (a permanent fallback).
        const result = await queue.enqueue(
            `${key}\0g${generation}`,
            () => (isWeb ? resolveWebThumbnail(safe, edge) : resolveNativeThumbnail(safe, edge)),
            options.signal,
        );
        // The row is still waiting: serve current media rather than a stale result or a
        // permanent fallback caused by a concurrent media replacement/cache clear.
        return currentGeneration(safe) === generation ? result : load(safe, options);
    }

    async function invalidate(filenames: readonly string[]): Promise<void> {
        const safeNames = filenames.map(sanitizeMediaFilename).filter(Boolean);
        if (safeNames.length === 0) return;

        for (const name of safeNames) {
            fileGenerations.set(name, (fileGenerations.get(name) ?? 0) + 1);
        }

        const evictedUris: string[] = [];
        const nameSet = new Set(safeNames);
        memoryCache.deleteMatching((key, value) => {
            const sep = key.indexOf('\0');
            const file = sep >= 0 ? key.slice(0, sep) : key;
            if (!nameSet.has(file)) return false;
            if (!isWeb && value) evictedUris.push(value);
            return true;
        });

        if (isWeb) {
            await cleanup(async () => { await Promise.all(safeNames.map((name) => web.deleteCachedByPrefix(`${name}::`))); });
        } else {
            await cleanup(async () => { await Promise.all(evictedUris.map((uri) => native.deleteFile(uri))); });
        }
    }

    async function clearAll(): Promise<void> {
        globalGeneration += 1;
        memoryCache.clear();
        writesSincePrune = 0;
        await cleanup(async () => {
            if (isWeb) await web.clearCache();
            else {
                const cacheDir = await native.getCacheDir();
                if (cacheDir) await native.clearCacheDir(cacheDir);
            }
        });
    }

    return {
        getDefaultTargetEdge,
        getCached,
        load,
        invalidate,
        clearAll,
        get memoryCacheSize() {
            return memoryCache.size;
        },
    };
}

// ---------- App singleton ----------

const defaultManager = createMediaThumbnailManager({
    platform: Platform.OS === 'web' ? 'web' : 'native',
});

if (typeof onMediaChanged === 'function') {
    onMediaChanged((filenames) => {
        void invalidateMediaThumbnails(filenames).catch((error) => console.warn('[mediaThumbnails] invalidation failed:', error));
    });
}

export function getDefaultThumbnailEdge(): number {
    return defaultManager.getDefaultTargetEdge();
}

export function getCachedBrowserThumbnail(filename: string, targetEdge?: number): string | null | undefined {
    return defaultManager.getCached(filename, targetEdge);
}

export function loadBrowserThumbnail(
    filename: string,
    options?: { targetEdge?: number; signal?: AbortSignal },
): Promise<string | null> {
    return defaultManager.load(filename, options);
}

type ThumbnailInvalidationListener = (filenames: readonly string[] | null) => void;
const invalidationListeners = new Set<ThumbnailInvalidationListener>();

/** null means the whole derivative cache was cleared; notify only after stale entries are gone. */
export function onBrowserThumbnailsInvalidated(listener: ThumbnailInvalidationListener): () => void {
    invalidationListeners.add(listener);
    return () => { invalidationListeners.delete(listener); };
}

function notifyInvalidation(filenames: readonly string[] | null): void {
    for (const listener of invalidationListeners) {
        try { listener(filenames); }
        catch (error) { console.warn('[mediaThumbnails] listener failed:', error); }
    }
}

export async function invalidateMediaThumbnails(filenames: readonly string[]): Promise<void> {
    await defaultManager.invalidate(filenames);
    notifyInvalidation(filenames);
}

export async function clearMediaThumbnailCache(): Promise<void> {
    await defaultManager.clearAll();
    notifyInvalidation(null);
}
