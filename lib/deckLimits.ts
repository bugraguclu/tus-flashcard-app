import {
    DEFAULT_DECK_CONFIG,
    getDeckDisplayName,
    getParentDeckName,
    uniqueId,
    type DeckConfig,
} from './models';
import { getDB } from './db';
import { dayNumberToYmd, localDayNumber } from './ankiState';
import { getDeck, getDeckByName, saveDeck } from './deckStore';
import { getDeckConfig, saveDeckConfig } from './deckPresets';

/**
 * A deck's daily limits: the preset value, the deck override and the today-only boost, and
 * the effective config that combines them.
 */

export function getDeckConfigForDeck(deckId: number, rolloverHour: number = 4): DeckConfig {
    const deck = getDeck(deckId);
    const config = getDeckConfig(deck?.configId || DEFAULT_DECK_CONFIG.id);

    // Anki keeps per-deck limits separate from the shared preset, so two decks can share every
    // scheduling option while retaining different daily caps.
    if (Number.isFinite(deck?.newLimit)) config.newPerDay = Math.max(0, Math.floor(deck!.newLimit!));
    if (Number.isFinite(deck?.reviewLimit)) config.maxReviewsPerDay = Math.max(0, Math.floor(deck!.reviewLimit!));

    // Anki's "today only" limit bump (custom study / deck options): layered on top of the
    // persistent config so every consumer — queue build, counts, previews — sees it at once.
    const boost = getDeckTodayBoost(deckId, rolloverHour);
    if (boost.extraNew !== 0) config.newPerDay = Math.max(0, config.newPerDay + boost.extraNew);
    if (boost.extraReview !== 0) config.maxReviewsPerDay = Math.max(0, config.maxReviewsPerDay + boost.extraReview);
    const today = getDeckTodayLimits(deckId, rolloverHour);
    if (today.newLimit !== undefined) config.newPerDay = today.newLimit;
    if (today.reviewLimit !== undefined) config.maxReviewsPerDay = today.reviewLimit;

    return config;
}

// ---- Deck options: limits, today-only boosts, moving, custom study ----

function deckBoostKey(deckId: number): string {
    return `deck_today_boost:${deckId}`;
}

interface DeckTodayBoost {
    ymd: string;
    extraNew: number;
    extraReview: number;
}

interface DeckTodayLimits {
    ymd: string;
    newLimit?: number;
    reviewLimit?: number;
}

function deckTodayLimitsKey(deckId: number): string {
    return `deck_today_limits:${deckId}`;
}

function todayBoostYmd(rolloverHour: number): string {
    return dayNumberToYmd(localDayNumber(Date.now(), rolloverHour), rolloverHour);
}

/** Today's one-day limit bump for a deck; expires automatically at the day rollover. */
export function getDeckTodayBoost(deckId: number, rolloverHour: number = 4): { extraNew: number; extraReview: number } {
    const db = getDB();
    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        deckBoostKey(deckId),
    );
    if (!row?.value) return { extraNew: 0, extraReview: 0 };

    try {
        const parsed = JSON.parse(row.value) as DeckTodayBoost;
        if (parsed.ymd !== todayBoostYmd(rolloverHour)) return { extraNew: 0, extraReview: 0 };
        return {
            extraNew: Math.trunc(parsed.extraNew) || 0,
            extraReview: Math.trunc(parsed.extraReview) || 0,
        };
    } catch {
        return { extraNew: 0, extraReview: 0 };
    }
}

/**
 * Anki custom study "increase today's limits": adds on top of any bump already granted today.
 * A negative delta shrinks today's allowance, which is what Anki's spinner does below zero; the
 * resulting limit is floored at zero when the queue is built.
 */
export function addDeckTodayBoost(deckId: number, extraNew: number, extraReview: number, rolloverHour: number = 4): void {
    const todayLimits = getDeckTodayLimits(deckId, rolloverHour);
    if (todayLimits.newLimit !== undefined || todayLimits.reviewLimit !== undefined) {
        const effective = getDeckConfigForDeck(deckId, rolloverHour);
        const addNew = Math.trunc(extraNew) || 0;
        const addReview = Math.trunc(extraReview) || 0;
        setDeckTodayLimits(
            deckId,
            todayLimits.newLimit !== undefined || addNew !== 0 ? effective.newPerDay + addNew : undefined,
            todayLimits.reviewLimit !== undefined || addReview !== 0 ? effective.maxReviewsPerDay + addReview : undefined,
            rolloverHour,
        );
        return;
    }
    const current = getDeckTodayBoost(deckId, rolloverHour);
    const next: DeckTodayBoost = {
        ymd: todayBoostYmd(rolloverHour),
        extraNew: current.extraNew + (Math.trunc(extraNew) || 0),
        extraReview: current.extraReview + (Math.trunc(extraReview) || 0),
    };
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        deckBoostKey(deckId),
        JSON.stringify(next),
    );
}

