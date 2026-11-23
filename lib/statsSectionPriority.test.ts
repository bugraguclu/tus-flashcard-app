import { performance } from 'node:perf_hooks';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    platformOs: 'ios' as 'ios' | 'web',
    screenReaderEnabled: false,
    screenReaderListener: null as ((enabled: boolean) => void) | null,
}));

vi.mock('react-native', () => {
    class AnimatedValue {
        _value: number;
        constructor(initial: number) { this._value = initial; }
        setValue = vi.fn();
        interpolate = () => ({});
    }
    return {
        Platform: {
            get OS() { return h.platformOs; },
            select: (spec: any) => spec[h.platformOs] ?? spec.default,
        },
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
        ScrollView: 'ScrollView',
        TouchableOpacity: 'TouchableOpacity',
        Pressable: 'Pressable',
        Modal: 'Modal',
        PanResponder: { create: () => ({ panHandlers: {} }) },
        useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
        AccessibilityInfo: {
            isScreenReaderEnabled: () => Promise.resolve(h.screenReaderEnabled),
            isReduceMotionEnabled: () => Promise.resolve(false),
            addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
                h.screenReaderListener = listener;
                return { remove: () => { h.screenReaderListener = null; } };
            },
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
    Circle: 'Circle',
    Polyline: 'Polyline',
    Text: 'SvgText',
}));
vi.mock('../components/PressableScale', () => ({ default: 'PressableScale' }));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(), impactAsync: vi.fn(), ImpactFeedbackStyle: {} }));
vi.mock('react-native-safe-area-context', () => ({
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-gesture-handler', () => ({
    GestureHandlerRootView: 'GestureHandlerRootView',
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => ({ onBegin: () => ({}), onUpdate: () => ({}), onEnd: () => ({}) }) },
}));
vi.mock('../components/BottomSheetModal', () => ({ default: () => null }));
vi.mock('expo-router', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: () => true }),
    useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/SideDragArea', () => ({
    default: ({ children, ...props }: any) => React.createElement('SideDragArea', props, children),
}));
vi.mock('../components/WeekStreakStrip', () => ({ default: () => React.createElement('WeekStreakStrip') }));
vi.mock('../hooks/useI18n', () => ({
    useI18n: () => ({ t: (k: string) => k, l: (tr: string) => tr, locale: 'tr', localeTag: 'tr-TR' }),
}));

import {
    collectNewlyVisibleSections,
    EAGER_STATS_SECTIONS,
    shouldMountStatsSection,
    STATS_SECTION_ESTIMATED_HEIGHTS,
    type StatsSectionId,
} from './statsSectionPriority';
import LazyStatsSection, {
    StatsSectionPriorityProvider,
    useStatsSectionPriority,
} from '../components/stats/LazyStatsSection';
import TodaySection from '../components/stats/TodaySection';
import ReviewsSection from '../components/stats/ReviewsSection';
import FutureDueSection from '../components/stats/FutureDueSection';
import AnswerButtonsSection from '../components/stats/AnswerButtonsSection';
import TrueRetentionSection from '../components/stats/TrueRetentionSection';
import CardCountsSection from '../components/stats/CardCountsSection';
import IntervalsSection from '../components/stats/IntervalsSection';
import HourlySection from '../components/stats/HourlySection';
import AddedSection from '../components/stats/AddedSection';
import DeckProgressSection from '../components/stats/DeckProgressSection';
import { ChartScrollLockProvider } from '../components/stats/ChartScrollLock';

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    h.platformOs = 'ios';
    h.screenReaderEnabled = false;
    h.screenReaderListener = null;
});

