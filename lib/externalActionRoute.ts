import type { ExternalAppAction } from './externalLinking';
import { getAllNoteTypes } from './noteManager';
import { getDeckByName } from './deckManager';

export interface ExternalActionRoute {
    pathname: '/browser' | '/editor';
    params: Record<string, string>;
}

/**
 * The screen an x-callback action opens: a browser search, or the editor filled with the note's
 * fields. Null when an add-note request names a note type or deck the collection does not have —
 * the request is then ignored rather than filed somewhere else. Shared by the iPhone URL handler
 * (`app/_layout.tsx`) and the web route (`app/x-callback-url.tsx`).
 */
export function externalActionRoute(action: ExternalAppAction): ExternalActionRoute | null {
    if (action.kind === 'search') {
        return { pathname: '/browser', params: { initialSearch: action.query } };
    }
    const wantedType = action.noteTypeName.normalize('NFC').toLocaleLowerCase();
    const noteType = getAllNoteTypes().find((entry) => entry.name.normalize('NFC').toLocaleLowerCase() === wantedType);
    const deck = getDeckByName(action.deckName);
    if (!noteType || !deck || deck.isFiltered) {
        console.warn('[Linking] add-note target not found:', action.noteTypeName, action.deckName);
        return null;
    }
    const fieldValues = noteType.fields.map((field) => action.fields[field.name] ?? '');
    return {
        pathname: '/editor',
        params: {
            deckId: String(deck.id),
            noteTypeId: String(noteType.id),
            question: fieldValues[0] ?? '',
            answer: fieldValues[1] ?? '',
            fieldValues: JSON.stringify(fieldValues),
            tags: action.tags.join(' '),
            externalSuccessUrl: action.successUrl ?? '',
        },
    };
}
