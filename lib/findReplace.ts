/**
 * Anki's Find and Replace (Notes › Find and Replace) for the card browser.
 *
 * Behaviour, from the manual (https://docs.ankiweb.net/browsing.html#find-and-replace) and, for
 * what it leaves out, ankitects/anki rslib/src/findreplace.rs, rslib/src/search/service/mod.rs
 * and rslib/src/tags/findreplace.rs, read for behaviour only and independently implemented here:
 *
 * - The text is found literally unless "Treat input as regular expression" is on; case is ignored
 *   unless "Ignore case" is off. A literal replacement is inserted as typed, so `$1` stays `$1`; a
 *   regular expression's replacement expands `$1`, `${1}`, `$name`, `${name}` and `$$` as the Rust
 *   regex crate Anki uses does.
 * - "In" is every field, one field by name (in each note type that has it; a note whose type has
 *   no such field is left alone), or the tags, which are searched one tag at a time. A tag
 *   replacement may not contain a space, and the edited tags are canonified as typed tags are.
 * - No selection means the whole collection.
 *
 * Differences, kept on purpose: an empty Find is refused rather than inserting the replacement
 * between every character; and a note counts as updated, and has its modification time bumped,
 * only when its text actually changes (Anki also counts a match that replaces text with itself).
 * Locked catalog notes keep their fields and are reported as skipped. Fields go through the
 * editor's own save (`updateTusCardByCardId`), so the sort field, checksum, mod/usn and card
 * generation follow the same rules; GUIDs and media files are never touched.
 */

import { dbUpsertFtsCard, getDB } from './db';
import type { Note, NoteType } from './models';
import { getNoteType } from './noteTypeStore';
import { getCardsForNote, searchIndexCardFromNote } from './noteStore';
import { setNoteTags } from './noteTagStore';
import { updateTusCardByCardId } from './tusCards';
import { canonifyTags, normalizeTagName, sameTagSet } from './noteTags';
import { isCatalogNote, isPaidCatalogUnlocked } from './catalogProtection';
import { fieldIndexByName } from './browserFieldNames';
import { runBulkNoteEditWithBackup, type BulkNoteEditDeps } from './browserBulkEdit';

export type FindReplaceTarget =
    | { kind: 'fields' }
    | { kind: 'field'; name: string }
    | { kind: 'tags' };

export interface FindReplaceRequest {
    find: string;
    replacement: string;
    target: FindReplaceTarget;
    /** The notes to edit; null for the whole collection. */
    noteIds: readonly number[] | null;
    ignoreCase: boolean;
    regex: boolean;
}

export type FindReplaceErrorCode = 'empty-find' | 'invalid-regex' | 'tag-separator';

/** The request cannot run as typed; nothing was read or changed. */
export class FindReplaceInputError extends Error {
    constructor(public readonly code: FindReplaceErrorCode, options?: { cause?: unknown }) {
        super(`Find and replace: ${code}`, options);
        this.name = 'FindReplaceInputError';
    }
}

/** The characters a regular expression gives a meaning to, escaped for a literal search. */
const REGEX_SYNTAX = /[.*+?^${}()|[\]\\/]/g;
/** Rust's inline flags at the start of a pattern (`(?i)`, `(?-i)`, `(?is)`); JavaScript has no inline form. */
const LEADING_FLAGS = /^\(\?([a-zA-Z]*)(?:-([a-zA-Z]*))?\)/;