describe('stats section priority planner', () => {
    it('defers below-the-fold sections until they enter the viewport + rootMargin window', () => {
        const base = { scrollY: 0, viewportHeight: 800, rootMargin: 420, screenReaderEnabled: false };
        expect(shouldMountStatsSection({ ...base, eager: true, mounted: false, layoutY: 3000 })).toBe(true);
        expect(shouldMountStatsSection({ ...base, eager: false, mounted: false, layoutY: null })).toBe(false);
        expect(shouldMountStatsSection({ ...base, eager: false, mounted: false, layoutY: 1220 })).toBe(true);
        expect(shouldMountStatsSection({ ...base, eager: false, mounted: false, layoutY: 1221 })).toBe(false);
        // Once mounted, stays mounted even after scrolling back up.
        expect(shouldMountStatsSection({ ...base, eager: false, mounted: true, layoutY: 2500 })).toBe(true);
    });

    it('mounts all sections immediately when VoiceOver / screen reader is enabled', () => {
        const ids: StatsSectionId[] = ['today', 'reviews', 'futureDue', 'hourly', 'added'];
        const layouts = new Map<StatsSectionId, number>([['futureDue', 1800], ['hourly', 2900], ['added', 3500]]);
        const mounted = new Set<StatsSectionId>(['today', 'reviews']);

        expect(collectNewlyVisibleSections(ids, layouts, mounted, EAGER_STATS_SECTIONS, {
            scrollY: 0,
            viewportHeight: 800,
            rootMargin: 420,
            screenReaderEnabled: false,
        })).toEqual([]);

        expect(collectNewlyVisibleSections(ids, layouts, mounted, EAGER_STATS_SECTIONS, {
            scrollY: 0,
            viewportHeight: 800,
            rootMargin: 420,
            screenReaderEnabled: true,
        })).toEqual(['futureDue', 'hourly', 'added']);
    });
});

describe('LazyStatsSection runtime behavior (iOS + Web + VoiceOver)', () => {
    const IDS: readonly StatsSectionId[] = ['today', 'futureDue', 'hourly'];
    const EAGER = new Set<StatsSectionId>(['today']);

    function Harness({ onMount }: { onMount: (id: StatsSectionId) => void }) {
        const ctrl = useStatsSectionPriority(IDS, EAGER);
        const section = (props: React.ComponentProps<typeof LazyStatsSection>) => React.createElement(
            'View',
            { onLayout: (event: any) => ctrl.contextValue.registerSectionY(props.id, event.nativeEvent.layout.y) },
            React.createElement(LazyStatsSection, props),
        );
        return React.createElement(StatsSectionPriorityProvider, {
            value: ctrl.contextValue,
            children: React.createElement(
                'ScrollView' as any,
                { onLayout: ctrl.onScrollViewLayout, onScroll: ctrl.onScroll },
                React.createElement(
                    'View' as any,
                    { testID: 'body', onLayout: ctrl.onBodyLayout },
                    section({
                        id: 'today',
                        title: 'Bugün',
                        estimatedHeight: 260,
                        eager: true,
                        children: () => {
                            onMount('today');
                            return React.createElement('View', { testID: 'mounted-today' });
                        },
                    }),
                    section({
                        id: 'futureDue',
                        title: 'Gelecek vadeler',
                        estimatedHeight: 360,
                        children: () => {
                            onMount('futureDue');
                            return React.createElement('View', { testID: 'mounted-futureDue' });
                        },
                    }),
                    section({
                        id: 'hourly',
                        title: 'Saatlik dağılım',
                        estimatedHeight: 430,
                        children: () => {
                            onMount('hourly');
                            return React.createElement('View', { testID: 'mounted-hourly' });
                        },
                    }),
                ),
            ),
        });
    }

    it('mounts lower sections on demand as iOS ScrollView scrolls near them and never unmounts them', () => {
        const mounted: StatsSectionId[] = [];
        let tree!: TestRenderer.ReactTestRenderer;
        act(() => {
            tree = TestRenderer.create(React.createElement(Harness, { onMount: (id) => mounted.push(id) }));
        });

        const scrollView = tree.root.findByType('ScrollView' as any);
        const body = tree.root.findByProps({ testID: 'body' });
        const lazyWrappers = tree.root.findAllByType(LazyStatsSection);

        const layoutFor = (wrapper: TestRenderer.ReactTestInstance, y: number, height: number) => {
            wrapper.parent!.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 390, height } } });
        };

        act(() => {
            scrollView.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 800 } } });
            body.props.onLayout({ nativeEvent: { layout: { x: 0, y: 100, width: 390, height: 2600 } } });
            layoutFor(lazyWrappers[0], 0, 260);
            layoutFor(lazyWrappers[1], 1500, 360);
            layoutFor(lazyWrappers[2], 2400, 430);
        });

        // Only eager 'today' is mounted initially; placeholders keep section titles and minHeight.
        expect(tree.root.findAllByProps({ testID: 'mounted-today' })).toHaveLength(1);
        expect(tree.root.findAllByProps({ testID: 'mounted-futureDue' })).toHaveLength(0);
        expect(tree.root.findAllByProps({ testID: 'mounted-hourly' })).toHaveLength(0);

        // Scroll to y=500 -> bottom+margin = 500 + 800 + 420 = 1720 >= 100 + 1500 = 1600 -> futureDue mounts!
        act(() => {
            scrollView.props.onScroll({
                nativeEvent: { contentOffset: { x: 0, y: 500 }, layoutMeasurement: { width: 390, height: 800 } },
            });
        });
        expect(tree.root.findAllByProps({ testID: 'mounted-futureDue' })).toHaveLength(1);
        expect(tree.root.findAllByProps({ testID: 'mounted-hourly' })).toHaveLength(0);

        // Scroll back to top -> futureDue remains mounted (monotonic).
        act(() => {
            scrollView.props.onScroll({
                nativeEvent: { contentOffset: { x: 0, y: 0 }, layoutMeasurement: { width: 390, height: 800 } },
            });
        });
        expect(tree.root.findAllByProps({ testID: 'mounted-futureDue' })).toHaveLength(1);

        // Enabling VoiceOver mounts every remaining section immediately.
        act(() => {
            h.screenReaderListener?.(true);
        });
        expect(tree.root.findAllByProps({ testID: 'mounted-hourly' })).toHaveLength(1);
        act(() => tree.unmount());
    });

    it('keeps the complete Web reading order without assuming a detectable screen reader', () => {
        h.platformOs = 'web';
        let tree!: TestRenderer.ReactTestRenderer;
        act(() => { tree = TestRenderer.create(React.createElement(Harness, { onMount: () => {} })); });
        expect(tree.root.findAllByProps({ testID: 'mounted-today' })).toHaveLength(1);
        expect(tree.root.findAllByProps({ testID: 'mounted-futureDue' })).toHaveLength(1);
        expect(tree.root.findAllByProps({ testID: 'mounted-hourly' })).toHaveLength(1);
        expect(h.screenReaderListener).toBeNull();
        act(() => tree.unmount());
    });
});

