// Statistics: a deck tapped in the Decks list at the foot of the page opens as a page of its own,
// so going back returns to the page it was tapped on; the deck selector at the top still filters
// the page in place.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    params: {} as Record<string, string>,
    pushed: [] as unknown[],
    previousRoute: undefined as string | undefined,
    loadedDecks: [] as Array<string | null>,
}));

vi.mock('react-native', () => {
    const value = { start: () => {} };
    return {
        Platform: { OS: 'ios' },
        View: 'View', ScrollView: 'ScrollView',
        useWindowDimensions: () => ({ width: 390, height: 844 }),
        Animated: {
            Value: class { constructor() { return value; } },
            timing: () => value,
            View: 'AnimatedView',
            ScrollView: 'ScrollView',
        },
    };
});
vi.mock('react-native-safe-area-context', () => ({
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => {
    const router = { push: (href: unknown) => { h.pushed.push(href); }, back: () => {}, replace: () => {}, canGoBack: () => true };
    return {
        useRouter: () => router,
        useLocalSearchParams: () => h.params,
        useFocusEffect: () => {},
    };
});
vi.mock('expo-router/react-navigation', () => ({
    useNavigationState: (select: (state: { index: number; routes: Array<{ name: string }> }) => unknown) => select({
        index: 1,
        routes: [{ name: h.previousRoute ?? '(tabs)' }, { name: 'stats' }],
    }),
}));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
    Spacing: new Proxy({}, { get: () => 8 }),
}));
vi.mock('../constants/motion', () => ({ MotionDuration: { fade: 0 }, MotionEasing: { out: (t: number) => t }, NATIVE_DRIVER: true }));
vi.mock('./studyDataSettings', () => ({ studyDataSettingsKey: () => 'settings' }));
vi.mock('./deckManager', () => ({ createOrSelectDeck: (name: string) => ({ name }) }));
vi.mock('../contexts/AppContext', () => {
    const settings = { settings: { dayRolloverHour: 4 } };
    const collection = { collectionVersion: 0, invalidateCollection: () => {}, getSchedulingRevision: () => 0 };
    return {
        useAppSettings: () => settings,
        useCollectionInvalidation: () => collection,
        useStudyScope: () => ({ activeDeckName: null }),
    };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr, localeTag: 'tr-TR' }) }));
