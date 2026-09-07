// Per-deck reviewer whiteboard preferences that survive leaving the reviewer.
//
// The whiteboard is not an Anki Desktop or AnkiMobile feature — neither the manual nor
// `ankitects/anki` describes one — so AnkiDroid is the only upstream that defines its behaviour.
// Its `MetaDB.whiteboardState` table keeps `state`, `visible`, `lightpencolor`, `darkpencolor`
// and `stylus` keyed by deck id, so returning to a deck restores the board the learner left. That
// contract is reproduced here independently, from observed behaviour rather than its code.
//
// When ink is discarded is a separate rule and lives with the reviewer's other timing decisions,
// in `shouldClearWhiteboardForCard` (lib/reviewerTimers.ts).
//
// https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/java/com/ichi2/anki/MetaDB.kt

import { getDbSetting, setDbSetting } from './storage';

/** Per-deck board preferences, mirroring the columns of AnkiDroid's `whiteboardState` row. */
export interface WhiteboardDeckState {
    /** `state`: drawing mode is on for this deck. */
    enabled: boolean;
    /** `stylus`: reject finger input and accept only a pencil. */
    stylusOnly: boolean;
    /** `lightpencolor`: pen colour while a light theme is active; null keeps the default. */
    lightPenColor: string | null;
    /** `darkpencolor`: pen colour while a dark theme is active; null keeps the default. */
    darkPenColor: string | null;
}

export const DEFAULT_WHITEBOARD_DECK_STATE: WhiteboardDeckState = {
    enabled: false,
    stylusOnly: false,
    lightPenColor: null,
    darkPenColor: null,
};

/** `#rgb`/`#rrggbb` only. Anything else is dropped rather than fed to the SVG renderer. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizePenColor(value: unknown): string | null {
    return typeof value === 'string' && HEX_COLOR.test(value.trim()) ? value.trim().toLowerCase() : null;
}

/**
 * Read one deck's board state out of its stored JSON.
 *
 * Every field falls back to the default independently, so a row written by an older build — or a
 * partially corrupted one — restores what it can instead of throwing the whole board away.
 */
export function parseWhiteboardDeckState(raw: unknown): WhiteboardDeckState {
    if (typeof raw !== 'string' || raw.trim() === '') return { ...DEFAULT_WHITEBOARD_DECK_STATE };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ...DEFAULT_WHITEBOARD_DECK_STATE };
    }
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_WHITEBOARD_DECK_STATE };
    const record = parsed as Record<string, unknown>;
    return {
        enabled: record.enabled === true,
        stylusOnly: record.stylusOnly === true,
        lightPenColor: normalizePenColor(record.lightPenColor),
        darkPenColor: normalizePenColor(record.darkPenColor),
    };
}

export function serializeWhiteboardDeckState(state: WhiteboardDeckState): string {
    return JSON.stringify({
        enabled: state.enabled,
        stylusOnly: state.stylusOnly,
        lightPenColor: normalizePenColor(state.lightPenColor),
        darkPenColor: normalizePenColor(state.darkPenColor),
    });
}

/**
 * The pen colour for the theme in front of the learner.
 *
 * AnkiDroid keeps the two colours in separate columns for a reason: one pen that reads well on a
 * white card is invisible on a dark one. Each theme therefore falls back to its own default.
 */
export function penColorForTheme(
    state: WhiteboardDeckState,
    isDark: boolean,
    defaults: { light: string; dark: string },
): string {
    const stored = isDark ? state.darkPenColor : state.lightPenColor;
    return stored ?? (isDark ? defaults.dark : defaults.light);
}

/** Store `color` against the theme in front of the learner, leaving the other theme's pen alone. */
export function withPenColorForTheme(
    state: WhiteboardDeckState,
    isDark: boolean,
    color: string,
): WhiteboardDeckState {
    const normalized = normalizePenColor(color);
    return isDark
        ? { ...state, darkPenColor: normalized }
        : { ...state, lightPenColor: normalized };
}

/**
 * Storage key for one deck's board.
 *
 * AnkiDroid keeps `whiteboardState` in MetaDB — a local database deliberately kept out of the
 * synced collection, because a pen colour is a property of the device in the learner's hand and
 * not of the collection. The `settings` table is this app's equivalent local store, so the row
 * lives there under one key per deck rather than in the deck record.
 */
export function whiteboardDeckStateKey(deckId: number): string {
    return `tus_whiteboard_deck_v1:${deckId}`;
}

/**
 * Read one deck's board state.
 *
 * Never throws: an unreadable or absent row restores the defaults, so a board preference can
 * never keep the reviewer from opening.
 */
export function loadWhiteboardDeckState(deckId: number): WhiteboardDeckState {
    return parseWhiteboardDeckState(getDbSetting(whiteboardDeckStateKey(deckId)));
}

/** Persist one deck's board state. Failures are logged by the storage layer, not thrown. */
export function saveWhiteboardDeckState(deckId: number, state: WhiteboardDeckState): void {
    setDbSetting(whiteboardDeckStateKey(deckId), serializeWhiteboardDeckState(state));
}

