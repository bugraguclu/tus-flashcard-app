import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getTodayPlanProgress, type TodayPlanProgress } from '../lib/todayPlanProgress';

const LIVE_REFRESH_MS = 30_000;

/**
 * Today's Kronometre plan progress, read again whenever the screen gains focus and every 30 s
 * while it stays focused. The cached Statistics snapshot is keyed by collection revisions, which
 * starting, pausing or resuming the stopwatch never changes, so its copy goes stale while the
 * learner studies. A failed read keeps the last value (the snapshot's own, or reported failure).
 */
export function useLiveTodayPlan(rolloverHour: number): TodayPlanProgress | null {
    const [plan, setPlan] = useState<TodayPlanProgress | null>(null);
    const [focused, setFocused] = useState(false);

    const read = useCallback(() => {
        try {
            setPlan(getTodayPlanProgress(rolloverHour));
        } catch (error) {
            console.warn('[Stats] live today plan read failed:', error);
        }
    }, [rolloverHour]);

    useFocusEffect(useCallback(() => {
        setFocused(true);
        read();
        return () => setFocused(false);
    }, [read]));

    useEffect(() => {
        if (!focused) return undefined;
        const timer = setInterval(read, LIVE_REFRESH_MS);
        return () => clearInterval(timer);
    }, [focused, read]);

    return plan;
}
