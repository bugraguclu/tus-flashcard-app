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

/** Render a template string with the given context */
export function renderTemplate(template: string, ctx: RenderContext): string {
    let result = template;

    // 1. Handle conditionals first: {{#Field}}...{{/Field}}
    result = result.replace(
        /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
        (_match, field, content) => {
            const value = ctx.fields[field] || '';
            return value.trim() ? content : '';
        }
    );

    // 2. Negative conditionals: {{^Field}}...{{/Field}}
    result = result.replace(
        /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
        (_match, field, content) => {
            const value = ctx.fields[field] || '';
            return value.trim() ? '' : content;
        }
    );

    // 3. Special fields
    result = result.replace(/\{\{FrontSide\}\}/g, ctx.frontSide || '');
    result = result.replace(/\{\{Tags\}\}/g, ctx.tags || '');
    result = result.replace(/\{\{Type\}\}/g, ctx.typeName || '');
    result = result.replace(/\{\{Deck\}\}/g, ctx.deckName || '');
    result = result.replace(/\{\{Card\}\}/g, ctx.cardName || '');

    // 4. Cloze fields: {{cloze:FieldName}}
    result = result.replace(
        /\{\{cloze:(\w+)\}\}/g,
        (_match, field) => {
            const value = ctx.fields[field] || '';
            if (ctx.clozeOrd !== undefined) {
                // On question side, frontSide is not set yet
                if (!ctx.frontSide) {
                    return renderClozeQuestion(value, ctx.clozeOrd);
                }
                return renderClozeAnswer(value, ctx.clozeOrd);
            }
            return value;
        }
    );

    // 5. Type-in-the-answer: {{type:FieldName}}
    result = result.replace(
        /\{\{type:(\w+)\}\}/g,
        (_match, field) => {
            const value = ctx.fields[field] || '';
            return `<input type="text" class="type-answer" data-correct="${escapeHtml(value)}" placeholder="cevabınızı yazın..." />`;
        }
    );

    // 6. Regular field substitution: {{FieldName}} — allow HTML in note fields
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
    result = result.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
        return `<audio controls src="${filename}"></audio>`;
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
    return `<style>${css}</style><div class="card">${body}</div>`;
}
