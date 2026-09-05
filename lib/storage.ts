// ============================================================
// TUS Flashcard - Storage Layer
// Canonical source: SQLite (Anki tables + deck config + app/session metadata)
// AsyncStorage is used only for legacy import/migration sources.
// ============================================================

import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
} from './fsrs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, AppSettings, AlgorithmType, ThemeMode, KeyBindings } from './types';
import type { Card } from './types';
import { todayLocalYMD } from './scheduler';
import { dbGetSchemaVersion, dbIndexAllCards, getDB, initDB } from './db';
import {
    CATALOG_PROGRESS_KEY,
    encodeCatalogProgress,
    hasStudyProgress,
    isCatalogPackRow,
    parseCatalogProgress,
    type CatalogProgress,
} from './catalogRows';
import { getDeckConfig, saveDeckConfig } from './deckManager';
import { resolveSettingsFromConfig } from './settingsResolver';
import { normalizeNewCardGatherOrder } from './queueBuild';
import {
    migrateLegacyCardStatesToAnki,
    migrateLegacyCustomCardsToAnki,
} from './legacyMigration';
import { initAnkiData, migrateLegacySubjectTopicsToDecks } from './ankiInit';
import { getSearchIndexCards } from './noteManager';
import { canonicalBackupContainsCatalog } from './catalogProtection';
import { validateCanonicalBackupData } from './backupValidation';
import { normalizeReviewerToolbarPosition } from './reviewerPresentation';
import { normalizeStudyNotificationThreshold } from './studyNotificationPolicy';
import {
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    normalizeReviewGestureAction,
    normalizeReviewTapActions,
    normalizeSwipeSensitivity,
} from './reviewerTouchControls';

const KEYS = {
    CARD_STATES: 'tus_card_states_v2',
    CUSTOM_CARDS: 'tus_custom_cards_v2',
    SESSION_STATS: 'tus_stats_v2', // legacy AsyncStorage key (migration source only)
    SETTINGS: 'tus_settings_v2', // legacy AsyncStorage key (migration source only)
};

const DB_SETTINGS_KEYS = {
    APP_SETTINGS_META: 'tus_app_settings_meta_v1',
    LEGACY_SETTINGS_MIGRATED: 'tus_legacy_settings_migrated_v1',
    LEGACY_SESSION_STATS_MIGRATED: 'tus_legacy_session_stats_migrated_v1',
};

let legacySessionStatsMigrationPromise: Promise<void> | null = null;

// Legacy per-card state keys used by old builds.
const CARD_STATE_PREFIX = 'tus_cs:';

// showAnswer is stored as the literal `KeyboardEvent.key` value the space bar produces (' '),
// not the string "Space" — that keeps binding comparisons a single, uniform `event.key === x`
// check. The settings UI is responsible for rendering ' ' as the human label "Space".
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
    showAnswer: ' ',
    again: '1',
    hard: '2',
    good: '3',
    easy: '4',
    replayAudio: 'r',
    buryCard: '-',
    suspendCard: '@',
    markNote: '*',
};

export const DEFAULT_SETTINGS: AppSettings = {
    language: 'tr',
    themeMode: 'light',
    keyBindings: DEFAULT_KEY_BINDINGS,
    autoAdvance: false,
    interruptAudioOnAnswer: true,
    audioPlaybackRate: 1.0,
    showRemainingCount: true,
    showNextReviewTimes: true,
    newCardDeckMode: 'current',
    editorFontSize: 16,
    editorCapitalizeSentences: true,
    editorToolbarVisible: true,
    editorToolbarScrollable: true,
    pasteClipboardImagesAsPng: false,
    newStudyScreenEnabled: false,
    studyFrameStyle: 'card',
    showAudioPlayButtons: true,
    showAnswerFeedback: true,
    showAnswerButtons: true,
    hideHardAndEasy: false,
    showStudyTopBar: true,
    reviewerToolbarPosition: 'top',
    showToolsOverlayButton: false,
    toolsOverlayPosition: 'right',
    neverTypeAnswer: false,
    typeAnswerInCard: false,
    focusTypeAnswer: true,
    showDeckTitle: true,
    centerCardContent: false,
    showRemainingTime: false,
    timeboxMinutes: 0,
    keepScreenOn: false,
    ninePointTouchEnabled: true,
    questionTapActions: DEFAULT_QUESTION_TAP_ACTIONS,
    answerTapActions: DEFAULT_ANSWER_TAP_ACTIONS,
    gesturesEnabled: false,
    swipeSensitivity: 100,
    swipeLeftAction: 'tools',
    swipeRightAction: 'decks',
    swipeUpAction: 'off',
    swipeDownAction: 'off',
    fullScreenNavigationDrawer: false,
    doubleBackToExit: false,
    cardZoomPercent: 100,
    imageZoomPercent: 100,
    answerButtonScalePercent: 100,
    twoRowAnswerButtons: false,
    browserFontScalePercent: 100,
    showBrowserAudioFilenames: false,
    showAnswerLongPressMs: 0,
    answerDoubleTapMs: 200,
    autoBackupEnabled: true,
    backupIntervalMinutes: 10080,
    backupDailyCopies: 0,
    backupWeeklyCopies: 7,
    backupMonthlyCopies: 0,
    studyNotificationsEnabled: true,
    studyNotificationThreshold: 0,
    studyNotificationHour: 9,
    studyNotificationMinute: 0,
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0,
    minLapseInterval: 1,
    queueOrder: 'mix',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'deck',
    reviewSortOrder: 'dueRandom',
    newCardSortOrder: 'template',
    interdayLearningMix: 'mix',
    autoPlayAudio: true,
    skipQuestionWhenReplayingAnswer: false,
    showAnswerTimer: false,
    maxAnswerSeconds: 60,
    stopTimerOnAnswer: false,
    secondsToShowQuestion: 0,
    secondsToShowAnswer: 0,
    questionAction: 'showAnswer',
    waitForAudio: true,
    answerAction: 'bury',
    // The queue has always counted new cards and reviews against separate allowances; keeping
    // that as the default means enabling the option is an opt-in change, never a silent one.
    newCardsIgnoreReviewLimit: true,
    limitsStartFromTop: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    // Anki's learn-ahead limit: when nothing else is left, a learning card whose step timer runs
    // out within this window is shown early rather than making the learner wait it out.
    learnAheadMinutes: 20,
    algorithm: 'ANKI_V3' as AlgorithmType,
    // FSRS is off until the learner turns it on, exactly as in Anki. The preset supplies the
    // parameters and retention targets once it is enabled.
    fsrsEnabled: false,
    fsrsRescheduleOnChange: false,
    fsrsShortTermWithSteps: false,
    fsrsParameters: [...DEFAULT_FSRS_PARAMETERS],
    desiredRetention: FSRS_DEFAULT_DESIRED_RETENTION,
    historicalRetention: FSRS_DEFAULT_HISTORICAL_RETENTION,
};

