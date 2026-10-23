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