function patternFor(request: FindReplaceRequest): RegExp {
    const find = request.find.normalize('NFC');
    if (!find) throw new FindReplaceInputError('empty-find');
    if (!request.regex) {
        return new RegExp(find.replace(REGEX_SYNTAX, '\\$&'), request.ignoreCase ? 'giu' : 'gu');
    }

    const flags = { i: request.ignoreCase, s: false, m: false };
    let source = find;
    const inline = LEADING_FLAGS.exec(source);
    if (inline) {
        for (const [letters, on] of [[inline[1], true], [inline[2] ?? '', false]] as const) {
            for (const letter of letters) {
                if (letter !== 'i' && letter !== 's' && letter !== 'm') throw new FindReplaceInputError('invalid-regex');
                flags[letter] = on;
            }
        }
        source = source.slice(inline[0].length);
    }
    // Rust also spells a named group `(?P<name>…)`; JavaScript knows only `(?<name>…)`.
    source = source.replace(/(^|[^\\])\(\?P</g, '$1(?<');
    try {
        return new RegExp(source, `g${flags.i ? 'i' : ''}${flags.s ? 's' : ''}${flags.m ? 'm' : ''}u`);
    } catch (cause) {
        throw new FindReplaceInputError('invalid-regex', { cause });
    }
}

/**
 * A regular expression's replacement as Rust's regex crate (and so Anki) expands it: `$1` or
 * `${1}` is a group by number, `$name` or `${name}` a group by name, `$$` a dollar sign. A group
 * that does not exist or took no part is empty. `$name` reads the longest run of letters, digits
 * and underscores, so `$1a` names a group "1a", as in Rust; write `${1}a` for group 1 then "a". A
 * `$` that starts none of these stays as it is.
 */
export function expandReplacement(
    template: string,
    captures: readonly (string | undefined)[],
    groups?: Readonly<Record<string, string | undefined>>,
): string {
    let out = '';
    for (let i = 0; i < template.length; i++) {
        const ch = template[i];
        if (ch !== '$') { out += ch; continue; }
        if (template[i + 1] === '$') { out += '$'; i += 1; continue; }
        let name: string | null = null;
        let end = i + 1;
        if (template[i + 1] === '{') {
            const close = template.indexOf('}', i + 2);
            if (close > i + 2) { name = template.slice(i + 2, close); end = close + 1; }
        } else {
            const run = /^[A-Za-z0-9_]+/.exec(template.slice(i + 1));
            if (run) { name = run[0]; end = i + 1 + run[0].length; }
        }
        if (name === null) { out += '$'; continue; }
        out += (/^\d+$/.test(name) ? captures[Number(name)] : groups?.[name]) ?? '';
        i = end - 1;
    }
    return out;
}

/** A request ready to run: the text transformation one field or one tag goes through. */
export interface CompiledFindReplace {
    replace: (text: string) => string;
}

/** Check a request and build its replacement; throws `FindReplaceInputError` before anything is read. */
export function compileFindReplace(request: FindReplaceRequest): CompiledFindReplace {
    if (request.target.kind === 'tags' && /\s/u.test(request.replacement)) {
        throw new FindReplaceInputError('tag-separator');
    }
    const pattern = patternFor(request);
    const replacement = request.replacement.normalize('NFC');
    if (!request.regex) return { replace: (text) => text.replace(pattern, () => replacement) };
    return {
        replace: (text) => text.replace(pattern, (match: string, ...rest: unknown[]) => {
            // The callback gets the groups, then the offset and the whole text, then (only when
            // the pattern names a group) the named groups.
            const named = typeof rest[rest.length - 1] === 'object' && rest[rest.length - 1] !== null
                ? rest.pop() as Record<string, string | undefined>
                : undefined;
            const captures = [match, ...rest.slice(0, -2) as (string | undefined)[]];
            return expandReplacement(replacement, captures, named);
        }),
    };
}

interface ScopeRow { id: number; data: string }

/** The notes a request covers, in id order: the given ones, or every note that has a card. */
function scopeRows(noteIds: readonly number[] | null): ScopeRow[] {
    const db = getDB();
    const hasCard = 'EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = n.id)';
    if (noteIds === null) {
        return db.getAllSync<ScopeRow>(`SELECT n.id AS id, n.data AS data FROM notes n WHERE ${hasCard} ORDER BY n.id`);
    }
    if (noteIds.length === 0) return [];
    // One JSON parameter: a selection can exceed SQLite's bound-variable limit.
    return db.getAllSync<ScopeRow>(
        `SELECT n.id AS id, n.data AS data FROM notes n
         WHERE n.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?)) AND ${hasCard} ORDER BY n.id`,
        JSON.stringify([...new Set(noteIds)]),
    );
}

function parseNote(data: string): Note | null {
    try {
        const note = JSON.parse(data) as Note;
        if (!note || !Array.isArray(note.fields)) return null;
        return Array.isArray(note.tags) ? note : { ...note, tags: [] };
    } catch {
        // An unreadable note is left for the database check, as the search scan leaves it.
        return null;
    }
}

type NoteEdit = { kind: 'fields'; fields: string[] } | { kind: 'tags'; tags: string[] };

function editFor(note: Note, request: FindReplaceRequest, compiled: CompiledFindReplace, noteTypeOf: (id: number) => NoteType | null): NoteEdit | null {
    if (request.target.kind === 'tags') {
        const replaced = note.tags.map((tag) => compiled.replace(tag));
        if (replaced.every((tag, index) => tag === note.tags[index])) return null;
        const tags = canonifyTags(replaced.map(normalizeTagName));
        // A tag keeps the spelling it already has (see setNoteTags), so a change of case alone is
        // no change, as in Anki, whose tag list keeps the existing case.
        return sameTagSet(note.tags, tags) ? null : { kind: 'tags', tags };
    }

    let ords: number[];
    if (request.target.kind === 'field') {
        const noteType = noteTypeOf(note.noteTypeId);
        const ord = noteType ? fieldIndexByName(noteType, request.target.name) : -1;
        if (ord < 0) return null;
        ords = [ord];
    } else {
        ords = note.fields.map((_, ord) => ord);
    }
    const fields = [...note.fields];
    let changed = false;
    for (const ord of ords) {
        if (typeof fields[ord] !== 'string') continue;
        const next = compiled.replace(fields[ord]);
        if (next !== fields[ord]) { fields[ord] = next; changed = true; }
    }
    return changed ? { kind: 'fields', fields } : null;
}

/** Note types read once each per run: imported ones carry their CSS and templates. */
function noteTypeCache(): (id: number) => NoteType | null {
    const types = new Map<number, NoteType | null>();
    return (id) => {
        if (!types.has(id)) types.set(id, getNoteType(id));
        return types.get(id)!;
    };
}

export interface FindReplacePreview {
    /** Notes the request covers: the selection, or every note in the collection. */
    scopeNoteCount: number;
    /** Notes whose text would change. */
    changeCount: number;
    /** Notes that would change but are locked catalog content, which keeps its text. */
    protectedCount: number;
}

/** What a request would do, without changing anything: the counts the confirmation names. */
export function previewFindReplace(request: FindReplaceRequest): FindReplacePreview {
    const compiled = compileFindReplace(request);
    const noteTypeOf = noteTypeCache();
    const contentLocked = request.target.kind !== 'tags' && !isPaidCatalogUnlocked();
    const rows = scopeRows(request.noteIds);
    let changeCount = 0;
    let protectedCount = 0;
    for (const row of rows) {
        const note = parseNote(row.data);
        if (!note || !editFor(note, request, compiled, noteTypeOf)) continue;
        if (contentLocked && isCatalogNote(note)) protectedCount += 1;
        else changeCount += 1;
    }
    return { scopeNoteCount: rows.length, changeCount, protectedCount };
}

export interface FindReplaceResult {
    /** Notes whose fields or tags changed. */
    updated: number;
    /** Locked catalog notes the request matched and left as they were. */
    protectedSkipped: number;
    /** A field edit generated a card, so a study session's queue must be rebuilt. */
    cardsChanged: boolean;
}

/**
 * The editor's save for new field values (`updateTusCardByCardId`), then the search index, as
 * the editor refreshes it. Returns null when the note has no card to save it through.
 */
function saveFields(note: Note, fields: string[]): { cardsChanged: boolean } | null {
    const cards = getCardsForNote(note.id);
    // A card at home: one a filtered deck holds would make that deck the home of any card the
    // edit generates.
    const card = cards.find((candidate) => !candidate.odid) ?? cards[0];
    if (!card) return null;
    const result = updateTusCardByCardId(card.id, { question: fields[0] ?? '', answer: fields[1] ?? '', fieldValues: fields });
    if (!result) return null;
    // Given field by field, the editor's save keeps the note's field count (a one-field type too).
    const saved = result.note;
    for (const sibling of getCardsForNote(saved.id)) dbUpsertFtsCard(searchIndexCardFromNote(saved, sibling.id));
    return { cardsChanged: result.cardsChanged };
}

/** Run a request as one transaction: every changed note is written, or none is. */
export function applyFindReplace(request: FindReplaceRequest): FindReplaceResult {
    const compiled = compileFindReplace(request);
    const noteTypeOf = noteTypeCache();
    const contentLocked = request.target.kind !== 'tags' && !isPaidCatalogUnlocked();
    const db = getDB();
    const result: FindReplaceResult = { updated: 0, protectedSkipped: 0, cardsChanged: false };

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of scopeRows(request.noteIds)) {
            const note = parseNote(row.data);
            const edit = note ? editFor(note, request, compiled, noteTypeOf) : null;
            if (!note || !edit) continue;
            if (edit.kind === 'tags') {
                // Tags are the learner's own metadata, open on catalog notes too (setNoteTags).
                if (setNoteTags(note.id, edit.tags)) result.updated += 1;
                continue;
            }
            if (contentLocked && isCatalogNote(note)) {
                result.protectedSkipped += 1;
                continue;
            }
            const saved = saveFields(note, edit.fields);
            if (!saved) continue;
            result.updated += 1;
            result.cardsChanged ||= saved.cardsChanged;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return result;
}

/**
 * The browser's entry point: an invalid request fails before the backup, then the safety backup,
 * then the edit (lib/browserBulkEdit.ts).
 */
export async function findReplaceWithBackup(
    request: FindReplaceRequest,
    deps: BulkNoteEditDeps = {},
): Promise<{ backupFileName: string; result: FindReplaceResult }> {
    compileFindReplace(request);
    return runBulkNoteEditWithBackup(() => applyFindReplace(request), deps);
}