/** Read a raw key from the SQLite settings table (guard keys, metadata blobs). */
export function getDbSetting(key: string): string | null {
    try {
        const db = getDB();
        const row = db.getFirstSync('SELECT value FROM settings WHERE key = ?', key) as { value?: string } | null;
        return typeof row?.value === 'string' ? row.value : null;
    } catch (e) {
        console.warn('[Storage] getDbSetting failed:', e);
        return null;
    }
}

/** Write a raw key to the SQLite settings table. Failures are logged, not thrown. */
export function setDbSetting(key: string, value: string): void {
    try {
        const db = getDB();
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    } catch (e) {
        console.warn('[Storage] setDbSetting failed:', e);
        // DB may not be initialized yet.
    }
}

// --- Legacy Card States (AsyncStorage migration source only) ---
export async function loadCardStates(): Promise<Record<string, CardState>> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const perCardKeys = allKeys.filter((k: string) => k.startsWith(CARD_STATE_PREFIX));

        const blobData = await AsyncStorage.getItem(KEYS.CARD_STATES);
        const states: Record<string, CardState> = blobData ? JSON.parse(blobData) : {};

        if (perCardKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(perCardKeys);
            for (const [key, value] of pairs) {
                if (!value) continue;
                const id = key.replace(CARD_STATE_PREFIX, '');
                states[id] = JSON.parse(value);
            }
        }

        return states;
    } catch (e) {
        console.warn('[Storage] loadCardStates failed:', e);
        return {};
    }
}

export async function clearLegacyCardStates(): Promise<void> {
    const allKeys = await AsyncStorage.getAllKeys();
    const perCardKeys = allKeys.filter((k: string) => k.startsWith(CARD_STATE_PREFIX));
    const keys = [KEYS.CARD_STATES, ...perCardKeys];
    if (keys.length > 0) {
        await AsyncStorage.multiRemove(keys);
    }
}

// --- Legacy Settings (AsyncStorage -> SQLite one-shot migration) ---
export async function migrateLegacySettingsIfNeeded(): Promise<{ migrated: boolean }> {
    if (getDbSetting(DB_SETTINGS_KEYS.LEGACY_SETTINGS_MIGRATED) === 'true') {
        return { migrated: false };
    }

    let migrated = false;

    try {
        const legacyRaw = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (legacyRaw) {
            const parsed = validateSettings(JSON.parse(legacyRaw) as Record<string, unknown>);
            saveSettings(parsed);
            migrated = true;
        }
    } catch (error) {
        console.warn('[Storage] Legacy settings migration failed:', error);
    }

    await AsyncStorage.removeItem(KEYS.SETTINGS);
    setDbSetting(DB_SETTINGS_KEYS.LEGACY_SETTINGS_MIGRATED, 'true');

    return { migrated };
}

// --- Legacy Custom Cards (AsyncStorage migration source only) ---
export async function loadCustomCards(): Promise<Card[]> {
    try {
        const data = await AsyncStorage.getItem(KEYS.CUSTOM_CARDS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.warn('[Storage] loadCustomCards failed:', e);
        return [];
    }
}

export async function saveCustomCards(cards: Card[]): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.CUSTOM_CARDS, JSON.stringify(cards));
    } catch (e) {
        console.error('Custom cards kayıt hatası:', e);
    }
}

function defaultSessionStats(date: string): SessionStats {
    return {
        reviewed: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now(),
        newCardsToday: 0,
        date,
    };
}

function loadSessionStatsFromDb(date: string): SessionStats | null {
    try {
        const db = getDB();
        const row = db.getFirstSync<{ data: string }>(
            'SELECT data FROM session_stats WHERE date = ?',
            date,
        );
        if (!row?.data) return null;

        const parsed = JSON.parse(row.data) as SessionStats;
        return {
            ...defaultSessionStats(date),
            ...parsed,
            date,
        };
    } catch (e) {
        console.warn('[Storage] loadSessionStatsFromDb failed:', e);
        return null;
    }
}

function saveSessionStatsToDb(date: string, stats: SessionStats): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO session_stats (date, data) VALUES (?, ?)',
        date,
        JSON.stringify({
            ...defaultSessionStats(date),
            ...stats,
            date,
        }),
    );
}

async function migrateLegacySessionStatsIfNeeded(today: string): Promise<void> {
    if (getDbSetting(DB_SETTINGS_KEYS.LEGACY_SESSION_STATS_MIGRATED) === 'true') {
        return;
    }

    if (!legacySessionStatsMigrationPromise) {
        legacySessionStatsMigrationPromise = (async () => {
            if (getDbSetting(DB_SETTINGS_KEYS.LEGACY_SESSION_STATS_MIGRATED) === 'true') {
                return;
            }

            try {
                const raw = await AsyncStorage.getItem(KEYS.SESSION_STATS);
                if (raw) {
                    const parsed = JSON.parse(raw) as SessionStats;
                    const date = typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date : today;
                    saveSessionStatsToDb(date, parsed);
                }
            } catch (error) {
                console.warn('[Storage] Legacy session stats migration failed:', error);
            }

            await AsyncStorage.removeItem(KEYS.SESSION_STATS);
            setDbSetting(DB_SETTINGS_KEYS.LEGACY_SESSION_STATS_MIGRATED, 'true');
        })().finally(() => {
            legacySessionStatsMigrationPromise = null;
        });
    }

    await legacySessionStatsMigrationPromise;
}

