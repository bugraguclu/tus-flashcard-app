import { describe, expect, it } from 'vitest';
import { KeyRepeatGuard, RevealGradeGuard, isAutoRepeatKey } from './reviewerInputGuards';

describe('RevealGradeGuard (CAL-9)', () => {
    it('refuses a grade that follows the reveal within the double-tap window', () => {
        const guard = new RevealGradeGuard();
        expect(guard.canGrade(1_000, 200)).toBe(true);
        guard.noteRevealed(1_000);
        expect(guard.canGrade(1_120, 200)).toBe(false);
        expect(guard.canGrade(1_200, 200)).toBe(true);
        guard.noteHidden();
        expect(guard.canGrade(1_050, 200)).toBe(true);
    });
});

describe('KeyRepeatGuard (CAL-10)', () => {
    it('acts once for a held key and again for a separate press', () => {
        const guard = new KeyRepeatGuard(150);
        const held = [0, 500, 533, 566, 600, 633].map((t) => guard.accept(' ', t));
        // The press acts. The platform's first repeat comes after its initial delay (~500 ms)
        // and cannot be told from a second press, so it acts once; the fast repeats after it
        // never do, however long the key stays down.
        expect(held).toEqual([true, true, false, false, false, false]);
        expect(guard.accept(' ', 1_000)).toBe(true);
        expect(guard.accept('3', 1_010)).toBe(true);
    });

    it('recognises browser auto-repeat', () => {
        expect(isAutoRepeatKey({ repeat: true })).toBe(true);
        expect(isAutoRepeatKey({ repeat: false })).toBe(false);
        expect(isAutoRepeatKey({})).toBe(false);
    });
});

describe('reviewerWaitingTargetMs (CAL-5)', () => {
    it('wakes when the next learning card enters the learn-ahead window', async () => {
        const { reviewerWaitingTargetMs } = await import('./reviewerTimers');
        const now = 1_000_000;
        const base = { hasCard: false, upcomingCardsCount: 1, nowMs: now, rolloverHour: 4 };
        expect(reviewerWaitingTargetMs({ ...base, nextLearningDue: now + 30 * 60_000, learnAheadMinutes: 20 })).toBe(now + 10 * 60_000);
        expect(reviewerWaitingTargetMs({ ...base, nextLearningDue: now + 30 * 60_000, learnAheadMinutes: 0 })).toBe(now + 30 * 60_000);
        expect(reviewerWaitingTargetMs({ ...base, hasCard: true, nextLearningDue: now + 1, learnAheadMinutes: 0 })).toBeNull();
        expect(reviewerWaitingTargetMs({ ...base, upcomingCardsCount: 0, nextLearningDue: null, learnAheadMinutes: 0 })).toBeNull();
    });
});
