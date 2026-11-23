// Pure logic for Kartlarım visual thumbnails: image extraction, sizing, LRU bounds and work queue.
import { describe, expect, it, vi } from 'vitest';
import { IMAGE_OCCLUSION_NOTE_TYPE } from './imageOcclusionNoteType';
import {
    LruThumbnailCache,
    THUMBNAIL_EDGE_RETINA,
    THUMBNAIL_EDGE_STANDARD,
    ThumbnailTaskQueue,
    computeThumbnailDimensions,
    extractBrowserThumbnailFilename,
    extractFirstImageFilenameFromHtml,
    isPreviewableThumbnailFilename,
    shouldPreserveThumbnailAlpha,
    thumbnailCacheFilename,
    thumbnailTargetEdge,
} from './browserThumbnail';
import type { NoteType } from './models';

const BASIC_NOTE_TYPE: NoteType = {
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
    mod: 0,
};

describe('thumbnail image extraction', () => {
    it('extracts local raster images from double, single and unquoted src attributes', () => {
        expect(extractFirstImageFilenameFromHtml('<p>Heart</p><img src="ecg_01.jpg">')).toBe('ecg_01.jpg');
        expect(extractFirstImageFilenameFromHtml("<IMG class='x' src='histology &amp; slide.png'>")).toBe('histology & slide.png');
        expect(extractFirstImageFilenameFromHtml('<img src=anatomy.webp alt="a">')).toBe('anatomy.webp');
    });

    it('rejects remote URLs, data URLs, path traversal, SVG and non-image files', () => {
        expect(extractFirstImageFilenameFromHtml('<img src="https://example.com/a.jpg">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="http://example.com/a.jpg">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="data:image/png;base64,AAAA">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="file:///etc/passwd.png">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="../secret.png">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="diagram.svg">')).toBeNull();
        expect(extractFirstImageFilenameFromHtml('<img src="diagram.svg"><img src="fallback.png">')).toBe('fallback.png');
        expect(isPreviewableThumbnailFilename('audio.mp3')).toBe(false);
        expect(isPreviewableThumbnailFilename('notes.pdf')).toBe(false);
        expect(isPreviewableThumbnailFilename('diagram.svg')).toBe(false);
        expect(isPreviewableThumbnailFilename('paste_hash_without_ext')).toBe(true);
    });

    it('prioritizes the Image field on Image Occlusion notes even when Header and Occlusion come first', () => {
        const card = {
            question: 'Brachial plexus',
            answer: '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}',
            rawNote: {
                id: 10,
                guid: 'io-1',
                noteTypeId: IMAGE_OCCLUSION_NOTE_TYPE.id,
                fields: [
                    '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}',
                    '<img src="brachial_plexus.png">',
                    'Brachial plexus',
                    '<img src="extra_diagram.jpg">',
                    '',
                ],
                tags: [],
                sfld: '',
                csum: 0,
                flags: 0,
                mod: 0,
                usn: -1,
            },
        };

        expect(extractBrowserThumbnailFilename(card, IMAGE_OCCLUSION_NOTE_TYPE)).toBe('brachial_plexus.png');
    });

    it('falls back from question to answer to remaining rawNote fields on standard notes', () => {
        expect(extractBrowserThumbnailFilename({
            question: 'What is shown?',
            answer: 'Mitral stenosis <img src="echo.jpg">',
            rawNote: undefined,
        }, BASIC_NOTE_TYPE)).toBe('echo.jpg');

        expect(extractBrowserThumbnailFilename({
            question: 'Text only front',
            answer: 'Text only back',
            rawNote: {
                id: 1, guid: 'g', noteTypeId: 1,
                fields: ['Text only front', 'Text only back', '<img src="extra.webp">'],
                tags: [], sfld: '', csum: 0, flags: 0, mod: 0, usn: -1,
            },
        }, BASIC_NOTE_TYPE)).toBe('extra.webp');
    });
});

