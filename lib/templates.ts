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
}

type ConditionalNode =
    | { kind: 'text'; value: string }
    | { kind: 'section'; field: string; inverted: boolean; children: ConditionalNode[] };

function parseConditionalNodes(template: string): ConditionalNode[] {
    const tokenRegex = /\{\{([#^\/])(\w+)\}\}/g;
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
        const [token, sigil, field] = match;
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
    let result = renderConditionalNodes(parseConditionalNodes(template), ctx.fields);

    // Special fields
    result = result.replace(/\{\{FrontSide\}\}/g, ctx.frontSide || '');
    result = result.replace(/\{\{Tags\}\}/g, ctx.tags || '');
    result = result.replace(/\{\{Type\}\}/g, ctx.typeName || '');
    result = result.replace(/\{\{Deck\}\}/g, ctx.deckName || '');
    result = result.replace(/\{\{Card\}\}/g, ctx.cardName || '');

    // Cloze fields: {{cloze:FieldName}}
    result = result.replace(
        /\{\{cloze:(\w+)\}\}/g,
        (_match, field) => {
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

    // Type-in-the-answer: {{type:FieldName}}
    result = result.replace(
        /\{\{type:(\w+)\}\}/g,
        (_match, field) => {
            const value = ctx.fields[field] || '';
            return `<input type="text" class="type-answer" data-correct="${escapeHtml(value)}" placeholder="cevabınızı yazın..." />`;
        }
    );

    // Regular field substitution: {{FieldName}} — allow HTML in note fields.
    result = result.replace(
        /\{\{(\w+)\}\}/g,
        (_match, field) => ctx.fields[field] || ''
    );

    return result;
}

/** Render complete card HTML (question or answer) */
export function renderCardHtml(
    noteType: NoteType,
    note: Note,
    templateOrd: number,
    side: 'question' | 'answer',
    options?: { deckName?: string; clozeOrd?: number }
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
    const questionHtml = renderTemplate(template.qfmt, questionCtx);

    if (side === 'question') {
        return wrapInCardHtml(questionHtml, noteType.css);
    }

    // Render answer
    const answerCtx: RenderContext = {
        ...questionCtx,
        frontSide: questionHtml,
    };
    const answerHtml = renderTemplate(template.afmt, answerCtx);
    return wrapInCardHtml(answerHtml, noteType.css);
}

/** Check if a standard template should generate a card (first field reference non-empty) */
export function shouldGenerateCard(
    noteType: NoteType,
    note: Note,
    templateOrd: number
): boolean {
    if (noteType.kind === 'cloze') {
        // Cloze: check if the cloze number exists in the text
        const textFieldIdx = noteType.fields.findIndex(f => f.name === 'Text') || 0;
        const text = note.fields[textFieldIdx] || '';
        const numbers = extractClozeNumbers(text);
        return numbers.includes(templateOrd + 1);
    }

    // Standard: check if first referenced field is non-empty
    const template = noteType.templates[templateOrd];
    if (!template) return false;

    const fieldMatch = template.qfmt.match(/\{\{(\w+)\}\}/);
    if (!fieldMatch) return true;

    const fieldName = fieldMatch[1];
    if (['FrontSide', 'Tags', 'Type', 'Deck', 'Card'].includes(fieldName)) return true;

    const fieldIdx = noteType.fields.findIndex(f => f.name === fieldName);
    if (fieldIdx === -1) return true;

    return (note.fields[fieldIdx] || '').trim().length > 0;
}

/** Count how many cards a note should generate */
export function countCardsForNote(noteType: NoteType, note: Note): number {
    if (noteType.kind === 'cloze') {
        const textFieldIdx = noteType.fields.findIndex(f => f.name === 'Text') || 0;
        const text = note.fields[textFieldIdx] || '';
        return extractClozeNumbers(text).length || 1;
    }
    return noteType.templates.filter((_, i) => shouldGenerateCard(noteType, note, i)).length;
}

// ---- Helpers ----

function normalizeFieldHtml(text: string): string {
    let result = text;

    // Remove dangerous containers and script vectors entirely.
    result = result
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, '')
        .replace(/<\/?(?:iframe|object|embed|frame|frameset|meta|link|base)[^>]*>/gi, '')
        .replace(/<\?(?:xml|php)[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

    // Remove inline event handlers like onclick=..., onerror=..., onLoad=...
    result = result.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Remove srcdoc (can inline arbitrary HTML/JS in iframes if preserved by user HTML).
    result = result.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // Neutralize unsafe URI schemes in link/media attributes.
    result = result.replace(
        /(href|src|xlink:href|poster)\s*=\s*(?:(['"])([\s\S]*?)\2|([^\s>]+))/gi,
        (_match, attr, quote, quotedValue, bareValue) => {
            const rawValue = String(quotedValue ?? bareValue ?? '').trim();
            const normalized = rawValue.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();

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

function wrapInCardHtml(body: string, css: string): string {
    // Prevent CSS breakout via </style> injection.
    const safeCss = css.replace(/<\/style/gi, '<\\/style');
    return `<style>${safeCss}</style><div class="card">${body}</div>`;
}
