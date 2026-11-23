/**
 * Pure logic for Kartlarım (card browser) visual thumbnails: extracting the local image a card or
 * note refers to, sizing downscaled derivatives for Retina and web screens, bounded LRU caching,
 * and bounded-concurrency/cancelable task scheduling so scrolling through image-heavy decks stays
 * smooth without ever modifying original media.
 */

import { imageOcclusionFields } from './imageOcclusionNoteType';
import { localMediaFilename } from './mediaAttachment';
import type { NoteType } from './models';
import type { StudyCard } from './types';

/** Display size (dp / CSS px) of a row thumbnail square in Kartlarım. */
export const BROWSER_THUMBNAIL_DISPLAY_SIZE = 42;

/** Derivative short-edge target (px) for 1x/2x displays (matches 44px @ 2x). */
export const THUMBNAIL_EDGE_STANDARD = 88;

/** Derivative short-edge target (px) for 3x iPhone Retina displays (44px @ 3x). */
export const THUMBNAIL_EDGE_RETINA = 132;

/** Maximum long-edge multiplier relative to `targetEdge` to keep panoramic images bounded. */
const MAX_LONG_EDGE_MULTIPLIER = 2;

/**
 * Raster image extensions safe to decode as thumbnails across iOS and web.
 * SVG is deliberately excluded: it is markup (not a raster bitmap), cannot be drawn by React
 * Native's `<Image>` on iOS, and carries untrusted-document concerns handled by the WebView boundary.
 */
const PREVIEWABLE_RASTER_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'ico',
]);

/** Raster formats that may carry an alpha channel and should not be flattened onto opaque black. */
const ALPHA_CAPABLE_EXTENSIONS = new Set([
    'png', 'gif', 'webp', 'avif', 'ico',
]);

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i;
const EXTENSION_RE = /\.([A-Za-z0-9]{1,6})$/;

function fileExtension(filename: string): string {
    const match = EXTENSION_RE.exec(filename.trim());
    return match ? match[1].toLowerCase() : '';
}

/** True when a local media filename is a raster image that can be turned into a row thumbnail. */
export function isPreviewableThumbnailFilename(filename: string): boolean {
    const trimmed = filename.trim();
    if (!trimmed) return false;
    const ext = fileExtension(trimmed);
    // Anki occasionally stores pasted images without an extension; allow extensionless local
    // image refs from `<img src>`, while rejecting known non-raster extensions like `.svg`/`.pdf`.
    if (!ext) return true;
    return PREVIEWABLE_RASTER_EXTENSIONS.has(ext);
}

/** True when the thumbnail format should preserve alpha instead of flattening to opaque JPEG. */
export function shouldPreserveThumbnailAlpha(filename: string): boolean {
    const ext = fileExtension(filename);
    if (!ext) return true;
    return ALPHA_CAPABLE_EXTENSIONS.has(ext);
}

/** Quantized derivative target edge in pixels for the device's pixel density. */
export function thumbnailTargetEdge(pixelRatio: number): number {
    if (!Number.isFinite(pixelRatio) || pixelRatio < 2.5) return THUMBNAIL_EDGE_STANDARD;
    return THUMBNAIL_EDGE_RETINA;
}

export interface ThumbnailDimensions {
    width: number;
    height: number;
    resized: boolean;
}

/**
 * Target pixel dimensions for a square-framed (`resizeMode="cover"`) thumbnail derivative.
 *
 * - Never upscales an image that is already small.
 * - Preserves aspect ratio (no stretching).
 * - Aims for the shorter side to reach `targetEdge` so non-square photos stay crisp inside a
 *   square `cover` frame, while capping the longer side at `targetEdge * 2` so very wide ECG
 *   strips or tall diagrams stay tiny in memory and storage.
 */
export function computeThumbnailDimensions(
    srcWidth: number,
    srcHeight: number,
    targetEdge: number,
): ThumbnailDimensions | null {
    if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || !Number.isFinite(targetEdge)) {
        return null;
    }
    if (srcWidth <= 0 || srcHeight <= 0 || targetEdge <= 0) return null;

    const w = Math.round(srcWidth);
    const h = Math.round(srcHeight);
    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);

    if (maxDim <= targetEdge) {
        return { width: w, height: h, resized: false };
    }

    const maxLongEdge = Math.max(targetEdge, Math.round(targetEdge * MAX_LONG_EDGE_MULTIPLIER));
    const scaleForShortEdge = targetEdge / minDim;
    const scaleForLongEdge = maxLongEdge / maxDim;
    const scale = Math.min(1, scaleForShortEdge, scaleForLongEdge);

    if (scale >= 1) {
        return { width: w, height: h, resized: false };
    }

    const outWidth = Math.max(1, Math.round(w * scale));
    const outHeight = Math.max(1, Math.round(h * scale));
    return {
        width: outWidth,
        height: outHeight,
        resized: outWidth < w || outHeight < h,
    };
}

