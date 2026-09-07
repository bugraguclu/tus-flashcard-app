import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    Switch,
    InteractionManager,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { compileCardMatcher } from '../lib/cardSearchMatch';
import { localDayNumber, nextRolloverMs, ymdToLocalDayNumber } from '../lib/ankiState';
import { useAppSettings, useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import type { CardState, StudyCard } from '../lib/types';
import { FLAG_COLORS, isLegacyTusNoteType, type CardFlag, type Note } from '../lib/models';
import {
    getBrowserCards,
    setCardSuspended,
    type BrowserCardQuery,
    type BrowserCardSortKey,
    type BrowserTableMode,
} from '../lib/studyRepository';
import { humanizeCardText } from '../lib/displayText';
import { useI18n } from '../hooks/useI18n';
import type { SupportedLocale } from '../lib/i18n';
import { cardFlagName } from '../lib/i18n';
import { localizeNoteTypeName } from '../lib/i18n';
import {
    createDeck,
    getAvailableDeckName,
    getDeck,
    getDeckByName,
} from '../lib/deckManager';
import { useRouteDeckScope } from '../hooks/useRouteDeckScope';
import {
    changeNotesType,
    deleteNote,
    getAllTags,
    moveCardsToDeck,
    setCardFlag,
    undoCardsMovedToDeck,
    updateNotesTags,
    type CardDeckMoveSnapshot,
} from '../lib/noteManager';
import { getDbSetting, setDbSetting } from '../lib/storage';
import TagPickerModal from '../components/TagPickerModal';
import CardWebView from '../components/CardWebView';
import DeckPickerModal from '../components/DeckPickerModal';
import SwipeDismissSheet from '../components/SwipeDismissSheet';
import { alert, confirm } from '../lib/confirm';
import { isCatalogCard, isCatalogDeck, isCatalogNote } from '../lib/catalogProtection';
import { useScreenGuard } from '../hooks/useScreenGuard';
import ProtectedContentShield from '../components/ProtectedContentShield';
import { userFacingErrorMessage } from '../lib/userFacingError';
import {
    expandSelectedCardsToNotes,
    gradeSelectedNow,
    parseDueRange,
    repositionSelectedNewCards,
    resetSelectedProgress,
    setSelectedDueDate,
    toggleSelectedBury,
    toggleSelectedSuspend,
} from '../lib/browserSelection';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import {
    getBrowserScopeSnapshot,
    getBrowserScreenSnapshot,
    type BrowserScopeSnapshot,
} from '../lib/screenSnapshots';
import {
    LatestSnapshotGeneration,
    ScreenSnapshotRepository,
} from '../lib/screenSnapshotLoader';

const BROWSER_SORT_KEYS: BrowserCardSortKey[] = [
    'sortField',
    'cardType',
    'due',
    'deck',
    'created',
    'modified',
    'interval',
    'ease',
    'lapses',
    'reviews',
];

function readBrowserBoolean(key: string, fallback: boolean): boolean {
    const stored = getDbSetting(key);
    if (stored == null) return fallback;
    return stored === '1';
}

function readBrowserSortKey(): BrowserCardSortKey {
    const stored = getDbSetting('browser_sort_key') as BrowserCardSortKey | null;
    return stored && BROWSER_SORT_KEYS.includes(stored) ? stored : 'sortField';
}

function readBrowserTableMode(): BrowserTableMode {
    return getDbSetting('browser_table_mode') === 'notes' ? 'notes' : 'cards';
}

const BROWSER_PAGE_SIZE = 200;
const ALL_CARD_FLAGS: CardFlag[] = [0, 1, 2, 3, 4, 5, 6, 7];

function SearchIcon({ color }: { color: string }) {
    return (
        <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={1.8} />
            <Path d="M15.4 15.4 21 21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
    );
}

function SelectionDeckIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"
                stroke={color}
                strokeWidth={1.8}
            />
            <Path
                d="M8 9h8M8 13h8M8 17h5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
        </Svg>
    );
}

function SelectionSuspendIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M7 5a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 11 5v14a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 19V5zm6 0a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5V5z"
                fill={color}
            />
        </Svg>
    );
}

function SelectionFlagIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
                d="M5 21V4m0 1h12.5a1 1 0 0 1 .8 1.6L16.2 9.5l2.1 2.9a1 1 0 0 1-.8 1.6H5"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={color}
            />
        </Svg>
    );
}

function SelectionMoreIcon({ color }: { color: string }) {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={5} r={2} fill={color} />
            <Circle cx={12} cy={12} r={2} fill={color} />
            <Circle cx={12} cy={19} r={2} fill={color} />
        </Svg>
    );
}

