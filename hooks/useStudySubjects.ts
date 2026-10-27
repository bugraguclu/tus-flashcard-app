import { useCallback, useState } from 'react';
import { latestStudyPass, recentStudySubjects } from '../lib/stopwatchStore';

/** Subjects listed under "Son çalışılanlar" when a subject is picked. */
const RECENT_SUBJECT_LIMIT = 12;

/**
 * What the Kronometre's subject pickers offer: the subjects of the latest sessions, read when a
 * picker opens rather than on every render, and the pass a new session of a subject continues.
 */
export function useStudySubjects(logTag: string) {
    const [recentSubjects, setRecentSubjects] = useState<string[]>([]);

    const loadRecentSubjects = useCallback(() => {
        try {
            setRecentSubjects(recentStudySubjects(RECENT_SUBJECT_LIMIT));
        } catch (error) {
            console.warn(`[${logTag}] recent subjects failed:`, error);
        }
    }, [logTag]);

    const passOf = useCallback((subject: string) => {
        try {
            return latestStudyPass(subject) ?? 1;
        } catch {
            return 1;
        }
    }, []);

    return { recentSubjects, loadRecentSubjects, passOf };
}