/** First local, previewable raster image filename referenced by an `<img>` tag in this HTML. */
export function extractFirstImageFilenameFromHtml(html: string | null | undefined): string | null {
    if (typeof html !== 'string' || !html) return null;
    // Fast reject before regex scan for plain-text cards (the common case during fast scrolling).
    if (!html.includes('<img') && !html.includes('<IMG') && !/<img\b/i.test(html)) return null;

    IMG_TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMG_TAG_RE.exec(html)) !== null) {
        const srcMatch = SRC_ATTR_RE.exec(match[0]);
        if (!srcMatch) continue;
        const rawSrc = srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '';
        const localName = localMediaFilename(rawSrc);
        if (localName && isPreviewableThumbnailFilename(localName)) {
            return localName;
        }
    }
    return null;
}

/**
 * Pick the representative local image filename for a browser card/note row, or null when the
 * card has no local previewable image.
 *
 * Image Occlusion notes store their masks in field 0 (`Occlusion`) and optional title in `Header`,
 * while the picture lives in the `Image` field — check that field first so Image Occlusion rows
 * always preview their occluded diagram immediately.
 */
export function extractBrowserThumbnailFilename(
    card: Pick<StudyCard, 'question' | 'answer' | 'rawNote'>,
    noteType?: NoteType | null,
): string | null {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const push = (value: string | undefined) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        candidates.push(value);
    };

    const ioFields = imageOcclusionFields(noteType);
    if (ioFields && card.rawNote?.fields) {
        push(card.rawNote.fields[ioFields.image]);
    }

    push(card.question);
    push(card.answer);

    if (card.rawNote?.fields) {
        for (const field of card.rawNote.fields) {
            push(field);
        }
    }

    for (const candidate of candidates) {
        const filename = extractFirstImageFilenameFromHtml(candidate);
        if (filename) return filename;
    }
    return null;
}

