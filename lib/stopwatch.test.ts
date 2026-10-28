import { describe, expect, it } from 'vitest';
import {
    DEFAULT_STOPWATCH_PREFS,
    MAX_BREAK_COUNT,
    MAX_GOAL_MINUTES,
    MAX_STUDY_NOTE_LENGTH,
    MAX_STUDY_PASS,
    MIN_GOAL_MINUTES,
    TUS_STUDY_SUBJECTS,
    blockProgress,
    draftFromManualEntry,
    examDaysLeft,
    finishStopwatch,
    formatGoalClock,
    formatGoalRemaining,
    formatHeroDuration,
    formatStopwatchClock,
    formatStudyTotal,
    goalProgress,
    isValidStudySessionRecord,
    manualSessionProblem,
    nextStopwatchAlert,
    normalizeStopwatchPrefs,
    normalizeStudyNote,
    normalizeSubjectName,
    parseRunningStopwatch,
    pauseStopwatch,
    resumeStopwatch,
    setStopwatchNote,
    startStopwatch,
    stepBlockMinutes,
    stepDailyGoal,
    stopwatchElapsed,
    studySubjectKey,
    withStudySessionDefaults,
    type ManualSessionEntry,
} from './stopwatch';

const MINUTE = 60_000;
const T0 = new Date('2026-10-03T14:00:00').getTime();

