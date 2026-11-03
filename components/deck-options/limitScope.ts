/**
 * Anki's daily-limit tabs decide which limit applies (DST-7): "Preset" uses the preset's value,
 * "This deck" the deck's own override, "Today only" the one-day override. The screen opens on the
 * tab that is in effect; Save stores the chosen tab's value, keeps the broader tabs as they were
 * loaded and drops the narrower overrides (`tabValuesToStore`).
 * https://docs.ankiweb.net/deck-options.html#daily-limits
 */
export type LimitScope = 'preset' | 'deck' | 'today';

export function effectiveLimitScope(deckLimit: string, todayLimit: string): LimitScope {
    if (todayLimit.trim()) return 'today';
    if (deckLimit.trim()) return 'deck';
    return 'preset';
}

/** One value per tab, broadest first. Desired retention has no "Today only" and leaves it empty. */
export type TabValues = Record<LimitScope, string>;

/**
 * What Save stores for a row of tabs, as Anki's TabbedValue does: the chosen tab its value on
 * screen, each broader tab before it the value it was loaded with (`ValueTab.reset`), and each
 * narrower tab after it nothing (`ValueTab.disable`). A value typed on a tab the learner then left
 * stays in the form, so choosing that tab again shows it, but Save does not store it.
 */
export function tabValuesToStore(scope: LimitScope, onScreen: TabValues, loaded: TabValues): TabValues {
    return {
        preset: scope === 'preset' ? onScreen.preset : loaded.preset,
        deck: scope === 'deck' ? onScreen.deck : scope === 'today' ? loaded.deck : '',
        today: scope === 'today' ? onScreen.today : '',
    };
}

/** The Deck Options fields its tabs decide, as the screen's form holds them. */
interface TabbedFields {
    maxReviewsPerDay: string;
    deckReviewLimit: string;
    todayReviewLimit: string;
    desiredRetention: string;
    deckDesiredRetention: string;
    fsrsEnabled: boolean;
}

/**
 * The form as Save stores it: the review-limit and desired-retention fields settled by
 * `tabValuesToStore`, every other field as it is. `loaded` is the form as the screen loaded it.
 * While FSRS is off the retention tabs are hidden, so the deck keeps its own target.
 */
export function formForSave<F extends TabbedFields>(
    form: F,
    loaded: Pick<TabbedFields, 'maxReviewsPerDay' | 'deckReviewLimit' | 'desiredRetention'>,
    reviewScope: LimitScope,
    retentionScope: 'preset' | 'deck',
): F {
    const reviews = tabValuesToStore(
        reviewScope,
        { preset: form.maxReviewsPerDay, deck: form.deckReviewLimit, today: form.todayReviewLimit },
        { preset: loaded.maxReviewsPerDay, deck: loaded.deckReviewLimit, today: '' },
    );
    const retention = form.fsrsEnabled
        ? tabValuesToStore(
            retentionScope,
            { preset: form.desiredRetention, deck: form.deckDesiredRetention, today: '' },
            { preset: loaded.desiredRetention, deck: '', today: '' },
        )
        : { preset: form.desiredRetention, deck: form.deckDesiredRetention };
    return {
        ...form,
        maxReviewsPerDay: reviews.preset,
        deckReviewLimit: reviews.deck,
        todayReviewLimit: reviews.today,
        desiredRetention: retention.preset,
        deckDesiredRetention: retention.deck,
    };
}

/**
 * The value a tab shows once chosen (Anki's `ValueTab.enable`): its own, or, when it has none, the
 * value on screen when it was chosen. Choosing "This deck" alone is then a change Save can store.
 */
export function chosenTabValue(own: string, shown: string): string {
    return own.trim() ? own : shown;
}
