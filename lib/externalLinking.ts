export type ExternalAppAction =
    | {
        kind: 'addnote';
        noteTypeName: string;
        deckName: string;
        fields: Record<string, string>;
        tags: string[];
        allowDuplicates: boolean;
        successUrl: string | null;
    }
    | { kind: 'search'; query: string };

function cleanValue(value: string | null, maxLength: number): string {
    return (value ?? '').normalize('NFC').trim().slice(0, maxLength);
}

export function safeExternalCallbackUrl(raw: string | null): string | null {
    const value = cleanValue(raw, 2048);
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
    try {
        const parsed = new URL(value);
        const protocol = parsed.protocol.toLowerCase();
        if (parsed.username || parsed.password) return null;
        if (protocol === 'https:' && parsed.hostname) return parsed.href;
        if (protocol === 'shortcuts:' && parsed.hostname.toLowerCase() === 'x-callback-url') return parsed.href;
        return null;
    } catch {
        return null;
    }
}

/** Parse the AnkiMobile-style x-callback subset supported by TusAnkiM. */
export function parseExternalAppUrl(rawUrl: string): ExternalAppAction | null {
    if (!rawUrl || rawUrl.length > 32_768) return null;
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }
    if (url.protocol.toLowerCase() !== 'tusankim:') return null;
    if (url.hostname.toLowerCase() !== 'x-callback-url') return null;

    const action = url.pathname.replace(/^\/+/, '').toLowerCase();
    if (action === 'search') {
        const query = cleanValue(url.searchParams.get('query'), 4096);
        return query ? { kind: 'search', query } : null;
    }
    if (action !== 'addnote') return null;

    const noteTypeName = cleanValue(url.searchParams.get('type'), 200);
    const deckName = cleanValue(url.searchParams.get('deck'), 500);
    if (!noteTypeName || !deckName) return null;

    const fields: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
        if (!key.startsWith('fld') || key.length <= 3) continue;
        const fieldName = cleanValue(key.slice(3), 200);
        if (!fieldName || Object.keys(fields).length >= 100) continue;
        fields[fieldName] = value.slice(0, 100_000);
    }
    if (Object.keys(fields).length === 0) return null;

    return {
        kind: 'addnote',
        noteTypeName,
        deckName,
        fields,
        tags: cleanValue(url.searchParams.get('tags'), 10_000).split(/\s+/).filter(Boolean).slice(0, 200),
        allowDuplicates: url.searchParams.get('dupes') === '1',
        successUrl: safeExternalCallbackUrl(url.searchParams.get('x-success')),
    };
}

/**
 * The web form of the same automation: `https://<site>/x-callback-url?action=addnote&type=…`.
 *
 * A browser cannot own the `tusankim:` scheme, so the site answers at one route and names the
 * action in the query — a static host can serve that route, while `/x-callback-url/addnote` would
 * need a server rewrite. The parameters are turned back into the `tusankim://` URL
 * `parseExternalAppUrl` reads, so both platforms share one parser and one set of limits.
 */
export function externalAppUrlFromQuery(params: Record<string, string | string[] | undefined>): string | null {
    const rawAction = params.action;
    const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;
    if (!action || !/^[a-z]+$/i.test(action)) return null;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (key === 'action' || value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    }
    const search = query.toString();
    return `tusankim://x-callback-url/${action}${search ? `?${search}` : ''}`;
}
