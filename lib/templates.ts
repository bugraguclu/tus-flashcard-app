// ============================================================
// TUS Flashcard - Template Engine (Mustache-like, Anki compatible)
// Supports: {{Field}}, {{FrontSide}}, {{cloze:Field}}, {{type:Field}}
// Conditionals: {{#Field}}...{{/Field}}, {{^Field}}...{{/Field}}
// Special: {{Tags}}, {{Type}}, {{Deck}}, {{Card}}
// ============================================================

import type { NoteType, Note } from './models';
import { MAX_TYPE_ANSWER_CHARS } from './typeAnswerBridge';

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

/**
 * Anki escapes the answer it hides in `data-cloze` so the attribute cannot break out of its
 * quotes. Only the five characters that are significant inside a double-quoted attribute matter.
 */
function encodeClozeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
        const inner = renderClozeChildren(child.children, activeOrd, side);
        if (!child.ordinals.includes(activeOrd)) {
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
    /** Anki's {{CardFlag}}: renders as "flag0".."flag7". */
    cardFlag?: number;
    /** What the user typed for a {{type:Field}} prompt, once the answer side is shown.
     *  undefined = not answered yet (question side, or no typed-answer field on this card). */
    typedAnswer?: string;
    /** Reviewer-owned input inserted at {{type:Field}} on the question side. */
    typeAnswerInput?: { token: string; placeholder: string };
    /** Internal guard: Anki supports one typed-answer input per rendered card. */
    typeAnswerInputRendered?: boolean;
    /** Render {{FrontSide}} as empty (and drop the <hr id=answer> separator). For layouts
     *  that keep the question visible in its own panel, so the back shows only the answer.
     *  frontSide must still be set — cloze rendering uses it to detect the answer side. */
    omitFrontSide?: boolean;
}

type ConditionalNode =
    | { kind: 'text'; value: string }
    | { kind: 'section'; field: string; inverted: boolean; children: ConditionalNode[] };