describe('stopwatch state machine', () => {
    it('counts study time from the start', () => {
        const state = startStopwatch('Fizyoloji', 1, T0);
        expect(stopwatchElapsed(state, T0 + 25 * MINUTE)).toEqual({ studyMs: 25 * MINUTE, breakMs: 0, phaseMs: 25 * MINUTE });
    });

    it('moves time into the break column while paused and back on resume', () => {
        let state = startStopwatch('Fizyoloji', 1, T0);
        state = pauseStopwatch(state, T0 + 50 * MINUTE);
        expect(stopwatchElapsed(state, T0 + 60 * MINUTE)).toEqual({ studyMs: 50 * MINUTE, breakMs: 10 * MINUTE, phaseMs: 10 * MINUTE });
        state = resumeStopwatch(state, T0 + 60 * MINUTE);
        expect(stopwatchElapsed(state, T0 + 90 * MINUTE)).toEqual({ studyMs: 80 * MINUTE, breakMs: 10 * MINUTE, phaseMs: 30 * MINUTE });
    });

    it('ignores a second pause or resume in the same phase', () => {
        const running = startStopwatch('Fizyoloji', 1, T0);
        expect(resumeStopwatch(running, T0 + MINUTE)).toBe(running);
        const paused = pauseStopwatch(running, T0 + MINUTE);
        expect(pauseStopwatch(paused, T0 + 2 * MINUTE)).toBe(paused);
    });

    it('counts each break as it starts', () => {
        let state = startStopwatch('Fizyoloji', 1, T0);
        expect(state.breakCount).toBe(0);
        state = pauseStopwatch(state, T0 + 10 * MINUTE);
        expect(state.breakCount).toBe(1);
        state = pauseStopwatch(state, T0 + 11 * MINUTE);
        expect(state.breakCount).toBe(1);
        state = pauseStopwatch(resumeStopwatch(state, T0 + 15 * MINUTE), T0 + 30 * MINUTE);
        expect(state.breakCount).toBe(2);
    });

    it('turns into a session whose parts fit inside its span', () => {
        let state = startStopwatch('  Fizyoloji  ', 2, T0);
        state = pauseStopwatch(state, T0 + 40 * MINUTE);
        state = resumeStopwatch(state, T0 + 45 * MINUTE);
        const session = finishStopwatch(state, T0 + 65 * MINUTE);
        expect(session).toEqual({
            subject: 'Fizyoloji',
            kind: 'pass',
            pass: 2,
            startMs: T0,
            endMs: T0 + 65 * MINUTE,
            studyMs: 60 * MINUTE,
            breakMs: 5 * MINUTE,
            breakCount: 1,
            note: '',
        });
    });

    it('keeps the type it was started with', () => {
        const state = startStopwatch('Dahiliye', 2, T0, 'mockExam');
        expect(state.kind).toBe('mockExam');
        expect(finishStopwatch(state, T0 + 30 * MINUTE)).toMatchObject({ kind: 'mockExam', pass: 2 });
        expect(startStopwatch('Dahiliye', 1, T0, 'nap' as never).kind).toBe('pass');
    });

    it('never yields negative time or a session ending before its own time when the clock moves back', () => {
        let state = startStopwatch('Anatomi', 1, T0);
        state = pauseStopwatch(state, T0 + 30 * MINUTE);
        // The clock is set back an hour while the break runs.
        const elapsed = stopwatchElapsed(state, T0 - 30 * MINUTE);
        expect(elapsed).toEqual({ studyMs: 30 * MINUTE, breakMs: 0, phaseMs: 0 });
        const session = finishStopwatch(state, T0 - 30 * MINUTE);
        expect(session.endMs).toBe(T0 + 30 * MINUTE);
        expect(isValidStudySessionRecord({ ...session, id: 1, source: 'timer' })).toBe(true);
    });

    it('reads a stored stopwatch back and refuses anything malformed', () => {
        const state = pauseStopwatch(startStopwatch('Patoloji', 3, T0), T0 + MINUTE);
        expect(parseRunningStopwatch(JSON.stringify(state))).toEqual(state);
        expect(parseRunningStopwatch(null)).toBeNull();
        expect(parseRunningStopwatch('{not json')).toBeNull();
        expect(parseRunningStopwatch(JSON.stringify({ ...state, subject: '   ' }))).toBeNull();
        expect(parseRunningStopwatch(JSON.stringify({ ...state, phase: 'nap' }))).toBeNull();
        expect(parseRunningStopwatch(JSON.stringify({ ...state, studyMs: 'a lot' }))).toBeNull();
        expect(parseRunningStopwatch(JSON.stringify({ ...state, pass: 99 }))?.pass).toBe(MAX_STUDY_PASS);
    });

    it('reads a stopwatch saved before types and break counts as "N. Tekrar" with the break it is on', () => {
        const { kind: _kind, breakCount: _breakCount, ...older } = pauseStopwatch(startStopwatch('Patoloji', 3, T0), T0 + MINUTE);
        expect(parseRunningStopwatch(JSON.stringify(older))).toMatchObject({ kind: 'pass', pass: 3, breakCount: 1 });
        expect(parseRunningStopwatch(JSON.stringify({ ...older, phase: 'study' }))?.breakCount).toBe(0);
        expect(parseRunningStopwatch(JSON.stringify({ ...older, kind: 'video', breakCount: 4 }))).toMatchObject({ kind: 'video', breakCount: 4 });
    });

    it('saves the note written while it ran with the session', () => {
        let state = startStopwatch('Biyokimya', 1, T0);
        expect(state.note).toBe('');
        state = setStopwatchNote(state, `  ${'x'.repeat(MAX_STUDY_NOTE_LENGTH + 20)}  `);
        expect(state.note).toBe('x'.repeat(MAX_STUDY_NOTE_LENGTH));
        state = setStopwatchNote(pauseStopwatch(state, T0 + 10 * MINUTE), ' Sayfa 120-140 ');
        expect(parseRunningStopwatch(JSON.stringify(state))?.note).toBe('Sayfa 120-140');
        expect(finishStopwatch(state, T0 + 20 * MINUTE).note).toBe('Sayfa 120-140');
    });

    it('reads a stopwatch saved before notes as one without a note', () => {
        const { note: _note, ...older } = startStopwatch('Patoloji', 3, T0);
        expect(parseRunningStopwatch(JSON.stringify(older))?.note).toBe('');
        expect(parseRunningStopwatch(JSON.stringify({ ...older, note: 42 }))?.note).toBe('');
    });
});

