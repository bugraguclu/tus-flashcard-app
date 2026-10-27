import { parseOcclusionBody } from './imageOcclusion';
import { withOcclusionMasks } from './imageOcclusionMasks';
import { sanitizeUntrustedHtml as normalizeFieldHtml, scrubCss } from './templateSecurity';
export { sanitizeUntrustedHtml } from './templateSecurity';
import { escapeHtml } from './templateEscaping';
import { typeAnswerPlainText, renderTypeAnswerDiff } from './templateTypedAnswer';
export { getTypeAnswerField, typeAnswerPlainText, renderTypeAnswerDiff } from './templateTypedAnswer';
// ============================================================
// TUS Flashcard - Template Engine (Mustache-like, Anki compatible)
// Supports: {{Field}}, {{FrontSide}}, {{cloze:Field}}, {{type:Field}}
// Conditionals: {{#Field}}...{{/Field}}, {{^Field}}...{{/Field}}
// Special: {{Tags}}, {{Type}}, {{Deck}}, {{Card}}
// ============================================================

import type { NoteType, Note } from './models';
import { MAX_TYPE_ANSWER_CHARS } from './typeAnswerBridge';
import { translateActive } from './i18n';

// ---- Cloze Parsing ----
// Anki's cloze grammar, ported from rslib/src/cloze.rs: `{{c1::text}}`, multi-ordinal
// `{{c1,2::text}}`, an optional hint after a second `::`, and arbitrary nesting. An opening that
// never closes is not a cloze — Anki leaves it as literal text, and so does this parser.

type ClozeChild = { kind: 'text'; value: string } | ClozeNode;

interface ClozeNode {
    kind: 'cloze';
    ordinals: number[];
    /** The ordinal list exactly as written, so `data-ordinal` round-trips ("1,2" stays "1,2"). */
    ordinalsText: string;
    /** Text after a second `::`, shown in brackets instead of "..." on the question side. */
    hint: string | null;
    children: ClozeChild[];
}