// --- Session Stats (SQLite canonical) ---
export async function loadSessionStats(): Promise<SessionStats> {
    const settings = loadSettings();
    const today = todayLocalYMD(undefined, settings.dayRolloverHour);

    const existing = loadSessionStatsFromDb(today);
    if (existing) return existing;

    await migrateLegacySessionStatsIfNeeded(today);
    return loadSessionStatsFromDb(today) ?? defaultSessionStats(today);
}

export async function saveSessionStats(stats: SessionStats): Promise<void> {
    try {
        const settings = loadSettings();
        const date = todayLocalYMD(undefined, settings.dayRolloverHour);
        saveSessionStatsToDb(date, stats);
    } catch (e) {
        console.error('Stats kayıt hatası:', e);
    }
}

function syncDefaultDeckConfig(settings: AppSettings): void {
    const config = getDeckConfig(1);
    config.newPerDay = settings.dailyNewLimit;
    config.maxReviewsPerDay = settings.dailyReviewLimit;
    config.learningSteps = [...settings.learningSteps];
    config.relearningSteps = [...settings.lapseSteps];
    config.graduatingIvl = settings.graduatingInterval;
    config.easyIvl = settings.easyInterval;
    config.startingEase = Math.round(settings.startingEase * 1000);
    config.newIvlPercent = settings.lapseIntervalMultiplier;
    config.minIvl = settings.minLapseInterval;
    config.insertionOrder = settings.newCardOrder;
    config.hardIvl = settings.hardIntervalMultiplier;
    config.easyBonus = settings.easyBonus;
    config.ivlModifier = settings.intervalModifier;
    config.maxIvl = settings.maxInterval;
    config.mod = Math.floor(Date.now() / 1000);
    config.usn = -1;
    saveDeckConfig(config);
}

function hydrateSettingsFromDeckConfig(base: AppSettings): AppSettings {
    try {
        const config = getDeckConfig(1);
        return resolveSettingsFromConfig(config, base);
    } catch (e) {
        console.warn('[Storage] hydrateSettingsFromDeckConfig failed:', e);
        return base;
    }
}

/**
 * Coerce any stored value to a valid queue order, migrating the pre-1.0 labels:
 * 'learning-new-review' -> 'before', 'learning-review-new' -> 'after'. Unknown -> 'mix'.
 */
function normalizeQueueOrder(value: unknown): AppSettings['queueOrder'] {
    switch (value) {
        case 'mix':
        case 'before':
        case 'after':
            return value;
        case 'learning-new-review':
            return 'before';
        case 'learning-review-new':
            return 'after';
        default:
            return 'mix';
    }
}

function normalizeThemeMode(value: unknown): ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'light';
}

function normalizeLanguage(value: unknown): AppSettings['language'] {
    return value === 'tr' || value === 'en' || value === 'system' ? value : 'tr';
}

/** A key binding is a single printable char, or a named key like "Space"/"Enter". */
function normalizeKeyBindings(value: unknown): KeyBindings {
    const raw = (value && typeof value === 'object' ? value : {}) as Partial<KeyBindings>;
    const clean = (candidate: unknown, fallback: string): string => {
        // Not trimmed: a lone space (' ') is the valid, literal binding for the space bar.
        if (typeof candidate !== 'string') return fallback;
        return candidate.length > 0 && candidate.length <= 16 ? candidate : fallback;
    };

    const bindings: KeyBindings = {
        showAnswer: clean(raw.showAnswer, DEFAULT_KEY_BINDINGS.showAnswer),
        again: clean(raw.again, DEFAULT_KEY_BINDINGS.again),
        hard: clean(raw.hard, DEFAULT_KEY_BINDINGS.hard),
        good: clean(raw.good, DEFAULT_KEY_BINDINGS.good),
        easy: clean(raw.easy, DEFAULT_KEY_BINDINGS.easy),
        replayAudio: clean(raw.replayAudio, DEFAULT_KEY_BINDINGS.replayAudio),
        buryCard: clean(raw.buryCard, DEFAULT_KEY_BINDINGS.buryCard),
        suspendCard: clean(raw.suspendCard, DEFAULT_KEY_BINDINGS.suspendCard),
        markNote: clean(raw.markNote, DEFAULT_KEY_BINDINGS.markNote),
    };

    // Reject configs with duplicate keys (ambiguous bindings) — fall back to defaults entirely.
    const values = Object.values(bindings).map((v) => v.toLowerCase());
    if (new Set(values).size !== values.length) {
        return { ...DEFAULT_KEY_BINDINGS };
    }

    return bindings;
}