vi.mock('../hooks/useDeferredScreenSnapshot', () => ({
    useDeferredScreenSnapshot: (_key: string, load: () => unknown) => ({ snapshot: load(), loading: false, error: null }),
}));
vi.mock('./db', () => ({ getDB: () => ({ getFirstSync: () => null }) }));
vi.mock('./screenSnapshots', () => ({
    getStatsScreenSnapshot: ({ deckName }: { deckName: string | null }) => {
        h.loadedDecks.push(deckName);
        return {
            scopeDeckName: deckName, scopeRange: { startMs: 0, endMs: 0, spanDays: 365 }, failedSections: [],
            reviewDays: [], addedDays: [], decks: [{ name: 'Fizyoloji' }],
            todayStats: {}, streak: {}, currentWeekStudiedDays: [], hours: [],
            ankiStats: { answerButtons: {}, cardCounts: {}, trueRetention: {} },
            deckStats: [{ name: 'Fizyoloji' }, { name: 'Patoloji' }],
        };
    },
}));
vi.mock('./ankiStats', () => ({
    getAddedCardDeckNames: () => [],
    rangeStudyDays: () => ({ firstDay: 0, lastDay: 0 }),
    resolveStatsDateRange: () => ({ startMs: 0, endMs: 0, spanDays: 365 }),
}));
vi.mock('../components/stats/statsScreenStyles', () => ({ createStatsScreenStyles: () => new Proxy({}, { get: () => ({}) }) }));
vi.mock('../components/PullToRefresh', () => ({
    usePullToRefresh: () => ({ scrollProps: {} }),
    PullToRefreshIndicator: () => null,
}));
vi.mock('../components/stats/ChartScrollLock', () => ({
    ChartScrollLockProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// The design-system parts render as plain hosts carrying the props this screen gives them.
vi.mock('../components/ScreenHeader', () => ({
    default: (props: Record<string, unknown>) => React.createElement('ScreenHeader', props),
}));
vi.mock('../components/ui/Button', () => ({ HelpButton: () => null, Button: 'Button' }));
vi.mock('../components/ui/Card', () => ({ Card: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../components/ui/Feedback', () => ({ LoadingState: () => null, Notice: () => null }));
vi.mock('../components/ui/Rows', () => ({
    SelectRow: (props: Record<string, unknown>) => React.createElement('SelectRow', props),
}));
vi.mock('../components/ui/Choice', () => ({
    SegmentedControl: ({ value }: { value: string }) => React.createElement('Segmented', { value }),
}));
vi.mock('../hooks/useLiveTodayPlan', () => ({ useLiveTodayPlan: () => null }));
vi.mock('../components/stats/ComparisonSection', () => ({ default: () => null }));
vi.mock('../components/stats/StatsLayoutEditor', () => ({ StatsEditableCard: ({ children }: any) => children, StatsLayoutToolbar: () => null }));
vi.mock('../components/ReadErrorBanner', () => ({ ReadErrorBanner: 'ReadErrorBanner', SectionReadErrorCard: 'SectionReadErrorCard' }));
vi.mock('../components/stats/LazyStatsSection', () => ({ default: ({ children }: any) => children(), StatsSectionPriorityProvider: ({ children }: any) => children, useStatsSectionPriority: () => ({ contextValue: { registerSectionY: () => {} }, onScroll: () => {}, onBodyLayout: () => {}, onScrollViewLayout: () => {} }) }));
vi.mock('../components/stats/StatsHelpSheet', () => ({ default: () => null }));
vi.mock('../components/stats/TodaySection', () => ({ default: () => null }));
vi.mock('../components/stats/ReviewsSection', () => ({ default: () => null }));
vi.mock('../components/stats/FutureDueSection', () => ({ default: () => null }));
vi.mock('../components/stats/AnswerButtonsSection', () => ({ default: () => null }));
vi.mock('../components/stats/CardCountsSection', () => ({ default: () => null }));
vi.mock('../components/stats/TrueRetentionSection', () => ({ default: () => null }));
vi.mock('../components/stats/IntervalsSection', () => ({ default: () => null }));
vi.mock('../components/stats/HourlySection', () => ({ default: () => null }));
vi.mock('../components/stats/AddedSection', () => ({ default: () => null }));
vi.mock('../components/stats/DeckProgressSection', () => ({
    default: ({ decks, onSelectDeck }: { decks: Array<{ name: string }>; onSelectDeck: (name: string) => void }) => (
        React.createElement('View', null, decks.map((deck) => (
            React.createElement('DeckRow', { key: deck.name, name: deck.name, onPress: () => onSelectDeck(deck.name) })
        )))
    ),
}));
vi.mock('../components/DeckPickerModal', () => ({
    default: ({ onSelect }: { onSelect: (name: string | null) => void }) => React.createElement('DeckPicker', { onSelect }),
}));

import StatsScreen from '../app/stats';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    h.params = {};
    h.pushed = [];
    h.previousRoute = undefined;
    h.loadedDecks = [];
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

function mount() {
    act(() => { renderer = TestRenderer.create(React.createElement(StatsScreen)); });
}

const isHost = (node: ReactTestInstance, name: string) => (node.type as unknown) === name;
const deckRow = (name: string) => renderer!.root.find((node) => isHost(node, 'DeckRow') && node.props.name === name);
const deckSelector = () => renderer!.root.find((node) => (
    isHost(node, 'SelectRow') && String(node.props.accessibilityLabel).startsWith('İstatistik destesi')
));
const backLabel = () => renderer!.root.find((node) => isHost(node, 'ScreenHeader')).props.backAccessibilityLabel;
const range = () => renderer!.root.find((node) => isHost(node, 'Segmented')).props.value;

describe('Statistics decks list', () => {
    it('opens a tapped deck as a page of its own, keeping the period, and leaves this page as it was', () => {
        h.params = { range: 'month' };
        mount();

        act(() => deckRow('Patoloji').props.onPress());

        expect(h.pushed).toEqual([{ pathname: '/stats', params: { deck: 'Patoloji', range: 'month' } }]);
        expect(deckSelector().props.accessibilityLabel).toBe('İstatistik destesi: Tüm koleksiyon');
        expect(h.loadedDecks.every((deck) => deck === null)).toBe(true);
    });

    it('opens on the deck and period it was handed, and on a year for a period it does not know', () => {
        h.params = { deck: 'Fizyoloji::Hücre', range: 'week' };
        mount();
        expect(deckSelector().props.accessibilityLabel).toBe('İstatistik destesi: Fizyoloji › Hücre');
        expect(range()).toBe('week');

        act(() => renderer?.unmount());
        h.params = { range: 'decade' };
        mount();
        expect(range()).toBe('year');
    });

    it('names the Statistics page it returns to when it was opened from one', () => {
        h.previousRoute = 'stats';
        h.params = { deck: 'Patoloji' };
        mount();
        expect(backLabel()).toBe('İstatistiklere dön');

        act(() => renderer?.unmount());
        h.previousRoute = 'deck-overview';
        mount();
        expect(backLabel()).toBe('Deste genel bakışına dön');
    });
});

describe('Statistics deck selector', () => {
    it('still filters this page in place instead of opening another', () => {
        mount();
        act(() => deckSelector().props.onPress());
        act(() => renderer!.root.find((node) => isHost(node, 'DeckPicker')).props.onSelect('Fizyoloji'));

        expect(h.pushed).toEqual([]);
        expect(deckSelector().props.accessibilityLabel).toBe('İstatistik destesi: Fizyoloji');
        expect(h.loadedDecks).toContain('Fizyoloji');
    });
});
