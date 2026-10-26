import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
    MIN_SESSION_MS,
    finishStopwatch,
    pauseStopwatch,
    resumeStopwatch,
    startStopwatch,
    stopwatchElapsed,
    type RunningStopwatch,
    type StopwatchPrefs,
    type StudyKind,
    type StudySessionRecord,
} from '../lib/stopwatch';
import {
    insertStudySession,
    loadRunningStopwatch,
    loadStopwatchPrefs,
    saveRunningStopwatch,
    saveStopwatchPrefs,
} from '../lib/stopwatchStore';
import {
    cancelStopwatchAlert,
    syncStopwatchAlert,
    type StopwatchAlertCopy,
} from '../lib/stopwatchNotifications';

/**
 * The Kronometre's live state: preferences, the running stopwatch and a clock that ticks every
 * second while it runs. Every change is written through to storage at once, so leaving the
 * screen, locking the phone or closing the app never loses a running session, and the block
 * reminder is rescheduled with it.
 */
export function useStopwatch(buildAlertCopy: (state: RunningStopwatch, prefs: StopwatchPrefs) => StopwatchAlertCopy) {
    const [prefs, setPrefs] = useState<StopwatchPrefs>(() => loadStopwatchPrefs());
    const [running, setRunning] = useState<RunningStopwatch | null>(() => loadRunningStopwatch());
    const [nowMs, setNowMs] = useState(() => Date.now());
    const copyRef = useRef(buildAlertCopy);
    copyRef.current = buildAlertCopy;

    const syncAlert = useCallback((state: RunningStopwatch | null, nextPrefs: StopwatchPrefs) => {
        const task = state
            ? syncStopwatchAlert(state, nextPrefs, copyRef.current(state, nextPrefs))
            : cancelStopwatchAlert();
        void task.catch((error) => console.warn('[Stopwatch] reminder sync failed:', error));
    }, []);

    // Storage is the source of truth: a restore, or the same collection open in another web tab,
    // may have changed it while this screen was out of sight.
    const reload = useCallback(() => {
        setPrefs(loadStopwatchPrefs());
        setRunning(loadRunningStopwatch());
        setNowMs(Date.now());
    }, []);

    useFocusEffect(reload);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') reload();
        });
        return () => subscription.remove();
    }, [reload]);

    const isRunning = running !== null;
    useFocusEffect(useCallback(() => {
        // A second is the stopwatch's resolution; while idle only "time left" and the date move.
        const timer = setInterval(() => setNowMs(Date.now()), isRunning ? 1000 : 30_000);
        return () => clearInterval(timer);
    }, [isRunning]));

    const commitRunning = useCallback((next: RunningStopwatch | null, nextPrefs: StopwatchPrefs) => {
        saveRunningStopwatch(next);
        setRunning(next);
        setNowMs(Date.now());
        syncAlert(next, nextPrefs);
    }, [syncAlert]);

    const updatePrefs = useCallback((patch: Partial<StopwatchPrefs>): StopwatchPrefs => {
        const next = saveStopwatchPrefs({ ...prefs, ...patch });
        setPrefs(next);
        // The reminder switch and the block lengths decide what is pending.
        if (running) syncAlert(running, next);
        return next;
    }, [prefs, running, syncAlert]);

    const start = useCallback((subject: string, pass: number, kind: StudyKind) => {
        const state = startStopwatch(subject, pass, Date.now(), kind);
        // The first subject ever started becomes the plan, so the card below the hero has one to offer.
        const nextPrefs = prefs.plan
            ? prefs
            : saveStopwatchPrefs({ ...prefs, plan: { subject: state.subject, kind: state.kind, pass: state.pass } });
        setPrefs(nextPrefs);
        commitRunning(state, nextPrefs);
    }, [prefs, commitRunning]);

    const pause = useCallback(() => {
        if (running) commitRunning(pauseStopwatch(running, Date.now()), prefs);
    }, [running, prefs, commitRunning]);

    const resume = useCallback(() => {
        if (running) commitRunning(resumeStopwatch(running, Date.now()), prefs);
    }, [running, prefs, commitRunning]);

    /**
     * Stop and save. Returns the stored session, or null when it was shorter than a minute and so
     * not kept. The session is stored before the stopwatch is cleared: if storing fails, the
     * stopwatch keeps running and nothing is lost.
     */
    const finish = useCallback((): StudySessionRecord | null => {
        if (!running) return null;
        const now = Date.now();
        const draft = finishStopwatch(running, now);
        const record = draft.studyMs >= MIN_SESSION_MS ? insertStudySession(draft, 'timer', now) : null;
        commitRunning(null, prefs);
        return record;
    }, [running, prefs, commitRunning]);

    const discard = useCallback(() => {
        commitRunning(null, prefs);
    }, [prefs, commitRunning]);

    return {
        prefs,
        running,
        nowMs,
        elapsed: running ? stopwatchElapsed(running, nowMs) : null,
        updatePrefs,
        start,
        pause,
        resume,
        finish,
        discard,
    };
}