function loadAppSettingsMeta(): Partial<AppSettings> {
    try {
        const raw = getDbSetting(DB_SETTINGS_KEYS.APP_SETTINGS_META);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Partial<AppSettings>;

        return {
            language: normalizeLanguage(parsed.language),
            themeMode: normalizeThemeMode(parsed.themeMode),
            keyBindings: normalizeKeyBindings(parsed.keyBindings),
            autoAdvance: Boolean(parsed.autoAdvance),
            // Default-on prefs (Anki parity): only an explicit false turns them off, so
            // settings blobs written before these fields existed keep the default.
            interruptAudioOnAnswer: parsed.interruptAudioOnAnswer !== false,
            showRemainingCount: parsed.showRemainingCount !== false,
            showNextReviewTimes: parsed.showNextReviewTimes !== false,
            newCardDeckMode: parsed.newCardDeckMode === 'default' ? 'default' : 'current',
            pasteClipboardImagesAsPng: Boolean(parsed.pasteClipboardImagesAsPng),
            newStudyScreenEnabled: Boolean(parsed.newStudyScreenEnabled),
            studyFrameStyle: parsed.studyFrameStyle === 'plain' ? 'plain' : 'card',
            showAudioPlayButtons: parsed.showAudioPlayButtons !== false,
            showAnswerFeedback: parsed.showAnswerFeedback !== false,
            showAnswerButtons: parsed.showAnswerButtons !== false,
            hideHardAndEasy: Boolean(parsed.hideHardAndEasy),
            showStudyTopBar: parsed.showStudyTopBar !== false,
            reviewerToolbarPosition: normalizeReviewerToolbarPosition(parsed.reviewerToolbarPosition),
            showToolsOverlayButton: Boolean(parsed.showToolsOverlayButton),
            toolsOverlayPosition: parsed.toolsOverlayPosition === 'left' ? 'left' : 'right',
            neverTypeAnswer: Boolean(parsed.neverTypeAnswer),
            typeAnswerInCard: Boolean(parsed.typeAnswerInCard),
            focusTypeAnswer: parsed.focusTypeAnswer !== false,
            showDeckTitle: parsed.showDeckTitle !== false,
            centerCardContent: Boolean(parsed.centerCardContent),
            showRemainingTime: Boolean(parsed.showRemainingTime),
            timeboxMinutes: Math.max(0, Math.min(9999, Math.round(Number(parsed.timeboxMinutes ?? 0) || 0))),
            keepScreenOn: Boolean(parsed.keepScreenOn),
            ninePointTouchEnabled: parsed.ninePointTouchEnabled !== false,
            questionTapActions: normalizeReviewTapActions(parsed.questionTapActions, DEFAULT_QUESTION_TAP_ACTIONS),
            answerTapActions: normalizeReviewTapActions(parsed.answerTapActions, DEFAULT_ANSWER_TAP_ACTIONS),
            gesturesEnabled: Boolean(parsed.gesturesEnabled),
            swipeSensitivity: normalizeSwipeSensitivity(parsed.swipeSensitivity),
            swipeLeftAction: normalizeReviewSwipeAction(parsed.swipeLeftAction, 'tools'),
            swipeRightAction: normalizeReviewSwipeAction(parsed.swipeRightAction, 'decks'),
            swipeUpAction: normalizeReviewSwipeAction(parsed.swipeUpAction, 'off'),
            swipeDownAction: normalizeReviewSwipeAction(parsed.swipeDownAction, 'off'),
            fullScreenNavigationDrawer: Boolean(parsed.fullScreenNavigationDrawer),
            doubleBackToExit: Boolean(parsed.doubleBackToExit),
            cardZoomPercent: Math.max(50, Math.min(200, Number(parsed.cardZoomPercent ?? 100) || 100)),
            imageZoomPercent: Math.max(50, Math.min(200, Number(parsed.imageZoomPercent ?? 100) || 100)),
            answerButtonScalePercent: Math.max(100, Math.min(175, Number(parsed.answerButtonScalePercent ?? 100) || 100)),
            twoRowAnswerButtons: Boolean(parsed.twoRowAnswerButtons),
            browserFontScalePercent: Math.max(75, Math.min(175, Number(parsed.browserFontScalePercent ?? 100) || 100)),
            showBrowserAudioFilenames: Boolean(parsed.showBrowserAudioFilenames),
            showAnswerLongPressMs: Math.max(0, Math.min(2000, Number(parsed.showAnswerLongPressMs ?? 0) || 0)),
            answerDoubleTapMs: Math.max(0, Math.min(2000, Number(parsed.answerDoubleTapMs ?? 200) || 0)),
            autoBackupEnabled: parsed.autoBackupEnabled !== false,
            backupIntervalMinutes: 10080,
            backupDailyCopies: 0,
            backupWeeklyCopies: 7,
            backupMonthlyCopies: 0,
            studyNotificationsEnabled: parsed.studyNotificationsEnabled !== false,
            studyNotificationThreshold: normalizeStudyNotificationThreshold(parsed.studyNotificationThreshold),
            studyNotificationHour: Math.max(0, Math.min(23, Number(parsed.studyNotificationHour ?? 9) || 0)),
            studyNotificationMinute: Math.max(0, Math.min(59, Number(parsed.studyNotificationMinute ?? 0) || 0)),
            queueOrder: normalizeQueueOrder(parsed.queueOrder),
            newCardsIgnoreReviewLimit: parsed.newCardsIgnoreReviewLimit !== false,
            limitsStartFromTop: parsed.limitsStartFromTop !== false,
            dayRolloverHour: Math.max(0, Math.min(23, Number(parsed.dayRolloverHour ?? DEFAULT_SETTINGS.dayRolloverHour))),
            learnAheadMinutes: Math.max(0, Number(parsed.learnAheadMinutes ?? DEFAULT_SETTINGS.learnAheadMinutes) || 0),
            algorithm: 'ANKI_V3',
            // Collection-wide FSRS switches. Parameters and retention live on the preset and are
            // resolved per deck, so they are deliberately not stored here.
            fsrsEnabled: parsed.fsrsEnabled === true,
            fsrsRescheduleOnChange: parsed.fsrsRescheduleOnChange === true,
            fsrsShortTermWithSteps: parsed.fsrsShortTermWithSteps === true,
        };
    } catch (e) {
        console.warn('[Storage] loadAppSettingsMeta failed:', e);
        return {};
    }
}

