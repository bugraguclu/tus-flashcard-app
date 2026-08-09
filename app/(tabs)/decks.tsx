// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename, move,
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
    SafeAreaView,
    TextInput,
    Modal,
    PanResponder,
    Animated,
    LayoutAnimation,
    UIManager,
    Platform,
    KeyboardAvoidingView,
    useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    setDeckDescription,
    emptyFilteredDeck,
    reorderDeckRelative,
    type DeckTreeNode,
} from '../../lib/deckManager';
import { getDeckDisplayName, getParentDeckName, FILTERED_ORDERS, type Deck } from '../../lib/models';
import { alert, confirm } from '../../lib/confirm';
import { getStudyQueue } from '../../lib/studyRepository';
import { createBackupNow } from '../../lib/backup';
import { useApp } from './_layout';
import { useI18n } from '../../hooks/useI18n';
import { filteredOrderLabel } from '../../lib/i18n';

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

type ModalState =
    | { kind: 'menu'; deck: Deck }
    | { kind: 'rename'; deck: Deck }
    | { kind: 'move'; deck: Deck }
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
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    // Bottom-sheet modals fill most of the screen; a top inset keeps the tap-to-dismiss backdrop
    // reachable below the status bar/notch instead of hiding under it.
    const compactSheetTopInset = { paddingTop: insets.top + Spacing.md };
    const isDesktopWeb = Platform.OS === 'web' && !isCompact;
    const supportsDeckDrag = isDesktopWeb || Platform.OS === 'ios' || Platform.OS === 'android';
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings, dataVersion, bumpDataVersion } = useApp();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(() => new Set(
        getAllDecks().filter((deck) => !deck.collapsed).map((deck) => deck.name),
    ));
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const pendingOverflowRouteRef = useRef<string | null>(null);
    const pendingOverflowActionRef = useRef<(() => void) | null>(null);
    const pendingDeckMenuRouteRef = useRef<string | null>(null);
    const [newDeckName, setNewDeckName] = useState('');
    const [newFilteredDeckName, setNewFilteredDeckName] = useState('');
    const [refreshToken, setRefreshToken] = useState(0);
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
    const [filterReschedule, setFilterReschedule] = useState(true);

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
        return buildDeckTree(decks, counts, settings.dayRolloverHour);
    }, [refreshToken, dataVersion, settings]);

    const todaySummary = useMemo(() => deckTree.reduce((summary, node) => ({
        new: summary.new + node.newCount,
        learn: summary.learn + node.learnCount,
        review: summary.review + node.reviewCount,
    }), { new: 0, learn: 0, review: 0 }), [deckTree]);

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

    const refresh = useCallback(() => {
        setRefreshToken((value) => value + 1);
        bumpDataVersion();
    }, [bumpDataVersion]);

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
        const name = newDeckName.trim();
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
                        l('Yedek Oluşturuldu', 'Backup Created'),
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

    const openCreateFilteredDeck = () => {
        const baseName = l('Filtrelenmiş Deste', 'Filtered Deck');
        let suffix = 1;
        while (getDeckByName(`${baseName} ${suffix}`)) suffix += 1;

        setShowAddMenu(false);
        setNewFilteredDeckName(`${baseName} ${suffix}`);
        setFilterSearch('is:due');
        setFilterLimit('100');
        setFilterOrder(0);
        setFilterSearch2('');
        setFilterLimit2('100');
        setFilterReschedule(true);
        setModal({ kind: 'create-filter' });
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
        try {
            const availableName = getAvailableDeckName(name);
            const deck = createFilteredDeck(availableName, search, parseCount(filterLimit, 100) || 100);
            updateFilteredDeck(deck.id, {
                searchQuery: search,
                searchLimit: parseCount(filterLimit, 100) || 100,
                searchOrder: filterOrder,
                searchQuery2: filterSearch2.trim() || undefined,
                searchLimit2: parseCount(filterLimit2, 100) || 100,
                searchOrder2: 0,
                reschedule: filterReschedule,
            });
            setModal(null);
            refresh();
            router.push(`/deck-overview?deck=${encodeURIComponent(availableName)}` as any);
        } catch (e) {
            console.warn('[Decks] create filtered deck failed:', e);
            alert(t('common.error'), l('Filtrelenmiş deste oluşturulamadı.', 'Could not create the filtered deck.'));
        }
    };

    // ---- Gear menu actions ----

    const openMenu = (deck: Deck) => setModal({ kind: 'menu', deck });

    const openRename = (deck: Deck) => {
        // AnkiDroid exposes the full name here, so editing the :: path can also move a deck.
        setRenameText(deck.name);
        setModal({ kind: 'rename', deck });
    };

    const openCreateSubdeck = (deck: Deck) => {
        setNewSubdeckName('');
        setModal({ kind: 'create-subdeck', deck });
    };

    const openMoveDeck = (deck: Deck) => setModal({ kind: 'move', deck });

    const handleCreateSubdeck = () => {
        if (modal?.kind !== 'create-subdeck') return;
        const segments = newSubdeckName.split('::').map((segment) => segment.trim());
        if (segments.length === 0 || segments.some((segment) => !segment)) {
            alert(t('common.error'), l('Alt deste adı boş olamaz.', 'The subdeck name cannot be empty.'));
            return;
        }

        const relativePath = segments.join('::');
        const fullName = `${modal.deck.name}::${relativePath}`;

        try {
            const availableName = getAvailableDeckName(fullName);
            createDeck(availableName, modal.deck.configId);
            const availableSegments = availableName.slice(`${modal.deck.name}::`.length).split('::');
            setDeckCollapsed(modal.deck.id, false);
            setExpandedDecks((prev) => {
                const next = new Set(prev);
                let path = modal.deck.name;
                next.add(path);
                for (const segment of availableSegments) {
                    path = `${path}::${segment}`;
                    next.add(path);
                }
                return next;
            });
            setModal(null);
            refresh();
            if (Platform.OS !== 'web') {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            }
        } catch (e) {
            console.warn('[Decks] create subdeck failed:', e);
            alert(t('common.error'), e instanceof Error ? e.message : l('Alt deste oluşturulamadı.', 'Could not create the subdeck.'));
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
            // AnkiDroid's launcher shortcut enters study for the selected deck; keep the same
            // semantics in the cross-platform deep link used by iOS Shortcuts.
            const url = Linking.createURL('/', { queryParams: { deck: deck.name } });
            await Clipboard.setStringAsync(url);
            setModal(null);
            const message = Platform.OS === 'ios'
                ? l(
                    `“${deck.name}” destesini doğrudan açan bağlantı panoya kopyalandı. Kestirmeler uygulamasında “URL'leri Aç” eylemine yapıştırıp Ana Ekrana Ekle'yi seçin.`,
                    `A link that opens “${deck.name}” directly was copied. Paste it into an “Open URLs” action in Shortcuts, then choose Add to Home Screen.`,
                )
                : l(
                    `“${deck.name}” destesini doğrudan açan kısayol bağlantısı panoya kopyalandı.`,
                    `A shortcut link that opens “${deck.name}” directly was copied to the clipboard.`,
                );
            setTimeout(() => alert(l('Kısayol Hazır', 'Shortcut Ready'), message), Platform.OS === 'ios' ? 300 : 0);
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

    // The Anki overview exposes Custom Study directly. It returns here with a deck query and
    // opens the same sheet used by the deck-row menu.
    const customDeckParam = typeof params.custom === 'string' ? params.custom : null;
    const openedCustomParam = useRef<string | null>(null);
    useEffect(() => {
        if (!customDeckParam || openedCustomParam.current === customDeckParam) return;
        const deck = getAllDecks().find((entry) => entry.name === customDeckParam);
        if (!deck || deck.isFiltered) return;
        openedCustomParam.current = customDeckParam;
        openCustomStudy(deck);
    }, [customDeckParam]);

    const openFilterOptions = (deck: Deck) => {
        setFilterSearch(deck.searchQuery ?? '');
        setFilterLimit(String(deck.searchLimit ?? 100));
        setFilterOrder(deck.searchOrder ?? 0);
        setFilterSearch2(deck.searchQuery2 ?? '');
        setFilterLimit2(String(deck.searchLimit2 ?? 100));
        setFilterReschedule(deck.reschedule ?? true);
        setModal({ kind: 'filter', deck });
    };

    const filterDeckParam = typeof params.filter === 'string' ? params.filter : null;
    const openedFilterParam = useRef<string | null>(null);
    useEffect(() => {
        if (!filterDeckParam || openedFilterParam.current === filterDeckParam) return;
        const deck = getAllDecks().find((entry) => entry.name === filterDeckParam);
        if (!deck?.isFiltered) return;
        openedFilterParam.current = filterDeckParam;
        openFilterOptions(deck);
    }, [filterDeckParam]);

    const handleSaveFilterOptions = () => {
        if (modal?.kind !== 'filter') return;
        try {
            updateFilteredDeck(modal.deck.id, {
                searchQuery: filterSearch.trim(),
                searchLimit: parseCount(filterLimit, 100) || 100,
                searchOrder: filterOrder,
                searchQuery2: filterSearch2.trim() || undefined,
                searchLimit2: parseCount(filterLimit2, 100) || 100,
                searchOrder2: 0,
                reschedule: filterReschedule,
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
        const nextName = renameText.trim();
        if (!nextName) return;
        if (nextName.split('::').some((segment) => !segment.trim())) {
            alert(t('common.error'), l('Deste yolunda boş bir seviye olamaz.', 'A deck path cannot contain an empty level.'));
            return;
        }

        try {
            const availableName = getAvailableDeckSubtreeName(modal.deck.id, nextName);
            renameDeck(modal.deck.id, availableName);
            setExpandedDecks((prev) => remapExpandedDeckPaths(prev, modal.deck.name, availableName));
            setModal(null);
            refresh();
        } catch (e) {
            console.warn('[Decks] rename failed:', e);
            alert(t('common.error'), e instanceof Error ? e.message : l('Yeniden adlandırılamadı.', 'Could not rename the deck.'));
        }
    };

    const handleMoveTo = (targetName: string | null) => {
        if (modal?.kind !== 'move') return;
        try {
            const nextName = moveDeckUnder(modal.deck.id, targetName) ?? modal.deck.name;
            setExpandedDecks((prev) => remapExpandedDeckPaths(
                prev,
                modal.deck.name,
                nextName,
                targetName,
            ));
            setModal(null);
            refresh();
        } catch (e) {
            console.warn('[Decks] move failed:', e);
            alert(t('common.error'), e instanceof Error ? e.message : l('Deste taşınamadı.', 'Could not move the deck.'));
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
            l('Desteyi Sil', 'Delete Deck'),
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
            l('Filtrelenmiş Desteyi Boşalt', 'Empty Filtered Deck'),
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
            const isInvalidTarget = name === dragged || isDescendantOf(name, dragged);
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
                alert(t('common.error'), e instanceof Error ? e.message : l('Deste sıralanamadı.', 'Could not reorder the deck.'));
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
            alert(t('common.error'), e instanceof Error ? e.message : l('Deste taşınamadı.', 'Could not move the deck.'));
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
        const dragResponder = supportsDeckDrag && !deck.isFiltered ? getDragResponder(node) : null;
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
                {!isCompact && isDropBefore && <View pointerEvents="none" style={[styles.deckDropLine, styles.deckDropLineBefore]} />}
                {!isCompact && isDropAfter && <View pointerEvents="none" style={[styles.deckDropLine, styles.deckDropLineAfter]} />}
                {hasChildren ? (
                    <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => toggleExpand(deck)}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? l('Alt desteleri gizle', 'Hide subdecks') : l('Alt desteleri göster', 'Show subdecks')}
                        accessibilityState={{ expanded: isExpanded }}
                    >
                        <View style={styles.expandIconCircle}>
                            <Text style={[styles.expandArrow, isExpanded && styles.expandArrowExpanded]}>›</Text>
                        </View>
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
                    <Text
                        style={[styles.deckName, deck.isFiltered && styles.deckNameFiltered]}
                        numberOfLines={isCompact ? 2 : 1}
                    >
                        {displayName}
                    </Text>
                    {isCompact && (
                        <>
                            <Text style={styles.deckMeta} numberOfLines={1}>
                                {l(`${node.totalCards} kart`, `${node.totalCards} cards`)}{hasChildren ? l(` · ${node.children.length} alt deste`, ` · ${node.children.length} subdecks`) : ''}
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
                        accessibilityHint={l('Satırın üstüne veya altına bırakarak sıralayın; ortasına bırakarak alt deste yapın', 'Drop at a row edge to reorder, or at its centre to make a subdeck')}
                        {...webTitle(l('Kenarlara bırakın: sırala · Ortaya bırakın: alt deste yap', 'Drop at edges: reorder · Drop at centre: make a subdeck'))}
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
                {branchDropTarget === 'before' && (
                    <View pointerEvents="none" style={[styles.deckDropLine, styles.deckDropLineBefore]} />
                )}
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
                {branchDropTarget === 'after' && (
                    <View pointerEvents="none" style={[styles.deckDropLine, styles.deckDropLineAfter]} />
                )}
            </View>
        );
    };

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
                <Text style={styles.deckMenuTitle}>{deck.name}</Text>
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
                            <MenuAction label={l('Desteyi taşı', 'Move deck')} onPress={() => openMoveDeck(deck)} />
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

                    <MenuAction label={l('Kısayol oluştur', 'Create shortcut')} onPress={() => { void handleCreateShortcut(deck); }} />
                    <MenuAction label={l('Açıklamayı düzenle', 'Edit description')} onPress={() => openDescription(deck)} />
                    <MenuAction label={l('Desteyi sil', 'Delete deck')} onPress={() => requestDelete(deck)} />
                </ScrollView>
            </View>
        );
    };

    const renderRenameModal = (deck: Deck) => (
        <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalTitle}>{l('Yeniden Adlandır', 'Rename')}</Text>
            <Text style={styles.modalHint}>
                {l('Tam deste yolu. :: işaretleri alt deste seviyelerini belirler.', 'Full deck path. Double colons (::) define subdeck levels.')}
            </Text>
            <TextInput
                style={styles.modalInput}
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={handleRename}
                autoFocus
                placeholder={l('Deste adı', 'Deck name')}
                placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleRename}>
                    <Text style={styles.modalBtnPrimaryText}>{t('common.save')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderCreateSubdeckModal = (deck: Deck) => (
        <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalEyebrow}>{l('ALT DESTE OLUŞTUR', 'CREATE SUBDECK')}</Text>
            <Text style={styles.modalTitle} numberOfLines={2}>{deck.name}</Text>
            <Text style={styles.modalHint}>
                {l(
                    'Yeni deste bu destenin doğrudan altında oluşturulur. Bir kerede daha derin yol için adları :: ile ayırabilirsiniz.',
                    'The new deck is created directly below this deck. To create a deeper path at once, separate names with ::.',
                )}
            </Text>
            <TextInput
                style={styles.modalInput}
                value={newSubdeckName}
                onChangeText={setNewSubdeckName}
                onSubmitEditing={handleCreateSubdeck}
                autoFocus
                placeholder={l('Alt deste adı', 'Subdeck name')}
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
            />
            <Text style={styles.subdeckPathPreview} numberOfLines={3}>
                {newSubdeckName.trim()
                    ? `${deck.name}::${newSubdeckName.trim()}`
                    : `${deck.name}::…`}
            </Text>
            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.modalBtnPrimary, !newSubdeckName.trim() && styles.buttonDisabled]}
                    onPress={handleCreateSubdeck}
                    disabled={!newSubdeckName.trim()}
                >
                    <Text style={styles.modalBtnPrimaryText}>{l('Alt Desteyi Oluştur', 'Create Subdeck')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderDescriptionModal = (deck: Deck) => (
        <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalEyebrow}>{l('DESTE AÇIKLAMASI', 'DECK DESCRIPTION')}</Text>
            <Text style={styles.modalTitle} numberOfLines={2}>{deck.name}</Text>
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
        </View>
    );

    const renderMoveModal = (deck: Deck) => {
        const targets = getAllDecks().filter((candidate) =>
            !candidate.isFiltered
            && candidate.name !== deck.name
            && !isDescendantOf(candidate.name, deck.name)
            && candidate.name !== (getParentDeckName(deck.name) ?? ''));

        return (
            <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
                {isCompact && <View style={styles.sheetHandle} />}
                <Text style={styles.modalTitle}>{l('Nereye taşınsın?', 'Move deck to…')}</Text>
                <ScrollView style={styles.moveList}>
                    {getParentDeckName(deck.name) && (
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleMoveTo(null)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kök seviyeye taşı', 'Move to top level')}
                        >
                            <Text style={styles.menuItemText}>📂  {l('Kök seviyeye taşı', 'Move to top level')}</Text>
                        </TouchableOpacity>
                    )}
                    {targets.map((target) => (
                        <TouchableOpacity
                            key={target.id}
                            style={styles.menuItem}
                            onPress={() => handleMoveTo(target.name)}
                            accessibilityRole="button"
                            accessibilityLabel={l(`${target.name} altına taşı`, `Move under ${target.name}`)}
                        >
                            <Text style={styles.menuItemText} numberOfLines={1}>📁  {target.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                    <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderCustomModal = (deck: Deck) => (
        <ScrollView
            style={[styles.modalCard, isCompact && styles.modalCardCompact, styles.modalCardScrollable]}
            contentContainerStyle={styles.modalCardScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalTitle}>{t('anki.customStudy')} — {getDeckDisplayName(deck.name)}</Text>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Bugünkü yeni kart limitini artır', 'Increase today’s new card limit')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={boostNew}
                        onChangeText={setBoostNew}
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
                        onChangeText={setBoostReview}
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
                        onChangeText={setCustomLimit}
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
                    <Text style={styles.modalBtnPrimaryText}>🎯 {l('Oturum Oluştur', 'Create Session')}</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>{l('Unutulanları çalış (son N günde “Tekrar” verilenler)', 'Review forgotten cards (answered Again in the last N days)')}</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={forgottenDays}
                        onChangeText={setForgottenDays}
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
                        onChangeText={setAheadDays}
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
                    <Text style={styles.modalBtnPrimaryText}>👁️ {l('Önizleme Oturumu', 'Preview Session')}</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
                {l('Bu seçenekler Anki’deki gibi tek bir “Özel Çalışma” oturumu oluşturur. Mevcut oturum yeniden kurulur; saklamak istediğiniz oturumu yeniden adlandırabilirsiniz.', 'As in Anki, these options create a single Custom Study session. The existing session is rebuilt; rename it if you want to keep it.')}
            </Text>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                <Text style={styles.modalCancelText}>{t('common.close')}</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderFilterModal = (deck?: Deck) => {
        const isCreating = !deck;
        const createDisabled = !newFilteredDeckName.trim() || !filterSearch.trim();

        return (
            <ScrollView
                style={[styles.modalCard, isCompact && styles.modalCardCompact, styles.modalCardScrollable]}
                contentContainerStyle={styles.modalCardScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalEyebrow}>{l('FİLTRELENMİŞ DESTE', 'FILTERED DECK')}</Text>
            <Text style={styles.modalTitle}>
                {isCreating
                    ? l('Filtrelenmiş Deste Oluştur', 'Create Filtered Deck')
                    : getDeckDisplayName(deck.name)}
            </Text>

            {isCreating && (
                <>
                    <Text style={styles.fieldLabel}>{l('Deste adı', 'Deck name')}</Text>
                    <TextInput
                        style={styles.modalInput}
                        value={newFilteredDeckName}
                        onChangeText={setNewFilteredDeckName}
                        placeholder={l('Filtrelenmiş Deste 1', 'Filtered Deck 1')}
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                </>
            )}

            <Text style={styles.fieldLabel}>{t('common.search')}</Text>
            <TextInput
                style={styles.modalInput}
                value={filterSearch}
                onChangeText={setFilterSearch}
                placeholder={'deck:"Python" tag:zor flag:1 is:due rated:7:1 prop:due<=3'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
            />
            <View style={styles.inlineRow}>
                <TextInput
                    style={[styles.modalInput, styles.inlineInput]}
                    value={filterLimit}
                    onChangeText={setFilterLimit}
                    keyboardType="number-pad"
                    placeholder={l('Limit', 'Limit')}
                    placeholderTextColor={colors.textMuted}
                />
            </View>
            <Text style={styles.fieldLabel}>{l('Sıralama', 'Order')}</Text>
            <View style={styles.orderWrap}>
                {FILTERED_ORDERS.map((storedLabel, index) => {
                    const label = filteredOrderLabel(locale, index);
                    return (
                    <TouchableOpacity
                        key={storedLabel}
                        style={[styles.orderChip, filterOrder === index && styles.orderChipActive]}
                        onPress={() => setFilterOrder(index)}
                    >
                        <Text style={[styles.orderChipText, filterOrder === index && styles.orderChipTextActive]}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                );})}
            </View>

            <Text style={styles.fieldLabel}>{l('İkinci filtre (isteğe bağlı)', 'Second filter (optional)')}</Text>
            <View style={styles.inlineRow}>
                <TextInput
                    style={[styles.modalInput, styles.inlineInput]}
                    value={filterSearch2}
                    onChangeText={setFilterSearch2}
                    placeholder={l('İkinci arama (boş = kapalı)', 'Second search (blank = off)')}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                />
                <TextInput
                    style={[styles.modalInput, { width: 76 }]}
                    value={filterLimit2}
                    onChangeText={setFilterLimit2}
                    keyboardType="number-pad"
                    placeholder={l('Limit', 'Limit')}
                    placeholderTextColor={colors.textMuted}
                />
            </View>

            <TouchableOpacity style={styles.rescheduleRow} onPress={() => setFilterReschedule((prev) => !prev)}>
                <Text style={styles.menuItemText}>
                    {filterReschedule ? '☑' : '☐'}  {l('Yanıtlara göre yeniden zamanla', 'Reschedule cards based on answers')}
                </Text>
            </TouchableOpacity>
            {!filterReschedule && (
                <Text style={styles.modalHint}>
                    {l('Kapalı: önizleme modu — yanıtlar kartların zamanlamasını değiştirmez.', 'Off: preview mode — answers do not change card scheduling.')}
                </Text>
            )}

            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                {!isCreating && (
                    <TouchableOpacity
                        style={styles.modalBtnSecondary}
                        onPress={() => handleRebuildFilter(deck)}
                    >
                        <Text style={styles.modalBtnSecondaryText}>↻ {l('Yeniden Oluştur', 'Rebuild')}</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.modalBtnPrimary, isCreating && createDisabled && styles.buttonDisabled]}
                    onPress={isCreating ? handleCreateFilteredDeck : handleSaveFilterOptions}
                    disabled={isCreating && createDisabled}
                >
                    <Text style={styles.modalBtnPrimaryText}>
                        {isCreating ? l('Oluştur', 'Create') : t('common.save')}
                    </Text>
                </TouchableOpacity>
            </View>
            </ScrollView>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>{t('tabs.decks')}</Text>
                    <Text style={styles.headerSubtitle}>
                        {l(`${todaySummary.new + todaySummary.learn + todaySummary.review} kart bugün hazır`, `${todaySummary.new + todaySummary.learn + todaySummary.review} cards ready today`)}
                    </Text>
                </View>
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
                            <Text style={styles.overflowLabel}>{l('Boş Kartlar', 'Empty Cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/import')}
                        >
                            <Text style={styles.overflowIcon}>📥</Text>
                            <Text style={styles.overflowLabel}>{t('root.import')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/export')}
                        >
                            <Text style={styles.overflowIcon}>📤</Text>
                            <Text style={styles.overflowLabel}>{l('Dışa Aktar', 'Export')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={handleCreateBackup}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedek oluştur', 'Create backup')}
                        >
                            <Text style={styles.overflowIcon}>🗄️</Text>
                            <Text style={styles.overflowLabel}>{l('Yedek Oluştur', 'Create Backup')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/backups')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedekten geri yükle', 'Restore from backup')}
                        >
                            <Text style={styles.overflowIcon}>↩️</Text>
                            <Text style={styles.overflowLabel}>{l('Yedekten Geri Yükle', 'Restore from Backup')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddDeck} transparent animationType="slide" onRequestClose={() => setShowAddDeck(false)}>
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, isCompact && styles.modalOverlayCompact, isCompact && compactSheetTopInset]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <TouchableOpacity
                        style={styles.modalBackdropHit}
                        activeOpacity={1}
                        onPress={() => setShowAddDeck(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yeni deste penceresini kapat', 'Close new deck dialog')}
                    />
                    <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.modalEyebrow}>{l('YENİ DESTE', 'NEW DECK')}</Text>
                        <Text style={styles.modalTitle}>{l('Çalışma alanınızı oluşturun', 'Create your study space')}</Text>
                        <Text style={styles.modalHint}>
                            {isCompact
                                ? l('Alt deste yapmak için ⠿ tutamacından sürükleyip desteyi üst destesinin üzerine bırakın.', 'To make a subdeck, drag it by the ⠿ handle and drop it onto its parent.')
                                : l('Alt deste için iki nokta kullanın: TUS::Dahiliye::Kardiyoloji', 'Use two colons for subdecks: TUS::Internal Medicine::Cardiology')}
                        </Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder={l('Deste adı', 'Deck name')}
                        placeholderTextColor={colors.textMuted}
                        value={newDeckName}
                        onChangeText={setNewDeckName}
                        onSubmitEditing={handleAddDeck}
                        autoFocus
                        returnKeyType="done"
                    />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowAddDeck(false)}>
                                <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtnPrimary, !newDeckName.trim() && styles.buttonDisabled]}
                                onPress={handleAddDeck}
                                disabled={!newDeckName.trim()}
                            >
                                <Text style={styles.modalBtnPrimaryText}>{l('Desteyi Oluştur', 'Create Deck')}</Text>
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
                            ↑ {l('Ana seviyeye bırak', 'Drop at top level')}
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
                                onPress={openCreateFilteredDeck}
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
                        {l(`“${getDeckDisplayName(draggingDeck)}” taşınıyor`, `Moving “${getDeckDisplayName(draggingDeck)}”`)}
                    </Text>
                </View>
            )}

            <Modal
                visible={modal !== null}
                transparent
                animationType={modal?.kind === 'menu' ? 'fade' : isCompact ? 'slide' : 'fade'}
                onRequestClose={() => setModal(null)}
                onDismiss={handleDeckModalDismiss}
            >
                <KeyboardAvoidingView
                    style={[
                        styles.modalOverlay,
                        isCompact && modal?.kind !== 'menu' && styles.modalOverlayCompact,
                        isCompact && modal?.kind !== 'menu' && compactSheetTopInset,
                    ]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {modal !== null && (
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
                    {modal?.kind === 'move' && renderMoveModal(modal.deck)}
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
    headerSubtitle: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
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
    deckNestedBranch: { position: 'relative' },
    deckNestedBranchLast: {},
    deckChildrenWell: {
        marginLeft: 18,
        marginRight: 0,
        marginBottom: 4,
        paddingLeft: 6,
        backgroundColor: colors.bgCard,
        borderLeftWidth: 2,
        borderLeftColor: colors.borderLight,
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
    deckDropLine: {
        position: 'absolute',
        left: 8,
        right: 8,
        height: 3,
        zIndex: 5,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.accent,
    },
    deckDropLineBefore: { top: -2 },
    deckDropLineAfter: { bottom: -2 },
    expandBtn: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    expandIconCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentLight,
    },
    expandArrow: {
        fontSize: 22,
        lineHeight: 22,
        fontWeight: '600',
        color: colors.accent,
        transform: [{ rotate: '0deg' }],
    },
    expandArrowExpanded: { transform: [{ rotate: '90deg' }] },
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
        padding: Spacing.xl,
    },
    modalCardScrollable: { padding: 0 },
    modalCardScrollContent: { padding: Spacing.xl, paddingBottom: Spacing.xxl },
    sheetHandle: {
        width: 40,
        height: 4,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.border,
        alignSelf: 'center',
        marginBottom: Spacing.lg,
    },
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
    subdeckPathPreview: {
        fontSize: FontSize.sm,
        lineHeight: 19,
        color: colors.accent,
        fontWeight: '600',
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

    menuItem: {
        minHeight: 48,
        paddingVertical: 13,
        justifyContent: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    menuItemText: { fontSize: FontSize.md, color: colors.textPrimary },
    menuItemDanger: { color: colors.btnAgain },
    moveList: { maxHeight: 320 },
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
