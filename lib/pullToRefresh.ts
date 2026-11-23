/**
 * Pull-to-refresh for the app's data views: pull the list down past a threshold, let go, and the
 * screen reads its data from the collection again. While pulling the indicator says "Yenilemek
 * için çekin", past the threshold "Yenilemek için bırakın", then "<subject> yenileniyor…" and
 * finally "<subject> güncel" before it folds away. This module holds the UI-free part: the
 * thresholds, the phase a pull is in and the refresh run with its timings.
 */

/** Height of the indicator row; the list stays pulled down this far while it refreshes. */
export const PULL_INDICATOR_HEIGHT = 56;
/** How far the list must be pulled, in points, for a release to refresh. */
export const PULL_TRIGGER_DISTANCE = 72;
/** The spinner shows at least this long, so a fast local read still reads as a refresh. */
export const MIN_REFRESH_MS = 650;
/** How long "… güncel" stays before the indicator folds away. */
export const DONE_HOLD_MS = 1100;
/** Time the list takes to scroll back over the indicator before the gap is removed. */
export const CLOSE_ANIMATION_MS = 320;
/** A screen still busy after this long is shown as refreshed anyway; its own state takes over. */
export const MAX_BUSY_WAIT_MS = 8000;

/** What the screen is doing about a refresh. `idle` covers resting and pulling. */
export type RefreshRunState = 'idle' | 'refreshing' | 'done' | 'failed';

/** What the indicator shows. */
export type PullPhase = 'pulling' | 'armed' | RefreshRunState;

/** How far the content is pulled down past its top, from the scroll view's vertical offset. */
export function pullDistance(offsetY: number): number {
    return offsetY < 0 ? -offsetY : 0;
}

/** Whether letting go at this offset starts a refresh. */
export function isPullArmed(offsetY: number): boolean {
    return pullDistance(offsetY) >= PULL_TRIGGER_DISTANCE;
}

/** The indicator's phase: a running refresh wins over the finger's position. */
export function pullPhase(run: RefreshRunState, armed: boolean): PullPhase {
    if (run !== 'idle') return run;
    return armed ? 'armed' : 'pulling';
}

/** Screen-specific words, e.g. "Çalışmalarınız yenileniyor…" and "Çalışmalarınız güncel". */
export interface PullRefreshLabels {
    refreshing: string;
    done: string;
}

type Localize = (tr: string, en: string) => string;

/** The indicator's text for a phase. */
export function pullPhaseText(phase: PullPhase, labels: PullRefreshLabels, l: Localize): string {
    switch (phase) {
        case 'pulling':
            return l('Yenilemek için çekin', 'Pull to refresh');
        case 'armed':
            return l('Yenilemek için bırakın', 'Release to refresh');
        case 'refreshing':
            return labels.refreshing;
        case 'done':
            return labels.done;
        case 'failed':
        default:
            return l('Yenilenemedi, yeniden deneyin', 'Could not refresh, try again');
    }
}

export interface PullRefreshRunOptions {
    /** Re-reads the screen's data; may return a promise that settles once it has. */
    refresh: () => void | Promise<unknown>;
    /** True while the screen is still loading what the refresh asked for. */
    isBusy: () => boolean;
    /** Reports each state the run passes through. */
    onState: (state: RefreshRunState) => void;
    /** Scrolls the list back over the indicator; the gap closes after it. */
    close: () => void;
    /** False once the screen has gone away; the run stops reporting. */
    isMounted: () => boolean;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One refresh from release to fold-away: refreshing (at least MIN_REFRESH_MS, and until the screen
 * has finished loading), then done or failed for DONE_HOLD_MS, then back to idle.
 */
export async function runPullRefresh(options: PullRefreshRunOptions): Promise<RefreshRunState> {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    const startedAt = now();
    options.onState('refreshing');

    let outcome: RefreshRunState = 'done';
    try {
        await options.refresh();
    } catch (error) {
        console.warn('[PullToRefresh] refresh failed:', error);
        outcome = 'failed';
    }

    const remaining = MIN_REFRESH_MS - (now() - startedAt);
    if (remaining > 0) await sleep(remaining);
    // The screen's load starts within a frame of the refresh, so by now it reports busy if it is.
    const busySince = now();
    while (options.isMounted() && options.isBusy() && now() - busySince < MAX_BUSY_WAIT_MS) {
        await sleep(50);
    }
    if (!options.isMounted()) return outcome;

    options.onState(outcome);
    await sleep(DONE_HOLD_MS);
    if (!options.isMounted()) return outcome;
    options.close();
    await sleep(CLOSE_ANIMATION_MS);
    if (options.isMounted()) options.onState('idle');
    return outcome;
}