function persistAppSettingsMeta(settings: AppSettings): void {
    const meta = {
        language: settings.language,
        themeMode: settings.themeMode,
        keyBindings: settings.keyBindings,
        autoAdvance: settings.autoAdvance,
        interruptAudioOnAnswer: settings.interruptAudioOnAnswer,
        showRemainingCount: settings.showRemainingCount,
        showNextReviewTimes: settings.showNextReviewTimes,
        newCardDeckMode: settings.newCardDeckMode,
        pasteClipboardImagesAsPng: settings.pasteClipboardImagesAsPng,
        newStudyScreenEnabled: settings.newStudyScreenEnabled,
        studyFrameStyle: settings.studyFrameStyle,
        showAudioPlayButtons: settings.showAudioPlayButtons,
        showAnswerFeedback: settings.showAnswerFeedback,
        showAnswerButtons: settings.showAnswerButtons,
        hideHardAndEasy: settings.hideHardAndEasy,
        showStudyTopBar: settings.showStudyTopBar,
        reviewerToolbarPosition: settings.reviewerToolbarPosition,
        showToolsOverlayButton: settings.showToolsOverlayButton,
        toolsOverlayPosition: settings.toolsOverlayPosition,
        neverTypeAnswer: settings.neverTypeAnswer,
        typeAnswerInCard: settings.typeAnswerInCard,
        focusTypeAnswer: settings.focusTypeAnswer,
        showDeckTitle: settings.showDeckTitle,
        centerCardContent: settings.centerCardContent,
        showRemainingTime: settings.showRemainingTime,
        timeboxMinutes: settings.timeboxMinutes,
        keepScreenOn: settings.keepScreenOn,
        ninePointTouchEnabled: settings.ninePointTouchEnabled,
        questionTapActions: settings.questionTapActions,
        answerTapActions: settings.answerTapActions,
        gesturesEnabled: settings.gesturesEnabled,
        swipeSensitivity: settings.swipeSensitivity,
        swipeLeftAction: settings.swipeLeftAction,
        swipeRightAction: settings.swipeRightAction,
        swipeUpAction: settings.swipeUpAction,
        swipeDownAction: settings.swipeDownAction,
        fullScreenNavigationDrawer: settings.fullScreenNavigationDrawer,
        doubleBackToExit: settings.doubleBackToExit,
        cardZoomPercent: settings.cardZoomPercent,
        imageZoomPercent: settings.imageZoomPercent,
        answerButtonScalePercent: settings.answerButtonScalePercent,
        twoRowAnswerButtons: settings.twoRowAnswerButtons,
        browserFontScalePercent: settings.browserFontScalePercent,
        showBrowserAudioFilenames: settings.showBrowserAudioFilenames,
        showAnswerLongPressMs: settings.showAnswerLongPressMs,
        answerDoubleTapMs: settings.answerDoubleTapMs,
        autoBackupEnabled: settings.autoBackupEnabled,
        backupIntervalMinutes: settings.backupIntervalMinutes,
        backupDailyCopies: settings.backupDailyCopies,
        backupWeeklyCopies: settings.backupWeeklyCopies,
        backupMonthlyCopies: settings.backupMonthlyCopies,
        studyNotificationsEnabled: settings.studyNotificationsEnabled,
        studyNotificationThreshold: settings.studyNotificationThreshold,
        studyNotificationHour: settings.studyNotificationHour,
        studyNotificationMinute: settings.studyNotificationMinute,
        queueOrder: settings.queueOrder,
        newCardsIgnoreReviewLimit: settings.newCardsIgnoreReviewLimit,
        limitsStartFromTop: settings.limitsStartFromTop,
        dayRolloverHour: settings.dayRolloverHour,
        learnAheadMinutes: settings.learnAheadMinutes,
        algorithm: settings.algorithm,
        fsrsEnabled: settings.fsrsEnabled === true,
        fsrsRescheduleOnChange: settings.fsrsRescheduleOnChange === true,
        fsrsShortTermWithSteps: settings.fsrsShortTermWithSteps === true,
    };

    setDbSetting(DB_SETTINGS_KEYS.APP_SETTINGS_META, JSON.stringify(meta));
}

/**
 * Save the two collection-wide controls that Anki places in Deck Options without rewriting the
 * default preset. `saveSettings()` also synchronizes preset fields, which would otherwise be able
 * to overwrite unsaved edits when this screen is opened for the default preset.
 */
export function saveCollectionDeckOptions(options: Pick<AppSettings,
    'newCardsIgnoreReviewLimit' | 'limitsStartFromTop'>
    & Partial<Pick<AppSettings, 'fsrsEnabled' | 'fsrsRescheduleOnChange' | 'fsrsShortTermWithSteps'>>): void {
    const current = loadSettings();
    const validated = validateSettings({ ...current, ...options } as unknown as Record<string, unknown>);
    persistAppSettingsMeta(validated);
}

// --- Settings (source of truth: SQLite deck config + SQLite settings metadata) ---
export function loadSettings(): AppSettings {
    const fromDeck = hydrateSettingsFromDeckConfig({ ...DEFAULT_SETTINGS });
    const meta = loadAppSettingsMeta();

    return { ...fromDeck, ...meta };
}

/** Resets only the app settings (not decks/cards/history) to factory defaults. */
export function resetSettingsToDefaults(): SaveSettingsResult {
    return saveSettings({ ...DEFAULT_SETTINGS });
}

export type SaveSettingsResult =
    | { ok: true; settings: AppSettings }
    | { ok: false; error: unknown };

export function saveSettings(settings: AppSettings): SaveSettingsResult {
    const db = getDB();
    let transactionStarted = false;
    try {
        const validated = validateSettings(settings as unknown as Record<string, unknown>);
        db.execSync('BEGIN TRANSACTION;');
        transactionStarted = true;
        syncDefaultDeckConfig(validated);
        persistAppSettingsMeta(validated);
        db.execSync('COMMIT;');
        return { ok: true, settings: validated };
    } catch (e) {
        console.error('Settings kayıt hatası:', e);
        if (transactionStarted) {
            try {
                db.execSync('ROLLBACK;');
            } catch (rollbackError) {
                console.error('[Storage] settings rollback failed:', rollbackError);
            }
        }
        return { ok: false, error: e };
    }
}

