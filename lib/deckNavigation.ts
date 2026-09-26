/** Top-level deck that owns a selected Anki deck path. */
export function getRootDeckName(deckName: string | null | undefined): string | null {
    if (!deckName) return null;
    return deckName.split('::')[0] || null;
}

/** Every visible ancestor from the root through the selected deck. */
export function getDeckPathNames(deckName: string | null | undefined): string[] {
    if (!deckName) return [];

    const parts = deckName.split('::').filter(Boolean);
    return parts.map((_, index) => parts.slice(0, index + 1).join('::'));
}

/** Keep the internal Anki hierarchy delimiter out of user-entered deck labels. */
export function normalizeDeckLeafInput(value: string): string {
    return value
        .split(/:{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Browser inherits the exact deck/subdeck the learner is currently studying. */
export function getScopedBrowserPath(deckName: string | null | undefined): string {
    return deckName ? `/browser?deck=${encodeURIComponent(deckName)}` : '/browser';
}

/** The deepest deck that holds every one of these decks, or null when they share no root. */
export function commonDeckAncestor(deckNames: readonly string[]): string | null {
    if (deckNames.length === 0) return null;
    let common = deckNames[0].split('::');
    for (const name of deckNames.slice(1)) {
        const parts = name.split('::');
        let shared = 0;
        while (shared < common.length && shared < parts.length && common[shared] === parts[shared]) shared += 1;
        common = common.slice(0, shared);
        if (common.length === 0) return null;
    }
    return common.join('::');
}

export interface StudyScopeParams {
    deck?: string | null;
    subject?: string | null;
    topic?: string | null;
    all?: string | null;
    scope?: string | null;
}

/**
 * Determines whether the reviewer was opened with an explicit study scope
 * (a specific deck, subject, topic, or all cards) versus a bare cold launch
 * at the root URL "/" where the learner should land on the deck list.
 */
export function hasExplicitStudyScope(
    params: StudyScopeParams,
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): boolean {
    const isAll = params.all === '1' || params.scope === 'all';
    return Boolean(
        selectedDeckName ||
        selectedSubject ||
        selectedTopic ||
        params.deck ||
        params.subject ||
        params.topic ||
        isAll
    );
}

