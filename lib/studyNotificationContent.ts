export type StudyReminderContent = {
    title: string;
    body: string;
    sound: 'default';
    interruptionLevel: 'active';
    data: {
        kind: string;
        route: '/decks';
        dueReviews: number;
    };
};

/** Builds an alert-only reminder. App-icon badges are intentionally not part of this contract. */
export function buildStudyReminderContent(
    kind: string,
    title: string,
    body: string,
    dueReviews: number,
): StudyReminderContent {
    return {
        title,
        body,
        sound: 'default',
        interruptionLevel: 'active',
        data: { kind, route: '/decks', dueReviews: Math.max(0, Math.trunc(dueReviews) || 0) },
    };
}