function buildLargeSnapshot() {
    const today = 20776;
    return {
        ankiStats: {
            futureDue: Array.from({ length: 30 }, (_, i) => ({ label: `G${i}`, detail: `Gün ${i}`, values: [20, 40] })),
            futureDueTotal: 1800,
            futureDueTodayIndex: 0,
            futureDueWithBacklog: Array.from({ length: 36 }, (_, i) => ({ label: `G${i}`, detail: `Gün ${i}`, values: [15, 35] })),
            futureDueWithBacklogTotal: 1900,
            futureDueWithBacklogTodayIndex: 6,
            futureDueBacklogTotal: 100,
            backlogTotal: 100,
            dueTomorrow: 80,
            dailyLoad: 90,
            answerButtons: [1, 2, 3, 4].map((ease) => ({ ease: ease as 1 | 2 | 3 | 4, learning: 100, young: 200, mature: 300 })),
            intervals: Array.from({ length: 24 }, (_, i) => ({ firstIvl: i * 14 + 1, lastIvl: (i + 1) * 14, count: 100 })),
            intervalsBeyondRange: 20,
            averageInterval: 50,
            longestInterval: 365,
            cardCounts: { mature: 2000, youngLearn: 1000, unseen: 500, suspendedBuried: 50, totalCards: 3550, totalNotes: 3000 },
            trueRetention: {
                rows: (['today', 'yesterday', 'week', 'month', 'year', 'all'] as const).map((period) => ({
                    period,
                    young: { passed: 200, failed: 30 },
                    mature: { passed: 500, failed: 40 },
                })),
            },
        },
        todayStats: { reviewed: 100, passed: 90, failed: 10, newCardsIntroduced: 15, studyTimeMs: 600_000 },
        streak: { current: 14, studiedToday: true, best: 30 },
        reviewDays: Array.from({ length: 365 }, (_, i) => ({
            day: today - 364 + i,
            learn: 10, relearn: 3, young: 30, mature: 50, filtered: 2,
            learnMs: 60_000, relearnMs: 20_000, youngMs: 180_000, matureMs: 300_000, filteredMs: 10_000,
        })),
        addedDays: Array.from({ length: 365 }, (_, i) => ({ day: today - 364 + i, count: 5 })),
        hours: Array.from({ length: 24 }, (_, hour) => ({ hour, total: 100, correct: 85 })),
        deckStats: Array.from({ length: 12 }, (_, i) => ({
            name: `TUS::Ders${i}`, displayName: `Ders ${i}`, total: 300,
            newCount: 50, learningCount: 10, youngCount: 90, matureCount: 150, studied: 250, pct: 83,
        })),
        currentWeekStudiedDays: new Set<string>(),
    };
}