/** Short cyrb53 hash for deterministic ASCII cache filenames without path separators. */
function hashString(input: string): string {
    let h1 = 0xdeadbeef ^ input.length;
    let h2 = 0x41c6ce57 ^ input.length;
    for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Deterministic derivative filename in the thumbnail cache directory.
 * Includes the original filename, target edge, and optional source file fingerprint (`size_mtime`)
 * so overwriting a media file under the same name automatically misses the old derivative.
 */
export function thumbnailCacheFilename(
    filename: string,
    targetEdge: number,
    sourceFingerprint: string = '',
    extension: 'jpg' | 'png' | 'webp' = shouldPreserveThumbnailAlpha(filename) ? 'png' : 'jpg',
): string {
    const hash = hashString(`${filename}\0${targetEdge}\0${sourceFingerprint}`);
    return `v1_${hash}_${targetEdge}.${extension}`;
}

/**
 * Memory-bounded LRU cache for resolved thumbnail URIs (or confirmed `null` misses).
 * Evicts the least-recently-used entry once `maxEntries` is exceeded and runs `onEvict` so web
 * callers can revoke displaced `blob:` object URLs.
 */
export class LruThumbnailCache<T> {
    private readonly entries = new Map<string, T>();
    private readonly maxEntries: number;
    private readonly onEvict?: (value: T, key: string) => void;

    constructor(maxEntries: number, onEvict?: (value: T, key: string) => void) {
        this.maxEntries = Math.max(1, Math.floor(maxEntries));
        this.onEvict = onEvict;
    }

    get size(): number {
        return this.entries.size;
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    get(key: string): T | undefined {
        if (!this.entries.has(key)) return undefined;
        const value = this.entries.get(key) as T;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    set(key: string, value: T): void {
        if (this.entries.has(key)) {
            const previous = this.entries.get(key) as T;
            this.entries.delete(key);
            if (previous !== value) this.onEvict?.(previous, key);
        }
        this.entries.set(key, value);
        while (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey === undefined) break;
            const oldestValue = this.entries.get(oldestKey) as T;
            this.entries.delete(oldestKey);
            this.onEvict?.(oldestValue, oldestKey);
        }
    }

    delete(key: string): boolean {
        if (!this.entries.has(key)) return false;
        const value = this.entries.get(key) as T;
        this.entries.delete(key);
        this.onEvict?.(value, key);
        return true;
    }

    /** Current values, oldest first, without changing their recency. */
    values(): T[] {
        return [...this.entries.values()];
    }

    deleteMatching(predicate: (key: string, value: T) => boolean): number {
        let removed = 0;
        for (const [key, value] of [...this.entries.entries()]) {
            if (predicate(key, value)) {
                this.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    clear(): void {
        if (this.onEvict) {
            for (const [key, value] of this.entries) {
                this.onEvict(value, key);
            }
        }
        this.entries.clear();
    }
}

interface QueuedThumbnailJob<T> {
    key: string;
    run: () => Promise<T>;
    started: boolean;
    waiters: Array<{
        resolve: (value: T | null) => void;
        signal?: AbortSignal;
        cleanup?: () => void;
    }>;
}

/**
 * Bounded-concurrency, deduplicated, cancelable LIFO work queue for thumbnail generation.
 *
 * - At most `maxConcurrent` images decode/resize simultaneously so scrolling never stalls the UI.
 * - Multiple rows sharing the same media filename (such as Image Occlusion siblings) join one job.
 * - LIFO order prioritizes rows that just entered the viewport after a fast fling.
 * - If every row waiting on a queued job unmounts/aborts before it starts, the job is dropped
 *   without ever touching disk or decoding pixels.
 */
export class ThumbnailTaskQueue<T> {
    private readonly maxConcurrent: number;
    private activeCount = 0;
    private readonly pendingOrder: string[] = [];
    private readonly jobs = new Map<string, QueuedThumbnailJob<T>>();

    constructor(maxConcurrent: number) {
        this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    }

    get active(): number {
        return this.activeCount;
    }

    get queued(): number {
        return this.pendingOrder.length;
    }

    enqueue(key: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
        if (signal?.aborted) return Promise.resolve(null);

        let job = this.jobs.get(key);
        if (!job) {
            job = { key, run, started: false, waiters: [] };
            this.jobs.set(key, job);
            this.pendingOrder.push(key);
        } else if (!job.started) {
            // Bump priority: a newly visible row asked for this same image.
            const idx = this.pendingOrder.indexOf(key);
            if (idx >= 0) {
                this.pendingOrder.splice(idx, 1);
                this.pendingOrder.push(key);
            }
        }

        const currentJob = job;
        return new Promise<T | null>((resolve) => {
            const waiter: QueuedThumbnailJob<T>['waiters'][number] = { resolve, signal };
            if (signal) {
                const onAbort = () => {
                    const idx = currentJob.waiters.indexOf(waiter);
                    if (idx >= 0) currentJob.waiters.splice(idx, 1);
                    waiter.cleanup?.();
                    resolve(null);
                    if (!currentJob.started && currentJob.waiters.length === 0) {
                        const qIdx = this.pendingOrder.indexOf(key);
                        if (qIdx >= 0) this.pendingOrder.splice(qIdx, 1);
                        this.jobs.delete(key);
                    }
                };
                signal.addEventListener('abort', onAbort, { once: true });
                waiter.cleanup = () => signal.removeEventListener('abort', onAbort);
            }
            currentJob.waiters.push(waiter);
            this.pump();
        });
    }

    private pump(): void {
        while (this.activeCount < this.maxConcurrent && this.pendingOrder.length > 0) {
            // LIFO: serve the most recently mounted (currently visible) row first.
            const key = this.pendingOrder.pop()!;
            const job = this.jobs.get(key);
            if (!job || job.started || job.waiters.length === 0) {
                this.jobs.delete(key);
                continue;
            }
            job.started = true;
            this.activeCount += 1;

            void Promise.resolve()
                .then(() => job.run())
                .then(
                    (result) => this.finishJob(job, result),
                    () => this.finishJob(job, null),
                );
        }
    }

    private finishJob(job: QueuedThumbnailJob<T>, result: T | null): void {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.jobs.delete(job.key);
        const waiters = job.waiters.splice(0, job.waiters.length);
        for (const waiter of waiters) {
            waiter.cleanup?.();
            waiter.resolve(waiter.signal?.aborted ? null : result);
        }
        this.pump();
    }
}
