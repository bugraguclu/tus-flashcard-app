// Course creation workflow: a "course" is a subject entry plus its own deck.
// Lives outside subjects.ts so that subjects.ts stays import-cycle free
// (this module needs deckManager, which transitively needs noteManager).

import type { Subject } from './types';
import { createDeck, getDeck } from './deckManager';
import {
    getAllSubjects,
    getSubjectIdSet,
    invalidateSubjectsCache,
    registerUserSubject,
    slugifySubjectId,
} from './subjects';

export interface CreateCourseResult {
    subject: Subject;
    created: boolean;
    error?: string;
}

/** Root deck all course decks hang under; honors a renamed root deck. */
function rootDeckName(): string {
    return getDeck(1)?.name ?? 'Python';
}

/**
 * Create a user course: unique slug id, its own deck under the root deck, and a
 * persisted subject record so it shows up in navigation, editor and stats.
 */
export function createCourse(rawName: string, icon: string = '📘'): CreateCourseResult {
    const name = rawName.trim();
    if (!name) {
        return { subject: { id: '', name: '', icon, topics: [] }, created: false, error: 'Ders adı boş olamaz.' };
    }

    const existingByName = getAllSubjects().find(
        (subject) => subject.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
    );
    if (existingByName) {
        return { subject: existingByName, created: false, error: 'Bu isimde bir ders zaten var.' };
    }

    const takenIds = getSubjectIdSet();
    const base = slugifySubjectId(name);
    let id = base;
    for (let i = 2; takenIds.has(id); i++) {
        id = `${base}-${i}`;
    }

    const deck = createDeck(`${rootDeckName()}::${name}`);
    registerUserSubject({ id, name, icon: icon || '📘', deckId: deck.id });
    invalidateSubjectsCache();

    const subject = getAllSubjects().find((entry) => entry.id === id)
        ?? { id, name, icon: icon || '📘', topics: [] };

    return { subject, created: true };
}