// --- Reset ---
export async function resetAllData(): Promise<void> {
    const db = getDB();
    let transactionStarted = false;
    try {
        db.execSync('BEGIN TRANSACTION;');
        transactionStarted = true;
        for (const table of [
            'revlog',
            'anki_cards',
            'notes',
            'decks',
            'deck_configs',
            'note_types',
            'graves',
            'cards_fts',
            'session_stats',
            'settings',
        ]) {
            db.execSync(`DELETE FROM ${table};`);
        }
        db.execSync('COMMIT;');
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted) {
            try {
                db.execSync('ROLLBACK;');
            } catch (rollbackError) {
                console.error('[Storage] resetAllData rollback failed:', rollbackError);
            }
        }
        throw error;
    }

    // Re-seed only after the destructive transaction commits. Any failure is propagated to the
    // UI; the pre-reset backup remains available for recovery.
    initAnkiData();
    migrateLegacySubjectTopicsToDecks();
    const settingsResult = saveSettings({ ...DEFAULT_SETTINGS });
    if (!settingsResult.ok) throw settingsResult.error;
    dbIndexAllCards(getSearchIndexCards());

    // Legacy keys are removed last. A database failure therefore cannot erase their only copy.
    await Promise.all([
        clearLegacyCardStates(),
        AsyncStorage.removeItem(KEYS.SESSION_STATS),
        AsyncStorage.removeItem(KEYS.CUSTOM_CARDS),
        AsyncStorage.removeItem(KEYS.SETTINGS),
    ]);
}

// --- Export / Import ---
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB limit

/** Sanitize imported object to prevent prototype pollution */
function sanitizeObject<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject) as unknown as T;
    const clean: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
    return clean as T;
}

function sanitizeStepArray(value: unknown, fallback: number[]): number[] {
    if (!Array.isArray(value)) return fallback;
    const clean = value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 10080)
        .slice(0, 20);

    return clean.length > 0 ? clean : fallback;
}

function normalizeReviewSwipeAction(value: unknown, fallback: 'tools' | 'decks' | 'off') {
    return normalizeReviewGestureAction(value, fallback);
}

function validateSettings(settings: Record<string, unknown>): AppSettings {
    const validated = { ...DEFAULT_SETTINGS, ...settings } as AppSettings;
    validated.dailyNewLimit = Math.max(0, Math.min(9999, Number(validated.dailyNewLimit) || 20));
    validated.dailyReviewLimit = Math.max(0, Math.min(9999, Number(validated.dailyReviewLimit) || 200));
    validated.graduatingInterval = Math.max(1, Math.min(365, Number(validated.graduatingInterval) || 1));
    validated.easyInterval = Math.max(1, Math.min(365, Number(validated.easyInterval) || 4));
    validated.startingEase = Math.max(1.3, Math.min(5.0, Number(validated.startingEase) || 2.5));
    validated.lapseIntervalMultiplier = Math.max(0, Math.min(1.0, Number(validated.lapseIntervalMultiplier ?? 0)));
    validated.minLapseInterval = Math.max(1, Math.min(365, Number(validated.minLapseInterval ?? 1)));
    validated.hardIntervalMultiplier = Math.max(1.0, Math.min(2.0, Number(validated.hardIntervalMultiplier) || 1.2));
    validated.easyBonus = Math.max(1.0, Math.min(2.0, Number(validated.easyBonus) || 1.3));
    validated.intervalModifier = Math.max(0.1, Math.min(3.0, Number(validated.intervalModifier) || 1.0));
    validated.maxInterval = Math.max(1, Math.min(36500, Number(validated.maxInterval) || 36500));
    validated.dayRolloverHour = Math.max(0, Math.min(23, Number(validated.dayRolloverHour) || 4));
    validated.learningSteps = sanitizeStepArray(validated.learningSteps, [1, 10]);
    validated.lapseSteps = sanitizeStepArray(validated.lapseSteps, [10]);
    validated.queueOrder = normalizeQueueOrder(validated.queueOrder);
    // Settings saved before the app had all six of Anki's gather orders carry the old names.
    validated.newCardGatherOrder = normalizeNewCardGatherOrder(validated.newCardGatherOrder);
    validated.newCardOrder = validated.newCardOrder === 'random' ? 'random' : 'sequential';
    validated.newCardsIgnoreReviewLimit = validated.newCardsIgnoreReviewLimit !== false;
    validated.limitsStartFromTop = validated.limitsStartFromTop !== false;
    validated.algorithm = 'ANKI_V3';
    validated.language = normalizeLanguage(validated.language);
    validated.themeMode = normalizeThemeMode(validated.themeMode);
    validated.keyBindings = normalizeKeyBindings(validated.keyBindings);
    validated.autoAdvance = Boolean(validated.autoAdvance);
    validated.newCardDeckMode = validated.newCardDeckMode === 'default' ? 'default' : 'current';
    validated.editorFontSize = Math.max(12, Math.min(32, Number(validated.editorFontSize ?? 16) || 16));
    validated.editorCapitalizeSentences = validated.editorCapitalizeSentences !== false;
    validated.editorToolbarVisible = validated.editorToolbarVisible !== false;
    validated.editorToolbarScrollable = validated.editorToolbarScrollable !== false;
    validated.pasteClipboardImagesAsPng = Boolean(validated.pasteClipboardImagesAsPng);
    validated.newStudyScreenEnabled = Boolean(validated.newStudyScreenEnabled);
    validated.studyFrameStyle = validated.studyFrameStyle === 'plain' ? 'plain' : 'card';
    validated.showAudioPlayButtons = validated.showAudioPlayButtons !== false;
    validated.showAnswerFeedback = validated.showAnswerFeedback !== false;
    validated.showAnswerButtons = validated.showAnswerButtons !== false;
    validated.hideHardAndEasy = Boolean(validated.hideHardAndEasy);
    validated.showStudyTopBar = validated.showStudyTopBar !== false;
    validated.reviewerToolbarPosition = normalizeReviewerToolbarPosition(validated.reviewerToolbarPosition);
    validated.showToolsOverlayButton = Boolean(validated.showToolsOverlayButton);
    validated.toolsOverlayPosition = validated.toolsOverlayPosition === 'left' ? 'left' : 'right';
    validated.neverTypeAnswer = Boolean(validated.neverTypeAnswer);
    validated.typeAnswerInCard = Boolean(validated.typeAnswerInCard);
    validated.focusTypeAnswer = validated.focusTypeAnswer !== false;
    validated.showDeckTitle = validated.showDeckTitle !== false;
    validated.centerCardContent = Boolean(validated.centerCardContent);
    validated.showRemainingTime = Boolean(validated.showRemainingTime);
    validated.timeboxMinutes = Math.max(0, Math.min(9999, Math.round(Number(validated.timeboxMinutes ?? 0) || 0)));
    validated.keepScreenOn = Boolean(validated.keepScreenOn);
    validated.ninePointTouchEnabled = validated.ninePointTouchEnabled !== false;
    validated.questionTapActions = normalizeReviewTapActions(validated.questionTapActions, DEFAULT_QUESTION_TAP_ACTIONS);
    validated.answerTapActions = normalizeReviewTapActions(validated.answerTapActions, DEFAULT_ANSWER_TAP_ACTIONS);
    validated.gesturesEnabled = Boolean(validated.gesturesEnabled);
    validated.swipeSensitivity = normalizeSwipeSensitivity(validated.swipeSensitivity);
    validated.swipeLeftAction = normalizeReviewSwipeAction(validated.swipeLeftAction, 'tools');
    validated.swipeRightAction = normalizeReviewSwipeAction(validated.swipeRightAction, 'decks');
    validated.swipeUpAction = normalizeReviewSwipeAction(validated.swipeUpAction, 'off');
    validated.swipeDownAction = normalizeReviewSwipeAction(validated.swipeDownAction, 'off');
    validated.fullScreenNavigationDrawer = Boolean(validated.fullScreenNavigationDrawer);
    validated.doubleBackToExit = Boolean(validated.doubleBackToExit);
    validated.cardZoomPercent = Math.max(50, Math.min(200, Number(validated.cardZoomPercent ?? 100) || 100));
    validated.imageZoomPercent = Math.max(50, Math.min(200, Number(validated.imageZoomPercent ?? 100) || 100));
    validated.answerButtonScalePercent = Math.max(100, Math.min(175, Number(validated.answerButtonScalePercent ?? 100) || 100));
    validated.twoRowAnswerButtons = Boolean(validated.twoRowAnswerButtons);
    validated.browserFontScalePercent = Math.max(75, Math.min(175, Number(validated.browserFontScalePercent ?? 100) || 100));
    validated.showBrowserAudioFilenames = Boolean(validated.showBrowserAudioFilenames);
    validated.showAnswerLongPressMs = Math.max(0, Math.min(2000, Number(validated.showAnswerLongPressMs ?? 0) || 0));
    validated.answerDoubleTapMs = Math.max(0, Math.min(2000, Number(validated.answerDoubleTapMs ?? 200) || 0));
    validated.autoBackupEnabled = validated.autoBackupEnabled !== false;
    validated.backupIntervalMinutes = 10080;
    validated.backupDailyCopies = 0;
    validated.backupWeeklyCopies = 7;
    validated.backupMonthlyCopies = 0;
    validated.studyNotificationsEnabled = validated.studyNotificationsEnabled !== false;
    validated.studyNotificationThreshold = normalizeStudyNotificationThreshold(validated.studyNotificationThreshold);
    validated.studyNotificationHour = Math.max(0, Math.min(23, Number(validated.studyNotificationHour ?? 9) || 0));
    validated.studyNotificationMinute = Math.max(0, Math.min(59, Number(validated.studyNotificationMinute ?? 0) || 0));
    return validated;
}

