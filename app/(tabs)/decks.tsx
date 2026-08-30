// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename, move,
// options/limits, custom study, delete) and drag-and-drop nesting via the row handle.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
    View,
    ScrollView,
    SafeAreaView,
    Modal,
    PanResponder,
    Animated,
    LayoutAnimation,
    UIManager,
    Platform,
    Keyboard,
    KeyboardAvoidingView,
    Switch,
    useWindowDimensions,
} from 'react-native';
import { Text, TextInput } from '../../components/Typography';
import { TouchableOpacity } from '../../components/Touchable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, Spacing } from '../../constants/theme';
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
import { getDeckDisplayName, getParentDeckName, type Deck } from '../../lib/models';
import { alert, confirm } from '../../lib/confirm';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount, getStudyQueue } from '../../lib/studyRepository';
import { createBackupNow } from '../../lib/backup';
import { useApp } from './_layout';
import { useI18n } from '../../hooks/useI18n';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';
import { hapticError, hapticMedium, hapticSelection, hapticSuccess } from '../../lib/haptics';
import { filteredOrderLabel } from '../../lib/i18n';
import DisclosureChevron from '../../components/DisclosureChevron';
import { createStyles } from '../../components/decks/decks.styles';
import {
    parseCount,
    ROOT_DROP_TARGET,
    FILTER_ORDER_UI,
    decodeDeckDropTarget,
    encodeDeckDropTarget,
    DECK_HOVER_EXPAND_DELAY_MS,
    getPersistedExpandedDeckNames,
    remapExpandedDeckPaths,
    type DeckDropPlacement,
} from '../../lib/decksScreen';

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
    const { settings, dataVersion, bumpDataVersion, activeDeckName, catalogAccess } = useApp();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(getPersistedExpandedDeckNames);
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const handledCreateDeckTokenRef = useRef<string | null>(null);
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
    const [filterOrder2, setFilterOrder2] = useState(0);
    const [filterSecondEnabled, setFilterSecondEnabled] = useState(false);
    const [filterReschedule, setFilterReschedule] = useState(true);
    const [filterAllowEmpty, setFilterAllowEmpty] = useState(false);
    const [filterHelpVisible, setFilterHelpVisible] = useState(false);
    const [filterOrderPicker, setFilterOrderPicker] = useState<1 | 2 | null>(null);

    const createDeckToken = typeof params.create === 'string' ? params.create : null;
    useEffect(() => {
        if (!createDeckToken || handledCreateDeckTokenRef.current === createDeckToken) return;
        handledCreateDeckTokenRef.current = createDeckToken;
        setShowAddMenu(false);
        setShowAddDeck(true);
        router.setParams({ create: undefined } as any);
    }, [createDeckToken, router]);

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
        // "Hareketi Azalt" asks apps to drop non-essential motion: the rows still appear and
        // disappear, they just do it without the expand/collapse slide.
        if (isReduceMotionEnabled()) return;
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

        setFilterSearch(sourceDeckSearch);
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
                hapticSuccess();
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
                    `iOS uygulamaların Ana Ekran'a otomatik kısayol eklemesine izin vermiyor. “${deck.name}” destesini doğrudan açan bağlantı panoya kopyalandı.`,
                    `iOS does not allow apps to add Home Screen shortcuts automatically. A link that opens “${deck.name}” directly was copied to the clipboard.`,
                )
                : l(
                    `“${deck.name}” destesini doğrudan açan kısayol bağlantısı panoya kopyalandı.`,
                    `A shortcut link that opens “${deck.name}” directly was copied to the clipboard.`,
                );
            const title = Platform.OS === 'ios'
                ? l('Bağlantı Kopyalandı', 'Link Copied')
                : l('Kısayol Hazır', 'Shortcut Ready');
            setTimeout(() => alert(title, message), Platform.OS === 'ios' ? 300 : 0);
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
        setNewFilteredDeckName(deck.name);
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
            hapticSelection();
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
            hapticMedium();
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
                    hapticSuccess();
                }
            } catch (e) {
                console.warn('[Decks] drag reorder failed:', e);
                if (Platform.OS !== 'web') {
                    hapticError();
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
                hapticSuccess();
            }
        } catch (e) {
            console.warn('[Decks] drag move failed:', e);
            if (Platform.OS !== 'web') {
                hapticError();
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
        const rowDropFeedback = rowDropTarget ? dragDropFeedback : null;
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
                    showsVerticalScrollIndicator
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

                    <MenuAction
                        label={Platform.OS === 'ios' ? l('Deste bağlantısını kopyala', 'Copy deck link') : l('Kısayol oluştur', 'Create shortcut')}
                        onPress={() => { void handleCreateShortcut(deck); }}
                    />
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
            showsVerticalScrollIndicator
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
        const buildDisabled = !newFilteredDeckName.trim()
            || !filterSearch.trim()
            || (filterSecondEnabled && !filterSearch2.trim());
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
                    `Bu sorguyla ${matchCount} uygun kart bulundu.\n\n${search || '—'}\n\nÖrnekler: is:due, deck:"Deste", tag:etiket, rated:7:1`,
                    `${matchCount} eligible cards matched this query.\n\n${search || '—'}\n\nExamples: is:due, deck:"Deck", tag:tag, rated:7:1`,
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
                        {isCreating ? newFilteredDeckName : getDeckDisplayName(deck.name)}
                    </Text>
                    <TouchableOpacity
                        style={[styles.filteredBuildButton, buildDisabled && styles.filteredBuildButtonDisabled]}
                        onPress={isCreating ? handleCreateFilteredDeck : handleSaveFilterOptions}
                        disabled={buildDisabled}
                        accessibilityRole="button"
                    >
                        <Text style={styles.filteredBuildButtonText}>
                            {isCreating ? l('Oluştur', 'Build') : l('Yeniden Oluştur', 'Rebuild')}
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
                    showsVerticalScrollIndicator
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
                                showsVerticalScrollIndicator
                                bounces={false}
                            >
                                <Text style={styles.filteredHelpBody}>
                                    {l(
                                        '• Arama, hangi kartların geçici çalışma destesine alınacağını belirler.\n\n• Limit ve sıralama, eşleşen kartlardan hangilerinin önce seçileceğini belirler.\n\n• İkinci filtreyle farklı arama, limit ve sıralamaya sahip iki kart grubunu birleştirebilirsiniz.\n\n• Yeniden zamanlama açıksa yanıtlar kart programını değiştirir; kapalıysa deste önizleme gibi çalışır.\n\n• Askıdaki, gömülü veya başka filtrelenmiş destedeki kartlar alınmaz. Kartlar çalışma bitince ana destelerinde kalır.',
                                        '• Search decides which cards enter the temporary study deck.\n\n• Limit and order decide which matching cards are selected first.\n\n• A second filter combines two groups with separate searches, limits, and orders.\n\n• With rescheduling on, answers change scheduling; with it off, the deck acts as a preview.\n\n• Suspended, buried, or already-filtered cards are excluded. Cards remain linked to their home decks.',
                                    )}
                                </Text>
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
                        <View style={styles.filteredOrderMenu}>
                            <ScrollView showsVerticalScrollIndicator>
                                {FILTER_ORDER_UI.map((order) => (
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
                    <TouchableOpacity
                        style={styles.catalogButton}
                        onPress={() => router.push('/catalog' as any)}
                        accessibilityRole="button"
                        accessibilityLabel={l('BKA TUS Complete paketini görüntüle', 'View the BKA TUS Complete package')}
                    >
                        <Text style={styles.catalogButtonIcon}>{catalogAccess.hasAccess ? '◆' : '◇'}</Text>
                        <Text style={styles.catalogButtonText}>{catalogAccess.hasAccess ? l('Tam Paket', 'Full') : l('Deneme', 'Trial')}</Text>
                    </TouchableOpacity>
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

            <TouchableOpacity
                style={[styles.accessBanner, catalogAccess.hasAccess && styles.accessBannerFull]}
                onPress={() => router.push('/catalog' as any)}
                accessibilityRole="button"
                accessibilityLabel={catalogAccess.hasAccess
                    ? l('Tam BKA kataloğu açık', 'Full BKA catalog unlocked')
                    : l('Ücretsiz deneme sürümü, tam paketi görüntüle', 'Free trial, view full package')}
            >
                <View style={styles.accessBannerIcon}><Text style={styles.accessBannerIconText}>{catalogAccess.hasAccess ? '✓' : '100'}</Text></View>
                <View style={styles.accessBannerCopy}>
                    <Text style={styles.accessBannerTitle}>
                        {catalogAccess.hasAccess ? l('Tam katalog açık', 'Full catalog unlocked') : l('Ücretsiz deneme sürümü', 'Free trial')}
                    </Text>
                    <Text style={styles.accessBannerText}>
                        {catalogAccess.hasAccess
                            ? l('9.583 kart ve tüm alt konu desteleri', '9,583 cards and all topic subdecks')
                            : l('Her dersten 100 kart · Toplam 1.200 kart', '100 cards per course · 1,200 cards total')}
                    </Text>
                </View>
                <Text style={styles.accessBannerArrow}>›</Text>
            </TouchableOpacity>

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
                    showsVerticalScrollIndicator
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
                        {dragDropFeedback?.title ?? l(`“${getDeckDisplayName(draggingDeck)}” taşınıyor`, `Moving “${getDeckDisplayName(draggingDeck)}”`)}
                    </Text>
                </View>
            )}

            <Modal
                visible={modal !== null}
                transparent
                animationType={isFilteredDeckModal ? 'slide' : modal?.kind === 'menu' ? 'fade' : isCompact ? 'slide' : 'fade'}
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
                        isCompact && modal?.kind !== 'menu' && !isFilteredDeckModal && styles.modalOverlayCompact,
                        isCompact && modal?.kind !== 'menu' && !isFilteredDeckModal && compactSheetTopInset,
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
