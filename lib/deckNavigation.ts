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


const DESCRIPTION_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * A deck description as readable text. Anki shows the description as HTML (imported shared decks
 * use it for headings, lists and links); the overview renders native text, so line-level tags
 * become line breaks and other markup is dropped instead of being shown as raw tags (DST-11).
 */
export function deckDescriptionText(html: string): string {
    return html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n• ')
        .replace(/<\/?(?:p|div|h[1-6]|ul|ol|li|tr|table|blockquote|pre|hr)\b[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
            if (!entity.startsWith('#')) return DESCRIPTION_ENTITIES[entity.toLowerCase()] ?? whole;
            const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
            return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
        })
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