/**
 * Full-collection snapshot, minus the purchased card pack.
 *
 * Those 9,583 notes and cards are ~6.4 MB of the collection and can always be reinstalled from
 * the bundled package, so copying them into every weekly backup would waste tens of megabytes and
 * would also spread paid content as plain text. What cannot be recreated — the learner's own
 * decks and notes, their review log, and their scheduling progress on catalog cards — is kept.
 */
export async function exportAllData(): Promise<string> {
    const settings = loadSettings();
    const sessionStats = await loadSessionStats();

    let schemaVersion = 0;
    let catalogProgress: CatalogProgress = {};
    let tables = {
        note_types: [] as any[],
        notes: [] as any[],
        anki_cards: [] as any[],
        decks: [] as any[],
        deck_configs: [] as any[],
        revlog: [] as any[],
        graves: [] as any[],
        session_stats: [] as any[],
    };

    try {
        const db = getDB();

        schemaVersion = dbGetSchemaVersion();
        const catalogNoteIds = new Set<number>();
        const notes = db.getAllSync<any>('SELECT * FROM notes ORDER BY id').filter((row) => {
            if (!isCatalogPackRow(row.data)) return true;
            catalogNoteIds.add(Number(row.id));
            return false;
        });
        const cards = db.getAllSync<any>('SELECT * FROM anki_cards ORDER BY id').filter((row) => {
            if (!catalogNoteIds.has(Number(row.noteId))) return true;
            try {
                const card = JSON.parse(row.data);
                if (hasStudyProgress(card)) catalogProgress[String(row.id)] = encodeCatalogProgress(card);
            } catch { /* an unreadable row simply carries no progress worth restoring */ }
            return false;
        });
        // Note types, decks and deck presets stay in full: they are a few kilobytes, and dropping
        // one would orphan a learner's own note or card that happens to reference it.
        tables = {
            note_types: db.getAllSync('SELECT * FROM note_types ORDER BY id'),
            notes,
            anki_cards: cards,
            decks: db.getAllSync('SELECT * FROM decks ORDER BY id'),
            deck_configs: db.getAllSync('SELECT * FROM deck_configs ORDER BY id'),
            revlog: db.getAllSync('SELECT * FROM revlog ORDER BY id'),
            graves: db.getAllSync('SELECT * FROM graves'),
            session_stats: db.getAllSync('SELECT * FROM session_stats ORDER BY date'),
        };
    } catch (e) {
        console.warn('[Storage] exportAllData DB access failed:', e);
        // If DB is not ready, fallback to metadata-only export.
    }

    return JSON.stringify({
        version: 6,
        schema_version: schemaVersion,
        exportDate: new Date().toISOString(),
        canonical: true,
        settings,
        sessionStats,
        catalogProgress,
        tables,
    });
}

