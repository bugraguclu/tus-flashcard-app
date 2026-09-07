import { describe, expect, it } from 'vitest';

import {
    clearCardWhiteboard,
    clearDeckWhiteboards,
    DEFAULT_WHITEBOARD_DECK_STATE,
    loadCardWhiteboard,
    parseWhiteboardCardStore,
    parseWhiteboardDeckState,
    penColorForTheme,
    saveCardWhiteboard,
    serializeWhiteboardCardStore,
    serializeWhiteboardDeckState,
    withPenColorForTheme,
    type WhiteboardCardSnapshot,
    type WhiteboardDeckState,
} from './whiteboardSession';

const DEFAULTS = { light: '#111111', dark: '#f5f5f5' };

describe('per-deck whiteboard state', () => {
    it('falls back to the defaults for missing, blank or unparsable rows', () => {
        expect(parseWhiteboardDeckState(undefined)).toEqual(DEFAULT_WHITEBOARD_DECK_STATE);
        expect(parseWhiteboardDeckState('')).toEqual(DEFAULT_WHITEBOARD_DECK_STATE);
        expect(parseWhiteboardDeckState('{oops')).toEqual(DEFAULT_WHITEBOARD_DECK_STATE);
        expect(parseWhiteboardDeckState('null')).toEqual(DEFAULT_WHITEBOARD_DECK_STATE);
        expect(parseWhiteboardDeckState('[]')).toEqual(DEFAULT_WHITEBOARD_DECK_STATE);
    });

    it('round-trips a full row', () => {
        const state: WhiteboardDeckState = {
            enabled: true,
            stylusOnly: true,
            lightPenColor: '#e0393e',
            darkPenColor: '#2f7fd6',
        };
        expect(parseWhiteboardDeckState(serializeWhiteboardDeckState(state))).toEqual(state);
    });

    it('restores what it can from a partial row written by an older build', () => {
        expect(parseWhiteboardDeckState('{"enabled":true}')).toEqual({
            enabled: true,
            stylusOnly: false,
            lightPenColor: null,
            darkPenColor: null,
        });
    });

    it('drops a colour that is not a plain hex value', () => {
        const parsed = parseWhiteboardDeckState(JSON.stringify({
            lightPenColor: 'javascript:alert(1)',
            darkPenColor: 'url(#x)',
        }));
        expect(parsed.lightPenColor).toBeNull();
        expect(parsed.darkPenColor).toBeNull();
    });

    it('accepts short hex and normalizes case', () => {
        expect(parseWhiteboardDeckState('{"lightPenColor":"#ABC"}').lightPenColor).toBe('#abc');
    });
});

describe('theme-aware pen colour', () => {
    it('uses each theme its own default when nothing is stored', () => {
        expect(penColorForTheme(DEFAULT_WHITEBOARD_DECK_STATE, false, DEFAULTS)).toBe('#111111');
        expect(penColorForTheme(DEFAULT_WHITEBOARD_DECK_STATE, true, DEFAULTS)).toBe('#f5f5f5');
    });

    it('picks the stored colour belonging to the active theme', () => {
        const state = parseWhiteboardDeckState(JSON.stringify({
            lightPenColor: '#e0393e',
            darkPenColor: '#2ea043',
        }));
        expect(penColorForTheme(state, false, DEFAULTS)).toBe('#e0393e');
        expect(penColorForTheme(state, true, DEFAULTS)).toBe('#2ea043');
    });

    // A pen chosen on a white card must not become the pen on a black one.
    it('writes only the active theme’s pen', () => {
        const light = withPenColorForTheme(DEFAULT_WHITEBOARD_DECK_STATE, false, '#e0393e');
        expect(light).toEqual({ ...DEFAULT_WHITEBOARD_DECK_STATE, lightPenColor: '#e0393e' });

        const both = withPenColorForTheme(light, true, '#2ea043');
        expect(both.lightPenColor).toBe('#e0393e');
        expect(both.darkPenColor).toBe('#2ea043');
    });
});

describe('card whiteboard snapshot persistence', () => {
    it('round-trips strokes and history in card store', () => {
        const snapshot: WhiteboardCardSnapshot = {
            strokes: [
                { points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], color: '#e0393e', width: 4 },
            ],
            past: [[]],
            future: [],
        };
        const serialized = serializeWhiteboardCardStore({ 101: snapshot });
        const restored = parseWhiteboardCardStore(serialized);

        expect(restored[101]).toEqual(snapshot);
    });

    it('falls back safely for corrupted or empty store strings', () => {
        expect(parseWhiteboardCardStore(undefined)).toEqual({});
        expect(parseWhiteboardCardStore('')).toEqual({});
        expect(parseWhiteboardCardStore('{corrupted')).toEqual({});
        expect(parseWhiteboardCardStore('[]')).toEqual({});
    });

    it('saves, loads, and clears card whiteboard snapshots per deck and card', () => {
        const deckId = 999;
        const card1 = 1001;
        const card2 = 1002;

        const snapshot1: WhiteboardCardSnapshot = {
            strokes: [
                { points: [{ x: 5, y: 5 }, { x: 15, y: 15 }], color: '#2ea043', width: 3 },
            ],
            past: [],
            future: [],
        };

        const snapshot2: WhiteboardCardSnapshot = {
            strokes: [
                { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], color: '#2f7fd6', width: 2 },
            ],
            past: [],
            future: [],
        };

        saveCardWhiteboard(deckId, card1, snapshot1);
        saveCardWhiteboard(deckId, card2, snapshot2);

        expect(loadCardWhiteboard(deckId, card1)).toEqual(snapshot1);
        expect(loadCardWhiteboard(deckId, card2)).toEqual(snapshot2);

        // Clear card1
        clearCardWhiteboard(deckId, card1);
        expect(loadCardWhiteboard(deckId, card1)).toBeNull();
        expect(loadCardWhiteboard(deckId, card2)).toEqual(snapshot2);

        // Clear whole deck
        clearDeckWhiteboards(deckId);
        expect(loadCardWhiteboard(deckId, card2)).toBeNull();
    });
});

