/**
 * Chooses the moment an automatic backup is allowed to run.
 *
 * `exportAllData()` reads every table and serialises the whole collection in one synchronous
 * pass. That pass has to stay synchronous: yielding between the table reads would let a card
 * answer land mid-snapshot and produce a backup whose revlog disagrees with its cards. Since
 * the work cannot be broken up, the only way to keep it off an interactive frame budget is to
 * choose *when* it happens — never while the learner is answering cards.
 *
 * Study surfaces mark themselves busy while they hold focus; the scheduler holds the weekly
 * snapshot until a quiet window opens (the app leaves the foreground, or the reviewer closes).
 */

/** The part of AppState this policy distinguishes. */
export type ForegroundState = 'active' | 'inactive' | 'background';

export interface BackupWindowState {
    appState: ForegroundState;
    /** True while a study surface is the screen in front of the learner. */
    studyActive: boolean;
}

/**
 * Leaving the foreground is the ideal window: no frame budget to protect, and an interrupted
 * snapshot is harmless — the store writes to a temporary file and renames it, and the "last
 * backup" timestamp is only recorded after that write succeeds, so a suspended run retries
 * later instead of leaving a partial file behind.
 */
export function canRunAutoBackup(state: BackupWindowState): boolean {
    if (state.appState !== 'active') return true;
    return !state.studyActive;
}

let activeStudySurfaces = 0;
const idleListeners = new Set<() => void>();

/**
 * Marks a study surface as on screen and returns its release function. Releasing the last
 * surface notifies listeners, so a deferred snapshot runs the moment the reviewer closes
 * rather than waiting out the remainder of the poll interval.
 *
 * Reference-counted: a route change can briefly mount the next reviewer before the previous
 * one releases, and a single shared boolean would report idle in that overlap.
 */
export function beginStudyActivity(): () => void {
    activeStudySurfaces += 1;
    let released = false;
    return () => {
        // Focus effects can clean up twice (blur followed by unmount); only the first
        // release may decrement, otherwise the count drifts below the real surface count.
        if (released) return;
        released = true;
        activeStudySurfaces = Math.max(0, activeStudySurfaces - 1);
        if (activeStudySurfaces === 0) {
            for (const listener of [...idleListeners]) listener();
        }
    };
}

export function isStudyActive(): boolean {
    return activeStudySurfaces > 0;
}

export function subscribeToStudyIdle(listener: () => void): () => void {
    idleListeners.add(listener);
    return () => {
        idleListeners.delete(listener);
    };
}

/** Test seam: module-level counters otherwise leak between cases. */
export function resetStudyActivityForTests(): void {
    activeStudySurfaces = 0;
    idleListeners.clear();
}
