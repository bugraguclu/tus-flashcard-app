/** Independently derived name-first mapping; https://docs.ankiweb.net/browsing.html#changing-the-note-type */
import { translateActive } from './i18n';
import type { NoteType } from './models';

/**
 * For each target slot, the index of the source slot it takes: same name first, then each
 * still-unused source slot in order. Every name match is reserved before any positional fill,
 * so one source slot is never used twice.
 */
function nameThenPositionMap(sourceNames: string[], targetNames: string[]): number[] {
    const used = new Set<number>();
    const mapping = targetNames.map(name => {
        const index = sourceNames.findIndex((candidate, i) => !used.has(i) && candidate === name);
        if (index >= 0) used.add(index);
        return index;
    });
    return mapping.map(index => {
        if (index >= 0) return index;
        const next = sourceNames.findIndex((_, i) => !used.has(i));
        if (next >= 0) used.add(next);
        return next;
    });
}

export function mapNoteTypeFields(source: NoteType, target: NoteType, values: string[]): string[] {
    return nameThenPositionMap(source.fields.map(f => f.name), target.fields.map(f => f.name))
        .map(index => (index < 0 ? '' : values[index] ?? ''));
}

/**
 * Source card ordinal → target card ordinal, or null when the card has no place in the target
 * type. Standard → standard templates map like fields (name, then unused source templates by
 * position). Converting into a cloze type keeps every ordinal (card n becomes cloze n); cloze →
 * standard keeps the ordinals the target has templates for.
 */
export function mapNoteTypeCardOrd(source: NoteType, target: NoteType, ord: number): number | null {
    if (target.kind === 'cloze') return ord;
    if (source.kind === 'cloze') return ord < target.templates.length ? target.templates[ord]?.ord ?? ord : null;
    const sourceIndex = source.templates.findIndex(t => t.ord === ord);
    if (sourceIndex < 0) return null;
    const map = nameThenPositionMap(source.templates.map(t => t.name), target.templates.map(t => t.name));
    const targetIndex = map.indexOf(sourceIndex);
    return targetIndex < 0 ? null : target.templates[targetIndex]?.ord ?? targetIndex;
}

/** Thrown when a conversion would remove cards without `allowCardDeletion`; its message is user-facing. */
export class NoteTypeChangeConfirmationRequired extends Error {
    constructor(public readonly cardCount: number) {
        super(translateActive('noteTypes.changeNeedsConfirmation', { count: cardCount }));
        this.name = 'NoteTypeChangeConfirmationRequired';
    }
}