function isCanonicalImport(data: any): boolean {
    return Boolean(data?.canonical && data?.tables && typeof data.tables === 'object');
}

function importCanonicalTables(data: any): void {
    initDB();
    const db = getDB();

    db.execSync('BEGIN TRANSACTION;');
    try {
        db.execSync(`
            DELETE FROM revlog;
            DELETE FROM anki_cards;
            DELETE FROM notes;
            DELETE FROM decks;
            DELETE FROM deck_configs;
            DELETE FROM note_types;
            DELETE FROM graves;
            DELETE FROM cards_fts;
            DELETE FROM session_stats;
        `);

        for (const row of data.tables.note_types || []) {
            db.runSync(
                'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.notes || []) {
            db.runSync(
                'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.noteTypeId,
                row.sfld,
                row.csum,
                row.tags,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.anki_cards || []) {
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                row.id,
                row.noteId,
                row.deckId,
                row.ord,
                row.type,
                row.queue,
                row.due,
                row.ivl,
                row.factor,
                row.reps,
                row.lapses,
                row.left ?? 0,
                row.flags,
                row.data,
                row.updated_at ?? 0,
                row.created_at || row.updated_at || row.id || Date.now(),
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.decks || []) {
            db.runSync(
                'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.deck_configs || []) {
            db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', row.id, row.data);
        }

        for (const row of data.tables.revlog || []) {
            db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.cardId,
                row.usn,
                row.ease,
                row.ivl,
                row.lastIvl,
                row.factor,
                row.time,
                row.type,
            );
        }

        for (const row of data.tables.graves || []) {
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, ?, ?)', row.oid, row.type, row.usn);
        }

        for (const row of data.tables.session_stats || []) {
            db.runSync('INSERT INTO session_stats (date, data) VALUES (?, ?)', row.date, row.data);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    try {
        dbIndexAllCards(getSearchIndexCards());
    } catch (error) {
        // The collection transaction has already committed. Search indexing is
        // recoverable maintenance and must not misreport the whole restore as failed.
        console.warn('[Storage] post-import search index rebuild failed:', error);
    }
}

const CANONICAL_IMPORT_TABLES = [
    'note_types',
    'notes',
    'anki_cards',
    'decks',
    'deck_configs',
    'revlog',
    'graves',
    'session_stats',
] as const;

function hasValidCanonicalTableShape(data: any): boolean {
    if (!isCanonicalImport(data)) return false;
    return CANONICAL_IMPORT_TABLES.every((name) => Array.isArray(data.tables[name]));
}

export async function importAllData(jsonString: string): Promise<boolean> {
    try {
        if (jsonString.length > MAX_IMPORT_SIZE) {
            console.error(`Import: Dosya çok büyük (${(jsonString.length / 1024 / 1024).toFixed(1)} MB > 50 MB limit)`);
            return false;
        }

        let data = JSON.parse(jsonString);
        data = sanitizeObject(data);

        if (!Number.isInteger(data.version) || data.version < 1 || data.version > 6) {
            console.error('Import: Geçersiz version alanı');
            return false;
        }

        if (data.settings && typeof data.settings !== 'object') {
            console.error('Import: settings bir obje değil');
            return false;
        }

        if (isCanonicalImport(data)) {
            // Validate the complete container before touching settings or tables.
            // This keeps truncated/hand-edited files as a true no-op.
            const validation = validateCanonicalBackupData(data);
            if (!validation.valid || !hasValidCanonicalTableShape(data)) {
                console.error(`Import: Geçersiz canonical yedek (${validation.valid ? 'shape' : validation.reason})`);
                return false;
            }
            if (canonicalBackupContainsCatalog(data)) {
                console.error('Import: Ücretli katalog satırları yedekten geri yüklenemez');
                return false;
            }

            importCanonicalTables(data);
            if (data.settings) {
                data.settings = validateSettings(data.settings);
                saveSettings(data.settings);
            }
            if (data.sessionStats) {
                await saveSessionStats(data.sessionStats as SessionStats);
            }
            // The backup deliberately omits the purchased pack; hand its scheduling state to the
            // installer, which re-applies it card by card the next time the pack is installed.
            const restoredProgress = parseCatalogProgress(
                typeof data.catalogProgress === 'object' && data.catalogProgress !== null
                    ? JSON.stringify(data.catalogProgress)
                    : null,
            );
            // Always replace the pending progress map; otherwise an empty/older
            // backup could inherit progress left over from the collection it replaced.
            setDbSetting(CATALOG_PROGRESS_KEY, JSON.stringify(restoredProgress));
            await clearLegacyCardStates();
            await saveCustomCards([]);
            return true;
        }

        // Legacy import fallback (pre-canonical export format)
        if (data.cardStates && typeof data.cardStates !== 'object') {
            console.error('Import: cardStates bir obje değil');
            return false;
        }

        if (data.customCards && !Array.isArray(data.customCards)) {
            console.error('Import: customCards bir dizi değil');
            return false;
        }

        // Legacy migration uses these settings to translate due dates correctly.
        // Callers that replace a collection wrap this path in a safety snapshot.
        if (data.settings) {
            data.settings = validateSettings(data.settings);
            saveSettings(data.settings);
        }
        if (data.sessionStats) {
            await saveSessionStats(data.sessionStats as SessionStats);
        }

        let customCardIdMap: Record<number, number> = {};
        if (data.customCards) {
            const customResult = migrateLegacyCustomCardsToAnki(data.customCards as Card[], { force: true });
            customCardIdMap = customResult.legacyIdToAnkiCardId;
        }

        if (data.cardStates) {
            const settings = loadSettings();
            migrateLegacyCardStatesToAnki(data.cardStates as Record<string, CardState>, settings, { force: true }, customCardIdMap);
        }

        await clearLegacyCardStates();
        await saveCustomCards([]);

        return true;
    } catch (error) {
        console.error('Import hatası:', error);
        return false;
    }
}
