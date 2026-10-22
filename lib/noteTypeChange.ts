/** Independently derived name-first mapping; https://docs.ankiweb.net/browsing.html#changing-the-note-type */
import type { NoteType } from './models';
export function mapNoteTypeFields(source: NoteType, target: NoteType, values: string[]): string[] {
    const used = new Set<number>();
    const mapping = target.fields.map(field => {
        const index = source.fields.findIndex((candidate, i) => !used.has(i) && candidate.name === field.name);
        if (index >= 0) used.add(index);
        return index;
    });
    // Reserve every name match before assigning any remaining field, avoiding double use.
    return mapping.map(index => {
        if (index < 0) {
            index = source.fields.findIndex((_, i) => !used.has(i));
            if (index >= 0) used.add(index);
        }
        return index < 0 ? '' : values[index] ?? '';
    });
}
export function mapNoteTypeCardOrd(source: NoteType, target: NoteType, ord: number): number | null {
    if (source.kind === 'cloze' && target.kind === 'cloze') return ord;
    if (target.kind === 'cloze') return ord === 0 ? 0 : null;
    if (source.kind === 'cloze') return ord === 0 ? target.templates[0]?.ord ?? null : null;
    const name = source.templates.find(t => t.ord === ord)?.name;
    return target.templates.find(t => t.name === name)?.ord ?? null;
}
export class NoteTypeChangeConfirmationRequired extends Error {
    constructor(public readonly cardCount: number) {
        super(`Confirmation required: changing note type would delete ${cardCount} unmapped cards.`);
        this.name = 'NoteTypeChangeConfirmationRequired';
    }
}
