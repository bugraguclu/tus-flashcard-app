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

/**
 * Why a `tusankim://x-callback-url/…` request could not be carried out. The learner is told
 * (lib/externalLinkRejection.ts): a rejected request used to do nothing but log a warning.
 */
export type ExternalLinkRejection =
    | { reason: 'tooLong' }
    | { reason: 'unknownAction'; action: string }
    | { reason: 'missingQuery' }
    | { reason: 'missingType' }
    | { reason: 'missingDeck' }
    | { reason: 'missingFields' }
    | { reason: 'noteTypeNotFound'; noteTypeName: string }
    | { reason: 'deckNotFound'; deckName: string }
    | { reason: 'filteredDeck'; deckName: string }
    | { reason: 'catalogDeck'; deckName: string }
    | { reason: 'noMatchingFields'; noteTypeName: string; fieldNames: string[] };

/** A request read from a URL: what it asks for, or why it cannot be done. */
export type ExternalAppUrlReading = { action: ExternalAppAction } | { rejected: ExternalLinkRejection };

const MAX_EXTERNAL_URL_LENGTH = 32_768;
const X_CALLBACK_URL = /^tusankim:\/\/x-callback-url(?:[/?#]|$)/i;

/**
 * Read the AnkiMobile-style x-callback subset supported by TusAnkiM. Null for any URL that is not
 * an x-callback request (a file, a screen address), which other code handles.
 */
export function readExternalAppUrl(rawUrl: string): ExternalAppUrlReading | null {
    if (!rawUrl) return null;
    if (rawUrl.length > MAX_EXTERNAL_URL_LENGTH) {
        return X_CALLBACK_URL.test(rawUrl) ? { rejected: { reason: 'tooLong' } } : null;
    }
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
        return query ? { action: { kind: 'search', query } } : { rejected: { reason: 'missingQuery' } };
    }
    if (action !== 'addnote') return { rejected: { reason: 'unknownAction', action: cleanValue(action, 60) } };

    const noteTypeName = cleanValue(url.searchParams.get('type'), 200);
    if (!noteTypeName) return { rejected: { reason: 'missingType' } };
    const deckName = cleanValue(url.searchParams.get('deck'), 500);
    if (!deckName) return { rejected: { reason: 'missingDeck' } };

    const fields: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
        if (!key.startsWith('fld') || key.length <= 3) continue;
        const fieldName = cleanValue(key.slice(3), 200);
        if (!fieldName || Object.keys(fields).length >= 100) continue;
        fields[fieldName] = value.slice(0, 100_000);
    }
    if (Object.keys(fields).length === 0) return { rejected: { reason: 'missingFields' } };

    return {
        action: {
            kind: 'addnote',
            noteTypeName,
            deckName,
            fields,
            tags: cleanValue(url.searchParams.get('tags'), 10_000).split(/\s+/).filter(Boolean).slice(0, 200),
            allowDuplicates: url.searchParams.get('dupes') === '1',
            successUrl: safeExternalCallbackUrl(url.searchParams.get('x-success')),
        },
    };
}

/** The action an x-callback URL asks for, or null when it asks for none that can be done. */
export function parseExternalAppUrl(rawUrl: string): ExternalAppAction | null {
    const reading = readExternalAppUrl(rawUrl);
    return reading && 'action' in reading ? reading.action : null;
}

/**
 * The web form of the same automation: `https://<site>/x-callback-url?action=addnote&type=…`.
 *
 * A browser cannot own the `tusankim:` scheme, so the site answers at one route and names the
 * action in the query — a static host can serve that route, while `/x-callback-url/addnote` would
 * need a server rewrite. The parameters are turned back into the `tusankim://` URL
 * `readExternalAppUrl` reads, so both platforms share one parser and one set of limits.
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
