/**
 * Renaming a tag on every note, as Anki's browser sidebar Rename does.
 *
 * Behaviour, from the manual (https://docs.ankiweb.net/browsing.html#editing-items) and
 * ankitects/anki rslib/src/tags/rename.rs and rslib/src/tags/matcher.rs (read for behaviour only,
 * independently implemented here):
 *
 * - The old name is matched ignoring case, as a whole tag or as the parent of `::` children:
 *   renaming "Kardiyo" renames "kardiyo" and "KARDIYO::EKG" but not "kardiyoloji". The children
 *   keep their own parts: "kardiyo::EKG" becomes "Kalp::EKG".
 * - The new name may not be empty or contain a space. It is read like any typed tag (NFC, no
 *   control characters, no empty `::` parts).
 * - Renaming onto a tag that already exists merges the two: a note that had both keeps one. A
 *   renamed tag, or a parent part of it, that lands on an existing tag takes that tag's spelling,
 *   as Anki's tag list keeps the case it already has; a rename that only changes case sticks.
 * - Only notes whose tags actually change are written, with their mod/usn bumped.
 */

import { getDB } from './db';
import type { Note } from './models';
import { getAllTags, setNoteTags } from './noteTagStore';
import { canonifyTags, normalizeTagName, tagMatchKey } from './noteTags';
import { runBulkNoteEditWithBackup, type BulkNoteEditDeps } from './browserBulkEdit';

export type TagNameErrorCode = 'empty' | 'separator';

/** The typed name cannot be a tag; nothing was read or changed. */
export class TagNameError extends Error {
    constructor(public readonly code: TagNameErrorCode) {
        super(`Tag name: ${code}`);
        this.name = 'TagNameError';
    }
}

/** Read one typed tag name, or throw `TagNameError`. */
export function parseTagName(input: string): string {
    const trimmed = input.trim();
    // A space would make it two tags. Anki refuses the ideographic space as well; `\s` covers it.
    if (/\s/u.test(trimmed)) throw new TagNameError('separator');
    const name = normalizeTagName(trimmed);
    if (!name) throw new TagNameError('empty');
    return name;
}

/**
 * The tag once `oldName` is renamed to `newName`, or null when the rename does not reach it: the
 * old name must be the whole tag or its leading `::` parts, compared ignoring case.
 */
export function renamedTag(tag: string, oldName: string, newName: string): string | null {
    const parts = tag.split('::');
    const oldParts = oldName.split('::');
    if (parts.length < oldParts.length) return null;
    for (let index = 0; index < oldParts.length; index += 1) {
        if (tagMatchKey(parts[index]) !== tagMatchKey(oldParts[index])) return null;
    }
    return [newName, ...parts.slice(oldParts.length)].join('::');
}

/** Whether a tag is the old name or one of its children. */
const isRenamed = (tag: string, oldName: string) => renamedTag(tag, oldName, oldName) !== null;

/**
 * The spelling of every tag path the rename leaves alone ("Kalp" and "Kalp::EKG" for the tag
 * "Kalp::EKG"), by key, so a renamed tag landing on one adopts it.
 */
function existingSpellings(oldName: string): Map<string, string> {
    const spellings = new Map<string, string>();
    for (const tag of getAllTags()) {
        if (isRenamed(tag, oldName)) continue;
        const parts = tag.split('::');
        for (let length = 1; length <= parts.length; length += 1) {
            const path = parts.slice(0, length).join('::');
            const key = tagMatchKey(path);
            if (!spellings.has(key)) spellings.set(key, path);
        }
    }
    return spellings;
}

/** The renamed tag with its longest existing leading path spelled the way the collection spells it. */
function withExistingSpelling(tag: string, spellings: ReadonlyMap<string, string>): string {
    const parts = tag.split('::');
    for (let length = parts.length; length >= 1; length -= 1) {
        const existing = spellings.get(tagMatchKey(parts.slice(0, length).join('::')));
        if (existing !== undefined) return [existing, ...parts.slice(length)].join('::');
    }
    return tag;
}

