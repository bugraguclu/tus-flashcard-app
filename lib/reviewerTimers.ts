// Reviewer timers: Anki's on-screen answer timer and the "time remaining" estimate.

import type { QueueStats } from './studyRepository';

const MINUTE_MS = 60_000;

/**
 * Seconds shown by Anki's on-screen answer timer.
 *
 * The manual: "On the Study screen, show a timer that counts the time you're taking to study each
 * card. (This timer will stop when it reaches the Maximum answer seconds set for the internal
 * timer.)" — so the display freezes at the deck's cap even though the card is still open, and the
 * recorded review time is capped at the same value (lib/reviewLogger.ts).
 */
export function answerTimerSeconds(elapsedMs: number, maxAnswerSecs: number): number {
    const cap = Math.max(1, Math.floor(maxAnswerSecs) || 60);
    return Math.min(cap, Math.max(0, Math.floor(elapsedMs / 1000)));
}

/** Whole seconds as a stopwatch reading: 7 -> "0:07", 65 -> "1:05", 3605 -> "60:05". */
export function formatStopwatch(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Whether an Auto Advance action may run.
 *
 * The dwell timer starts when the card side appears. "Wait for audio" only postpones an action
 * whose dwell time has already elapsed; it must not restart the dwell timer after the audio ends.
 * The resulting delay is therefore the longer of the configured dwell time and the audio length.
 *
 * Drawing blocks the action outright. Anki has no whiteboard to reconcile this with, but it does
 * give up on Auto Advance as soon as the reviewer stops being the learner's focus, and ink on the
 * board is unsaved work: advancing the card discards the drawing and no undo brings it back. The
 * caller also pauses the dwell timer while the board is open, so the wait resumes rather than
 * restarting once drawing mode is closed.
 */
export function shouldRunAutoAdvance(
    elapsedMs: number,
    targetMs: number,
    waitForAudio: boolean,
    audioActive: boolean,
    drawingActive: boolean,
): boolean {
    if (drawingActive) return false;
    if (Math.max(0, elapsedMs) < Math.max(0, targetMs)) return false;
    return !waitForAudio || !audioActive;
}

/**
 * Whether advancing to `nextCardId` should wipe the reviewer whiteboard.
 *
 * Ink belongs to the card it was drawn over, so a move to another card clears it, as AnkiDroid
 * does. A null id is not a card: the queue passes through null whenever it is rebuilt — after the
 * learn-ahead countdown, at a timebox checkpoint, on the "all done" screen — and those gaps used
 * to read as a card change and destroy a drawing the learner was still using.
 */
export function shouldClearWhiteboardForCard(
    inkedCardId: number | null,
    nextCardId: number | null,
): boolean {
    if (nextCardId === null) return false;
    return inkedCardId !== nextCardId;
}

export interface StudyTimeEstimateOptions {
    /** Average time one answer has been taking, from the review log. */
    averageAnswerMs: number;
    /** Learning steps in force, because a new card is answered once per step before it graduates. */
    learningStepCount: number;
}

/**
 * Minutes still needed to finish what the queue is holding, the way Anki's `eta` works: the
 * remaining answers are estimated from recent answer times, and a new card counts for more than
 * one answer because it has to walk its learning steps before it leaves the queue today.
 *
 * Returns null when there is nothing to estimate — no cards left, or no answer times to learn
 * the pace from. Showing a made-up number would be worse than showing nothing.
 */
export function estimateStudyMinutes(
    counts: QueueStats,
    options: StudyTimeEstimateOptions,
): number | null {
    const averageAnswerMs = Math.max(0, options.averageAnswerMs);
    if (averageAnswerMs <= 0) return null;

    const stepsPerNewCard = Math.max(1, Math.floor(options.learningStepCount) || 1);
    const answersLeft = Math.max(0, counts.newCount) * stepsPerNewCard
        + Math.max(0, counts.learningCount)
        + Math.max(0, counts.reviewCount);
    if (answersLeft === 0) return null;

    return Math.max(1, Math.round((answersLeft * averageAnswerMs) / MINUTE_MS));
}
