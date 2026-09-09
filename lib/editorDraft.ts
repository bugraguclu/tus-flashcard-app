export interface EditorDraftState {
    question?: string;
    answer?: string;
    reverseAnswer?: string;
    fields?: string[];
    cardTypeId: number;
    deckId: number | null;
    tags: string[];
}

/**
 * Returns true if a field has no visible user content or media attachments.
 * Empty strings, whitespace, and empty HTML container tags (<p></p>, <br>, <div></div>, &nbsp;)
 * are considered blank so that browser/WebKit artifacts do not register as dirty card edits.
 */
export function isFieldContentBlank(value: string | undefined): boolean {
    if (!value || typeof value !== 'string') return true;
    if (/\[sound:[^\]]+\]/i.test(value)) return false;
    if (/<\s*(?:img|video|audio)\b/i.test(value)) return false;
    const plainText = value
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/gi, '&')
        .trim();
    return plainText.length === 0;
}

export function isDraftContentBlank(draft: EditorDraftState): boolean {
    if (Array.isArray(draft.fields)) {
        return draft.fields.every((field) => isFieldContentBlank(field));
    }
    return isFieldContentBlank(draft.question)
        && isFieldContentBlank(draft.answer)
        && (draft.cardTypeId !== 7 || isFieldContentBlank(draft.reverseAnswer));
}

function normalizeField(value: string): string {
    if (isFieldContentBlank(value)) return '';
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
 * In add mode (!isEditing), destination deck selection is a destination picker, not an edit to
 * card content. Selecting a deck or changing note types on an empty card does not create dirty
 * card state.
 */
export function editorDraftKey(state: EditorDraftState, isEditing = false): string {
    const rawFields = Array.isArray(state.fields)
        ? state.fields
        : (state.cardTypeId === 7
            ? [state.question ?? '', state.answer ?? '', state.reverseAnswer ?? '']
            : [state.question ?? '', state.answer ?? '']);

    return JSON.stringify({
        fields: rawFields.map(normalizeField),
        cardTypeId: state.cardTypeId,
        deckId: isEditing ? state.deckId : null,
        tags: normalizeTags(state.tags),
    });
}

export function hasEditorDraftChanged(
    initialKey: string | null,
    current: EditorDraftState,
    isEditing = false,
): boolean {
    if (initialKey === null) return false;

    // In add mode, if card content is blank, never treat the draft as dirty.
    // Changing decks or note types on an empty new card must never prompt to discard changes.
    if (!isEditing && isDraftContentBlank(current)) {
        return false;
    }

    return initialKey !== editorDraftKey(current, isEditing);
}
