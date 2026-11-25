import { DEFAULT_SETTINGS } from '../settingsStore';
import { normalizeStopwatchPrefs } from '../stopwatch';
import { startOfStudyDayMs } from '../reviewLogger';
import { hashValue } from './syncClock';
import { modToMs, type Codec, type Encoded, type Groups } from './syncCodecTypes';
import type { CodecContext } from './syncContext';

/*
 * The review log, Kronometre sessions and the synced settings (docs/HESAP_SENKRON.md §4.3, §6.2, §7.3).
 */

const num = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const INTERDAY_USAGE_PREFIX = 'interday_review_usage:';

// --- Review log ---------------------------------------------------------------------------------

/**
 * An answer never changes once written; only its deletion (undo) and its "spent a review slot"
 * marker do. The marker only matters on the day of the answer, so the nightly prune that removes
 * old markers is not a change: once set, `fl` stays set (§7.3).
 */
export const revlogCodec: Codec = {
    table: 'revlog',
    kinds: ['rev'],

    encode(ctx, lid, shadow) {
        const row = ctx.db.getFirstSync<Record<string, number>>(
            'SELECT id, cardId, ease, ivl, lastIvl, factor, time, type FROM revlog WHERE id = ?',
            Number(lid),
        );
        if (!row) return null;
        const groups: Groups = {
            r: [num(row.cardId), num(row.ease), num(row.ivl), num(row.lastIvl), num(row.factor), num(row.time), num(row.type)],
        };
        const marked = Boolean(ctx.db.getFirstSync('SELECT 1 AS x FROM settings WHERE key = ?', `${INTERDAY_USAGE_PREFIX}${lid}`));
        if (marked || shadow('rev', lid)?.f.fl?.[0] === hashValue(true)) groups.fl = true;
        // The identity is the whole answer: two devices answering in the same millisecond get two
        // answers, never one (§6.5).
        return { kind: 'rev', id: lid, lid, ident: `${num(row.cardId)}:${hashValue(groups.r)}`, groups, modMs: num(row.id) || null };
    },

    localKey(ctx, _kind, id) {
        return ctx.db.getFirstSync('SELECT 1 AS x FROM revlog WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, _kind, id, lid, _ident, groups) {
        const r = groups.r;
        if (!Array.isArray(r) || r.length < 7) {
            if (lid === null) return { park: 'incomplete' };
        } else {
            ctx.db.runSync(
                `INSERT OR REPLACE INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
                 VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)`,
                Number(id), num(r[0]), num(r[1]), num(r[2]), num(r[3]), num(r[4]), num(r[5]), num(r[6]),
            );
        }
        const key = `${INTERDAY_USAGE_PREFIX}${id}`;
        // Only today's markers change what the queue allows; older ones are pruned anyway.
        if (groups.fl === true && Number(id) >= startOfStudyDayMs(ctx.now(), ctx.rolloverHour())) {
            ctx.db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, '1');
        }
        return { lid: id };
    },

    remove(ctx, _kind, lid) {
        ctx.db.runSync('DELETE FROM revlog WHERE id = ?', Number(lid));
        ctx.db.runSync('DELETE FROM settings WHERE key = ?', `${INTERDAY_USAGE_PREFIX}${lid}`);
    },
};

// --- Kronometre sessions ------------------------------------------------------------------------

const SESSION_FIELDS = ['subject', 'kind', 'pass', 'startMs', 'endMs', 'studyMs', 'breakMs', 'breakCount', 'note', 'source'] as const;