function countNodes(node: any): number {
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) return node.reduce((sum, child) => sum + countNodes(child), 0);
    let total = 1;
    if (node.children) for (const child of node.children) total += countNodes(child);
    return total;
}

describe('measured initial render benefit on a large collection', () => {
    it('reduces initial rendered element count by more than 60% when below-the-fold charts wait for visibility', () => {
        const snapshot = buildLargeSnapshot();
        const today = 20776;
        const firstDay = today - 364;
        const ALL: readonly StatsSectionId[] = [
            'today', 'reviews', 'futureDue', 'answerButtons', 'trueRetention',
            'cardCounts', 'intervals', 'hourly', 'added', 'deckProgress',
        ];
        const EAGER = new Set<StatsSectionId>(['today', 'reviews']);

        const renderBody = (prioritized: boolean) => {
            function Wrapper() {
                const ctrl = useStatsSectionPriority(ALL, prioritized ? EAGER : new Set(ALL));
                return React.createElement(
                    ChartScrollLockProvider,
                    { value: () => {} },
                    React.createElement(StatsSectionPriorityProvider, {
                        value: ctrl.contextValue,
                        children: React.createElement(
                            React.Fragment,
                            null,
                            React.createElement(TodaySection, { today: snapshot.todayStats, streak: snapshot.streak, rolloverHour: 4, dataVersion: 1, currentWeekStudiedDays: snapshot.currentWeekStudiedDays }),
                            React.createElement(ReviewsSection, { reviewDays: snapshot.reviewDays, firstDay, lastDay: today, rangeTitle: 'Son 1 yıl' }),
                            React.createElement(LazyStatsSection, { id: 'futureDue', title: 'Gelecek vadeler', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.futureDue, children: () => React.createElement(FutureDueSection, { stats: snapshot.ankiStats }) }),
                            React.createElement(LazyStatsSection, { id: 'answerButtons', title: 'Cevap düğmeleri', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.answerButtons, children: () => React.createElement(AnswerButtonsSection, { buttons: snapshot.ankiStats.answerButtons }) }),
                            React.createElement(LazyStatsSection, { id: 'trueRetention', title: 'Gerçek Hatırlama', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.trueRetention, children: () => React.createElement(TrueRetentionSection, { table: snapshot.ankiStats.trueRetention }) }),
                            React.createElement(LazyStatsSection, { id: 'cardCounts', title: 'Kart durumu', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.cardCounts, children: () => React.createElement(CardCountsSection, { counts: snapshot.ankiStats.cardCounts }) }),
                            React.createElement(LazyStatsSection, { id: 'intervals', title: 'Tekrar aralıkları', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.intervals, children: () => React.createElement(IntervalsSection, { stats: snapshot.ankiStats, rangeTitle: 'Son 1 yıl' }) }),
                            React.createElement(LazyStatsSection, { id: 'hourly', title: 'Saatlik dağılım', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.hourly, children: () => React.createElement(HourlySection, { hours: snapshot.hours, rangeTitle: 'Son 1 yıl' }) }),
                            React.createElement(LazyStatsSection, { id: 'added', title: 'Eklenenler', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.added, children: () => React.createElement(AddedSection, { addedDays: snapshot.addedDays, firstDay, lastDay: today, rangeTitle: 'Son 1 yıl', onOpenCards: () => {} }) }),
                            React.createElement(LazyStatsSection, { id: 'deckProgress', title: 'Desteler', estimatedHeight: STATS_SECTION_ESTIMATED_HEIGHTS.deckProgress, children: () => React.createElement(DeckProgressSection, { title: 'Desteler', decks: snapshot.deckStats, onSelectDeck: () => {} }) }),
                        ),
                    }),
                );
            }
            let tree!: TestRenderer.ReactTestRenderer;
            const t0 = performance.now();
            act(() => { tree = TestRenderer.create(React.createElement(Wrapper)); });
            const views = tree.root.findAll((node) => typeof node.props?.onLayout === 'function');
            act(() => {
                for (const v of views) {
                    v.props.onLayout({ nativeEvent: { layout: { x: 0, y: 2000, width: 358, height: 220 } } });
                }
            });
            const ms = performance.now() - t0;
            const nodes = countNodes(tree.toJSON());
            act(() => tree.unmount());
            return { ms, nodes };
        };

        const eager = renderBody(false);
        const prioritized = renderBody(true);
        expect(prioritized.nodes).toBeLessThan(eager.nodes * 0.4);
    });
});
