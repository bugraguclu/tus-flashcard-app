/**
 * Anki's Find Duplicates (Notes › Find Duplicates) for the card browser.
 *
 * Behaviour, from the manual (https://docs.ankiweb.net/browsing.html#finding-duplicates) and
 * `find_dupes` in ankitects/anki pylib/anki/collection.py (read for behaviour only, independently
 * implemented here):
 *
 * - The field is chosen by name and looked for in every note type that has a field of that name,
 *   whatever its case; notes of other types are not compared. An optional search narrows the
 *   notes first.
 * - Two notes are duplicates when the field's text is identical once its formatting is removed
 *   the way Anki removes it (`strip_html_media`: tags stripped, media file names kept, entities
 *   decoded; no trimming or case folding). An empty value is never a duplicate.
 * - Groups are listed in the order their second note is met, notes in id order, as Anki lists them.
 * - "Tag Duplicates" adds the tag `duplicate` to every note in every group.
 */

import { getDB } from './db';
import type { Note, NoteType } from './models';
import { getAllNoteTypes } from './noteTypeStore';
import { checksumFieldText } from './noteChecksum';
import { matchingCollectionCardIds } from './collectionCardSearch';
import { updateNotesTags } from './noteTagStore';
import { fieldIndexByName } from './browserFieldNames';

/** The tag Anki's Tag Duplicates adds. */
export const DUPLICATE_TAG = 'duplicate';

export interface DuplicateGroup {
    /** The field's text without its formatting, which every note of the group shares. */
    value: string;
    /** The notes, in id order. */
    noteIds: number[];
    /** A browser search that lists exactly this group. */
    search: string;
}

interface NoteRow { id: number; noteTypeId: number; data: string }

interface Member { noteId: number; noteTypeId: number; ord: number; firstField: string }

const NOTE_COLUMNS = 'n.id AS id, n.noteTypeId AS noteTypeId, n.data AS data';
const HAS_CARD = 'EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = n.id)';

/** The notes to compare: those the search finds (any of their cards matching), or all of them. */
function candidateRows(search: string): NoteRow[] {
    const db = getDB();
    if (!search) {
        return db.getAllSync<NoteRow>(`SELECT ${NOTE_COLUMNS} FROM notes n WHERE ${HAS_CARD} ORDER BY n.id`);
    }
    const cardIds = matchingCollectionCardIds(search);
    if (cardIds.length === 0) return [];
    // One JSON parameter: a search can match more cards than SQLite binds variables.
    return db.getAllSync<NoteRow>(
        `SELECT ${NOTE_COLUMNS} FROM notes n
         WHERE n.id IN (SELECT noteId FROM anki_cards WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?)))
         ORDER BY n.id`,
        JSON.stringify(cardIds),
    );
}

function parseFields(data: string): string[] | null {
    try {
        const fields = (JSON.parse(data) as Partial<Note>)?.fields;
        return Array.isArray(fields) ? fields : null;
    } catch {
        // An unreadable note is left for the database check, as the search scan leaves it.
        return null;
    }
}

/** Write a search value so the parser hands it back unchanged (see `unescapeSearchText`). */
function searchText(value: string): string {
    return value.replace(/[\\"]/g, '\\$&');
}

/**
 * The browser search for a group. When the group is one note type's notes compared on its first
 * field, that is Anki's `dupe:` term, which says what the group is and keeps listing it as notes
 * are edited; any other group (another field, or note types mixed) is listed by note id, as
 * Anki's dialog lists every group.
 */
function groupSearch(value: string, members: readonly Member[], search: string): string {
    const noteTypeId = members[0].noteTypeId;
    if (members.some((member) => member.noteTypeId !== noteTypeId || member.ord !== 0)) {
        return `nid:${members.map((member) => member.noteId).join(',')}`;
    }
    // `dupe:` strips the text it is given once more. A value that stripping would change again
    // (decoded text that reads as markup or an entity) is given as one note's own field instead,
    // which strips to the value by definition.
    const text = checksumFieldText(value) === value ? value : members[0].firstField;
    const term = `"dupe:${noteTypeId},${searchText(text)}"`;
    return search ? `(${search}) ${term}` : term;
}

/**
 * Groups of notes whose `fieldName` field holds the same text. `search` (browser syntax) narrows
 * the notes compared; an invalid search throws `SearchSyntaxError` before anything is read.
 */
export function findDuplicates(fieldName: string, search = '', noteTypes: readonly NoteType[] = getAllNoteTypes()): DuplicateGroup[] {
    const narrow = search.trim();
    const typesById = new Map(noteTypes.map((noteType) => [noteType.id, noteType]));
    const ordByType = new Map<number, number>();
    const ordOf = (noteTypeId: number) => {
        if (!ordByType.has(noteTypeId)) {
            const noteType = typesById.get(noteTypeId);
            ordByType.set(noteTypeId, noteType ? fieldIndexByName(noteType, fieldName) : -1);
        }
        return ordByType.get(noteTypeId)!;
    };

    const byValue = new Map<string, Member[]>();
    const groups: Array<{ value: string; members: Member[] }> = [];
    for (const row of candidateRows(narrow)) {
        const noteTypeId = Number(row.noteTypeId);
        const ord = ordOf(noteTypeId);
        if (ord < 0) continue;
        const fields = parseFields(row.data);
        const raw = fields?.[ord];
        if (typeof raw !== 'string') continue;
        const value = checksumFieldText(raw);
        if (!value) continue;
        const member = { noteId: Number(row.id), noteTypeId, ord, firstField: typeof fields?.[0] === 'string' ? fields[0] : '' };
        const members = byValue.get(value);
        if (!members) {
            byValue.set(value, [member]);
            continue;
        }
        members.push(member);
        if (members.length === 2) groups.push({ value, members });
    }

    return groups.map(({ value, members }) => ({
        value,
        noteIds: members.map((member) => member.noteId),
        search: groupSearch(value, members, narrow),
    }));
}

/** Every note of every group, once. */
export function duplicateNoteIds(groups: readonly DuplicateGroup[]): number[] {
    return [...new Set(groups.flatMap((group) => group.noteIds))];
}

/**
 * Anki's Tag Duplicates: add `duplicate` to every note in every group, as one transaction.
 * Returns how many notes gained the tag; notes that had it already are left as they were.
 */
export function tagDuplicates(groups: readonly DuplicateGroup[]): number {
    return updateNotesTags(duplicateNoteIds(groups), [DUPLICATE_TAG], []);
}
