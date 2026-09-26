import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    InteractionManager,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { compileCardMatcher } from '../lib/cardSearchMatch';
import { localDayNumber, nextRolloverMs } from '../lib/ankiState';
import { useAppSettings, useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import type { StudyCard } from '../lib/types';
import { isLegacyTusNoteType, type CardFlag, type Note } from '../lib/models';
import {
    getBrowserCards,
    setCardSuspended,
    type BrowserCardQuery,
    type BrowserCardSortKey,
    type BrowserTableMode,
} from '../lib/studyRepository';
import { useI18n } from '../hooks/useI18n';
import { createDeck, getAvailableDeckName, getDeck, getDeckByName } from '../lib/deckManager';
import { useRouteDeckScope } from '../hooks/useRouteDeckScope';
import {
    getAllTags,
    moveCardsToDeck,
    setCardFlag,
    undoCardsMovedToDeck,
    updateNotesTags,
    type CardDeckMoveSnapshot,
} from '../lib/noteManager';
import { setDbSetting } from '../lib/storage';
import TagPickerModal from '../components/TagPickerModal';
import DeckPickerModal from '../components/DeckPickerModal';
import { alert } from '../lib/confirm';
import { isCatalogCard, isCatalogDeck, isCatalogNote } from '../lib/catalogProtection';
import { useScreenGuard } from '../hooks/useScreenGuard';
import ProtectedContentShield from '../components/ProtectedContentShield';
import { userFacingErrorMessage } from '../lib/userFacingError';
import { expandSelectedCardsToNotes, toggleSelectedSuspend } from '../lib/browserSelection';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import {
    getBrowserScopeSnapshot,
    getBrowserScreenSnapshot,
    type BrowserScopeSnapshot,
} from '../lib/screenSnapshots';
import { LatestSnapshotGeneration, ScreenSnapshotRepository } from '../lib/screenSnapshotLoader';
import {
    ALL_CARD_FLAGS,
    BROWSER_PAGE_SIZE,
    quoteAnkiSearchValue,
    readBrowserBoolean,
    readBrowserSortKey,
    readBrowserTableMode,
} from '../components/browser/browserHelpers';
import { createBrowserStyles } from '../components/browser/browserStyles';
import { SearchIcon } from '../components/browser/BrowserIcons';
import { BrowserCardRow } from '../components/browser/BrowserCardRow';
import { FilterChips, SelectionBar } from '../components/browser/BrowserBars';
import {
    BrowserOptionsModal,
    FlagPickerModal,
    OverflowMenuModal,
    SelectionMenuModal,
    SortPickerModal,
} from '../components/browser/BrowserMenus';
import {
    CardPreviewModal,
    ChangeNoteTypeModal,
    DueDateModal,
    GradeNowModal,
    RepositionModal,
    SearchHelpModal,
} from '../components/browser/BrowserDialogs';

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
    const styles = useMemo(() => createBrowserStyles(colors), [colors]);
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
        if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
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
    }, [selectedActionCardIds, hasCatalogCardsSelected, hasCatalogNotesSelected, closeSelection, bumpDataVersion, reload, l, t]);

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

    const renderCard = ({ item }: { item: StudyCard }) => (
        <BrowserCardRow
            item={item}
            browserFontScale={browserFontScale}
            bumpDataVersion={bumpDataVersion}
            colors={colors}
            deckById={deckById}
            expandedCard={expandedCard}
            l={l}
            locale={locale}
            noteTypes={noteTypes}
            reload={reload}
            router={router}
            selectedCardIds={selectedCardIds}
            selectionMode={selectionMode}
            setExpandedCard={setExpandedCard}
            setSelectionMode={setSelectionMode}
            settings={settings}
            showAnswerSnippet={showAnswerSnippet}
            showScheduleDetails={showScheduleDetails}
            styles={styles}
            subject={subject}
            t={t}
            tableMode={tableMode}
            toggleCardSelection={toggleCardSelection}
            toggleSuspend={toggleSuspend}
        />
    );

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
                    <View style={[styles.searchIcon, { pointerEvents: 'none' }]}>
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
            <FilterChips
                allFilterActive={allFilterActive}
                clearBrowserFilters={clearBrowserFilters}
                clearColoredFlagFilters={clearColoredFlagFilters}
                clearNoFlagFilter={clearNoFlagFilter}
                coloredFlagFilters={coloredFlagFilters}
                flagFilters={flagFilters}
                hasNoFlagFilter={hasNoFlagFilter}
                l={l}
                locale={locale}
                markedOnly={markedOnly}
                setFlagFilters={setFlagFilters}
                setMarkedOnly={setMarkedOnly}
                setSuspendedOnly={setSuspendedOnly}
                setTagFilters={setTagFilters}
                styles={styles}
                suspendedOnly={suspendedOnly}
                t={t}
                tagFilters={tagFilters}
            />
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
                <SelectionBar
                    closeSelection={closeSelection}
                    colors={colors}
                    hasCatalogCardsSelected={hasCatalogCardsSelected}
                    hasCatalogNotesSelected={hasCatalogNotesSelected}
                    l={l}
                    selectedCardIds={selectedCardIds}
                    setFlagPickerMode={setFlagPickerMode}
                    setShowDeckPicker={setShowDeckPicker}
                    setShowSelectionMenu={setShowSelectionMenu}
                    showSelectionMenu={showSelectionMenu}
                    styles={styles}
                    tableMode={tableMode}
                    toggleSelectionSuspended={toggleSelectionSuspended}
                />
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

            <SelectionMenuModal
                closeSelection={closeSelection}
                hasCatalogCardsSelected={hasCatalogCardsSelected}
                hasCatalogNotesSelected={hasCatalogNotesSelected}
                l={l}
                openSelectionTags={openSelectionTags}
                refreshSelection={refreshSelection}
                router={router}
                runSelectionAction={runSelectionAction}
                selectedActionCardIds={selectedActionCardIds}
                selectedCardIds={selectedCardIds}
                selectedNoteIds={selectedNoteIds}
                setDueInput={setDueInput}
                setPreviewAnswerVisible={setPreviewAnswerVisible}
                setPreviewIndex={setPreviewIndex}
                setRepositionShiftExisting={setRepositionShiftExisting}
                setRepositionStart={setRepositionStart}
                setRepositionStep={setRepositionStep}
                setShowDeckPicker={setShowDeckPicker}
                setShowDueDialog={setShowDueDialog}
                setShowGradePicker={setShowGradePicker}
                setShowNoteTypePicker={setShowNoteTypePicker}
                setShowRepositionDialog={setShowRepositionDialog}
                setShowSelectionMenu={setShowSelectionMenu}
                settings={settings}
                showSelectionMenu={showSelectionMenu}
                styles={styles}
                t={t}
                tableMode={tableMode}
            />

            <OverflowMenuModal
                coloredFlagFilters={coloredFlagFilters}
                colors={colors}
                filteredCards={filteredCards}
                flagFilters={flagFilters}
                hasMoreCards={hasMoreCards}
                hasNoFlagFilter={hasNoFlagFilter}
                l={l}
                lastDeckMove={lastDeckMove}
                locale={locale}
                markedOnly={markedOnly}
                openFilteredDeckDialog={openFilteredDeckDialog}
                openFlagFilter={openFlagFilter}
                selectAllVisible={selectAllVisible}
                setMarkedOnly={setMarkedOnly}
                setShowOptions={setShowOptions}
                setShowOverflowMenu={setShowOverflowMenu}
                setShowSortPicker={setShowSortPicker}
                setShowTagFilter={setShowTagFilter}
                setSuspendedOnly={setSuspendedOnly}
                showFlagFilterMenu={showFlagFilterMenu}
                showOverflowMenu={showOverflowMenu}
                styles={styles}
                suspendedOnly={suspendedOnly}
                tagFilters={tagFilters}
                toggleAllFlagFilters={toggleAllFlagFilters}
                toggleFlagFilter={toggleFlagFilter}
                undoDeckMove={undoDeckMove}
            />

            <SortPickerModal
                l={l}
                setShowSortPicker={setShowSortPicker}
                showSortPicker={showSortPicker}
                sortDescending={sortDescending}
                sortKey={sortKey}
                sortLabels={sortLabels}
                styles={styles}
                t={t}
                updateSort={updateSort}
                updateSortDirection={updateSortDirection}
            />

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

            <ChangeNoteTypeModal
                l={l}
                locale={locale}
                runSelectionAction={runSelectionAction}
                selectableNoteTypes={selectableNoteTypes}
                selectedNoteIds={selectedNoteIds}
                setShowNoteTypePicker={setShowNoteTypePicker}
                showNoteTypePicker={showNoteTypePicker}
                styles={styles}
                t={t}
            />

            <RepositionModal
                l={l}
                refreshSelection={refreshSelection}
                repositionShiftExisting={repositionShiftExisting}
                repositionStart={repositionStart}
                repositionStep={repositionStep}
                selectedActionCardIds={selectedActionCardIds}
                setRepositionShiftExisting={setRepositionShiftExisting}
                setRepositionStart={setRepositionStart}
                setRepositionStep={setRepositionStep}
                setShowRepositionDialog={setShowRepositionDialog}
                showRepositionDialog={showRepositionDialog}
                styles={styles}
                t={t}
            />

            <DueDateModal
                colors={colors}
                dueInput={dueInput}
                l={l}
                runSelectionAction={runSelectionAction}
                selectedActionCardIds={selectedActionCardIds}
                setDueInput={setDueInput}
                setShowDueDialog={setShowDueDialog}
                settings={settings}
                showDueDialog={showDueDialog}
                styles={styles}
                t={t}
            />

            <GradeNowModal
                colors={colors}
                l={l}
                runSelectionAction={runSelectionAction}
                selectedActionCardIds={selectedActionCardIds}
                setShowGradePicker={setShowGradePicker}
                settings={settings}
                showGradePicker={showGradePicker}
                styles={styles}
            />

            <CardPreviewModal
                l={l}
                previewAnswerVisible={previewAnswerVisible}
                previewDeck={previewDeck}
                previewIndex={previewIndex}
                previewNote={previewNote}
                previewNoteType={previewNoteType}
                previewRawCard={previewRawCard}
                selectedCards={selectedCards}
                setPreviewAnswerVisible={setPreviewAnswerVisible}
                setPreviewIndex={setPreviewIndex}
                styles={styles}
                tableMode={tableMode}
                windowHeight={windowHeight}
            />

            <FlagPickerModal
                applyFlag={applyFlag}
                colors={colors}
                flagPickerMode={flagPickerMode}
                l={l}
                locale={locale}
                setFlagPickerMode={setFlagPickerMode}
                styles={styles}
                tableMode={tableMode}
            />

            <SearchHelpModal
                appendSearchTerm={appendSearchTerm}
                l={l}
                searchHelpGroups={searchHelpGroups}
                setShowSearchHelp={setShowSearchHelp}
                showSearchHelp={showSearchHelp}
                styles={styles}
                t={t}
            />

            <BrowserOptionsModal
                colors={colors}
                l={l}
                setShowOptions={setShowOptions}
                showAnswerSnippet={showAnswerSnippet}
                showOptions={showOptions}
                showScheduleDetails={showScheduleDetails}
                styles={styles}
                t={t}
                tableMode={tableMode}
                updateBrowserOption={updateBrowserOption}
                updateTableMode={updateTableMode}
            />

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
