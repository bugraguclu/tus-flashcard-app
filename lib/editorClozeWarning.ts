import type { Note, NoteType } from './models';
import { clozeNumbersForNote } from './templates';
/** A retained first card is a safety fallback, not evidence that the note has a deletion. */
export function needsClozeWarning(type: NoteType, note: Note): boolean {
    return type.kind === 'cloze' && clozeNumbersForNote(type, note).length === 0;
}
