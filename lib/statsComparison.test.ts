import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

vi.mock('../components/ui/Card', () => ({ Card: ({ children }: any) => React.createElement('Card', null, children) }));
vi.mock('../components/ui/Choice', () => ({ SegmentedControl: 'SegmentedControl' }));
vi.mock('../components/ui/Rows', () => ({ SelectRow: 'SelectRow' }));
vi.mock('../components/ui/Feedback', () => ({ LoadingState: 'LoadingState', Notice: 'Notice' }));
vi.mock('../components/ReadErrorBanner', () => ({ ReadErrorBanner: 'ReadErrorBanner' }));
vi.mock('../components/stats/ComparisonBarChart', () => ({ default: 'ComparisonBarChart' }));
vi.mock('../hooks/useDeferredScreenSnapshot', () => ({ useDeferredScreenSnapshot: (key: string, load: () => unknown) => ({ snapshot: load(), snapshotKey: key, loading: false, error: null, retry: vi.fn() }) }));

vi.mock('react-native', () => {
    class AnimatedValue {
        _value: number;
        constructor(initial: number) { this._value = initial; }
        setValue = vi.fn();
        interpolate = () => ({});
    }
    return {
        Platform: { OS: 'ios', select: (spec: any) => spec.ios ?? spec.default },
        StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 },
        Animated: {
            Value: AnimatedValue,
            View: 'Animated.View',
            timing: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
            parallel: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
        },
        Easing: { linear: (t: number) => t, bezier: () => (t: number) => t },
        View: 'View',
        Text: 'Text',
        TouchableOpacity: 'TouchableOpacity',
        Pressable: 'Pressable',
        PanResponder: { create: () => ({ panHandlers: {} }) },
        AccessibilityInfo: {
            isScreenReaderEnabled: async () => false,
            isReduceMotionEnabled: async () => false,
            addEventListener: () => ({ remove: () => {} }),
        },
        useColorScheme: () => 'light',
    };
});
vi.mock('react-native-svg', () => ({
    default: 'Svg',
    G: 'G',
    Line: 'Line',
    Path: 'Path',
    Rect: 'Rect',
    Text: 'SvgText',
}));
vi.mock('react-native-safe-area-context', () => ({
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../components/BottomSheetModal', () => ({
    default: ({ visible, children }: any) => (visible ? React.createElement('BottomSheetModal', null, children) : null),
}));
vi.mock('../components/SwipeDismissSheet', () => ({
    default: ({ children }: any) => React.createElement('SwipeDismissSheet', null, children),
    SheetScrollView: ({ children }: any) => React.createElement('SheetScrollView', null, children),
}));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(), impactAsync: vi.fn(), ImpactFeedbackStyle: {} }));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/SideDragArea', () => ({
    default: ({ children, ...props }: any) => React.createElement('SideDragArea', props, children),
}));
vi.mock('../components/UiGlyphs', () => ({ ChevronDownGlyph: 'ChevronDownGlyph' }));
vi.mock('../hooks/useI18n', () => ({
    useI18n: () => ({ t: (k: string) => k, l: (tr: string) => tr, locale: 'tr', localeTag: 'tr-TR' }),
}));

import { localDayNumber } from './ankiState';
import { resolveStatsDateRange } from './ankiStats';
import {
    buildPairedComparisonBuckets,
    compareSeriesMetrics,
    getDeckComparison,
    getPeriodComparison,
    pickDefaultBaselineDeck,
    resolveDeckComparisonPeriod,
    resolveEqualComparisonPeriods,
    studyDayStartMs,
    summarizeComparisonDays,
} from './statsComparison';
import { DEFAULT_SETTINGS } from './storage';
import ComparisonSection from '../components/stats/ComparisonSection';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

const ROLLOVER = 4;
const at = (year: number, monthIndex: number, day: number, hour: number, minute: number = 0) => (
    new Date(year, monthIndex, day, hour, minute, 0, 0).getTime()
);

beforeAll(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => db.close());

function addDeck(id: number, name: string) {
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        id, name, JSON.stringify({ id, name }),
    );
}

