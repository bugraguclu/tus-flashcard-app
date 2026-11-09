import type { ExternalAppAction, ExternalLinkRejection } from './externalLinking';
import { getAllNoteTypes } from './noteManager';
import { getDeckByName } from './deckManager';
import { isCatalogDeck } from './catalogProtection';
import { localizeFieldName, localizeNoteTypeName } from './i18n';

export interface ExternalActionRoute {
    pathname: '/browser' | '/editor';
    params: Record<string, string>;
}

/** The screen an x-callback action opens, or why the collection cannot serve it. */
export type ExternalActionResult = ExternalActionRoute | { rejected: ExternalLinkRejection };

const nameKey = (name: string) => name.normalize('NFC').trim().toLocaleLowerCase();

/**
 * The screen an x-callback action opens: a browser search, or the editor filled with the note's
 * fields. An add-note request that names a note type or deck the collection does not have, a
 * filtered or catalog deck (the editor would quietly file the note in another deck), or none of
 * the note type's fields is refused with its reason, so the learner can be told rather than left
 * with nothing or with an empty editor. Shared by the iPhone URL handler (`app/_layout.tsx`) and
 * the web route (`app/x-callback-url.tsx`).
 *
 * A note type or field is found by its name as written, or failing that in another case or by
 * the Turkish label the app shows for a built-in one (`type=Temel`, `fldÖn`).
 */
export function externalActionRoute(action: ExternalAppAction): ExternalActionResult {
    if (action.kind === 'search') {
        return { pathname: '/browser', params: { initialSearch: action.query } };
    }
    const wantedType = nameKey(action.noteTypeName);
    const noteTypes = getAllNoteTypes();
    const noteType = noteTypes.find((entry) => nameKey(entry.name) === wantedType)
        ?? noteTypes.find((entry) => nameKey(localizeNoteTypeName('tr', entry.name)) === wantedType);
    if (!noteType) return { rejected: { reason: 'noteTypeNotFound', noteTypeName: action.noteTypeName } };
    const deck = getDeckByName(action.deckName);
    if (!deck) return { rejected: { reason: 'deckNotFound', deckName: action.deckName } };
    if (deck.isFiltered) return { rejected: { reason: 'filteredDeck', deckName: deck.name } };
    if (isCatalogDeck(deck)) return { rejected: { reason: 'catalogDeck', deckName: deck.name } };

    const given = Object.entries(action.fields);
    let matched = 0;
    const fieldValues = noteType.fields.map((field) => {
        if (Object.prototype.hasOwnProperty.call(action.fields, field.name)) {
            matched++;
            return action.fields[field.name];
        }
        const names = new Set([nameKey(field.name), nameKey(localizeFieldName('tr', field.name))]);
        const entry = given.find(([key]) => names.has(nameKey(key)));
        if (!entry) return '';
        matched++;
        return entry[1];
    });
    if (matched === 0) {
        return {
            rejected: {
                reason: 'noMatchingFields',
                noteTypeName: noteType.name,
                fieldNames: noteType.fields.map((field) => field.name),
            },
        };
    }
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