import type { WhiteboardHistory, WhiteboardPoint, WhiteboardStroke } from './whiteboardGeometry';

export type WhiteboardCardSnapshot = WhiteboardHistory;

export function cardWhiteboardStorageKey(deckId: number): string {
    return `tus_whiteboard_cards_v1:${deckId}`;
}

function sanitizeStroke(raw: unknown): WhiteboardStroke | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.points) || typeof r.color !== 'string' || typeof r.width !== 'number') return null;
    const points: WhiteboardPoint[] = [];
    for (const p of r.points) {
        if (p && typeof p === 'object' && typeof (p as any).x === 'number' && typeof (p as any).y === 'number') {
            points.push({ x: (p as any).x, y: (p as any).y });
        }
    }
    if (points.length === 0) return null;
    const color = normalizePenColor(r.color) ?? '#e0393e';
    const width = Math.max(1, Math.min(50, r.width));
    return { points, color, width };
}

function sanitizeStrokesArray(raw: unknown): WhiteboardStroke[] {
    if (!Array.isArray(raw)) return [];
    const result: WhiteboardStroke[] = [];
    for (const item of raw) {
        const stroke = sanitizeStroke(item);
        if (stroke) result.push(stroke);
    }
    return result;
}

export function parseWhiteboardCardStore(raw: unknown): Record<number, WhiteboardCardSnapshot> {
    if (typeof raw !== 'string' || raw.trim() === '') return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: Record<number, WhiteboardCardSnapshot> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const cardId = Number(key);
        if (!Number.isFinite(cardId) || !value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const strokes = sanitizeStrokesArray(v.strokes);
        if (strokes.length === 0) continue;
        const past = Array.isArray(v.past) ? (v.past as unknown[]).map(sanitizeStrokesArray) : [];
        const future = Array.isArray(v.future) ? (v.future as unknown[]).map(sanitizeStrokesArray) : [];
        store[cardId] = { strokes, past, future };
    }
    return store;
}

export function serializeWhiteboardCardStore(store: Record<number, WhiteboardCardSnapshot>): string {
    return JSON.stringify(store);
}

// Memory cache for active study sessions so reading/writing during rapid card flips is instant.
const cardWhiteboardsMemory = new Map<string, WhiteboardCardSnapshot>();

function memoryKey(deckId: number, cardId: number): string {
    return `${deckId}:${cardId}`;
}

export function saveCardWhiteboard(deckId: number, cardId: number, snapshot: WhiteboardCardSnapshot): void {
    const key = memoryKey(deckId, cardId);
    if (!snapshot || snapshot.strokes.length === 0) {
        cardWhiteboardsMemory.delete(key);
    } else {
        cardWhiteboardsMemory.set(key, snapshot);
    }
    try {
        const existing = parseWhiteboardCardStore(getDbSetting(cardWhiteboardStorageKey(deckId)));
        if (!snapshot || snapshot.strokes.length === 0) {
            delete existing[cardId];
        } else {
            existing[cardId] = snapshot;
        }
        setDbSetting(cardWhiteboardStorageKey(deckId), serializeWhiteboardCardStore(existing));
    } catch (e) {
        console.warn('[Whiteboard] Failed to persist card whiteboard:', e);
    }
}

export function loadCardWhiteboard(deckId: number, cardId: number): WhiteboardCardSnapshot | null {
    const key = memoryKey(deckId, cardId);
    if (cardWhiteboardsMemory.has(key)) {
        return cardWhiteboardsMemory.get(key) ?? null;
    }
    try {
        const existing = parseWhiteboardCardStore(getDbSetting(cardWhiteboardStorageKey(deckId)));
        const snapshot = existing[cardId] ?? null;
        if (snapshot && snapshot.strokes.length > 0) {
            cardWhiteboardsMemory.set(key, snapshot);
            return snapshot;
        }
    } catch (e) {
        console.warn('[Whiteboard] Failed to load card whiteboard:', e);
    }
    return null;
}

export function clearCardWhiteboard(deckId: number, cardId: number): void {
    cardWhiteboardsMemory.delete(memoryKey(deckId, cardId));
    try {
        const existing = parseWhiteboardCardStore(getDbSetting(cardWhiteboardStorageKey(deckId)));
        if (existing[cardId]) {
            delete existing[cardId];
            setDbSetting(cardWhiteboardStorageKey(deckId), serializeWhiteboardCardStore(existing));
        }
    } catch (e) {
        console.warn('[Whiteboard] Failed to clear card whiteboard:', e);
    }
}

export function clearDeckWhiteboards(deckId: number): void {
    for (const key of Array.from(cardWhiteboardsMemory.keys())) {
        if (key.startsWith(`${deckId}:`)) {
            cardWhiteboardsMemory.delete(key);
        }
    }
    try {
        setDbSetting(cardWhiteboardStorageKey(deckId), '');
    } catch (e) {
        console.warn('[Whiteboard] Failed to clear deck whiteboards:', e);
    }
}