describe('hand entry', () => {
    const NOW = T0 + 3 * 60 * MINUTE;
    const entry: ManualSessionEntry = {
        subject: 'Dahiliye',
        kind: 'pass',
        pass: 2,
        startMs: T0,
        endMs: T0 + 90 * MINUTE,
        breakMs: 15 * MINUTE,
        breakCount: 2,
        note: 'Sayfa 120-140',
    };

    it('saves the span less the breaks as the study time', () => {
        expect(manualSessionProblem(entry, NOW)).toBeNull();
        const draft = draftFromManualEntry(entry);
        expect(draft).toEqual({
            subject: 'Dahiliye', kind: 'pass', pass: 2, startMs: T0, endMs: T0 + 90 * MINUTE,
            studyMs: 75 * MINUTE, breakMs: 15 * MINUTE, breakCount: 2, note: 'Sayfa 120-140',
        });
        expect(isValidStudySessionRecord({ ...draft, id: 1, source: 'manual' })).toBe(true);
    });

    it('refuses an end that is not after the start', () => {
        expect(manualSessionProblem({ ...entry, endMs: entry.startMs }, NOW)).toBe('order');
        expect(manualSessionProblem({ ...entry, endMs: entry.startMs - MINUTE }, NOW)).toBe('order');
    });

    it('refuses an end in the future, allowing the minute that has just begun', () => {
        expect(manualSessionProblem({ ...entry, endMs: NOW + 30_000 }, NOW)).toBeNull();
        expect(manualSessionProblem({ ...entry, endMs: NOW + 2 * MINUTE }, NOW)).toBe('future');
    });

    it('refuses a session longer than a day', () => {
        expect(manualSessionProblem({ ...entry, startMs: NOW - 24 * 60 * MINUTE, endMs: NOW, breakMs: 0 }, NOW)).toBeNull();
        expect(manualSessionProblem({ ...entry, startMs: NOW - 24 * 60 * MINUTE - MINUTE, endMs: NOW, breakMs: 0 }, NOW)).toBe('tooLong');
    });

    it('refuses breaks longer than the span and leaves at least a minute of study', () => {
        expect(manualSessionProblem({ ...entry, breakMs: 91 * MINUTE }, NOW)).toBe('break');
        expect(manualSessionProblem({ ...entry, breakMs: -MINUTE }, NOW)).toBe('break');
        expect(manualSessionProblem({ ...entry, breakMs: 90 * MINUTE }, NOW)).toBe('tooShort');
        expect(manualSessionProblem({ ...entry, breakMs: 89 * MINUTE }, NOW)).toBeNull();
    });
});

describe('isValidStudySessionRecord', () => {
    const valid = {
        id: 5, subject: 'Farmakoloji', kind: 'questions', pass: 1, startMs: T0, endMs: T0 + 70 * MINUTE,
        studyMs: 60 * MINUTE, breakMs: 10 * MINUTE, breakCount: 2, note: 'Sayfa 120-140', source: 'manual',
    };

    it('accepts a well-formed session', () => {
        expect(isValidStudySessionRecord(valid)).toBe(true);
        expect(isValidStudySessionRecord({ ...valid, note: 'x'.repeat(MAX_STUDY_NOTE_LENGTH), breakCount: MAX_BREAK_COUNT })).toBe(true);
    });

    it('accepts a session stored before the type, break count and note, and reads it as "N. Tekrar"', () => {
        const { kind: _kind, breakCount: _breakCount, note: _note, ...older } = valid;
        expect(isValidStudySessionRecord(older)).toBe(true);
        expect(withStudySessionDefaults(older as never)).toEqual({ ...older, kind: 'pass', breakCount: 0, note: '' });
        expect(withStudySessionDefaults(valid as never)).toEqual(valid);
    });

    it.each([
        ['a time total longer than the span', { studyMs: 65 * MINUTE }],
        ['an end before the start', { endMs: T0 - 1 }],
        ['an unknown source', { source: 'cards' }],
        ['an empty subject', { subject: '' }],
        ['a pass of zero', { pass: 0 }],
        ['a fractional id', { id: 1.5 }],
        ['negative break time', { breakMs: -1 }],
        ['an unknown type', { kind: 'nap' }],
        ['a null type', { kind: null }],
        ['a negative break count', { breakCount: -1 }],
        ['a fractional break count', { breakCount: 1.5 }],
        ['too many breaks', { breakCount: MAX_BREAK_COUNT + 1 }],
        ['a note longer than its limit', { note: 'x'.repeat(MAX_STUDY_NOTE_LENGTH + 1) }],
        ['a note that is not text', { note: 42 }],
    ])('rejects %s', (_label, patch) => {
        expect(isValidStudySessionRecord({ ...valid, ...patch })).toBe(false);
    });
});

describe('normalizeStudyNote', () => {
    it('trims a note and keeps nothing for anything that is not text', () => {
        expect(normalizeStudyNote('  Sayfa 120-140 arasını çalıştım.\n ')).toBe('Sayfa 120-140 arasını çalıştım.');
        expect(normalizeStudyNote(undefined)).toBe('');
        expect(normalizeStudyNote(42)).toBe('');
    });

    it('cuts a long note to its limit without splitting an emoji', () => {
        expect(normalizeStudyNote('a'.repeat(150))).toBe('a'.repeat(MAX_STUDY_NOTE_LENGTH));
        const cut = normalizeStudyNote(`${'a'.repeat(MAX_STUDY_NOTE_LENGTH - 1)}😀b`);
        expect(cut).toBe('a'.repeat(MAX_STUDY_NOTE_LENGTH - 1));
        expect(isValidStudySessionRecord({ id: 1, subject: 'A', pass: 1, startMs: 1, endMs: 1, studyMs: 0, breakMs: 0, source: 'manual', note: cut })).toBe(true);
    });
});

