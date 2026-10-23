/** A safe editable view is a projection of the source, never the source itself.
 * Unsupported nodes stay as inert placeholders and altered attributes are remembered, so
 * editing nearby text cannot rewrite Anki media markers, links or imported HTML.
 */
import { sanitizeUntrustedHtml } from './templates';
export type PreservedEditorSource = Record<string, { kind: 'node' | 'tag'; source: string; safe?: string }>;
export interface PreparedEditorContent { html: string; original: string; preserved: PreservedEditorSource }
export function prepareEditorContent(source: string, namespace = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`): PreparedEditorContent {
    const preserved: PreservedEditorSource = {};
    let sequence = 0;
    const remember = (raw: string, display = '') => {
        const id = `${namespace}-${sequence++}`;
        preserved[id] = { kind: 'node', source: raw };
        return `<tus-source data-tus-source="${id}" contenteditable="false">${display}</tus-source>`;
    };
    let html = source.replace(/<\s*(script|svg|math|style|iframe|object|embed|frame|frameset|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, raw => remember(raw, '◈'));
    html = html.replace(/<\/?\s*(?:script|svg|math|style|iframe|object|embed|frame|frameset|form|meta|link|base)\b[^>]*>/gi, raw => remember(raw, '◈'));
    // Only text-level sound markers: one inside an attribute value (an alt or title, say) is part
    // of that tag and must not have a placeholder element written into the middle of it.
    html = html.replace(/(<[a-zA-Z!\/?][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>)|\[sound:([^\]]+)\]/gi, (raw, tag?: string) => (
        tag ? raw : remember(raw, sanitizeUntrustedHtml(raw))));
    html = html.replace(/<[a-zA-Z!\/?][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, raw => {
        if (/^<\/?tus-source\b/i.test(raw)) return raw;
        // The display sanitizer turns [sound:x] into a player; inside an attribute that would
        // break the tag, so the displayed copy carries it as inert text (restored on save).
        const safe = sanitizeUntrustedHtml(raw.replace(/\[sound:/gi, '&#91;sound:'));
        if (safe === raw) return raw;
        if (!safe || /^<\//.test(raw)) return remember(raw);
        const id = `${namespace}-${sequence++}`;
        preserved[id] = { kind: 'tag', source: raw, safe };
        return safe.replace(/\s*\/?>$/, end => ` data-tus-source="${id}"${end}`);
    });
    return { html: sanitizeUntrustedHtml(html), original: source, preserved };
}

/** Literal browser source: its text and CSP hash must survive server/client compilation. */
export const EDITOR_SOURCE_RESTORE_SCRIPT = String.raw`function restoreEditorSource(html, preserved) {
    const attributes = (tag) => {
        const result = new Map();
        const head = tag.match(/^<[^\s/>]+/)?.[0].length ?? 0;
        for (const match of tag.slice(head).matchAll(/\s+([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
            const rawValue = match[2] ?? '';
            result.set(match[1].toLowerCase(), { raw: match[0], value: rawValue.replace(/^["']|["']$/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&') });
        }
        return result;
    };
    // A placeholder this field does not own (copied from another field) cannot be restored: an
    // inert one goes, and a sound player becomes its [sound:x] marker again.
    let result = html.replace(/<tus-source\b[^>]*data-tus-source=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tus-source>/gi, (tag, id, inner) => {
        if (preserved[id]?.kind === 'node') return preserved[id].source;
        const sound = inner.match(/^\s*<audio\b[^>]*\ssrc=["']([^"']+)["']/i);
        return sound ? '[sound:' + sound[1].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&') + ']' : '';
    });
    result = result.replace(/<[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, tag => {
        const id = tag.match(/\sdata-tus-source=["']([^"']+)["']/i)?.[1];
        const entry = id ? preserved[id] : undefined;
        if (!entry || entry.kind !== 'tag')
            return id ? tag.replace(/\sdata-tus-source=["'][^"']+["']/i, '') : tag;
        let restored = tag.replace(/\sdata-tus-source=["'][^"']+["']/i, '');
        const current = attributes(restored);
        const safe = attributes(entry.safe ?? '');
        for (const [name, original] of attributes(entry.source)) {
            if (current.get(name)?.value !== safe.get(name)?.value)
                continue;
            const existing = current.get(name);
            if (existing)
                restored = restored.replace(existing.raw, original.raw);
            else
                restored = restored.replace(/\s*\/?>$/, end => original.raw + end);
        }
        return restored;
    });
    return result;
}`;
