/**
 * The browser's "Change Note Type" action: count the cards the conversion would remove, ask
 * before removing any, then convert. Cards whose template has a counterpart in the new type keep
 * their scheduling; the rest are removed with their review history retained.
 * https://docs.ankiweb.net/browsing.html#changing-the-note-type
 */
import { formatCount, type SupportedLocale } from './i18n';
import { changeNotesTypeUndoable, getNoteTypeChangeDeletionCount, type NoteTypeChangeResult } from './noteTypeStore';

export interface NoteTypeChangeSteps {
    /** Runs the conversion behind the caller's refresh and error alert. */
    run: (action: () => void) => void;
    /** Asks before cards are removed; calls `onConfirm` only when the learner agrees. */
    confirmCardRemoval: (cardCount: number, onConfirm: () => void) => void;
    countRemovedCards?: (noteIds: number[], targetNoteTypeId: number) => number;
    convert?: (noteIds: number[], targetNoteTypeId: number, options?: { allowCardDeletion?: boolean }) => number;
    /** Receives the finished conversion so the caller can offer its one-shot Undo. */
    offerUndo?: (result: NoteTypeChangeResult) => void;
}

export function changeNoteTypeWithConfirmation(noteIds: number[], targetNoteTypeId: number, steps: NoteTypeChangeSteps): void {
    const countRemovedCards = steps.countRemovedCards ?? getNoteTypeChangeDeletionCount;
    const convert = steps.convert ?? ((ids: number[], target: number, options?: { allowCardDeletion?: boolean }) => {
        const result = changeNotesTypeUndoable(ids, target, options);
        if (result.changed > 0) steps.offerUndo?.(result);
        return result.changed;
    });

    let removed = 0;
    try {
        removed = countRemovedCards(noteIds, targetNoteTypeId);
    } catch {
        // The plain conversion below repeats this count and refuses to remove cards without
        // confirmation, so a failed preflight surfaces through the caller's alert instead.
        removed = 0;
    }

    if (removed > 0) {
        steps.confirmCardRemoval(removed, () => steps.run(() => convert(noteIds, targetNoteTypeId, { allowCardDeletion: true })));
        return;
    }
    steps.run(() => convert(noteIds, targetNoteTypeId));
}

export function noteTypeChangeRemovalPrompt(
    cardCount: number,
    l: (turkish: string, english: string) => string,
    locale: SupportedLocale,
): { title: string; message: string } {
    const count = formatCount(cardCount, locale);
    return {
        title: l('Kartlar silinsin mi?', 'Remove Cards?'),
        message: l(
            `Yeni not türünde karşılığı olmayan ${count} kart silinecek. Bu kartların tekrar geçmişi korunur; diğer kartlar zamanlamasını korur.`,
            cardCount === 1
                ? '1 card has no counterpart in the new note type and will be removed. Its review history is kept, and the other cards keep their scheduling.'
                : `${count} cards have no counterpart in the new note type and will be removed. Their review history is kept, and the other cards keep their scheduling.`,
        ),
    };
}
