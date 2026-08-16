export interface EditorDraftState {
    question: string;
    answer: string;
    reverseAnswer: string;
    cardTypeId: number;
    deckId: number | null;
    tags: string[];
}

function normalizeField(value: string): string {
    return value
        .normalize('NFC')
        .replace(/\r\n?/g, '\n')
        .trim();
}

function normalizeTags(tags: string[]): string[] {
    return [...new Set(
        tags
            .map((tag) => tag.normalize('NFC').trim())
            .filter(Boolean),
    )].sort();
}

/**
 * Returns a stable representation of the card values that are persisted by the editor.
 * UI-only preferences (for example pinned fields and toolbar visibility) intentionally do
 * not participate in the comparison because they are saved as soon as they are changed.
 */
export function editorDraftKey(state: EditorDraftState): string {
    return JSON.stringify({
        question: normalizeField(state.question),
        answer: normalizeField(state.answer),
        reverseAnswer: state.cardTypeId === 7 ? normalizeField(state.reverseAnswer) : '',
        cardTypeId: state.cardTypeId,
        deckId: state.deckId,
        tags: normalizeTags(state.tags),
    });
}

export function hasEditorDraftChanged(initialKey: string | null, current: EditorDraftState): boolean {
    return initialKey !== null && initialKey !== editorDraftKey(current);
}