describe('TUS_STUDY_SUBJECTS', () => {
    it('offers Karışık rather than subjects that are now study types', () => {
        expect(TUS_STUDY_SUBJECTS).toContain('Karışık');
        // Question practice and mock exams are types; listing them as subjects too would let a
        // session read "Soru Çözümü" twice, or file a mock exam under two different headings.
        expect(TUS_STUDY_SUBJECTS).not.toContain('Soru Çözümü');
        expect(TUS_STUDY_SUBJECTS).not.toContain('Deneme Sınavı');
        expect(new Set(TUS_STUDY_SUBJECTS).size).toBe(TUS_STUDY_SUBJECTS.length);
    });
});

describe('preferences', () => {
    it('fills every missing or broken field with its default', () => {
        expect(normalizeStopwatchPrefs(null)).toEqual(DEFAULT_STOPWATCH_PREFS);
        expect(normalizeStopwatchPrefs({ dailyGoalMinutes: 'x', examDate: '2027-02-30', plan: { subject: '' } })).toEqual(DEFAULT_STOPWATCH_PREFS);
    });

    it('keeps valid values and clamps the rest', () => {
        expect(normalizeStopwatchPrefs({
            dailyGoalMinutes: 99_999,
            examDate: '2027-03-21',
            focusMinutes: 0,
            breakMinutes: 2,
            alertsEnabled: false,
            plan: { subject: ' Biyokimya ', pass: 4 },
        })).toEqual({
            dailyGoalMinutes: MAX_GOAL_MINUTES,
            examDate: '2027-03-21',
            focusMinutes: 0,
            breakMinutes: 5,
            alertsEnabled: false,
            plan: { subject: 'Biyokimya', kind: 'pass', pass: 4 },
        });
    });

    it('keeps the type of the plan', () => {
        expect(normalizeStopwatchPrefs({ plan: { subject: 'Anatomi', kind: 'video', pass: 2 } }).plan)
            .toEqual({ subject: 'Anatomi', kind: 'video', pass: 2 });
        expect(normalizeStopwatchPrefs({ plan: { subject: 'Anatomi', kind: 'nap', pass: 2 } }).plan?.kind).toBe('pass');
    });

    it('steps the daily goal by half an hour and snaps an odd goal onto the grid', () => {
        expect(stepDailyGoal(480, 1)).toBe(510);
        expect(stepDailyGoal(480, -1)).toBe(450);
        expect(stepDailyGoal(475, 1)).toBe(480);
        expect(stepDailyGoal(475, -1)).toBe(450);
        expect(stepDailyGoal(MIN_GOAL_MINUTES, -1)).toBe(MIN_GOAL_MINUTES);
        expect(stepDailyGoal(MAX_GOAL_MINUTES, 1)).toBe(MAX_GOAL_MINUTES);
    });

    it('steps a block length through "off" at the bottom', () => {
        expect(stepBlockMinutes(50, 1, 180)).toBe(55);
        expect(stepBlockMinutes(5, -1, 180)).toBe(0);
        expect(stepBlockMinutes(0, -1, 180)).toBe(0);
        expect(stepBlockMinutes(0, 1, 180)).toBe(5);
        expect(stepBlockMinutes(180, 1, 180)).toBe(180);
        expect(stepBlockMinutes(52, -1, 180)).toBe(50);
    });

    it('folds subject names for comparison, Turkish capitals included', () => {
        expect(studySubjectKey('  FİZYOLOJİ ')).toBe(studySubjectKey('Fizyoloji'));
        expect(studySubjectKey('Kadın   Doğum')).toBe('kadın doğum');
        expect(studySubjectKey(null)).toBe('');
    });

    it('trims subject names', () => {
        expect(normalizeSubjectName('  Kadın   Hastalıkları  ')).toBe('Kadın Hastalıkları');
        expect(normalizeSubjectName(42)).toBe('');
        expect(normalizeSubjectName('x'.repeat(200))).toHaveLength(80);
    });
});

