// Pure row model for the sidebar course tree (components/Sidebar.tsx), extracted so the
// visible-hierarchy logic can be unit tested without React or react-native.
import type { Subject } from './types';

export type SidebarRow =
    | { key: string; kind: 'all'; depth: number; selected: boolean; count: number }
    | {
        key: string;
        kind: 'subject';
        depth: number;
        subjectId: string;
        name: string;
        icon: string;
        count: number;
        expanded: boolean;
        selected: boolean;
    }
    | {
        key: string;
        kind: 'topic';
        depth: number;
        subjectId: string;
        topic: string;
        count: number;
        selected: boolean;
    };

export interface SidebarRowsInput {
    subjects: readonly Subject[];
    /** Only one course opens at a time, mirroring the drawer's accordion behaviour. */
    expandedSubject: string | null;
    selectedSubject: string | null;
    selectedTopic: string | null;
    totalCards: number;
    getSubjectCount: (subjectId: string) => number;
    getTopicCount: (subjectId: string, topic: string) => number;
    getTopicsForSubject: (subjectId: string) => readonly string[];
}

export const SIDEBAR_ALL_ROW_KEY = 'all';

export function sidebarSubjectRowKey(subjectId: string): string {
    return `subject:${subjectId}`;
}

export function sidebarTopicRowKey(subjectId: string, topic: string): string {
    return `topic:${subjectId}:${topic}`;
}

/**
 * Flattens the course/topic hierarchy into the rows a FlatList can mount one screen at a
 * time. Collapsed courses never have their topics visited, so a drawer opening over a large
 * catalogue builds one row per course instead of one per course *and* every topic under it.
 */
export function buildSidebarRows(input: SidebarRowsInput): SidebarRow[] {
    const {
        subjects,
        expandedSubject,
        selectedSubject,
        selectedTopic,
        totalCards,
        getSubjectCount,
        getTopicCount,
        getTopicsForSubject,
    } = input;

    const rows: SidebarRow[] = [{
        key: SIDEBAR_ALL_ROW_KEY,
        kind: 'all',
        depth: 0,
        selected: !selectedSubject && !selectedTopic,
        count: totalCards,
    }];

    for (const subject of subjects) {
        const expanded = expandedSubject === subject.id;
        rows.push({
            key: sidebarSubjectRowKey(subject.id),
            kind: 'subject',
            depth: 0,
            subjectId: subject.id,
            name: subject.name,
            icon: subject.icon,
            count: getSubjectCount(subject.id),
            expanded,
            // A selected topic highlights the topic row; the course itself is only the
            // active row when the whole course is being studied.
            selected: selectedSubject === subject.id && !selectedTopic,
        });

        if (!expanded) continue;

        for (const topic of getTopicsForSubject(subject.id)) {
            rows.push({
                key: sidebarTopicRowKey(subject.id, topic),
                kind: 'topic',
                depth: 1,
                subjectId: subject.id,
                topic,
                count: getTopicCount(subject.id, topic),
                selected: selectedSubject === subject.id && selectedTopic === topic,
            });
        }
    }

    return rows;
}