export const sessionCodec: Codec = {
    table: 'study_sessions',
    kinds: ['sess'],

    encode(ctx, lid) {
        const row = ctx.db.getFirstSync<Record<string, unknown>>(
            `SELECT ${SESSION_FIELDS.join(', ')} FROM study_sessions WHERE id = ?`,
            Number(lid),
        );
        if (!row) return null;
        const r: Record<string, unknown> = {};
        for (const field of SESSION_FIELDS) r[field] = row[field];
        // A session saved from the running stopwatch is identified by its start, so a stopwatch
        // stopped on two devices at once becomes one session, not two (§6.4).
        return { kind: 'sess', id: lid, lid, ident: `s:${num(row.startMs)}`, groups: { r }, modMs: num(row.endMs) || null };
    },

    localKey(ctx, _kind, id) {
        return ctx.db.getFirstSync('SELECT 1 AS x FROM study_sessions WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, _kind, id, _lid, _ident, groups) {
        const r = groups.r as Record<string, unknown> | undefined;
        if (!r || typeof r !== 'object') return { park: 'incomplete' };
        ctx.db.runSync(
            `INSERT OR REPLACE INTO study_sessions (id, ${SESSION_FIELDS.join(', ')}) VALUES (?, ${SESSION_FIELDS.map(() => '?').join(', ')})`,
            Number(id),
            String(r.subject ?? ''), String(r.kind ?? 'pass'), num(r.pass, 1), num(r.startMs), num(r.endMs), num(r.studyMs),
            num(r.breakMs), num(r.breakCount), String(r.note ?? ''), String(r.source ?? 'timer'),
        );
        return { lid: id };
    },

    remove(ctx, _kind, lid) {
        ctx.db.runSync('DELETE FROM study_sessions WHERE id = ?', Number(lid));
    },
};

// --- Settings -----------------------------------------------------------------------------------

/**
 * The app settings that change how the learner studies, and so follow them from device to device
 * (§4.3). Everything else in the settings blob — theme, text size, gestures, toolbars, zoom,
 * notifications, backups — stays on the device. `lib/sync/syncSettingsScope.test.ts` fails when a
 * setting is added without being classified.
 */
export const COLLECTION_SETTINGS = [
    'language', 'dayRolloverHour', 'learnAheadMinutes', 'queueOrder', 'newCardsIgnoreReviewLimit',
    'limitsStartFromTop', 'algorithm', 'fsrsEnabled', 'fsrsShortTermWithSteps', 'newCardDeckMode', 'timeboxMinutes',
    'autoAdvance', 'showNextReviewTimes', 'showRemainingCount', 'hideHardAndEasy', 'neverTypeAnswer', 'typeAnswerInCard',
    'interruptAudioOnAnswer', 'audioPlaybackRate',
] as const;

/** Settings that stay on each device: display, gestures, keyboard, notifications, backups (§4.3). */
export const DEVICE_SETTINGS = [
    'themeMode', 'accentColor', 'textSizeLevel', 'keyBindings', 'editorFontSize', 'editorCapitalizeSentences', 'editorToolbarVisible',
    'editorToolbarScrollable', 'pasteClipboardImagesAsPng', 'newStudyScreenEnabled', 'studyFrameStyle', 'showAudioPlayButtons',
    'showAnswerFeedback', 'showAnswerButtons', 'showStudyTopBar', 'reviewerToolbarPosition', 'showToolsOverlayButton',
    'toolsOverlayPosition', 'focusTypeAnswer', 'showDeckTitle', 'centerCardContent', 'showRemainingTime', 'keepScreenOn',
    'ninePointTouchEnabled', 'questionTapActions', 'answerTapActions', 'gesturesEnabled', 'swipeSensitivity',
    'swipeLeftAction', 'swipeRightAction', 'swipeUpAction', 'swipeDownAction', 'fullScreenNavigationDrawer',
    'doubleBackToExit', 'cardZoomPercent', 'imageZoomPercent', 'answerButtonScalePercent', 'twoRowAnswerButtons',
    'browserFontScalePercent', 'showBrowserAudioFilenames', 'showAnswerLongPressMs', 'answerDoubleTapMs',
    'autoBackupEnabled', 'backupIntervalMinutes', 'backupDailyCopies', 'backupWeeklyCopies', 'backupMonthlyCopies',
    'studyNotificationsEnabled', 'studyNotificationThreshold', 'studyNotificationHour', 'studyNotificationMinute',
] as const;

/** Settings the default preset holds; they sync with the preset (deck options), not here. */
export const PRESET_BACKED_SETTINGS = [
    'dailyNewLimit', 'dailyReviewLimit', 'learningSteps', 'lapseSteps', 'graduatingInterval', 'easyInterval', 'startingEase',
    'lapseIntervalMultiplier', 'minLapseInterval', 'newCardOrder', 'newCardGatherOrder', 'reviewSortOrder', 'newCardSortOrder',
    'interdayLearningMix', 'autoPlayAudio', 'skipQuestionWhenReplayingAnswer', 'showAnswerTimer', 'maxAnswerSeconds',
    'stopTimerOnAnswer', 'secondsToShowQuestion', 'secondsToShowAnswer', 'questionAction', 'waitForAudio', 'answerAction',
    'easyDays', 'hardIntervalMultiplier', 'easyBonus', 'intervalModifier', 'maxInterval', 'fsrsParameters',
    'desiredRetention', 'historicalRetention',
] as const;

const APP_SETTINGS_KEY = 'tus_app_settings_meta_v1';
const STOPWATCH_PREFS_KEY = 'tus_stopwatch_prefs_v1';
const PLANS_KEY = 'tus_study_plans_v1';
const SUBJECTS_KEY = 'user_subjects_v1';
/** Kept whole: a later write replaces an earlier one. */
const WHOLE_VALUE_KEYS = new Set(['anki_collection_v1', 'tus_stopwatch_running_v1', 'tus_study_sessions_cleared_v1']);

export const SETTING_OBJECT_KEYS = new Set([APP_SETTINGS_KEY, STOPWATCH_PREFS_KEY, PLANS_KEY, SUBJECTS_KEY, ...WHOLE_VALUE_KEYS]);

function parseValue(raw: string | null | undefined): unknown {
    if (typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function defaultsFor(key: string): Record<string, unknown> {
    if (key === APP_SETTINGS_KEY) return DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    if (key === STOPWATCH_PREFS_KEY) return normalizeStopwatchPrefs(null) as unknown as Record<string, unknown>;
    return {};
}

/** Groups for list-valued settings: one per entry, by the entry's id. */
function listGroups(ctx: CodecContext, key: string, value: unknown): Groups {
    const groups: Groups = {};
    if (!Array.isArray(value)) return groups;
    for (const entry of value) {
        const record = asRecord(entry);
        if (typeof record.id !== 'string' || !record.id) continue;
        if (key === SUBJECTS_KEY && typeof record.deckId === 'number') {
            groups[`e:${record.id}`] = { ...record, deckId: ctx.ref('decks', record.deckId) };
        } else {
            groups[`e:${record.id}`] = record;
        }
    }
    return groups;
}

export const settingCodec: Codec = {
    table: 'settings',
    kinds: ['set'],

    encode(ctx, lid) {
        if (!SETTING_OBJECT_KEYS.has(lid)) return null;
        const raw = ctx.db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', lid)?.value ?? null;
        let groups: Groups = {};
        const defaults = new Set<string>();
        if (WHOLE_VALUE_KEYS.has(lid)) {
            groups.v = raw;
            if (raw === null) defaults.add('v');
        } else if (lid === APP_SETTINGS_KEY || lid === STOPWATCH_PREFS_KEY) {
            const stored = asRecord(parseValue(raw));
            const fields = lid === APP_SETTINGS_KEY ? COLLECTION_SETTINGS : Object.keys(stored);
            const fallback = defaultsFor(lid);
            for (const field of fields) {
                if (stored[field] === undefined) continue;
                groups[`s:${field}`] = stored[field];
                if (fallback[field] !== undefined && hashValue(fallback[field]) === hashValue(stored[field])) defaults.add(`s:${field}`);
            }
        } else {
            groups = listGroups(ctx, lid, parseValue(raw));
        }
        const encoded: Encoded = { kind: 'set', id: lid, lid, ident: null, groups, modMs: null, defaults };
        return encoded;
    },

    localKey(_ctx, _kind, id) {
        return SETTING_OBJECT_KEYS.has(id) ? id : null;
    },

    write(ctx, _kind, id, _lid, _ident, groups) {
        if (!SETTING_OBJECT_KEYS.has(id)) return { lid: id };
        const raw = ctx.db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', id)?.value ?? null;
        let next: string | null;
        if (WHOLE_VALUE_KEYS.has(id)) {
            next = typeof groups.v === 'string' ? groups.v : null;
        } else if (id === APP_SETTINGS_KEY || id === STOPWATCH_PREFS_KEY) {
            const stored = { ...asRecord(parseValue(raw)) };
            for (const [name, value] of Object.entries(groups)) {
                if (!name.startsWith('s:')) continue;
                const field = name.slice(2);
                if (id === APP_SETTINGS_KEY && !(COLLECTION_SETTINGS as readonly string[]).includes(field)) continue;
                if (value === null || value === undefined) delete stored[field];
                else stored[field] = value;
            }
            next = JSON.stringify(stored);
        } else {
            const previous = parseValue(raw);
            const order = Array.isArray(previous) ? previous.map((entry) => asRecord(entry).id).filter((entryId): entryId is string => typeof entryId === 'string') : [];
            const wanted = new Map<string, Record<string, unknown>>();
            for (const [name, value] of Object.entries(groups)) {
                if (!name.startsWith('e:') || value === null || value === undefined) continue;
                const entry = { ...asRecord(value) };
                if (id === SUBJECTS_KEY && entry.deckId !== undefined) {
                    const deckId = ctx.local('decks', entry.deckId);
                    entry.deckId = deckId ?? (typeof entry.deckId === 'number' ? entry.deckId : 1);
                }
                wanted.set(name.slice(2), entry);
            }
            const list: Record<string, unknown>[] = [];
            for (const entryId of order) {
                const entry = wanted.get(entryId);
                if (entry) {
                    list.push(entry);
                    wanted.delete(entryId);
                }
            }
            list.push(...[...wanted.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry));
            next = JSON.stringify(list);
        }
        if (next === null) ctx.db.runSync('DELETE FROM settings WHERE key = ?', id);
        else ctx.db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', id, next);
        return { lid: id };
    },

    remove(ctx, _kind, lid) {
        if (WHOLE_VALUE_KEYS.has(lid)) ctx.db.runSync('DELETE FROM settings WHERE key = ?', lid);
    },
};

export { modToMs };
