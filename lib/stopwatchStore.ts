/**
 * Persistence for the Kronometre: stored sessions in `study_sessions`, the learner's preferences
 * and the stopwatch that is still running, both kept as keys of the SQLite settings table.
 *
 * The running stopwatch is deliberately not part of backups: a restore brings back finished
 * sessions, never a clock that started on another day.
 */

import { getDB } from './db';
import { getDbSetting, setDbSetting } from './dbSettings';
import {
    clampPass,
    isValidStudySessionRecord,
    normalizeStopwatchPrefs,
    normalizeSubjectName,
    parseRunningStopwatch,
    type RunningStopwatch,
    type StopwatchPrefs,
    type StudySessionDraft,
    type StudySessionRecord,
    type StudySessionSource,
} from './stopwatch';

const PREFS_KEY = 'tus_stopwatch_prefs_v1';
const RUNNING_KEY = 'tus_stopwatch_running_v1';

const SESSION_COLUMNS = 'id, subject, pass, startMs, endMs, studyMs, breakMs, source';

export function loadStopwatchPrefs(): StopwatchPrefs {
    const raw = getDbSetting(PREFS_KEY);
    if (!raw) return normalizeStopwatchPrefs(null);
    try {
        return normalizeStopwatchPrefs(JSON.parse(raw));
    } catch {
        return normalizeStopwatchPrefs(null);
    }
}

/** Store the preferences after normalizing them, and return what was stored. */
export function saveStopwatchPrefs(prefs: StopwatchPrefs): StopwatchPrefs {
    const normalized = normalizeStopwatchPrefs(prefs);
    setDbSetting(PREFS_KEY, JSON.stringify(normalized));
    return normalized;
}

export function loadRunningStopwatch(): RunningStopwatch | null {
    return parseRunningStopwatch(getDbSetting(RUNNING_KEY));
}

/** Persist the running stopwatch, or forget it when `state` is null. */
export function saveRunningStopwatch(state: RunningStopwatch | null): void {
    if (state) {
        setDbSetting(RUNNING_KEY, JSON.stringify(state));
        return;
    }
    getDB().runSync('DELETE FROM settings WHERE key = ?', RUNNING_KEY);
}

function readRecords(sql: string, ...params: unknown[]): StudySessionRecord[] {
    return getDB()
        .getAllSync<StudySessionRecord>(sql, ...params)
        .filter(isValidStudySessionRecord);
}

/**
 * A row id for a new session: its creation time, as Anki ids are, moved past the newest id so a
 * restored backup holding later ids (or two saves in one millisecond) can never collide.
 */
function nextSessionId(nowMs: number): number {
    const row = getDB().getFirstSync<{ maxId: number | null }>('SELECT MAX(id) AS maxId FROM study_sessions');
    return Math.max(Math.floor(nowMs), (row?.maxId ?? 0) + 1);
}

function sanitizeDraft(draft: StudySessionDraft): StudySessionDraft {
    const studyMs = Math.max(0, Math.round(draft.studyMs));
    const breakMs = Math.max(0, Math.round(draft.breakMs));
    const startMs = Math.round(draft.startMs);
    return {
        subject: normalizeSubjectName(draft.subject),
        pass: clampPass(draft.pass),
        startMs,
        endMs: Math.max(Math.round(draft.endMs), startMs + studyMs + breakMs),
        studyMs,
        breakMs,
    };
}

export function insertStudySession(
    draft: StudySessionDraft,
    source: StudySessionSource,
    nowMs: number = Date.now(),
): StudySessionRecord {
    const record: StudySessionRecord = { id: nextSessionId(nowMs), source, ...sanitizeDraft(draft) };
    if (!isValidStudySessionRecord(record)) throw new Error('Invalid study session');
    getDB().runSync(
        `INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id, record.subject, record.pass, record.startMs, record.endMs, record.studyMs, record.breakMs, record.source,
    );
    return record;
}

/** Rewrite an existing session in place; its id and source stay as they were. */
export function updateStudySession(id: number, draft: StudySessionDraft): void {
    const clean = sanitizeDraft(draft);
    const probe = { id, source: 'manual', ...clean };
    if (!isValidStudySessionRecord(probe)) throw new Error('Invalid study session');
    getDB().runSync(
        'UPDATE study_sessions SET subject = ?, pass = ?, startMs = ?, endMs = ?, studyMs = ?, breakMs = ? WHERE id = ?',
        clean.subject, clean.pass, clean.startMs, clean.endMs, clean.studyMs, clean.breakMs, id,
    );
}

export function deleteStudySession(id: number): void {
    getDB().runSync('DELETE FROM study_sessions WHERE id = ?', id);
}

/** Sessions that overlap `[startMs, endMs]`, oldest first. */
export function fetchStudySessionsBetween(startMs: number, endMs: number): StudySessionRecord[] {
    if (!(endMs > startMs)) return [];
    return readRecords(
        `SELECT ${SESSION_COLUMNS} FROM study_sessions WHERE endMs >= ? AND startMs <= ? ORDER BY startMs ASC, id ASC`,
        startMs,
        endMs,
    );
}

/** The pass of the latest session of a subject, so a new session continues where it stopped. */
export function latestStudyPass(subject: string): number | null {
    const row = getDB().getFirstSync<{ pass: number }>(
        'SELECT pass FROM study_sessions WHERE subject = ? ORDER BY startMs DESC, id DESC LIMIT 1',
        normalizeSubjectName(subject),
    );
    return row ? clampPass(row.pass) : null;
}

/** Subjects of the most recent sessions, newest first and without repeats. */
export function recentStudySubjects(limit: number): string[] {
    const rows = getDB().getAllSync<{ subject: string }>(
        `SELECT subject FROM study_sessions GROUP BY subject ORDER BY MAX(startMs) DESC LIMIT ?`,
        Math.max(1, Math.floor(limit)),
    );
    return rows.map((row) => row.subject).filter((subject) => typeof subject === 'string' && subject.length > 0);
}

// --- Backup ---

export function readStudySessionsForBackup(): StudySessionRecord[] {
    return readRecords(`SELECT ${SESSION_COLUMNS} FROM study_sessions ORDER BY id`);
}

/** Replace every stored session. Runs inside the restore's own transaction. */
export function replaceStudySessions(rows: StudySessionRecord[]): void {
    const db = getDB();
    db.execSync('DELETE FROM study_sessions;');
    for (const row of rows) {
        db.runSync(
            `INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            row.id, row.subject, row.pass, row.startMs, row.endMs, row.studyMs, row.breakMs, row.source,
        );
    }
}