describe('thumbnail sizing and format helpers', () => {
    it('quantizes pixel ratio to 88px (1x/2x) or 132px (3x Retina)', () => {
        expect(thumbnailTargetEdge(1)).toBe(THUMBNAIL_EDGE_STANDARD);
        expect(thumbnailTargetEdge(2)).toBe(THUMBNAIL_EDGE_STANDARD);
        expect(thumbnailTargetEdge(2.5)).toBe(THUMBNAIL_EDGE_RETINA);
        expect(thumbnailTargetEdge(3)).toBe(THUMBNAIL_EDGE_RETINA);
        expect(thumbnailTargetEdge(Number.NaN)).toBe(THUMBNAIL_EDGE_STANDARD);
    });

    it('scales large photos down to target short edge while capping panoramas and never upscaling', () => {
        // 4:3 textbook photo at 3x Retina (targetEdge = 132)
        expect(computeThumbnailDimensions(4000, 3000, 132)).toEqual({ width: 176, height: 132, resized: true });
        // Portrait 3:4 at 2x (targetEdge = 88)
        expect(computeThumbnailDimensions(1500, 2000, 88)).toEqual({ width: 88, height: 117, resized: true });
        // Ultra-wide 10:1 ECG strip capped at targetEdge * 2
        expect(computeThumbnailDimensions(4000, 400, 132)).toEqual({ width: 264, height: 26, resized: true });
        // Already small image is never upscaled
        expect(computeThumbnailDimensions(64, 48, 132)).toEqual({ width: 64, height: 48, resized: false });
        // Invalid dimensions rejected cleanly
        expect(computeThumbnailDimensions(0, 100, 88)).toBeNull();
        expect(computeThumbnailDimensions(-10, 100, 88)).toBeNull();
    });

    it('preserves alpha for PNG/WebP/GIF and uses opaque JPEG for JPEG/HEIC', () => {
        expect(shouldPreserveThumbnailAlpha('diagram.png')).toBe(true);
        expect(shouldPreserveThumbnailAlpha('slide.webp')).toBe(true);
        expect(shouldPreserveThumbnailAlpha('photo.jpg')).toBe(false);
        expect(shouldPreserveThumbnailAlpha('camera.heic')).toBe(false);
    });

    it('generates safe deterministic cache filenames that change when source fingerprint changes', () => {
        const a = thumbnailCacheFilename('heart & lung.jpg', 132, '1024_1700');
        const b = thumbnailCacheFilename('heart & lung.jpg', 132, '1024_1700');
        const c = thumbnailCacheFilename('heart & lung.jpg', 132, '2048_1800');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^v1_[a-z0-9]+_132\.jpg$/);
        expect(thumbnailCacheFilename('mask.png', 88, '500_1')).toMatch(/^v1_[a-z0-9]+_88\.png$/);
    });
});

describe('LruThumbnailCache', () => {
    it('evicts the least-recently-used entry and invokes onEvict', () => {
        const evicted: Array<[string, string]> = [];
        const cache = new LruThumbnailCache<string>(2, (value, key) => evicted.push([key, value]));

        cache.set('a', 'blob:a');
        cache.set('b', 'blob:b');
        // Touch 'a' so 'b' becomes least-recently-used.
        expect(cache.get('a')).toBe('blob:a');
        cache.set('c', 'blob:c');

        expect(cache.size).toBe(2);
        expect(cache.has('b')).toBe(false);
        expect(cache.get('a')).toBe('blob:a');
        expect(cache.get('c')).toBe('blob:c');
        expect(evicted).toEqual([['b', 'blob:b']]);
    });
});

describe('ThumbnailTaskQueue', () => {
    it('bounds concurrency, deduplicates shared keys, prioritizes LIFO and drops aborted queued jobs', async () => {
        const queue = new ThumbnailTaskQueue<string>(2);
        const started: string[] = [];
        const resolvers = new Map<string, (value: string) => void>();
        let peakConcurrent = 0;

        const makeRunner = (id: string) => () => new Promise<string>((resolve) => {
            started.push(id);
            peakConcurrent = Math.max(peakConcurrent, queue.active);
            resolvers.set(id, resolve);
        });

        const p1 = queue.enqueue('img1', makeRunner('img1'));
        const p2 = queue.enqueue('img2', makeRunner('img2'));
        // img1 and img2 are now active (maxConcurrent = 2).
        const abortImg3 = new AbortController();
        const p3 = queue.enqueue('img3', makeRunner('img3'), abortImg3.signal);
        const p4a = queue.enqueue('img4', makeRunner('img4'));
        // Sibling card asks for img4 too: must deduplicate into one job.
        const p4b = queue.enqueue('img4', makeRunner('img4'));
        const p5 = queue.enqueue('img5', makeRunner('img5'));

        // User scrolls past img3 before it ever starts: must never decode!
        abortImg3.abort();
        expect(await p3).toBeNull();

        expect(started).toEqual(['img1', 'img2']);
        expect(peakConcurrent).toBe(2);

        // Finish img1 -> LIFO should pick img5 (most recently visible) before img4.
        resolvers.get('img1')!('uri:1');
        await expect(p1).resolves.toBe('uri:1');
        await vi.waitFor(() => expect(started).toContain('img5'));
        expect(started).toEqual(['img1', 'img2', 'img5']);

        resolvers.get('img2')!('uri:2');
        await expect(p2).resolves.toBe('uri:2');
        await vi.waitFor(() => expect(started).toContain('img4'));

        resolvers.get('img5')!('uri:5');
        resolvers.get('img4')!('uri:4');

        expect(await p5).toBe('uri:5');
        expect(await p4a).toBe('uri:4');
        expect(await p4b).toBe('uri:4');
        // img3 was never decoded, and img4 ran only once for both callers.
        expect(started).toEqual(['img1', 'img2', 'img5', 'img4']);
        expect(peakConcurrent).toBeLessThanOrEqual(2);
    });
});
