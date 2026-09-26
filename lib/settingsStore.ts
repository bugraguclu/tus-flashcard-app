import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
} from './fsrs';
import type {
    CardState,
    SessionStats,
    AppSettings,
    AlgorithmType,
    ThemeMode,
    KeyBindings,
    Card,
} from './types';
import { todayLocalYMD } from './scheduler';
import { getDB } from './db';
import { getDbSetting, setDbSetting } from './dbSettings';
import { getDeckConfig, saveDeckConfig } from './deckManager';
import { resolveSettingsFromConfig } from './settingsResolver';
import { normalizeNewCardGatherOrder } from './queueBuild';
import { normalizeReviewerToolbarPosition } from './reviewerPresentation';
import { normalizeStudyNotificationThreshold } from './studyNotificationPolicy';
import {
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    normalizeReviewGestureAction,
    normalizeReviewTapActions,
    normalizeSwipeSensitivity,
} from './reviewerTouchControls';


/**
 * App settings and session statistics: their defaults, loading, validation and saving, and the
 * one-time migrations from the AsyncStorage era.
 */

export const KEYS = {
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
    // Off, as Anki's `apply_all_parent_limits` is: a deck's daily allowance is read from the deck
    // the learner opened, not squeezed again by every ancestor above it, until the switch in Deck
    // Options is turned on. A collection that already stored a value keeps it — the readers below
    // only fall back to this default when the key was never written at all.
    limitsStartFromTop: false,
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
    fsrsShortTermWithSteps: false,
    fsrsParameters: [...DEFAULT_FSRS_PARAMETERS],
    desiredRetention: FSRS_DEFAULT_DESIRED_RETENTION,
    historicalRetention: FSRS_DEFAULT_HISTORICAL_RETENTION,
};

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
    if (typeof settings.audioPlaybackRate === 'number') {
        config.audioPlaybackRate = settings.audioPlaybackRate;
    }
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
            limitsStartFromTop: parsed.limitsStartFromTop === true,
            dayRolloverHour: Math.max(0, Math.min(23, Number(parsed.dayRolloverHour ?? DEFAULT_SETTINGS.dayRolloverHour))),
            learnAheadMinutes: Math.max(0, Number(parsed.learnAheadMinutes ?? DEFAULT_SETTINGS.learnAheadMinutes) || 0),
            algorithm: 'ANKI_V3',
            audioPlaybackRate: typeof parsed.audioPlaybackRate === 'number' ? parsed.audioPlaybackRate : 1.0,
            // Collection-wide FSRS switches. Parameters and retention live on the preset and are
            // resolved per deck, so they are deliberately not stored here.
            fsrsEnabled: parsed.fsrsEnabled === true,
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
        audioPlaybackRate: settings.audioPlaybackRate ?? 1.0,
        fsrsEnabled: settings.fsrsEnabled === true,
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
    & Partial<Pick<AppSettings, 'fsrsEnabled' | 'fsrsShortTermWithSteps'>>): void {
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

export function validateSettings(settings: Record<string, unknown>): AppSettings {
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
    validated.limitsStartFromTop = validated.limitsStartFromTop === true;
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