/** Sticky so the scanner can test for an opening at one exact offset. */
const CLOZE_OPEN = /\{\{c(\d+(?:,\d+)*)::/y;

interface ClozeFrame {
    ordinals: number[];
    ordinalsText: string;
    /** The literal `{{cN::` this frame opened with, replayed if it never closes. */
    literal: string;
    children: ClozeChild[];
}

/**
 * Split `{{c1::text::hint}}` into content and hint once the frame's children are known.
 *
 * Anki splits on the **first** `::` of the **first** text run inside the cloze, and only once
 * (rslib/src/cloze.rs: `if cloze.hint.is_none() { text.split_once("::") }`). So `{{c1::a::b::c}}`
 * hides "a" behind the hint "b::c", and anything after the split — including a nested cloze —
 * stays part of the content rather than becoming more hint.
 */
function closeClozeFrame(frame: ClozeFrame): ClozeNode {
    const children = frame.children;
    let hint: string | null = null;
    for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (child.kind !== 'text') continue;
        const separator = child.value.indexOf('::');
        if (separator === -1) continue;
        hint = child.value.slice(separator + 2);
        const head = child.value.slice(0, separator);
        if (head) children[index] = { kind: 'text', value: head };
        else children.splice(index, 1);
        break;
    }
    return {
        kind: 'cloze',
        ordinals: frame.ordinals,
        ordinalsText: frame.ordinalsText,
        hint,
        children,
    };
}

function parseClozeNodes(text: string): ClozeChild[] {
    // Some older shared decks contain a common editor typo such as
    // `{{c1:<b>:answer</b>}}`: the two delimiter colons were split around
    // an opening emphasis tag. The intent is unambiguous, so recover it at
    // render time without rewriting the learner's imported note.
    text = text.replace(
        /\{\{c(\d+(?:,\d+)*):((?:<(?:b|strong|i|em|u)>)+):/gi,
        '{{c$1::$2',
    );
    const root: ClozeChild[] = [];
    const stack: ClozeFrame[] = [];
    let children = root;
    let cursor = 0;
    let index = 0;

    const flushText = (upTo: number) => {
        if (upTo > cursor) children.push({ kind: 'text', value: text.slice(cursor, upTo) });
    };

    while (index < text.length) {
        if (text.charCodeAt(index) === 123 /* { */ && text.startsWith('{{c', index)) {
            CLOZE_OPEN.lastIndex = index;
            const open = CLOZE_OPEN.exec(text);
            if (open) {
                flushText(index);
                const frame: ClozeFrame = {
                    ordinals: open[1].split(',').map(Number),
                    ordinalsText: open[1],
                    literal: open[0],
                    children: [],
                };
                stack.push(frame);
                children = frame.children;
                index = CLOZE_OPEN.lastIndex;
                cursor = index;
                continue;
            }
        }
        if (text.charCodeAt(index) === 125 /* } */ && text.startsWith('}}', index) && stack.length > 0) {
            flushText(index);
            const frame = stack.pop()!;
            children = stack.length ? stack[stack.length - 1].children : root;
            children.push(closeClozeFrame(frame));
            index += 2;
            cursor = index;
            continue;
        }
        index++;
    }
    flushText(text.length);

    // Unclosed openings never became clozes. Unwind them back into their parent as the literal
    // `{{cN::` plus whatever was collected after it, so the learner sees the source text — which
    // is what Anki shows for a malformed deletion.
    while (stack.length > 0) {
        const frame = stack.pop()!;
        const parent = stack.length ? stack[stack.length - 1].children : root;
        parent.push({ kind: 'text', value: frame.literal }, ...frame.children);
    }
    return root;
}

const NAMED_ATTRIBUTE_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Text in an attribute, encoded as Anki encodes it (measured in Anki 26.09.3): `& < > "` as named
 * entities, and every other character below U+0100 that is not an ASCII letter or digit as a hex
 * reference of at least two digits, so the attribute cannot break out of its quotes. A browser reads the same text back
 * either way; a card text export is then the bytes Anki writes.
 */
function encodeClozeAttribute(value: string): string {
    return value.replace(/[^A-Za-z0-9\u0100-\uffff]/g, (char) => NAMED_ATTRIBUTE_ENTITIES[char]
        ?? `&#x${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')};`);
}

/** The Image Occlusion shape properties Anki writes, under the attribute names it gives them. */
const OCCLUSION_PROPERTIES: Record<string, string> = {
    left: 'left', top: 'top', width: 'width', height: 'height', rx: 'rx', ry: 'ry', points: 'points',
    angle: 'angle', text: 'text', scale: 'scale', fs: 'font-size', oi: 'occludeInactive', fill: 'fill',
};

/**
 * An Image Occlusion deletion (`{{c1::image-occlusion:rect:left=.1:top=.2:…}}`) as Anki renders it:
 * an empty `<div>` carrying the shape for Anki's occlusion script — `cloze` while it is asked,
 * `cloze-highlight` on its answer and `cloze-inactive` otherwise. Properties Anki does not know
 * are left out, and only the text of a text shape is encoded. The properties are read with Anki's
 * grammar (lib/imageOcclusion.ts), so an escaped `\:` in a label stays part of it.
 */
function renderOcclusion(text: string, ordinals: string, className: string): string {
    const { kind, properties } = parseOcclusionBody(text.slice('image-occlusion:'.length));
    let out = `<div class="${className}" data-ordinal="${ordinals}" `;
    if (kind) out += `data-shape="${kind}" `;
    for (const property of properties) {
        const name = OCCLUSION_PROPERTIES[property.name];
        if (!name) continue;
        out += `data-${name}="${name === 'text' ? encodeClozeAttribute(property.value) : property.value}" `;
    }
    return `${out}></div>`;
}

function renderClozeChildren(
    children: ClozeChild[],
    activeOrd: number,
    side: 'question' | 'answer',
): string {
    let out = '';
    for (const child of children) {
        if (child.kind === 'text') {
            out += child.value;
            continue;
        }
        const active = child.ordinals.includes(activeOrd);
        const ownText = child.children.map((part) => (part.kind === 'text' ? part.value : '')).join('');
        if (ownText.startsWith('image-occlusion:')) {
            // An occlusion has no hint: a `::` in it is part of its properties. A `c0` deletion (a
            // text label) is asked on both sides of every card, so Anki's script always draws it.
            const body = child.hint === null ? ownText : `${ownText}::${child.hint}`;
            const className = child.ordinals.includes(0) ? 'cloze'
                : !active ? 'cloze-inactive' : side === 'question' ? 'cloze' : 'cloze-highlight';
            out += renderOcclusion(body, child.ordinalsText, className);
            continue;
        }
        const inner = renderClozeChildren(child.children, activeOrd, side);
        if (!active) {
            // Anki keeps the other deletions visible on both sides, tagged so a note type can
            // dim or colour them (`.cloze-inactive`).
            out += `<span class="cloze-inactive" data-ordinal="${child.ordinalsText}">${inner}</span>`;
        } else if (side === 'question') {
            out += `<span class="cloze" data-cloze="${encodeClozeAttribute(inner)}"`
                + ` data-ordinal="${child.ordinalsText}">[${child.hint ?? '...'}]</span>`;
        } else {
            out += `<span class="cloze" data-ordinal="${child.ordinalsText}">${inner}</span>`;
        }
    }
    return out;
}

/** Every cloze ordinal used in the text, ascending. `{{c1,3::x}}` contributes both 1 and 3. */
export function extractClozeNumbers(text: string): number[] {
    const numbers = new Set<number>();
    const walk = (children: ClozeChild[]) => {
        for (const child of children) {
            if (child.kind !== 'cloze') continue;
            for (const ordinal of child.ordinals) if (ordinal > 0) numbers.add(ordinal);
            walk(child.children);
        }
    };
    walk(parseClozeNodes(text));
    return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * The number Anki's cloze button uses: one past the highest cloze number in any field of the
 * note, or (Anki's "same cloze" shortcut) the highest number itself; 1 for a note without any.
 */
export function nextClozeNumber(fields: string[], same = false): number {
    const highest = Math.max(0, ...fields.flatMap((field) => extractClozeNumbers(field || '')));
    return same ? Math.max(1, highest) : highest + 1;
}

/**
 * Index of the field a cloze note type clozes over, resolved from the `cloze` (or `cloze-only`)
 * filter in its template — Anki's source of truth. Filters chain, so `{{edit:cloze:Text}}` and
 * `{{cloze:Text}}` resolve identically. Falls back to a field literally named "Text", then to the
 * first field, so custom cloze note types are not silently broken.
 */
export function clozeFieldIndex(noteType: NoteType): number {
    for (const template of noteType.templates) {
        for (const match of template.qfmt.matchAll(/\{\{([^{}]+?)\}\}/g)) {
            const parts = match[1].split(':').map((part) => part.trim());
            const field = parts.pop() ?? '';
            if (!parts.some((filter) => filter === 'cloze' || filter === 'cloze-only')) continue;
            const index = noteType.fields.findIndex((entry) => entry.name === field);
            if (index !== -1) return index;
        }
    }
    const named = noteType.fields.findIndex((f) => f.name === 'Text');
    return named === -1 ? 0 : named;
}

/** Render cloze deletion for a specific ordinal (question side) */
export function renderClozeQuestion(text: string, targetOrd: number): string {
    return renderClozeChildren(parseClozeNodes(text), targetOrd, 'question');
}

/** Render cloze deletion for a specific ordinal (answer side) */
export function renderClozeAnswer(text: string, targetOrd: number): string {
    return renderClozeChildren(parseClozeNodes(text), targetOrd, 'answer');
}

/**
 * Anki's `cloze-only` filter: just the elided text, with everything around it dropped. Repeated
 * identical deletions collapse to one entry, and the parts are joined with ", ".
 */
export function renderClozeOnly(text: string, targetOrd: number, side: 'question' | 'answer'): string {
    const parts: string[] = [];
    const walk = (children: ClozeChild[]) => {
        for (const child of children) {
            if (child.kind !== 'cloze') continue;
            if (child.ordinals.includes(targetOrd)) {
                const value = side === 'question'
                    ? `[${child.hint ?? '...'}]`
                    : renderClozeChildren(child.children, targetOrd, 'answer');
                if (!parts.includes(value)) parts.push(value);
            }
            walk(child.children);
        }
    };
    walk(parseClozeNodes(text));
    return parts.join(', ');
}

// ---- Template Rendering ----

export interface RenderContext {
    fields: Record<string, string>;  // fieldName → value
    frontSide?: string;              // rendered question HTML
    tags?: string;
    typeName?: string;               // note type name
    deckName?: string;
    cardName?: string;               // template name
    clozeOrd?: number;               // for cloze note types
    /** Card side currently being rendered ('question' | 'answer'). */
    side?: 'question' | 'answer';
    /** Used during card generation check to treat type-in prompts as non-empty. */
    generating?: boolean;
    /** Anki's {{CardFlag}}: renders as "flag0".."flag7". */
    cardFlag?: number;
    /** Anki's {{CardID}}. */
    cardId?: number;
    /** What the user typed for a {{type:Field}} prompt, once the answer side is shown.
     *  undefined = not answered yet (question side, or no typed-answer field on this card). */
    typedAnswer?: string;
    /** Reviewer-owned input inserted at {{type:Field}} on the question side. */
    typeAnswerInput?: { token: string; placeholder: string };
    /** Internal guard: Anki supports one typed-answer input per rendered card. */
    typeAnswerInputRendered?: boolean;
    /** SAB-4: replace the question typed marker inside answer-side FrontSide. */
    typeAnswerOnFrontSide?: boolean;
    /** Render {{FrontSide}} as empty (and drop the <hr id=answer> separator). For layouts
     *  that keep the question visible in its own panel, so the back shows only the answer.
     *  frontSide must still be set — cloze rendering uses it to detect the answer side. */
    omitFrontSide?: boolean;
    /** Anki's card text export: a typed-answer prompt leaves nothing on either side. */
    noTypedAnswer?: boolean;
}

type ConditionalNode =
    | { kind: 'text'; value: string }
    | { kind: 'section'; field: string; inverted: boolean; children: ConditionalNode[] };

function parseConditionalNodes(template: string): ConditionalNode[] {
    const tokenRegex = /\{\{\s*([#^\/])([^{}]+?)\s*\}\}/g;
    const root: { kind: 'section'; field: string; inverted: boolean; children: ConditionalNode[] } = {
        kind: 'section',
        field: '__root__',
        inverted: false,
        children: [],
    };

    const stack: Array<{ kind: 'section'; field: string; inverted: boolean; children: ConditionalNode[] }> = [root];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(template)) !== null) {
        const [token, sigil, rawField] = match;
        const field = rawField.trim();
        const active = stack[stack.length - 1];

        if (match.index > cursor) {
            active.children.push({ kind: 'text', value: template.slice(cursor, match.index) });
        }

        if (sigil === '#' || sigil === '^') {
            const node: ConditionalNode = {
                kind: 'section',
                field,
                inverted: sigil === '^',
                children: [],
            };
            active.children.push(node);
            stack.push(node);
        } else {
            if (stack.length > 1 && stack[stack.length - 1].field === field) {
                stack.pop();
            } else {
                // Malformed/mismatched close tag: keep literal token.
                active.children.push({ kind: 'text', value: token });
            }
        }

        cursor = tokenRegex.lastIndex;
    }

    if (cursor < template.length) {
        stack[stack.length - 1].children.push({ kind: 'text', value: template.slice(cursor) });
    }

    // Unbalanced template: keep source untouched (safer than accidental stripping).
    if (stack.length !== 1) {
        return [{ kind: 'text', value: template }];
    }

    return root.children;
}

/**
 * Anki's field emptiness: only ASCII whitespace and bare `<br>`/`<div>` tags (open or close,
 * with an optional space and slash, any case). A tag with attributes, `&nbsp;`, a literal
 * U+00A0 or any other markup counts as content.
 */
const ANKI_EMPTY_FIELD = /^(?:[ \t\n\v\f\r]|<\/?(?:br|div) ?\/?>)*$/i;
export function isAnkiFieldEmpty(value: string): boolean {
    return ANKI_EMPTY_FIELD.test(value);
}

function renderConditionalNodes(nodes: ConditionalNode[], fields: Record<string, string>): string {
    let out = '';

    for (const node of nodes) {
        if (node.kind === 'text') {
            out += node.value;
            continue;
        }

        const empty = isAnkiFieldEmpty(fields[node.field] || '');
        const shouldRender = node.inverted ? empty : !empty;
        if (shouldRender) {
            out += renderConditionalNodes(node.children, fields);
        }
    }

    return out;
}

/**
 * Filters Anki implements itself (rslib/src/template_filters.rs). Anything outside this set is an
 * add-on filter: Anki skips it and renders the field, which is why `{{edit:cloze:Text}}` and
 * `{{clickable::Tags}}` still show their content in a stock install.
 */
const BUILTIN_FILTERS = new Set([
    'text', 'furigana', 'kana', 'kanji', 'nc',
    'hint', 'cloze', 'cloze-only', 'type', 'type-cloze', 'type-nc',
]);

/** Anki's `word[reading]` ruby syntax; the leading space is part of the match, as in Anki. */
const RUBY = / ?([^ >]+?)\[(.+?)\]/g;

/** Combining marks, stripped by the `nc` filter so "elite" and "élite" compare equal. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Stable, collision-resistant enough id for a hint's reveal target. Anki uses BLAKE3; the value
 *  is internal plumbing, only its stability within a card matters. */
function hintId(text: string, field: string): string {
    let hash = 0x811c9dc5;
    const source = `${field}${text}`;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/** Anki's strip_html: tags removed, entities decoded. */
function stripHtmlToText(value: string): string {
    return value
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/gi, '&');
}

/**
 * Apply one Anki filter. Returns null for a filter Anki does not know, so the caller can pass the
 * value through untouched — Anki's behaviour for add-on filters that are not installed.
 */
function applyTemplateFilter(
    name: string,
    value: string,
    field: string,
    ctx: RenderContext,
): string | null {
    // Anki's TTS filter contributes an AV tag, not visible card text. A hidden marker preserves
    // the same queue information for the native reviewer without exposing the spoken field twice.
    if (name === 'tts' || name.startsWith('tts ')) {
        const options = name.trim().split(/\s+/).slice(1);
        const language = options.find((option) => !option.includes('=')) ?? '';
        const speed = options.find((option) => option.startsWith('speed='))?.slice(6) ?? '1';
        const voices = options.find((option) => option.startsWith('voices='))?.slice(7) ?? '';
        if (!language || !value.trim()) return '';
        return `<tts service="anki" voice="${escapeHtml(language)}" data-speed="${escapeHtml(speed)}" data-voices="${escapeHtml(voices)}" hidden>${value}</tts>`;
    }
    if (!BUILTIN_FILTERS.has(name)) return null;

    switch (name) {
        case 'text':
            return stripHtmlToText(value);
        case 'nc':
            return value.normalize('NFKD').replace(COMBINING_MARKS, '');
        case 'furigana':
            return value.replace(RUBY, '<ruby><rb>$1</rb><rt>$2</rt></ruby>');
        case 'kana':
            return value.replace(RUBY, '$2');
        case 'kanji':
            return value.replace(RUBY, '$1');
        case 'cloze':
        case 'cloze-only': {
            if (ctx.clozeOrd === undefined) return value;
            // The question side is rendered before any front side exists; its presence is what
            // tells this pass it is now building the answer.
            const side = ctx.side ?? (ctx.frontSide ? 'answer' : 'question');
            return name === 'cloze'
                ? renderClozeChildren(parseClozeNodes(value), ctx.clozeOrd, side)
                : renderClozeOnly(value, ctx.clozeOrd, side);
        }
        case 'hint': {
            if (!value) return '';
            // Anki's exact markup. Its inline onclick is stripped by the sanitizer, so the
            // reviewer binds the reveal itself (components/CardWebView.tsx) — the note type's
            // `a.hint` / `.hint` rules keep styling both parts either way.
            const id = `hint${hintId(value, field)}`;
            return `<a class=hint href="#" data-hint-target="${id}" draggable=false>`
                + `${escapeHtml(field)}</a>`
                + `<div id="${id}" class=hint style="display: none">${value}</div>`;
        }
        case 'type':
        case 'type-cloze':
        case 'type-nc': {
            // Anki emits a `[[type:Field]]` marker here and lets the reviewer front end swap in
            // the text box. The reviewer may insert its own inert input at this exact location;
            // only the trusted WebView bridge can read it, while card-authored scripts stay
            // stripped and blocked by CSP.
            const rawFieldText = ctx.fields[field] ?? value;
            const isCloze = ctx.clozeOrd !== undefined
                || name === 'type-cloze'
                || /<span\b[^>]*\bclass=["']cloze["'][^>]*>/i.test(value)
                || /\{\{c\d+::/i.test(rawFieldText);
            const targetClozeOrd = ctx.clozeOrd ?? 1;
            const targetAnswer = isCloze
                ? renderClozeOnly(rawFieldText, targetClozeOrd, 'answer')
                : value;
            const plain = typeAnswerPlainText(targetAnswer);
            const isQuestionSide = ctx.side ? ctx.side === 'question' : !ctx.frontSide;

            if (ctx.generating) {
                return plain ? `[type:${escapeHtml(plain)}]` : '';
            }
            if (ctx.noTypedAnswer) return '';

            if (isQuestionSide && !ctx.typeAnswerOnFrontSide) {
                if (ctx.typeAnswerInput && !ctx.typeAnswerInputRendered) {
                    ctx.typeAnswerInputRendered = true;
                    const token = escapeHtml(ctx.typeAnswerInput.token);
                    const placeholder = escapeHtml(ctx.typeAnswerInput.placeholder);
                    const inputHtml = `<input id="typeans" class="tus-type-answer-input" type="text"`
                        + ` data-tus-type-answer-token="${token}" maxlength="${MAX_TYPE_ANSWER_CHARS}"`
                        + ` placeholder="${placeholder}" aria-label="${placeholder}"`
                        + ' autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done">';
                    return inputHtml;
                }
                return '';
            }

            if (ctx.typedAnswer === undefined) {
                return `<code id="typeans" class="typeanswer">${escapeHtml(plain)}</code>`;
            }
            return renderTypeAnswerDiff(ctx.typedAnswer, plain, { ignoreCombining: name === 'type-nc' });
        }
        default:
            return value;
    }
}

/** Render a template string with the given context */
export function renderTemplate(template: string, ctx: RenderContext): string {
    const deckName = ctx.deckName || '';
    const specialFields: Record<string, string> = {
        Tags: ctx.tags || '',
        Type: ctx.typeName || '',
        Deck: deckName,
        // Anki's Subdeck is the deepest component of the deck path.
        Subdeck: deckName.split('::').pop() || '',
        Card: ctx.cardName || '',
        CardFlag: `flag${ctx.cardFlag ?? 0}`,
        CardID: ctx.cardId === undefined ? '' : String(ctx.cardId),
        FrontSide: ctx.frontSide || '',
    };
    // Anki makes `{{#cN}}` true on the card for cloze N (a real field named cN wins).
    const clozeKey: Record<string, string> = ctx.clozeOrd ? { [`c${ctx.clozeOrd}`]: '1' } : {};
    const conditionalFields = { ...specialFields, ...clozeKey, ...ctx.fields };
    let result = renderConditionalNodes(parseConditionalNodes(template), conditionalFields);

    if (ctx.omitFrontSide) {
        // The answer separator only makes sense with the front side rendered above it.
        result = result.replace(/<hr id=["']?answer["']?\s*\/?>/gi, '');
    }

    // One pass over every `{{...}}` replacement. Anki splits the token from the right: the last
    // segment is the field, the rest are filters applied nearest-to-the-field first.
    result = result.replace(/\{\{([^{}]+?)\}\}/g, (_match, raw: string) => {
        const segments = String(raw).split(':');
        const key = (segments.pop() ?? '').trim();
        const filters = segments.map((segment) => segment.trim()).filter(Boolean).reverse();
        // `{{type:nc:Field}}` is one instruction, as in Anki's reviewer: `nc:` tells the type-in
        // comparison to ignore accents. Applied as the stand-alone `nc` filter it would strip the
        // accents from the expected answer instead, so the accented answer could never match.
        const typeIndex = filters.indexOf('type');
        if (typeIndex > 0 && filters[typeIndex - 1] === 'nc') filters.splice(typeIndex - 1, 2, 'type-nc');

        if (key === 'FrontSide' && !(key in ctx.fields)) return ctx.omitFrontSide ? '' : (ctx.frontSide || '');

        let value = key in ctx.fields ? ctx.fields[key] : specialFields[key];
        // A template that references a field the note type does not have renders as empty rather
        // than aborting the whole card, so one stale reference cannot hide the rest of the note.
        if (value === undefined) value = '';

        for (const filter of filters) {
            const filtered = applyTemplateFilter(filter, value, key, ctx);
            if (filtered !== null) value = filtered;
        }
        return value;
    });

    // Anki's newer block form can combine literals and multiple rendered fields. Like the field
    // filter above, it enters the audio queue and remains invisible in the card document.
    return result.replace(/\[anki:tts\s+([^\]]+)\]([\s\S]*?)\[\/anki:tts\]/gi, (_match, rawOptions: string, content: string) => {
        const language = attributeValueFromTtsOptions(rawOptions, 'lang');
        const speed = attributeValueFromTtsOptions(rawOptions, 'speed') || '1';
        const voices = attributeValueFromTtsOptions(rawOptions, 'voices');
        if (!language || !content.trim()) return '';
        return `<tts service="anki" voice="${escapeHtml(language)}" data-speed="${escapeHtml(speed)}" data-voices="${escapeHtml(voices)}" hidden>${content}</tts>`;
    });
}

function attributeValueFromTtsOptions(options: string, name: string): string {
    const match = options.match(new RegExp(`(?:^|\\s)${name}=([^\\s]+)`, 'i'));
    return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? '';
}

/** Render complete card HTML (question or answer) */
export function renderCardHtml(
    noteType: NoteType,
    note: Note,
    templateOrd: number,
    side: 'question' | 'answer',
    options?: {
        deckName?: string;
        clozeOrd?: number;
        typedAnswer?: string;
        typeAnswerInput?: { token: string; placeholder: string };
        omitFrontSide?: boolean;
        /** Anki's {{CardFlag}} value, 0 when the card carries no flag. */
        cardFlag?: number;
        /** Anki's {{CardID}} value. */
        cardId?: number;
        /** Adds Anki's `nightMode night_mode` body classes so note types can theme themselves. */
        nightMode?: boolean;
        /** Anki's document classes: "mobile iphone", "mobile ipad", "mobile android", "mac"… */
        platformClasses?: string;
        /**
         * The side as Anki's card text export writes it: no card page or styles around it, and
         * nothing where a typed answer goes.
         */
        forTextExport?: boolean;
    }
): string {
    const template = noteType.templates[templateOrd] ||
        (noteType.kind === 'cloze' ? noteType.templates[0] : null);
    if (!template) return '<div class="error">Template not found</div>';

    // Build field map
    const fields: Record<string, string> = {};
    noteType.fields.forEach((f, i) => {
        fields[f.name] = options?.forTextExport ? note.fields[i] || '' : normalizeFieldHtml(note.fields[i] || '');
    });

    const clozeOrd = noteType.kind === 'cloze'
        ? (options?.clozeOrd ?? templateOrd + 1)
        : undefined;

    // Render question
    const questionCtx: RenderContext = {
        fields,
        tags: note.tags.join(' '),
        typeName: noteType.name,
        deckName: options?.deckName,
        cardName: template.name,
        clozeOrd,
        side: 'question',
        cardFlag: options?.cardFlag,
        cardId: options?.cardId,
        typeAnswerInput: options?.typeAnswerInput,
        noTypedAnswer: options?.forTextExport,
    };
    const shell = {
        ordinal: templateOrd,
        nightMode: options?.nightMode,
        platformClasses: options?.platformClasses,
    };
    // Anki lets a card template carry its own <style> block, and shared decks rely on it — the
    // AnKing note type hides its Wikipedia lookup popup that way. Those blocks are lifted out and
    // re-emitted as scrubbed CSS after the note type's own stylesheet, which is where Anki has
    // them too. Everything else in the rendered side is sanitized: a template is imported content
    // and must not bypass the field-level sanitizer.
    const templateCss: string[] = [];
    // A text export writes the card as Anki renders it; only a card shown on screen is sanitized.
    const normalize = options?.forTextExport ? (html: string) => html : normalizeFieldHtml;
    const renderSide = (source: string, ctx: RenderContext): string => normalize(
        renderTemplate(source, ctx).replace(
            /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
            (_match, block: string) => { templateCss.push(block); return ''; },
        ),
    );

    // A card whose front no longer renders is kept until Empty Cards removes it. Anki shows it
    // with a notice on both sides instead of a blank page (`render_card` in rslib/src/template.rs).
    const emptyNotice = noteType.kind === 'cloze'
        ? (clozeOrd !== undefined
            && !extractClozeNumbers(note.fields[clozeFieldIndex(noteType)] || '').includes(clozeOrd)
            ? translateActive('anki.missingCloze', { number: clozeOrd })
            : null)
        : (shouldGenerateCard(noteType, note, templateOrd) ? null : translateActive('anki.emptyFront'));
    if (emptyNotice) {
        const notice = `<div>${escapeHtml(emptyNotice)}</div>`;
        return options?.forTextExport ? notice : wrapInCardHtml(notice, noteType.css, side, shell, '');
    }

    const questionHtml = renderSide(template.qfmt, questionCtx);

    if (side === 'question') {
        if (options?.forTextExport) return questionHtml;
        return wrapInCardHtml(withOcclusionMasks(questionHtml), noteType.css, 'question', shell, templateCss.join('\n'));
    }

    // Render answer
    const answerCtx: RenderContext = {
        ...questionCtx,
        side: 'answer',
        frontSide: renderSide(template.qfmt, {
            ...questionCtx,
            typeAnswerInput: undefined,
            typeAnswerOnFrontSide: !/\{\{\s*type(?::|-)/.test(template.afmt),
            typedAnswer: options?.typedAnswer,
        }),
        typedAnswer: options?.typedAnswer,
        omitFrontSide: options?.omitFrontSide,
    };
    const answerHtml = renderSide(template.afmt, answerCtx);
    if (options?.forTextExport) return answerHtml;
    return wrapInCardHtml(withOcclusionMasks(answerHtml), noteType.css, 'answer', shell, templateCss.join('\n'));
}

/** All cloze-bearing fields participate, including multi-field AnKing-style note types. */
export function clozeNumbersForNote(noteType: NoteType, note: Note): number[] {
    const names = new Set<string>();
    for (const template of noteType.templates) {
        for (const match of template.qfmt.matchAll(/\{\{([^{}]+)\}\}/g)) {
            const parts = match[1].split(':').map(s => s.trim());
            if (parts.slice(0, -1).some(p => p === 'cloze' || p === 'cloze-only')) names.add(parts[parts.length - 1]);
        }
    }
    const numbers = new Set<number>();
    noteType.fields.forEach((field, index) => {
        if (names.has(field.name)) for (const n of extractClozeNumbers(note.fields[index] ?? '')) numbers.add(n);
    });
    return [...numbers].sort((a, b) => a - b);
}

/** Check if a standard template should generate a card (first field reference non-empty) */
export function shouldGenerateCard(
    noteType: NoteType,
    note: Note,
    templateOrd: number
): boolean {
    if (noteType.kind === 'cloze') {
        // Cloze: check if the cloze number exists in the text
        const numbers = clozeNumbersForNote(noteType, note);
        return numbers.includes(templateOrd + 1);
    }

    // SAB-2: only populated field replacements count, before applying display filters.
    // Static template text/media cannot make an empty card valid.
    const template = noteType.templates.find(t => t.ord === templateOrd);
    if (!template) return false;
    // Anki counts the card-level special fields as filled (Tags only when the note has tags,
    // never FrontSide); a real field of the same name replaces the special one.
    const fields: Record<string, string> = {
        Card: 'x', CardFlag: 'x', Deck: 'x', Subdeck: 'x', Type: 'x', CardID: 'x',
        Tags: note.tags.join(' '),
    };
    noteType.fields.forEach((field, index) => { fields[field.name] = note.fields[index] || ''; });
    const active = renderConditionalNodes(parseConditionalNodes(template.qfmt), fields);
    return [...active.matchAll(/\{\{([^{}]+?)\}\}/g)].some(match => {
        const name = match[1].split(':').pop()!.trim();
        return !isAnkiFieldEmpty(fields[name] ?? '');
    });
}

/** Count how many cards a note should generate */
export function countCardsForNote(noteType: NoteType, note: Note): number {
    if (noteType.kind === 'cloze') {
        return clozeNumbersForNote(noteType, note).length || 1;
    }
    return noteType.templates.filter((_, i) => shouldGenerateCard(noteType, note, i)).length;
}




/**
 * Anki's reviewer document, reproduced so a shared deck's stylesheet behaves the way its author
 * tested it. Anki puts the platform on the root element (AnkiDroid ships
 * `<html class="mobile android linux js">`), `card cardN` plus the night-mode classes on the body,
 * and the rendered side inside `<div id="qa" dir="auto">`. The same three levels are reproduced
 * here as nested elements, because this fragment is embedded in a document the reviewer owns.
 *
 * Nothing in the base stylesheet styles `.card` itself: in Anki the note type decides the card's
 * font, colour and background, and this reviewer must not silently overrule an imported deck.
 */
function wrapInCardHtml(
    body: string,
    css: string,
    side: 'question' | 'answer',
    shell?: { ordinal?: number; nightMode?: boolean; platformClasses?: string },
    templateCss?: string,
): string {
    const safeCss = scrubCss(css);

    // AnkiDroid's flashcard.css, minus the parts that only make sense with its own chrome: the
    // reset, word wrapping and media that fits the screen. The typed-answer comparison uses Anki
    // reviewer's own rules — pastel marks with black text, the same in both themes, so the marks
    // stay legible on a night-mode page (ts/reviewer/reviewer.scss).
    const baseCss = 'html,body{margin:0;padding:0;}'
        + ' .card{overflow-wrap:break-word;}'
        + ' .card img, .card video { max-width: 100%; height: auto; }'
        + ' .card audio { max-width: 100%; }'
        + ' #typeans.tus-type-answer-input { box-sizing: border-box; max-width: 100%; font: inherit; }'
        + ' .typeanswer, code#typeans { white-space: pre-wrap; font-variant-ligatures: none; }'
        + ' .typeGood { background: #afa; color: black; }'
        + ' .typeBad { background: #faa; color: black; }'
        + ' .typeMissed { background: #ccc; color: black; }';

    const platform = shell?.platformClasses?.trim();
    const cardClasses = [
        'card',
        `card${(shell?.ordinal ?? 0) + 1}`,
        `side-${side}`,
        ...(shell?.nightMode ? ['nightMode', 'night_mode'] : []),
    ].join(' ');
    const content = `<div class="${cardClasses}"><div id="qa" dir="auto">${body}</div></div>`;
    // Note type stylesheet first, then anything the template declared inline — the order Anki
    // loads them in, so a template's own rule still wins over the note type's.
    const authored = templateCss?.trim() ? `<style>${scrubCss(templateCss)}</style>` : '';
    return `<style>${baseCss}</style><style>${safeCss}</style>${authored}`
        + (platform ? `<div class="${platform}">${content}</div>` : content);
}