function addCard(id: number, deckId: number) {
    db.runSync(
        'INSERT OR IGNORE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        id, `N${id}`, '', '{}',
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         VALUES (?, ?, ?, 0, 2, 2, 100, 10, 2500, 1, 0, 0, 0, ?, 0, ?, -1, 0)`,
        id, id, deckId, JSON.stringify({ id, noteId: id, deckId }), id,
    );
}

function addReview(id: number, cardId: number, ease: number, time: number = 5000, type: number = 1) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 10, 5, 2500, ?, ?)',
        id, cardId, ease, time, type,
    );
}

describe('equal comparison periods and rollover boundaries', () => {
    it('builds contiguous, equal-length windows with zero gap or overlap for 7, 30 and 90 days', () => {
        const now = at(2026, 10, 19, 14, 0); // 19 Nov 2026 14:00
        for (const [preset, expectedDays] of [['week', 7], ['month', 30], ['threeMonths', 90]] as const) {
            const { current, previous } = resolveEqualComparisonPeriods(preset, ROLLOVER, now);
            expect(current.spanDays).toBe(expectedDays);
            expect(previous.spanDays).toBe(expectedDays);
            expect(current.lastDay - current.firstDay + 1).toBe(expectedDays);
            expect(previous.lastDay - previous.firstDay + 1).toBe(expectedDays);
            expect(previous.lastDay + 1).toBe(current.firstDay);
            expect(previous.endMs).toBe(current.startMs);
        }
    });

    it('respects the rollover hour when deciding which study day owns a timestamp', () => {
        // 03:30 on Nov 19 with rollover 4 still belongs to Nov 18's study day.
        const beforeRollover = at(2026, 10, 19, 3, 30);
        const afterRollover = at(2026, 10, 19, 4, 0);
        const before = resolveEqualComparisonPeriods('week', ROLLOVER, beforeRollover);
        const after = resolveEqualComparisonPeriods('week', ROLLOVER, afterRollover);

        expect(before.current.lastDay).toBe(localDayNumber(at(2026, 10, 18, 12, 0), ROLLOVER));
        expect(after.current.lastDay).toBe(before.current.lastDay + 1);
        expect(after.current.startMs).toBe(studyDayStartMs(after.current.firstDay, ROLLOVER));
        expect(after.previous.endMs).toBe(after.current.startMs);
    });
});

describe('missing-data semantics and deltas', () => {
    it('never reports 0% accuracy or fabricated percent deltas when answers are missing', () => {
        const { current, previous } = resolveEqualComparisonPeriods('week', ROLLOVER, at(2026, 10, 19, 12, 0));
        const primary = summarizeComparisonDays([
            { day: current.lastDay, answers: 20, passed: 17, studyTimeMs: 120_000 },
        ], current);
        const emptyBaseline = summarizeComparisonDays([], previous);

        expect(primary.accuracyPct).toBeCloseTo(85);
        expect(emptyBaseline.answers).toBe(0);
        expect(emptyBaseline.accuracyPct).toBeNull();
        expect(emptyBaseline.secondsPerAnswer).toBeNull();
        expect(emptyBaseline.daily.every((point) => point.accuracyPct === null)).toBe(true);

        const delta = compareSeriesMetrics(primary, emptyBaseline);
        expect(delta.answersDiff).toBe(20);
        expect(delta.answersPctChange).toBeNull();
        expect(delta.studyTimeDiffMs).toBe(120_000);
        expect(delta.studyTimePctChange).toBeNull();
        expect(delta.accuracyDiffPts).toBeNull();
        expect(delta.hasPrimaryData).toBe(true);
        expect(delta.hasBaselineData).toBe(false);
    });

    it('computes weighted accuracy buckets and separates raw counts from percentage-point diffs', () => {
        const { current, previous } = resolveEqualComparisonPeriods('month', ROLLOVER, at(2026, 10, 19, 12, 0));
        // Bucket 0 covers days 0..4: day 0 has 1/1 (100%), day 1 has 0/9 (0%) -> weighted 1/10 = 10%, NOT 50%.
        const primary = summarizeComparisonDays([
            { day: current.firstDay, answers: 1, passed: 1, studyTimeMs: 10_000 },
            { day: current.firstDay + 1, answers: 9, passed: 0, studyTimeMs: 90_000 },
        ], current);
        const baseline = summarizeComparisonDays([
            { day: previous.firstDay, answers: 10, passed: 8, studyTimeMs: 50_000 },
        ], previous);

        const delta = compareSeriesMetrics(primary, baseline);
        expect(delta.answersDiff).toBe(0);
        expect(delta.answersPctChange).toBe(0);
        expect(delta.studyTimeDiffMs).toBe(50_000);
        expect(delta.studyTimePctChange).toBeCloseTo(100);
        expect(delta.accuracyDiffPts).toBeCloseTo(-70);

        const buckets = buildPairedComparisonBuckets(primary, baseline, 'accuracy', 'tr', false);
        expect(buckets).toHaveLength(6); // 30 days / 5 = 6 paired buckets
        expect(buckets[0].primaryValue).toBeCloseTo(10);
        expect(buckets[0].baselineValue).toBeCloseTo(80);
        expect(buckets[0].primaryPassed).toBe(1);
        expect(buckets[0].primaryAnswers).toBe(10);
        // Empty buckets stay null (no data), never 0%.
        expect(buckets[1].primaryValue).toBeNull();
        expect(buckets[1].baselineValue).toBeNull();
    });

    it('picks a distinct regular deck as the default comparison baseline', () => {
        const decks = [
            { name: 'Filtered', isFiltered: true },
            { name: 'TUS', isFiltered: false },
            { name: 'TUS::Dahiliye', isFiltered: false },
            { name: 'Pediatri', isFiltered: false },
        ];
        expect(pickDefaultBaselineDeck(decks, 'TUS')).toBe('Pediatri');
        expect(pickDefaultBaselineDeck(decks, null)).toBe('TUS');
        expect(pickDefaultBaselineDeck([{ name: 'TUS', isFiltered: false }], 'TUS')).toBeNull();
    });
});

describe('SQLite period and deck comparisons', () => {
    it('assigns rollover-edge answers to the exact study period and excludes manual reschedules', () => {
        addDeck(10, 'TUS');
        addDeck(11, 'TUS::Dahiliye');
        addDeck(12, 'tus'); // case-sensitive distinct deck
        addCard(1, 10);
        addCard(2, 11);
        addCard(3, 12);

        const now = at(2026, 10, 19, 15, 0);
        // Current 7-day window with rollover=4: Nov 13 04:00 .. Nov 20 04:00.
        // Previous 7-day window: Nov 6 04:00 .. Nov 13 04:00.
        addReview(at(2026, 10, 13, 4, 0), 1, 3, 6_000);   // exact start of current week (pass)
        addReview(at(2026, 10, 19, 10, 0), 2, 1, 4_000);  // inside TUS subtree, current week (fail)
        addReview(at(2026, 10, 19, 11, 0), 1, 0, 99_000, 4); // manual entry -> must be excluded
        addReview(at(2026, 10, 13, 3, 59), 1, 3, 8_000);  // 1 minute before current week -> previous week!
        addReview(at(2026, 10, 6, 4, 0), 2, 4, 12_000);   // exact start of previous week (pass)
        addReview(at(2026, 10, 6, 3, 59), 1, 3, 20_000);  // before previous week -> excluded
        addReview(at(2026, 10, 19, 12, 0), 3, 3, 5_000);  // lowercase 'tus' -> excluded from 'TUS'

        const result = getPeriodComparison({
            deckName: 'TUS',
            preset: 'week',
            rolloverHour: ROLLOVER,
            nowMs: now,
        });

        expect(result.current.answers).toBe(2);
        expect(result.current.passed).toBe(1);
        expect(result.current.studyTimeMs).toBe(10_000);
        expect(result.current.accuracyPct).toBeCloseTo(50);
        expect(result.current.studiedDays).toBe(2);

        expect(result.previous.answers).toBe(2);
        expect(result.previous.passed).toBe(2);
        expect(result.previous.studyTimeMs).toBe(20_000);
        expect(result.previous.accuracyPct).toBeCloseTo(100);
        expect(result.previous.studiedDays).toBe(2);

        expect(result.delta.answersDiff).toBe(0);
        expect(result.delta.studyTimeDiffMs).toBe(-10_000);
        expect(result.delta.studyTimePctChange).toBeCloseTo(-50);
        expect(result.delta.accuracyDiffPts).toBeCloseTo(-50);
    });

    it('compares two decks over the identical date range and handles all-time bounds', () => {
        addDeck(10, 'Dahiliye');
        addDeck(20, 'Pediatri');
        addCard(1, 10);
        addCard(2, 20);

        const now = at(2026, 10, 19, 15, 0);
        addReview(at(2026, 10, 18, 10, 0), 1, 3, 6_000);
        addReview(at(2026, 10, 18, 10, 1), 1, 3, 4_000);
        addReview(at(2026, 10, 18, 11, 0), 2, 1, 5_000);
        addReview(at(2025, 0, 5, 10, 0), 2, 3, 7_000); // older than 7d

        const weekRange = resolveStatsDateRange('week', new Date(now), new Date(now), ROLLOVER, now);
        const weekComparison = getDeckComparison({
            primaryDeckName: 'Dahiliye',
            baselineDeckName: 'Pediatri',
            range: weekRange,
            rolloverHour: ROLLOVER,
        });

        expect(weekComparison.bounds.spanDays).toBe(7);
        expect(weekComparison.primary.answers).toBe(2);
        expect(weekComparison.primary.accuracyPct).toBeCloseTo(100);
        expect(weekComparison.baseline.answers).toBe(1);
        expect(weekComparison.baseline.accuracyPct).toBeCloseTo(0);
        expect(weekComparison.delta.accuracyDiffPts).toBeCloseTo(100);

        const allRange = resolveStatsDateRange('all', new Date(now), new Date(now), ROLLOVER, now);
        const allBounds = resolveDeckComparisonPeriod(allRange, ROLLOVER);
        expect(allBounds.spanDays).toBeNull();
        const allComparison = getDeckComparison({
            primaryDeckName: 'Dahiliye',
            baselineDeckName: 'Pediatri',
            range: allRange,
            rolloverHour: ROLLOVER,
        });
        expect(allComparison.baseline.answers).toBe(2);
        expect(allComparison.baseline.passed).toBe(1);
        expect(allComparison.baseline.accuracyPct).toBeCloseTo(50);
    });
});


it('renders measured zero accuracy and time while keeping the answer denominator visible', () => {
    addDeck(10, 'Dahiliye'); addCard(1, 10);
    const now = Date.now(); addReview(now - 60_000, 1, 1, 0);
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(ComparisonSection, {
        deckScope: 'Dahiliye', statsRange: resolveStatsDateRange('week', new Date(now), new Date(now), ROLLOVER, now), rangeTitle: 'Week',
        decks: [{ id: 10, name: 'Dahiliye', isFiltered: false }] as any,
        settings: { ...DEFAULT_SETTINGS, dayRolloverHour: ROLLOVER }, dataRevision: 1, retryNonce: 0,
        comparePrimaryDeck: undefined, compareBaselineDeck: undefined, onRequestPickDeck: vi.fn(),
    })); });
    try {
        const spoken = tree.root.findAll((node) => (node.type as unknown) === 'View' && typeof node.props.accessibilityLabel === 'string').map((node) => node.props.accessibilityLabel);
        expect(spoken.some((value) => value.includes('Doğruluk:') && value.includes('(0 / 1)'))).toBe(true);
        for (const metric of ['accuracy', 'time']) {
            act(() => tree.root.findAllByType('SegmentedControl' as any).find((node) => node.props.accessibilityLabel === 'Grafik ölçüsü')!.props.onChange(metric));
            const chart = tree.root.findByType('ComparisonBarChart' as any);
            expect(chart.props.buckets.some((bucket: any) => bucket.primaryAnswers === 1 && bucket.primaryValue === 0)).toBe(true);
        }
    } finally { act(() => tree.unmount()); }
});

it('opens comparison deck selection as a local operation without mutating the main scope', () => {
    addDeck(10, 'Dahiliye'); addDeck(11, 'Anatomi');
    const pick = vi.fn(); let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(ComparisonSection, {
        deckScope: 'Dahiliye', statsRange: resolveStatsDateRange('week', new Date(), new Date(), ROLLOVER), rangeTitle: 'Week',
        decks: [{ id: 10, name: 'Dahiliye' }, { id: 11, name: 'Anatomi' }] as any,
        settings: { ...DEFAULT_SETTINGS, dayRolloverHour: ROLLOVER }, dataRevision: 1, retryNonce: 0,
        comparePrimaryDeck: undefined, compareBaselineDeck: undefined, onRequestPickDeck: pick,
    })); });
    try {
        act(() => tree.root.findAllByType('SegmentedControl' as any).find((node) => node.props.accessibilityLabel === 'Karşılaştırma türü')!.props.onChange('deck'));
        const second = tree.root.findAllByType('SelectRow' as any).find((node) => node.props.label === 'İkinci deste')!;
        expect(second.props.value).toBe('Anatomi'); act(() => second.props.onPress());
        expect(pick).toHaveBeenCalledExactlyOnceWith('baseline', 'Anatomi');
        expect(tree.root.findByType(ComparisonSection).props.deckScope).toBe('Dahiliye');
    } finally { act(() => tree.unmount()); }
});
