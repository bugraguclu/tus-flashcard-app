import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    Switch,
} from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { getAllSubjects } from '../lib/subjects';
import { matchesSearch } from '../lib/searchText';
import { localDayNumber, ymdToLocalDayNumber } from '../lib/ankiState';
import { useApp } from '../contexts/AppContext';
import type { CardState, StudyCard } from '../lib/types';
import { FLAG_COLORS, isLegacyTusNoteType, type CardFlag, type Note } from '../lib/models';
import { getBrowserCards, getFilteredDeckCardIds, setCardSuspended } from '../lib/studyRepository';
import { humanizeCardText } from '../lib/displayText';
import { useI18n } from '../hooks/useI18n';
import SheetModal from '../components/SheetModal';
import { hapticError, hapticLight, hapticMedium, hapticSelection, hapticSuccess } from '../lib/haptics';
import type { SupportedLocale } from '../lib/i18n';
import { cardFlagName } from '../lib/i18n';
import { localizeNoteTypeName } from '../lib/i18n';
import {
    buildDeckTree,
    createFilteredDeck,
    flattenDeckTree,
    getAllDecks,
    getAvailableDeckName,
    getDeck,
    getDeckByName,
    getDirectDecksForScope,
} from '../lib/deckManager';
import {
    changeNotesType,
    deleteNote,
    getAllNoteTypes,
    getNote,
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
import { alert, confirm } from '../lib/confirm';
import {
    forgetSelectedCards,
    gradeSelectedNow,
    repositionSelectedNewCards,
    setSelectedDueDate,
    toggleSelectedBury,
    toggleSelectedSuspend,
} from '../lib/browserSelection';
import { SetDueDateDialog } from '../components/SetDueDateDialog';
import { ForgetCardsDialog } from '../components/ForgetCardsDialog';
import type { DueDateSpecifier, ForgetOptions } from '../lib/setDueDate';
import {
    getForgetOptions,
    getSetDueDateInput,
    rememberForgetOptions,
    rememberSetDueDateInput,
} from '../lib/schedulingPrefs';

type BrowserSortKey = 'sortField' | 'cardType' | 'due' | 'deck' | 'created' | 'modified' | 'interval' | 'ease' | 'lapses' | 'reviews';

const BROWSER_SORT_KEYS: BrowserSortKey[] = [
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

function readBrowserSortKey(): BrowserSortKey {
    const stored = getDbSetting('browser_sort_key') as BrowserSortKey | null;
    return stored && BROWSER_SORT_KEYS.includes(stored) ? stored : 'sortField';
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
    const { t, l, locale, localeTag } = useI18n();
    const { settings, bumpDataVersion, dataVersion } = useApp();
    const router = useRouter();
    const params = useLocalSearchParams();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const browserFontScale = (settings.browserFontScalePercent ?? 100) / 100;
    const subjects = useMemo(() => getAllSubjects(), [dataVersion]);
    const deckName = typeof params.deck === 'string' && params.deck ? params.deck : null;
    const scopeDeck = useMemo(
        () => (deckName ? getDeckByName(deckName) : null),
        [deckName, dataVersion],
    );
    const scopedDeckIds = useMemo(() => {
        if (!deckName || scopeDeck?.isFiltered) return null;
        return new Set(getAllDecks()
            .filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`))
            .map((deck) => deck.id));
    }, [deckName, scopeDeck, dataVersion]);

    const filteredScopeCardIds = useMemo(() => {
        if (!scopeDeck?.isFiltered) return null;
        try {
            return new Set(getFilteredDeckCardIds(scopeDeck.name, settings));
        } catch (error) {
            console.warn('[Browser] filtered deck membership failed:', error);
            return new Set<number>();
        }
    }, [scopeDeck, settings, dataVersion]);

    const [allCards, setAllCards] = useState<StudyCard[]>([]);
    const [rawQuery, setRawQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedQuickDeckName, setSelectedQuickDeckName] = useState<string | null>(null);
    const [markedOnly, setMarkedOnly] = useState(false);
    const [suspendedOnly, setSuspendedOnly] = useState(false);
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [flagFilter, setFlagFilter] = useState<CardFlag | null>(null);
    const [sortKey, setSortKey] = useState<BrowserSortKey>(readBrowserSortKey);
    const [sortDescending, setSortDescending] = useState(() => readBrowserBoolean('browser_sort_desc', false));
    const [showAnswerSnippet, setShowAnswerSnippet] = useState(() => readBrowserBoolean('browser_show_answer', false));
    const [showScheduleDetails, setShowScheduleDetails] = useState(() => readBrowserBoolean('browser_show_schedule', true));
    const [compactRows, setCompactRows] = useState(() => readBrowserBoolean('browser_compact_rows', false));
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [deckScopePickerVisible, setDeckScopePickerVisible] = useState(false);
    const [showSortPicker, setShowSortPicker] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [flagPickerMode, setFlagPickerMode] = useState<'filter' | 'selection' | null>(null);
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
    const [dueInitialValue, setDueInitialValue] = useState('');
    const [forgetOptions, setForgetOptions] = useState<ForgetOptions | null>(null);
    const [showGradePicker, setShowGradePicker] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [previewAnswerVisible, setPreviewAnswerVisible] = useState(false);
    const [lastDeckMove, setLastDeckMove] = useState<CardDeckMoveSnapshot[]>([]);
    const [showFilteredDeckDialog, setShowFilteredDeckDialog] = useState(false);
    const [filteredDeckName, setFilteredDeckName] = useState('');
    const [filteredDeckLimit, setFilteredDeckLimit] = useState('100');
    const [loading, setLoading] = useState(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const transientSurfaceOpen = showOverflowMenu
        || deckScopePickerVisible
        || showSortPicker
        || showTagFilter
        || flagPickerMode !== null
        || showOptions
        || showDeckPicker
        || showSelectionMenu
        || showNoteTypePicker
        || showSelectionTags
        || showRepositionDialog
        || showDueDialog
        || showGradePicker
        || previewIndex !== null
        || showFilteredDeckDialog;

    // Browser actions can be launched while its search field owns the keyboard. Every new
    // popup starts from the full window; input dialogs then use their own avoiding layer.
    useEffect(() => {
        if (transientSurfaceOpen) Keyboard.dismiss();
    }, [transientSurfaceOpen]);

    const allDecks = useMemo(() => getAllDecks(), [dataVersion]);
    const deckById = useMemo(() => new Map(allDecks.map((deck) => [deck.id, deck])), [allDecks]);
    const quickDecks = useMemo(
        () => getDirectDecksForScope(allDecks, deckName),
        [allDecks, deckName],
    );
    const selectedQuickDeck = useMemo(
        () => quickDecks.find((deck) => deck.name === selectedQuickDeckName) ?? null,
        [quickDecks, selectedQuickDeckName],
    );
    const selectedQuickDeckIds = useMemo(() => {
        if (!selectedQuickDeckName) return null;
        const prefix = `${selectedQuickDeckName}::`;
        return new Set(allDecks
            .filter((deck) => !deck.isFiltered
                && (deck.name === selectedQuickDeckName || deck.name.startsWith(prefix)))
            .map((deck) => deck.id));
    }, [allDecks, selectedQuickDeckName]);

    useEffect(() => {
        if (selectedQuickDeckName && !selectedQuickDeck) {
            setSelectedQuickDeckName(null);
        }
    }, [selectedQuickDeck, selectedQuickDeckName]);
    const deckPickerRows = useMemo(
        () => flattenDeckTree(buildDeckTree(allDecks), true).filter((node) => !node.deck.isFiltered),
        [allDecks],
    );
    const deckScopePickerItems = useMemo(
        () => allDecks
            .sort((a, b) => a.name.localeCompare(b.name, localeTag)),
        [allDecks, localeTag],
    );
    const scopeTitle = deckName
        ? deckName.replaceAll('::', ' › ')
        : l('Tüm Koleksiyon', 'Whole Collection');

    const handlePickDeckScope = (name: string | null) => {
        setDeckScopePickerVisible(false);
        router.replace((name ? `/browser?deck=${encodeURIComponent(name)}` : '/browser') as any);
    };

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        if (deckName) {
            router.replace(`/deck-overview?deck=${encodeURIComponent(deckName)}` as any);
            return;
        }
        router.replace('/decks' as any);
    };
    const noteById = useMemo(() => {
        const notes = new Map<number, Note>();
        for (const card of allCards) {
            if (notes.has(card.noteId)) continue;
            const note = getNote(card.noteId);
            if (note) notes.set(card.noteId, note);
        }
        return notes;
    }, [allCards]);
    const noteTagsById = useMemo(
        () => new Map([...noteById].map(([noteId, note]) => [noteId, note.tags])),
        [noteById],
    );
    const noteTypes = useMemo(() => getAllNoteTypes(), [dataVersion]);
    const selectableNoteTypes = useMemo(
        () => noteTypes.filter((noteType) => !isLegacyTusNoteType(noteType)),
        [noteTypes],
    );

    const reload = useCallback(() => {
        const cards = getBrowserCards(settings);
        setAllCards(cards);
        setLoading(false);
    }, [settings]);

    useEffect(() => {
        reload();
    }, [reload, dataVersion]);

    useEffect(() => () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    const handleSearch = useCallback((text: string) => {
        setRawQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearchQuery(text), 200);
    }, []);

    const filteredCards = useMemo(() => {
        const query = searchQuery.trim();
        let cards = allCards;

        if (filteredScopeCardIds) {
            cards = cards.filter((card) => filteredScopeCardIds.has(card.cardId));
        } else if (scopedDeckIds) {
            cards = cards.filter((card) => scopedDeckIds.has(card.deckId));
        }

        if (selectedQuickDeckIds) {
            cards = cards.filter((card) => selectedQuickDeckIds.has(card.deckId));
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
                return required.every((tag) => noteTags.some((candidate) => candidate === tag || candidate.startsWith(`${tag}::`)));
            });
        }

        if (flagFilter !== null) {
            cards = cards.filter((card) => (card.rawCard?.flags ?? 0) === flagFilter);
        }

        if (query) {
            // Turkish/ASCII-insensitive, multi-word AND search (see lib/searchText). Include deck
            // and tags as Anki's browser search operates across collection metadata too.
            cards = cards.filter((card) => matchesSearch([
                card.question,
                card.answer,
                card.topic,
                deckById.get(card.deckId)?.name ?? '',
                ...(noteTagsById.get(card.noteId) ?? []),
            ].join(' '), query));
        }

        const direction = sortDescending ? -1 : 1;
        const sorted = [...cards];
        sorted.sort((left, right) => {
            const a = left.rawCard;
            const b = right.rawCard;
            let compared = 0;
            switch (sortKey) {
                case 'cardType': compared = (a?.ord ?? 0) - (b?.ord ?? 0); break;
                case 'due': compared = (a?.due ?? 0) - (b?.due ?? 0); break;
                case 'deck': compared = (deckById.get(left.deckId)?.name ?? '').localeCompare(deckById.get(right.deckId)?.name ?? '', locale); break;
                case 'created': compared = left.noteId - right.noteId; break;
                case 'modified': compared = (a?.mod ?? 0) - (b?.mod ?? 0); break;
                case 'interval': compared = (a?.ivl ?? 0) - (b?.ivl ?? 0); break;
                case 'ease': compared = (a?.factor ?? 0) - (b?.factor ?? 0); break;
                case 'lapses': compared = (a?.lapses ?? 0) - (b?.lapses ?? 0); break;
                case 'reviews': compared = (a?.reps ?? 0) - (b?.reps ?? 0); break;
                case 'sortField': compared = humanizeCardText(noteById.get(left.noteId)?.sfld ?? left.question).localeCompare(humanizeCardText(noteById.get(right.noteId)?.sfld ?? right.question), locale, { sensitivity: 'base' }); break;
            }
            return compared === 0 ? (left.cardId - right.cardId) * direction : compared * direction;
        });
        return sorted;
    }, [allCards, filteredScopeCardIds, scopedDeckIds, selectedQuickDeckIds, markedOnly, suspendedOnly, tagFilters, flagFilter, searchQuery, noteTagsById, noteById, deckById, sortDescending, sortKey, locale]);

    useEffect(() => {
        const visibleIds = new Set(filteredCards.map((card) => card.cardId));
        setSelectedCardIds((current) => {
            const next = new Set([...current].filter((cardId) => visibleIds.has(cardId)));
            if (next.size === current.size && [...next].every((cardId) => current.has(cardId))) return current;
            return next;
        });
    }, [filteredCards]);

    const toggleSuspend = useCallback((cardId: number, isSuspended: boolean) => {
        setCardSuspended(cardId, !isSuspended, settings.dayRolloverHour);
        bumpDataVersion();
        reload();
    }, [reload, bumpDataVersion, settings.dayRolloverHour]);

    const sortLabels: Record<BrowserSortKey, string> = {
        sortField: l('Sıralama Alanı', 'Sort Field'),
        cardType: l('Kart Türü', 'Card Type'),
        due: l('Vade', 'Due'),
        deck: l('Deste', 'Deck'),
        created: l('Oluşturulma', 'Created'),
        modified: l('Değiştirilme', 'Modified'),
        interval: l('Aralık', 'Interval'),
        ease: l('Kolaylık', 'Ease'),
        lapses: l('Unutma Sayısı', 'Lapses'),
        reviews: l('Tekrar Sayısı', 'Reviews'),
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
        hapticLight();
        setSelectionMode(true);
        setSelectedCardIds(new Set(filteredCards.map((card) => card.cardId)));
        setCurrentSelectedCardId(filteredCards[0]?.cardId ?? null);
    }, [filteredCards]);

    const selectedCards = useMemo(
        () => filteredCards.filter((card) => selectedCardIds.has(card.cardId)),
        [filteredCards, selectedCardIds],
    );
    const selectedActionCardIds = useMemo(() => {
        const ids = selectedCards.map((card) => card.cardId);
        if (currentSelectedCardId === null || !selectedCardIds.has(currentSelectedCardId)) return ids;
        return [currentSelectedCardId, ...ids.filter((cardId) => cardId !== currentSelectedCardId)];
    }, [selectedCards, selectedCardIds, currentSelectedCardId]);
    const selectedNoteIds = useMemo(
        () => [...new Set(selectedCards.map((card) => card.noteId))],
        [selectedCards],
    );
    const selectedNotes = useMemo(
        () => selectedNoteIds.map((noteId) => noteById.get(noteId)).filter((note): note is Note => note !== undefined),
        [selectedNoteIds, noteById],
    );
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
            hapticSuccess();
            refreshSelection();
        } catch (error) {
            hapticError();
            console.warn('[Browser] selection action failed:', error);
            alert(t('common.error'), error instanceof Error ? error.message : l('İşlem tamamlanamadı.', 'The action could not be completed.'));
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
        setShowOverflowMenu(false);
        setFlagPickerMode('filter');
    }, []);

    const updateSort = useCallback((nextSortKey: BrowserSortKey) => {
        setSortKey(nextSortKey);
        setDbSetting('browser_sort_key', nextSortKey);
        setShowSortPicker(false);
    }, []);

    const updateSortDirection = useCallback((descending: boolean) => {
        setSortDescending(descending);
        setDbSetting('browser_sort_desc', descending ? '1' : '0');
    }, []);

    const updateBrowserOption = useCallback((key: 'answer' | 'schedule' | 'compact', value: boolean) => {
        if (key === 'answer') setShowAnswerSnippet(value);
        if (key === 'schedule') setShowScheduleDetails(value);
        if (key === 'compact') setCompactRows(value);
        const settingKey = key === 'compact' ? 'browser_compact_rows' : `browser_show_${key}`;
        setDbSetting(settingKey, value ? '1' : '0');
    }, []);

    const applyFlag = useCallback((flag: CardFlag) => {
        if (flagPickerMode === 'filter') {
            setFlagFilter(flag);
        } else if (flagPickerMode === 'selection') {
            hapticSelection();
            for (const cardId of selectedCardIds) setCardFlag(cardId, flag);
            bumpDataVersion();
            reload();
        }
        setFlagPickerMode(null);
    }, [flagPickerMode, selectedCardIds, bumpDataVersion, reload]);

    const moveSelectionToDeck = useCallback((targetDeckId: number) => {
        const targetDeck = getDeck(targetDeckId);
        if (!targetDeck || targetDeck.isFiltered) return;
        const move = moveCardsToDeck([...selectedCardIds], targetDeckId);
        if (move.length > 0) setLastDeckMove(move);
        setShowDeckPicker(false);
        closeSelection();
        bumpDataVersion();
        reload();
    }, [selectedCardIds, closeSelection, bumpDataVersion, reload]);

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
        if (selectedQuickDeckName) terms.push(`deck:${quoteAnkiSearchValue(selectedQuickDeckName)}`);
        if (markedOnly) terms.push('tag:marked');
        if (suspendedOnly) terms.push('is:suspended');
        for (const tag of tagFilters) terms.push(`tag:${quoteAnkiSearchValue(tag)}`);
        if (flagFilter !== null) terms.push(`flag:${flagFilter}`);
        if (searchQuery.trim()) terms.push(searchQuery.trim());
        return terms.join(' ');
    }, [scopeDeck, selectedQuickDeckName, markedOnly, suspendedOnly, tagFilters, flagFilter, searchQuery]);

    const allFilterActive = !selectedQuickDeckName
        && !markedOnly
        && !suspendedOnly
        && tagFilters.length === 0
        && flagFilter === null;

    const clearBrowserFilters = useCallback(() => {
        setSelectedQuickDeckName(null);
        setMarkedOnly(false);
        setSuspendedOnly(false);
        setTagFilters([]);
        setFlagFilter(null);
    }, []);

    const openFilteredDeckDialog = useCallback(() => {
        setShowOverflowMenu(false);
        setFilteredDeckName(getAvailableDeckName(l('Kartlarım Filtresi', 'My Cards Filter')));
        setFilteredDeckLimit('100');
        setShowFilteredDeckDialog(true);
    }, [l]);

    const createDeckFromBrowser = useCallback(() => {
        const requestedName = filteredDeckName.trim() || l('Kartlarım Filtresi', 'My Cards Filter');
        const name = getAvailableDeckName(requestedName);
        const parsedLimit = Number.parseInt(filteredDeckLimit, 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(99_999, Math.max(1, parsedLimit)) : 100;
        const deck = createFilteredDeck(name, browserSearch, limit);
        setShowFilteredDeckDialog(false);
        bumpDataVersion();
        router.push(`/deck-overview?deck=${encodeURIComponent(deck.name)}` as any);
    }, [filteredDeckName, filteredDeckLimit, browserSearch, l, bumpDataVersion, router]);

    const subject = (id: string) => subjects.find((s) => s.id === id);

    const renderCard = ({ item }: { item: StudyCard }) => {
        const isExpanded = expandedCard === item.cardId;
        const isSelected = selectedCardIds.has(item.cardId);
        const sub = subject(item.subject);
        const flag = (item.rawCard?.flags ?? 0) as CardFlag;

        const statusColor = item.state.status === 'new'
            ? colors.badgeNew
            : item.state.status === 'learning'
                ? colors.badgeLearn
                : colors.badgeReview;

        const statusBg = item.state.status === 'new'
            ? colors.badgeNewBg
            : item.state.status === 'learning'
                ? colors.badgeLearnBg
                : colors.badgeReviewBg;

        return (
            <TouchableOpacity
                style={[
                    styles.cardItem,
                    compactRows && styles.cardItemCompact,
                    isSelected && styles.cardItemSelected,
                ]}
                onPress={() => {
                    if (selectionMode) {
                        hapticSelection();
                        toggleCardSelection(item.cardId);
                        return;
                    }
                    setExpandedCard(isExpanded ? null : item.cardId);
                }}
                onLongPress={() => {
                    // Entering selection mode is a mode change, so it gets the heavier tap; the
                    // per-row check that follows is just a selection.
                    if (!selectionMode) hapticMedium();
                    else hapticSelection();
                    if (!selectionMode) setSelectionMode(true);
                    toggleCardSelection(item.cardId);
                }}
                activeOpacity={0.7}
                accessibilityRole={selectionMode ? 'checkbox' : 'button'}
                accessibilityState={selectionMode ? { checked: isSelected } : undefined}
            >
                <View style={[styles.cardItemHeader, item.state.suspended && styles.cardSuspended]}>
                    {selectionMode && (
                        <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Text style={styles.selectionCheckboxTick}>✓</Text>}
                        </View>
                    )}
                    <Text style={styles.cardIcon}>{sub?.icon || '📝'}</Text>
                    <View style={styles.cardBody}>
                        <Text style={[styles.cardQuestion, { fontSize: FontSize.md * browserFontScale, lineHeight: 22 * browserFontScale }]} numberOfLines={isExpanded ? undefined : 2}>
                            {humanizeCardText(item.question) || l('🃏 (boş)', '🃏 (empty)')}
                        </Text>
                        <View style={styles.cardMeta}>
                            <Text style={styles.cardTopic} numberOfLines={1}>
                                {(deckById.get(item.deckId)?.name ?? sub?.name ?? item.subject).replaceAll('::', ' › ')}
                                {item.topic ? ` · ${item.topic}` : ''}
                            </Text>
                            <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusDotText, { color: statusColor }]}>
                                    {item.state.status === 'new' ? t('anki.new') : item.state.status === 'learning' ? t('anki.learn') : t('anki.review')}
                                </Text>
                            </View>
                        </View>
                        {showAnswerSnippet && !isExpanded && (
                            <Text style={[styles.answerSnippet, { fontSize: FontSize.sm * browserFontScale, lineHeight: 18 * browserFontScale }]} numberOfLines={compactRows ? 1 : 2}>
                                {humanizeCardText(item.answer) || '—'}
                            </Text>
                        )}
                        {showScheduleDetails && (
                            <Text style={styles.scheduleMeta} numberOfLines={compactRows ? 1 : 2}>
                                ⏱ {l('Son:', 'Last:')} {formatLastReview(item.state.lastReviewedAtMs, locale)} · {l('Sonraki:', 'Next:')} {formatNextDue(item.state, settings.dayRolloverHour, locale)}
                            </Text>
                        )}
                    </View>
                    <View style={styles.cardActions}>
                        {!selectionMode && (
                            <TouchableOpacity
                                style={styles.editBtn}
                                onPress={() => router.push(`/editor?cardId=${item.cardId}`)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kartı düzenle', 'Edit card')}
                            >
                                <Text style={styles.editBtnText}>✏️</Text>
                            </TouchableOpacity>
                        )}
                        {item.noteMarked && (
                            <Text style={styles.flagIcon} accessibilityLabel={l('Not işaretli', 'Note is marked')}>⭐</Text>
                        )}
                        {flag > 0 && (
                            <Text
                                style={[styles.flagIcon, { color: FLAG_COLORS[flag].color }]}
                                accessibilityLabel={l(`Bayrak: ${cardFlagName(locale, flag)}`, `Flag: ${cardFlagName(locale, flag)}`)}
                            >
                                ⚑
                            </Text>
                        )}
                        {item.state.suspended && <Text style={styles.suspendedIcon}>⏸️</Text>}
                    </View>
                </View>

                {isExpanded && !selectionMode && (
                    <View style={styles.expandedContent}>
                        <View style={[styles.answerBox, item.state.suspended && styles.cardSuspended]}>
                            <Text style={styles.answerLabel}>{l('CEVAP', 'ANSWER')}</Text>
                            <Text style={[styles.answerContent, { fontSize: FontSize.md * browserFontScale, lineHeight: 22 * browserFontScale }]}>{humanizeCardText(item.answer) || '—'}</Text>
                        </View>

                        <View style={[styles.cardDetails, item.state.suspended && styles.cardSuspended]}>
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
                        </View>

                        <TouchableOpacity
                            style={[styles.suspendBtn, item.state.suspended && styles.suspendBtnActive]}
                            onPress={() => toggleSuspend(item.cardId, item.state.suspended)}
                        >
                            <Text style={styles.suspendBtnText}>
                                {item.state.suspended ? l('▶️ Askıdan Çıkar', '▶️ Unsuspend') : `⏸️ ${t('anki.suspend')}`}
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
                <Text scaleRole="title" style={styles.screenTitle} numberOfLines={1}>{t('sidebar.myCards')}</Text>
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
                    <Text style={styles.scopeCount}>{filteredCards.length} {l('kart', 'cards')}</Text>
                </View>
                {!scopeDeck?.isFiltered && (
                    <TouchableOpacity
                        style={styles.addCardBtn}
                        onPress={() => router.push({
                            pathname: '/editor',
                            params: {
                                ...(selectedQuickDeck || scopeDeck
                                    ? { deckId: String((selectedQuickDeck ?? scopeDeck)!.id) }
                                    : {}),
                            },
                        } as any)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yeni kart ekle', 'Add new card')}
                    >
                        <Text style={styles.addCardBtnText}>＋ {l('Yeni Kart', 'New Card')}</Text>
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
                <TextInput
                    style={styles.searchInput}
                    placeholder={l('🔍 Kart ara…', '🔍 Search cards…')}
                    placeholderTextColor={colors.textMuted}
                    value={rawQuery}
                    onChangeText={handleSearch}
                />
            </View>

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
                {flagFilter !== null && (
                    <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setFlagFilter(null)}>
                        <View style={[styles.filterFlagDot, { backgroundColor: flagFilter === 0 ? colors.border : FLAG_COLORS[flagFilter].color }]} />
                        <Text style={[styles.filterChipText, styles.filterChipTextActive]}>{flagFilter === 0 ? l('Bayraksız', 'No flag') : cardFlagName(locale, flagFilter)} ×</Text>
                    </TouchableOpacity>
                )}
                {quickDecks.map((deck) => (
                    <TouchableOpacity
                        key={deck.id}
                        style={[styles.filterChip, selectedQuickDeckName === deck.name && styles.filterChipActive]}
                        onPress={() => setSelectedQuickDeckName(
                            selectedQuickDeckName === deck.name ? null : deck.name,
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `${deck.name.replaceAll('::', ' › ')} alt destesindeki kartları göster`,
                            `Show cards in the ${deck.name.replaceAll('::', ' › ')} subdeck`,
                        )}
                    >
                        <Text style={[styles.filterChipText, selectedQuickDeckName === deck.name && styles.filterChipTextActive]}>
                            {deck.name.split('::').at(-1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <FlatList
                data={filteredCards}
                renderItem={renderCard}
                keyExtractor={(item) => String(item.cardId)}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator
                refreshing={loading}
                onRefresh={reload}
            />

            {selectionMode && (
                <View style={styles.selectionBar}>
                    <TouchableOpacity
                        style={styles.selectionBarCount}
                        onPress={closeSelection}
                        accessibilityLabel={l('Seçimi kapat', 'Close selection')}
                    >
                        <Text style={styles.selectionBarClose}>×</Text>
                        <Text scaleRole="badge" style={styles.selectionBarCountText}>{selectedCardIds.size} {l('seçili', 'selected')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionAction}
                        disabled={selectedCardIds.size === 0}
                        onPress={() => setShowDeckPicker(true)}
                    >
                        <Text style={styles.selectionActionIcon}>▤</Text>
                        <Text style={styles.selectionActionText}>{l('Deste', 'Deck')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionAction}
                        disabled={selectedCardIds.size === 0}
                        onPress={toggleSelectionSuspended}
                    >
                        <Text style={styles.selectionActionIcon}>⏸</Text>
                        <Text style={styles.selectionActionText}>{l('Askı', 'Suspend')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionAction}
                        disabled={selectedCardIds.size === 0}
                        onPress={() => setFlagPickerMode('selection')}
                    >
                        <Text style={styles.selectionActionIcon}>⚑</Text>
                        <Text style={styles.selectionActionText}>{l('Bayrak', 'Flag')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionAction}
                        disabled={selectedCardIds.size === 0}
                        onPress={() => setShowSelectionMenu(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Diğer kart işlemleri', 'More card actions')}
                        accessibilityState={{ expanded: showSelectionMenu }}
                    >
                        <Text style={styles.selectionActionIcon}>⋮</Text>
                        <Text style={styles.selectionActionText}>{l('Diğer', 'More')}</Text>
                    </TouchableOpacity>
                </View>
            )}

            <DeckPickerModal
                visible={deckScopePickerVisible}
                colors={colors}
                decks={deckScopePickerItems}
                selectedDeckName={deckName}
                title={l('Deste Seç', 'Select Deck')}
                allDecksLabel={l('Tüm Koleksiyon', 'Whole Collection')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckScopePickerVisible(false)}
                onSelect={handlePickDeckScope}
                onCreateDeck={() => router.push(`/decks?create=${Date.now()}` as any)}
            />

            <SheetModal
                visible={showSelectionMenu}
                onClose={() => setShowSelectionMenu(false)}
                showGrabber={false}
                cardStyle={styles.selectionMenuSheet}
            >
                <View style={styles.selectionMenuHeader}>
                    <Text style={styles.selectionMenuTitle}>{selectedCardIds.size} {l('kart seçili', 'cards selected')}</Text>
                    <TouchableOpacity style={styles.selectionMenuClose} onPress={() => setShowSelectionMenu(false)}>
                        <Text style={styles.selectionMenuCloseText}>×</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedSuspend(selectedActionCardIds, settings.dayRolloverHour))}>
                        <Text style={styles.selectionMenuIcon}>⏸</Text><Text style={styles.selectionMenuText}>{l('Askıya al / askıdan çıkar', 'Toggle suspend')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedBury(selectedActionCardIds, settings.dayRolloverHour))}>
                        <Text style={styles.selectionMenuIcon}>💤</Text><Text style={styles.selectionMenuText}>{l('Göm / gömmeden çıkar', 'Toggle bury')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setShowNoteTypePicker(true); }}>
                        <Text style={styles.selectionMenuIcon}>🗂</Text><Text style={styles.selectionMenuText}>{l('Not türünü değiştir', 'Change note type')}</Text><Text style={styles.overflowChevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setShowDeckPicker(true); }}>
                        <Text style={styles.selectionMenuIcon}>▤</Text><Text style={styles.selectionMenuText}>{l('Desteyi değiştir', 'Change deck')}</Text><Text style={styles.overflowChevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setRepositionStart('1'); setRepositionStep('1'); setRepositionShiftExisting(true); setShowRepositionDialog(true); }}>
                        <Text style={styles.selectionMenuIcon}>↕</Text><Text style={styles.selectionMenuText}>{l('Yeniden konumlandır', 'Reposition')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setDueInitialValue(getSetDueDateInput('browser')); setShowDueDialog(true); }}>
                        <Text style={styles.selectionMenuIcon}>📅</Text><Text style={styles.selectionMenuText}>{l('Son tarihi ayarla', 'Set due date')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={openSelectionTags}>
                        <Text style={styles.selectionMenuIcon}>🏷</Text><Text style={styles.selectionMenuText}>{l('Etiketleri düzenle', 'Edit tags')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setShowGradePicker(true); }}>
                        <Text style={styles.selectionMenuIcon}>✓</Text><Text style={styles.selectionMenuText}>{l('Şimdi derecelendir', 'Grade now')}</Text><Text style={styles.overflowChevron}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionMenuItem}
                        onPress={() => { setShowSelectionMenu(false); setForgetOptions(getForgetOptions('browser')); }}
                    >
                        <Text style={styles.selectionMenuIcon}>↺</Text><Text style={styles.selectionMenuText}>{l('Sıfırla', 'Reset')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setPreviewAnswerVisible(false); setPreviewIndex(0); }}>
                        <Text style={styles.selectionMenuIcon}>👁</Text><Text style={styles.selectionMenuText}>{l('Önizle', 'Preview')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionMenuItem}
                        onPress={() => {
                            setDbSetting('browser_export_card_ids', JSON.stringify(selectedActionCardIds));
                            setShowSelectionMenu(false);
                            router.push('/export?selection=browser' as any);
                        }}
                    >
                        <Text style={styles.selectionMenuIcon}>⇧</Text><Text style={styles.selectionMenuText}>{l('Kartları dışa aktar', 'Export cards')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.selectionMenuItem}
                        onPress={() => {
                            setShowSelectionMenu(false);
                            confirm(
                                l('Notları Sil', 'Delete Notes'),
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
            </SheetModal>

            <Modal visible={showOverflowMenu} transparent animationType="fade" onRequestClose={() => setShowOverflowMenu(false)}>
                <View style={styles.overflowOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOverflowMenu(false)} />
                    <View style={styles.overflowMenu} accessibilityViewIsModal>
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
                            {tagFilters.length > 0 && <Text maxFontSizeMultiplier={1} style={styles.overflowBadge}>{tagFilters.length}</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.overflowItem} onPress={openFlagFilter}>
                            <Text style={styles.overflowItemIcon}>⚑</Text>
                            <Text style={styles.overflowItemText}>{l('Bayrağa göre filtrele', 'Filter by flag')}</Text>
                            {flagFilter !== null && (
                                <View style={[styles.menuFlagDot, { backgroundColor: flagFilter === 0 ? colors.border : FLAG_COLORS[flagFilter].color }]} />
                            )}
                            <Text style={styles.overflowChevron}>›</Text>
                        </TouchableOpacity>
                        <View style={styles.overflowSeparator} />
                        <TouchableOpacity
                            style={[styles.overflowItem, lastDeckMove.length === 0 && styles.overflowItemDisabled]}
                            disabled={lastDeckMove.length === 0}
                            onPress={undoDeckMove}
                        >
                            <Text style={styles.overflowItemIcon}>↶</Text>
                            <Text style={styles.overflowItemText}>{l('Geri Al: Deste Güncelleme', 'Undo Update Deck')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.overflowItem, filteredCards.length === 0 && styles.overflowItemDisabled]}
                            disabled={filteredCards.length === 0}
                            onPress={() => { setShowOverflowMenu(false); selectAllVisible(); }}
                        >
                            <Text style={styles.overflowItemIcon}>☑</Text>
                            <Text style={styles.overflowItemText}>{l('Tümünü seç', 'Select all')}</Text>
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
                    </View>
                </View>
            </Modal>

            <SheetModal visible={showSortPicker} onClose={() => setShowSortPicker(false)}>
                <Text scaleRole="title" style={styles.modalTitle}>{l('Görüntüleme Sırası', 'Display Order')}</Text>
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
            </SheetModal>

            <TagPickerModal
                visible={showTagFilter}
                selectedTags={tagFilters}
                allowCreate={false}
                title={l('Etikete Göre Filtrele', 'Filter by Tag')}
                onCancel={() => setShowTagFilter(false)}
                onConfirm={(tags) => {
                    setTagFilters(tags);
                    setShowTagFilter(false);
                }}
            />

            <TagPickerModal
                visible={showSelectionTags}
                selectedTags={selectionTagBaseline}
                allowCreate
                title={l('Seçili Notların Etiketleri', 'Tags for Selected Notes')}
                onCancel={() => setShowSelectionTags(false)}
                onConfirm={(tags) => {
                    const baselineKeys = new Set(selectionTagBaseline.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
                    const nextKeys = new Set(tags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
                    const addTags = tags.filter((tag) => !baselineKeys.has(tag.normalize('NFC').toLocaleLowerCase()));
                    const removeTags = selectionTagBaseline.filter((tag) => !nextKeys.has(tag.normalize('NFC').toLocaleLowerCase()));
                    setShowSelectionTags(false);
                    runSelectionAction(() => updateNotesTags(selectedNoteIds, addTags, removeTags));
                }}
            />

            <SheetModal visible={showNoteTypePicker} onClose={() => setShowNoteTypePicker(false)}>
                <Text scaleRole="title" style={styles.modalTitle}>{l('Not Türünü Değiştir', 'Change Note Type')}</Text>
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
            </SheetModal>

            <Modal visible={showRepositionDialog} transparent animationType="fade" onRequestClose={() => setShowRepositionDialog(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowRepositionDialog(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text scaleRole="title" style={styles.modalTitle}>{l('Yeniden Konumlandır', 'Reposition')}</Text>
                        <Text style={styles.modalCaption}>{l('Yalnızca seçili yeni kartlar etkilenir.', 'Only selected new cards are affected.')}</Text>
                        <Text style={styles.fieldLabel}>{l('Başlangıç konumu', 'Start position')}</Text>
                        <TextInput style={styles.dialogInput} value={repositionStart} onChangeText={(value) => setRepositionStart(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
                        <Text style={styles.fieldLabel}>{l('Adım', 'Step')}</Text>
                        <TextInput style={styles.dialogInput} value={repositionStep} onChangeText={(value) => setRepositionStep(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
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

            <SetDueDateDialog
                visible={showDueDialog}
                cardCount={selectedActionCardIds.length}
                initialValue={dueInitialValue}
                onCancel={() => setShowDueDialog(false)}
                onConfirm={(spec: DueDateSpecifier, raw: string) => {
                    setShowDueDialog(false);
                    rememberSetDueDateInput('browser', raw);
                    runSelectionAction(() => setSelectedDueDate(selectedActionCardIds, spec, settings));
                }}
            />

            <ForgetCardsDialog
                visible={forgetOptions !== null}
                cardCount={selectedActionCardIds.length}
                initialOptions={forgetOptions ?? { restorePosition: false, resetCounts: false }}
                onCancel={() => setForgetOptions(null)}
                onConfirm={(options: ForgetOptions) => {
                    setForgetOptions(null);
                    rememberForgetOptions('browser', options);
                    runSelectionAction(() => forgetSelectedCards(selectedActionCardIds, options));
                }}
            />

            <SheetModal visible={showGradePicker} onClose={() => setShowGradePicker(false)}>
                <Text scaleRole="title" style={styles.modalTitle}>{l('Şimdi Derecelendir', 'Grade Now')}</Text>
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
            </SheetModal>

            <Modal visible={previewIndex !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPreviewIndex(null)}>
                <SafeAreaView style={styles.previewContainer}>
                    <View style={styles.previewHeader}>
                        <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewIndex(null)}><Text style={styles.previewHeaderButtonText}>×</Text></TouchableOpacity>
                        <Text style={styles.previewTitle}>{l('Önizleme', 'Preview')} · {(previewIndex ?? 0) + 1}/{selectedCards.length}</Text>
                        <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewAnswerVisible((value) => !value)}><Text style={styles.previewFlipText}>{previewAnswerVisible ? l('Soru', 'Question') : l('Cevap', 'Answer')}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.previewBody}>
                        {previewNote && previewNoteType && previewRawCard ? (
                            <CardWebView noteType={previewNoteType} note={previewNote} card={previewRawCard} deck={previewDeck} side={previewAnswerVisible ? 'answer' : 'question'} />
                        ) : <Text style={styles.modalCaption}>{l('Kart önizlenemedi.', 'The card could not be previewed.')}</Text>}
                    </View>
                    <View style={styles.previewNavigation}>
                        <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) <= 0} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.max(0, (index ?? 0) - 1)); }}><Text style={styles.previewNavText}>‹ {l('Önceki', 'Previous')}</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) >= selectedCards.length - 1} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.min(selectedCards.length - 1, (index ?? 0) + 1)); }}><Text style={styles.previewNavText}>{l('Sonraki', 'Next')} ›</Text></TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Modal>

            <SheetModal visible={flagPickerMode !== null} onClose={() => setFlagPickerMode(null)}>
                <Text scaleRole="title" style={styles.modalTitle}>
                    {flagPickerMode === 'selection' ? l('Seçili Kartları Bayrakla', 'Flag Selected Cards') : l('Bayrağa Göre Filtrele', 'Filter by Flag')}
                </Text>
                {flagPickerMode === 'filter' && (
                    <TouchableOpacity style={[styles.pickerRow, flagFilter === null && styles.pickerRowActive]} onPress={() => { setFlagFilter(null); setFlagPickerMode(null); }}>
                        <View style={[styles.flagDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.pickerRowText, flagFilter === null && styles.pickerRowTextActive]}>{l('Tüm bayraklar', 'All flags')}</Text>
                        {flagFilter === null && <Text style={styles.pickerCheck}>✓</Text>}
                    </TouchableOpacity>
                )}
                {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                    <TouchableOpacity key={flag} style={[styles.pickerRow, flagPickerMode === 'filter' && flagFilter === flag && styles.pickerRowActive]} onPress={() => applyFlag(flag)}>
                        <View style={[styles.flagDot, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                        <Text style={[styles.pickerRowText, flagPickerMode === 'filter' && flagFilter === flag && styles.pickerRowTextActive]}>
                            {flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                        </Text>
                        {flagPickerMode === 'filter' && flagFilter === flag && <Text style={styles.pickerCheck}>✓</Text>}
                    </TouchableOpacity>
                ))}
            </SheetModal>

            <SheetModal visible={showOptions} onClose={() => setShowOptions(false)}>
                <Text scaleRole="title" style={styles.modalTitle}>{l('Kart Tarayıcı Seçenekleri', 'Card Browser Options')}</Text>
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
                <View style={styles.optionRow}>
                    <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>{l('Kompakt satırlar', 'Compact rows')}</Text>
                        <Text style={styles.optionCaption}>{l('Daha fazla kartı aynı ekranda gösterir.', 'Fits more cards on screen.')}</Text>
                    </View>
                    <Switch value={compactRows} onValueChange={(value) => updateBrowserOption('compact', value)} trackColor={{ true: colors.accentLight }} thumbColor={compactRows ? colors.accent : colors.textMuted} />
                </View>
                <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowOptions(false)}>
                    <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                </TouchableOpacity>
            </SheetModal>

            <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={deckPickerRows.map((node) => node.deck)}
                selectedDeckName={null}
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
                onCreateDeck={() => router.push(`/decks?create=${Date.now()}` as any)}
            />

            <Modal visible={showFilteredDeckDialog} transparent animationType="fade" onRequestClose={() => setShowFilteredDeckDialog(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFilteredDeckDialog(false)} />
                    <View style={styles.modalCard} accessibilityViewIsModal>
                        <Text scaleRole="title" style={styles.modalTitle}>{l('Filtrelenmiş Deste Oluştur', 'Create Filtered Deck')}</Text>
                        <Text style={styles.fieldLabel}>{l('Deste adı', 'Deck name')}</Text>
                        <TextInput style={styles.dialogInput} value={filteredDeckName} onChangeText={setFilteredDeckName} placeholderTextColor={colors.textMuted} autoCorrect={false} />
                        <Text style={styles.fieldLabel}>{l('Arama', 'Search')}</Text>
                        <View style={styles.searchPreviewBox}>
                            <Text style={styles.searchPreviewText}>{browserSearch || l('Tüm kartlar', 'All cards')}</Text>
                        </View>
                        <Text style={styles.fieldLabel}>{l('Kart sınırı', 'Card limit')}</Text>
                        <TextInput style={styles.dialogInput} value={filteredDeckLimit} onChangeText={(value) => setFilteredDeckLimit(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="100" placeholderTextColor={colors.textMuted} />
                        <View style={styles.dialogActions}>
                            <TouchableOpacity style={styles.dialogButton} onPress={() => setShowFilteredDeckDialog(false)}>
                                <Text style={styles.dialogButtonText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.dialogButton, styles.dialogButtonPrimary]} onPress={createDeckFromBrowser}>
                                <Text style={styles.dialogButtonPrimaryText}>{l('Oluştur', 'Create')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
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
    searchInput: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },

    // flexGrow: 0 + centered content pin the chips to their natural size; otherwise the
    // row stretches into leftover space when the list below is short, inflating the chips.
    // No maxHeight: a hard ceiling here clipped the chip labels at the larger Dynamic Type
    // sizes, which is exactly the text the filter row exists to show.
    filterScroll: { minHeight: 42, flexGrow: 0 },
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

    list: { flex: 1 },
    listContent: { padding: Spacing.lg, gap: 8 },

    cardItem: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        ...Shadows.sm,
    },
    cardItemCompact: { paddingVertical: Spacing.sm },
    cardItemSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    cardSuspended: { opacity: 0.5 },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardIcon: { fontSize: 22, marginTop: 2 },
    cardBody: { flex: 1, minWidth: 0 },
    cardQuestion: { fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary, lineHeight: 22 },
    cardMeta: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    cardTopic: { flex: 1, minWidth: 0, fontSize: FontSize.xs, color: colors.textMuted },
    statusDot: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
    statusDotText: { fontSize: 9, fontWeight: '600' },
    scheduleMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 3 },
    answerSnippet: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
    selectionCheckbox: {
        width: 22,
        height: 22,
        marginTop: 3,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionCheckboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    selectionCheckboxTick: { color: colors.white, fontSize: 15, lineHeight: 17, fontWeight: '900' },
    cardActions: {
        width: 32,
        flexShrink: 0,
        alignItems: 'center',
        gap: 5,
    },
    editBtn: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: colors.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtnText: { fontSize: 14 },
    suspendedIcon: { fontSize: 18 },
    flagIcon: { fontSize: 18 },

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
    selectionBarCount: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm },
    selectionBarClose: { color: colors.textSecondary, fontSize: 28, lineHeight: 30, fontWeight: '300' },
    selectionBarCountText: { color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
    selectionAction: { width: 62, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
    selectionActionIcon: { color: colors.accent, fontSize: 20, lineHeight: 23, fontWeight: '700' },
    selectionActionText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },

    selectionMenuOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.32)',
    },
    selectionMenuCard: {
        maxHeight: '78%',
        paddingBottom: Spacing.xl,
        overflow: 'hidden',
        backgroundColor: colors.bgCard,
        borderTopLeftRadius: BorderRadius.lg,
        borderTopRightRadius: BorderRadius.lg,
        ...Shadows.lg,
    },
    // The rows and header inside this sheet already pad themselves edge to edge.
    selectionMenuSheet: { paddingHorizontal: 0, paddingTop: 0, maxHeight: '78%' },
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
        paddingVertical: Spacing.xs,
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
        minHeight: 22,
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
    checkboxTick: { color: colors.white, fontSize: 15, lineHeight: 17, fontWeight: '900' },
    checkboxLabel: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
    gradeRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
    gradeDot: { width: 12, height: 12, borderRadius: 6 },
    gradeText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
    previewContainer: { flex: 1, backgroundColor: colors.bgPrimary },
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
