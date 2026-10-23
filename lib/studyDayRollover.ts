/**
 * Crossing the day boundary while the reviewer stays open.
 *
 * The app's foreground listener runs the daily housekeeping when the app comes back from the
 * background, but a learner who keeps studying past the rollover never leaves the foreground.
 * Anki starts the new day there too: buried cards come back, yesterday's "today only" limits stop
 * applying, and the undo history (which belongs to the previous day's queue) is cleared.
 */
import { todayLocalYMD } from './schedulingIntervals';
import { runDailyMaintenance } from './maintenance';
import { pruneQueueBookkeeping } from './queueBookkeeping';

/** Watches the study day; `check` reports true once each time it changes. */
export class StudyDayWatcher {
    private day: string;

    constructor(private readonly rolloverHour: number, nowMs: number = Date.now()) {
        this.day = todayLocalYMD(new Date(nowMs), rolloverHour);
    }

    check(nowMs: number = Date.now()): boolean {
        const day = todayLocalYMD(new Date(nowMs), this.rolloverHour);
        if (day === this.day) return false;
        this.day = day;
        return true;
    }
}

/** The collection side of a new study day: unbury (once per day) and drop yesterday's markers. */
export function startNewStudyDay(rolloverHour: number): void {
    try {
        runDailyMaintenance();
    } catch (error) {
        console.warn('[Study] day rollover maintenance failed:', error);
    }
    try {
        pruneQueueBookkeeping(rolloverHour);
    } catch (error) {
        console.warn('[Study] queue bookkeeping prune failed:', error);
    }
}
