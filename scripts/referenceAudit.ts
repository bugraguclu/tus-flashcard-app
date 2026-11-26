import { decodeHTML } from 'entities';

export interface ReferenceSource {
    id: string;
    url: string;
    useFor: string[];
}

/** Offline checks also run in `quality`; network availability never affects local app use. */
export function validateSourceRegistry(registry: { schemaVersion: number; sources: ReferenceSource[] }): string[] {
    const failures: string[] = [];
    const ids = new Set<string>();
    if (registry.schemaVersion !== 1 || !Array.isArray(registry.sources) || registry.sources.length < 4) {
        return ['Invalid or incomplete source registry'];
    }
    for (const source of registry.sources) {
        if (!source.id || ids.has(source.id)) failures.push(`Missing or duplicate source ID: ${source.id}`);
        ids.add(source.id);
        try {
            const url = new URL(source.url);
            if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe URL');
        } catch { failures.push(`Invalid source URL: ${source.id}`); }
        if (!Array.isArray(source.useFor) || !source.useFor.length || source.useFor.some(value => typeof value !== 'string' || !value.trim())) {
            failures.push(`Missing source purpose: ${source.id}`);
        }
    }
    return failures;
}

/** Trim sentence punctuation without damaging parentheses inside a real URL. */
export function extractReferenceUrls(text: string): string[] {
    return [...text.matchAll(/https:\/\/[^\s;"'`<>\\\[\]{}]+/g)].map(match => {
        let url = match[0];
        let previous: string;
        do {
            previous = url;
            url = url.replace(/[.,:]+$/, '');
            while (url.endsWith(')') && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
        } while (url !== previous);
        return url;
    });
}

function attributes(tag: string): Map<string, string> {
    const values = new Map<string, string>();
    const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of tag.matchAll(pattern)) {
        values.set(match[1].toLowerCase(), decodeHTML(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    return values;
}

/** Quoted/unquoted attributes and character references are both valid HTML. */
export function inspectDocument(body: string): { ids: Set<string>; redirect: string | undefined; title: string } {
    const clean = body.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
    const ids = new Set<string>();
    let redirect: string | undefined;
    for (const tag of clean.matchAll(/<([a-z][a-z\d:-]*)\b([^>]*?)>/gi)) {
        const attrs = attributes(tag[2]);
        if (attrs.has('id')) ids.add(attrs.get('id')!);
        if (tag[1].toLowerCase() === 'a' && attrs.has('name')) ids.add(attrs.get('name')!);
        if (tag[1].toLowerCase() === 'meta' && attrs.get('http-equiv')?.toLowerCase() === 'refresh') {
            redirect = attrs.get('content')?.match(/url\s*=\s*(.+)$/i)?.[1]?.replace(/^["']|["']$/g, '');
        }
    }
    const title = decodeHTML(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
    return { ids, redirect, title };
}

export interface ReferenceResult {
    url: string;
    checkedUrl: string;
    finalUrl?: string;
    status?: number;
    title?: string;
    error?: string;
}

/** GitHub's raw endpoint checks that the referenced file actually exists, without its UI shell. */
export function sourceFetchUrl(url: string): string {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.hostname === 'github.com' && parsed.pathname.includes('/blob/')) {
        parsed.hostname = 'raw.githubusercontent.com';
        parsed.pathname = parsed.pathname.replace('/blob/', '/');
    }
    return parsed.href;
}

export type ReferenceFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function auditUrls(
    urls: string[],
    options: { fetcher?: ReferenceFetcher; timeoutMs?: number; concurrency?: number } = {},
): Promise<ReferenceResult[]> {
    const fetcher = options.fetcher ?? fetch;
    const cache = new Map<string, Promise<{ response: Response; body: string }>>();
    const unique = [...new Set(urls)];
    const results: ReferenceResult[] = new Array(unique.length);
    let next = 0;
    const check = async (url: string): Promise<ReferenceResult> => {
        const checkedUrl = sourceFetchUrl(url);
        try {
            let request = cache.get(checkedUrl);
            if (!request) {
                request = (async () => {
                    const response = await fetcher(checkedUrl, {
                        headers: { 'user-agent': 'TusAnkiM-reference-check/1.0' },
                        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
                    });
                    return { response, body: await response.text() };
                })();
                cache.set(checkedUrl, request);
            }
            const { response, body } = await request;
            const result: ReferenceResult = { url, checkedUrl, finalUrl: response.url || checkedUrl, status: response.status };
            if (response.status !== 200) return { ...result, error: `HTTP ${response.status} (not verified)` };
            if (!body.trim()) return { ...result, error: 'Empty response' };
            const { ids, redirect, title } = inspectDocument(body);
            result.title = title;
            if (/just a moment|checking your browser|access denied|page not found|site not found|captcha/i.test(title)) {
                return { ...result, error: 'Error/challenge page returned HTTP 200' };
            }
            if (redirect) return { ...result, error: `HTML redirect; cite its destination: ${redirect}` };
            const fragment = decodeURIComponent(new URL(url).hash.slice(1));
            if (fragment && !ids.has(fragment)) return { ...result, error: `Missing fragment: #${fragment}` };
            return result;
        } catch (error) {
            return { url, checkedUrl, error: error instanceof Error ? error.message : String(error) };
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, unique.length)) }, async () => {
        while (next < unique.length) {
            const index = next++;
            results[index] = await check(unique[index]);
        }
    }));
    return results;
}
