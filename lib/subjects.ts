// Subject (course) registry: merges the built-in seed subjects with user-created courses
// persisted in the SQLite settings table. Deliberately imports only db/data/models so that
// noteManager, studyRepository and the UI can all depend on it without cycles.

import type { Subject } from './types';
import { TUS_SUBJECTS } from './data';
import { subjectToDeckId } from './models';
import { getDB } from './db';

const USER_SUBJECTS_KEY = 'user_subjects_v1';

export interface UserSubject extends Subject {
    /** Deck the course's cards live in, created together with the course. */
    deckId: number;
    isCustom: true;
}

interface SubjectsCache {
    all: Subject[];
    users: UserSubject[];
    idSet: Set<string>;
}

let cache: SubjectsCache | null = null;

function isValidUserSubject(value: unknown): value is UserSubject {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string'
        && record.id.length > 0
        && typeof record.name === 'string'
        && typeof record.deckId === 'number'
        && Number.isFinite(record.deckId);
}

function readUserSubjects(): UserSubject[] {
    try {
        const db = getDB();
        // Test harnesses stub the DB with a subset of methods; treat that as "no user subjects".
        if (typeof db.getFirstSync !== 'function') return [];
        const row = db.getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            USER_SUBJECTS_KEY,
        );
        if (!row?.value) return [];

        const parsed = JSON.parse(row.value) as unknown;
        if (!Array.isArray(parsed)) return [];

        return parsed.filter(isValidUserSubject).map((entry) => ({
            ...entry,
            icon: typeof entry.icon === 'string' && entry.icon ? entry.icon : '▤',
            topics: Array.isArray(entry.topics) ? entry.topics.filter((t) => typeof t === 'string') : [],
            isCustom: true as const,
        }));
    } catch (e) {
        console.warn('[Subjects] readUserSubjects failed:', e);
        return [];
    }
}

function buildCache(): SubjectsCache {
    const users = readUserSubjects();
    const staticIds = new Set(TUS_SUBJECTS.map((subject) => subject.id));
    // A user record colliding with a built-in id would shadow it; drop such records defensively.
    const cleanUsers = users.filter((entry) => !staticIds.has(entry.id));
    const all = [...TUS_SUBJECTS, ...cleanUsers];
    return {
        all,
        users: cleanUsers,
        idSet: new Set(all.map((subject) => subject.id)),
    };
}

function getCache(): SubjectsCache {
    if (!cache) cache = buildCache();
    return cache;
}

/** Drop the memoized subject list; call after any write to the user-subjects record. */
export function invalidateSubjectsCache(): void {
    cache = null;
}

/** Built-in subjects plus user-created courses, in display order. */
export function getAllSubjects(): Subject[] {
    return getCache().all;
}

export function getUserSubjects(): UserSubject[] {
    return getCache().users;
}

/** Set of every known subject id — the canonical "is this tag a subject?" test. */
export function getSubjectIdSet(): Set<string> {
    return getCache().idSet;
}

export function findSubject(id: string | null | undefined): Subject | undefined {
    if (!id) return undefined;
    return getCache().all.find((subject) => subject.id === id);
}

/**
 * Deck a subject's new cards belong to: seeded subjects use the static id map,
 * user courses carry their deck id, anything unknown falls back to the root deck.
 */
export function resolveSubjectDeckId(subjectId: string): number {
    const staticDeckId = subjectToDeckId(subjectId);
    if (staticDeckId !== 1) return staticDeckId;

    const user = getCache().users.find((subject) => subject.id === subjectId);
    return user?.deckId ?? 1;
}

/**
 * The subjects whose home deck lives inside the given deck's subtree. Courses are
 * deck-specific: entering a deck shows only its own courses, an empty deck shows none.
 * A null/unknown deck falls back to the full list (legacy scopes, safety).
 */
export function getSubjectsForDeck(deckName: string | null | undefined): Subject[] {
    if (!deckName) return getAllSubjects();

    try {
        const db = getDB();
        if (typeof db.getAllSync !== 'function') return getAllSubjects();
        const deckNamesById = new Map<number, string>(
            db.getAllSync<{ id: number; name: string }>(
                'SELECT id, name FROM decks WHERE tombstone = 0',
            ).map((row) => [row.id, row.name]),
        );

        const prefix = `${deckName}::`;
        return getAllSubjects().filter((subject) => {
            const home = deckNamesById.get(resolveSubjectDeckId(subject.id));
            return home === deckName || (home?.startsWith(prefix) ?? false);
        });
    } catch (e) {
        console.warn('[Subjects] getSubjectsForDeck failed:', e);
        return getAllSubjects();
    }
}

/** Transliterate a course name into a stable ASCII slug usable as a subject id / tag. */
export function slugifySubjectId(name: string): string {
    const map: Record<string, string> = {
        ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i',
        ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
    };

    const slug = name
        .trim()
        .split('')
        .map((ch) => map[ch] ?? ch)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug || 'ders';
}

/** Persist a new user course record. The caller is responsible for creating its deck first. */
export function registerUserSubject(record: Omit<UserSubject, 'isCustom' | 'topics'> & { topics?: string[] }): void {
    const db = getDB();
    const existing = readUserSubjects().filter((entry) => entry.id !== record.id);
    const next = [
        ...existing,
        { ...record, topics: record.topics ?? [], isCustom: true as const },
    ];

    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        USER_SUBJECTS_KEY,
        JSON.stringify(next),
    );
    invalidateSubjectsCache();
}
