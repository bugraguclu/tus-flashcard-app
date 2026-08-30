import { describe, expect, it, vi } from 'vitest';
import type { Subject } from './types';
import {
    buildSidebarRows,
    sidebarSubjectRowKey,
    sidebarTopicRowKey,
    type SidebarRow,
    type SidebarRowsInput,
} from './sidebarRows';

function makeSubjects(courses: number, topicsPerCourse: number): Subject[] {
    return Array.from({ length: courses }, (_, courseIndex) => ({
        id: `course-${courseIndex}`,
        name: `Course ${courseIndex}`,
        icon: '📘',
        topics: Array.from({ length: topicsPerCourse }, (_, topicIndex) => `Topic ${courseIndex}.${topicIndex}`),
    }));
}

function makeInput(overrides: Partial<SidebarRowsInput> = {}): SidebarRowsInput {
    const subjects = overrides.subjects ?? makeSubjects(3, 2);
    const topicsOf = (subjectId: string) =>
        subjects.find((subject) => subject.id === subjectId)?.topics ?? [];
    return {
        subjects,
        expandedSubject: null,
        selectedSubject: null,
        selectedTopic: null,
        totalCards: 42,
        getSubjectCount: () => 7,
        getTopicCount: () => 3,
        getTopicsForSubject: topicsOf,
        ...overrides,
    };
}

const keysOf = (rows: readonly SidebarRow[]) => rows.map((row) => row.key);

describe('buildSidebarRows', () => {
    it('lists the all-courses row and one row per course while nothing is expanded', () => {
        const rows = buildSidebarRows(makeInput());

        expect(keysOf(rows)).toEqual([
            'all',
            sidebarSubjectRowKey('course-0'),
            sidebarSubjectRowKey('course-1'),
            sidebarSubjectRowKey('course-2'),
        ]);
        expect(rows.every((row) => row.kind !== 'topic')).toBe(true);
        expect(rows[0]).toMatchObject({ kind: 'all', depth: 0, selected: true, count: 42 });
    });

    it('carries the course name, icon and count onto the row', () => {
        const rows = buildSidebarRows(makeInput({ getSubjectCount: (id) => (id === 'course-1' ? 19 : 0) }));

        expect(rows[2]).toMatchObject({
            kind: 'subject',
            depth: 0,
            subjectId: 'course-1',
            name: 'Course 1',
            icon: '📘',
            count: 19,
            expanded: false,
        });
    });

    it('inserts the expanded course topics directly under it at depth 1', () => {
        const rows = buildSidebarRows(makeInput({ expandedSubject: 'course-1' }));

        expect(keysOf(rows)).toEqual([
            'all',
            sidebarSubjectRowKey('course-0'),
            sidebarSubjectRowKey('course-1'),
            sidebarTopicRowKey('course-1', 'Topic 1.0'),
            sidebarTopicRowKey('course-1', 'Topic 1.1'),
            sidebarSubjectRowKey('course-2'),
        ]);
        expect(rows[3]).toMatchObject({ kind: 'topic', depth: 1, subjectId: 'course-1', topic: 'Topic 1.0', count: 3 });
        expect(rows.find((row) => row.key === sidebarSubjectRowKey('course-1'))).toMatchObject({ expanded: true });
    });

    it('shows topics discovered outside the seeded list', () => {
        const subjects = makeSubjects(1, 1);
        const rows = buildSidebarRows(makeInput({
            subjects,
            expandedSubject: 'course-0',
            getTopicsForSubject: () => ['Topic 0.0', 'Ad-hoc topic'],
        }));

        expect(keysOf(rows)).toContain(sidebarTopicRowKey('course-0', 'Ad-hoc topic'));
    });

    it('leaves every other branch byte-identical when a course expands', () => {
        const collapsed = buildSidebarRows(makeInput({ subjects: makeSubjects(6, 4) }));
        const expanded = buildSidebarRows(makeInput({ subjects: makeSubjects(6, 4), expandedSubject: 'course-3' }));

        const untouched = (rows: readonly SidebarRow[]) =>
            rows.filter((row) => row.kind !== 'topic' && row.key !== sidebarSubjectRowKey('course-3'));

        expect(untouched(expanded)).toEqual(untouched(collapsed));
        expect(expanded).toHaveLength(collapsed.length + 4);
    });

    it('returns to the collapsed model when the course closes again', () => {
        const subjects = makeSubjects(4, 3);
        const before = buildSidebarRows(makeInput({ subjects }));
        buildSidebarRows(makeInput({ subjects, expandedSubject: 'course-2' }));
        const after = buildSidebarRows(makeInput({ subjects }));

        expect(after).toEqual(before);
    });

    it('only one course can be open, so a second expansion replaces the first branch', () => {
        const subjects = makeSubjects(3, 2);
        const rows = buildSidebarRows(makeInput({ subjects, expandedSubject: 'course-2' }));

        expect(rows.filter((row) => row.kind === 'topic').every((row) => row.subjectId === 'course-2')).toBe(true);
    });

    it('never walks the topics of a collapsed course', () => {
        const subjects = makeSubjects(20, 30);
        const getTopicsForSubject = vi.fn((subjectId: string) =>
            subjects.find((subject) => subject.id === subjectId)!.topics);
        const getTopicCount = vi.fn(() => 1);

        const rows = buildSidebarRows(makeInput({
            subjects,
            expandedSubject: 'course-9',
            getTopicsForSubject,
            getTopicCount,
        }));

        expect(rows).toHaveLength(1 + 20 + 30);
        expect(getTopicsForSubject).toHaveBeenCalledTimes(1);
        expect(getTopicCount).toHaveBeenCalledTimes(30);
    });

    it('highlights the selected course path down to the topic', () => {
        const rows = buildSidebarRows(makeInput({
            expandedSubject: 'course-1',
            selectedSubject: 'course-1',
            selectedTopic: 'Topic 1.1',
        }));

        const selected = rows.filter((row) => row.selected);
        expect(keysOf(selected)).toEqual([sidebarTopicRowKey('course-1', 'Topic 1.1')]);
    });

    it('highlights the course itself when no topic is selected', () => {
        const rows = buildSidebarRows(makeInput({ selectedSubject: 'course-2' }));

        const selected = rows.filter((row) => row.selected);
        expect(keysOf(selected)).toEqual([sidebarSubjectRowKey('course-2')]);
    });

    it('highlights nothing while the selected topic sits under a collapsed course', () => {
        const rows = buildSidebarRows(makeInput({ selectedSubject: 'course-0', selectedTopic: 'Topic 0.0' }));

        expect(rows.some((row) => row.selected)).toBe(false);
        expect(rows[1]).toMatchObject({ subjectId: 'course-0', selected: false });
    });

    it('keeps row keys unique across a large catalogue', () => {
        const subjects = makeSubjects(30, 12);
        const rows = buildSidebarRows(makeInput({ subjects, expandedSubject: 'course-11' }));

        expect(new Set(keysOf(rows)).size).toBe(rows.length);
    });

    it('handles an empty catalogue', () => {
        const rows = buildSidebarRows(makeInput({ subjects: [], totalCards: 0 }));

        expect(rows).toEqual([{ key: 'all', kind: 'all', depth: 0, selected: true, count: 0 }]);
    });
});
