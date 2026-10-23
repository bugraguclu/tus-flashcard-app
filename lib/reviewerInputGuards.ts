/**
 * Guards against input arriving faster than a learner can mean it.
 *
 * Two failures are covered. A double tap on "Show answer" lands its second tap on the answer
 * button that appears under the finger, grading a card whose answer was never seen (CAL-9). A held
 * key repeats: holding Space alternated "show answer" and "Good" every few hundred milliseconds,
 * answering card after card (CAL-10). AnkiDroid applies the same kind of double-tap window.
 */

/** Refuses a grade that comes within `guardMs` of the answer being revealed. */
export class RevealGradeGuard {
    private revealedAtMs = Number.NEGATIVE_INFINITY;

    noteRevealed(nowMs: number): void {
        this.revealedAtMs = nowMs;
    }

    noteHidden(): void {
        this.revealedAtMs = Number.NEGATIVE_INFINITY;
    }

    canGrade(nowMs: number, guardMs: number): boolean {
        return nowMs - this.revealedAtMs >= Math.max(0, guardMs);
    }
}

/** How close together two events of one held key arrive; separate presses are slower. */
export const KEY_REPEAT_GAP_MS = 150;

/**
 * Drops the auto-repeat of a held hardware key where the platform does not flag it (React
 * Native's `onKeyPress` has no `repeat`). Every event of a key, accepted or not, restarts its
 * window, so a key held down acts once however long it is held.
 */
export class KeyRepeatGuard {
    private readonly lastSeen = new Map<string, number>();

    constructor(private readonly gapMs: number = KEY_REPEAT_GAP_MS) {}

    accept(key: string, nowMs: number): boolean {
        const previous = this.lastSeen.get(key);
        this.lastSeen.set(key, nowMs);
        return previous === undefined || nowMs - previous >= this.gapMs;
    }
}

/** A browser key event the platform marked as auto-repeat. */
export function isAutoRepeatKey(event: { repeat?: boolean }): boolean {
    return event.repeat === true;
}
