import { decodeDescriptionEntities } from './deckNavigation';

/**
 * The description HTML Anki shows on a deck's overview (`Overview._desc` in qt/aqt/overview.py):
 * a filtered deck shows a fixed explanation instead of its own, and a description marked
 * "Interpret as Markdown" (`md`) is rendered from Markdown.
 */
export function deckDescriptionHtml(
    deck: { description?: string; descriptionMarkdown?: boolean; isFiltered?: boolean },
    filteredExplanation: string,
): string {
    if (deck.isFiltered) return filteredExplanation;
    const description = deck.description ?? '';
    return deck.descriptionMarkdown ? markdownDescriptionHtml(description) : description;
}

/** One styled stretch of a deck description, for native text. */
export interface DescriptionRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    /** Only http(s) links are kept; anything else stays plain text. */
    href?: string;
}

const BLOCK_TAG = /^<\/?(?:address|article|aside|blockquote|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b/i;

/**
 * A deck description's HTML as styled runs. Anki renders the description as HTML; this keeps the
 * parts a description uses — bold, italic, underline, links, list bullets and line breaks — and
 * drops the rest, including script and style content, so it can be shown as native text.
 */
export function deckDescriptionRuns(html: string): DescriptionRun[] {
    const source = (html || '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const runs: DescriptionRun[] = [];
    const state = { bold: 0, italic: 0, underline: 0 };
    const links: (string | undefined)[] = [];
    const push = (text: string) => {
        if (!text) return;
        const href = links.length ? links[links.length - 1] : undefined;
        const run: DescriptionRun = { text };
        if (state.bold) run.bold = true;
        if (state.italic) run.italic = true;
        if (state.underline) run.underline = true;
        if (href) run.href = href;
        const last = runs[runs.length - 1];
        if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline && last.href === run.href) {
            last.text += text;
        } else {
            runs.push(run);
        }
    };
    const tagPattern = /<\s*(\/)?\s*([a-z0-9]+)([^>]*)>/gi;
    let index = 0;
    // A block boundary is one line break however many block tags meet there, as on a page.
    let atBlockBreak = true;
    for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
        const between = decodeDescriptionEntities(source.slice(index, match.index)).replace(/\s+/g, ' ');
        push(between);
        if (between.trim()) atBlockBreak = false;
        index = tagPattern.lastIndex;
        const closing = Boolean(match[1]);
        const tag = match[2].toLowerCase();
        const delta = closing ? -1 : 1;
        if (tag === 'b' || tag === 'strong') state.bold = Math.max(0, state.bold + delta);
        else if (tag === 'i' || tag === 'em') state.italic = Math.max(0, state.italic + delta);
        else if (tag === 'u') state.underline = Math.max(0, state.underline + delta);
        else if (tag === 'a') {
            if (closing) links.pop();
            else {
                const href = match[3].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
                const url = decodeDescriptionEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
                links.push(/^https?:\/\//i.test(url) ? url : undefined);
            }
        } else if (tag === 'br') {
            push('\n');
        } else if (tag === 'li' && !closing) {
            if (!atBlockBreak) push('\n');
            push('• ');
            atBlockBreak = false;
        } else if (BLOCK_TAG.test(match[0]) && !atBlockBreak) {
            push('\n');
            atBlockBreak = true;
        }
    }
    push(decodeDescriptionEntities(source.slice(index)).replace(/\s+/g, ' '));

    // Trim spaces around line breaks and collapse runs of blank lines, as a rendered page would.
    const joined = runs.map((run) => run.text).join('');
    if (!joined.trim()) return [];
    for (const run of runs) run.text = run.text.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
    while (runs.length && !runs[0].text.replace(/^\s+/, '')) runs.shift();
    if (runs.length) runs[0].text = runs[0].text.replace(/^\s+/, '');
    while (runs.length && !runs[runs.length - 1].text.replace(/\s+$/, '')) runs.pop();
    if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    return runs;
}

function markdownInline(text: string): string {
    return text
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, '<a href="$2">$1</a>')
        .replace(/<(https?:\/\/[^>\s]+)>/g, '<a href="$1">$1</a>')
        .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>')
        .replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, '<i>$2</i>');
}

/**
 * The subset of CommonMark a deck description uses, as the HTML `deckDescriptionRuns` reads, for
 * Anki's "Interpret as Markdown". Blank lines separate paragraphs and a single line break is a
 * space, as in CommonMark; two trailing spaces or a backslash end a line. Headings become bold
 * lines and list items keep a bullet or their number. Anything else stays text.
 */
export function markdownDescriptionHtml(markdown: string): string {
    const blocks: string[] = [];
    let paragraph: string[] = [];
    const flush = () => {
        if (!paragraph.length) return;
        const joined = paragraph
            .map((line, index) => {
                const hard = index < paragraph.length - 1 && /( {2,}|\\)$/.test(line);
                const text = line.replace(/( {2,}|\\)$/, '').trim();
                return hard ? `${text}<br>` : `${text} `;
            })
            .join('')
            .trim();
        blocks.push(`<div>${markdownInline(joined)}</div>`);
        paragraph = [];
    };
    for (const line of (markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (!line.trim()) flush();
        else if (heading) { flush(); blocks.push(`<div><b>${markdownInline(heading[1])}</b></div>`); }
        else if (bullet) { flush(); blocks.push(`<div>• ${markdownInline(bullet[1])}</div>`); }
        else if (numbered) { flush(); blocks.push(`<div>${numbered[1]}. ${markdownInline(numbered[2])}</div>`); }
        else paragraph.push(line);
    }
    flush();
    return blocks.join('');
}
