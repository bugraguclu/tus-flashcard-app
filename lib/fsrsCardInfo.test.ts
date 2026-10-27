// Card Info is a read-only projection: opening it must never change scheduling or revlog.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const runtime = vi.hoisted(() => ({ db: null as any, settings: null as any, cardId: 901 }));
vi.mock('./db', () => ({
    getDB: () => runtime.db, dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
}));
vi.mock('react-native', () => ({
    Platform: { OS: 'ios' }, StyleSheet: { create: (s: unknown) => s },
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ useRouter: () => ({}), useLocalSearchParams: () => ({ cardId: String(runtime.cardId) }) }));
vi.mock('../contexts/AppContext', () => ({ useAppSettings: () => ({ settings: runtime.settings }) }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({
    l: (_tr: string, en: string) => en, t: (key: string) => key, locale: 'en', localeTag: 'en-US',
}) }));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => ({}), Spacing: {}, BorderRadius: {}, FontSize: {}, Shadows: {},
}));

import CardInfoScreen from '../app/card-info';
import { saveDeck, saveDeckConfig } from './deckManager';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';
import { parseFsrsCutoffDate } from './fsrs';

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-fsrs.json'), 'utf8'));
const NOW = Date.UTC(2026, 9, 23, 12);
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let renderer: TestRenderer.ReactTestRenderer | undefined;
const originalTimezone = process.env.TZ;

beforeAll(async () => {
    SQL = await initSqlJs();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    process.env.TZ = fixture.meta.timezone;
    runtime.db = createAppDb(SQL);
    runtime.settings = { ...DEFAULT_SETTINGS, fsrsEnabled: true, dayRolloverHour: 4 };
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
    saveDeck({ id: 1, name: 'Original', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveAnkiCard({
        id: runtime.cardId, noteId: 999, deckId: 1, ord: 0, mod: 1, usn: -1,
        type: 2, queue: 2, due: 20000, ivl: 12, factor: 2500, reps: 4,
        lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: NOW - 86_400_000,
    } as AnkiCard);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    runtime.db.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.TZ = originalTimezone;
});
function mount() { act(() => { renderer = TestRenderer.create(React.createElement(CardInfoScreen)); }); }
function value(label: string) {
    return renderer!.root.findAll((node) => node.props.label === label)[0]?.props.value;
}

describe('FSRS Card Info', () => {
    it('derives a missing state from the 26.09.3 oracle history without writing the card', () => {
        const entry = fixture.memory.find((e: any) => e.state && e.card.type !== 0 && e.entries.some((r: any) => r.type === 0));
        vi.setSystemTime(entry.nextDayAtMs - 3_600_000);
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, fsrsParams: entry.params,
            historicalRetention: entry.historicalRetention, ignoreRevlogsBeforeMs: entry.ignore ? parseFsrsCutoffDate(entry.ignore) ?? 0 : 0 });
        const card = { ...getAnkiCard(runtime.cardId)!, type: entry.card.type, ivl: entry.card.ivl, factor: entry.card.factor };
        saveAnkiCard(card);
        for (const e of entry.entries) runtime.db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 1000, ?)',
            e.id, card.id, e.ease, e.ivl, e.lastIvl, e.factor, e.type,
        );
        const before = JSON.stringify(getAnkiCard(card.id));
        const writes = vi.spyOn(runtime.db, 'runSync');
        mount();
        expect(value('Stability')).toBe(`${entry.state[0].toFixed(2)} days`);
        expect(value('Difficulty')).toBe(`${(((entry.state[1] - 1) / 9) * 100).toFixed(0)}%`);
        expect(value('Ease')).toBeUndefined();
        expect(JSON.stringify(getAnkiCard(card.id))).toBe(before);
        expect(writes).not.toHaveBeenCalled();
    });

    it('hides Ease even when a new card has no memory state, and shows Ease with FSRS off', () => {
        saveAnkiCard({ ...getAnkiCard(runtime.cardId)!, type: 0, queue: 0, ivl: 0, reps: 0 });
        mount();
        expect(value('Ease')).toBeUndefined();
        expect(value('Stability')).toBeUndefined();
        act(() => renderer!.unmount());
        runtime.settings = { ...runtime.settings, fsrsEnabled: false };
        mount();
        expect(value('Ease')).toBe('250%');
        expect(value('Stability')).toBeUndefined();
    });

    it('does not derive a reviewed card from history when FSRS is off', () => {
        runtime.settings = { ...runtime.settings, fsrsEnabled: false };
        mount();
        expect(value('Stability')).toBeUndefined();
        expect(value('Ease')).toBe('250%');
    });

    it('uses stored memory and decay and displays retrievability as a whole percent', () => {
        saveAnkiCard({ ...getAnkiCard(runtime.cardId)!,
            ankiData: JSON.stringify({ s: 20, d: 5, decay: 0.154, lrt: NOW / 1000 - 86400 * 9 }),
        });
        mount();
        expect(value('Stability')).toBe('20.00 days');
        expect(value('Retrievability')).toMatch(/^\d+%$/);
        expect(value('Ease')).toBeUndefined();
    });

    it('uses the original deck preset for a filtered card, never the filtered deck preset', () => {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, fsrsParams: [], historicalRetention: 0.75 });
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, historicalRetention: 0.95 });
        saveDeck({ id: 2, name: 'Filtered', configId: 2, isFiltered: true } as any);
        saveAnkiCard({ ...getAnkiCard(runtime.cardId)!, deckId: 2, odid: 1 });
        mount();
        expect(value('Stability')).toBeDefined();
        // Historical recall below 90% derives a stability smaller than the current interval.
        expect(Number.parseFloat(value('Stability'))).toBeLessThan(12);
    });
});
