import type { Note } from './models';
import { dbUpsertFtsCard, getDB } from './db';
import { markSourcePackageDirty } from './ankiPackageArchive';
import {
    getAnkiCard,
    getCardsForNote,
    getNote,
    saveNote,
    searchIndexCardFromNote,
    serializeTags,
} from './noteStore';

/**
 * A note's tags: setting, adding and removing them, the marked tag, and the tag list of a scope.
 */

/** Compare two tag lists the way tags are matched everywhere else: NFC, case-insensitive. */
function sameTagList(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((tag, index) => tag.normalize('NFC').toLocaleLowerCase()
        === b[index].normalize('NFC').toLocaleLowerCase());
}

/**
 * Replace a note's tags and nothing else.
 *
 * Tags are the learner's own metadata rather than the note's content, which is why the protection
 * contract leaves them out of `assertCatalogNoteContentMutable` and why flags carry no assertion
 * at all. This path is open on a catalog note for the same reason, on the trial tier as well as
 * the full one: it re-reads the stored row and swaps only the tag list, so protected fields, the
 * note type and the guid cannot travel through it even if the caller passes a doctored note.
 * Everything else still goes through `saveNote`, which refuses a locked catalog note outright.
 *
 * Returns false when the note is gone or the tags already match.
 */
export function setNoteTags(noteId: number, tags: string[]): boolean {
    const stored = getNote(noteId);
    if (!stored) return false;

    const seen = new Set<string>();
    const nextTags: string[] = [];
    for (const raw of tags) {
        const tag = raw.normalize('NFC').trim();
        if (!tag) continue;
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        nextTags.push(tag);
    }
    if (sameTagList(stored.tags, nextTags)) return false;

    const next: Note = { ...stored, tags: nextTags, mod: Math.floor(Date.now() / 1000), usn: -1 };
    markSourcePackageDirty(stored.sourcePackageId);
    getDB().runSync(
        'UPDATE notes SET tags = ?, data = ?, updated_at = ?, usn = ? WHERE id = ?',
        serializeTags(next.tags),
        JSON.stringify(next),
        Date.now(),
        next.usn ?? -1,
        next.id,
    );
    for (const card of getCardsForNote(next.id)) {
        dbUpsertFtsCard(searchIndexCardFromNote(next, card.id));
    }
    return true;
}

/** Replace the tags of the note a card belongs to. Returns false when the card or note is gone. */
export function setNoteTagsByCardId(cardId: number, tags: string[]): boolean {
    const card = getAnkiCard(cardId);
    if (!card) return false;
    return setNoteTags(card.noteId, tags);
}

/** Apply the same add/remove tag delta to multiple notes without erasing unrelated tags. */
export function updateNotesTags(noteIds: number[], addTags: string[], removeTags: string[]): number {
    const db = getDB();
    const uniqueNoteIds = [...new Set(noteIds)];
    const additions = [...new Set(addTags.map((tag) => tag.normalize('NFC').trim()).filter(Boolean))];
    const removals = new Set(removeTags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
    let changed = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const noteId of uniqueNoteIds) {
            const note = getNote(noteId);
            if (!note) continue;
            const existingKeys = new Set(note.tags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
            const nextTags = note.tags.filter((tag) => !removals.has(tag.normalize('NFC').toLocaleLowerCase()));
            for (const tag of additions) {
                const key = tag.toLocaleLowerCase();
                if (!existingKeys.has(key)) nextTags.push(tag);
            }
            // Through `setNoteTags` rather than `saveNote`: a selection that happens to include a
            // catalog note used to throw here and roll the whole batch back, so tagging fifty cards
            // failed because one of them was protected.
            if (setNoteTags(noteId, nextTags)) changed += 1;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return changed;
}

export interface TagCollectionScope {
    deckIds?: number[];
    cardIds?: number[];
}

/**
 * Return the exact tags stored by Anki, optionally limited to cards in the active browser scope.
 * No display cleanup is performed here: short tags such as `+` or `1` can be author-owned data
 * and must survive import/export unchanged.
 */
export function getAllTags(scope: TagCollectionScope = {}): string[] {
    const db = getDB();
    const clauses: string[] = [];
    const params: number[] = [];
    const addIds = (column: string, ids: number[] | undefined) => {
        if (!ids) return;
        if (ids.length === 0) {
            clauses.push('1 = 0');
            return;
        }
        clauses.push(`${column} IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    };
    addIds('c.deckId', scope.deckIds);
    addIds('c.id', scope.cardIds);
    const cardScope = clauses.length
        ? ` AND EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = n.id AND ${clauses.join(' AND ')})`
        : '';

    // Extract distinct space-separated tags fully in SQL to avoid JS-side full-table splitting.
    const rows = db.getAllSync<{ tag: string }>(
        `WITH RECURSIVE scoped(tags) AS (
            SELECT n.tags
            FROM notes n
            WHERE n.tags IS NOT NULL AND TRIM(n.tags) != ''${cardScope}
        ),
        split(tag, rest) AS (
            SELECT '', TRIM(tags) || ' ' FROM scoped
            UNION ALL
            SELECT
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1)),
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1))
            FROM split
            WHERE rest != ''
        )
        SELECT DISTINCT tag
        FROM split
        WHERE tag != ''
        ORDER BY tag COLLATE NOCASE`,
        ...params,
    );

    return rows.map((row) => row.tag);
}

export function addTagToNote(noteId: number, tag: string): void {
    const note = getNote(noteId);
    if (!note) return;
    if (!note.tags.includes(tag)) {
        note.tags.push(tag);
        note.mod = Math.floor(Date.now() / 1000);
        saveNote(note);
    }
}

export function removeTagFromNote(noteId: number, tag: string): void {
    const note = getNote(noteId);
    if (!note) return;
    note.tags = note.tags.filter(t => t !== tag);
    note.mod = Math.floor(Date.now() / 1000);
    saveNote(note);
}

/** Reserved tag mirroring Anki's note "mark" (star) feature. */
export const MARKED_TAG = 'marked';

export function isNoteMarked(note: Note): boolean {
    return note.tags.includes(MARKED_TAG);
}

/** Toggles the reserved "marked" tag on a note. Returns the new marked state. */
export function toggleNoteMark(noteId: number): boolean {
    const note = getNote(noteId);
    if (!note) return false;
    const willMark = !isNoteMarked(note);
    if (willMark) {
        addTagToNote(noteId, MARKED_TAG);
    } else {
        removeTagFromNote(noteId, MARKED_TAG);
    }
    return willMark;
}
