/**
 * Pure visibility planner for prioritizing above-the-fold charts on the long Statistics screen.
 *
 * Keeps initial render focused on the top visible cards while mounting lower SVG charts once they
 * approach the viewport. Mounting is monotonic (once mounted, a section stays mounted so scroll
 * position, chart selections and local toggles never reset) and bypasses deferral immediately
 * whenever a screen reader (VoiceOver) is active so linear accessibility navigation reaches every
 * section in reading order.
 */

export const STATS_LAZY_ROOT_MARGIN_WEB = 500;
export const STATS_LAZY_ROOT_MARGIN_NATIVE = 420;

export type StatsSectionId =
    | 'today'
    | 'reviews'
    | 'comparison'
    | 'futureDue'
    | 'answerButtons'
    | 'trueRetention'
    | 'cardCounts'
    | 'intervals'
    | 'hourly'
    | 'added'
    | 'deckProgress';

/**
 * Sections rendered eagerly on the first paint: Today and Reviews sit above the fold on both
 * iPhone and desktop; Comparison sits right below and stays ready for immediate interaction.
 */
export const EAGER_STATS_SECTIONS: ReadonlySet<StatsSectionId> = new Set<StatsSectionId>([
    'today',
    'reviews',
    'comparison',
]);

/** Conservative card heights (pt/px) so deferred placeholders preserve scroll geometry. */
export const STATS_SECTION_ESTIMATED_HEIGHTS: Record<StatsSectionId, number> = {
    today: 260,
    reviews: 370,
    comparison: 390,
    futureDue: 360,
    answerButtons: 260,
    trueRetention: 320,
    cardCounts: 250,
    intervals: 330,
    hourly: 430,
    added: 330,
    deckProgress: 260,
};

export interface StatsViewportWindow {
    scrollY: number;
    viewportHeight: number;
    rootMargin: number;
    screenReaderEnabled: boolean;
}

export interface SectionMountInput extends StatsViewportWindow {
    eager: boolean;
    mounted: boolean;
    /** Top edge of the section in ScrollView content coordinates, or null before layout. */
    layoutY: number | null;
}

/** Decide whether a statistics section should be mounted for the current viewport state. */
export function shouldMountStatsSection(input: SectionMountInput): boolean {
    if (input.eager || input.mounted || input.screenReaderEnabled) return true;
    if (input.layoutY === null || !Number.isFinite(input.layoutY)) return false;
    if (!Number.isFinite(input.viewportHeight) || input.viewportHeight <= 0) return false;
    const scrollY = Number.isFinite(input.scrollY) ? Math.max(0, input.scrollY) : 0;
    const margin = Number.isFinite(input.rootMargin) ? Math.max(0, input.rootMargin) : 0;
    return input.layoutY <= scrollY + input.viewportHeight + margin;
}

/**
 * Return any section ids not yet in `mounted` that now fall inside the lookahead viewport window.
 * Returning an empty array allows callers to avoid React state updates during normal scrolling.
 */
export function collectNewlyVisibleSections<T extends string>(
    sectionIds: readonly T[],
    layouts: ReadonlyMap<T, number>,
    mounted: ReadonlySet<T>,
    eager: ReadonlySet<T>,
    viewport: StatsViewportWindow,
): T[] {
    const newlyVisible: T[] = [];
    for (const id of sectionIds) {
        if (mounted.has(id)) continue;
        const layoutY = layouts.get(id) ?? null;
        if (shouldMountStatsSection({
            ...viewport,
            eager: eager.has(id),
            mounted: false,
            layoutY,
        })) {
            newlyVisible.push(id);
        }
    }
    return newlyVisible;
}
