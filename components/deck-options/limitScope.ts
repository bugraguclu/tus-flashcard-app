/**
 * Anki's daily-limit tabs decide which limit applies (DST-7): "Preset" uses the preset's value,
 * "This deck" the deck's own override, "Today only" the one-day override. The screen opens on the
 * tab that is in effect, and saving on a tab drops the overrides that tab does not use.
 * https://docs.ankiweb.net/deck-options.html#daily-limits
 */
export type LimitScope = 'preset' | 'deck' | 'today';

export function effectiveLimitScope(deckLimit: string, todayLimit: string): LimitScope {
    if (todayLimit.trim()) return 'today';
    if (deckLimit.trim()) return 'deck';
    return 'preset';
}

/** The overrides to store for the chosen tab: a tab never keeps a more specific override. */
export function limitsForScope<T>(scope: LimitScope, deckLimit: T | undefined, todayLimit: T | undefined): { deck: T | undefined; today: T | undefined } {
    if (scope === 'preset') return { deck: undefined, today: undefined };
    if (scope === 'deck') return { deck: deckLimit, today: undefined };
    return { deck: deckLimit, today: todayLimit };
}

/** Whether saving on this tab would drop an override the form still holds. */
export function scopeDropsOverride(scope: LimitScope, deckLimit: string, todayLimit: string): boolean {
    return (scope === 'preset' && Boolean(deckLimit.trim() || todayLimit.trim())) || (scope === 'deck' && Boolean(todayLimit.trim()));
}

/**
 * The value a tab shows once chosen (Anki's `ValueTab.enable`): its own, or, when it has none, the
 * value on screen when it was chosen. Choosing "This deck" alone is then a change Save can store.
 */
export function chosenTabValue(own: string, shown: string): string {
    return own.trim() ? own : shown;
}

/**
 * The deck's own desired retention to store. Its tabs decide as the limit tabs do, so saving on
 * "Preset" drops it; while FSRS is off the tabs are hidden and the deck keeps its value.
 */
export function deckRetentionForScope<T>(scope: 'preset' | 'deck', deckValue: T | undefined, tabsShown: boolean): T | undefined {
    return !tabsShown || scope === 'deck' ? deckValue : undefined;
}
