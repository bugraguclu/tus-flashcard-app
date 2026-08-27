// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename,
// options/limits, custom study, delete) and drag-and-drop nesting via the row handle.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Modal,
    PanResponder,
    Animated,
    LayoutAnimation,
    UIManager,
    Platform,
    Keyboard,
    KeyboardAvoidingView,
    Switch,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import {
    getAllDecks,
    getDeckByName,
    getAvailableDeckName,
    getAvailableDeckSubtreeName,
    getCardCountsByDeck,
    buildDeckTree,
    flattenDeckTree,
    createDeck,
    createFilteredDeck,
    deleteDeck,
    renameDeck,
    moveDeckUnder,
    addDeckTodayBoost,
    createOrReplaceCustomStudySession,
    updateFilteredDeck,
    rebuildFilteredDeck,
    setDeckCollapsed,
    initializeDeckDisclosureDefaults,
    setDeckDescription,
    emptyFilteredDeck,
    reorderDeckRelative,
    type DeckTreeNode,
} from '../../lib/deckManager';
import { getDeckDisplayName, getParentDeckName, type Deck } from '../../lib/models';
import { alert, confirm } from '../../lib/confirm';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount, getStudyQueue } from '../../lib/studyRepository';
import { createBackupNow } from '../../lib/backup';
import {
    useAppSettings,
    useCatalogStatus,
    useCollectionInvalidation,
    useStudyScope,
} from '../../contexts/AppContext';
import { useI18n } from '../../hooks/useI18n';
import { filteredOrderLabel, formatCount } from '../../lib/i18n';
import { normalizeDeckLeafInput } from '../../lib/deckNavigation';
import DisclosureChevron from '../../components/DisclosureChevron';
import LockGlyph from '../../components/LockGlyph';
import SwipeDismissSheet from '../../components/SwipeDismissSheet';
import { BKA_MANIFEST } from '../../lib/bkaManifest';
import {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_PACK,
    BKA_CATALOG_ROOT_DECK_ID,
    getBkaCatalogTier,
} from '../../lib/bkaCatalog';
import { requestDeckShortcut } from '../../modules/deck-shortcuts';
import { sanitizeUnsignedIntegerDraft } from '../../lib/boundedNumber';
import { FILTERED_DECK_ORDER_UI } from '../../lib/filteredDeckOptions';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import { DATA_EXPORT_ROUTE, DATA_IMPORT_ROUTE } from '../../lib/dataManagementRoutes';
import { consumeSchedulingRevision } from '../../lib/deferredInvalidation';

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

type ModalState =
    | { kind: 'menu'; deck: Deck }
    | { kind: 'rename'; deck: Deck }
    | { kind: 'create-subdeck'; deck: Deck }
    | { kind: 'description'; deck: Deck }
    | { kind: 'custom'; deck: Deck }
    | { kind: 'filter'; deck: Deck }
    | { kind: 'create-filter' }
    | null;

function parseCount(text: string, fallback: number = 0): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

const ROOT_DROP_TARGET = '__root_deck_drop_target__';
type DeckDropPlacement = 'before' | 'inside' | 'after';

function decodeDeckDropTarget(target: string | null):
    | { kind: 'root' }
    | { kind: 'deck'; name: string; placement: DeckDropPlacement }
    | null {
    if (!target) return null;
    if (target === ROOT_DROP_TARGET) return { kind: 'root' };
    const separator = target.indexOf(':');
    if (separator < 0) return null;
    const placement = target.slice(0, separator) as DeckDropPlacement;
    if (placement !== 'before' && placement !== 'inside' && placement !== 'after') return null;
    return { kind: 'deck', placement, name: target.slice(separator + 1) };
}

function encodeDeckDropTarget(name: string, placement: DeckDropPlacement): string {
    return `${placement}:${name}`;
}
// A deliberate spring-open delay prevents a parent from expanding while the pointer merely
// passes over it. 800 ms sits in the familiar 0.6–1.0 s range used by tree/list drag UIs.
const DECK_HOVER_EXPAND_DELAY_MS = 800;

function getPersistedExpandedDeckNames(): Set<string> {
    initializeDeckDisclosureDefaults();
    return new Set(getAllDecks().filter((deck) => !deck.collapsed).map((deck) => deck.name));
}

/** Keep disclosure state attached to the same decks after an Anki-style subtree rename. */
function remapExpandedDeckPaths(
    paths: Set<string>,
    oldPath: string,
    newPath: string,
    additionallyExpand?: string | null,
): Set<string> {
    const next = new Set<string>();
    for (const path of paths) {
        if (path === oldPath || path.startsWith(`${oldPath}::`)) {
            next.add(`${newPath}${path.slice(oldPath.length)}`);
        } else {
            next.add(path);
        }
    }
    if (additionallyExpand) next.add(additionallyExpand);
    return next;
}