/**
 * Anki's custom study "increase today's limit" (`Collection::extend_limits`). Anki grants the
 * headroom on the deck itself, and on every parent as well when a parent's limit can hold the
 * deck back — the collection-wide "limits start from the top" preference. Without that second
 * step the extra cards would be handed out by the deck and then taken away again by its parent.
 */
export function extendDeckTodayLimits(
    deckId: number,
    extraNew: number,
    extraReview: number,
    rolloverHour: number = 4,
    options: { includeParents?: boolean } = {},
): void {
    addDeckTodayBoost(deckId, extraNew, extraReview, rolloverHour);
    if (!options.includeParents) return;

    let parentName = getParentDeckName(getDeck(deckId)?.name ?? '');
    while (parentName) {
        const parent = getDeckByName(parentName);
        if (parent) addDeckTodayBoost(parent.id, extraNew, extraReview, rolloverHour);
        parentName = getParentDeckName(parentName);
    }
}

/** Absolute "Today only" limits from Anki's deck-options tabs. */
export function getDeckTodayLimits(deckId: number, rolloverHour: number = 4): { newLimit?: number; reviewLimit?: number } {
    const row = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        deckTodayLimitsKey(deckId),
    );
    if (!row?.value) return {};
    try {
        const parsed = JSON.parse(row.value) as DeckTodayLimits;
        if (parsed.ymd !== todayBoostYmd(rolloverHour)) return {};
        const clamp = (value: unknown) => Number.isFinite(value)
            ? Math.max(0, Math.min(9999, Math.floor(value as number)))
            : undefined;
        return { newLimit: clamp(parsed.newLimit), reviewLimit: clamp(parsed.reviewLimit) };
    } catch {
        return {};
    }
}

export function setDeckTodayLimits(
    deckId: number,
    newLimit: number | undefined,
    reviewLimit: number | undefined,
    rolloverHour: number = 4,
): void {
    const clamp = (value: number | undefined) => Number.isFinite(value)
        ? Math.max(0, Math.min(9999, Math.floor(value as number)))
        : undefined;
    const next: DeckTodayLimits = {
        ymd: todayBoostYmd(rolloverHour),
        newLimit: clamp(newLimit),
        reviewLimit: clamp(reviewLimit),
    };
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        deckTodayLimitsKey(deckId),
        JSON.stringify(next),
    );
}

/** Save/clear Anki's "This deck" limit overrides without cloning the shared preset. */
export function setDeckLimitOverrides(deckId: number, newLimit?: number, reviewLimit?: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    const clamp = (value: number | undefined) => Number.isFinite(value)
        ? Math.max(0, Math.min(9999, Math.floor(value as number)))
        : undefined;
    deck.newLimit = clamp(newLimit);
    deck.reviewLimit = clamp(reviewLimit);
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/**
 * Persistent per-deck daily limits (Anki deck options "this deck"). The first edit splits the
 * deck off the shared preset onto its own config, so sibling decks keep their existing limits.
 */
export function setDeckLimits(deckId: number, newPerDay: number, maxReviewsPerDay: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;

    const clamp = (value: number, fallback: number) =>
        Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.floor(value))) : fallback;

    if (!deck.configId || deck.configId === DEFAULT_DECK_CONFIG.id) {
        const base = getDeckConfig(DEFAULT_DECK_CONFIG.id);
        const config: DeckConfig = {
            ...base,
            id: uniqueId(),
            name: getDeckDisplayName(deck.name),
            newPerDay: clamp(newPerDay, base.newPerDay),
            maxReviewsPerDay: clamp(maxReviewsPerDay, base.maxReviewsPerDay),
        };
        saveDeckConfig(config);

        deck.configId = config.id;
        deck.mod = Math.floor(Date.now() / 1000);
        deck.usn = -1;
        saveDeck(deck);
        return;
    }

    const config = getDeckConfig(deck.configId);
    config.newPerDay = clamp(newPerDay, config.newPerDay);
    config.maxReviewsPerDay = clamp(maxReviewsPerDay, config.maxReviewsPerDay);
    saveDeckConfig(config);
}
