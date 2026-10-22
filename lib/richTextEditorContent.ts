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
    html = html.replace(/\[sound:([^\]]+)\]/gi, raw => remember(raw, sanitizeUntrustedHtml(raw)));
    html = html.replace(/<[a-zA-Z!\/?][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, raw => {
        if (/^<\/?tus-source\b/i.test(raw)) return raw;
        const safe = sanitizeUntrustedHtml(raw);
        if (safe === raw) return raw;
        if (!safe || /^<\//.test(raw)) return remember(raw);
        const id = `${namespace}-${sequence++}`;
        preserved[id] = { kind: 'tag', source: raw, safe };
        return safe.replace(/\s*\/?>$/, end => ` data-tus-source="${id}"${end}`);
    });
    return { html: sanitizeUntrustedHtml(html), original: source, preserved };
}

/** Self-contained because the same function is embedded in the trusted editor script. */
export function restoreEditorSource(html: string, preserved: PreservedEditorSource): string {
    const attributes = (tag: string) => {
        const result = new Map<string, { raw: string; value: string }>();
        const head = tag.match(/^<[^\s/>]+/)?.[0].length ?? 0;
        for (const match of tag.slice(head).matchAll(/\s+([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
            const rawValue = match[2] ?? '';
            result.set(match[1].toLowerCase(), { raw: match[0], value: rawValue.replace(/^["']|["']$/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&') });
        }
        return result;
    };
    let result = html.replace(/<tus-source\b[^>]*data-tus-source=["']([^"']+)["'][^>]*>[\s\S]*?<\/tus-source>/gi, (tag, id: string) => preserved[id]?.kind === 'node' ? preserved[id].source : tag);
    result = result.replace(/<[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, tag => {
        const id = tag.match(/\sdata-tus-source=["']([^"']+)["']/i)?.[1];
        const entry = id ? preserved[id] : undefined;
        if (!entry || entry.kind !== 'tag') return tag;
        let restored = tag.replace(/\sdata-tus-source=["'][^"']+["']/i, '');
        const current = attributes(restored);
        const safe = attributes(entry.safe ?? '');
        for (const [name, original] of attributes(entry.source)) {
            if (current.get(name)?.value !== safe.get(name)?.value) continue;
            const existing = current.get(name);
            if (existing) restored = restored.replace(existing.raw, original.raw);
            else restored = restored.replace(/\s*\/?>$/, end => original.raw + end);
        }
        return restored;
    });
    return result;
}