export default function DecksScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isCompact = width < 600;
    // Bottom-sheet modals fill most of the screen; a top inset keeps the tap-to-dismiss backdrop
    // reachable below the status bar/notch instead of hiding under it.
    const compactSheetTopInset = { paddingTop: insets.top + Spacing.md };
    const isDesktopWeb = Platform.OS === 'web' && !isCompact;
    const supportsDeckDrag = isDesktopWeb || Platform.OS === 'ios' || Platform.OS === 'android';
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings } = useAppSettings();
    const { collectionVersion, invalidateCollection, getSchedulingRevision } = useCollectionInvalidation();
    const { activeDeckName } = useStudyScope();
    const { catalogAccess, catalogInstalled, catalogInstalling } = useCatalogStatus();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(getPersistedExpandedDeckNames);
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const pendingOverflowRouteRef = useRef<string | null>(null);
    const pendingOverflowActionRef = useRef<(() => void) | null>(null);
    const pendingDeckMenuRouteRef = useRef<string | null>(null);
    const [newDeckName, setNewDeckName] = useState('');
    const [newFilteredDeckName, setNewFilteredDeckName] = useState('');
    const [filteredDeckScreenTitle, setFilteredDeckScreenTitle] = useState('');
    const [refreshToken, setRefreshToken] = useState(0);
    const [visibleSchedulingRevision, setVisibleSchedulingRevision] = useState(getSchedulingRevision);
    const [modal, setModal] = useState<ModalState>(null);

    // Modal form fields (filled when the corresponding modal opens).
    const [renameText, setRenameText] = useState('');
    const [newSubdeckName, setNewSubdeckName] = useState('');
    const [descriptionText, setDescriptionText] = useState('');
    const [boostNew, setBoostNew] = useState('10');
    const [boostReview, setBoostReview] = useState('20');
    const [customLimit, setCustomLimit] = useState('50');
    const [customTag, setCustomTag] = useState('');
    const [forgottenDays, setForgottenDays] = useState('7');
    const [aheadDays, setAheadDays] = useState('3');
    // Filtered-deck options form.
    const [filterSearch, setFilterSearch] = useState('');
    const [filterLimit, setFilterLimit] = useState('100');
    const [filterOrder, setFilterOrder] = useState(0);
    const [filterSearch2, setFilterSearch2] = useState('');
    const [filterLimit2, setFilterLimit2] = useState('100');
    const [filterOrder2, setFilterOrder2] = useState(0);
    const [filterSecondEnabled, setFilterSecondEnabled] = useState(false);
    const [filterReschedule, setFilterReschedule] = useState(true);
    const [filterAllowEmpty, setFilterAllowEmpty] = useState(false);
    const [filterHelpVisible, setFilterHelpVisible] = useState(false);
    const [filterOrderPicker, setFilterOrderPicker] = useState<1 | 2 | null>(null);
    const [filterOrderAnchor, setFilterOrderAnchor] = useState<{ x: number; y: number; width: number } | null>(null);
    const firstFilterOrderRef = useRef<View>(null);
    const secondFilterOrderRef = useRef<View>(null);
    const catalogTier = useMemo(
        () => getBkaCatalogTier(),
        [catalogInstalled, collectionVersion],
    );

    // Tabs remain mounted while studying. Pull the passive scheduler revision only when the
    // deck list is visible again, then compute all deck/filtered-deck counts once.
    useFocusEffect(useCallback(() => {
        const next = getSchedulingRevision();
        setVisibleSchedulingRevision((previous) => (
            consumeSchedulingRevision(previous, next, () => { })
        ));
    }, [getSchedulingRevision]));

    // Drag-and-drop state: rows report their content-space layout; the active drag
    // tracks the pointer against those rows to pick a drop target.
    const rowLayouts = useRef(new Map<string, { y: number; h: number }>());
    const deckRowRefs = useRef(new Map<string, View>());
    const scrollOffsetRef = useRef(0);
    const listTopRef = useRef(0);
    const listHeightRef = useRef(0);
    const listContentHeightRef = useRef(0);
    const listWrapRef = useRef<View>(null);
    const deckScrollRef = useRef<ScrollView>(null);
    const hoverExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [draggingDeck, setDraggingDeck] = useState<string | null>(null);
    const draggingRef = useRef<string | null>(null);
    const dropTargetRef = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const dragPageYRef = useRef<number | null>(null);
    const dragAutoScrollFrameRef = useRef<number | null>(null);
    const dragPreviewTranslateY = useRef(new Animated.Value(72)).current;
    const dragPreviewLift = useRef(new Animated.Value(0)).current;
    // PanResponder must survive the state update fired when dragging begins. Recreating it
    // during that render loses its closure-local `activated` flag and leaves the UI stuck in
    // drag mode without receiving move/release callbacks.
    const dragRespondersRef = useRef(new Map<number, ReturnType<typeof PanResponder.create>>());
    const dragHandlersRef = useRef<{
        begin: (node: DeckTreeNode, pageY: number) => void;
        move: (pageY: number) => void;
        complete: () => void;
        cancel: () => void;
    } | null>(null);

    useEffect(() => {
        if (Platform.OS === 'android') {
            UIManager.setLayoutAnimationEnabledExperimental?.(true);
        }
        return () => {
            if (hoverExpandTimerRef.current) clearTimeout(hoverExpandTimerRef.current);
            if (dragAutoScrollFrameRef.current !== null) {
                cancelAnimationFrame(dragAutoScrollFrameRef.current);
            }
        };
    }, []);

    const animateDeckTreeLayout = () => {
        LayoutAnimation.configureNext({
            duration: 190,
            update: { type: LayoutAnimation.Types.easeInEaseOut },
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
    };

    const deckTree = useMemo(() => {
        const decks = getAllDecks();
        const counts = getCardCountsByDeck(Date.now(), settings.dayRolloverHour, settings.learnAheadMinutes);
        const claimedFilteredCardIds = new Set<number>();

        // Filtered decks are gathered virtually in this client, so their rows need counts from
        // the saved search instead of from card.deckId. Parents do not aggregate these counts
        // (deckManager prevents double-counting the same home-deck cards).
        for (const deck of decks) {
            if (!deck.isFiltered) continue;
            try {
                const result = getStudyQueue({ settings, selectedDeckName: deck.name });
                // A physical Anki filtered deck temporarily removes its cards from their home
                // deck. Our virtual implementation mirrors the visible result here and prevents
                // overlapping filtered decks from claiming/counting the same card twice.
                const cards = (result.allSessionCards ?? result.cards).filter((card) => {
                    if (claimedFilteredCardIds.has(card.cardId)) return false;
                    claimedFilteredCardIds.add(card.cardId);
                    const home = counts.get(card.deckId);
                    if (home) {
                        home.total = Math.max(0, home.total - 1);
                        if (card.state.status === 'new') home.new = Math.max(0, home.new - 1);
                        else if (card.state.status === 'learning') home.learn = Math.max(0, home.learn - 1);
                        else home.review = Math.max(0, home.review - 1);
                    }
                    return true;
                });
                counts.set(deck.id, {
                    new: cards.filter((card) => card.state.status === 'new').length,
                    learn: cards.filter((card) => card.state.status === 'learning').length,
                    review: cards.filter((card) => card.state.status === 'review').length,
                    total: cards.length,
                });
            } catch (e) {
                console.warn('[Decks] filtered deck count failed:', e);
            }
        }
        const tree = buildDeckTree(decks, counts, settings.dayRolloverHour);
        return tree;
    }, [refreshToken, collectionVersion, visibleSchedulingRevision, settings, catalogTier]);

    // The context learns the install state one effect after this screen first renders, which would
    // flash the locked row at a learner who already owns the pack; the collection itself is the
    // authority on the first frame.
    const fullCatalogPresent = catalogTier === 'full';

    // Flat list of visible rows: keeps drag math simple and layout depth-independent.
    const visibleRows = useMemo(() => {
        const rows: DeckTreeNode[] = [];
        const walk = (nodes: DeckTreeNode[]) => {
            for (const node of nodes) {
                rows.push(node);
                if (expandedDecks.has(node.deck.name)) walk(node.children);
            }
        };
        walk(deckTree);
        return rows;
    }, [deckTree, expandedDecks]);
    const visibleRowsRef = useRef<DeckTreeNode[]>(visibleRows);
    visibleRowsRef.current = visibleRows;
    const decodedDropTarget = decodeDeckDropTarget(dropTarget);
    const dragDropFeedback = useMemo(() => {
        if (!draggingDeck || !decodedDropTarget) return null;
        const dragged = getDeckDisplayName(draggingDeck);
        if (decodedDropTarget.kind === 'root') {
            return {
                title: l(`${dragged} ana seviyeye taşınacak`, `${dragged} will move to the top level`),
                tone: 'root' as const,
            };
        }

        const target = getDeckDisplayName(decodedDropTarget.name);
        if (decodedDropTarget.placement === 'inside') {
            return {
                title: l(`${dragged}, ${target} destesinin alt destesi olacak`, `${dragged} will become a subdeck of ${target}`),
                tone: 'inside' as const,
            };
        }
        if (decodedDropTarget.placement === 'before') {
            return {
                title: l(`${dragged}, ${target} destesinin üstüne yerleşecek`, `${dragged} will be placed above ${target}`),
                tone: 'order' as const,
            };
        }
        return {
            title: l(`${dragged}, ${target} destesinin altına yerleşecek`, `${dragged} will be placed below ${target}`),
            tone: 'order' as const,
        };
    }, [decodedDropTarget, draggingDeck, l]);

    const refresh = useCallback(() => {
        setRefreshToken((value) => value + 1);
        invalidateCollection();
    }, [invalidateCollection]);

    const toggleExpand = (deck: Deck) => {
        animateDeckTreeLayout();
        setExpandedDecks((prev) => {
            const next = new Set(prev);
            const willCollapse = next.has(deck.name);
            if (willCollapse) next.delete(deck.name);
            else next.add(deck.name);
            setDeckCollapsed(deck.id, willCollapse);
            return next;
        });
    };

    const handleStudy = (deckName: string) => {
        router.push({ pathname: '/', params: { deck: deckName } } as any);
    };

    // Anki: clicking a deck opens its overview (Study Now / Unbury / description) first.
    const handleOpenOverview = (deckName: string) => {
        router.push(`/deck-overview?deck=${encodeURIComponent(deckName)}` as any);
    };

    const handleAddDeck = () => {
        const name = normalizeDeckLeafInput(newDeckName);
        if (!name) return;

        try {
            createDeck(getAvailableDeckName(name));
            setNewDeckName('');
            setShowAddDeck(false);
            refresh();
        } catch (e) {
            console.warn('[Decks] createDeck failed:', e);
            alert(t('common.error'), l('Deste oluşturulamadı.', 'Could not create the deck.'));
        }
    };

    const openOverflowRoute = (path: string) => {
        // iOS must finish dismissing the native overflow Modal before Expo Router presents
        // another modal screen, otherwise UIKit rejects the second presentation.
        if (Platform.OS === 'ios') {
            pendingOverflowRouteRef.current = path;
            setShowOverflowMenu(false);
            return;
        }
        setShowOverflowMenu(false);
        router.push(path as any);
    };

    const handleOverflowDismiss = () => {
        const path = pendingOverflowRouteRef.current;
        pendingOverflowRouteRef.current = null;
        if (path) router.push(path as any);
        const action = pendingOverflowActionRef.current;
        pendingOverflowActionRef.current = null;
        action?.();
    };

    // Run an action after the overflow Modal has fully closed. iOS rejects presenting
    // another modal (router screen, Alert) while the menu is still dismissing, so defer
    // via onDismiss; other platforms have no such constraint and run immediately.
    const runAfterOverflowClose = (action: () => void) => {
        if (Platform.OS === 'ios') {
            pendingOverflowActionRef.current = action;
            setShowOverflowMenu(false);
            return;
        }
        setShowOverflowMenu(false);
        action();
    };

    const handleCreateBackup = () => {
        runAfterOverflowClose(() => {
            void (async () => {
                try {
                    await createBackupNow();
                    alert(
                        l('Yedek oluşturuldu', 'Backup Created'),
                        l('Koleksiyonunuzun bir yedeği kaydedildi.', 'A backup of your collection was saved.'),
                    );
                } catch (e) {
                    console.warn('[Decks] manual backup failed:', e);
                    alert(t('common.error'), l('Yedek oluşturulamadı.', 'Could not create a backup.'));
                }
            })();
        });
    };

    const openDeckMenuRoute = (path: string) => {
        // Dismiss the native menu before presenting another screen on iOS. Pushing while the
        // menu Modal is still mounted can be rejected by UIKit.
        if (Platform.OS === 'ios') {
            pendingDeckMenuRouteRef.current = path;
            setModal(null);
            return;
        }
        setModal(null);
        router.push(path as any);
    };

    const handleDeckModalDismiss = () => {
        const path = pendingDeckMenuRouteRef.current;
        pendingDeckMenuRouteRef.current = null;
        if (path) router.push(path as any);
    };

    const openCreateDeck = () => {
        setShowAddMenu(false);
        setNewDeckName('');
        setShowAddDeck(true);
    };

    // Anki's "Add" toolbar action: open the note editor targeting the current deck. Passing no
    // deckId lets the editor resolve the last-opened deck (activeDeckName), matching Anki's habit
    // of adding to the deck you last studied.
    const openAddCard = () => {
        setShowAddMenu(false);
        router.push('/editor' as any);
    };

    const openCreateFilteredDeck = (initialSearch?: string) => {
        const now = new Date();
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const baseName = `${l('Filtrelenmiş Deste', 'Filtered Deck')} ${timestamp}`;
        let availableName = baseName;
        let suffix = 2;
        while (getDeckByName(availableName)) {
            availableName = `${baseName} ${suffix}`;
            suffix += 1;
        }

        setShowAddMenu(false);
        setNewFilteredDeckName(availableName);
        setFilteredDeckScreenTitle(availableName);
        // Anki scopes a newly-created filtered deck to the current deck. The deck-list FAB
        // has no row of its own, so prefer the last deck opened for study and fall back to
        // the first regular deck in the collection.
        const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
        const sourceDeck = activeDeck && !activeDeck.isFiltered
            ? activeDeck
            : getAllDecks().find((candidate) => !candidate.isFiltered) ?? null;
        const sourceDeckName = sourceDeck?.name.trim() ?? '';
        const sourceDeckTerm = sourceDeckName
            ? (/\s/.test(sourceDeckName)
                ? `deck:"${sourceDeckName.replace(/"/g, '\\"')}"`
                : `deck:${sourceDeckName}`)
            : '';
        const sourceDeckSearch = sourceDeckTerm ? `${sourceDeckTerm} is:due` : 'is:due';

        setFilterSearch(initialSearch === undefined ? sourceDeckSearch : initialSearch.trim());
        setFilterLimit('100');
        setFilterOrder(1);
        setFilterSearch2('');
        setFilterLimit2('100');
        setFilterOrder2(1);
        setFilterSecondEnabled(false);
        setFilterReschedule(true);
        setFilterAllowEmpty(false);
        setFilterHelpVisible(false);
        setFilterOrderPicker(null);
        setModal({ kind: 'create-filter' });
    };

    // The browser launches the same full options screen and supplies its composed search.
    // A token prevents the modal from reopening when Expo preserves tab-route parameters.
    const createFilterToken = typeof params.createFilter === 'string' ? params.createFilter : null;
    const initialFilterSearch = typeof params.filterSearch === 'string' ? params.filterSearch : undefined;
    const openedCreateFilterParam = useRef<string | null>(null);
    useEffect(() => {
        if (!createFilterToken || openedCreateFilterParam.current === createFilterToken) return;
        openedCreateFilterParam.current = createFilterToken;
        openCreateFilteredDeck(initialFilterSearch);
        router.setParams({ createFilter: undefined, filterSearch: undefined } as any);
    }, [createFilterToken, initialFilterSearch, router]);

    const getPendingFilteredDeckMatchCount = () => getFilteredDeckMatchCount(settings, {
        searchQuery: filterSearch.trim(),
        searchLimit: parseCount(filterLimit, 100) || 100,
        searchOrder: filterOrder,
        searchQuery2: filterSecondEnabled ? (filterSearch2.trim() || undefined) : undefined,
        searchLimit2: parseCount(filterLimit2, 100) || 100,
        searchOrder2: filterOrder2,
    });

    const canBuildPendingFilteredDeck = () => {
        if (filterAllowEmpty || getPendingFilteredDeckMatchCount() > 0) return true;
        alert(
            l('Eşleşen kart yok', 'No matching cards'),
            l(
                'Bu filtrelerle deste oluşturulamadı. Aramayı değiştirin veya “Boş olsa bile oluştur/güncelle” seçeneğini açın.',
                'No deck could be built with these filters. Change the search or enable “Create/update this deck even if empty”.',
            ),
        );
        return false;
    };

    const handleCreateFilteredDeck = () => {
        if (modal?.kind !== 'create-filter') return;
        const name = newFilteredDeckName.trim();
        const search = filterSearch.trim();
        if (!name || !search) return;

        if (name.includes('::')) {
            alert(
                t('common.error'),
                l('Filtrelenmiş deste başka bir destenin alt destesi olamaz.', 'A filtered deck cannot be a subdeck.'),
            );
            return;
        }
        if (!canBuildPendingFilteredDeck()) return;
        try {
            const availableName = getAvailableDeckName(name);
            const deck = createFilteredDeck(availableName, search, parseCount(filterLimit, 100) || 100);
            updateFilteredDeck(deck.id, {
                searchQuery: search,
                searchLimit: parseCount(filterLimit, 100) || 100,
                searchOrder: filterOrder,
                searchQuery2: filterSecondEnabled ? (filterSearch2.trim() || undefined) : undefined,
                searchLimit2: parseCount(filterLimit2, 100) || 100,
                searchOrder2: filterOrder2,
                reschedule: filterReschedule,
                allowEmpty: filterAllowEmpty,
            });
            const overviewPath = `/deck-overview?deck=${encodeURIComponent(availableName)}`;
            if (Platform.OS === 'ios') pendingDeckMenuRouteRef.current = overviewPath;
            setModal(null);
            refresh();
            if (Platform.OS !== 'ios') router.push(overviewPath as any);
        } catch (e) {
            console.warn('[Decks] create filtered deck failed:', e);
            alert(t('common.error'), l('Filtrelenmiş deste oluşturulamadı.', 'Could not create the filtered deck.'));
        }
    };

    // ---- Gear menu actions ----

    const openMenu = (deck: Deck) => setModal({ kind: 'menu', deck });

    const openRename = (deck: Deck) => {
        setRenameText(getDeckDisplayName(deck.name));
        setModal({ kind: 'rename', deck });
    };

    const openCreateSubdeck = (deck: Deck) => {
        setNewSubdeckName('');
        setModal({ kind: 'create-subdeck', deck });
    };

    const handleCreateSubdeck = () => {
        if (modal?.kind !== 'create-subdeck') return;
        const leafName = normalizeDeckLeafInput(newSubdeckName);
        if (!leafName) {
            alert(t('common.error'), l('Alt deste adı boş olamaz.', 'The subdeck name cannot be empty.'));
            return;
        }

        const fullName = `${modal.deck.name}::${leafName}`;

        try {
            const availableName = getAvailableDeckName(fullName);
            createDeck(availableName, modal.deck.configId);
            setDeckCollapsed(modal.deck.id, false);
            setExpandedDecks((prev) => {
                const next = new Set(prev);
                next.add(modal.deck.name);
                return next;
            });
            setModal(null);
            refresh();
            if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            }
        } catch (e) {
            console.warn('[Decks] create subdeck failed:', e);
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('Alt deste oluşturulamadı. Lütfen tekrar deneyin.', 'Could not create the subdeck. Please try again.'),
            ));
        }
    };

    const openDescription = (deck: Deck) => {
        setDescriptionText(deck.description ?? '');
        setModal({ kind: 'description', deck });
    };

    const handleSaveDescription = () => {
        if (modal?.kind !== 'description') return;
        try {
            setDeckDescription(modal.deck.id, descriptionText);
            setModal(null);
            refresh();
        } catch (e) {
            console.warn('[Decks] description save failed:', e);
            alert(t('common.error'), l('Deste açıklaması kaydedilemedi.', 'Could not save the deck description.'));
        }
    };

    const handleCreateShortcut = async (deck: Deck) => {
        try {
            const url = Linking.createURL('/', { queryParams: { deck: deck.name } });
            const visibleDeckName = deck.name.replaceAll('::', ' › ');

            if (Platform.OS === 'android') {
                const status = await requestDeckShortcut(String(deck.id), visibleDeckName, url);
                setModal(null);

                if (status === 'requested') {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                    setTimeout(() => alert(
                        l('Kısayol isteği gönderildi', 'Shortcut requested'),
                        l(
                            `Ana ekran başlatıcınız onay istediğinde kabul edin. Kısayol “${visibleDeckName}” destesini doğrudan açar.`,
                            `Accept the request when your Home Screen launcher asks. The shortcut opens “${visibleDeckName}” directly.`,
                        ),
                    ), 0);
                    return;
                }

                await Clipboard.setStringAsync(url);
                setTimeout(() => alert(
                    l('Kısayol bağlantısı hazır', 'Shortcut link ready'),
                    l(
                        `Ana ekran başlatıcınız otomatik kısayol eklemeyi desteklemiyor. “${visibleDeckName}” destesini açan bağlantı panoya kopyalandı.`,
                        `Your Home Screen launcher does not support automatic shortcut creation. A link that opens “${visibleDeckName}” was copied to the clipboard.`,
                    ),
                ), 0);
                return;
            }

            if (Platform.OS === 'ios') {
                const status = await requestDeckShortcut(String(deck.id), visibleDeckName, url);
                setModal(null);

                if (status === 'created') {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                    setTimeout(() => alert(
                        l('Kestirme eklendi', 'Shortcut added'),
                        l(
                            `“${visibleDeckName}” kestirmesi Apple Kestirmeler’e eklendi. Çalıştırdığınızda bu deste doğrudan açılır.`,
                            `The “${visibleDeckName}” shortcut was added to Apple Shortcuts. Running it opens this deck directly.`,
                        ),
                    ), 300);
                    return;
                }

                if (status === 'cancelled') return;

                setTimeout(() => alert(
                    l('Kestirme eklenemedi', 'Could not add shortcut'),
                    l(
                        'Bu özellik Expo Go yerine TusAnkiM uygulama yapısında çalışır. Uygulamayı yeniden derleyip tekrar deneyin.',
                        'This feature works in a TusAnkiM app build rather than Expo Go. Rebuild the app and try again.',
                    ),
                ), 300);
                return;
            }

            await Clipboard.setStringAsync(url);
            setModal(null);
            setTimeout(() => alert(
                l('Kısayol bağlantısı hazır', 'Shortcut link ready'),
                l(
                    `“${visibleDeckName}” destesini doğrudan açan bağlantı panoya kopyalandı.`,
                    `A link that opens “${visibleDeckName}” directly was copied to the clipboard.`,
                ),
            ), 0);
        } catch (e) {
            console.warn('[Decks] shortcut creation failed:', e);
            alert(t('common.error'), l('Deste kısayolu oluşturulamadı.', 'Could not create the deck shortcut.'));
        }
    };

    const openCustomStudy = (deck: Deck) => {
        setBoostNew('10');
        setBoostReview('20');
        setCustomLimit('50');
        setCustomTag('');
        setForgottenDays('7');
        setAheadDays('3');
        setModal({ kind: 'custom', deck });
    };

    const openFilterOptions = (deck: Deck) => {
        setNewFilteredDeckName(deck.name);
        setFilteredDeckScreenTitle(getDeckDisplayName(deck.name));
        setFilterSearch(deck.searchQuery ?? '');
        setFilterLimit(String(deck.searchLimit ?? 100));
        setFilterOrder(deck.searchOrder ?? 0);
        setFilterSearch2(deck.searchQuery2 ?? '');
        setFilterLimit2(String(deck.searchLimit2 ?? 100));
        setFilterOrder2(deck.searchOrder2 ?? 0);
        setFilterSecondEnabled(Boolean(deck.searchQuery2?.trim()));
        setFilterReschedule(deck.reschedule ?? true);
        setFilterAllowEmpty(deck.filteredAllowEmpty ?? false);
        setFilterHelpVisible(false);
        setFilterOrderPicker(null);
        setModal({ kind: 'filter', deck });
    };

    const handleSaveFilterOptions = () => {
        if (modal?.kind !== 'filter') return;
        try {
            const nextName = newFilteredDeckName.trim();
            if (!nextName) return;
            if (nextName.includes('::')) {
                alert(
                    t('common.error'),
                    l('Filtrelenmiş deste başka bir destenin alt destesi olamaz.', 'A filtered deck cannot be a subdeck.'),
                );
                return;
            }
            if (!canBuildPendingFilteredDeck()) return;
            if (nextName !== modal.deck.name) renameDeck(modal.deck.id, nextName);
            updateFilteredDeck(modal.deck.id, {
                searchQuery: filterSearch.trim(),
                searchLimit: parseCount(filterLimit, 100) || 100,
                searchOrder: filterOrder,
                searchQuery2: filterSecondEnabled ? (filterSearch2.trim() || undefined) : undefined,
                searchLimit2: parseCount(filterLimit2, 100) || 100,
                searchOrder2: filterOrder2,
                reschedule: filterReschedule,
                allowEmpty: filterAllowEmpty,
            });
            setModal(null);
            refresh();
        } catch (e) {
            console.warn('[Decks] filter options save failed:', e);
            alert(t('common.error'), l('Filtre seçenekleri kaydedilemedi.', 'Could not save filtered deck options.'));
        }
    };

    const handleRebuildFilter = (deck: Deck) => {
        rebuildFilteredDeck(deck.id);
        setModal(null);
        refresh();
        alert(l('Deste yeniden oluşturuldu', 'Deck rebuilt'), l('Kartlar kayıtlı arama ve sıralama kurallarıyla yeniden toplandı.', 'Cards were gathered again using the saved search and sort rules.'));
    };

    /** Custom study variants (forgotten / ahead / preview): build the session and offer to study. */
    const handleCreateSpecialSession = (search: string, options: { reschedule: boolean; searchOrder: number }) => {
        if (modal?.kind !== 'custom') return;
        const deck = modal.deck;
        try {
            const session = createOrReplaceCustomStudySession(deck.id, search, 999, options);
            setModal(null);
            refresh();
            if (session) {
                setExpandedDecks((prev) => new Set(prev).add(deck.name));
                confirm(
                    l('Özel çalışma oturumu hazır', 'Custom Study session ready'),
                    l(`"${getDeckDisplayName(session.name)}" güncellendi. Şimdi çalışmak ister misiniz?`, `"${getDeckDisplayName(session.name)}" was updated. Study now?`),
                    () => handleStudy(session.name),
                );
            }
        } catch (e) {
            console.warn('[Decks] special session failed:', e);
            alert(t('common.error'), l('Özel çalışma oturumu oluşturulamadı.', 'Could not create the Custom Study session.'));
        }
    };

    const handleRename = () => {
        if (modal?.kind !== 'rename') return;
        const nextLeafName = normalizeDeckLeafInput(renameText);
        if (!nextLeafName) return;
        const parentName = getParentDeckName(modal.deck.name);
        const nextName = parentName ? `${parentName}::${nextLeafName}` : nextLeafName;

        try {
            const availableName = getAvailableDeckSubtreeName(modal.deck.id, nextName);
            renameDeck(modal.deck.id, availableName);
            setExpandedDecks((prev) => remapExpandedDeckPaths(prev, modal.deck.name, availableName));
            setModal(null);
            refresh();
        } catch (e) {
            console.warn('[Decks] rename failed:', e);
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('Deste yeniden adlandırılamadı. Lütfen tekrar deneyin.', 'Could not rename the deck. Please try again.'),
            ));
        }
    };

    const handleBoost = (extraNew: number, extraReview: number) => {
        if (modal?.kind !== 'custom') return;
        addDeckTodayBoost(modal.deck.id, extraNew, extraReview, settings.dayRolloverHour);
        setModal(null);
        refresh();
        alert(l('✅ Bugünkü limit artırıldı', '✅ Today’s limit increased'), extraNew > 0
            ? l(`Bugün bu desteden ${extraNew} ek yeni kart gösterilecek.`, `${extraNew} additional new cards will be shown from this deck today.`)
            : l(`Bugün bu destede ${extraReview} ek tekrara izin verildi.`, `${extraReview} additional reviews are allowed in this deck today.`));
    };

    const handleCreateCustomSession = () => {
        if (modal?.kind !== 'custom') return;
        const deck = modal.deck;
        const tag = customTag.trim();
        const search = tag ? `deck:"${deck.name}" tag:"${tag}"` : `deck:"${deck.name}"`;

        try {
            const session = createOrReplaceCustomStudySession(deck.id, search, parseCount(customLimit, 50) || 50);
            setModal(null);
            refresh();
            if (session) {
                setExpandedDecks((prev) => new Set(prev).add(deck.name));
                confirm(
                    l('Özel çalışma oturumu hazır', 'Custom Study session ready'),
                    l(`"${getDeckDisplayName(session.name)}" oluşturuldu. Şimdi çalışmak ister misiniz?`, `"${getDeckDisplayName(session.name)}" was created. Study now?`),
                    () => handleStudy(session.name),
                );
            }
        } catch (e) {
            console.warn('[Decks] custom study failed:', e);
            alert(t('common.error'), l('Özel çalışma oturumu oluşturulamadı.', 'Could not create the Custom Study session.'));
        }
    };

    const handleDelete = (deck: Deck) => {
        confirm(
            l('Desteyi sil', 'Delete Deck'),
            deck.isFiltered
                ? l(`"${getDeckDisplayName(deck.name)}" silinecek; kartlar ait oldukları destelere dönecek.`, `"${getDeckDisplayName(deck.name)}" will be deleted; its cards will return to their original decks.`)
                : l(`"${getDeckDisplayName(deck.name)}" tüm alt desteleri ve içindeki kartlarla birlikte silinecek. Bu işlem geri alınamaz.`, `"${getDeckDisplayName(deck.name)}" and all of its subdecks and cards will be deleted. This cannot be undone.`),
            () => {
                try {
                    deleteDeck(deck.id);
                    setModal(null);
                    refresh();
                } catch (e) {
                    console.warn('[Decks] delete failed:', e);
                    alert(t('common.error'), l('Deste silinemedi.', 'Could not delete the deck.'));
                }
            },
            { destructive: true },
        );
    };

    const requestDelete = (deck: Deck) => {
        setModal(null);
        setTimeout(() => handleDelete(deck), Platform.OS === 'ios' ? 250 : 0);
    };

    const requestEmptyFilteredDeck = (deck: Deck) => {
        setModal(null);
        setTimeout(() => confirm(
            l('Filtrelenmiş desteyi boşalt', 'Empty Filtered Deck'),
            l('Kartlar silinmez; ait oldukları destelere döner.', 'Cards are not deleted; they return to their home decks.'),
            () => {
                emptyFilteredDeck(deck.id);
                refresh();
            },
        ), Platform.OS === 'ios' ? 250 : 0);
    };

    // ---- Drag & drop ----

    const isDescendantOf = (name: string, ancestor: string) => name.startsWith(`${ancestor}::`);
    const isOverRootDropZone = (listY: number, dragged: string) => (
        Boolean(getParentDeckName(dragged)) && listY >= -64 && listY <= -6
    );

    const clearHoverExpandTimer = () => {
        if (!hoverExpandTimerRef.current) return;
        clearTimeout(hoverExpandTimerRef.current);
        hoverExpandTimerRef.current = null;
    };

    const cancelDragAutoScroll = () => {
        if (dragAutoScrollFrameRef.current === null) return;
        cancelAnimationFrame(dragAutoScrollFrameRef.current);
        dragAutoScrollFrameRef.current = null;
    };

    const resetDeckDrag = () => {
        clearHoverExpandTimer();
        cancelDragAutoScroll();
        draggingRef.current = null;
        dragPageYRef.current = null;
        dropTargetRef.current = null;
        dragPreviewLift.stopAnimation();
        dragPreviewLift.setValue(0);
        setDraggingDeck(null);
        setDropTarget(null);
    };

    const findDropTarget = (pageY: number, dragged: string): string | null => {
        const listY = pageY - listTopRef.current;
        // Keep the top-level target just above the scrolling rows so it never covers the first
        // visible deck, which must remain a valid parent drop target.
        if (isOverRootDropZone(listY, dragged)) return ROOT_DROP_TARGET;
        if (listY < 0 || (listHeightRef.current > 0 && listY > listHeightRef.current)) return null;

        const contentY = listY + scrollOffsetRef.current;
        let nearestTarget: { name: string; placement: 'before' | 'after'; distance: number } | null = null;
        let firstValidRow: { name: string; y: number } | null = null;
        let lastValidRow: { name: string; bottom: number } | null = null;
        for (const row of visibleRowsRef.current) {
            const layout = rowLayouts.current.get(row.deck.name);
            if (!layout) continue;
            const name = row.deck.name;
            const isLockedCatalogTarget = catalogTier === 'trial'
                && row.deck.catalogPack === BKA_CATALOG_PACK;
            const isInvalidTarget = name === dragged
                || isDescendantOf(name, dragged)
                || isLockedCatalogTarget;
            if (!isInvalidTarget) {
                if (!firstValidRow || layout.y < firstValidRow.y) firstValidRow = { name, y: layout.y };
                if (!lastValidRow || layout.y + layout.h > lastValidRow.bottom) {
                    lastValidRow = { name, bottom: layout.y + layout.h };
                }
            }
            if (contentY >= layout.y && contentY <= layout.y + layout.h) {
                if (isInvalidTarget) return null;
                const position = (contentY - layout.y) / Math.max(1, layout.h);
                // The broad edge zones make ordinary list reordering effortless. The calmer
                // centre zone retains Anki's drop-onto-parent behaviour for creating subdecks.
                const placement: DeckDropPlacement = position < 0.36
                    ? 'before'
                    : position > 0.64
                        ? 'after'
                        : 'inside';
                if (placement === 'inside' && row.deck.isFiltered) return null;
                return encodeDeckDropTarget(name, placement);
            }

            // Nested cards have small visual gaps between their rows. Snap those gaps to the
            // nearest valid deck so the target does not flicker away while the finger moves.
            if (isInvalidTarget) continue;
            const distance = contentY < layout.y
                ? layout.y - contentY
                : contentY - (layout.y + layout.h);
            if (distance <= 12 && (!nearestTarget || distance < nearestTarget.distance)) {
                nearestTarget = {
                    name,
                    distance,
                    placement: contentY < layout.y ? 'before' : 'after',
                };
            }
        }
        // Keep the empty breathing room below the final card useful: dragging all the way down
        // still means “place last”, rather than silently cancelling the move.
        if (lastValidRow && contentY > lastValidRow.bottom) {
            return encodeDeckDropTarget(lastValidRow.name, 'after');
        }
        if (firstValidRow && contentY < firstValidRow.y) {
            return encodeDeckDropTarget(firstValidRow.name, 'before');
        }
        return nearestTarget
            ? encodeDeckDropTarget(nearestTarget.name, nearestTarget.placement)
            : null;
    };

    const updateDropTarget = (target: string | null) => {
        if (target === dropTargetRef.current) return;
        clearHoverExpandTimer();
        dropTargetRef.current = target;
        setDropTarget(target);

        if (target && Platform.OS !== 'web') {
            void Haptics.selectionAsync().catch(() => undefined);
        }

        const decoded = decodeDeckDropTarget(target);
        if (!decoded || decoded.kind !== 'deck' || decoded.placement !== 'inside') return;
        const targetRow = visibleRowsRef.current.find((row) => row.deck.name === decoded.name);
        if (!targetRow?.children.length || expandedDecks.has(decoded.name)) return;

        // Hovering over a collapsed parent opens it, so deeply nested destinations remain
        // reachable without cancelling the current drag.
        hoverExpandTimerRef.current = setTimeout(() => {
            hoverExpandTimerRef.current = null;
            if (!draggingRef.current || dropTargetRef.current !== target) return;
            animateDeckTreeLayout();
            setExpandedDecks((prev) => {
                if (prev.has(decoded.name)) return prev;
                setDeckCollapsed(targetRow.deck.id, false);
                return new Set(prev).add(decoded.name);
            });
        }, DECK_HOVER_EXPAND_DELAY_MS);
    };

    const getDragAutoScrollDelta = (pageY: number): number => {
        const viewportHeight = listHeightRef.current;
        if (!viewportHeight) return 0;

        const listY = pageY - listTopRef.current;
        const edge = 96;
        const maxSpeed = 15;
        if (listY < edge && scrollOffsetRef.current > 0) {
            const strength = Math.min(1, Math.max(0, (edge - listY) / edge));
            return -Math.max(2, Math.round(maxSpeed * strength));
        }

        const maxOffset = Math.max(0, listContentHeightRef.current - viewportHeight);
        if (listY > viewportHeight - edge && scrollOffsetRef.current < maxOffset) {
            const strength = Math.min(1, Math.max(0, (listY - (viewportHeight - edge)) / edge));
            return Math.max(2, Math.round(maxSpeed * strength));
        }
        return 0;
    };

    const runDragAutoScrollFrame = () => {
        dragAutoScrollFrameRef.current = null;
        const dragged = draggingRef.current;
        const pageY = dragPageYRef.current;
        if (!dragged || pageY === null) return;

        const delta = getDragAutoScrollDelta(pageY);
        if (delta === 0) return;

        const maxOffset = Math.max(0, listContentHeightRef.current - listHeightRef.current);
        const nextOffset = Math.max(0, Math.min(maxOffset, scrollOffsetRef.current + delta));
        if (nextOffset === scrollOffsetRef.current) return;

        scrollOffsetRef.current = nextOffset;
        deckScrollRef.current?.scrollTo({ y: nextOffset, animated: false });
        updateDropTarget(findDropTarget(pageY, dragged));
        dragAutoScrollFrameRef.current = requestAnimationFrame(runDragAutoScrollFrame);
    };

    const updateDragPreviewPosition = (pageY: number) => {
        const nextY = Math.min(
            Math.max(4, pageY - listTopRef.current - 29),
            Math.max(4, listHeightRef.current - 66),
        );
        dragPreviewTranslateY.setValue(nextY);
    };

    const updateDeckDrag = (pageY: number) => {
        const dragged = draggingRef.current;
        if (!dragged) return;
        dragPageYRef.current = pageY;
        updateDragPreviewPosition(pageY);

        const listY = pageY - listTopRef.current;
        const overRootTarget = isOverRootDropZone(listY, dragged);
        if (overRootTarget || getDragAutoScrollDelta(pageY) === 0) {
            cancelDragAutoScroll();
        } else if (dragAutoScrollFrameRef.current === null) {
            dragAutoScrollFrameRef.current = requestAnimationFrame(runDragAutoScrollFrame);
        }
        updateDropTarget(findDropTarget(pageY, dragged));
    };

    const beginDeckDrag = (node: DeckTreeNode, pageY: number) => {
        if (node.deck.isFiltered) return;
        draggingRef.current = node.deck.name;
        dragPageYRef.current = pageY;
        dropTargetRef.current = null;
        setDraggingDeck(node.deck.name);
        setDropTarget(null);
        updateDragPreviewPosition(pageY);
        dragPreviewLift.stopAnimation();
        dragPreviewLift.setValue(0);
        Animated.spring(dragPreviewLift, {
            toValue: 1,
            speed: 28,
            bounciness: 4,
            useNativeDriver: Platform.OS !== 'web',
        }).start();
        setShowAddMenu(false);

        // Refresh screen-space geometry at gesture time. Safe-area changes, rotation and the
        // Simulator title bar can all make the value captured by the initial onLayout stale.
        listWrapRef.current?.measureInWindow((_x, y, _width, height) => {
            listTopRef.current = y;
            if (height > 0) listHeightRef.current = height;
            const measurableRows = visibleRowsRef.current
                .map((row) => ({ name: row.deck.name, view: deckRowRefs.current.get(row.deck.name) }))
                .filter((entry): entry is { name: string; view: View } => Boolean(entry.view));
            if (!measurableRows.length) {
                updateDeckDrag(pageY);
                return;
            }

            let remaining = measurableRows.length;
            for (const entry of measurableRows) {
                entry.view.measureInWindow((_rowX, rowY, _rowWidth, rowHeight) => {
                    if (rowHeight > 0) {
                        rowLayouts.current.set(entry.name, {
                            y: rowY - y + scrollOffsetRef.current,
                            h: rowHeight,
                        });
                    }
                    remaining -= 1;
                    if (remaining === 0) updateDeckDrag(pageY);
                });
            }
        });
        if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        }
    };

    const completeDeckDrag = () => {
        const dragged = draggingRef.current;
        const target = dropTargetRef.current;
        resetDeckDrag();

        if (!dragged || !target) return;
        const deck = getAllDecks().find((entry) => entry.name === dragged);
        if (!deck) return;

        const decoded = decodeDeckDropTarget(target);
        if (!decoded) return;
        if (decoded.kind === 'deck' && decoded.placement !== 'inside') {
            const targetDeck = getDeckByName(decoded.name);
            if (!targetDeck) return;
            try {
                const nextName = reorderDeckRelative(deck.id, targetDeck.id, decoded.placement);
                animateDeckTreeLayout();
                setExpandedDecks((prev) => remapExpandedDeckPaths(
                    prev,
                    dragged,
                    nextName,
                    getParentDeckName(nextName),
                ));
                refresh();
                if (Platform.OS !== 'web') {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                }
            } catch (e) {
                console.warn('[Decks] drag reorder failed:', e);
                if (Platform.OS !== 'web') {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
                }
                alert(t('common.error'), userFacingErrorMessage(
                    e,
                    l('Deste sıralanamadı. Lütfen tekrar deneyin.', 'Could not reorder the deck. Please try again.'),
                ));
            }
            return;
        }

        const targetParent = decoded.kind === 'root' ? null : decoded.name;
        const proposedName = targetParent
            ? `${targetParent}::${getDeckDisplayName(dragged)}`
            : getDeckDisplayName(dragged);
        if (proposedName === dragged) return;

        try {
            const nextName = moveDeckUnder(deck.id, targetParent) ?? dragged;
            if (targetParent) {
                const parent = getDeckByName(targetParent);
                if (parent) setDeckCollapsed(parent.id, false);
            }
            animateDeckTreeLayout();
            setExpandedDecks((prev) => remapExpandedDeckPaths(
                prev,
                dragged,
                nextName,
                targetParent,
            ));
            refresh();
            if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            }
        } catch (e) {
            console.warn('[Decks] drag move failed:', e);
            if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
            }
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('Deste taşınamadı. Lütfen tekrar deneyin.', 'Could not move the deck. Please try again.'),
            ));
        }
    };

    dragHandlersRef.current = {
        begin: beginDeckDrag,
        move: updateDeckDrag,
        complete: completeDeckDrag,
        cancel: resetDeckDrag,
    };

    const getDragResponder = (node: DeckTreeNode) => {
        const cached = dragRespondersRef.current.get(node.deck.id);
        if (cached) return cached;

        const deckId = node.deck.id;
        let activated = false;
        const finishGesture = () => {
            if (!activated) return;
            activated = false;
            dragHandlersRef.current?.complete();
        };
        const responder = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: (event, gesture) => {
                const currentNode = visibleRowsRef.current.find((row) => row.deck.id === deckId);
                if (!currentNode) return;
                activated = true;
                const startPageY = gesture.y0 || event.nativeEvent.pageY;
                dragHandlersRef.current?.begin(currentNode, startPageY);
            },
            onPanResponderMove: (event, gesture) => {
                if (!activated) return;
                dragHandlersRef.current?.move(gesture.moveY || event.nativeEvent.pageY);
            },
            onPanResponderRelease: finishGesture,
            onPanResponderTerminate: () => {
                activated = false;
                dragHandlersRef.current?.cancel();
            },
            onPanResponderTerminationRequest: () => !activated,
        });
        dragRespondersRef.current.set(deckId, responder);
        return responder;
    };

    // ---- Rendering ----

    const renderDeckRow = (node: DeckTreeNode) => {
        const deck = node.deck;
        const isExpanded = expandedDecks.has(deck.name);
        const hasChildren = node.children.length > 0;
        const displayName = getDeckDisplayName(deck.name);
        const isDragging = draggingDeck === deck.name;
        const rowDropTarget = decodedDropTarget?.kind === 'deck' && decodedDropTarget.name === deck.name
            ? decodedDropTarget
            : null;
        const isInsideDropTarget = rowDropTarget?.placement === 'inside';
        const isDropBefore = rowDropTarget?.placement === 'before';
        const isDropAfter = rowDropTarget?.placement === 'after';
        const rowDropFeedback = rowDropTarget ? dragDropFeedback : null;
        const isTrialCatalogDeck = catalogTier === 'trial' && deck.catalogPack === BKA_CATALOG_PACK;
        const isTrialCatalogRoot = isTrialCatalogDeck && deck.id === BKA_CATALOG_ROOT_DECK_ID;
        const dragResponder = supportsDeckDrag && !deck.isFiltered
            ? getDragResponder(node)
            : null;
        const maxIndentDepth = isCompact ? 4 : 10;
        const visualDepth = Math.min(node.depth, maxIndentDepth);
        const isChild = node.depth > 0;
        // Compact layouts get their indentation from actual nested containers below. Desktop keeps
        // Anki's table-like deck tree, but uses a restrained step so names and counts retain room.
        const contentIndent = 8 + visualDepth * 24;

        return (
            <View
                key={deck.id}
                ref={(view) => {
                    if (view) deckRowRefs.current.set(deck.name, view);
                    else deckRowRefs.current.delete(deck.name);
                }}
                onLayout={(e) => {
                    const layoutHeight = e.nativeEvent.layout.height;
                    // Compact rows are recursively nested, so onLayout.y is relative to the
                    // immediate parent rather than the ScrollView content. Keep drag hit-testing
                    // in one coordinate space by measuring the row against the list viewport.
                    const rowView = deckRowRefs.current.get(deck.name);
                    if (!rowView) return;
                    rowView.measureInWindow((_x, rowY, _width, rowHeight) => {
                        rowLayouts.current.set(deck.name, {
                            y: rowY - listTopRef.current + scrollOffsetRef.current,
                            h: rowHeight || layoutHeight,
                        });
                    });
                }}
                style={[
                    styles.deckRow,
                    isCompact && styles.deckRowCompact,
                    isCompact && isChild && styles.deckRowCompactChild,
                    !isCompact && { paddingLeft: contentIndent },
                    isDragging && styles.deckRowDragging,
                    isInsideDropTarget && styles.deckRowDropTarget,
                ]}
            >
                {rowDropFeedback && (isDropBefore || isDropAfter) && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.deckDropLabel,
                            isDropBefore ? styles.deckDropLabelBefore : styles.deckDropLabelAfter,
                        ]}
                    >
                        <Text style={styles.deckDropLabelText} numberOfLines={1}>
                            {rowDropFeedback.title}
                        </Text>
                    </View>
                )}
                {rowDropFeedback && isInsideDropTarget && (
                    <View pointerEvents="none" style={styles.deckInsideDropBadge}>
                        <Text style={styles.deckInsideDropBadgeText} numberOfLines={1}>
                            {rowDropFeedback.title}
                        </Text>
                    </View>
                )}
                {hasChildren ? (
                    <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => toggleExpand(deck)}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? l('Alt desteleri gizle', 'Hide subdecks') : l('Alt desteleri göster', 'Show subdecks')}
                        accessibilityState={{ expanded: isExpanded }}
                    >
                        <DisclosureChevron
                            expanded={isExpanded}
                            color={colors.textPrimary}
                        />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.expandBtn}>
                        <Text style={styles.expandDot}>{deck.isFiltered ? '⧉' : '•'}</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.deckNameTouchable}
                    onPress={() => handleOpenOverview(deck.name)}
                    accessibilityRole="button"
                    accessibilityLabel={l(`${displayName} destesini aç`, `Open ${displayName} deck`)}
                    {...webTitle(l(`${displayName}: genel bakış`, `${displayName}: overview`))}
                >
                    <View style={styles.deckNameRow}>
                        <Text
                            style={[
                                styles.deckName,
                                deck.isFiltered && styles.deckNameFiltered,
                            ]}
                            numberOfLines={isCompact ? 2 : 1}
                        >
                            {displayName}
                        </Text>
                    </View>
                    {isCompact && (
                        <>
                            <Text
                                style={styles.deckMeta}
                                numberOfLines={isTrialCatalogRoot ? 2 : 1}
                            >
                                {l(`${formatCount(node.totalCards, 'tr')} kart`, `${formatCount(node.totalCards, 'en')} cards`)}{hasChildren ? l(` · ${node.children.length} alt deste`, ` · ${node.children.length} subdecks`) : ''}
                                {isTrialCatalogRoot ? l(' · her alt başlıktan en iyi 30 ücretsiz soru', ' · best 30 free questions from every subtopic') : ''}
                                {deck.isFiltered ? (deck.filteredDeckEmpty ? l(' · boşaltıldı', ' · emptied') : l(' · filtreli', ' · filtered')) : ''}
                                {node.depth > maxIndentDepth ? l(` · ${node.depth + 1}. seviye`, ` · level ${node.depth + 1}`) : ''}
                            </Text>
                            <View style={styles.mobileCountsRow}>
                                <View style={[styles.mobileCountPill, { backgroundColor: colors.badgeNewBg }]}>
                                    <Text style={[styles.mobileCountText, { color: colors.badgeNew }]}>{t('anki.new')} {node.newCount}</Text>
                                </View>
                                <View style={[styles.mobileCountPill, { backgroundColor: colors.badgeLearnBg }]}>
                                    <Text style={[styles.mobileCountText, { color: colors.badgeLearn }]}>{t('anki.learn')} {node.learnCount}</Text>
                                </View>
                                <View style={[styles.mobileCountPill, { backgroundColor: colors.badgeReviewBg }]}>
                                    <Text style={[styles.mobileCountText, { color: colors.badgeReview }]}>{t('anki.review')} {node.reviewCount}</Text>
                                </View>
                            </View>
                        </>
                    )}
                </TouchableOpacity>

                {!isCompact && (
                    <View style={styles.countsRow}>
                        <Text style={[styles.countBadge, styles.countNew]}>{node.newCount}</Text>
                        <Text style={[styles.countBadge, styles.countLearn]}>{node.learnCount}</Text>
                        <Text style={[styles.countBadge, styles.countReview]}>{node.reviewCount}</Text>
                    </View>
                )}

                {supportsDeckDrag && dragResponder && (
                    <View
                        style={[styles.dragHandle, isDragging && styles.dragHandleActive]}
                        {...dragResponder.panHandlers}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={l(`${displayName} destesini taşı`, `Move ${displayName} deck`)}
                        accessibilityHint={l('Satırın üstüne veya altına bırakarak sıralayın; ortasına bırakarak alt deste yapın', 'Drop at a row edge to reorder, or at its center to make a subdeck')}
                        {...webTitle(l('Kenarlara bırakın: sırala · Ortaya bırakın: alt deste yap', 'Drop at edges: reorder · Drop at center: make a subdeck'))}
                    >
                        <Text style={styles.dragHandleText}>⠿</Text>
                    </View>
                )}
                {supportsDeckDrag && !dragResponder && (
                    <View
                        style={[styles.dragHandle, styles.dragHandleDisabled]}
                        accessible
                        accessibilityLabel={l('Filtrelenmiş desteler alt deste olarak taşınamaz', 'Filtered decks cannot be moved into the deck tree')}
                    >
                        <Text style={styles.dragHandleText}>⠿</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.gearBtn}
                    onPress={() => openMenu(deck)}
                    accessibilityRole="button"
                    accessibilityLabel={l(`${displayName} deste seçenekleri`, `${displayName} deck options`)}
                >
                    <Text style={styles.gearText}>•••</Text>
                </TouchableOpacity>
            </View>
        );
    };

    // On phones, render the data tree as a real view tree. Children share their parent's card
    // surface; indentation and a single guide line convey depth without nested boxes.
    const renderCompactDeckBranch = (
        node: DeckTreeNode,
        isRoot: boolean,
        isLastSibling: boolean,
    ): React.ReactNode => {
        const showChildren = node.children.length > 0 && expandedDecks.has(node.deck.name);
        const deepNesting = node.depth >= 4;
        const branchDropTarget = decodedDropTarget?.kind === 'deck' && decodedDropTarget.name === node.deck.name
            ? decodedDropTarget.placement
            : null;

        return (
            <View
                key={node.deck.id}
                style={[
                    isRoot ? styles.deckGroupCard : styles.deckNestedBranch,
                    !isRoot && isLastSibling && styles.deckNestedBranchLast,
                ]}
            >
                {renderDeckRow(node)}
                {showChildren && (
                    <View
                        style={[
                            styles.deckChildrenWell,
                            node.depth > 0 && styles.deckChildrenWellNested,
                            deepNesting && styles.deckChildrenWellDeep,
                        ]}
                    >
                        {node.children.map((child, childIndex) => renderCompactDeckBranch(
                            child,
                            false,
                            childIndex === node.children.length - 1,
                        ))}
                    </View>
                )}
            </View>
        );
    };

    /**
     * The optional catalog appears in the deck list exactly where a deck would, with its real
     * size and a clear free-unlock action instead of an ad banner above the tree.
     */
    const renderLockedCatalogCard = () => (
        <TouchableOpacity
            style={styles.lockedDeckCard}
            onPress={() => router.push('/catalog' as any)}
            accessibilityRole="button"
            accessibilityLabel={l(
                `${BKA_CATALOG_DEFAULT_ROOT_DECK} kart paketi, ${BKA_MANIFEST.totals.cards} kart, ücretsiz açmak için dokun`,
                `${BKA_CATALOG_DEFAULT_ROOT_DECK} card pack, ${BKA_MANIFEST.totals.cards} cards, tap to unlock for free`,
            )}
        >
            <View style={styles.lockedDeckIcon}>
                {catalogInstalling
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <LockGlyph color={colors.accent} size={18} />}
            </View>
            <View style={styles.lockedDeckCopy}>
                <Text style={styles.lockedDeckName} numberOfLines={1}>{BKA_CATALOG_DEFAULT_ROOT_DECK}</Text>
                <Text style={styles.lockedDeckMeta} numberOfLines={2}>
                    {catalogInstalling
                        ? l('Kartlar kuruluyor…', 'Installing cards…')
                        : l(
                            `${formatCount(BKA_MANIFEST.totals.cards, 'tr')} kart · ${BKA_MANIFEST.totals.courses} ders · ${BKA_MANIFEST.totals.topics} alt deste`,
                            `${formatCount(BKA_MANIFEST.totals.cards, 'en')} cards · ${BKA_MANIFEST.totals.courses} courses · ${BKA_MANIFEST.totals.topics} subdecks`,
                        )}
                </Text>
            </View>
            {!catalogInstalling && (
                <View style={styles.lockedDeckPricePill}>
                    <Text style={styles.lockedDeckPriceText}>{l('Ücretsiz aç', 'Unlock free')}</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    const renderMenuModal = (deck: Deck) => {
        const MenuAction = ({ label, onPress, danger = false }: {
            label: string;
            onPress: () => void;
            danger?: boolean;
        }) => (
            <TouchableOpacity
                style={styles.deckMenuItem}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <Text style={[styles.deckMenuItemText, danger && styles.menuItemDanger]}>{label}</Text>
            </TouchableOpacity>
        );

        return (
            <View style={styles.deckMenuCard} accessibilityViewIsModal>
                <Text style={styles.deckMenuTitle}>{deck.name.replaceAll('::', ' › ')}</Text>
                <ScrollView
                    style={styles.deckMenuScroll}
                    contentContainerStyle={styles.deckMenuContent}
                    showsVerticalScrollIndicator={false}
                >
                    {!deck.isFiltered && (
                        <MenuAction
                            label={l('Ekle', 'Add')}
                            onPress={() => openDeckMenuRoute(`/editor?deckId=${deck.id}`)}
                        />
                    )}
                    <MenuAction
                        label={l('Kartlara göz at', 'Browse cards')}
                        onPress={() => openDeckMenuRoute(`/browser?deck=${encodeURIComponent(deck.name)}`)}
                    />
                    <MenuAction label={l('Desteyi yeniden adlandır', 'Rename deck')} onPress={() => openRename(deck)} />

                    {!deck.isFiltered ? (
                        <>
                            <MenuAction label={l('Alt deste oluştur', 'Create subdeck')} onPress={() => openCreateSubdeck(deck)} />
                            <MenuAction
                                label={l('Deste seçenekleri', 'Deck options')}
                                onPress={() => openDeckMenuRoute(`/deck-options?deckId=${deck.id}`)}
                            />
                            <MenuAction label={l('Özel çalışma', 'Custom study')} onPress={() => openCustomStudy(deck)} />
                            <MenuAction
                                label={l('Desteyi dışa aktar', 'Export deck')}
                                onPress={() => openDeckMenuRoute(`/export?deck=${encodeURIComponent(deck.name)}`)}
                            />
                        </>
                    ) : (
                        <>
                            <MenuAction label={l('Filtre seçenekleri', 'Filtered deck options')} onPress={() => openFilterOptions(deck)} />
                            <MenuAction label={l('Yeniden oluştur', 'Rebuild')} onPress={() => handleRebuildFilter(deck)} />
                            <MenuAction label={l('Desteyi boşalt', 'Empty deck')} onPress={() => requestEmptyFilteredDeck(deck)} />
                        </>
                    )}

                    <MenuAction
                        label={l('Kısayol oluştur', 'Create shortcut')}
                        onPress={() => { void handleCreateShortcut(deck); }}
                    />
                    <MenuAction label={l('Açıklamayı düzenle', 'Edit description')} onPress={() => openDescription(deck)} />
                    <MenuAction label={l('Desteyi sil', 'Delete deck')} onPress={() => requestDelete(deck)} />
                </ScrollView>
            </View>
        );
    };

    const renderRenameModal = (deck: Deck) => (
        <View
            style={[styles.modalCard, styles.createDeckDialog]}
            accessibilityViewIsModal
            accessibilityLabel={l(
                `${getDeckDisplayName(deck.name)} destesini yeniden adlandır`,
                `Rename deck ${getDeckDisplayName(deck.name)}`,
            )}
        >
            <Text style={styles.createDeckDialogTitle}>{l('Desteyi yeniden adlandır', 'Rename deck')}</Text>
            <View style={styles.createDeckField}>
                <Text style={styles.createDeckFieldLabel}>{l('Yeni ad', 'New name')}</Text>
                <TextInput
                    style={styles.createDeckInput}
                    value={renameText}
                    onChangeText={setRenameText}
                    onSubmitEditing={handleRename}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    accessibilityLabel={l('Yeni deste adı', 'New deck name')}
                />
            </View>
            <View style={[styles.modalActions, styles.createDeckActions]}>
                <TouchableOpacity style={styles.createDeckTextButton} onPress={() => setModal(null)}>
                    <Text style={styles.createDeckCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.createDeckTextButton}
                    onPress={handleRename}
                    disabled={!normalizeDeckLeafInput(renameText)}
                >
                    <Text
                        style={[
                            styles.createDeckCreateText,
                            !normalizeDeckLeafInput(renameText) && styles.createDeckCreateTextDisabled,
                        ]}
                    >
                        {l('Yeniden adlandır', 'Rename')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderCreateSubdeckModal = (deck: Deck) => (
        <View
            style={[styles.modalCard, styles.createDeckDialog]}
            accessibilityViewIsModal
            accessibilityLabel={l(
                `${getDeckDisplayName(deck.name)} için alt deste oluştur`,
                `Create a subdeck for ${getDeckDisplayName(deck.name)}`,
            )}
        >
            <Text style={styles.createDeckDialogTitle}>{l('Alt deste oluştur', 'Create subdeck')}</Text>
            <View style={styles.createDeckField}>
                <Text style={styles.createDeckFieldLabel}>{l('Ad', 'Name')}</Text>
                <TextInput
                    style={styles.createDeckInput}
                    value={newSubdeckName}
                    onChangeText={setNewSubdeckName}
                    onSubmitEditing={handleCreateSubdeck}
                    autoFocus
                    returnKeyType="done"
                    accessibilityLabel={l('Alt deste adı', 'Subdeck name')}
                />
            </View>
            <View style={[styles.modalActions, styles.createDeckActions]}>
                <TouchableOpacity style={styles.createDeckTextButton} onPress={() => setModal(null)}>
                    <Text style={styles.createDeckCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.createDeckTextButton}
                    onPress={handleCreateSubdeck}
                    disabled={!normalizeDeckLeafInput(newSubdeckName)}
                >
                    <Text
                        style={[
                            styles.createDeckCreateText,
                            !normalizeDeckLeafInput(newSubdeckName) && styles.createDeckCreateTextDisabled,
                        ]}
                    >
                        {l('Oluştur', 'Create')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderDescriptionModal = (deck: Deck) => (
        <SwipeDismissSheet
            style={[styles.modalCard, isCompact && styles.modalCardCompact]}
            enabled={isCompact}
            onDismiss={() => setModal(null)}
        >
            <Text style={styles.modalEyebrow}>{l('DESTE AÇIKLAMASI', 'DECK DESCRIPTION')}</Text>
            <Text style={styles.modalTitle} numberOfLines={2}>{deck.name.replaceAll('::', ' › ')}</Text>
            <TextInput
                style={[styles.modalInput, styles.descriptionInput]}
                value={descriptionText}
                onChangeText={setDescriptionText}
                placeholder={l('Deste genel bakışında gösterilecek açıklama…', 'Description shown on the deck overview…')}
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus
                textAlignVertical="top"
            />
            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveDescription}>
                    <Text style={styles.modalBtnPrimaryText}>{t('common.save')}</Text>
                </TouchableOpacity>
            </View>
        </SwipeDismissSheet>
    );

    const renderCustomModal = (deck: Deck) => (
        <SwipeDismissSheet
            style={[styles.modalCard, isCompact && styles.modalCardCompact, styles.modalCardScrollable]}
            enabled={isCompact}
            onDismiss={() => setModal(null)}
        >
            <ScrollView
                style={styles.modalSheetScroll}
                contentContainerStyle={[
                    styles.modalCardScrollContent,
                    isCompact && styles.modalCardScrollContentCompact,
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.modalTitle}>{t('anki.customStudy')} — {getDeckDisplayName(deck.name)}</Text>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Bugünkü yeni kart limitini artır', 'Increase today’s new card limit')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={boostNew}
                        onChangeText={(value) => setBoostNew(sanitizeUnsignedIntegerDraft(value, 4))}
                        maxLength={4}
                        keyboardType="number-pad"
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleBoost(parseCount(boostNew, 0), 0)}
                    >
                        <Text style={styles.modalBtnPrimaryText}>{l('Uygula', 'Apply')}</Text>
                    </TouchableOpacity>
                </View>
                </View>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Bugünkü tekrar limitini artır', 'Increase today’s review limit')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={boostReview}
                        onChangeText={(value) => setBoostReview(sanitizeUnsignedIntegerDraft(value, 4))}
                        maxLength={4}
                        keyboardType="number-pad"
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleBoost(0, parseCount(boostReview, 0))}
                    >
                        <Text style={styles.modalBtnPrimaryText}>{l('Uygula', 'Apply')}</Text>
                    </TouchableOpacity>
                </View>
                </View>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Çalışma oturumu oluştur (filtrelenmiş deste)', 'Create a study session (Filtered Deck)')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={customLimit}
                        onChangeText={(value) => setCustomLimit(sanitizeUnsignedIntegerDraft(value, 4))}
                        maxLength={4}
                        keyboardType="number-pad"
                        placeholder={l('Kart sayısı', 'Card count')}
                        placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={customTag}
                        onChangeText={setCustomTag}
                        placeholder={l('Etiket (isteğe bağlı)', 'Tag (optional)')}
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateCustomSession}>
                    <Text style={styles.modalBtnPrimaryText}>🎯 {l('Oturum oluştur', 'Create Session')}</Text>
                </TouchableOpacity>
                </View>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Unutulanları çalış (son N günde “Tekrar” verilenler)', 'Review forgotten cards (answered Again in the last N days)')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={forgottenDays}
                        onChangeText={(value) => setForgottenDays(sanitizeUnsignedIntegerDraft(value, 4))}
                        maxLength={4}
                        keyboardType="number-pad"
                        placeholder={l('Gün', 'Days')}
                        placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleCreateSpecialSession(
                            `deck:"${deck.name}" rated:${parseCount(forgottenDays, 7) || 7}:1`,
                            { reschedule: true, searchOrder: 6 },
                        )}
                    >
                        <Text style={styles.modalBtnPrimaryText}>{t('common.create')}</Text>
                    </TouchableOpacity>
                </View>
                </View>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('İleriye çalış (N gün içinde zamanı gelecekler)', 'Study ahead (cards due within N days)')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={aheadDays}
                        onChangeText={(value) => setAheadDays(sanitizeUnsignedIntegerDraft(value, 4))}
                        maxLength={4}
                        keyboardType="number-pad"
                        placeholder={l('Gün', 'Days')}
                        placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleCreateSpecialSession(
                            `deck:"${deck.name}" prop:due<=${parseCount(aheadDays, 3) || 3}`,
                            { reschedule: true, searchOrder: 0 },
                        )}
                    >
                        <Text style={styles.modalBtnPrimaryText}>{t('common.create')}</Text>
                    </TouchableOpacity>
                </View>
                </View>

                <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Yeni kartları önizle (zamanlamayı değiştirmez)', 'Preview new cards (does not affect scheduling)')}</Text>
                <TouchableOpacity
                    style={styles.modalBtnPrimary}
                    onPress={() => handleCreateSpecialSession(
                        `deck:"${deck.name}" is:new`,
                        { reschedule: false, searchOrder: 4 },
                    )}
                >
                    <Text style={styles.modalBtnPrimaryText}>👁️ {l('Önizleme oturumu', 'Preview Session')}</Text>
                </TouchableOpacity>
                </View>

                <Text style={styles.modalHint}>
                    {l(
                        'Seçtiğiniz işlem mevcut “Özel Çalışma” oturumunu yeniden oluşturur. Bu oturumu korumak istiyorsanız yeni bir işlem başlatmadan önce adını değiştirin.',
                        'The selected action rebuilds the existing Custom Study session. To keep that session, rename it before starting another action.',
                    )}
                </Text>

                <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                    <Text style={styles.modalCancelText}>{t('common.close')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SwipeDismissSheet>
    );

    const renderFilterModal = (deck?: Deck) => {
        const isCreating = !deck;
        const buildDisabled = !newFilteredDeckName.trim()
            || !/^\d{1,5}$/.test(filterLimit)
            || (filterSecondEnabled && !/^\d{1,5}$/.test(filterLimit2));
        const closeFilteredDeckModal = () => {
            Keyboard.dismiss();
            setFilterHelpVisible(false);
            setFilterOrderPicker(null);
            setModal(null);
        };
        const openFilterHelp = () => {
            Keyboard.dismiss();
            setFilterOrderPicker(null);
            setFilterHelpVisible(true);
        };
        const openFilterOrderPicker = (filter: 1 | 2) => {
            Keyboard.dismiss();
            setFilterHelpVisible(false);
            const target = filter === 1 ? firstFilterOrderRef.current : secondFilterOrderRef.current;
            target?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
                setFilterOrderAnchor({ x, y: y + measuredHeight, width: measuredWidth });
            });
            setFilterOrderPicker(filter);
        };
        const showSearchInfo = (search: string) => {
            Keyboard.dismiss();
            const matchCount = getFilteredDeckMatchCount(settings, {
                searchQuery: search.trim(),
                searchLimit: 9999,
                searchOrder: 0,
            });
            alert(
                l('Arama filtresi', 'Search filter'),
                l(
                    `Bu sorguyla ${matchCount} uygun kart bulundu.\n\n${search || '—'}\n\n`
                    + 'Kullanılabilir terimler\n'
                    + 'deck:"Deste"  ·  tag:etiket  ·  tag:none\n'
                    + 'is:due  is:new  is:learn  is:review  is:relearn  is:suspended  is:buried\n'
                    + 'flag:0–7  ·  rated:7  ·  rated:7:1\n'
                    + 'prop:ivl>=21 (aralık)  ·  prop:reps<10 (tekrar)\n'
                    + 'prop:lapses>=5 (unutma)  ·  prop:ease<2.0 (kolaylık)\n'
                    + 'prop:pos<=50 (yeni kart sırası)  ·  prop:due<=3 (gün)\n\n'
                    + 'Terimleri boşlukla ayırarak birleştirebilirsiniz.\n'
                    + 'Dışlamak için terimin başına - koy: -is:suspended\n'
                    + 'Alternatifler için or, gruplamak için parantez: (tag:a or tag:b)',
                    `${matchCount} eligible cards matched this query.\n\n${search || '—'}\n\n`
                    + 'Available terms\n'
                    + 'deck:"Deck"  ·  tag:tag  ·  tag:none\n'
                    + 'is:due  is:new  is:learn  is:review  is:relearn  is:suspended  is:buried\n'
                    + 'flag:0–7  ·  rated:7  ·  rated:7:1\n'
                    + 'prop:ivl>=21 (interval)  ·  prop:reps<10 (reps)\n'
                    + 'prop:lapses>=5 (lapses)  ·  prop:ease<2.0 (ease)\n'
                    + 'prop:pos<=50 (new card position)  ·  prop:due<=3 (days)\n\n'
                    + 'Separate terms with a space to combine them.\n'
                    + 'Prefix a term with - to exclude it: -is:suspended\n'
                    + 'Use or for alternatives and parentheses to group: (tag:a or tag:b)',
                ),
            );
        };
        const selectedOrder = filterOrderPicker === 2 ? filterOrder2 : filterOrder;
        const selectOrder = (order: number) => {
            if (filterOrderPicker === 2) setFilterOrder2(order);
            else setFilterOrder(order);
            setFilterOrderPicker(null);
        };
        const showExcludedInfo = () => {
            Keyboard.dismiss();
            const excludedCount = getFilteredDeckExcludedCount([
                filterSearch,
                ...(filterSecondEnabled ? [filterSearch2] : []),
            ]);
            alert(
                l(`${excludedCount} kart dahil edilemiyor`, `${excludedCount} cards are excluded`),
                l(
                    'Bu kartlar aramayla eşleşiyor ancak askıya alınmış veya gömülmüş oldukları için filtrelenmiş desteye alınamıyor.',
                    'These cards match the search, but cannot enter the filtered deck because they are suspended or buried.',
                ),
            );
        };

        return (
            <View style={styles.filteredDeckScreen} accessibilityViewIsModal>
                <View style={[styles.filteredDeckToolbar, { paddingTop: insets.top }]}>
                    <TouchableOpacity
                        style={styles.filteredToolbarIconButton}
                        onPress={closeFilteredDeckModal}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.close')}
                    >
                        <Text style={styles.filteredCloseIcon}>×</Text>
                    </TouchableOpacity>
                    <Text style={styles.filteredToolbarTitle} numberOfLines={1}>
                        {filteredDeckScreenTitle}
                    </Text>
                    <TouchableOpacity
                        style={[styles.filteredBuildButton, buildDisabled && styles.filteredBuildButtonDisabled]}
                        onPress={isCreating ? handleCreateFilteredDeck : handleSaveFilterOptions}
                        disabled={buildDisabled}
                        accessibilityRole="button"
                    >
                        <Text style={styles.filteredBuildButtonText}>
                            {isCreating ? l('Oluştur', 'Build') : l('Yeniden oluştur', 'Rebuild')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.filteredToolbarIconButton}
                        onPress={openFilterHelp}
                        accessibilityRole="button"
                        accessibilityLabel={l('Filtrelenmiş deste yardımı', 'Filtered deck help')}
                    >
                        <View style={styles.filteredHelpCircle}>
                            <Text style={styles.filteredHelpIcon}>?</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.filteredDeckScroll}
                    contentContainerStyle={styles.filteredDeckContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.filteredOutlinedField}>
                        <Text style={styles.filteredOutlinedLabel}>{l('Deste adı', 'Name')}</Text>
                        <TextInput
                            style={styles.filteredTextInput}
                            value={newFilteredDeckName}
                            onChangeText={setNewFilteredDeckName}
                            autoFocus={isCreating}
                            returnKeyType="next"
                            accessibilityLabel={l('Deste adı', 'Deck name')}
                        />
                    </View>

                    <Text style={styles.filteredSectionTitle}>{l('Filtre', 'Filter')}</Text>
                    <View style={styles.filteredOutlinedField}>
                        <Text style={styles.filteredOutlinedLabel}>{t('common.search')}</Text>
                        <TextInput
                            style={[styles.filteredTextInput, styles.filteredSearchInput]}
                            value={filterSearch}
                            onChangeText={setFilterSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                            accessibilityLabel={l('Birinci filtre araması', 'First filter search')}
                        />
                        <TouchableOpacity
                            style={styles.filteredSearchButton}
                            onPress={() => showSearchInfo(filterSearch)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Arama sorgusunu kontrol et', 'Check search query')}
                        >
                            <Text style={styles.filteredSearchIcon}>⌕</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.filteredOutlinedField}>
                        <Text style={styles.filteredOutlinedLabel}>{l('En fazla', 'Limit to')}</Text>
                        <TextInput
                            style={styles.filteredTextInput}
                            value={filterLimit}
                            onChangeText={setFilterLimit}
                            keyboardType="number-pad"
                            maxLength={5}
                            accessibilityLabel={l('Birinci filtre kart limiti', 'First filter card limit')}
                        />
                    </View>
                    <Text style={styles.filteredPickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                    <TouchableOpacity
                        ref={firstFilterOrderRef}
                        style={styles.filteredPickerRow}
                        onPress={() => openFilterOrderPicker(1)}
                        accessibilityRole="button"
                        accessibilityLabel={filteredOrderLabel(locale, filterOrder)}
                    >
                        <Text style={styles.filteredPickerValue}>{filteredOrderLabel(locale, filterOrder)}</Text>
                        <Text style={styles.filteredPickerChevron}>⌄</Text>
                    </TouchableOpacity>

                    <View style={styles.filteredSwitchRow}>
                        <Text style={styles.filteredSwitchLabel}>{l('İkinci filtreyi etkinleştir', 'Enable second filter')}</Text>
                        <Switch
                            value={filterSecondEnabled}
                            onValueChange={setFilterSecondEnabled}
                            trackColor={{ false: colors.border, true: colors.accent }}
                            thumbColor={colors.white}
                        />
                    </View>

                    {filterSecondEnabled && (
                        <View style={styles.filteredSecondFilter}>
                            <View style={styles.filteredOutlinedField}>
                                <Text style={styles.filteredOutlinedLabel}>{t('common.search')}</Text>
                                <TextInput
                                    style={[styles.filteredTextInput, styles.filteredSearchInput]}
                                    value={filterSearch2}
                                    onChangeText={setFilterSearch2}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    accessibilityLabel={l('İkinci filtre araması', 'Second filter search')}
                                />
                                <TouchableOpacity
                                    style={styles.filteredSearchButton}
                                    onPress={() => showSearchInfo(filterSearch2)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('İkinci arama sorgusunu kontrol et', 'Check second search query')}
                                >
                                    <Text style={styles.filteredSearchIcon}>⌕</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.filteredOutlinedField}>
                                <Text style={styles.filteredOutlinedLabel}>{l('En fazla', 'Limit to')}</Text>
                                <TextInput
                                    style={styles.filteredTextInput}
                                    value={filterLimit2}
                                    onChangeText={setFilterLimit2}
                                    keyboardType="number-pad"
                                    maxLength={5}
                                    accessibilityLabel={l('İkinci filtre kart limiti', 'Second filter card limit')}
                                />
                            </View>
                            <Text style={styles.filteredPickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                            <TouchableOpacity
                                ref={secondFilterOrderRef}
                                style={styles.filteredPickerRow}
                                onPress={() => openFilterOrderPicker(2)}
                                accessibilityRole="button"
                                accessibilityLabel={filteredOrderLabel(locale, filterOrder2)}
                            >
                                <Text style={styles.filteredPickerValue}>{filteredOrderLabel(locale, filterOrder2)}</Text>
                                <Text style={styles.filteredPickerChevron}>⌄</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.filteredSectionTitle}>{l('Seçenekler', 'Options')}</Text>
                    <View style={styles.filteredSwitchRow}>
                        <Text style={styles.filteredSwitchLabel}>
                            {l('Bu destedeki yanıtlara göre kartları yeniden zamanla', 'Reschedule cards based on my answers in this deck')}
                        </Text>
                        <Switch
                            value={filterReschedule}
                            onValueChange={setFilterReschedule}
                            trackColor={{ false: colors.border, true: colors.accent }}
                            thumbColor={colors.white}
                        />
                    </View>
                    {!filterReschedule && (
                        <Text style={styles.filteredPreviewHint}>
                            {l('Önizleme modu: yanıtlar kartların mevcut zamanlamasını değiştirmez.', 'Preview mode: answers do not change the cards’ existing schedule.')}
                        </Text>
                    )}
                    <View style={styles.filteredSwitchRow}>
                        <Text style={styles.filteredSwitchLabel}>
                            {l('Boş olsa bile bu desteyi oluştur/güncelle', 'Create/update this deck even if empty')}
                        </Text>
                        <Switch
                            value={filterAllowEmpty}
                            onValueChange={setFilterAllowEmpty}
                            trackColor={{ false: colors.border, true: colors.accent }}
                            thumbColor={colors.white}
                        />
                    </View>
                </ScrollView>

                <TouchableOpacity
                    style={[styles.filteredExcludedButton, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}
                    onPress={showExcludedInfo}
                    accessibilityRole="button"
                >
                    <Text style={styles.filteredExcludedText}>
                        {l('Dahil edilemeyen kartları göster', 'Show any excluded cards')}
                    </Text>
                </TouchableOpacity>

                {filterHelpVisible && (
                    <View style={styles.filteredOverlayLayer}>
                        <TouchableOpacity
                            style={styles.filteredOverlayBackdrop}
                            activeOpacity={1}
                            onPress={() => setFilterHelpVisible(false)}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                        />
                        <View style={styles.filteredHelpCard}>
                            <View style={styles.filteredHelpHeader}>
                                <Text style={styles.filteredHelpTitle}>{l('Filtrelenmiş desteler', 'Filtered decks')}</Text>
                                <TouchableOpacity onPress={() => setFilterHelpVisible(false)} style={styles.filteredHelpCloseButton}>
                                    <Text style={styles.filteredHelpCloseText}>×</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                style={styles.filteredHelpScroll}
                                contentContainerStyle={styles.filteredHelpScrollContent}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                            >
                                <Text style={styles.filteredHelpIntro}>
                                    {l(
                                        'Filtrelenmiş deste, normal günlük sınırların dışında belirli kartlarla geçici bir çalışma oturumu oluşturur.',
                                        'A filtered deck creates a temporary study session with specific cards outside the normal daily limits.',
                                    )}
                                </Text>

                                <View style={styles.filteredHelpSection}>
                                    <View style={styles.filteredHelpNumber}><Text style={styles.filteredHelpNumberText}>1</Text></View>
                                    <View style={styles.filteredHelpSectionCopy}>
                                        <Text style={styles.filteredHelpSectionTitle}>{l('Kartları belirleyin', 'Choose the cards')}</Text>
                                        <Text style={styles.filteredHelpBody}>
                                            {l(
                                                'Arama alanı, Kart Tarayıcı ile aynı sorgu dilini kullanır. Deste, etiket ve kart durumunu birlikte yazabilirsiniz.',
                                                'Search uses the same query language as Browse. You can combine deck, tag, and card-state terms.',
                                            )}
                                        </Text>
                                        <View style={styles.filteredHelpCodeBox}>
                                            <Text style={styles.filteredHelpCode}>deck:&quot;TUS Kartları&quot; is:due -is:suspended</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.filteredHelpSection}>
                                    <View style={styles.filteredHelpNumber}><Text style={styles.filteredHelpNumberText}>2</Text></View>
                                    <View style={styles.filteredHelpSectionCopy}>
                                        <Text style={styles.filteredHelpSectionTitle}>{l('Limit ve sırayı ayarlayın', 'Set the limit and order')}</Text>
                                        <Text style={styles.filteredHelpBody}>
                                            {l(
                                                'Limit, desteye alınacak en yüksek kart sayısıdır. Seçim sırası hem hangi kartların limite gireceğini hem de çalışma sırasını belirler.',
                                                'The limit is the maximum number of cards gathered. The selected order controls both which cards fit the limit and their study order.',
                                            )}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.filteredHelpSection}>
                                    <View style={styles.filteredHelpNumber}><Text style={styles.filteredHelpNumberText}>3</Text></View>
                                    <View style={styles.filteredHelpSectionCopy}>
                                        <Text style={styles.filteredHelpSectionTitle}>{l('İsterseniz ikinci filtre ekleyin', 'Optionally add a second filter')}</Text>
                                        <Text style={styles.filteredHelpBody}>
                                            {l(
                                                'İki ayrı arama, limit ve sıralama grubunu tek destede birleştirir; örneğin vadesi gelmiş kartlarla az sayıda yeni kartı birlikte çalışabilirsiniz.',
                                                'Combine two groups with separate searches, limits, and orders; for example, due cards plus a small number of new cards.',
                                            )}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.filteredHelpSection}>
                                    <View style={styles.filteredHelpNumber}><Text style={styles.filteredHelpNumberText}>4</Text></View>
                                    <View style={styles.filteredHelpSectionCopy}>
                                        <Text style={styles.filteredHelpSectionTitle}>{l('Zamanlamayı seçin', 'Choose scheduling behavior')}</Text>
                                        <Text style={styles.filteredHelpBody}>
                                            {l(
                                                'Yeniden zamanlama açıksa verdiğiniz yanıtlar kartın programını günceller. Kapalıysa deste önizleme modunda çalışır ve kartlar önceki zamanlamalarıyla ana destelerine döner.',
                                                'With rescheduling on, your answers update each card’s schedule. With it off, the deck acts as a preview and cards return home with their prior schedule.',
                                            )}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.filteredHelpNotice}>
                                    <Text style={styles.filteredHelpNoticeTitle}>{l('Bilmeniz gerekenler', 'Good to know')}</Text>
                                    <Text style={styles.filteredHelpNoticeText}>
                                        {l(
                                            'Askıdaki, gömülü veya başka bir filtrelenmiş destede bulunan kartlar eklenemez. Kartlar silinmez; ana desteleriyle bağlantılarını korur. Aynı ayarlarla kartları yeniden toplamak için desteyi yeniden oluşturabilirsiniz.',
                                            'Suspended, buried, or already-filtered cards cannot be gathered. Cards are never deleted and keep their home-deck link. Rebuild the deck to gather cards again with the same settings.',
                                        )}
                                    </Text>
                                </View>
                            </ScrollView>
                            <View style={styles.filteredHelpFooter}>
                                <TouchableOpacity style={styles.filteredHelpDoneButton} onPress={() => setFilterHelpVisible(false)}>
                                    <Text style={styles.filteredHelpDoneText}>{l('Anladım', 'Got it')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {filterOrderPicker !== null && (
                    <View style={styles.filteredOverlayLayer}>
                        <TouchableOpacity
                            style={styles.filteredOverlayBackdrop}
                            activeOpacity={1}
                            onPress={() => setFilterOrderPicker(null)}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                        />
                        <View
                            style={[
                                styles.filteredOrderMenu,
                                filterOrderAnchor && {
                                    position: 'absolute',
                                    left: Math.max(Spacing.lg, Math.min(filterOrderAnchor.x, width - filterOrderAnchor.width - Spacing.lg)),
                                    top: filterOrderAnchor.y,
                                    width: Math.min(filterOrderAnchor.width, width - (Spacing.lg * 2)),
                                    maxHeight: Math.max(240, height - filterOrderAnchor.y - Math.max(insets.bottom, Spacing.lg)),
                                },
                            ]}
                        >
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {FILTERED_DECK_ORDER_UI.map((order) => (
                                    <TouchableOpacity
                                        key={order}
                                        style={[styles.filteredOrderOption, selectedOrder === order && styles.filteredOrderOptionSelected]}
                                        onPress={() => selectOrder(order)}
                                        accessibilityRole="button"
                                    >
                                        <Text style={[styles.filteredOrderOptionText, selectedOrder === order && styles.filteredOrderOptionTextSelected]}>
                                            {filteredOrderLabel(locale, order)}
                                        </Text>
                                        {selectedOrder === order && <Text style={styles.filteredOrderCheck}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const isFilteredDeckModal = modal?.kind === 'filter' || modal?.kind === 'create-filter';
    const isCenteredDeckDialog = modal?.kind === 'create-subdeck' || modal?.kind === 'rename';

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t('tabs.decks')}</Text>
                <View style={styles.headerActions}>
                    {isDesktopWeb && (
                        <TouchableOpacity
                            style={styles.headerBtn}
                            onPress={refresh}
                            accessibilityRole="button"
                            accessibilityLabel={l('Desteleri yenile', 'Refresh decks')}
                        >
                            <Text style={styles.headerBtnText}>↻</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.headerMenuBtn}
                        onPress={() => setShowOverflowMenu(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Diğer seçenekler', 'More options')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <View style={styles.headerMenuDot} />
                        <View style={styles.headerMenuDot} />
                        <View style={styles.headerMenuDot} />
                    </TouchableOpacity>
                </View>
            </View>


            <Modal
                visible={showOverflowMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowOverflowMenu(false)}
                onDismiss={handleOverflowDismiss}
            >
                <View style={styles.overflowOverlay}>
                    <TouchableOpacity
                        style={styles.overflowBackdrop}
                        activeOpacity={1}
                        onPress={() => setShowOverflowMenu(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Menüyü kapat', 'Close menu')}
                    />
                    <View style={styles.overflowSheet} accessibilityViewIsModal>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/empty-cards')}
                        >
                            <Text style={styles.overflowIcon}>🧹</Text>
                            <Text style={styles.overflowLabel}>{l('Boş kartlar', 'Empty Cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute(DATA_IMPORT_ROUTE)}
                        >
                            <Text style={styles.overflowIcon}>📥</Text>
                            <Text style={styles.overflowLabel}>{t('root.import')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute(DATA_EXPORT_ROUTE)}
                        >
                            <Text style={styles.overflowIcon}>📤</Text>
                            <Text style={styles.overflowLabel}>{l('Dışa aktar', 'Export')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={handleCreateBackup}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedek oluştur', 'Create backup')}
                        >
                            <Text style={styles.overflowIcon}>🗄️</Text>
                            <Text style={styles.overflowLabel}>{l('Yedek oluştur', 'Create Backup')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/backups')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedekten geri yükle', 'Restore from backup')}
                        >
                            <Text style={styles.overflowIcon}>↩️</Text>
                            <Text style={styles.overflowLabel}>{l('Yedekten geri yükle', 'Restore from Backup')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddDeck} transparent animationType="fade" onRequestClose={() => setShowAddDeck(false)}>
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <TouchableOpacity
                        style={styles.modalBackdropHit}
                        activeOpacity={1}
                        onPress={() => setShowAddDeck(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yeni deste penceresini kapat', 'Close new deck dialog')}
                    />
                    <View style={[styles.modalCard, styles.createDeckDialog]} accessibilityViewIsModal>
                        <Text style={styles.createDeckDialogTitle}>{l('Deste oluştur', 'Create deck')}</Text>
                        <View style={styles.createDeckField}>
                            <Text style={styles.createDeckFieldLabel}>{l('Deste adı', 'Name')}</Text>
                            <TextInput
                                style={styles.createDeckInput}
                                value={newDeckName}
                                onChangeText={setNewDeckName}
                                onSubmitEditing={handleAddDeck}
                                autoFocus
                                returnKeyType="done"
                                accessibilityLabel={l('Deste adı', 'Deck name')}
                            />
                        </View>
                        <View style={[styles.modalActions, styles.createDeckActions]}>
                            <TouchableOpacity style={styles.createDeckTextButton} onPress={() => setShowAddDeck(false)}>
                                <Text style={styles.createDeckCancelText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.createDeckTextButton}
                                onPress={handleAddDeck}
                                disabled={!newDeckName.trim()}
                            >
                                <Text style={[styles.createDeckCreateText, !newDeckName.trim() && styles.createDeckCreateTextDisabled]}>
                                    {l('Oluştur', 'Create')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {!isCompact && (
                <View style={styles.columnHeaders}>
                    <Text style={styles.columnLabel}>{t('common.deck')}</Text>
                    <View style={styles.countsRow}>
                        <Text style={[styles.columnCount, { color: colors.badgeNew }]}>{t('anki.new')}</Text>
                        <Text style={[styles.columnCount, { color: colors.badgeLearn }]}>{t('anki.learn')}</Text>
                        <Text style={[styles.columnCount, { color: colors.badgeReview }]}>{t('anki.review')}</Text>
                    </View>
                    <View style={{ width: 72 }} />
                </View>
            )}

            <View
                style={styles.listWrap}
                ref={listWrapRef}
                onLayout={(event) => {
                    listHeightRef.current = event.nativeEvent.layout.height;
                    listWrapRef.current?.measureInWindow((_x, y) => {
                        listTopRef.current = y;
                    });
                }}
            >
                <ScrollView
                    ref={deckScrollRef}
                    style={styles.deckList}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!draggingDeck}
                    onScroll={(e) => {
                        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                    }}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_width, height) => {
                        listContentHeightRef.current = height;
                    }}
                    contentContainerStyle={isCompact ? styles.deckListContentCompact : undefined}
                >
                    {!fullCatalogPresent && renderLockedCatalogCard()}
                    {visibleRows.length > 0 ? (
                        isCompact
                            ? deckTree.map((node, index) => renderCompactDeckBranch(
                                node,
                                true,
                                index === deckTree.length - 1,
                            ))
                            : visibleRows.map((node) => renderDeckRow(node))
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateIcon}>＋</Text>
                            <Text style={styles.emptyStateTitle}>{l('İlk destenizi oluşturun', 'Create your first deck')}</Text>
                            <Text style={styles.emptyStateText}>{l('Kartlarınızı ders ve konuya göre düzenlemeye buradan başlayın.', 'Start organizing your cards by subject and topic.')}</Text>
                        </View>
                    )}
                    <View style={{ height: 80 }} />
                </ScrollView>

                {draggingDeck && getParentDeckName(draggingDeck) && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.rootDropZone,
                            dropTarget === ROOT_DROP_TARGET && styles.rootDropZoneActive,
                        ]}
                    >
                        <Text style={[
                            styles.rootDropZoneText,
                            dropTarget === ROOT_DROP_TARGET && styles.rootDropZoneTextActive,
                        ]}>
                            {dropTarget === ROOT_DROP_TARGET && dragDropFeedback
                                ? dragDropFeedback.title
                                : `↑ ${l('Ana seviyeye bırak', 'Drop at top level')}`}
                        </Text>
                    </View>
                )}

                {!isDesktopWeb && draggingDeck && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.mobileDragPreview,
                            {
                                opacity: dragPreviewLift.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.72, 1],
                                }),
                                transform: [
                                    { translateY: dragPreviewTranslateY },
                                    {
                                        scale: dragPreviewLift.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.965, 1],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <Text style={styles.mobileDragPreviewTitle} numberOfLines={1}>
                            ⠿ {draggingDeck.replaceAll('::', ' › ')}
                        </Text>
                        {dragDropFeedback && (
                            <Text
                                style={[
                                    styles.mobileDragPreviewHint,
                                    dragDropFeedback.tone === 'order' && styles.mobileDragPreviewHintOrder,
                                ]}
                                numberOfLines={1}
                            >
                                {dragDropFeedback.title}
                            </Text>
                        )}
                    </Animated.View>
                )}
            </View>

            {showAddMenu && (
                <TouchableOpacity
                    style={styles.fabDismissLayer}
                    activeOpacity={1}
                    onPress={() => setShowAddMenu(false)}
                    accessibilityLabel={l('Ekleme menüsünü kapat', 'Close add menu')}
                />
            )}

            <View style={styles.fabWrap} pointerEvents="box-none">
                {showAddMenu && (
                    <View style={styles.fabActions}>
                        <View style={styles.fabActionRow}>
                            <View style={styles.fabActionLabel}>
                                <Text style={styles.fabActionLabelText}>{l('Filtrelenmiş deste oluştur', 'Create filtered deck')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.fabActionButton}
                                onPress={() => openCreateFilteredDeck()}
                                accessibilityRole="button"
                                accessibilityLabel={l('Filtrelenmiş deste oluştur', 'Create filtered deck')}
                            >
                                <Text style={styles.fabActionIcon}>⧉</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.fabActionRow}>
                            <View style={styles.fabActionLabel}>
                                <Text style={styles.fabActionLabelText}>{l('Deste oluştur', 'Create deck')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.fabActionButton}
                                onPress={openCreateDeck}
                                accessibilityRole="button"
                                accessibilityLabel={l('Deste oluştur', 'Create deck')}
                            >
                                <Text style={styles.fabActionIcon}>▤</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.fabActionRow}>
                            <View style={styles.fabActionLabel}>
                                <Text style={styles.fabActionLabelText}>{l('Kart ekle', 'Add note')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.fabActionButton}
                                onPress={openAddCard}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kart ekle', 'Add note')}
                            >
                                <Text style={styles.fabActionIcon}>✎</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                <TouchableOpacity
                    style={[styles.fabMain, showAddMenu && styles.fabMainOpen]}
                    onPress={() => setShowAddMenu((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={showAddMenu ? l('Ekleme menüsünü kapat', 'Close add menu') : l('Ekle', 'Add')}
                    accessibilityState={{ expanded: showAddMenu }}
                >
                    <Text style={styles.fabMainIcon}>＋</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/browser' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kartlarımı aç', 'Open Browse')}
                >
                    <Text style={styles.bottomBtnIcon}>🗂️</Text>
                    <Text style={styles.bottomBtnText}>{t('sidebar.myCards')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/stats' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('İstatistikleri aç', 'Open statistics')}
                >
                    <Text style={styles.bottomBtnIcon}>📊</Text>
                    <Text style={styles.bottomBtnText}>{t('tabs.statistics')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/settings' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Ayarları aç', 'Open settings')}
                >
                    <Text style={styles.bottomBtnIcon}>⚙️</Text>
                    <Text style={styles.bottomBtnText}>{t('tabs.settings')}</Text>
                </TouchableOpacity>
            </View>

            {isDesktopWeb && draggingDeck && (
                <View style={styles.dragBanner}>
                    <Text style={styles.dragBannerText}>
                        {dragDropFeedback?.title ?? l(`“${getDeckDisplayName(draggingDeck)}” taşınıyor`, `Moving “${getDeckDisplayName(draggingDeck)}”`)}
                    </Text>
                </View>
            )}

            <Modal
                visible={modal !== null}
                transparent
                animationType={isFilteredDeckModal
                    ? 'slide'
                    : modal?.kind === 'menu' || isCenteredDeckDialog
                        ? 'fade'
                        : isCompact ? 'slide' : 'fade'}
                onRequestClose={() => {
                    setFilterHelpVisible(false);
                    setFilterOrderPicker(null);
                    setModal(null);
                }}
                onDismiss={handleDeckModalDismiss}
            >
                <KeyboardAvoidingView
                    style={[
                        styles.modalOverlay,
                        isFilteredDeckModal && styles.filteredModalOverlay,
                        isCompact && modal?.kind !== 'menu' && !isFilteredDeckModal && !isCenteredDeckDialog && styles.modalOverlayCompact,
                        isCompact && modal?.kind !== 'menu' && !isFilteredDeckModal && !isCenteredDeckDialog && compactSheetTopInset,
                    ]}
                    behavior={Platform.OS === 'ios'
                        && !isFilteredDeckModal
                        && !filterHelpVisible
                        && filterOrderPicker === null
                        ? 'padding'
                        : undefined}
                >
                    {modal !== null && !isFilteredDeckModal && (
                        <TouchableOpacity
                            style={styles.modalBackdropHit}
                            activeOpacity={1}
                            onPress={() => setModal(null)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Açık pencereyi kapat', 'Close open dialog')}
                        />
                    )}
                    {modal?.kind === 'menu' && renderMenuModal(modal.deck)}
                    {modal?.kind === 'rename' && renderRenameModal(modal.deck)}
                    {modal?.kind === 'create-subdeck' && renderCreateSubdeckModal(modal.deck)}
                    {modal?.kind === 'description' && renderDescriptionModal(modal.deck)}
                    {modal?.kind === 'custom' && renderCustomModal(modal.deck)}
                    {modal?.kind === 'filter' && renderFilterModal(modal.deck)}
                    {modal?.kind === 'create-filter' && renderFilterModal()}
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
        paddingHorizontal: Spacing.md,
        minHeight: 44,
        minWidth: 44,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.accent },

    // Keep the native-sized 44 pt touch target, but render a compact 15 pt `more_vert` glyph.
    headerMenuBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    headerMenuDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: colors.textSecondary,
    },

    overflowOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        alignItems: 'flex-end',
        paddingTop: 56,
        paddingRight: Spacing.lg,
    },
    overflowBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    overflowSheet: {
        minWidth: 200,
        zIndex: 1,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: Spacing.xs,
        ...Shadows.lg,
    },
    overflowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        minHeight: 48,
    },
    overflowIcon: { fontSize: 16, width: 22, textAlign: 'center' },
    overflowLabel: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '500' },

    columnHeaders: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    columnLabel: {
        flex: 1,
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: colors.textMuted,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    columnCount: { fontSize: FontSize.xs, fontWeight: '700', width: 48, textAlign: 'center' },

    listWrap: { flex: 1, position: 'relative' },
    deckList: { flex: 1 },
    deckListContentCompact: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.xs,
        paddingBottom: Spacing.sm,
    },

    deckRow: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    // Content that is not the learner's yet reads as an outline rather than a solid card: a
    // dashed accent border and muted title, the same treatment the store screen uses.
    deckRowLocked: {
        borderWidth: 1,
        // The shared row style ends in a hairline bottom border; a dashed outline only renders
        // its dashes when all four edges share one width.
        borderBottomWidth: 1,
        borderColor: colors.accent,
        borderBottomColor: colors.accent,
        borderStyle: 'dashed',
        borderRadius: BorderRadius.md,
        backgroundColor: colors.accentLight,
    },
    deckNameRow: { flexDirection: 'row', alignItems: 'center' },
    deckNameLock: { marginRight: 6, opacity: 0.75 },
    deckNameLocked: { color: colors.textSecondary },
    deckRowCompact: {
        minHeight: 76,
        paddingVertical: 7,
        paddingRight: 4,
        borderBottomWidth: 0,
    },
    deckRowCompactChild: {
        minHeight: 70,
    },
    // A top-level deck is one surface. Its recursively rendered child wells below are physically
    // inside this card instead of being painted behind unrelated flat rows.
    deckGroupCard: {
        position: 'relative',
        marginTop: Spacing.sm,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        overflow: 'visible',
        ...Shadows.sm,
    },
    lockedDeckCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.sm,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.md,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.accent,
        borderStyle: 'dashed',
        borderRadius: BorderRadius.md,
        minHeight: 72,
        ...Shadows.sm,
    },
    lockedDeckIcon: {
        width: 40, height: 40, borderRadius: BorderRadius.sm,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.accentLight,
    },
    lockedDeckCopy: { flex: 1, marginHorizontal: Spacing.md },
    lockedDeckName: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
    lockedDeckMeta: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
    lockedDeckPricePill: {
        paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.accent,
    },
    lockedDeckPriceText: { color: '#ffffff', fontSize: FontSize.sm, fontWeight: '800' },
    catalogBuyPill: {
        marginHorizontal: 4,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.accent,
    },
    catalogBuyPillText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
    deckNestedBranch: { position: 'relative' },
    deckNestedBranchLast: {},
    deckChildrenWell: {
        marginLeft: 18,
        marginRight: 0,
        marginBottom: 4,
        paddingLeft: 6,
        backgroundColor: colors.bgCard,
        borderLeftWidth: 0,
        overflow: 'visible',
    },
    deckChildrenWellNested: {
        marginLeft: 14,
        marginRight: 0,
        marginBottom: 3,
    },
    // After four visual levels, preserve usable title width while keeping the hierarchy guide.
    deckChildrenWellDeep: {
        marginLeft: 6,
        marginRight: 0,
    },
    deckRowDragging: { opacity: 0.22, transform: [{ scale: 0.99 }] },
    deckRowDropTarget: {
        backgroundColor: colors.accentLight,
        transform: [{ scale: 1.006 }],
    },
    deckDropLabel: {
        position: 'absolute',
        left: 42,
        right: 52,
        zIndex: 8,
        alignItems: 'flex-start',
    },
    deckDropLabelBefore: { top: -18 },
    deckDropLabelAfter: { bottom: -18 },
    deckDropLabelText: {
        maxWidth: '100%',
        overflow: 'hidden',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.accent,
        color: colors.white,
        fontSize: 11,
        fontWeight: '800',
    },
    deckInsideDropBadge: {
        position: 'absolute',
        left: 42,
        right: 52,
        top: 4,
        zIndex: 8,
        alignItems: 'flex-start',
    },
    deckInsideDropBadgeText: {
        maxWidth: '100%',
        overflow: 'hidden',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.accent,
        color: colors.white,
        fontSize: 11,
        fontWeight: '800',
    },
    expandBtn: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    expandDot: { fontSize: 10, color: colors.border },
    deckNameTouchable: { flex: 1, marginLeft: 2, minHeight: 44, justifyContent: 'center' },
    deckName: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
    deckNameFiltered: { color: colors.badgeNew, fontStyle: 'italic' },
    deckMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    mobileCountsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 7 },
    mobileCountPill: { borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 3 },
    mobileCountText: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },

    countsRow: { flexDirection: 'row', gap: 0 },
    countBadge: { fontSize: FontSize.md, fontWeight: '700', width: 48, textAlign: 'center' },
    countNew: { color: colors.badgeNew },
    countLearn: { color: colors.badgeLearn },
    countReview: { color: colors.badgeReview },

    dragHandle: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : null),
    },
    dragHandleActive: { backgroundColor: colors.accentLight, transform: [{ scale: 1.08 }] },
    dragHandleDisabled: { opacity: 0.25 },
    dragHandleText: { fontSize: 18, color: colors.textMuted },
    gearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    gearText: { fontSize: 16, fontWeight: '800', color: colors.textMuted, letterSpacing: -1 },

    rootDropZone: {
        position: 'absolute',
        top: -64,
        left: Spacing.md,
        right: Spacing.md,
        minHeight: 58,
        zIndex: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: colors.accent,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgCard,
        ...Shadows.md,
    },
    rootDropZoneActive: {
        borderStyle: 'solid',
        backgroundColor: colors.accent,
        transform: [{ scale: 1.015 }],
    },
    rootDropZoneText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '800' },
    rootDropZoneTextActive: { color: colors.white },
    mobileDragPreview: {
        position: 'absolute',
        top: 0,
        left: Spacing.lg,
        right: Spacing.lg,
        zIndex: 30,
        minHeight: 58,
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        backgroundColor: colors.bgCard,
        borderWidth: 2,
        borderColor: colors.accent,
        borderRadius: BorderRadius.md,
        ...Shadows.lg,
    },
    mobileDragPreviewTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
    mobileDragPreviewHint: {
        marginTop: 4,
        color: colors.accent,
        fontSize: 12,
        fontWeight: '800',
    },
    mobileDragPreviewHintOrder: { color: colors.textSecondary },

    fabDismissLayer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 20,
    },
    fabWrap: {
        position: 'absolute',
        right: Spacing.lg,
        bottom: 112,
        zIndex: 30,
        alignItems: 'flex-end',
    },
    fabActions: {
        gap: Spacing.md,
        marginBottom: Spacing.md,
        alignItems: 'flex-end',
    },
    fabActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: Spacing.md,
    },
    fabActionLabel: {
        maxWidth: 240,
        borderRadius: 4,
        backgroundColor: 'rgba(65, 65, 65, 0.82)',
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    fabActionLabelText: {
        color: colors.white,
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    fabActionButton: {
        width: 46,
        height: 46,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
        ...Shadows.md,
    },
    fabActionIcon: {
        color: colors.white,
        fontSize: 21,
        fontWeight: '700',
    },
    fabMain: {
        width: 56,
        height: 56,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
        ...Shadows.lg,
    },
    fabMainOpen: { backgroundColor: colors.accentHover },
    fabMainIcon: {
        color: colors.white,
        fontSize: 30,
        fontWeight: '400',
        lineHeight: 32,
    },

    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        minHeight: 66,
        paddingVertical: 6,
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        ...Shadows.md,
    },
    bottomBtn: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4 },
    bottomBtnIcon: { fontSize: 20 },
    bottomBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

    emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: 64 },
    emptyStateIcon: { fontSize: 36, color: colors.accent, marginBottom: Spacing.sm },
    emptyStateTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    emptyStateText: { marginTop: Spacing.xs, fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' },

    dragBanner: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        ...Shadows.md,
    },
    dragBannerText: { color: colors.white, fontWeight: '600', textAlign: 'center' },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    filteredModalOverlay: {
        padding: 0,
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        backgroundColor: colors.bgCard,
    },
    filteredDeckScreen: {
        flex: 1,
        backgroundColor: colors.bgCard,
    },
    filteredDeckToolbar: {
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 8,
        paddingHorizontal: 8,
        gap: 4,
        backgroundColor: colors.bgCard,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    filteredToolbarIconButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    filteredCloseIcon: {
        color: colors.textSecondary,
        fontSize: 34,
        lineHeight: 36,
        fontWeight: '300',
    },
    filteredToolbarTitle: {
        flex: 1,
        minWidth: 0,
        color: colors.textPrimary,
        fontSize: FontSize.lg,
        fontWeight: '600',
    },
    filteredBuildButton: {
        minWidth: 78,
        minHeight: 44,
        paddingHorizontal: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
        backgroundColor: colors.accent,
    },
    filteredBuildButtonDisabled: { opacity: 0.42 },
    filteredBuildButtonText: {
        color: colors.white,
        fontSize: FontSize.sm,
        fontWeight: '800',
    },
    filteredHelpCircle: {
        width: 25,
        height: 25,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.textSecondary,
        borderRadius: BorderRadius.full,
    },
    filteredHelpIcon: {
        color: colors.textSecondary,
        fontSize: 16,
        lineHeight: 19,
        fontWeight: '800',
    },
    filteredDeckScroll: { flex: 1 },
    filteredDeckContent: {
        width: '100%',
        maxWidth: 620,
        alignSelf: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: 56,
    },
    filteredOutlinedField: {
        position: 'relative',
        minHeight: 58,
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: colors.textMuted,
        borderRadius: 5,
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
        backgroundColor: colors.bgCard,
    },
    filteredOutlinedLabel: {
        position: 'absolute',
        top: -9,
        left: 12,
        paddingHorizontal: 5,
        color: colors.textSecondary,
        backgroundColor: colors.bgCard,
        fontSize: FontSize.xs,
        lineHeight: 18,
        fontWeight: '500',
    },
    filteredTextInput: {
        minHeight: 52,
        paddingVertical: 8,
        color: colors.textPrimary,
        fontSize: FontSize.lg,
    },
    filteredSearchInput: { paddingRight: 44 },
    filteredSearchButton: {
        position: 'absolute',
        right: 3,
        top: 6,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    filteredSearchIcon: {
        color: colors.textSecondary,
        fontSize: 31,
        lineHeight: 33,
        transform: [{ rotate: '-18deg' }],
    },
    filteredSectionTitle: {
        marginTop: 2,
        marginBottom: Spacing.md,
        color: colors.textPrimary,
        fontSize: FontSize.xl,
        fontWeight: '700',
    },
    filteredPickerLabel: {
        marginTop: -2,
        color: colors.textPrimary,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    filteredPickerRow: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        marginBottom: Spacing.md,
    },
    filteredPickerValue: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.lg,
    },
    filteredPickerChevron: {
        color: colors.textSecondary,
        fontSize: 22,
        fontWeight: '700',
    },
    filteredSwitchRow: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    filteredSwitchLabel: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.md,
        lineHeight: 20,
        fontWeight: '500',
    },
    filteredSecondFilter: {
        paddingTop: Spacing.sm,
        paddingLeft: Spacing.sm,
        borderLeftWidth: 2,
        borderLeftColor: colors.borderLight,
    },
    filteredPreviewHint: {
        marginTop: -4,
        marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        color: colors.textMuted,
        fontSize: FontSize.sm,
        lineHeight: 18,
    },
    filteredExcludedButton: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderLight,
        backgroundColor: colors.bgCard,
    },
    filteredExcludedText: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '700',
        textAlign: 'center',
    },
    filteredOverlayLayer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 20,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    filteredOverlayBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.42)',
    },
    filteredHelpCard: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '88%',
        overflow: 'hidden',
        borderRadius: 24,
        backgroundColor: colors.bgCard,
        ...Shadows.lg,
    },
    filteredHelpHeader: {
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Spacing.lg,
        paddingLeft: Spacing.xl,
        paddingRight: Spacing.md,
        paddingBottom: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    filteredHelpTitle: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.xxl,
        fontWeight: '700',
    },
    filteredHelpCloseButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
    },
    filteredHelpCloseText: {
        color: colors.textSecondary,
        fontSize: 30,
        lineHeight: 32,
    },
    filteredHelpBody: {
        color: colors.textSecondary,
        fontSize: FontSize.md,
        lineHeight: 21,
    },
    filteredHelpIntro: {
        marginBottom: Spacing.lg,
        color: colors.textPrimary,
        fontSize: FontSize.md,
        lineHeight: 22,
        fontWeight: '600',
    },
    filteredHelpSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    filteredHelpNumber: {
        width: 28,
        height: 28,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.full,
        backgroundColor: colors.accentLight,
    },
    filteredHelpNumberText: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '900',
    },
    filteredHelpSectionCopy: { flex: 1 },
    filteredHelpSectionTitle: {
        marginBottom: 4,
        color: colors.textPrimary,
        fontSize: FontSize.md,
        lineHeight: 21,
        fontWeight: '800',
    },
    filteredHelpCodeBox: {
        marginTop: Spacing.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgSecondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    filteredHelpCode: {
        color: colors.textPrimary,
        fontSize: FontSize.xs,
        lineHeight: 18,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    filteredHelpNotice: {
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.accentLight,
    },
    filteredHelpNoticeTitle: {
        marginBottom: 5,
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '900',
    },
    filteredHelpNoticeText: {
        color: colors.textPrimary,
        fontSize: FontSize.sm,
        lineHeight: 20,
    },
    filteredHelpScroll: {
        flexShrink: 1,
    },
    filteredHelpScrollContent: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.lg,
    },
    filteredHelpFooter: {
        flexShrink: 0,
        minHeight: 56,
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderLight,
    },
    filteredHelpDoneButton: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.sm,
    },
    filteredHelpDoneText: {
        color: colors.accent,
        fontSize: FontSize.md,
        fontWeight: '800',
    },
    filteredOrderMenu: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '72%',
        overflow: 'hidden',
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgCard,
        ...Shadows.lg,
    },
    filteredOrderOption: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    filteredOrderOptionSelected: { backgroundColor: colors.accentLight },
    filteredOrderOptionText: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.md,
    },
    filteredOrderOptionTextSelected: {
        color: colors.accent,
        fontWeight: '700',
    },
    filteredOrderCheck: {
        color: colors.accent,
        fontSize: 18,
        fontWeight: '900',
    },
    modalOverlayCompact: { justifyContent: 'flex-end', padding: 0 },
    modalBackdropHit: { ...StyleSheet.absoluteFillObject },
    deckMenuCard: {
        width: '100%',
        maxWidth: 520,
        maxHeight: '88%',
        zIndex: 1,
        overflow: 'hidden',
        backgroundColor: colors.badgeNewBg,
        borderRadius: 28,
        paddingTop: Spacing.xl,
        ...Shadows.lg,
    },
    deckMenuTitle: {
        paddingHorizontal: 30,
        paddingBottom: Spacing.sm,
        fontSize: 20,
        lineHeight: 27,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    deckMenuScroll: { flexGrow: 0 },
    deckMenuContent: { paddingHorizontal: 30, paddingBottom: Spacing.xl },
    deckMenuItem: { minHeight: 66, justifyContent: 'center' },
    deckMenuItemText: { fontSize: 17, lineHeight: 23, fontWeight: '400', color: colors.textPrimary },
    modalCard: {
        width: '100%',
        maxWidth: 420,
        zIndex: 1,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        ...Shadows.lg,
    },
    modalCardCompact: {
        maxWidth: undefined,
        maxHeight: '90%',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingHorizontal: Spacing.xl,
        paddingTop: 44,
        paddingBottom: Spacing.xl,
    },
    createDeckDialog: {
        width: '88%',
        maxWidth: 380,
        borderRadius: 28,
        paddingTop: 26,
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.md,
    },
    createDeckDialogTitle: {
        color: colors.textPrimary,
        fontSize: 24,
        lineHeight: 31,
        fontWeight: '600',
        marginBottom: 24,
    },
    createDeckField: {
        minHeight: 62,
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.accent,
        borderRadius: 5,
        marginBottom: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    createDeckFieldLabel: {
        position: 'absolute',
        top: -9,
        left: 12,
        paddingHorizontal: 4,
        color: colors.accent,
        backgroundColor: colors.bgCard,
        fontSize: FontSize.xs,
        lineHeight: 18,
        fontWeight: '500',
    },
    createDeckInput: {
        minHeight: 48,
        paddingVertical: 8,
        color: colors.textPrimary,
        fontSize: FontSize.md,
    },
    createDeckActions: {
        marginTop: 4,
        gap: 10,
    },
    createDeckTextButton: {
        minWidth: 68,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
    },
    createDeckCancelText: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    createDeckCreateText: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    createDeckCreateTextDisabled: { color: colors.textMuted },
    modalCardScrollable: { padding: 0, overflow: 'hidden' },
    modalSheetScroll: { flexShrink: 1 },
    modalCardScrollContent: { padding: Spacing.xl, paddingBottom: Spacing.xxl },
    modalCardScrollContentCompact: { paddingTop: 48 },
    modalEyebrow: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
        color: colors.accent,
        marginBottom: Spacing.xs,
    },
    modalTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: Spacing.md,
    },
    modalHint: {
        fontSize: FontSize.sm,
        color: colors.textMuted,
        marginBottom: Spacing.sm,
    },
    descriptionInput: { minHeight: 150, paddingTop: Spacing.md },
    fieldLabel: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: Spacing.sm,
        marginBottom: 4,
    },
    modalInput: {
        backgroundColor: colors.bgInput,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        minHeight: 44,
        paddingVertical: 10,
        fontSize: FontSize.md,
        color: colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    inlineInput: { flex: 1, marginBottom: 0 },
    customSection: {
        marginBottom: Spacing.lg,
        gap: 6,
    },
    modalActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: Spacing.md,
    },
    modalBtnPrimary: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.lg,
        minHeight: 44,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBtnPrimaryText: { color: colors.white, fontWeight: '700', fontSize: FontSize.sm },
    modalBtnSecondary: {
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.lg,
        minHeight: 44,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.45 },
    modalBtnSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
    modalCancel: { marginTop: Spacing.md, alignItems: 'center', paddingVertical: 6 },
    modalCancelText: { color: colors.textMuted, fontWeight: '600' },

    menuItemDanger: { color: colors.btnAgain },
    orderWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    orderChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bgInput,
    },
    orderChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    orderChipText: { fontSize: FontSize.xs, color: colors.textSecondary },
    orderChipTextActive: { color: colors.accent, fontWeight: '700' },
    rescheduleRow: { paddingVertical: 8 },
    });
}
