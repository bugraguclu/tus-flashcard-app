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
    clampBreakCount,
    clampPass,
    isValidStudySessionRecord,
    normalizeStopwatchPrefs,
    normalizeStudyKind,
    normalizeStudyNote,
    normalizeSubjectName,
    parseRunningStopwatch,
    withStudySessionDefaults,
    type RunningStopwatch,
    type StopwatchPrefs,
    type StudySessionDraft,
    type StudySessionRecord,
    type StudySessionRow,
    type StudySessionSource,
} from './stopwatch';

const PREFS_KEY = 'tus_stopwatch_prefs_v1';
const RUNNING_KEY = 'tus_stopwatch_running_v1';
/** Sessions "Çalışmaları Temizle" removed, kept until the learner restores them. */
const CLEARED_KEY = 'tus_study_sessions_cleared_v1';

const SESSION_COLUMNS = 'id, subject, kind, pass, startMs, endMs, studyMs, breakMs, breakCount, note, source';
const SESSION_PLACEHOLDERS = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';

function sessionValues(record: StudySessionRecord): unknown[] {
    return [
        record.id, record.subject, record.kind, record.pass, record.startMs, record.endMs,
        record.studyMs, record.breakMs, record.breakCount, record.note, record.source,
    ];
}

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
        .getAllSync<StudySessionRow>(sql, ...params)
        .filter(isValidStudySessionRecord)
        .map(withStudySessionDefaults);
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
        kind: normalizeStudyKind(draft.kind),
        pass: clampPass(draft.pass),
        startMs,
        endMs: Math.max(Math.round(draft.endMs), startMs + studyMs + breakMs),
        studyMs,
        breakMs,
        breakCount: clampBreakCount(draft.breakCount),
        note: normalizeStudyNote(draft.note),
    };
}

export function insertStudySession(
    draft: StudySessionDraft,
    source: StudySessionSource,
    nowMs: number = Date.now(),
): StudySessionRecord {
    const record: StudySessionRecord = { id: nextSessionId(nowMs), source, ...sanitizeDraft(draft) };
    if (!isValidStudySessionRecord(record)) throw new Error('Invalid study session');
    getDB().runSync(`INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (${SESSION_PLACEHOLDERS})`, ...sessionValues(record));
    return record;
}

/** Rewrite an existing session in place; its id and source stay as they were. */
export function updateStudySession(id: number, draft: StudySessionDraft): void {
    const clean = sanitizeDraft(draft);
    const probe = { id, source: 'manual', ...clean };
    if (!isValidStudySessionRecord(probe)) throw new Error('Invalid study session');
    getDB().runSync(
        `UPDATE study_sessions SET subject = ?, kind = ?, pass = ?, startMs = ?, endMs = ?, studyMs = ?, breakMs = ?,
            breakCount = ?, note = ? WHERE id = ?`,
        clean.subject, clean.kind, clean.pass, clean.startMs, clean.endMs, clean.studyMs, clean.breakMs,
        clean.breakCount, clean.note, id,
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

/**
 * The pass of the latest "N. Tekrar" session of a subject, so a new session continues where it
 * stopped. Sessions of another type (question practice, a video lesson...) do not move it.
 */
export function latestStudyPass(subject: string): number | null {
    const row = getDB().getFirstSync<{ pass: number }>(
        `SELECT pass FROM study_sessions WHERE subject = ? AND kind = 'pass' ORDER BY startMs DESC, id DESC LIMIT 1`,
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

// --- Çalışmaları Temizle ---

/** When a study day starts: its date at the rollover hour, local time. */
function studyDayStartMs(ymd: string, rolloverHour: number, dayOffset = 0): number {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, month - 1, day + dayOffset, rolloverHour).getTime();
}

/**
 * Sessions that started on a study day from `fromYmd` through `throughYmd`, both included, newest
 * first. A day turns over at the rollover hour, as in the Study Calendar, so a session past
 * midnight belongs to the day it started on.
 */
export function studySessionsStartedBetween(fromYmd: string, throughYmd: string, rolloverHour: number): StudySessionRecord[] {
    if (throughYmd < fromYmd) return [];
    return readRecords(
        `SELECT ${SESSION_COLUMNS} FROM study_sessions WHERE startMs >= ? AND startMs < ? ORDER BY startMs DESC, id DESC`,
        studyDayStartMs(fromYmd, rolloverHour),
        studyDayStartMs(throughYmd, rolloverHour, 1),
    );
}

/**
 * The sessions cleared so far and not restored. Throws when the stored list cannot be read, so a
 * later clear never overwrites sessions it could not keep.
 */
export function loadClearedStudySessions(): StudySessionRecord[] {
    const raw = getDbSetting(CLEARED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Temizlenen çalışmalar okunamadı.');
    return parsed.filter(isValidStudySessionRecord).map(withStudySessionDefaults);
}

/**
 * Remove the sessions that started in the range, keeping them for "Geri Yükle". The kept copy is
 * written in the same transaction that deletes them, and earlier clears stay restorable too. The
 * running stopwatch is not a stored session and is never touched. Returns how many were removed.
 */
export function clearStudySessions(fromYmd: string, throughYmd: string, rolloverHour: number): number {
    const removed = studySessionsStartedBetween(fromYmd, throughYmd, rolloverHour);
    if (removed.length === 0) return 0;
    const kept = loadClearedStudySessions();
    const keptIds = new Set(kept.map((session) => session.id));
    const archive = [...kept, ...removed.filter((session) => !keptIds.has(session.id))];
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        // Written directly, not through setDbSetting, which swallows a failure: the sessions must
        // not be deleted unless their copy is stored.
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CLEARED_KEY, JSON.stringify(archive));
        for (const session of removed) db.runSync('DELETE FROM study_sessions WHERE id = ?', session.id);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return removed.length;
}

/**
 * Put every cleared session back and forget the kept copy. A session already in the table (an
 * interrupted restore) is not added twice; a different session that took its id since is kept,
 * and the cleared one comes back under a new id. Returns how many sessions were added.
 */
export function restoreClearedStudySessions(nowMs: number = Date.now()): number {
    const cleared = loadClearedStudySessions();
    const db = getDB();
    let restored = 0;
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const session of cleared) {
            const existing = db.getFirstSync<{ startMs: number; subject: string }>(
                'SELECT startMs, subject FROM study_sessions WHERE id = ?',
                session.id,
            );
            if (existing && existing.startMs === session.startMs && existing.subject === session.subject) continue;
            const record = existing ? { ...session, id: nextSessionId(nowMs) } : session;
            db.runSync(`INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (${SESSION_PLACEHOLDERS})`, ...sessionValues(record));
            restored += 1;
        }
        db.runSync('DELETE FROM settings WHERE key = ?', CLEARED_KEY);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return restored;
}

// --- Backup ---

export function readStudySessionsForBackup(): StudySessionRecord[] {
    return readRecords(`SELECT ${SESSION_COLUMNS} FROM study_sessions ORDER BY id`);
}

/**
 * Replace every stored session. Runs inside the restore's own transaction. Rows from a backup
 * made before the type, break count and note existed come back as "N. Tekrar", with no breaks
 * counted and no note.
 */
export function replaceStudySessions(rows: readonly StudySessionRow[]): void {
    const db = getDB();
    db.execSync('DELETE FROM study_sessions;');
    for (const row of rows) {
        db.runSync(`INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (${SESSION_PLACEHOLDERS})`, ...sessionValues(withStudySessionDefaults(row)));
    }
}
