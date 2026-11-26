import { describe, expect, it, vi } from 'vitest';
import { auditUrls, extractReferenceUrls, inspectDocument, sourceFetchUrl, validateSourceRegistry } from '../scripts/referenceAudit';
import type { ReferenceFetcher } from '../scripts/referenceAudit';

const registry = {
    schemaVersion: 1,
    sources: Array.from({ length: 4 }, (_, i) => ({
        id: `source-${i}`, url: `https://reference.example/${i}`, useFor: ['Documented behavior'],
    })),
};

describe('reference verification', () => {
    it('rejects duplicate IDs even when each URL is valid', () => {
        expect(validateSourceRegistry(registry)).toEqual([]);
        expect(validateSourceRegistry({ ...registry, sources: [...registry.sources, registry.sources[0]] }))
            .toContain('Missing or duplicate source ID: source-0');
    });

    it('rejects credentials, insecure URLs and missing purposes', () => {
        const sources = registry.sources.map(source => ({ ...source }));
        sources[0].url = 'https://user:secret@reference.example/';
        sources[1].url = 'http://reference.example/';
        sources[2].useFor = [];
        expect(validateSourceRegistry({ ...registry, sources })).toHaveLength(3);
    });

    it('keeps balanced URL parentheses but removes prose punctuation', () => {
        expect(extractReferenceUrls('See https://example.test/api(_:name:), or (https://example.test/notes);'))
            .toEqual(['https://example.test/api(_:name:)', 'https://example.test/notes']);
        expect(extractReferenceUrls('"url": "https://example.test/a", [manual](https://example.test/b#c).'))
            .toEqual(['https://example.test/a', 'https://example.test/b#c']);
        expect(extractReferenceUrls('Evidence ([manual](https://example.test/a)):: next'))
            .toEqual(['https://example.test/a']);
    });

    it('recognizes HTML-standard IDs, escaped ampersands and named anchors', () => {
        const parsed = inspectDocument(`<title>Card &amp; Note</title>
            <h2 id=unquoted>One</h2><h2 id="card-generation-&amp;-deletion">Two</h2>
            <a name='legacy'></a><script>const x = '<h2 id="fake">';</script>
            <!-- <h2 id="comment"> -->`);
        expect(parsed.title).toBe('Card & Note');
        expect([...parsed.ids]).toEqual(['unquoted', 'card-generation-&-deletion', 'legacy']);
    });

    it('checks each fragment while sharing the document request', async () => {
        const fetcher = vi.fn<ReferenceFetcher>().mockImplementation(async () => new Response('<h2 id="card-generation-&amp;-deletion">Cards</h2>'));
        const results = await auditUrls([
            'https://reference.example/manual#card-generation-%26-deletion',
            'https://reference.example/manual#old-fragment',
        ], { fetcher });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(results[0].error).toBeUndefined();
        expect(results[1].error).toBe('Missing fragment: #old-fragment');
    });

    it('does not treat a 200 page without any target IDs as a valid deep link', async () => {
        const fetcher = vi.fn<ReferenceFetcher>().mockResolvedValue(new Response('<title>Moved manual</title>'));
        const [result] = await auditUrls(['https://reference.example/#section'], { fetcher });
        expect(result.error).toBe('Missing fragment: #section');
    });

    it('rejects soft errors, bot challenges, non-200 responses and HTML redirects', async () => {
        const pages = [
            new Response('<title>Site not found · GitHub Pages</title>'),
            new Response('<title>Just a moment...</title>'),
            new Response('PubMed browser check', { status: 203 }),
            new Response(`<meta content="0; URL=https://reference.example/new" http-equiv="refresh">`),
        ];
        const fetcher = vi.fn<ReferenceFetcher>().mockImplementation(async () => pages.shift()!);
        const results = await auditUrls([0, 1, 2, 3].map(i => `https://reference.example/${i}`), { fetcher, concurrency: 1 });
        expect(results.map(result => result.error)).toEqual([
            'Error/challenge page returned HTTP 200', 'Error/challenge page returned HTTP 200',
            'HTTP 203 (not verified)', 'HTML redirect; cite its destination: https://reference.example/new',
        ]);
    });

    it('reports network failure without losing the other results', async () => {
        const fetcher = vi.fn<ReferenceFetcher>().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(new Response('Source content'));
        const results = await auditUrls(['https://reference.example/broken', 'https://reference.example/good'], { fetcher, concurrency: 1 });
        expect(results[0].error).toBe('timeout');
        expect(results[1].error).toBeUndefined();
    });

    it('checks the content of the exact GitHub revision, preserving path encoding', () => {
        expect(sourceFetchUrl('https://github.com/owner/repo/blob/pinned/path%20name.rs'))
            .toBe('https://raw.githubusercontent.com/owner/repo/pinned/path%20name.rs');
    });
});
