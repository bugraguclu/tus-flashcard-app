// ============================================================
// TUS Flashcard - Template Engine (Mustache-like, Anki compatible)
// Supports: {{Field}}, {{FrontSide}}, {{cloze:Field}}, {{type:Field}}
// Conditionals: {{#Field}}...{{/Field}}, {{^Field}}...{{/Field}}
// Special: {{Tags}}, {{Type}}, {{Deck}}, {{Card}}
// ============================================================

import type { NoteType, Note } from './models';

// ---- Cloze Parsing ----

/** Extract cloze numbers from text: "{{c1::foo}} {{c2::bar}}" → [1, 2] */
export function extractClozeNumbers(text: string): number[] {
    const regex = /\{\{c(\d+)::/g;
    const numbers = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        numbers.add(parseInt(match[1], 10));
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * Index of the field a cloze note type clozes over, resolved from its `{{cloze:Field}}`
 * template (Anki's source of truth). Falls back to a field literally named "Text", then to
 * the first field, so custom cloze note types are not silently broken.
 */
export function clozeFieldIndex(noteType: NoteType): number {
    const match = noteType.templates[0]?.qfmt.match(/\{\{(?:edit:)?cloze:([^{}]+?)\}\}/);
    if (match) {
        const idx = noteType.fields.findIndex(f => f.name === match[1].trim());
        if (idx !== -1) return idx;
    }
    const named = noteType.fields.findIndex(f => f.name === 'Text');
    return named === -1 ? 0 : named;
}

/** Render cloze deletion for a specific ordinal (question side) */
export function renderClozeQuestion(text: string, targetOrd: number): string {
    // Replace target cloze with blank
    let result = text.replace(
        new RegExp(`\\{\\{c${targetOrd}::([^}]*?)(?:::([^}]*))?\\}\\}`, 'g'),
        (_match, content, hint) => {
            if (hint) {
                return `<span class="cloze-blank">[${hint}]</span>`;
            }
            return `<span class="cloze-blank">[...]</span>`;
        }
    );

    // Reveal all other clozes (show their content)
    result = result.replace(
        /\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/g,
        (_match, content) => content
    );

    return result;
}

/** Render cloze deletion for a specific ordinal (answer side) */
export function renderClozeAnswer(text: string, targetOrd: number): string {
    // Highlight target cloze answer
    let result = text.replace(
        new RegExp(`\\{\\{c${targetOrd}::([^}]*?)(?:::[^}]*)?\}\}`, 'g'),
        (_match, content) => `<span class="cloze">${content}</span>`
    );

    // Reveal all other clozes
    result = result.replace(
        /\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/g,
        (_match, content) => content
    );

    return result;
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
    /** What the user typed for a {{type:Field}} prompt, once the answer side is shown.
     *  undefined = not answered yet (question side, or no typed-answer field on this card). */
    typedAnswer?: string;
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

/** Render a template string with the given context */
export function renderTemplate(template: string, ctx: RenderContext): string {
    const conditionalFields = {
        ...ctx.fields,
        Tags: ctx.tags || '',
        Type: ctx.typeName || '',
        Deck: ctx.deckName || '',
        Card: ctx.cardName || '',
        FrontSide: ctx.frontSide || '',
    };
    let result = renderConditionalNodes(parseConditionalNodes(template), conditionalFields);

    // Special fields
    result = result.replace(/\{\{FrontSide\}\}/g, ctx.omitFrontSide ? '' : ctx.frontSide || '');
    if (ctx.omitFrontSide) {
        // The answer separator only makes sense with the front side rendered above it.
        result = result.replace(/<hr id=["']?answer["']?\s*\/?>/gi, '');
    }
    result = result.replace(/\{\{Tags\}\}/g, ctx.tags || '');
    result = result.replace(/\{\{Type\}\}/g, ctx.typeName || '');
    result = result.replace(/\{\{Deck\}\}/g, ctx.deckName || '');
    result = result.replace(/\{\{Card\}\}/g, ctx.cardName || '');

    // Cloze fields: {{cloze:FieldName}}. AnKing's desktop editor add-on uses
    // {{edit:cloze:FieldName}}; editing is unavailable during review here, but the cloze itself
    // must render identically instead of disappearing as an unknown filter.
    result = result.replace(
        /\{\{(?:edit:)?cloze:([^{}]+?)\}\}/g,
        (_match, rawField) => {
            const field = rawField.trim();
            const value = ctx.fields[field] || '';
            if (ctx.clozeOrd !== undefined) {
                // On question side, frontSide is not set yet.
                if (!ctx.frontSide) {
                    return renderClozeQuestion(value, ctx.clozeOrd);
                }
                return renderClozeAnswer(value, ctx.clozeOrd);
            }
            return value;
        }
    );

    // Type-in-the-answer: {{type:FieldName}}. The WebView runs no JS, so a live <input> here
    // would be inert — the real text box is a native TextInput the study screen renders
    // alongside the question. On the question side this placeholder stays empty; once the
    // answer is shown, ctx.typedAnswer (if any) is diffed against the field's real value.
    result = result.replace(
        /\{\{type:([^{}]+?)\}\}/g,
        (_match, rawField) => {
            const field = rawField.trim();
            const value = ctx.fields[field] || '';
            if (!ctx.frontSide) return '';
            if (ctx.typedAnswer === undefined) return `<div class="typeanswer">${escapeHtml(value)}</div>`;
            return renderTypeAnswerDiff(ctx.typedAnswer, value);
        }
    );

    // Anki's hint filter normally injects a JavaScript toggle. Card WebViews deliberately run
    // without imported JavaScript, so native HTML <details> preserves the reveal interaction.
    result = result.replace(
        /\{\{hint:([^{}]+?)\}\}/g,
        (_match, rawField) => {
            const field = rawField.trim();
            const value = ctx.fields[field] || '';
            return value
                ? `<details class="hint"><summary>${escapeHtml(field)}</summary><div>${value}</div></details>`
                : '';
        },
    );

    // AnKing's clickable tag filter depends on template JavaScript. Render the complete tag list
    // as inert chips so no tag information is lost when scripts are stripped.
    result = result.replace(/\{\{clickable::Tags\}\}/g, () => {
        return (ctx.tags || '')
            .split(/\s+/)
            .filter(Boolean)
            .map((tag) => `<kbd>${escapeHtml(tag)}</kbd>`)
            .join(' ');
    });

    // Regular field substitution: {{FieldName}} — allow HTML in note fields.
    result = result.replace(
        /\{\{([^{}]+?)\}\}/g,
        (_match, rawField) => {
            // Unknown benign Anki filters degrade to their final field rather than blanking the
            // content. Structural block markers were already consumed above.
            const field = rawField.split(':').filter(Boolean).pop()?.trim() ?? '';
            if (field === 'Tags') return ctx.tags || '';
            return ctx.fields[field] || '';
        }
    );

    return result;
}

/** Render complete card HTML (question or answer) */
export function renderCardHtml(
    noteType: NoteType,
    note: Note,
    templateOrd: number,
    side: 'question' | 'answer',
    options?: { deckName?: string; clozeOrd?: number; typedAnswer?: string; omitFrontSide?: boolean }
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
    };
    // Templates are imported content too. Sanitize the fully rendered side so a malicious
    // qfmt/afmt cannot bypass the field-level sanitizer used above.
    const questionHtml = normalizeFieldHtml(renderTemplate(template.qfmt, questionCtx));

    if (side === 'question') {
        return wrapInCardHtml(questionHtml, noteType.css, 'question');
    }

    // Render answer
    const answerCtx: RenderContext = {
        ...questionCtx,
        frontSide: questionHtml,
        typedAnswer: options?.typedAnswer,
        omitFrontSide: options?.omitFrontSide,
    };
    const answerHtml = normalizeFieldHtml(renderTemplate(template.afmt, answerCtx));
    return wrapInCardHtml(answerHtml, noteType.css, 'answer');
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

    // Decode character references inside tags before attribute checks. Browsers decode
    // them while parsing, so values such as java&#x73;cript: must be inspected decoded.
    result = result.replace(/<[^>]*>/g, (tag) => decodeSecurityEntities(tag));

    // Remove inline event handlers like onclick=..., onerror=..., onLoad=...
    result = result.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Remove srcdoc (can inline arbitrary HTML/JS in iframes if preserved by user HTML).
    result = result.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Neutralize unsafe URI schemes in link/media attributes.
    result = result.replace(
        /(href|src|xlink:href|poster)\s*=\s*(?:(['"])([\s\S]*?)\2|([^\s>]+))/gi,
        (_match, attr, quote, quotedValue, bareValue) => {
            const rawValue = String(quotedValue ?? bareValue ?? '').trim();
            const normalized = decodeSecurityEntities(rawValue)
                .replace(/[\u0000-\u001F\u007F\s]+/g, '')
                .toLowerCase();

            const isJsScheme = normalized.startsWith('javascript:') || normalized.startsWith('vbscript:');
            const isDangerousDataUri = normalized.startsWith('data:')
                && !/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(normalized)
                && !/^data:audio\/(?:mpeg|mp3|ogg|wav);base64,/i.test(normalized);

            const safeValue = (isJsScheme || isDangerousDataUri) ? '#' : rawValue;
            const q = quote || '"';
            return `${attr}=${q}${safeValue}${q}`;
        },
    );

    // Strip dangerous CSS payloads while preserving benign inline style values.
    result = result.replace(
        /\s+style\s*=\s*(?:(['"])([\s\S]*?)\1|([^\s>]+))/gi,
        (_match, quote, quotedValue, bareValue) => {
            const raw = String(quotedValue ?? bareValue ?? '').trim();
            const normalized = raw.replace(/\s+/g, '').toLowerCase();
            if (
                normalized.includes('expression(')
                || normalized.includes('javascript:')
                || normalized.includes('url(data:text/html')
                || normalized.includes('url(data:image/svg+xml')
            ) {
                return '';
            }
            const q = quote || '"';
            return ` style=${q}${raw}${q}`;
        },
    );

    result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
        return `<audio controls src="${escapeHtml(filename)}"></audio>`;
    });

    return result;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function wrapInCardHtml(body: string, css: string, side: 'question' | 'answer'): string {
    // Prevent CSS breakout and network/script-capable CSS imports from imported note types.
    const safeCss = css
        .replace(/<\/style/gi, '<\\/style')
        .replace(/@import[\s\S]*?(?:;|$)/gi, '')
        .replace(/url\(\s*(['"]?)(?:https?:|javascript:|data:text\/html|data:image\/svg\+xml)[\s\S]*?\1\s*\)/gi, 'none')
        .replace(/(?:expression|behavior|-moz-binding)\s*:[^;}]*/gi, '');
    // Both sides render as a centred, content-hugging white card with large text (the prompt and
    // answer should read big and sit in the middle). The `.card.side-*` selectors outrank a note
    // type's own `.card` rule, so a template can still override via `!important`. Media fits the
    // panel (AnkiDroid scales images to screen width). Declared before the note type's CSS so its
    // single-class rules stay overridable.
    const baseCss = 'html,body{margin:0;padding:0;}'
        + ' body{text-align:center;}'
        + ' .card img, .card video { max-width: 100%; max-height: 60vh; height: auto; }'
        + ' .card audio { max-width: 100%; }'
        + ' .card.side-question, .card.side-answer {'
        + ' display:inline-block; text-align:center; font-size:26px; line-height:1.5;'
        + ' background:#ffffff; border-radius:14px; padding:20px 24px; max-width:100%; box-sizing:border-box; }';
    return `<style>${baseCss}</style><style>${safeCss}</style><div class="card side-${side}">${body}</div>`;
}
