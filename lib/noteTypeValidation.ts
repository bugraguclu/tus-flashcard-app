/**
 * Checks Anki runs before it saves a note type, derived from its behaviour (Fields dialog and
 * card-template errors): https://docs.ankiweb.net/templates/fields.html and
 * https://docs.ankiweb.net/templates/errors.html.
 */
import type { NoteType } from './models';

/** Names Anki's renderer supplies itself; a template may use them without a matching field. */
export const TEMPLATE_SPECIAL_FIELDS = ['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'Card', 'CardFlag', 'CardID'] as const;

export type FieldNameSyntaxError = 'reservedPrefix' | 'reservedCharacter';

/** Anki's Fields dialog refuses a name starting with `#`, `^` or `/`, or containing `:{}"`. */
export function fieldNameSyntaxError(name: string): FieldNameSyntaxError | null {
    const trimmed = name.trim();
    if (/^[#^/]/.test(trimmed)) return 'reservedPrefix';
    if (/[:{}"]/.test(trimmed)) return 'reservedCharacter';
    return null;
}

export type NoteTypeProblem =
    | { kind: 'duplicateField'; field: string }
    | { kind: 'invalidFieldName'; field: string; reason: FieldNameSyntaxError }
    | { kind: 'unknownField'; template: string; side: 'front' | 'back'; field: string }
    | { kind: 'unclosedSection'; template: string; side: 'front' | 'back'; field: string }
    | { kind: 'unexpectedClose'; template: string; side: 'front' | 'back'; field: string }
    | { kind: 'noFrontField'; template: string }
    | { kind: 'missingCloze'; template: string };

interface TemplateScan { problems: NoteTypeProblem[]; references: string[]; hasCloze: boolean }

function scanTemplate(source: string, template: string, side: 'front' | 'back', known: Set<string>): TemplateScan {
    const problems: NoteTypeProblem[] = [];
    const references: string[] = [];
    const stack: string[] = [];
    let hasCloze = false;
    const isKnown = (key: string) => known.has(key) || /^c\d+$/.test(key);
    for (const match of source.matchAll(/\{\{([^{}]*)\}\}/g)) {
        const body = match[1].trim();
        if (!body || body.startsWith('!') || body.startsWith('=')) continue;
        const sigil = body[0];
        if (sigil === '#' || sigil === '^') {
            const key = body.slice(1).trim();
            if (!isKnown(key)) problems.push({ kind: 'unknownField', template, side, field: key });
            stack.push(key);
            continue;
        }
        if (sigil === '/') {
            const key = body.slice(1).trim();
            if (stack[stack.length - 1] === key) stack.pop();
            else problems.push({ kind: 'unexpectedClose', template, side, field: key });
            continue;
        }
        const segments = body.split(':');
        const key = segments.pop()!.trim();
        if (segments.some((segment) => ['cloze', 'cloze-only'].includes(segment.trim()))) hasCloze = true;
        if (!key) continue; // `{{tts-voices:}}` and similar take no field
        if (!isKnown(key)) problems.push({ kind: 'unknownField', template, side, field: key });
        else references.push(key);
    }
    for (const key of stack) problems.push({ kind: 'unclosedSection', template, side, field: key });
    return { problems, references, hasCloze };
}

/** Every reason the note type should not be saved yet; empty when it is fine. */
export function validateNoteType(nt: NoteType): NoteTypeProblem[] {
    const problems: NoteTypeProblem[] = [];
    const seen = new Set<string>();
    for (const field of nt.fields) {
        const key = field.name.trim().normalize('NFC').toLowerCase();
        if (seen.has(key)) problems.push({ kind: 'duplicateField', field: field.name });
        seen.add(key);
        const reason = fieldNameSyntaxError(field.name);
        if (reason) problems.push({ kind: 'invalidFieldName', field: field.name, reason });
    }
    const fieldNames = new Set(nt.fields.map((field) => field.name));
    const known = new Set<string>([...fieldNames, ...TEMPLATE_SPECIAL_FIELDS]);
    for (const template of nt.templates) {
        const front = scanTemplate(template.qfmt, template.name, 'front', known);
        const back = scanTemplate(template.afmt, template.name, 'back', known);
        problems.push(...front.problems, ...back.problems);
        if (nt.kind === 'cloze') {
            if (!front.hasCloze) problems.push({ kind: 'missingCloze', template: template.name });
        } else if (!front.references.some((key) => fieldNames.has(key))) {
            problems.push({ kind: 'noFrontField', template: template.name });
        }
    }
    return problems;
}