describe('block reminders', () => {
    const prefs = { focusMinutes: 50, breakMinutes: 10 };

    it('falls due a study block after the current study phase began', () => {
        const state = startStopwatch('Anatomi', 1, T0);
        expect(nextStopwatchAlert(state, prefs)).toEqual({ kind: 'focus', atMs: T0 + 50 * MINUTE });
    });

    it('falls due a break length after the break began', () => {
        const state = pauseStopwatch(startStopwatch('Anatomi', 1, T0), T0 + 50 * MINUTE);
        expect(nextStopwatchAlert(state, prefs)).toEqual({ kind: 'break', atMs: T0 + 60 * MINUTE });
    });

    it('is off for a phase whose length is zero', () => {
        const state = startStopwatch('Anatomi', 1, T0);
        expect(nextStopwatchAlert(state, { focusMinutes: 0, breakMinutes: 10 })).toBeNull();
    });
});

describe('display', () => {
    it('formats the goal and the stopwatch as clocks', () => {
        expect(formatGoalClock(480)).toBe('08:00');
        expect(formatGoalClock(90)).toBe('01:30');
        expect(formatStopwatchClock(0)).toBe('00:00:00');
        expect(formatStopwatchClock(3_723_400)).toBe('01:02:03');
        expect(formatStopwatchClock(Number.NaN)).toBe('00:00:00');
    });

    it('writes the hero\'s times as TUSBuddy does', () => {
        expect(formatHeroDuration(0, 'tr')).toBe('0 dk');
        expect(formatHeroDuration(45 * MINUTE + 59_000, 'tr')).toBe('45 dk');
        expect(formatHeroDuration(8 * 60 * MINUTE, 'tr')).toBe('8 saat');
        expect(formatHeroDuration(295 * MINUTE, 'tr')).toBe('4s 55dk');
        expect(formatHeroDuration(295 * MINUTE, 'en')).toBe('4h 55m');
        expect(formatHeroDuration(120 * MINUTE, 'en')).toBe('2 h');
        expect(formatHeroDuration(-5, 'en')).toBe('0 min');
        expect(formatHeroDuration(Number.NaN, 'tr')).toBe('0 dk');
    });

    it('measures the current block against its length and says how far past it is', () => {
        expect(blockProgress(20 * MINUTE, 50)).toEqual({ share: 0.4, remainingMs: 30 * MINUTE, overMs: 0 });
        expect(blockProgress(50 * MINUTE, 50)).toEqual({ share: 1, remainingMs: 0, overMs: 0 });
        expect(blockProgress(65 * MINUTE, 50)).toEqual({ share: 1, remainingMs: 0, overMs: 15 * MINUTE });
        expect(blockProgress(-MINUTE, 10)).toEqual({ share: 0, remainingMs: 10 * MINUTE, overMs: 0 });
        expect(blockProgress(10 * MINUTE, 0)).toBeNull();
    });

    it('writes totals in whole minutes', () => {
        expect(formatStudyTotal(0, 'tr')).toBe('0 dk');
        expect(formatStudyTotal(45 * MINUTE + 59_000, 'tr')).toBe('45 dk');
        expect(formatStudyTotal(80 * MINUTE, 'tr')).toBe('1 sa 20 dk');
        expect(formatStudyTotal(120 * MINUTE, 'en')).toBe('2 h');
    });

    it('rounds the time left up, so an unmet goal never reads as zero', () => {
        expect(formatGoalRemaining(8 * 60 * MINUTE, 'tr')).toBe('8 saat');
        expect(formatGoalRemaining(7.5 * 60 * MINUTE, 'tr')).toBe('7 sa 30 dk');
        expect(formatGoalRemaining(10_000, 'tr')).toBe('1 dk');
        expect(formatGoalRemaining(60 * MINUTE, 'en')).toBe('1 hour');
        expect(formatGoalRemaining(150 * MINUTE, 'en')).toBe('2 h 30 min');
    });

    it('measures progress against the goal, capped at a full ring', () => {
        expect(goalProgress(0, 480)).toBe(0);
        expect(goalProgress(240 * MINUTE, 480)).toBe(0.5);
        expect(goalProgress(600 * MINUTE, 480)).toBe(1);
        expect(goalProgress(60 * MINUTE, 0)).toBe(0);
    });

    it('counts calendar days to the exam', () => {
        const now = new Date('2026-10-03T23:30:00').getTime();
        expect(examDaysLeft('2026-11-17', now)).toBe(45);
        expect(examDaysLeft('2026-10-03', now)).toBe(0);
        expect(examDaysLeft('2026-10-01', now)).toBe(-2);
        expect(examDaysLeft(null, now)).toBeNull();
        expect(examDaysLeft('2026-13-01', now)).toBeNull();
    });
});