/** Same tags exactly (spelling included), in any order. */
function sameTagsExactly(a: readonly string[], b: readonly string[]): boolean {
    const key = (tags: readonly string[]) => tags.map((tag) => tag.normalize('NFC')).sort().join('\u0000');
    return key(a) === key(b);
}

/** A note's tags after the rename, or null when they would not change. */
function renamedTags(tags: readonly string[], oldName: string, newName: string, spellings: ReadonlyMap<string, string>): string[] | null {
    let reached = false;
    const next = tags.map((tag) => {
        const renamed = renamedTag(tag, oldName, newName);
        if (renamed === null) return tag;
        reached = true;
        return withExistingSpelling(renamed, spellings);
    });
    if (!reached) return null;
    const canonical = canonifyTags(next);
    return sameTagsExactly(tags, canonical) ? null : canonical;
}

interface CandidateNote { id: number; tags: string[] }

/**
 * Notes carrying the old name or a child of it. The tags column (" a b ") picks the candidates
 * cheaply; each candidate's own tag list, from its note, decides.
 */
function candidateNotes(oldName: string): CandidateNote[] {
    const rows = getDB().getAllSync<{ id: number; tags: string | null; data: string }>(
        "SELECT id, tags, data FROM notes WHERE tags IS NOT NULL AND TRIM(tags) != '' ORDER BY id",
    );
    const candidates: CandidateNote[] = [];
    for (const row of rows) {
        if (!String(row.tags).split(' ').some((tag) => tag && isRenamed(tag, oldName))) continue;
        try {
            const tags = (JSON.parse(row.data) as Partial<Note>)?.tags;
            if (Array.isArray(tags)) candidates.push({ id: Number(row.id), tags });
        } catch {
            // An unreadable note is left for the database check.
        }
    }
    return candidates;
}

export interface TagRenamePreview {
    /** The new name as it will be stored. */
    newName: string;
    /** Notes whose tags will change. */
    noteCount: number;
    /** The new name is a tag already in use, so the two will be merged. */
    merges: boolean;
}

/** What renaming would do, without changing anything: the counts the confirmation names. */
export function previewTagRename(oldName: string, input: string): TagRenamePreview {
    const newName = parseTagName(input);
    const spellings = existingSpellings(oldName);
    const noteCount = candidateNotes(oldName)
        .filter((note) => renamedTags(note.tags, oldName, newName, spellings) !== null).length;
    return { newName, noteCount, merges: spellings.has(tagMatchKey(newName)) };
}

/** Rename as one transaction: every changed note is written, or none is. */
export function renameTag(oldName: string, input: string): { newName: string; updated: number } {
    const newName = parseTagName(input);
    const db = getDB();
    const spellings = existingSpellings(oldName);
    let updated = 0;
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const note of candidateNotes(oldName)) {
            const tags = renamedTags(note.tags, oldName, newName, spellings);
            // Case-sensitive, so a rename that only fixes a tag's case is written.
            if (tags && setNoteTags(note.id, tags, { caseSensitive: true })) updated += 1;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return { newName, updated };
}

/**
 * The browser's entry point: an invalid name fails before the backup, then the safety backup
 * (a merge cannot be undone by renaming back), then the rename (lib/browserBulkEdit.ts).
 */
export async function renameTagWithBackup(
    oldName: string,
    input: string,
    deps: BulkNoteEditDeps = {},
): Promise<{ backupFileName: string; result: { newName: string; updated: number } }> {
    parseTagName(input);
    return runBulkNoteEditWithBackup(() => renameTag(oldName, input), deps);
}

/** The browser's tag filters after a rename, so the active filter keeps showing the same notes. */
export function renameTagFilters(filters: readonly string[], oldName: string, newName: string): string[] {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const filter of filters) {
        const tag = renamedTag(filter, oldName, newName) ?? filter;
        const key = tagMatchKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(tag);
    }
    return next;
}