function parseConditionalNodes(template: string): ConditionalNode[] {
    const tokenRegex = /\{\{([#^\/])([^{}]+?)\}\}/g;
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

function renderConditionalNodes(nodes: ConditionalNode[], fields: Record<string, string>): string {
    let out = '';

    for (const node of nodes) {
        if (node.kind === 'text') {
            out += node.value;
            continue;
        }

        const value = (fields[node.field] || '').trim();
        const shouldRender = node.inverted ? !value : Boolean(value);
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
            const side = ctx.frontSide ? 'answer' : 'question';
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
            const answer = name === 'type-cloze' && ctx.clozeOrd !== undefined
                ? renderClozeOnly(value, ctx.clozeOrd, 'answer')
                : value;
            const plain = typeAnswerPlainText(answer);
            if (!ctx.frontSide) {
                if (!ctx.typeAnswerInput || ctx.typeAnswerInputRendered) return '';
                ctx.typeAnswerInputRendered = true;
                const token = escapeHtml(ctx.typeAnswerInput.token);
                const placeholder = escapeHtml(ctx.typeAnswerInput.placeholder);
                return `<input id="typeans" class="tus-type-answer-input" type="text"`
                    + ` data-tus-type-answer-token="${token}" maxlength="${MAX_TYPE_ANSWER_CHARS}"`
                    + ` placeholder="${placeholder}" aria-label="${placeholder}"`
                    + ' autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done">';
            }
            if (ctx.typedAnswer === undefined) return `<div class="typeanswer">${escapeHtml(plain)}</div>`;
            const fold = (text: string) => (name === 'type-nc'
                ? text.normalize('NFKD').replace(COMBINING_MARKS, '')
                : text);
            return renderTypeAnswerDiff(fold(ctx.typedAnswer), fold(plain));
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
        FrontSide: ctx.frontSide || '',
    };
    const conditionalFields = { ...ctx.fields, ...specialFields };
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

        if (key === 'FrontSide') return ctx.omitFrontSide ? '' : (ctx.frontSide || '');

        let value = key in specialFields ? specialFields[key] : ctx.fields[key];
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
        /** Adds Anki's `nightMode night_mode` body classes so note types can theme themselves. */
        nightMode?: boolean;
        /** Anki's document classes: "mobile iphone", "mobile ipad", "mobile android", "mac"… */
        platformClasses?: string;
    }
): string {
    const template = noteType.templates[templateOrd] ||
        (noteType.kind === 'cloze' ? noteType.templates[0] : null);
    if (!template) return '<div class="error">Template not found</div>';

    // Build field map
    const fields: Record<string, string> = {};
    noteType.fields.forEach((f, i) => {
        fields[f.name] = normalizeFieldHtml(note.fields[i] || '');
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
        cardFlag: options?.cardFlag,
        typeAnswerInput: options?.typeAnswerInput,
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
    const renderSide = (source: string, ctx: RenderContext): string => normalizeFieldHtml(
        renderTemplate(source, ctx).replace(
            /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
            (_match, block: string) => { templateCss.push(block); return ''; },
        ),
    );

    const questionHtml = renderSide(template.qfmt, questionCtx);

    if (side === 'question') {
        return wrapInCardHtml(questionHtml, noteType.css, 'question', shell, templateCss.join('\n'));
    }

    // Render answer
    const answerCtx: RenderContext = {
        ...questionCtx,
        frontSide: questionHtml,
        typedAnswer: options?.typedAnswer,
        omitFrontSide: options?.omitFrontSide,
    };
    const answerHtml = renderSide(template.afmt, answerCtx);
    return wrapInCardHtml(answerHtml, noteType.css, 'answer', shell, templateCss.join('\n'));
}

/** Check if a standard template should generate a card (first field reference non-empty) */
export function shouldGenerateCard(
    noteType: NoteType,
    note: Note,
    templateOrd: number
): boolean {
    if (noteType.kind === 'cloze') {
        // Cloze: check if the cloze number exists in the text
        const text = note.fields[clozeFieldIndex(noteType)] || '';
        const numbers = extractClozeNumbers(text);
        return numbers.includes(templateOrd + 1);
    }

    // Standard: Anki generates a card only when the rendered question has content. Rendering
    // first is important for conditional templates such as {{#Add Reverse}}...{{/Add Reverse}}.
    const template = noteType.templates[templateOrd];
    if (!template) return false;
    const fields: Record<string, string> = {};
    noteType.fields.forEach((field, index) => { fields[field.name] = note.fields[index] || ''; });
    const rendered = renderTemplate(template.qfmt, { fields });
    if (/<(?:img|audio|video|object|svg)\b/i.test(rendered)) return true;
    return rendered
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .trim().length > 0;
}

/** Count how many cards a note should generate */
export function countCardsForNote(noteType: NoteType, note: Note): number {
    if (noteType.kind === 'cloze') {
        const text = note.fields[clozeFieldIndex(noteType)] || '';
        return extractClozeNumbers(text).length || 1;
    }
    return noteType.templates.filter((_, i) => shouldGenerateCard(noteType, note, i)).length;
}

// ---- Type-in-the-answer ----

/** Field name of the first {{type:Field}} prompt in a template's qfmt, if any. */
export function getTypeAnswerField(template: { qfmt: string } | undefined): string | null {
    const match = template?.qfmt.match(/\{\{type:([^{}]+?)\}\}/);
    return match ? match[1].trim() : null;
}

/** Longest common subsequence of two strings, as a list of [typedIdx, correctIdx] matched pairs. */
function lcsPairs(a: string, b: string): Array<[number, number]> {
    const n = a.length;
    const m = b.length;
    const dp: Uint32Array[] = new Array(n + 1);
    for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const pairs: Array<[number, number]> = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            pairs.push([i, j]);
            i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return pairs;
}

/**
 * Anki-style typed-answer feedback: the user's text with correct runs highlighted and wrong
 * runs struck through, followed by the real answer with the parts the user missed underlined.
 */
/**
 * Plain-text projection of a field for the type-in-the-answer comparison. Block-level markup
 * becomes a line break, inline markup and media are dropped, matching what Anki diffs against.
 */
export function typeAnswerPlainText(value: string): string {
    return value
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .replace(/<(?:img|audio|video|source)\b[^>]*>/gi, ' ')
        .replace(/<\/?(?:div|p|br|li|tr|h[1-6])\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

export function renderTypeAnswerDiff(typed: string, correct: string): string {
    const typedTrimmed = typed.trim();
    const correctTrimmed = correct.trim();

    if (typedTrimmed.length === 0) {
        return `<div class="typeanswer"><div class="typed"><span class="typeMissed">${escapeHtml(correctTrimmed)}</span></div></div>`;
    }
    if (typedTrimmed === correctTrimmed) {
        return `<div class="typeanswer"><div class="typed"><span class="typeGood">${escapeHtml(correctTrimmed)}</span></div></div>`;
    }

    const matched = lcsPairs(typedTrimmed, correctTrimmed);
    const typedMatchIdx = new Set(matched.map((p) => p[0]));
    const correctMatchIdx = new Set(matched.map((p) => p[1]));

    let typedLine = '';
    let run = '';
    let runGood = false;
    const flushTyped = () => {
        if (!run) return;
        typedLine += runGood
            ? `<span class="typeGood">${escapeHtml(run)}</span>`
            : `<span class="typeBad">${escapeHtml(run)}</span>`;
        run = '';
    };
    for (let i = 0; i < typedTrimmed.length; i++) {
        const good = typedMatchIdx.has(i);
        if (run && good !== runGood) flushTyped();
        runGood = good;
        run += typedTrimmed[i];
    }
    flushTyped();

    let correctLine = '';
    run = '';
    runGood = false;
    const flushCorrect = () => {
        if (!run) return;
        correctLine += runGood ? escapeHtml(run) : `<span class="typeMissed">${escapeHtml(run)}</span>`;
        run = '';
    };
    for (let j = 0; j < correctTrimmed.length; j++) {
        const good = correctMatchIdx.has(j);
        if (run && good !== runGood) flushCorrect();
        runGood = good;
        run += correctTrimmed[j];
    }
    flushCorrect();

    return `<div class="typeanswer"><div class="typed">${typedLine}</div><hr size=1><div class="correct">${correctLine}</div></div>`;
}

// ---- Helpers ----

function decodeSecurityEntities(text: string): string {
    return text
        .replace(/&#(\d+);?/g, (_match, value) => String.fromCodePoint(Math.min(Number(value), 0x10ffff)))
        .replace(/&#x([0-9a-f]+);?/gi, (_match, value) => String.fromCodePoint(Math.min(parseInt(value, 16), 0x10ffff)))
        .replace(/&colon;/gi, ':')
        .replace(/&(?:tab|newline);/gi, ' ');
}

/** A tag, tolerating `>` inside quoted attribute values the way a browser's parser does. */
const HTML_TAG = /<[a-zA-Z!\/?][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;

/** Name, then an optional `=` and a quoted or bare value. */
const HTML_ATTRIBUTE = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'poster']);

function isSafeDataMediaUrl(value: string): boolean {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(value)
        || /^data:audio\/(?:mpeg|mp3|ogg|wav|webm|mp4|m4a);base64,/i.test(value)
        || /^data:video\/(?:mp4|webm|ogg);base64,/i.test(value);
}

function normalizedSecurityUrl(value: string): string {
    return decodeSecurityEntities(value).trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function isSafeLocalMediaUrl(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (!normalized || normalized.length > 512 || normalized.startsWith('.') || normalized.startsWith('#')) return false;
    if (isSafeDataMediaUrl(normalized)) return true;
    // Anki package media is a flat filename namespace. Reject schemes, absolute paths,
    // traversal, query strings and encoded separators before the WebView sees them.
    let decoded = normalized;
    try { decoded = decodeURIComponent(normalized); } catch { return false; }
    return !/[\\/:?#]/.test(decoded) && decoded !== '.' && decoded !== '..';
}

function isSafeLinkUrl(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (normalized.startsWith('#')) return true;
    try {
        const parsed = new URL(normalized);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

function isDangerousStyle(value: string): boolean {
    const normalized = decodeCssSecurityEscapes(decodeSecurityEntities(value)).replace(/\s+/g, '').toLowerCase();
    return normalized.includes('expression(')
        || normalized.includes('javascript:')
        || normalized.includes('url(data:text/html')
        || normalized.includes('url(data:image/svg+xml')
        || /(?:url|image|image-set|cross-fade)\(/.test(normalized)
        || normalized.includes('@import');
}

/**
 * Rebuild one tag with its unsafe attributes removed or neutered. Attribute names are compared
 * decoded, because a browser would decode them. A tag that carried nothing unsafe is returned
 * untouched, so the reviewer never reflows markup it had no reason to change.
 */
function scrubTagAttributes(tag: string): string {
    const head = tag.match(/^<\s*(\/?)\s*([a-zA-Z0-9:_-]+)/);
    if (!head) return tag;
    const selfClosing = /\/\s*>$/.test(tag);
    const attributeRegion = tag.slice(head[0].length).replace(/\/?\s*>$/, '');

    let changed = false;
    let rebuilt = `<${head[1]}${head[2]}`;
    HTML_ATTRIBUTE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HTML_ATTRIBUTE.exec(attributeRegion)) !== null) {
        const name = match[1];
        const hasValue = match[2] !== undefined || match[3] !== undefined || match[4] !== undefined;
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        const plainName = decodeSecurityEntities(name).toLowerCase();

        if (/^on[a-z0-9_-]*$/.test(plainName) || plainName === 'srcdoc' || plainName === 'srcset') { changed = true; continue; }
        if (plainName === 'style' && isDangerousStyle(value)) { changed = true; continue; }

        const unsafeUrl = plainName === 'href'
            ? !isSafeLinkUrl(value)
            : URL_ATTRIBUTES.has(plainName) && !isSafeLocalMediaUrl(value);
        if (unsafeUrl) {
            changed = true;
            rebuilt += ` ${name}="#"`;
            continue;
        }
        rebuilt += hasValue ? ` ${name}="${value.replace(/"/g, '&quot;')}"` : ` ${name}`;
    }
    return changed ? `${rebuilt}${selfClosing ? ' /' : ''}>` : tag;
}

function normalizeFieldHtml(text: string): string {
    let result = text;

    // Remove dangerous containers and script vectors entirely.
    // Repeat paired-container removal to collapse nested/malformed variants before
    // stripping any unmatched opening/closing tag remnants.
    for (let pass = 0; pass < 4; pass++) {
        const before = result;
        result = result.replace(
            /<\s*(script|svg|math|style|iframe|object|embed|frame|frameset|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
            '',
        );
        if (result === before) break;
    }
    result = result
        .replace(/<\/?\s*(?:script|svg|math|style|iframe|object|embed|frame|frameset|form|maction|annotation-xml|meta|link|base)\b[^>]*>/gi, '')
        .replace(/<\?(?:xml|php)[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

    // Attribute scrubbing walks each tag's attribute list. Running the patterns over raw text —
    // even over a whole tag — also rewrites anything that merely looks like an attribute, and a
    // cloze answer parked in `data-cloze="…style=&quot;color:red&quot;…"` is exactly that.
    result = result.replace(HTML_TAG, (rawTag) => scrubTagAttributes(rawTag));

    result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
        return `<audio controls src="${escapeHtml(filename)}"></audio>`;
    });

    return result;
}

/** Sanitize untrusted editable/imported HTML before it crosses a WebView boundary. */
export function sanitizeUntrustedHtml(text: string): string {
    return normalizeFieldHtml(text);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
/** Decode CSS escapes browsers resolve before deciding whether a value is a URL. */
function decodeCssSecurityEscapes(css: string): string {
    return css.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/gi, (_match, hex: string) => {
        const codePoint = Math.min(parseInt(hex, 16), 0x10ffff);
        return codePoint === 0 ? '\ufffd' : String.fromCodePoint(codePoint);
    }).replace(/\\([^\r\n\f0-9a-f])/gi, '$1');
}

/** Prevent CSS breakout and network/script-capable CSS imports from imported stylesheets. */
function scrubCss(css: string): string {
    return decodeCssSecurityEscapes(decodeSecurityEntities(css))
        .replace(/<\/style/gi, '<\\/style')
        .replace(/@import[\s\S]*?(?:;|$)/gi, '')
        .replace(/url\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi, (_match, _quote: string, raw: string) => {
            const value = raw.trim();
            return isSafeLocalMediaUrl(value) ? `url("${value.replace(/"/g, '%22')}")` : 'none';
        })
        .replace(/(?:image-set|-webkit-image-set|cross-fade|image)\s*\([^)]*\)/gi, 'none')
        .replace(/(?:expression|behavior|-moz-binding)\s*:[^;}]*/gi, '');
}

function wrapInCardHtml(
    body: string,
    css: string,
    side: 'question' | 'answer',
    shell?: { ordinal?: number; nightMode?: boolean; platformClasses?: string },
    templateCss?: string,
): string {
    const safeCss = scrubCss(css);

    // AnkiDroid's flashcard.css, minus the parts that only make sense with its own chrome: the
    // reset, word wrapping, media that fits the screen, and the typed-answer comparison colours.
    const baseCss = 'html,body{margin:0;padding:0;}'
        + ' .card{overflow-wrap:break-word;}'
        + ' .card img, .card video { max-width: 100%; height: auto; }'
        + ' .card audio { max-width: 100%; }'
        + ' #typeans.tus-type-answer-input { box-sizing: border-box; max-width: 100%; font: inherit; }'
        + ' .typeanswer { white-space: pre-wrap; }'
        + ' .typeGood { background: #0f0; }'
        + ' .typeBad { background: #f00; }'
        + ' .typeMissed { background: #ccc; }';

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