function quoteAnkiSearchValue(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

/** Compact "how long ago" label for the card list (Turkish). */
function formatLastReview(lastReviewedAtMs: number, locale: SupportedLocale): string {
    if (!lastReviewedAtMs) return locale === 'tr' ? 'Hiç çalışılmadı' : 'Never studied';

    const elapsedMs = Date.now() - lastReviewedAtMs;
    if (elapsedMs < 60_000) return locale === 'tr' ? 'Az önce' : 'Just now';
    if (elapsedMs < 3_600_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 60_000)} dk. önce` : `${Math.floor(elapsedMs / 60_000)}m ago`;
    if (elapsedMs < 86_400_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 3_600_000)} sa. önce` : `${Math.floor(elapsedMs / 3_600_000)}h ago`;

    const days = Math.floor(elapsedMs / 86_400_000);
    if (days < 30) return locale === 'tr' ? `${days} gün önce` : `${days}d ago`;

    const date = new Date(lastReviewedAtMs);
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

/** Compact "when is it due" label from the scheduling state (Turkish). */
function formatNextDue(state: CardState, rolloverHour: number, locale: SupportedLocale): string {
    if (state.suspended) return locale === 'tr' ? 'Askıda' : 'Suspended';
    if (state.buried) return locale === 'tr' ? 'Gömülü (yarına kadar)' : 'Buried (until tomorrow)';
    if (state.status === 'new') return locale === 'tr' ? 'Sırada (yeni)' : 'Queued (new)';

    if (state.status === 'learning' && state.dueTime > 0) {
        const remainingMs = state.dueTime - Date.now();
        if (remainingMs <= 0) return locale === 'tr' ? 'Şimdi' : 'Now';
        if (remainingMs < 3_600_000) return locale === 'tr' ? `${Math.max(1, Math.ceil(remainingMs / 60_000))} dk. sonra` : `in ${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;
        return locale === 'tr' ? `${Math.ceil(remainingMs / 3_600_000)} sa. sonra` : `in ${Math.ceil(remainingMs / 3_600_000)}h`;
    }

    const today = localDayNumber(Date.now(), rolloverHour);
    const dueDay = ymdToLocalDayNumber(state.dueDate, today, rolloverHour);
    const diff = dueDay - today;
    if (diff <= 0) return locale === 'tr' ? 'Bugün' : 'Today';
    if (diff === 1) return locale === 'tr' ? 'Yarın' : 'Tomorrow';
    if (diff < 30) return locale === 'tr' ? `${diff} gün sonra` : `in ${diff} days`;
    if (diff < 365) return locale === 'tr' ? `${Math.round(diff / 30)} ay sonra` : `in ${Math.round(diff / 30)} months`;
    return locale === 'tr' ? `${(diff / 365).toFixed(1)} yıl sonra` : `in ${(diff / 365).toFixed(1)} years`;
}

export default function BrowserScreen() {
    const { height: windowHeight } = useWindowDimensions();
    const { t, l, locale, localeTag } = useI18n();
    const { settings } = useAppSettings();
    const {
        collectionVersion: dataVersion,
        invalidateCollection: bumpDataVersion,
        getSchedulingRevision,
    } = useCollectionInvalidation();
    const router = useRouter();
    const params = useLocalSearchParams();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const browserFontScale = (settings.browserFontScalePercent ?? 100) / 100;
    const { activeDeckName } = useStudyScope();
    const routeDeckName = typeof params.deck === 'string' && params.deck ? params.deck : null;
    // The route supplies the initial/deep-linked scope. From that point on, changing scope is a
    // local filter operation: it must not remount the browser or discard search/filter context.
    const [deckName, setDeckName] = useRouteDeckScope(routeDeckName);

    const [allCards, setAllCards] = useState<StudyCard[]>([]);
    const [cardsSnapshotKey, setCardsSnapshotKey] = useState('');
    const initialRouteSearch = typeof params.initialSearch === 'string' ? params.initialSearch : '';
    const [rawQuery, setRawQuery] = useState(initialRouteSearch);
    const [showSearchHelp, setShowSearchHelp] = useState(false);
    const [searchQuery, setSearchQuery] = useState(initialRouteSearch);
    const [markedOnly, setMarkedOnly] = useState(false);
    const [suspendedOnly, setSuspendedOnly] = useState(false);
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [flagFilters, setFlagFilters] = useState<CardFlag[]>(() => [...ALL_CARD_FLAGS]);
    const [sortKey, setSortKey] = useState<BrowserCardSortKey>(readBrowserSortKey);
    const [tableMode, setTableMode] = useState<BrowserTableMode>(readBrowserTableMode);
    const [sortDescending, setSortDescending] = useState(() => readBrowserBoolean('browser_sort_desc', false));
    const [showAnswerSnippet, setShowAnswerSnippet] = useState(() => readBrowserBoolean('browser_show_answer', false));
    const [showScheduleDetails, setShowScheduleDetails] = useState(() => readBrowserBoolean('browser_show_schedule', true));
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [deckScopePickerVisible, setDeckScopePickerVisible] = useState(false);
    const [showSortPicker, setShowSortPicker] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [flagPickerMode, setFlagPickerMode] = useState<'selection' | null>(null);
    const [showFlagFilterMenu, setShowFlagFilterMenu] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(() => new Set());
    const [currentSelectedCardId, setCurrentSelectedCardId] = useState<number | null>(null);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showSelectionMenu, setShowSelectionMenu] = useState(false);
    const [showNoteTypePicker, setShowNoteTypePicker] = useState(false);
    const [showSelectionTags, setShowSelectionTags] = useState(false);
    const [selectionTagBaseline, setSelectionTagBaseline] = useState<string[]>([]);
    const [showRepositionDialog, setShowRepositionDialog] = useState(false);
    const [repositionStart, setRepositionStart] = useState('1');
    const [repositionStep, setRepositionStep] = useState('1');
    const [repositionShiftExisting, setRepositionShiftExisting] = useState(true);
    const [showDueDialog, setShowDueDialog] = useState(false);
    const [dueInput, setDueInput] = useState('0');
    const [showGradePicker, setShowGradePicker] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [previewAnswerVisible, setPreviewAnswerVisible] = useState(false);
    const [lastDeckMove, setLastDeckMove] = useState<CardDeckMoveSnapshot[]>([]);
    const [reloadToken, setReloadToken] = useState(0);
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [totalCardCount, setTotalCardCount] = useState(0);
    const [hasMoreCards, setHasMoreCards] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadedCountRef = useRef(0);
    const totalCardCountRef = useRef(0);
    const pageLoadInProgressRef = useRef(false);
    const pageGenerationRef = useRef(new LatestSnapshotGeneration());
    const pageTaskRef = useRef<{ cancel: () => void } | null>(null);
    const scopeRepositoryRef = useRef(new ScreenSnapshotRepository<BrowserScopeSnapshot>());
    const searchInputRef = useRef<TextInput>(null);

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
    }, [getSchedulingRevision]));

    useEffect(() => {
        if (!initialRouteSearch) return;
        setRawQuery(initialRouteSearch);
        setSearchQuery(initialRouteSearch);
    }, [initialRouteSearch]);

    const transientSurfaceOpen = showOverflowMenu
        || deckScopePickerVisible
        || showSortPicker
        || showTagFilter
        || showFlagFilterMenu
        || flagPickerMode !== null
        || showOptions
        || showDeckPicker
        || showSelectionMenu
        || showNoteTypePicker
        || showSelectionTags
        || showRepositionDialog
        || showDueDialog
        || showGradePicker
        || previewIndex !== null;

    // Browser actions can be launched while its search field owns the keyboard. Every new
    // popup starts from the full window; input dialogs then use their own avoiding layer.
    useEffect(() => {
        if (transientSurfaceOpen) Keyboard.dismiss();
    }, [transientSurfaceOpen]);

    useEffect(() => {
        if (!showOverflowMenu) setShowFlagFilterMenu(false);
    }, [showOverflowMenu]);

    const allFilterActive = !markedOnly
        && !suspendedOnly
        && tagFilters.length === 0
        && flagFilters.length === ALL_CARD_FLAGS.length;
    const hasNoFlagFilter = flagFilters.includes(0);
    const coloredFlagFilters = useMemo(
        () => flagFilters.filter((flag): flag is Exclude<CardFlag, 0> => flag !== 0),
        [flagFilters],
    );
    const browserQueryOptions = useMemo<Omit<BrowserCardQuery, 'deckIds' | 'cardIds' | 'limit' | 'offset'>>(() => ({
        tableMode,
        sortKey,
        descending: sortDescending,
        markedOnly,
        suspendedOnly,
        tags: tagFilters,
        flags: flagFilters.length === ALL_CARD_FLAGS.length ? undefined : flagFilters,
    }), [
        tableMode,
        sortKey,
        sortDescending,
        markedOnly,
        suspendedOnly,
        tagFilters,
        flagFilters,
    ]);
    const browserScopeKey = useMemo(() => JSON.stringify([
        'browser-scope',
        deckName,
        dataVersion,
        schedulingRevision,
        reloadToken,
        settings,
    ]), [deckName, dataVersion, schedulingRevision, reloadToken, settings]);
    const browserSnapshotKey = useMemo(() => JSON.stringify([
        'browser',
        browserScopeKey,
        reloadToken,
        browserQueryOptions,
        searchQuery.trim(),
    ]), [browserScopeKey, reloadToken, browserQueryOptions, searchQuery]);
    const loadBrowserSnapshot = useCallback(() => {
        const scope = scopeRepositoryRef.current.getOrCreate(
            browserScopeKey,
            () => getBrowserScopeSnapshot(deckName, settings),
        );
        return getBrowserScreenSnapshot({
            scope,
            settings,
            query: browserQueryOptions,
            searchQuery,
            pageSize: BROWSER_PAGE_SIZE,
            hasActiveFilters: !allFilterActive,
        });
    }, [browserScopeKey, deckName, settings, browserQueryOptions, searchQuery, allFilterActive]);
    const {
        snapshot: browserSnapshot,
        loading,
        error: browserSnapshotError,
    } = useDeferredScreenSnapshot(browserSnapshotKey, loadBrowserSnapshot);
    const allDecks = browserSnapshot?.scope.allDecks ?? [];
    const scopeDeck = browserSnapshot?.scope.scopeDeck ?? null;
    const scopedDeckIds = useMemo(
        () => browserSnapshot?.scope.scopedDeckIds
            ? new Set(browserSnapshot.scope.scopedDeckIds)
            : null,
        [browserSnapshot?.scope.scopedDeckIds],
    );
    const filteredScopeCardIds = useMemo(
        () => browserSnapshot?.scope.filteredScopeCardIds
            ? new Set(browserSnapshot.scope.filteredScopeCardIds)
            : null,
        [browserSnapshot?.scope.filteredScopeCardIds],
    );
    const subjects = browserSnapshot?.scope.subjects ?? [];
    const noteTypes = browserSnapshot?.scope.noteTypes ?? [];
    const browserDbQuery = browserSnapshot?.query ?? browserQueryOptions;
    const activeSearchRowIds = browserSnapshot?.searchRowIds ?? null;
    const scopeCardCount = browserSnapshot?.scopeCardCount ?? 0;
    const scopeHasCards = browserSnapshot?.scopeHasCards ?? false;
    const visibleAllCards = allCards;
    const deckById = useMemo(() => new Map(allDecks.map((deck) => [deck.id, deck])), [allDecks]);
    // Anki's search language, compiled once per query (lib/cardSearchMatch.ts).
    const pageMatcher = useMemo(() => {
        const nowMs = Date.now();
        return compileCardMatcher(searchQuery.trim(), {
            today: localDayNumber(nowMs, settings.dayRolloverHour),
            nowMs,
            learnAheadMinutes: settings.learnAheadMinutes,
            dayCutoffMs: nextRolloverMs(nowMs, settings.dayRolloverHour) - 86_400_000,
        });
    }, [searchQuery, settings.dayRolloverHour, settings.learnAheadMinutes]);
    const tagCollectionScope = useMemo(() => ({
        deckIds: scopedDeckIds ? [...scopedDeckIds] : undefined,
        cardIds: filteredScopeCardIds ? [...filteredScopeCardIds] : undefined,
    }), [filteredScopeCardIds, scopedDeckIds]);
    const loadScopedTags = useCallback(
        () => getAllTags(tagCollectionScope),
        [tagCollectionScope],
    );

    const trimmedSearchQuery = searchQuery.trim();

    const batchMoveDeckItems = useMemo(
        () => showDeckPicker
            ? allDecks.filter((deck) => !deck.isFiltered && !isCatalogDeck(deck))
            : [],
        [allDecks, showDeckPicker],
    );
    const deckScopePickerItems = useMemo(
        () => deckScopePickerVisible
            ? [...allDecks].sort((a, b) => a.name.localeCompare(b.name, localeTag))
            : [],
        [allDecks, deckScopePickerVisible, localeTag],
    );
    const scopeTitle = deckName
        ? deckName.replaceAll('::', ' › ')
        : l('Tüm koleksiyon', 'Whole Collection');

    const handlePickDeckScope = (name: string | null) => {
        setDeckScopePickerVisible(false);
        setDeckName(name);
        setExpandedCard(null);
    };

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        if (routeDeckName) {
            router.replace(`/deck-overview?deck=${encodeURIComponent(routeDeckName)}` as any);
            return;
        }
        router.replace('/decks' as any);
    };
    const noteById = useMemo(() => {
        const notes = new Map<number, Note>();
        for (const card of visibleAllCards) {
            if (notes.has(card.noteId)) continue;
            const note = card.rawNote;
            if (note) notes.set(card.noteId, note);
        }
        return notes;
    }, [visibleAllCards]);
    const noteTagsById = useMemo(
        () => new Map([...noteById].map(([noteId, note]) => [noteId, note.tags])),
        [noteById],
    );
    const selectableNoteTypes = useMemo(
        () => showNoteTypePicker
            ? noteTypes.filter((noteType) => !isLegacyTusNoteType(noteType))
            : [],
        [noteTypes, showNoteTypePicker],
    );

    useEffect(() => {
        pageTaskRef.current?.cancel();
        pageTaskRef.current = null;
        pageGenerationRef.current.cancel();
        pageLoadInProgressRef.current = false;
        setLoadingMore(false);
        if (!browserSnapshot) return;
        loadedCountRef.current = browserSnapshot.cards.length;
        totalCardCountRef.current = browserSnapshot.totalCardCount;
        setAllCards(browserSnapshot.cards);
        setCardsSnapshotKey(browserSnapshotKey);
        setTotalCardCount(browserSnapshot.totalCardCount);
        setHasMoreCards(
            browserSnapshot.cards.length < browserSnapshot.totalCardCount
            && browserSnapshot.cards.length > 0,
        );
        setLoadingError(null);
    }, [browserSnapshot, browserSnapshotKey]);

    useEffect(() => {
        if (!browserSnapshotError) return;
        setLoadingError(userFacingErrorMessage(
            browserSnapshotError,
            l('Kartlar yüklenemedi. Lütfen tekrar deneyin.', 'Cards could not be loaded. Please try again.'),
        ));
    }, [browserSnapshotError, l]);

    const reload = useCallback(() => setReloadToken((value) => value + 1), []);
    const loadNextPage = useCallback(() => {
        if (!browserSnapshot || !hasMoreCards || loading || loadingMore || pageLoadInProgressRef.current) return;
        pageLoadInProgressRef.current = true;
        setLoadingMore(true);
        const token = pageGenerationRef.current.begin();
        const task = InteractionManager.runAfterInteractions(() => {
            try {
            const total = totalCardCountRef.current;
            const offset = loadedCountRef.current;
            const pageRowIds = activeSearchRowIds?.slice(offset, offset + BROWSER_PAGE_SIZE);
            const cards = getBrowserCards(settings, {
                ...browserDbQuery,
                ...(pageRowIds
                    ? tableMode === 'notes'
                        ? { noteIds: pageRowIds }
                        : { cardIds: pageRowIds }
                    : {}),
                limit: BROWSER_PAGE_SIZE,
                offset: pageRowIds ? 0 : offset,
            });
            const nextLoadedCount = offset + cards.length;
            pageGenerationRef.current.commit(token, () => {
                loadedCountRef.current = nextLoadedCount;
                setAllCards((current) => [...current, ...cards]);
                setHasMoreCards(nextLoadedCount < total && cards.length > 0);
                setLoadingError(null);
            });
        } catch (error) {
            console.error('[Browser] card load failed:', error);
            pageGenerationRef.current.commit(token, () => {
                setLoadingError(userFacingErrorMessage(
                    error,
                    l('Kartlar yüklenemedi. Lütfen tekrar deneyin.', 'Cards could not be loaded. Please try again.'),
                ));
            });
        } finally {
            if (pageGenerationRef.current.isCurrent(token)) {
                pageLoadInProgressRef.current = false;
                setLoadingMore(false);
                pageTaskRef.current = null;
            }
        }
        });
        pageTaskRef.current = task;
    }, [activeSearchRowIds, browserDbQuery, browserSnapshot, hasMoreCards, loading, loadingMore, settings, tableMode, l]);

    useEffect(() => () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    const showSearchSyntaxHelp = useCallback(() => {
        Keyboard.dismiss();
        setShowSearchHelp(true);
    }, []);

    // Anki's search terms, grouped the way the help sheet lists them. Tapping a row appends the
    // term to the search box, so the syntax can be learned by using it instead of memorising it.
    const searchHelpGroups = useMemo(() => [
        {
            title: l('Kapsam', 'Scope'),
            items: [
                { term: 'deck:', hint: l('Belirli bir destede ara', 'Search inside one deck') },
                { term: 'tag:', hint: l('Belirli bir etikette ara', 'Search cards with a tag') },
                { term: 'tag:none', hint: l('Etiketi olmayan kartlar', 'Cards with no tags at all') },
                { term: 'note:', hint: l('Not türüne göre', 'By note type') },
            ],
        },
        {
            title: l('Kart durumu', 'Card state'),
            items: [
                { term: 'is:due', hint: l('Bugün çalışılacaklar', 'Waiting for review today') },
                { term: 'is:new', hint: l('Hiç çalışılmamış kartlar', 'Never studied yet') },
                { term: 'is:learn', hint: l('Öğrenme aşamasındakiler', 'Currently in learning') },
                { term: 'is:review', hint: l('Tekrar aşamasındakiler', 'In the review stage') },
                { term: 'is:suspended', hint: l('Askıya alınmış kartlar', 'Suspended cards') },
                { term: 'is:buried', hint: l('Gömülmüş kartlar', 'Buried cards') },
                { term: 'flag:1', hint: l('Bayrağa göre (0–7)', 'By flag colour (0–7)') },
            ],
        },
        {
            title: l('Zamana göre', 'By time'),
            items: [
                { term: 'added:7', hint: l('Son 7 günde eklenenler', 'Added in the last 7 days') },
                { term: 'edited:7', hint: l('Son 7 günde düzenlenenler', 'Edited in the last 7 days') },
                { term: 'rated:7', hint: l('Son 7 günde çalışılanlar', 'Reviewed in the last 7 days') },
                { term: 'rated:7:1', hint: l('Son 7 günde "Tekrar" denenler', 'Answered "Again" in 7 days') },
            ],
        },
        {
            title: l('Kart özellikleri', 'Card properties'),
            items: [
                { term: 'prop:ivl>=21', hint: l('Aralığı 21 günden uzun', 'Interval of 21 days or more') },
                { term: 'prop:lapses>=5', hint: l('5 kez veya daha çok unutulan', 'Forgotten five times or more') },
                { term: 'prop:reps<10', hint: l('10 kereden az çalışılan', 'Reviewed fewer than 10 times') },
                { term: 'prop:due<=3', hint: l('3 gün içinde gelecekler', 'Due within three days') },
            ],
        },
        {
            title: l('Birleştirme', 'Combining terms'),
            items: [
                { term: '-is:suspended', hint: l('Başına - koyarak dışla', 'A leading - excludes') },
                { term: '(tag:a or tag:b)', hint: l('or ile alternatif, parantezle grupla', 'or for alternatives, brackets to group') },
                { term: 're:', hint: l('Düzenli ifadeyle ara', 'Search with a regular expression') },
            ],
        },
    ], [l]);


    const handleSearch = useCallback((text: string) => {
        setRawQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearchQuery(text), 200);
    }, []);

    /** Append a term tapped in the help sheet to whatever is already in the search box. */
    const appendSearchTerm = useCallback((term: string) => {
        setShowSearchHelp(false);
        const current = rawQuery.trim();
        handleSearch(current ? `${current} ${term}` : term);
    }, [rawQuery, handleSearch]);

    const filteredCards = useMemo(() => {
        const query = searchQuery.trim();
        let cards = visibleAllCards;

        // Notes-mode rows are already the authoritative, deduplicated database result. A note
        // may have matched because of a sibling card that is not its representative first card,
        // so reapplying card-level filters here would incorrectly hide the whole note.
        if (tableMode === 'notes') return cards;

        if (filteredScopeCardIds) {
            cards = cards.filter((card) => filteredScopeCardIds.has(card.cardId));
        } else if (scopedDeckIds) {
            cards = cards.filter((card) => scopedDeckIds.has(card.deckId));
        }

        if (markedOnly) {
            cards = cards.filter((card) => card.noteMarked);
        }

        if (suspendedOnly) {
            cards = cards.filter((card) => card.state.suspended);
        }

        if (tagFilters.length > 0) {
            const required = tagFilters.map((tag) => tag.normalize('NFC').toLocaleLowerCase());
            cards = cards.filter((card) => {
                const noteTags = (noteTagsById.get(card.noteId) ?? [])
                    .map((tag) => tag.normalize('NFC').toLocaleLowerCase());
                // AnkiDroid combines multiple selected tags with OR. Keep this client-side
                // safeguard aligned with the database query so pagination never changes the
                // meaning of the active tag filter.
                return required.some((tag) => noteTags.some((candidate) => candidate === tag || candidate.startsWith(`${tag}::`)));
            });
        }

        if (flagFilters.length < ALL_CARD_FLAGS.length) {
            const selectedFlags = new Set(flagFilters);
            // The flag is the low three bits of the field; Anki reserves the rest. Import masks
            // them off on the way in, so this is belt-and-braces — but it keeps the one rule for
            // reading a flag in every place that reads one.
            cards = cards.filter((card) => selectedFlags.has(((card.rawCard?.flags ?? 0) & 0b111) as CardFlag));
        }

        if (query && pageMatcher) {
            // The authoritative result is the id list the database search produced; this pass only
            // keeps an already-loaded page from contradicting it while a new search is in flight.
            // Terms this context cannot answer (rated:, introduced:) pass through untouched.
            cards = cards.filter((card) => pageMatcher({
                cardId: card.cardId,
                noteId: card.noteId,
                deckName: deckById.get(card.deckId)?.name ?? '',
                text: [card.question, card.answer, card.topic].join(' '),
                tags: noteTagsById.get(card.noteId) ?? [],
                templateOrd: card.templateOrd,
                queue: card.rawCard?.queue ?? 0,
                type: card.rawCard?.type ?? 0,
                due: card.rawCard?.due ?? 0,
                ivl: card.rawCard?.ivl ?? 0,
                factor: card.rawCard?.factor ?? 0,
                reps: card.rawCard?.reps ?? 0,
                lapses: card.rawCard?.lapses ?? 0,
                flags: card.rawCard?.flags ?? 0,
            }));
        }

        return cards;
    }, [visibleAllCards, tableMode, filteredScopeCardIds, scopedDeckIds, markedOnly, suspendedOnly, tagFilters, flagFilters, searchQuery, pageMatcher, noteTagsById, deckById]);

    useEffect(() => {
        if (loading || cardsSnapshotKey !== browserSnapshotKey) return;
        if (filteredCards.length === 0 && allCards.length > 0) return;
        const visibleIds = new Set(filteredCards.map((card) => card.cardId));
        setSelectedCardIds((current) => {
            if (current.size === 0) return current;
            const next = new Set([...current].filter((cardId) => visibleIds.has(cardId)));
            if (next.size === current.size && [...next].every((cardId) => current.has(cardId))) return current;
            return next;
        });
    }, [filteredCards, loading, cardsSnapshotKey, browserSnapshotKey, allCards.length]);

    const toggleSuspend = useCallback((cardId: number, isSuspended: boolean) => {
        setCardSuspended(cardId, !isSuspended, settings.dayRolloverHour);
        bumpDataVersion();
        reload();
    }, [reload, bumpDataVersion, settings.dayRolloverHour]);

    const sortLabels: Record<BrowserCardSortKey, string> = {
        sortField: l('Sıralama alanı', 'Sort Field'),
        cardType: tableMode === 'notes' ? l('Kart sayısı', 'Card Count') : l('Kart türü', 'Card Type'),
        due: tableMode === 'notes' ? l('En yakın vade', 'Earliest Due') : l('Vade', 'Due'),
        deck: l('Deste', 'Deck'),
        created: l('Oluşturulma', 'Created'),
        modified: l('Değiştirilme', 'Modified'),
        interval: tableMode === 'notes' ? l('Ortalama aralık', 'Average Interval') : l('Aralık', 'Interval'),
        ease: tableMode === 'notes' ? l('Ortalama kolaylık', 'Average Ease') : l('Kolaylık', 'Ease'),
        lapses: tableMode === 'notes' ? l('Toplam unutma', 'Total Lapses') : l('Unutma sayısı', 'Lapses'),
        reviews: tableMode === 'notes' ? l('Toplam tekrar', 'Total Reviews') : l('Tekrar sayısı', 'Reviews'),
        stability: tableMode === 'notes' ? l('Ortalama hafıza gücü', 'Average Stability') : l('Hafıza gücü', 'Stability'),
        difficulty: tableMode === 'notes' ? l('Ortalama zorluk', 'Average Difficulty') : l('Zorluk', 'Difficulty'),
        retrievability: tableMode === 'notes' ? l('Ortalama hatırlanabilirlik', 'Average Retrievability') : l('Hatırlanabilirlik', 'Retrievability'),
    };

    const closeSelection = useCallback(() => {
        setSelectionMode(false);
        setSelectedCardIds(new Set());
        setCurrentSelectedCardId(null);
        setShowSelectionMenu(false);
    }, []);

    const toggleCardSelection = useCallback((cardId: number) => {
        setCurrentSelectedCardId(cardId);
        setSelectedCardIds((current) => {
            const next = new Set(current);
            if (next.has(cardId)) next.delete(cardId);
            else next.add(cardId);
            return next;
        });
    }, []);

    const selectAllVisible = useCallback(() => {
        setSelectionMode(true);
        setSelectedCardIds(new Set(filteredCards.map((card) => card.cardId)));
        setCurrentSelectedCardId(filteredCards[0]?.cardId ?? null);
    }, [filteredCards]);

    const selectedCards = useMemo(
        () => filteredCards.filter((card) => selectedCardIds.has(card.cardId)),
        [filteredCards, selectedCardIds],
    );
    const selectedCardsDeckName = useMemo(() => {
        if (selectedCards.length === 0) return null;
        const firstCard = selectedCards[0];
        return firstCard?.deckId ? getDeck(firstCard.deckId)?.name ?? null : null;
    }, [selectedCards]);
    const selectedActionCardIds = useMemo(() => {
        const ids = selectedCards.map((card) => card.cardId);
        const orderedIds = currentSelectedCardId === null || !selectedCardIds.has(currentSelectedCardId)
            ? ids
            : [currentSelectedCardId, ...ids.filter((cardId) => cardId !== currentSelectedCardId)];
        return tableMode === 'notes' ? expandSelectedCardsToNotes(orderedIds) : orderedIds;
    }, [selectedCards, selectedCardIds, currentSelectedCardId, tableMode]);
    const selectedNoteIds = useMemo(
        () => [...new Set(selectedCards.map((card) => card.noteId))],
        [selectedCards],
    );
    const selectedNotes = useMemo(
        () => selectedNoteIds.map((noteId) => noteById.get(noteId)).filter((note): note is Note => note !== undefined),
        [selectedNoteIds, noteById],
    );
    const hasCatalogCardsSelected = useMemo(
        () => selectedCards.some((card) => isCatalogCard(card.cardId)),
        [selectedCards],
    );
    const hasCatalogNotesSelected = useMemo(
        () => selectedNoteIds.some((noteId) => isCatalogNote(noteId)),
        [selectedNoteIds],
    );
    // Rows paint note text directly, so capture protection follows what is loaded on screen
    // rather than what happens to be selected. The note objects are already in memory here, and
    // checking them costs no database read.
    const showsCatalogContent = useMemo(
        () => [...noteById.values()].some((note) => isCatalogNote(note)),
        [noteById],
    );
    const screenGuardState = useScreenGuard(showsCatalogContent, 'browser');
    const previewCard = previewIndex === null ? null : selectedCards[previewIndex] ?? null;
    const previewNote = previewCard ? noteById.get(previewCard.noteId) ?? null : null;
    const previewNoteType = previewNote ? noteTypes.find((type) => type.id === previewNote.noteTypeId) ?? null : null;
    const previewRawCard = previewCard?.rawCard ?? null;
    const previewDeck = previewCard ? deckById.get(previewCard.deckId) ?? null : null;

    const refreshSelection = useCallback(() => {
        bumpDataVersion();
        reload();
    }, [bumpDataVersion, reload]);

    const runSelectionAction = useCallback((action: () => void) => {
        setShowSelectionMenu(false);
        try {
            action();
            refreshSelection();
        } catch (error) {
            console.warn('[Browser] selection action failed:', error);
            alert(t('common.error'), userFacingErrorMessage(
                error,
                l('İşlem tamamlanamadı. Lütfen tekrar deneyin.', 'The action could not be completed. Please try again.'),
            ));
        }
    }, [refreshSelection, t, l]);

    const openSelectionTags = useCallback(() => {
        if (selectedNotes.length === 0) return;
        const common = selectedNotes[0].tags.filter((tag) => (
            selectedNotes.every((note) => note.tags.some((candidate) => candidate.normalize('NFC').toLocaleLowerCase() === tag.normalize('NFC').toLocaleLowerCase()))
        ));
        setSelectionTagBaseline(common);
        setShowSelectionMenu(false);
        setShowSelectionTags(true);
    }, [selectedNotes]);

    const openFlagFilter = useCallback(() => {
        setShowFlagFilterMenu((visible) => !visible);
    }, []);

    const updateSort = useCallback((nextSortKey: BrowserCardSortKey) => {
        setSortKey(nextSortKey);
        setDbSetting('browser_sort_key', nextSortKey);
        setShowSortPicker(false);
    }, []);

    const updateSortDirection = useCallback((descending: boolean) => {
        setSortDescending(descending);
        setDbSetting('browser_sort_desc', descending ? '1' : '0');
    }, []);

    const updateBrowserOption = useCallback((key: 'answer' | 'schedule', value: boolean) => {
        if (key === 'answer') setShowAnswerSnippet(value);
        if (key === 'schedule') setShowScheduleDetails(value);
        setDbSetting(`browser_show_${key}`, value ? '1' : '0');
    }, []);

    const updateTableMode = useCallback((mode: BrowserTableMode) => {
        setTableMode(mode);
        setDbSetting('browser_table_mode', mode);
        setExpandedCard(null);
        closeSelection();
        setShowOptions(false);
    }, [closeSelection]);

    const applyFlag = useCallback((flag: CardFlag) => {
        if (flagPickerMode === 'selection') {
            for (const cardId of selectedActionCardIds) setCardFlag(cardId, flag);
            bumpDataVersion();
            reload();
        }
        setFlagPickerMode(null);
    }, [flagPickerMode, selectedActionCardIds, bumpDataVersion, reload]);

    const toggleFlagFilter = useCallback((flag: CardFlag) => {
        setFlagFilters((current) => (
            current.includes(flag)
                ? current.filter((candidate) => candidate !== flag)
                : [...current, flag].sort((a, b) => a - b)
        ));
    }, []);

    const toggleAllFlagFilters = useCallback(() => {
        setFlagFilters((current) => (
            current.length === ALL_CARD_FLAGS.length ? [] : [...ALL_CARD_FLAGS]
        ));
    }, []);

    const clearNoFlagFilter = useCallback(() => {
        setFlagFilters((current) => {
            const colored = current.filter((candidate) => candidate !== 0);
            return colored.length === 0 ? [...ALL_CARD_FLAGS] : colored;
        });
    }, []);

    const clearColoredFlagFilters = useCallback(() => {
        setFlagFilters((current) => {
            const hasNoFlag = current.includes(0);
            return hasNoFlag ? [0] : [...ALL_CARD_FLAGS];
        });
    }, []);

    const moveSelectionToDeck = useCallback((targetDeckId: number) => {
        const targetDeck = getDeck(targetDeckId);
        if (!targetDeck || targetDeck.isFiltered) return;
        if (hasCatalogCardsSelected) {
            alert(
                l('Katalog Korumalı', 'Catalog Protected'),
                l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
            );
            setShowDeckPicker(false);
            return;
        }
        if (isCatalogDeck(targetDeckId)) {
            alert(
                l('Katalog Korumalı', 'Catalog Protected'),
                l('Katalog destelerine dışarıdan kart taşınamaz.', 'Cards cannot be moved into catalog decks.')
            );
            setShowDeckPicker(false);
            return;
        }
        try {
            const move = moveCardsToDeck(selectedActionCardIds, targetDeckId);
            if (move.length > 0) setLastDeckMove(move);
        } catch (e) {
            alert(t('common.error'), userFacingErrorMessage(e, l('Kartlar taşınamadı.', 'Cards could not be moved.')));
        }
        setShowDeckPicker(false);
        closeSelection();
        bumpDataVersion();
        reload();
    }, [selectedActionCardIds, hasCatalogCardsSelected, closeSelection, bumpDataVersion, reload, l, t]);

    const undoDeckMove = useCallback(() => {
        setShowOverflowMenu(false);
        if (lastDeckMove.length === 0) return;
        undoCardsMovedToDeck(lastDeckMove);
        setLastDeckMove([]);
        bumpDataVersion();
        reload();
    }, [lastDeckMove, bumpDataVersion, reload]);

    const toggleSelectionSuspended = useCallback(() => {
        if (selectedActionCardIds.length === 0) return;
        toggleSelectedSuspend(selectedActionCardIds, settings.dayRolloverHour);
        refreshSelection();
    }, [selectedActionCardIds, settings.dayRolloverHour, refreshSelection]);

    const browserSearch = useMemo(() => {
        const terms: string[] = [];
        if (scopeDeck?.isFiltered) {
            if (scopeDeck.searchQuery?.trim()) terms.push(scopeDeck.searchQuery.trim());
        } else if (scopeDeck) {
            terms.push(`deck:${quoteAnkiSearchValue(scopeDeck.name)}`);
        }
        if (markedOnly) terms.push('tag:marked');
        if (suspendedOnly) terms.push('is:suspended');
        if (tagFilters.length === 1) {
            terms.push(`tag:${quoteAnkiSearchValue(tagFilters[0])}`);
        } else if (tagFilters.length > 1) {
            terms.push(`(${tagFilters.map((tag) => `tag:${quoteAnkiSearchValue(tag)}`).join(' OR ')})`);
        }
        if (flagFilters.length === 0) {
            terms.push(`-(${ALL_CARD_FLAGS.map((flag) => `flag:${flag}`).join(' OR ')})`);
        } else if (flagFilters.length < ALL_CARD_FLAGS.length) {
            const flags = flagFilters.map((flag) => `flag:${flag}`);
            terms.push(flags.length === 1 ? flags[0] : `(${flags.join(' OR ')})`);
        }
        if (searchQuery.trim()) terms.push(searchQuery.trim());
        return terms.join(' ');
    }, [scopeDeck, markedOnly, suspendedOnly, tagFilters, flagFilters, searchQuery]);

    const hasResultFilter = Boolean(searchQuery.trim()) || !allFilterActive;
    // Loaded-page progress is an implementation detail. Keep the toolbar stable and show only
    // the total number of cards in the current scope/filter, including while search is scanning.
    const scopeCountText = loading ? '…' : String(scopeCardCount);

    const clearBrowserFilters = useCallback(() => {
        setMarkedOnly(false);
        setSuspendedOnly(false);
        setTagFilters([]);
        setFlagFilters([...ALL_CARD_FLAGS]);
    }, []);

    const openFilteredDeckDialog = useCallback(() => {
        setShowOverflowMenu(false);
        InteractionManager.runAfterInteractions(() => {
            router.push({
                pathname: '/decks',
                params: {
                    createFilter: String(Date.now()),
                    filterSearch: browserSearch,
                },
            } as any);
        });
    }, [browserSearch, router]);

    const subject = (id: string) => subjects.find((s) => s.id === id);

    const renderCard = ({ item }: { item: StudyCard }) => {
        const isExpanded = expandedCard === item.cardId;
        const isSelected = selectedCardIds.has(item.cardId);
        const sub = subject(item.subject);
        const flag = (item.rawCard?.flags ?? 0) as CardFlag;
        const noteSummary = item.browserNoteSummary;
        const isNotesMode = tableMode === 'notes' && noteSummary !== undefined;
        const rowNoteType = item.rawNote
            ? noteTypes.find((noteType) => noteType.id === item.rawNote?.noteTypeId)
            : undefined;

        const statusColor = item.state.status === 'learning' ? colors.badgeLearn : colors.badgeReview;
        const statusBg = item.state.status === 'learning' ? colors.badgeLearnBg : colors.badgeReviewBg;
        const noteDeckText = isNotesMode
            ? noteSummary.deckCount > 1
                ? l(`${noteSummary.deckCount} deste`, `${noteSummary.deckCount} decks`)
                : (noteSummary.deckNames[0] ?? deckById.get(item.deckId)?.name ?? item.subject).replaceAll('::', ' › ')
            : '';
        const noteScheduleText = isNotesMode
            ? [
                l(`${noteSummary.cardCount} kart`, `${noteSummary.cardCount} cards`),
                noteSummary.averageIntervalDays == null
                    ? null
                    : l(`Ort. aralık ${noteSummary.averageIntervalDays.toFixed(1)} gün`, `Avg. interval ${noteSummary.averageIntervalDays.toFixed(1)} days`),
                l(`${noteSummary.totalReviews} tekrar`, `${noteSummary.totalReviews} reviews`),
            ].filter(Boolean).join(' · ')
            : '';

        return (
            <TouchableOpacity
                style={[
                    styles.cardItem,
                    // The whole row carries the state, so the tint is unbroken rather than painted
                    // onto the header, the answer box and the detail block separately. Selection
                    // comes last: while picking cards, what is selected matters more than why a
                    // row is out of the queue.
                    !isNotesMode && item.state.suspended && styles.cardSuspended,
                    !isNotesMode && !item.state.suspended && item.state.buried && styles.cardBuried,
                    isSelected && styles.cardItemSelected,
                ]}
                onPress={() => selectionMode
                    ? toggleCardSelection(item.cardId)
                    : setExpandedCard(isExpanded ? null : item.cardId)}
                onLongPress={() => {
                    if (!selectionMode) setSelectionMode(true);
                    toggleCardSelection(item.cardId);
                }}
                activeOpacity={0.7}
                accessibilityRole={selectionMode ? 'checkbox' : 'button'}
                accessibilityState={selectionMode ? { checked: isSelected } : undefined}
            >
                <View style={styles.cardItemHeader}>
                    {selectionMode && (
                        <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Text style={[styles.selectionCheckboxTick]}>✓</Text>}
                        </View>
                    )}
                    <Text style={styles.cardIcon}>{isNotesMode ? '📝' : (sub?.icon || '📝')}</Text>
                    <View style={styles.cardBody}>
                        <Text
                            style={[
                                styles.cardQuestion,
                                {
                                    fontSize: 13 * browserFontScale,
                                    lineHeight: 18 * browserFontScale,
                                },
                            ]}
                            numberOfLines={isExpanded ? undefined : 1}
                        >
                            {humanizeCardText(item.question, { showAudioFilenames: settings.showBrowserAudioFilenames }) || l('🃏 (boş)', '🃏 (empty)')}
                        </Text>
                        <View style={[styles.cardMeta]}>
                            <Text style={[styles.cardTopic]} numberOfLines={1}>
                                {isNotesMode
                                    ? `${rowNoteType ? localizeNoteTypeName(locale, rowNoteType.name) : l('Not', 'Note')} · ${noteDeckText}`
                                    : `${(deckById.get(item.deckId)?.name ?? sub?.name ?? item.subject).replaceAll('::', ' › ')}${item.topic ? ` · ${item.topic}` : ''}`}
                            </Text>
                            {!isNotesMode && item.state.status !== 'new' ? (
                                <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                    <Text style={[styles.statusDotText, { color: statusColor }]}>
                                        {item.state.status === 'learning' ? t('anki.learn') : t('anki.review')}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        {showAnswerSnippet && !isExpanded && (
                            <Text
                                style={[
                                    styles.answerSnippet,
                                    { fontSize: 11 * browserFontScale, lineHeight: 15 * browserFontScale },
                                ]}
                                numberOfLines={1}
                            >
                                {humanizeCardText(item.answer, { showAudioFilenames: settings.showBrowserAudioFilenames }) || '—'}
                            </Text>
                        )}
                        {showScheduleDetails && (
                            <Text
                                style={[
                                    styles.scheduleMeta,
                                    { fontSize: 10 * browserFontScale, lineHeight: 13 * browserFontScale },
                                ]}
                                numberOfLines={1}
                            >
                                {isNotesMode
                                    ? `▤ ${noteScheduleText}`
                                    : `⏱ ${l('Son:', 'Last:')} ${formatLastReview(item.state.lastReviewedAtMs, locale)} · ${l('Sonraki:', 'Next:')} ${formatNextDue(item.state, settings.dayRolloverHour, locale)}`}
                            </Text>
                        )}
                    </View>
                    <View style={[styles.cardActions]}>
                        {!selectionMode && (
                            <TouchableOpacity
                                style={[styles.editBtn]}
                                onPress={() => router.push(`/editor?cardId=${item.cardId}`)}
                                accessibilityRole="button"
                                accessibilityLabel={isNotesMode ? l('Notu düzenle', 'Edit note') : l('Kartı düzenle', 'Edit card')}
                            >
                                <Text style={[styles.editBtnText]}>✏️</Text>
                            </TouchableOpacity>
                        )}
                        {item.noteMarked && (
                            <Text style={[styles.flagIcon]} accessibilityLabel={l('Not işaretli', 'Note is marked')}>⭐</Text>
                        )}
                        {!isNotesMode && flag > 0 && (
                            <Text
                                style={[styles.flagIcon, { color: FLAG_COLORS[flag].color }]}
                                accessibilityLabel={l(`Bayrak: ${cardFlagName(locale, flag)}`, `Flag: ${cardFlagName(locale, flag)}`)}
                            >
                                ⚑
                            </Text>
                        )}
                        {!isNotesMode && item.state.suspended && <Text style={[styles.suspendedIcon]}>⏸️</Text>}
                    </View>
                </View>

                {isExpanded && !selectionMode && (
                    <View style={styles.expandedContent}>
                        <View style={styles.answerBox}>
                            <Text style={styles.answerLabel}>{isNotesMode ? l('İLK KARTIN CEVABI', 'FIRST CARD ANSWER') : l('CEVAP', 'ANSWER')}</Text>
                            <Text style={[styles.answerContent, { fontSize: FontSize.md * browserFontScale, lineHeight: 22 * browserFontScale }]}>{humanizeCardText(item.answer, { showAudioFilenames: settings.showBrowserAudioFilenames }) || '—'}</Text>
                        </View>

                        <View style={styles.cardDetails}>
                            {isNotesMode ? (
                                <>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Oluşturulan kartlar', 'Generated cards')}</Text>
                                        <Text style={styles.detailValue}>{noteSummary.cardCount}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Desteler', 'Decks')}</Text>
                                        <Text style={styles.detailValue}>{noteSummary.deckCount}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Ortalama aralık', 'Average interval')}</Text>
                                        <Text style={styles.detailValue}>{noteSummary.averageIntervalDays == null ? '—' : `${noteSummary.averageIntervalDays.toFixed(1)} ${l('gün', 'days')}`}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Ortalama kolaylık', 'Average ease')}</Text>
                                        <Text style={styles.detailValue}>{noteSummary.averageEaseFactor == null ? l('Yeni', 'New') : noteSummary.averageEaseFactor.toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Toplam tekrar / unutma', 'Total reviews / lapses')}</Text>
                                        <Text style={styles.detailValue}>{noteSummary.totalReviews} / {noteSummary.totalLapses}</Text>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Aralık', 'Interval')}</Text>
                                        <Text style={styles.detailValue}>{item.state.interval} {l('gün', 'days')}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Kolaylık', 'Ease')}</Text>
                                        <Text style={styles.detailValue}>{item.state.easeFactor.toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{l('Sonraki gösterim', 'Due')}</Text>
                                        <Text style={styles.detailValue}>{item.state.status === 'learning' ? l('Öğrenme sırasında', 'In learning') : item.state.dueDate}</Text>
                                    </View>
                                </>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.suspendBtn, item.state.suspended && styles.suspendBtnActive]}
                            onPress={() => {
                                if (isNotesMode) {
                                    toggleSelectedSuspend(expandSelectedCardsToNotes([item.cardId]), settings.dayRolloverHour);
                                    bumpDataVersion();
                                    reload();
                                } else {
                                    toggleSuspend(item.cardId, item.state.suspended);
                                }
                            }}
                        >
                            <Text style={styles.suspendBtnText}>
                                {isNotesMode
                                    ? item.state.suspended
                                        ? l('▶️ Notun kartlarını askıdan çıkar', '▶️ Unsuspend Note Cards')
                                        : l('⏸️ Notun kartlarını askıya al', '⏸️ Suspend Note Cards')
                                    : item.state.suspended
                                        ? l('▶️ Askıdan Çıkar', '▶️ Unsuspend')
                                        : `⏸️ ${t('anki.suspend')}`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.screenHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={l('Geri', 'Back')}
                >
                    <Text style={styles.backButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.screenTitle} numberOfLines={1}>{t('sidebar.myCards')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            <View style={styles.scopeToolbar}>
                <View style={styles.scopeBlock}>
                    <TouchableOpacity
                        style={styles.scopeSelector}
                        onPress={() => setDeckScopePickerVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Kart destesi: ${scopeTitle}`, `Card deck: ${scopeTitle}`)}
                        accessibilityState={{ expanded: deckScopePickerVisible }}
                    >
                        <Text style={styles.scopeSelectorText} numberOfLines={1}>{scopeTitle}</Text>
                        <Text style={styles.scopeSelectorCaret}>▾</Text>
                    </TouchableOpacity>
                    <Text style={styles.scopeCount}>
                        {scopeCountText} {tableMode === 'notes' ? l('not', 'notes') : l('kart', 'cards')}
                    </Text>
                </View>
                {browserSnapshot && !scopeDeck?.isFiltered && (
                    <TouchableOpacity
                        style={styles.addCardBtn}
                        onPress={() => router.push({
                            pathname: '/editor',
                            params: {
                                ...(scopeDeck
                                    ? { deckId: String(scopeDeck.id) }
                                    : {}),
                            },
                        } as any)}
                        accessibilityRole="button"
                        accessibilityLabel={tableMode === 'notes' ? l('Yeni not ekle', 'Add new note') : l('Yeni kart ekle', 'Add new card')}
                    >
                        <Text style={styles.addCardBtnText}>＋ {tableMode === 'notes' ? l('Yeni not', 'New Note') : l('Yeni kart', 'New Card')}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => setShowOverflowMenu(true)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={l('Diğer seçenekler', 'More options')}
                    accessibilityState={{ expanded: showOverflowMenu }}
                >
                    <Text style={styles.moreButtonText}>⋮</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <Pressable
                    style={styles.searchField}
                    onPress={() => searchInputRef.current?.focus()}
                    accessible={false}
                >
                    <View style={styles.searchIcon} pointerEvents="none">
                        <SearchIcon color={colors.textMuted} />
                    </View>
                    <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder={tableMode === 'notes'
                            ? l('Not ara veya deck:tag:is:…', 'Search notes or deck:tag:is:…')
                            : l('Ara veya deck:tag:is:…', 'Search or deck:tag:is:…')}
                        placeholderTextColor={colors.textMuted}
                        value={rawQuery}
                        onChangeText={handleSearch}
                        accessibilityLabel={tableMode === 'notes'
                            ? l('Not ara veya deck:tag:is:…', 'Search notes or deck:tag:is:…')
                            : l('Kart ara veya deck:tag:is:…', 'Search cards or deck:tag:is:…')}
                        returnKeyType="search"
                    />
                    {rawQuery.length > 0 && (
                        <TouchableOpacity
                            style={styles.searchClearButton}
                            // Through `handleSearch` rather than `setRawQuery`, so clearing goes
                            // through the same debounce the typed query does and the list actually
                            // returns to every card.
                            onPress={() => handleSearch('')}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={l('Aramayı temizle', 'Clear search')}
                        >
                            <Text style={styles.searchClearButtonText}>✕</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.searchHelpButton}
                        onPress={showSearchSyntaxHelp}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Arama sözdizimi yardımı', 'Search syntax help')}
                    >
                        <Text style={styles.searchHelpButtonText}>?</Text>
                    </TouchableOpacity>
                </Pressable>
            </View>

            {scopeHasCards && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                <TouchableOpacity
                    style={[styles.filterChip, allFilterActive && styles.filterChipActive]}
                    onPress={clearBrowserFilters}
                >
                    <Text style={[styles.filterChipText, allFilterActive && styles.filterChipTextActive]}>{t('common.all')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, markedOnly && styles.filterChipActive]}
                    onPress={() => setMarkedOnly((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Yalnızca işaretli notları göster', 'Show marked notes only')}
                >
                    <Text style={[styles.filterChipText, markedOnly && styles.filterChipTextActive]}>⭐ {l('İşaretli', 'Marked')}</Text>
                </TouchableOpacity>
                {suspendedOnly && (
                    <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setSuspendedOnly(false)}>
                        <Text style={[styles.filterChipText, styles.filterChipTextActive]}>⏸ {l('Askıda', 'Suspended')} ×</Text>
                    </TouchableOpacity>
                )}
                {tagFilters.length > 0 && (
                    <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setTagFilters([])}>
                        <Text style={[styles.filterChipText, styles.filterChipTextActive]}>⌗ {l(`${tagFilters.length} etiket`, `${tagFilters.length} tags`)} ×</Text>
                    </TouchableOpacity>
                )}
                {flagFilters.length < ALL_CARD_FLAGS.length && (
                    <>
                        {flagFilters.length === 0 && (
                            <TouchableOpacity
                                style={[styles.filterChip, styles.filterChipActive]}
                                onPress={() => setFlagFilters([...ALL_CARD_FLAGS])}
                                accessibilityRole="button"
                                accessibilityLabel={l('Bayrak filtresini kaldır', 'Remove flag filter')}
                            >
                                <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                    {l('Bayrak seçilmedi', 'No flags selected')} ×
                                </Text>
                            </TouchableOpacity>
                        )}
                        {hasNoFlagFilter && (
                            <TouchableOpacity
                                style={[styles.filterChip, styles.filterChipActive]}
                                onPress={clearNoFlagFilter}
                                accessibilityRole="button"
                                accessibilityLabel={l('Bayrak yok filtresini kaldır', 'Remove no flag filter')}
                            >
                                <View style={[styles.filterFlagDot, styles.filterFlagDotEmpty]} />
                                <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                    {l('Bayrak yok', 'No flag')} ×
                                </Text>
                            </TouchableOpacity>
                        )}
                        {coloredFlagFilters.length > 0 && (
                            <TouchableOpacity
                                style={[styles.filterChip, styles.filterChipActive]}
                                onPress={clearColoredFlagFilters}
                                accessibilityRole="button"
                                accessibilityLabel={
                                    coloredFlagFilters.length === 1
                                        ? l(`${cardFlagName(locale, coloredFlagFilters[0])} bayrak filtresini kaldır`, `Remove ${cardFlagName(locale, coloredFlagFilters[0])} flag filter`)
                                        : l('Bayrak filtresini kaldır', 'Remove flag filter')
                                }
                            >
                                {coloredFlagFilters.length === 1 && (
                                    <View style={[styles.filterFlagDot, { backgroundColor: FLAG_COLORS[coloredFlagFilters[0]].color }]} />
                                )}
                                <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                    {coloredFlagFilters.length === 1
                                        ? cardFlagName(locale, coloredFlagFilters[0])
                                        : l(`${coloredFlagFilters.length} bayrak`, `${coloredFlagFilters.length} flags`)} ×
                                </Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </ScrollView>
            )}

            <FlatList
                data={filteredCards}
                renderItem={renderCard}
                keyExtractor={(item) => String(item.cardId)}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshing={loading}
                onRefresh={reload}
                onEndReached={loadNextPage}
                onEndReachedThreshold={0.55}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                updateCellsBatchingPeriod={40}
                windowSize={7}
                removeClippedSubviews={Platform.OS !== 'web'}
                ListFooterComponent={loadingMore ? (
                    <View style={styles.pageLoader}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.pageLoaderText}>{tableMode === 'notes' ? l('Notlar yükleniyor…', 'Loading notes…') : l('Kartlar yükleniyor…', 'Loading cards…')}</Text>
                    </View>
                ) : null}
                ListEmptyComponent={!loading ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>
                            {loadingError
                                ? tableMode === 'notes' ? l('Notlar yüklenemedi', 'Notes could not be loaded') : l('Kartlar yüklenemedi', 'Cards could not be loaded')
                                : tableMode === 'notes' ? l('Gösterilecek not yok', 'No notes to show') : l('Gösterilecek kart yok', 'No cards to show')}
                        </Text>
                        <Text style={styles.emptyText}>
                            {loadingError
                                ? loadingError
                                : hasResultFilter
                                    ? tableMode === 'notes'
                                        ? l('Arama veya filtrelerle eşleşen not bulunamadı.', 'No notes match the search or filters.')
                                        : l('Arama veya filtrelerle eşleşen kart bulunamadı.', 'No cards match the search or filters.')
                                    : deckName
                                        ? tableMode === 'notes'
                                            ? l('Bu destede henüz not yok. İlk notunuzu eklemek için Yeni not düğmesini kullanın.', 'This deck has no notes yet. Use New Note to add the first one.')
                                            : l('Bu destede henüz kart yok. İlk kartınızı eklemek için Yeni kart düğmesini kullanın.', 'This deck has no cards yet. Use New Card to add the first one.')
                                        : tableMode === 'notes'
                                            ? l('Koleksiyonda henüz not yok. İlk notunuzu eklemek için Yeni not düğmesini kullanın.', 'There are no notes in the collection yet. Use New Note to add the first one.')
                                            : l('Koleksiyonda henüz kart yok. İlk kartınızı eklemek için Yeni kart düğmesini kullanın.', 'There are no cards in the collection yet. Use New Card to add the first one.')}
                        </Text>
                    </View>
                ) : null}
            />

            {selectionMode && (
                <View style={styles.selectionBar}>
                    <TouchableOpacity
                        style={styles.selectionBarCount}
                        onPress={closeSelection}
                        accessibilityLabel={l('Seçimi kapat', 'Close selection')}
                    >
                        <View style={styles.selectionBarCloseBox}>
                            <Text style={styles.selectionBarClose}>×</Text>
                        </View>
                        <Text style={styles.selectionBarCountText} numberOfLines={1}>
                            {selectedCardIds.size} {tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}
                        </Text>
                    </TouchableOpacity>
                    <View style={styles.selectionActionsGroup}>
                        <TouchableOpacity
                            style={styles.selectionAction}
                            disabled={selectedCardIds.size === 0}
                            onPress={() => {
                                if (hasCatalogCardsSelected) {
                                    alert(
                                        l('Katalog Korumalı', 'Catalog Protected'),
                                        l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                                    );
                                    return;
                                }
                                setShowDeckPicker(true);
                            }}
                        >
                            <View style={styles.selectionActionIconBox}>
                                <SelectionDeckIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                            </View>
                            <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                                {l('Deste', 'Deck')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionAction}
                            disabled={selectedCardIds.size === 0}
                            onPress={toggleSelectionSuspended}
                        >
                            <View style={styles.selectionActionIconBox}>
                                <SelectionSuspendIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                            </View>
                            <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                                {l('Askı', 'Suspend')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionAction}
                            disabled={selectedCardIds.size === 0}
                            onPress={() => setFlagPickerMode('selection')}
                        >
                            <View style={styles.selectionActionIconBox}>
                                <SelectionFlagIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                            </View>
                            <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                                {l('Bayrak', 'Flag')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionAction}
                            disabled={selectedCardIds.size === 0}
                            onPress={() => setShowSelectionMenu(true)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Diğer kart işlemleri', 'More card actions')}
                            accessibilityState={{ expanded: showSelectionMenu }}
                        >
                            <View style={styles.selectionActionIconBox}>
                                <SelectionMoreIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                            </View>
                            <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                                {l('Diğer', 'More')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {deckScopePickerVisible && <DeckPickerModal
                visible={deckScopePickerVisible}
                colors={colors}
                decks={deckScopePickerItems}
                selectedDeckName={deckName}
                activeDeckName={deckName || activeDeckName || null}
                title={l('Deste seç', 'Select Deck')}
                allDecksLabel={l('Tüm koleksiyon', 'Whole Collection')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckScopePickerVisible(false)}
                onSelect={handlePickDeckScope}
                onCreateDeck={(name) => {
                    const created = createDeck(getAvailableDeckName(name));
                    bumpDataVersion();
                    return created.name;
                }}
            />}

            <Modal visible={showSelectionMenu} transparent animationType="fade" onRequestClose={() => setShowSelectionMenu(false)}>
                <View style={styles.selectionMenuOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSelectionMenu(false)} />
                    <SwipeDismissSheet
                        active={showSelectionMenu}
                        style={styles.selectionMenuCard}
                        onDismiss={() => setShowSelectionMenu(false)}
                        accessibilityViewIsModal
                    >
                        <View style={styles.selectionMenuHeader}>
                            <Text style={styles.selectionMenuTitle}>
                                {selectedCardIds.size} {tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}
                            </Text>
                            <TouchableOpacity style={styles.selectionMenuClose} onPress={() => setShowSelectionMenu(false)}>
                                <Text style={styles.selectionMenuCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedSuspend(selectedActionCardIds, settings.dayRolloverHour))}>
                                <Text style={styles.selectionMenuIcon}>⏸</Text><Text style={styles.selectionMenuText}>{l('Askıya al / askıdan çıkar', 'Toggle suspend')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedBury(selectedActionCardIds, settings.dayRolloverHour))}>
                                <Text style={styles.selectionMenuIcon}>💤</Text><Text style={styles.selectionMenuText}>{l('Göm / gömmeden çıkar', 'Toggle bury')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.selectionMenuItem}
                                onPress={() => {
                                    if (hasCatalogNotesSelected || hasCatalogCardsSelected) {
                                        alert(
                                            l('Katalog Korumalı', 'Catalog Protected'),
                                            l('Dahili TUS kartlarının not türü değiştirilemez.', 'Built-in TUS cards cannot have their note type changed.')
                                        );
                                        return;
                                    }
                                    setShowSelectionMenu(false);
                                    setShowNoteTypePicker(true);
                                }}
                            >
                                <Text style={styles.selectionMenuIcon}>🗂</Text><Text style={styles.selectionMenuText}>{l('Not türünü değiştir', 'Change note type')}</Text><Text style={styles.overflowChevron}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.selectionMenuItem}
                                onPress={() => {
                                    if (hasCatalogCardsSelected) {
                                        alert(
                                            l('Katalog Korumalı', 'Catalog Protected'),
                                            l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                                        );
                                        return;
                                    }
                                    setShowSelectionMenu(false);
                                    setShowDeckPicker(true);
                                }}
                            >
                                <Text style={styles.selectionMenuIcon}>▤</Text><Text style={styles.selectionMenuText}>{l('Desteyi değiştir', 'Change deck')}</Text><Text style={styles.overflowChevron}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setRepositionStart('1'); setRepositionStep('1'); setRepositionShiftExisting(true); setShowRepositionDialog(true); }}>
                                <Text style={styles.selectionMenuIcon}>↕</Text><Text style={styles.selectionMenuText}>{l('Yeniden konumlandır', 'Reposition')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setDueInput('0'); setShowDueDialog(true); }}>
                                <Text style={styles.selectionMenuIcon}>📅</Text><Text style={styles.selectionMenuText}>{l('Vade tarihini ayarla', 'Set due date')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={openSelectionTags}>
                                <Text style={styles.selectionMenuIcon}>🏷</Text><Text style={styles.selectionMenuText}>{l('Etiketleri düzenle', 'Edit tags')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setShowGradePicker(true); }}>
                                <Text style={styles.selectionMenuIcon}>✓</Text><Text style={styles.selectionMenuText}>{l('Şimdi derecelendir', 'Grade now')}</Text><Text style={styles.overflowChevron}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.selectionMenuItem}
                                onPress={() => {
                                    setShowSelectionMenu(false);
                                    confirm(
                                        l('İlerlemeyi sıfırla', 'Reset Progress'),
                                        l(`${selectedActionCardIds.length} kart yeni kuyruğunun sonuna taşınacak. İnceleme geçmişi korunur.`, `${selectedActionCardIds.length} cards will be moved to the end of the new queue. Review history is preserved.`),
                                        () => runSelectionAction(() => resetSelectedProgress(selectedActionCardIds, settings)),
                                        { destructive: true },
                                    );
                                }}
                            >
                                <Text style={styles.selectionMenuIcon}>↺</Text><Text style={styles.selectionMenuText}>{l('İlerlemeyi sıfırla', 'Reset progress')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setPreviewAnswerVisible(false); setPreviewIndex(0); }}>
                                <Text style={styles.selectionMenuIcon}>👁</Text><Text style={styles.selectionMenuText}>{l('Önizle', 'Preview')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.selectionMenuItem}
                                onPress={() => {
                                    if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
                                        alert(
                                            l('Katalog Korumalı', 'Catalog Protected'),
                                            l('Dahili TUS kartları telif korumalıdır ve dışa aktarılamaz.', 'Built-in TUS cards are protected and cannot be exported.')
                                        );
                                        return;
                                    }
                                    setDbSetting('browser_export_card_ids', JSON.stringify(selectedActionCardIds));
                                    setShowSelectionMenu(false);
                                    router.push('/export?selection=browser' as any);
                                }}
                            >
                                <Text style={styles.selectionMenuIcon}>⇧</Text><Text style={styles.selectionMenuText}>{tableMode === 'notes' ? l('Notları dışa aktar', 'Export notes') : l('Kartları dışa aktar', 'Export cards')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.selectionMenuItem}
                                onPress={() => {
                                    if (hasCatalogNotesSelected || hasCatalogCardsSelected) {
                                        alert(
                                            l('Katalog Korumalı', 'Catalog Protected'),
                                            l('Dahili TUS kartları silinemez. Kataloğu kaldırmak için Ayarlar ekranını kullanabilirsiniz.', 'Built-in TUS cards cannot be deleted. Use Settings to remove the catalog.')
                                        );
                                        return;
                                    }
                                    setShowSelectionMenu(false);
                                    confirm(
                                        l('Notları sil', 'Delete Notes'),
                                        l(`${selectedNoteIds.length} not ve bu notlara bağlı tüm kartlar kalıcı olarak silinecek.`, `${selectedNoteIds.length} notes and all cards belonging to them will be permanently deleted.`),
                                        () => {
                                            try {
                                                for (const noteId of selectedNoteIds) deleteNote(noteId);
                                                closeSelection();
                                                refreshSelection();
                                            } catch (error) {
                                                console.warn('[Browser] delete selected notes failed:', error);
                                                alert(t('common.error'), l('Notlar silinemedi.', 'The notes could not be deleted.'));
                                            }
                                        },
                                        { destructive: true },
                                    );
                                }}
                            >
                                <Text style={[styles.selectionMenuIcon, styles.selectionMenuDanger]}>⌫</Text><Text style={[styles.selectionMenuText, styles.selectionMenuDanger]}>{l('Notları sil', 'Delete notes')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </SwipeDismissSheet>
                </View>
            </Modal>

            <Modal visible={showOverflowMenu} transparent animationType="fade" onRequestClose={() => setShowOverflowMenu(false)}>
                <View style={styles.overflowOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOverflowMenu(false)} />
                    <View style={styles.overflowMenu} accessibilityViewIsModal>
                        <ScrollView bounces={false} showsVerticalScrollIndicator={showFlagFilterMenu}>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowSortPicker(true); }}>
                            <Text style={styles.overflowItemIcon}>↕</Text>
                            <Text style={styles.overflowItemText}>{l('Görüntüleme sırasını değiştir', 'Change display order')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => { setMarkedOnly((value) => !value); setShowOverflowMenu(false); }}>
                            <Text style={styles.overflowItemIcon}>★</Text>
                            <Text style={styles.overflowItemText}>{l('İşaretlileri filtrele', 'Filter marked')}</Text>
                            {markedOnly && <Text style={styles.overflowCheck}>✓</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => { setSuspendedOnly((value) => !value); setShowOverflowMenu(false); }}>
                            <Text style={styles.overflowItemIcon}>⏸</Text>
                            <Text style={styles.overflowItemText}>{l('Askıdakileri filtrele', 'Filter suspended')}</Text>
                            {suspendedOnly && <Text style={styles.overflowCheck}>✓</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowTagFilter(true); }}>
                            <Text style={styles.overflowItemIcon}>⌗</Text>
                            <Text style={styles.overflowItemText}>{l('Etikete göre filtrele', 'Filter by tag')}</Text>
                            {tagFilters.length > 0 && <Text style={styles.overflowBadge}>{tagFilters.length}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={openFlagFilter}>
                            <Text style={styles.overflowItemIcon}>⚑</Text>
                            <Text style={styles.overflowItemText}>{l('Bayrağa göre filtrele', 'Filter by flag')}</Text>
                            {/* Mirrors the chips under the search field: "no flag" is a filter of its
                                own, so it shows its own ring instead of being counted as a colour.
                                Counting it made "no flag + red" read as two flags. */}
                            {flagFilters.length !== ALL_CARD_FLAGS.length && (
                                <>
                                    {hasNoFlagFilter && <View style={[styles.menuFlagDot, styles.menuFlagDotEmpty]} />}
                                    {coloredFlagFilters.length === 1 && (
                                        <View style={[styles.menuFlagDot, { backgroundColor: FLAG_COLORS[coloredFlagFilters[0]].color }]} />
                                    )}
                                    {coloredFlagFilters.length > 1 && (
                                        <Text style={styles.overflowBadge}>{coloredFlagFilters.length}</Text>
                                    )}
                                </>
                            )}
                            <Text style={styles.overflowChevron}>{showFlagFilterMenu ? '⌄' : '›'}</Text>
                        </TouchableOpacity>
                        {showFlagFilterMenu && (
                            <View style={styles.overflowFlagPanel}>
                                <TouchableOpacity
                                    style={[styles.overflowFlagRow, flagFilters.length === ALL_CARD_FLAGS.length && styles.overflowFlagRowActive]}
                                    onPress={toggleAllFlagFilters}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: flagFilters.length === ALL_CARD_FLAGS.length }}
                                >
                                    <View style={styles.flagDotPlaceholder} />
                                    <Text style={[styles.overflowFlagText, flagFilters.length === ALL_CARD_FLAGS.length && styles.overflowFlagTextActive]}>
                                        {l('Tümünü seç', 'Select all')}
                                    </Text>
                                    <View style={[
                                        styles.checkbox,
                                        flagFilters.length > 0 && styles.checkboxChecked,
                                        flagFilters.length > 0 && flagFilters.length < ALL_CARD_FLAGS.length && styles.checkboxPartial,
                                    ]}>
                                        {flagFilters.length > 0 && (
                                            <Text style={styles.checkboxTick}>
                                                {flagFilters.length === ALL_CARD_FLAGS.length ? '✓' : '−'}
                                            </Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                                {ALL_CARD_FLAGS.map((flag) => {
                                    const selected = flagFilters.includes(flag);
                                    return (
                                        <TouchableOpacity
                                            key={flag}
                                            style={[styles.overflowFlagRow, selected && styles.overflowFlagRowActive]}
                                            onPress={() => toggleFlagFilter(flag)}
                                            accessibilityRole="checkbox"
                                            accessibilityState={{ checked: selected }}
                                            accessibilityLabel={flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                        >
                                            <View style={[styles.flagDot, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                                            <Text style={[styles.overflowFlagText, selected && styles.overflowFlagTextActive]}>
                                                {flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                            </Text>
                                            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                                                {selected && <Text style={styles.checkboxTick}>✓</Text>}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                                <View style={styles.overflowFlagFooter}>
                                    <Text style={styles.overflowFlagCount}>
                                        {l(`${flagFilters.length} seçenek seçili`, `${flagFilters.length} selected`)}
                                    </Text>
                                </View>
                            </View>
                        )}
                        <View style={styles.overflowSeparator} />
                        <TouchableOpacity
                            style={[styles.overflowItem, lastDeckMove.length === 0 && styles.overflowItemDisabled]}
                            disabled={lastDeckMove.length === 0}
                            onPress={undoDeckMove}
                        >
                            <Text style={styles.overflowItemIcon}>↶</Text>
                            <Text style={styles.overflowItemText}>{l('Geri al: Deste güncelleme', 'Undo Update Deck')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.overflowItem, filteredCards.length === 0 && styles.overflowItemDisabled]}
                            disabled={filteredCards.length === 0}
                            onPress={() => { setShowOverflowMenu(false); selectAllVisible(); }}
                        >
                            <Text style={styles.overflowItemIcon}>☑</Text>
                            <Text style={styles.overflowItemText}>
                                {hasMoreCards
                                    ? l(`Yüklenenleri seç (${filteredCards.length})`, `Select loaded (${filteredCards.length})`)
                                    : l('Tümünü seç', 'Select all')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowOptions(true); }}>
                            <Text style={styles.overflowItemIcon}>⚙</Text>
                            <Text style={styles.overflowItemText}>{l('Seçenekler', 'Options')}</Text>
                        </TouchableOpacity>
                        <View style={styles.overflowSeparator} />
                        <TouchableOpacity style={styles.overflowItem} onPress={openFilteredDeckDialog}>
                            <Text style={styles.overflowItemIcon}>⧉</Text>
                            <Text style={styles.overflowItemText}>{l('Filtrelenmiş deste oluştur', 'Create filtered deck')}</Text>
                        </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={showSortPicker} transparent animationType="fade" onRequestClose={() => setShowSortPicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSortPicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Görüntüleme sırası', 'Display Order')}</Text>
                        <View style={styles.directionRow}>
                            <TouchableOpacity
                                style={[styles.directionButton, !sortDescending && styles.directionButtonActive]}
                                onPress={() => updateSortDirection(false)}
                            >
                                <Text style={[styles.directionText, !sortDescending && styles.directionTextActive]}>↑ {l('Artan', 'Ascending')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.directionButton, sortDescending && styles.directionButtonActive]}
                                onPress={() => updateSortDirection(true)}
                            >
                                <Text style={[styles.directionText, sortDescending && styles.directionTextActive]}>↓ {l('Azalan', 'Descending')}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.pickerList}>
                            {BROWSER_SORT_KEYS.map((key) => (
                                <TouchableOpacity key={key} style={[styles.pickerRow, sortKey === key && styles.pickerRowActive]} onPress={() => updateSort(key)}>
                                    <Text style={[styles.pickerRowText, sortKey === key && styles.pickerRowTextActive]}>{sortLabels[key]}</Text>
                                    {sortKey === key && <Text style={styles.pickerCheck}>✓</Text>}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSortPicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {showTagFilter && <TagPickerModal
                visible={showTagFilter}
                selectedTags={tagFilters}
                allowCreate={false}
                loadTags={loadScopedTags}
                title={l('Etikete göre filtrele', 'Filter by Tag')}
                onCancel={() => setShowTagFilter(false)}
                onConfirm={(tags) => {
                    setTagFilters(tags);
                    setShowTagFilter(false);
                }}
            />}

            {showSelectionTags && <TagPickerModal
                visible={showSelectionTags}
                selectedTags={selectionTagBaseline}
                allowCreate
                title={l('Seçili notların etiketleri', 'Tags for Selected Notes')}
                onCancel={() => setShowSelectionTags(false)}
                onConfirm={(tags) => {
                    const baselineKeys = new Set(selectionTagBaseline.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
                    const nextKeys = new Set(tags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
                    const addTags = tags.filter((tag) => !baselineKeys.has(tag.normalize('NFC').toLocaleLowerCase()));
                    const removeTags = selectionTagBaseline.filter((tag) => !nextKeys.has(tag.normalize('NFC').toLocaleLowerCase()));
                    setShowSelectionTags(false);
                    runSelectionAction(() => updateNotesTags(selectedNoteIds, addTags, removeTags));
                }}
            />}

            <Modal visible={showNoteTypePicker} transparent animationType="fade" onRequestClose={() => setShowNoteTypePicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowNoteTypePicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Not türünü değiştir', 'Change Note Type')}</Text>
                        <Text style={styles.modalCaption}>{l('Aynı adlı alanlar eşleştirilir; kartların mevcut zamanlaması korunur.', 'Fields with matching names are mapped; existing card scheduling is preserved.')}</Text>
                        <ScrollView style={styles.pickerList}>
                            {selectableNoteTypes.map((noteType) => (
                                <TouchableOpacity
                                    key={noteType.id}
                                    style={styles.pickerRow}
                                    onPress={() => {
                                        setShowNoteTypePicker(false);
                                        runSelectionAction(() => changeNotesType(selectedNoteIds, noteType.id));
                                    }}
                                >
                                    <Text style={styles.pickerRowText}>{localizeNoteTypeName(locale, noteType.name)}</Text>
                                    <Text style={styles.overflowChevron}>›</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowNoteTypePicker(false)}>
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showRepositionDialog} transparent animationType="fade" onRequestClose={() => setShowRepositionDialog(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowRepositionDialog(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Yeniden Konumlandır', 'Reposition')}</Text>
                        <Text style={styles.modalCaption}>{l('Yalnızca seçili yeni kartlar etkilenir.', 'Only selected new cards are affected.')}</Text>
                        <Text style={styles.fieldLabel}>{l('Başlangıç konumu', 'Start position')}</Text>
                        <TextInput style={styles.dialogInput} value={repositionStart} onChangeText={(value) => setRepositionStart(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                        <Text style={styles.fieldLabel}>{l('Adım', 'Step')}</Text>
                        <TextInput style={styles.dialogInput} value={repositionStep} onChangeText={(value) => setRepositionStep(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setRepositionShiftExisting((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: repositionShiftExisting }}>
                            <View style={[styles.checkbox, repositionShiftExisting && styles.checkboxChecked]}>{repositionShiftExisting ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
                            <Text style={styles.checkboxLabel}>{l('Mevcut kartların konumunu kaydır', 'Shift position of existing cards')}</Text>
                        </TouchableOpacity>
                        <View style={styles.dialogActions}>
                            <TouchableOpacity style={styles.dialogButton} onPress={() => setShowRepositionDialog(false)}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.dialogButton, styles.dialogButtonPrimary]}
                                onPress={() => {
                                    const count = repositionSelectedNewCards(selectedActionCardIds, Number(repositionStart), Number(repositionStep), repositionShiftExisting);
                                    setShowRepositionDialog(false);
                                    if (count === 0) {
                                        alert(l('Yeni kart yok', 'No new cards'), l('Seçimde yeniden konumlandırılabilecek yeni kart bulunmuyor.', 'The selection contains no new cards that can be repositioned.'));
                                        return;
                                    }
                                    refreshSelection();
                                }}
                            ><Text style={styles.dialogButtonPrimaryText}>{l('Uygula', 'Apply')}</Text></TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={showDueDialog} transparent animationType="fade" onRequestClose={() => setShowDueDialog(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDueDialog(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Vade tarihini ayarla', 'Set Due Date')}</Text>
                        <Text style={styles.modalCaption}>{l('Örnek: 5, 3-7 veya aralığı da değiştirmek için 3-7!', 'Examples: 5, 3-7, or 3-7! to also change the interval.')}</Text>
                        <TextInput style={styles.dialogInput} value={dueInput} onChangeText={setDueInput} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={colors.textMuted} />
                        <View style={styles.dialogActions}>
                            <TouchableOpacity style={styles.dialogButton} onPress={() => setShowDueDialog(false)}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.dialogButton, styles.dialogButtonPrimary]}
                                onPress={() => {
                                    const range = parseDueRange(dueInput);
                                    if (!range) {
                                        alert(l('Geçersiz vade', 'Invalid due date'), l('Tek bir gün veya 3-7 biçiminde bir aralık girin.', 'Enter one day or a range such as 3-7.'));
                                        return;
                                    }
                                    setShowDueDialog(false);
                                    runSelectionAction(() => setSelectedDueDate(selectedActionCardIds, range, settings));
                                }}
                            ><Text style={styles.dialogButtonPrimaryText}>{l('Uygula', 'Apply')}</Text></TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={showGradePicker} transparent animationType="fade" onRequestClose={() => setShowGradePicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGradePicker(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Şimdi derecelendir', 'Grade Now')}</Text>
                        <Text style={styles.modalCaption}>{l('Seçili kartlar normal zamanlayıcı ve inceleme geçmişi kullanılarak derecelendirilir.', 'Selected cards are graded through the normal scheduler and review history.')}</Text>
                        {([
                            { grade: 1 as const, label: l('Tekrar', 'Again'), color: colors.btnAgain },
                            { grade: 2 as const, label: l('Zor', 'Hard'), color: colors.btnHard },
                            { grade: 3 as const, label: l('İyi', 'Good'), color: colors.btnGood },
                            { grade: 4 as const, label: l('Kolay', 'Easy'), color: colors.btnEasy },
                        ]).map((option) => (
                            <TouchableOpacity
                                key={option.grade}
                                style={styles.gradeRow}
                                onPress={() => {
                                    setShowGradePicker(false);
                                    runSelectionAction(() => gradeSelectedNow(selectedActionCardIds, option.grade, settings));
                                }}
                            >
                                <View style={[styles.gradeDot, { backgroundColor: option.color }]} />
                                <Text style={styles.gradeText}>{option.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            <Modal
                visible={previewIndex !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                allowSwipeDismissal
                onRequestClose={() => setPreviewIndex(null)}
            >
                <SafeAreaView style={styles.previewContainer}>
                    <View style={styles.previewGrabberArea} pointerEvents="none">
                        <View style={styles.previewGrabber} />
                    </View>
                    <View style={styles.previewHeader}>
                        <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewIndex(null)}><Text style={styles.previewHeaderButtonText}>×</Text></TouchableOpacity>
                        <Text style={styles.previewTitle}>{l('Önizleme', 'Preview')} · {(previewIndex ?? 0) + 1}/{selectedCards.length}</Text>
                        <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewAnswerVisible((value) => !value)}><Text style={styles.previewFlipText}>{previewAnswerVisible ? l('Soru', 'Question') : l('Cevap', 'Answer')}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.previewBody}>
                        {previewNote && previewNoteType && previewRawCard ? (
                            <CardWebView
                                noteType={previewNoteType}
                                note={previewNote}
                                card={previewRawCard}
                                deck={previewDeck}
                                side={previewAnswerVisible ? 'answer' : 'question'}
                                scrollMode="contained"
                                maxHeight={Math.max(260, Math.min(520, windowHeight - 210))}
                            />
                        ) : <Text style={styles.modalCaption}>{tableMode === 'notes' ? l('Notun ilk kartı önizlenemedi.', "The note's first card could not be previewed.") : l('Kart önizlenemedi.', 'The card could not be previewed.')}</Text>}
                    </View>
                    <View style={styles.previewNavigation}>
                        <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) <= 0} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.max(0, (index ?? 0) - 1)); }}><Text style={styles.previewNavText}>‹ {l('Önceki', 'Previous')}</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) >= selectedCards.length - 1} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.min(selectedCards.length - 1, (index ?? 0) + 1)); }}><Text style={styles.previewNavText}>{l('Sonraki', 'Next')} ›</Text></TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Modal>

            <Modal visible={flagPickerMode !== null} transparent animationType="fade" onRequestClose={() => setFlagPickerMode(null)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setFlagPickerMode(null)} />
                    <View style={[styles.modalCard, styles.flagPickerCard]} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{tableMode === 'notes' ? l('Seçili notların kartlarını bayrakla', 'Flag Cards of Selected Notes') : l('Seçili kartları bayrakla', 'Flag Selected Cards')}</Text>
                        {ALL_CARD_FLAGS.map((flag) => (
                            <TouchableOpacity key={flag} style={styles.pickerRow} onPress={() => applyFlag(flag)}>
                                <View style={[styles.flagDot, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                                <Text style={styles.pickerRowText}>
                                    {flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            <Modal visible={showSearchHelp} transparent animationType="fade" onRequestClose={() => setShowSearchHelp(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSearchHelp(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Arama nasıl çalışır?', 'How search works')}</Text>
                        <Text style={styles.modalCaption}>
                            {l(
                                'Kelime yazınca kart metni, etiketler ve deste adı taranır. Aşağıdaki terimlerden birine dokunarak aramanıza ekleyebilirsiniz.',
                                'Plain words search the card text, its tags and its deck name. Tap any term below to add it to your search.',
                            )}
                        </Text>
                        <ScrollView style={styles.searchHelpList} showsVerticalScrollIndicator={false}>
                            {searchHelpGroups.map((group) => (
                                <View key={group.title}>
                                    <Text style={styles.searchHelpGroupTitle}>{group.title}</Text>
                                    {group.items.map((item) => (
                                        <TouchableOpacity
                                            key={item.term}
                                            style={styles.searchHelpRow}
                                            onPress={() => appendSearchTerm(item.term)}
                                            accessibilityRole="button"
                                            accessibilityLabel={l(`${item.term} terimini aramaya ekle`, `Add the term ${item.term} to the search`)}
                                        >
                                            <Text style={styles.searchHelpTerm}>{item.term}</Text>
                                            <Text style={styles.searchHelpHint} numberOfLines={2}>{item.hint}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSearchHelp(false)}>
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOptions(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text style={styles.modalTitle}>{l('Kart tarayıcısı seçenekleri', 'Card Browser Options')}</Text>
                        <Text style={styles.optionTitle}>{l('Görünüm', 'View')}</Text>
                        <Text style={styles.optionCaption}>{l('Listede kartları veya her notu tek satır olarak göster.', 'Show cards, or show each note as a single row.')}</Text>
                        <View style={styles.directionRow}>
                            <TouchableOpacity
                                style={[styles.directionButton, tableMode === 'cards' && styles.directionButtonActive]}
                                onPress={() => updateTableMode('cards')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: tableMode === 'cards' }}
                            >
                                <Text style={[styles.directionText, tableMode === 'cards' && styles.directionTextActive]}>{l('Kartlar', 'Cards')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.directionButton, tableMode === 'notes' && styles.directionButtonActive]}
                                onPress={() => updateTableMode('notes')}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: tableMode === 'notes' }}
                            >
                                <Text style={[styles.directionText, tableMode === 'notes' && styles.directionTextActive]}>{l('Notlar', 'Notes')}</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.optionRow}>
                            <View style={styles.optionCopy}>
                                <Text style={styles.optionTitle}>{l('Yanıt önizlemesini göster', 'Show answer preview')}</Text>
                                <Text style={styles.optionCaption}>{l('Kart satırında cevabın kısa bir bölümünü gösterir.', 'Shows a short answer excerpt in each row.')}</Text>
                            </View>
                            <Switch value={showAnswerSnippet} onValueChange={(value) => updateBrowserOption('answer', value)} trackColor={{ true: colors.accentLight }} thumbColor={showAnswerSnippet ? colors.accent : colors.textMuted} />
                        </View>
                        <View style={styles.optionRow}>
                            <View style={styles.optionCopy}>
                                <Text style={styles.optionTitle}>{l('Zamanlama ayrıntıları', 'Scheduling details')}</Text>
                                <Text style={styles.optionCaption}>{l('Son çalışma ve sonraki gösterim bilgisini gösterir.', 'Shows last review and next due information.')}</Text>
                            </View>
                            <Switch value={showScheduleDetails} onValueChange={(value) => updateBrowserOption('schedule', value)} trackColor={{ true: colors.accentLight }} thumbColor={showScheduleDetails ? colors.accent : colors.textMuted} />
                        </View>
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowOptions(false)}>
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {showDeckPicker && <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={batchMoveDeckItems}
                selectedDeckName={selectedCardsDeckName || deckName || null}
                activeDeckName={selectedCardsDeckName || deckName || activeDeckName || null}
                title={l('Seçili Kartların Destesi', 'Deck for Selected Cards')}
                allDecksLabel={null}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setShowDeckPicker(false)}
                onSelect={(name) => {
                    if (!name) return;
                    const deck = getDeckByName(name);
                    if (deck) moveSelectionToDeck(deck.id);
                }}
                onCreateDeck={(name) => {
                    const created = createDeck(getAvailableDeckName(name));
                    bumpDataVersion();
                    return created.name;
                }}
            />}

            <ProtectedContentShield state={screenGuardState} />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    screenHeader: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        backgroundColor: colors.bgCard,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    screenTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
    headerSpacer: { width: 44 },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { fontSize: 40, lineHeight: 42, color: colors.accent, fontWeight: '300' },
    scopeToolbar: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    scopeBlock: { flex: 1, minWidth: 0 },
    scopeSelector: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30, maxWidth: '100%' },
    scopeSelectorText: { flexShrink: 1, color: colors.accent, fontSize: FontSize.lg, fontWeight: '800' },
    scopeSelectorCaret: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '800', marginTop: 2 },
    scopeCount: { color: colors.textMuted, fontSize: FontSize.xs, marginTop: 1 },
    addCardBtn: {
        flexShrink: 0,
        backgroundColor: colors.accent,
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        borderRadius: BorderRadius.sm,
    },
    addCardBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
    moreButton: {
        width: 40,
        height: 40,
        flexShrink: 0,
        marginRight: -6,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreButtonText: { color: colors.textSecondary, fontSize: 28, lineHeight: 30, fontWeight: '700' },

    searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    searchField: {
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingLeft: Spacing.md,
        paddingRight: Spacing.xs,
    },
    searchIcon: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.sm,
    },
    searchHelpButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchHelpButtonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textMuted },
    searchClearButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bgInput,
    },
    searchClearButtonText: { fontSize: 13, fontWeight: '700', color: colors.textMuted, lineHeight: 15 },
    searchInput: {
        flex: 1,
        minWidth: 0,
        height: '100%',
        paddingTop: 0,
        paddingBottom: 0,
        paddingHorizontal: 0,
        fontSize: FontSize.md,
        color: colors.textPrimary,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },

    // flexGrow: 0 + centered content pin the chips to their natural size; otherwise the
    // row stretches into leftover space when the list below is short, inflating the chips.
    filterScroll: { minHeight: 42, maxHeight: 42, flexGrow: 0 },
    filterContent: { paddingHorizontal: Spacing.lg, gap: 6, alignItems: 'center' },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    filterChipText: { fontSize: FontSize.sm, color: colors.textSecondary },
    filterChipTextActive: { color: colors.accent, fontWeight: '600' },
    filterFlagDot: { width: 10, height: 10, borderRadius: 5 },
    filterFlagDotEmpty: {
        borderWidth: 1.5,
        borderColor: colors.accent,
        backgroundColor: 'transparent',
    },

    list: { flex: 1 },
    listContent: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
    emptyState: { flex: 1, justifyContent: 'center', paddingVertical: 48, paddingHorizontal: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
    emptyTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center' },
    emptyText: { color: colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
    pageLoader: { paddingVertical: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
    pageLoaderText: { color: colors.textSecondary, fontSize: FontSize.sm },

    cardItem: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm + 1,
        paddingVertical: 4,
        paddingHorizontal: Spacing.md - 2,
        ...Shadows.sm,
    },
    cardItemSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    // Anki tints the row instead of fading it: a suspended card is out of the queue, not less
    // worth reading. Fading it was the old treatment and made the text look washed out.
    cardSuspended: { backgroundColor: colors.rowSuspendedBg, borderColor: colors.streak },
    cardBuried: { backgroundColor: colors.rowBuriedBg },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardIcon: { fontSize: 17, marginTop: 1 },
    cardBody: { flex: 1, minWidth: 0 },
    cardQuestion: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },
    cardMeta: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    cardTopic: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 14, color: colors.textMuted },
    statusDot: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
    statusDotText: { fontSize: 9, fontWeight: '600' },
    scheduleMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
    answerSnippet: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    selectionCheckbox: {
        width: 17,
        height: 17,
        marginTop: 1,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionCheckboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    selectionCheckboxTick: { color: colors.white, fontSize: 11, lineHeight: 13, fontWeight: '900' },
    cardActions: {
        width: 24,
        flexShrink: 0,
        alignItems: 'center',
        gap: 2,
    },
    editBtn: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: colors.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtnText: { fontSize: 12 },
    suspendedIcon: { fontSize: 14 },
    flagIcon: { fontSize: 14 },

    expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
    answerBox: {
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    answerLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1,
        color: colors.accent,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    answerContent: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 22 },
    cardDetails: { gap: 4, marginBottom: Spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: FontSize.sm, color: colors.textMuted },
    detailValue: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '500' },

    suspendBtn: {
        paddingVertical: Spacing.sm,
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    suspendBtnActive: { backgroundColor: colors.accentLight },
    suspendBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },

    selectionBar: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingBottom: Spacing.xs,
        backgroundColor: colors.bgCard,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        ...Shadows.lg,
    },
    selectionBarCount: {
        flex: 1,
        minWidth: 80,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.xs,
    },
    selectionBarCloseBox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionBarClose: {
        color: colors.textSecondary,
        fontSize: 24,
        lineHeight: 26,
        fontWeight: '300',
    },
    selectionBarCountText: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    selectionActionsGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    selectionAction: {
        width: 60,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.sm,
    },
    selectionActionIconBox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionActionText: {
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: '600',
        marginTop: 3,
        textAlign: 'center',
    },
    selectionActionTextDisabled: {
        color: colors.textMuted,
    },

    selectionMenuOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.32)',
    },
    selectionMenuCard: {
        maxHeight: '78%',
        paddingTop: 32,
        paddingBottom: Spacing.xl,
        overflow: 'hidden',
        backgroundColor: colors.bgCard,
        borderTopLeftRadius: BorderRadius.lg,
        borderTopRightRadius: BorderRadius.lg,
        ...Shadows.lg,
    },
    selectionMenuHeader: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: Spacing.lg,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    selectionMenuTitle: { flex: 1, color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
    selectionMenuClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    selectionMenuCloseText: { color: colors.textMuted, fontSize: 30, lineHeight: 32, fontWeight: '300' },
    selectionMenuItem: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    selectionMenuIcon: { width: 28, textAlign: 'center', color: colors.accent, fontSize: 19 },
    selectionMenuText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '500' },
    selectionMenuDanger: { color: colors.btnAgain },

    overflowOverlay: {
        flex: 1,
        alignItems: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.22)',
        paddingTop: 62,
        paddingRight: Spacing.sm,
    },
    overflowMenu: {
        width: 310,
        maxWidth: '92%',
        maxHeight: '88%',
        paddingVertical: Spacing.xs,
        overflow: 'hidden',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        ...Shadows.lg,
    },
    overflowItem: {
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        gap: Spacing.sm,
    },
    overflowItemDisabled: { opacity: 0.38 },
    overflowItemIcon: { width: 25, textAlign: 'center', color: colors.textSecondary, fontSize: 18 },
    overflowItemText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '500' },
    overflowCheck: { color: colors.accent, fontSize: 19, fontWeight: '900' },
    overflowBadge: {
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        overflow: 'hidden',
        textAlign: 'center',
        lineHeight: 22,
        color: colors.white,
        backgroundColor: colors.accent,
        fontSize: FontSize.xs,
        fontWeight: '800',
    },
    overflowChevron: { color: colors.textMuted, fontSize: 24, fontWeight: '400' },
    overflowSeparator: { height: StyleSheet.hairlineWidth, marginVertical: 3, backgroundColor: colors.borderLight },
    menuFlagDot: { width: 13, height: 13, borderRadius: 7 },
    menuFlagDotEmpty: {
        borderWidth: 1.5,
        borderColor: colors.textSecondary,
        backgroundColor: 'transparent',
    },
    flagDotPlaceholder: { width: 18, height: 18 },
    overflowFlagPanel: {
        marginHorizontal: Spacing.sm,
        marginBottom: Spacing.xs,
        overflow: 'hidden',
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
    },
    overflowFlagRow: {
        minHeight: 43,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    overflowFlagRowActive: { backgroundColor: colors.accentLight },
    overflowFlagText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '500' },
    overflowFlagTextActive: { color: colors.accent, fontWeight: '800' },
    overflowFlagFooter: { minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.sm },
    overflowFlagCount: { color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },

    modalOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        backgroundColor: 'rgba(0,0,0,0.38)',
    },
    modalCard: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '86%',
        padding: Spacing.lg,
        overflow: 'hidden',
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        ...Shadows.lg,
    },
    modalTitle: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.md },
    modalCaption: { color: colors.textMuted, fontSize: FontSize.sm, marginTop: -Spacing.sm, marginBottom: Spacing.sm },
    modalCloseButton: { minHeight: 46, marginTop: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
    modalCloseText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '700' },
    searchHelpList: { maxHeight: 420 },
    searchHelpGroupTitle: {
        color: colors.textMuted,
        fontSize: FontSize.xs,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: Spacing.md,
        marginBottom: 4,
    },
    searchHelpRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    searchHelpTerm: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchHelpHint: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, textAlign: 'right' },
    directionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    directionButton: {
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgSecondary,
    },
    directionButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    directionText: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
    directionTextActive: { color: colors.accent, fontWeight: '800' },
    pickerList: { maxHeight: 430 },
    pickerRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    pickerRowActive: { backgroundColor: colors.accentLight },
    pickerRowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
    pickerRowTextActive: { color: colors.accent, fontWeight: '800' },
    pickerCheck: { color: colors.accent, fontSize: 19, fontWeight: '900' },
    flagPickerCard: { maxWidth: 380 },
    flagDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
    optionRow: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    optionCopy: { flex: 1 },
    optionTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
    optionCaption: { color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },
    fieldLabel: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.sm, marginBottom: Spacing.xs },
    dialogInput: {
        minHeight: 48,
        paddingHorizontal: Spacing.md,
        color: colors.textPrimary,
        fontSize: FontSize.md,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
    },
    checkboxRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
    checkbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.border, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkboxPartial: { opacity: 0.8 },
    checkboxTick: { color: colors.white, fontSize: 15, lineHeight: 17, fontWeight: '900' },
    checkboxLabel: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
    gradeRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
    gradeDot: { width: 12, height: 12, borderRadius: 6 },
    gradeText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
    previewContainer: { flex: 1, backgroundColor: colors.bgPrimary },
    previewGrabberArea: { height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
    previewGrabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
    previewHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
    previewHeaderButton: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    previewHeaderButtonText: { color: colors.textMuted, fontSize: 30, lineHeight: 32, fontWeight: '300' },
    previewFlipText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '800' },
    previewTitle: { flex: 1, textAlign: 'center', color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
    previewBody: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
    previewNavigation: { minHeight: 64, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgCard },
    previewNavButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewNavText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '700' },
    searchPreviewBox: {
        minHeight: 48,
        maxHeight: 92,
        padding: Spacing.md,
        justifyContent: 'center',
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
    },
    searchPreviewText: { color: colors.textSecondary, fontSize: FontSize.sm, fontFamily: 'monospace' },
    dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg },
    dialogButton: { minWidth: 96, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
    dialogButtonPrimary: { backgroundColor: colors.accent },
    dialogButtonText: { color: colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
    dialogButtonPrimaryText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
    });
}
