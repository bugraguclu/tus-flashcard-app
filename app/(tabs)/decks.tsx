// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename,
// options/limits, custom study, delete) and drag-and-drop nesting via the row handle or a held deck name.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
    View,
    ScrollView,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Modal,
    PanResponder,
    Animated,
    LayoutAnimation,
    UIManager,
    Platform,
    KeyboardAvoidingView,
    Switch,
    ActivityIndicator,
    InteractionManager,
    useWindowDimensions,
} from 'react-native';
import { Text, TextInput } from '../../components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { exitDuration, MotionSpring, NATIVE_DRIVER } from '../../constants/motion';
import {
    getAllDecks,
    getDeckByName,
    getAvailableDeckSubtreeName,
    getDeck,
    createDeck,
    deleteDeck,
    renameDeck,
    moveDeckUnder,
    rebuildFilteredDeck,
    setDeckCollapsed,
    initializeDeckDisclosureDefaults,
    setDeckDescription,
    emptyFilteredDeck,
    reorderDeckRelative,
    type DeckTreeNode,
    getBuriedCountForDeck,
    getBuriedKindsForDeck,
    unburyDeck,
} from '../../lib/deckManager';
import { getDeckDisplayName, getParentDeckName, type Deck } from '../../lib/models';
import { alert, confirm, choose } from '../../lib/confirm';
import { chooseUnburyKind } from '../../lib/unburyChoice';
import { deckRowMenuActions, type DeckRowMenuAction } from '../../lib/deckRowMenu';
import {
    useAppSettings,
    useCatalogStatus,
    useCollectionInvalidation,
    useStudyScope,
} from '../../contexts/AppContext';
import { useI18n } from '../../hooks/useI18n';
import { formatCount } from '../../lib/i18n';
import { normalizeDeckLeafInput } from '../../lib/deckNavigation';
import { normalizeDeckName } from '../../lib/deckNames';
import { createBackupNow } from '../../lib/backup';
import CustomStudyModal from '../../components/CustomStudyModal';
import FilteredDeckOptionsModal from '../../components/FilteredDeckOptionsModal';
import DisclosureChevron from '../../components/DisclosureChevron';
import LockGlyph from '../../components/LockGlyph';
import CardsGlyph from '../../components/CardsGlyph';
import StatsGlyph from '../../components/StatsGlyph';
import GearGlyph from '../../components/GearGlyph';
import { StopwatchIcon } from '../../components/stopwatch/StopwatchIcons';
import DeckOverflowGlyph from '../../components/DeckOverflowGlyph';
import { DeckListCounts, DeckListColumnHeaders } from '../../components/decks/DeckListTable';
import DeckAddMenu, { DECK_ADD_MENU_LIST_INSET } from '../../components/decks/DeckAddMenu';
import DeckRowMenu from '../../components/decks/DeckRowMenu';
import DeckNameButton from '../../components/decks/DeckNameButton';
import { createDeckDragCell, type DeckRowLayouts } from '../../components/decks/DeckDragCell';
import BottomSheetModal from '../../components/BottomSheetModal';
import { isCatalogDeck } from '../../lib/catalogProtection';
import { BKA_MANIFEST } from '../../lib/bkaManifest';
import {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_PACK,
    getBkaCatalogTier,
} from '../../lib/bkaCatalog';
import { requestDeckShortcut } from '../../modules/deck-shortcuts';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import { DATA_EXPORT_ROUTE, DATA_IMPORT_ROUTE } from '../../lib/dataManagementRoutes';
import { getDeckListSnapshot } from '../../lib/deckListSnapshot';
import {
    DEFAULT_DECK_ID,
    dismissFirstRunCard,
    isFirstRunCardDismissed,
    shouldShowFirstRunCard,
} from '../../lib/deckListFirstRun';
import DeckListWelcome from '../../components/decks/DeckListWelcome';
import {
    buildVisibleDeckRows,
    toggleDeckBranchRows,
    type DeckListRowModel,
} from '../../lib/deckListRows';
import {
    decodeDeckDropTarget,
    resolveDeckDropTarget,
    ROOT_DROP_TARGET,
    type DeckDropRow,
} from '../../lib/deckDropTarget';

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
    | null;

function parseCount(text: string, fallback: number = 0): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

// A deliberate spring-open delay prevents a parent from expanding while the pointer merely
// passes over it. 800 ms sits in the familiar 0.6–1.0 s range used by tree/list drag UIs.
const DECK_HOVER_EXPAND_DELAY_MS = 800;

// Expanding or collapsing a deck moves the rows under it this long.
const DECK_TREE_LAYOUT_MS = 190;

// Four labels share the bottom bar, like a tab bar's: one line each, growing less than content,
// and on iPhone shrinking to fit rather than breaking a word on the smallest phones.
const BOTTOM_LABEL_FIT = { numberOfLines: 1, maxFontSizeMultiplier: 1.15, adjustsFontSizeToFit: true, minimumFontScale: 0.8 } as const;

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

const VirtualizedDeckRow = React.memo(function VirtualizedDeckRow({
    row,
    renderRow,
}: {
    row: DeckListRowModel;
    renderRow: (node: DeckTreeNode, isExpanded: boolean) => React.ReactElement;
}) {
    return (
        <View>
            {renderRow(row.node, row.isExpanded)}
        </View>
    );
});

export default function DecksScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    // Bottom-sheet modals fill most of the screen; a top inset keeps the tap-to-dismiss backdrop
    // reachable below the status bar/notch instead of hiding under it.
    const compactSheetTopInset = { paddingTop: insets.top + Spacing.md };
    const isDesktopWeb = Platform.OS === 'web' && !isCompact;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings } = useAppSettings();
    const { collectionVersion, invalidateCollection } = useCollectionInvalidation();
    const { activeDeckName } = useStudyScope();
    const { catalogInstalled, catalogInstalling } = useCatalogStatus();
    const expandedDecksRef = useRef<Set<string>>(new Set());
    const expandedInitializedRef = useRef(false);
    const deckTreeRef = useRef<DeckTreeNode[]>([]);
    const [visibleRows, setVisibleRows] = useState<DeckListRowModel[]>([]);
    const [snapshotLoading, setSnapshotLoading] = useState(true);
    // Unknown until the first snapshot, so the welcome card never flashes at a learner who has cards.
    const [ownCardCount, setOwnCardCount] = useState<number | null>(null);
    const [firstRunDismissed, setFirstRunDismissed] = useState(isFirstRunCardDismissed);
    const snapshotGenerationRef = useRef(0);
    const updateExpandedDecks = useCallback((update: (current: Set<string>) => Set<string>) => {
        expandedDecksRef.current = update(expandedDecksRef.current);
    }, []);
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [bottomBarHeight, setBottomBarHeight] = useState(66);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const pendingOverflowRouteRef = useRef<string | null>(null);
    const pendingOverflowActionRef = useRef<(() => void) | null>(null);
    const pendingDeckMenuActionRef = useRef<(() => void) | null>(null);
    const [newDeckName, setNewDeckName] = useState('');
    const [modal, setModal] = useState<ModalState>(null);
    // The deck a bottom sheet was opened for, kept after `modal` clears so the sheet can slide
    // away with its content still on it.
    const [customStudyDeck, setCustomStudyDeck] = useState<Deck | null>(null);
    const [descriptionDeck, setDescriptionDeck] = useState<Deck | null>(null);

    // Modal form fields (filled when the corresponding modal opens).
    const [renameText, setRenameText] = useState('');
    const [newSubdeckName, setNewSubdeckName] = useState('');
    const [descriptionText, setDescriptionText] = useState('');
    const [descriptionMarkdown, setDescriptionMarkdown] = useState(false);
    // Filtered deck form: Create Filtered Deck (no deck) or a filtered deck's options. The deck
    // stays while the form slides away, so closing never flips it to the other mode.
    const [filteredDeckFormDeck, setFilteredDeckFormDeck] = useState<Deck | null>(null);
    const [filteredDeckFormVisible, setFilteredDeckFormVisible] = useState(false);
    const catalogTier = useMemo(
        () => getBkaCatalogTier(),
        [catalogInstalled, collectionVersion],
    );
    const countSettings = useMemo(() => ({
        dayRolloverHour: settings.dayRolloverHour,
        learnAheadMinutes: settings.learnAheadMinutes,
        limitsStartFromTop: settings.limitsStartFromTop,
    }), [settings.dayRolloverHour, settings.learnAheadMinutes, settings.limitsStartFromTop]);

    // Tabs remain mounted while studying. Build the repository snapshot only while this tab is
    // focused, after the native transition has yielded its first frame.
    useFocusEffect(useCallback(() => {
        let active = true;
        const generation = ++snapshotGenerationRef.current;
        setSnapshotLoading(true);
        const task = InteractionManager.runAfterInteractions(() => {
            if (!active || generation !== snapshotGenerationRef.current) return;
            try {
                if (!expandedInitializedRef.current) initializeDeckDisclosureDefaults();
                const snapshot = getDeckListSnapshot(countSettings);
                const nextExpanded = expandedInitializedRef.current
                    ? expandedDecksRef.current
                    : new Set(snapshot.decks.filter((deck) => !deck.collapsed).map((deck) => deck.name));
                expandedInitializedRef.current = true;
                expandedDecksRef.current = nextExpanded;
                deckTreeRef.current = snapshot.tree;
                setVisibleRows(buildVisibleDeckRows(snapshot.tree, nextExpanded));
                setOwnCardCount(snapshot.ownCardCount);
            } catch (error) {
                console.warn('[Decks] deck-list snapshot failed:', error);
            } finally {
                if (active && generation === snapshotGenerationRef.current) setSnapshotLoading(false);
            }
        });
        return () => {
            active = false;
            task.cancel();
        };
    }, [collectionVersion, countSettings]));

    // Drag-and-drop state: cells report their content-space layout under the deck id, which
    // survives a rename; the active drag tracks the pointer against those rows to pick a target.
    const rowLayouts = useRef<DeckRowLayouts>(new Map());
    // Built once: a new cell component type would remount every row of the list.
    const [DeckDragCell] = useState(() => createDeckDragCell(rowLayouts.current));
    const scrollOffsetRef = useRef(0);
    const listTopRef = useRef(0);
    const listHeightRef = useRef(0);
    const listContentHeightRef = useRef(0);
    const listWrapRef = useRef<View>(null);
    const deckScrollRef = useRef<FlatList<DeckListRowModel>>(null);
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

    // Rows already on screen slide to their new places (ease in and out); subdecks that appear fade
    // in easing out, and those that go leave a fifth faster, so a collapse never holds the list up.
    const animateDeckTreeLayout = useCallback(() => {
        LayoutAnimation.configureNext({
            duration: DECK_TREE_LAYOUT_MS,
            update: { type: LayoutAnimation.Types.easeInEaseOut },
            create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
            delete: {
                type: LayoutAnimation.Types.easeOut,
                property: LayoutAnimation.Properties.opacity,
                duration: exitDuration(DECK_TREE_LAYOUT_MS),
            },
        });
    }, []);

    // The context learns the install state one effect after this screen first renders, which would
    // flash the locked row at a learner who already owns the pack; the collection itself is the
    // authority on the first frame.
    const fullCatalogPresent = catalogTier === 'full';
    const showWelcome = ownCardCount !== null && shouldShowFirstRunCard(ownCardCount, firstRunDismissed);

    const visibleRowsRef = useRef<DeckTreeNode[]>([]);
    visibleRowsRef.current = visibleRows.map((row) => row.node);
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
        invalidateCollection();
    }, [invalidateCollection]);

    const toggleExpand = useCallback((deck: Deck) => {
        animateDeckTreeLayout();
        updateExpandedDecks((prev) => {
            const next = new Set(prev);
            const willCollapse = next.has(deck.name);
            if (willCollapse) next.delete(deck.name);
            else next.add(deck.name);
            setVisibleRows((rows) => toggleDeckBranchRows(rows, deckTreeRef.current, deck.name, next));
            setDeckCollapsed(deck.id, willCollapse);
            return next;
        });
    }, [animateDeckTreeLayout, updateExpandedDecks]);

    // AnkiMobile: tapping a deck switches straight to study mode. The overview (description,
    // unbury, Study Now) stays one step away in the deck's ••• menu.
    const handleStudyDeck = useCallback((deckName: string) => {
        router.push({ pathname: '/', params: { deck: deckName } } as any);
    }, [router]);

    const handleOpenOverview = useCallback((deckName: string) => {
        router.push(`/deck-overview?deck=${encodeURIComponent(deckName)}` as any);
    }, [router]);

    const handleAddDeck = () => {
        const name = newDeckName.trim();
        if (!name) return;
        // A `::` path may not reach under a catalog deck, which takes no decks of the learner's own.
        for (let parent = getParentDeckName(normalizeDeckName(name)); parent; parent = getParentDeckName(parent)) {
            const ancestor = getDeckByName(parent);
            if (ancestor && isCatalogDeck(ancestor)) {
                alert(l('Korumalı Deste', 'Protected Deck'), l('Dahili TUS destelerine alt deste eklenemez.', 'Cannot add subdecks to built-in TUS decks.'));
                return;
            }
        }

        try {
            createDeck(name);
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

    // Anki's File > Create Backup writes a snapshot straight away and says so; naming one is
    // still available on the Backups screen.
    const handleCreateBackup = () => {
        runAfterOverflowClose(() => {
            void (async () => {
                try {
                    await createBackupNow();
                    const manageBackups = await choose(
                        l('Yedek oluşturuldu', 'Backup created'),
                        l('Güncel veriler yerel bir yedek olarak kaydedildi.', 'Current data was saved as a local backup.'),
                        l('Yedeklerimi yönet', 'Manage my backups'),
                        t('common.close'),
                        { stacked: true },
                    );
                    if (manageBackups) router.push('/backups');
                } catch (e) {
                    console.warn('[Decks] create backup failed:', e);
                    alert(t('common.error'), l('Yedek oluşturulamadı.', 'Could not create a backup.'));
                }
            })();
        });
    };

    // Run an action once the deck menu has closed. UIKit rejects pushing a screen or presenting
    // another modal while the menu Modal is still mounted, so iOS waits for its onDismiss.
    const runAfterDeckModalClose = (action: () => void) => {
        if (Platform.OS === 'ios') {
            pendingDeckMenuActionRef.current = action;
            setModal(null);
            return;
        }
        setModal(null);
        action();
    };

    const openDeckMenuRoute = (path: string) => runAfterDeckModalClose(() => router.push(path as any));

    const handleDeckModalDismiss = () => {
        const action = pendingDeckMenuActionRef.current;
        pendingDeckMenuActionRef.current = null;
        action?.();
    };

    const openCreateDeck = () => {
        setShowAddMenu(false);
        setNewDeckName('');
        setShowAddDeck(true);
    };

    // Anki's "Add" toolbar action: open the note editor targeting the current deck. Passing no
    // deckId lets the editor resolve the last-opened deck (activeDeckName), matching Anki's habit
    // of adding to the deck you last studied.
    const openAddCard = useCallback(() => {
        setShowAddMenu(false);
        router.push('/editor' as any);
    }, [router]);

    const openCreateFilteredDeck = () => {
        setShowAddMenu(false);
        setFilteredDeckFormDeck(null);
        setFilteredDeckFormVisible(true);
    };

    const dismissWelcome = useCallback(() => {
        animateDeckTreeLayout();
        dismissFirstRunCard();
        setFirstRunDismissed(true);
    }, [animateDeckTreeLayout]);

    // ---- Gear menu actions ----

    const openMenu = useCallback((deck: Deck) => setModal({ kind: 'menu', deck }), []);
    const deckMenuActions = useMemo(() => {
        if (modal?.kind !== 'menu') return [];
        let buriedCount = 0;
        try {
            buriedCount = getBuriedCountForDeck(modal.deck.id);
        } catch (e) {
            // A failed count only leaves Unbury out; the overview still offers it.
            console.warn('[Decks] buried count failed:', e);
        }
        return deckRowMenuActions({ isFiltered: Boolean(modal.deck.isFiltered), isCatalog: isCatalogDeck(modal.deck), buriedCount });
    }, [modal]);

    const openRename = (deck: Deck) => {
        if (isCatalogDeck(deck)) {
            alert(l('Korumalı Deste', 'Protected Deck'), l('Dahili TUS desteleri yeniden adlandırılamaz.', 'Built-in TUS decks cannot be renamed.'));
            return;
        }
        // Anki's Rename prompt starts from the full path, so editing a `::` level moves the deck.
        setRenameText(deck.name);
        setModal({ kind: 'rename', deck });
    };

    const openCreateSubdeck = (deck: Deck) => {
        if (isCatalogDeck(deck)) {
            alert(l('Korumalı Deste', 'Protected Deck'), l('Dahili TUS destelerine alt deste eklenemez.', 'Cannot add subdecks to built-in TUS decks.'));
            return;
        }
        setNewSubdeckName('');
        setModal({ kind: 'create-subdeck', deck });
    };

    const handleCreateSubdeck = () => {
        if (modal?.kind !== 'create-subdeck') return;
        if (!normalizeDeckLeafInput(newSubdeckName)) {
            alert(t('common.error'), l('Alt deste adı boş olamaz.', 'The subdeck name cannot be empty.'));
            return;
        }

        // `::` nests further, as in the top-level Add. An existing name selects that deck, and a
        // new deck starts on the default preset, as in Anki.
        const fullName = `${modal.deck.name}::${newSubdeckName.trim()}`;

        try {
            createDeck(fullName);
            setDeckCollapsed(modal.deck.id, false);
            updateExpandedDecks((prev) => {
                const next = new Set(prev);
                next.add(modal.deck.name);
                return next;
            });
            setModal(null);
            refresh();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        } catch (e) {
            console.warn('[Decks] create subdeck failed:', e);
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('Alt deste oluşturulamadı. Lütfen tekrar deneyin.', 'Could not create the subdeck. Please try again.'),
            ));
        }
    };

    const openDescription = (deck: Deck) => {
        if (isCatalogDeck(deck)) {
            alert(l('Korumalı Deste', 'Protected Deck'), l('Dahili TUS destelerinin açıklaması düzenlenemez.', 'Description of built-in TUS decks cannot be edited.'));
            return;
        }
        setDescriptionText(deck.description ?? '');
        setDescriptionMarkdown(deck.descriptionMarkdown === true);
        setDescriptionDeck(deck);
        setModal({ kind: 'description', deck });
    };

    const handleSaveDescription = () => {
        if (modal?.kind !== 'description') return;
        try {
            setDeckDescription(modal.deck.id, descriptionText, descriptionMarkdown);
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
        setCustomStudyDeck(deck);
        setModal({ kind: 'custom', deck });
    };

    const openFilterOptions = (deck: Deck) => runAfterDeckModalClose(() => {
        setFilteredDeckFormDeck(deck);
        setFilteredDeckFormVisible(true);
    });

    const handleRebuildFilter = (deck: Deck) => {
        rebuildFilteredDeck(deck.id);
        setModal(null);
        refresh();
        alert(l('Deste yeniden oluşturuldu', 'Deck rebuilt'), l('Kartlar kayıtlı arama ve sıralama kurallarıyla yeniden toplandı.', 'Cards were gathered again using the saved search and sort rules.'));
    };

    /** Custom study variants (forgotten / ahead / preview): build the session and offer to study. */

    const handleRename = () => {
        if (modal?.kind !== 'rename') return;
        if (!normalizeDeckLeafInput(renameText)) return;
        // The field holds the full path, as Anki's Rename does. A name another deck already has
        // gets `+` appended until it is free (`ensure_deck_name_unique`).
        const typedName = normalizeDeckName(renameText);
        if (typedName === modal.deck.name) {
            setModal(null);
            return;
        }

        try {
            const nextName = getAvailableDeckSubtreeName(modal.deck.id, typedName);
            renameDeck(modal.deck.id, nextName);
            const renamedName = getDeck(modal.deck.id)?.name ?? nextName;
            updateExpandedDecks((prev) => remapExpandedDeckPaths(prev, modal.deck.name, renamedName));
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



    const handleDelete = (deck: Deck) => {
        confirm(
            l('Desteyi sil', 'Delete Deck'),
            deck.isFiltered
                ? l(`"${getDeckDisplayName(deck.name)}" silinecek; kartlar ait oldukları destelere dönecek.`, `"${getDeckDisplayName(deck.name)}" will be deleted; its cards will return to their original decks.`)
                : l(`"${getDeckDisplayName(deck.name)}" tüm alt desteleri ve içindeki kartlarla birlikte silinecek. Silme sonrasında geri alabilirsiniz.`, `"${getDeckDisplayName(deck.name)}" and all of its subdecks and cards will be deleted. You can undo after deletion.`),
            () => {
                try {
                    const deletion = deleteDeck(deck.id);
                    setModal(null);
                    refresh();
                    if (deletion) void choose(l('Deste silindi', 'Deck deleted'), l(`${deletion.cardCount} kart etkilendi.`, `${deletion.cardCount} cards affected.`), l('Geri al', 'Undo'), l('Bitti', 'Done')).then((undo) => {
                        if (!undo) return;
                        try { deletion.undo(); refresh(); }
                        catch (error) { alert(t('common.error'), userFacingErrorMessage(error, l('Silme geri alınamadı.', 'Could not undo deletion.'))); }
                    });
                } catch (e) {
                    console.warn('[Decks] delete failed:', e);
                    alert(t('common.error'), l('Deste silinemedi.', 'Could not delete the deck.'));
                }
            },
            { destructive: true },
        );
    };

    const requestDelete = (deck: Deck) => {
        if (isCatalogDeck(deck)) {
            alert(l('Korumalı Deste', 'Protected Deck'), l('Dahili TUS desteleri silinemez.', 'Built-in TUS decks cannot be deleted.'));
            return;
        }
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

    // AnkiDroid's deck menu offers Unbury while the deck holds buried cards and, like the overview,
    // asks which kind to wake when both manually buried cards and buried siblings are waiting.
    const requestUnburyDeck = (deck: Deck) => {
        setModal(null);
        setTimeout(() => {
            void (async () => {
                try {
                    const kind = await chooseUnburyKind(getBuriedKindsForDeck(deck.id), l);
                    const count = unburyDeck(deck.id, settings.dayRolloverHour, kind);
                    refresh();
                    alert(
                        l('Gömülü kartlar açıldı', 'Cards Unburied'),
                        l(`${count} kart yeniden çalışılabilir.`, `${count} ${count === 1 ? 'card is' : 'cards are'} available to study again.`),
                    );
                } catch (e) {
                    console.warn('[Decks] unbury failed:', e);
                    alert(t('common.error'), l('Gömülü kartlar açılamadı.', 'Could not unbury the cards.'));
                }
            })();
        }, Platform.OS === 'ios' ? 250 : 0);
    };

    const handleDeckMenuAction = (deck: Deck, action: DeckRowMenuAction) => {
        switch (action) {
            case 'overview': openDeckMenuRoute(`/deck-overview?deck=${encodeURIComponent(deck.name)}`); return;
            case 'add': openDeckMenuRoute(isCatalogDeck(deck) ? '/editor' : `/editor?deckId=${deck.id}`); return;
            case 'browse': openDeckMenuRoute(`/browser?deck=${encodeURIComponent(deck.name)}`); return;
            case 'rename': openRename(deck); return;
            case 'createSubdeck': openCreateSubdeck(deck); return;
            case 'options': openDeckMenuRoute(`/deck-options?deckId=${deck.id}`); return;
            case 'customStudy': openCustomStudy(deck); return;
            case 'export': openDeckMenuRoute(`/export?deck=${encodeURIComponent(deck.name)}`); return;
            case 'filterOptions': openFilterOptions(deck); return;
            case 'rebuild': handleRebuildFilter(deck); return;
            case 'empty': requestEmptyFilteredDeck(deck); return;
            case 'unbury': requestUnburyDeck(deck); return;
            case 'shortcut': void handleCreateShortcut(deck); return;
            case 'description': openDescription(deck); return;
            case 'delete': requestDelete(deck); return;
        }
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
        const candidates: DeckDropRow[] = [];
        for (const row of visibleRowsRef.current) {
            const layout = rowLayouts.current.get(row.deck.id);
            if (!layout) continue;
            const name = row.deck.name;
            const isLockedCatalogTarget = catalogTier === 'trial'
                && row.deck.catalogPack === BKA_CATALOG_PACK;
            candidates.push({
                name,
                y: layout.y,
                h: layout.h,
                invalid: name === dragged
                    || isDescendantOf(name, dragged)
                    || isLockedCatalogTarget
                    || isCatalogDeck(row.deck),
                acceptsInside: !row.deck.isFiltered,
            });
        }
        return resolveDeckDropTarget(contentY, candidates);
    };

    const updateDropTarget = (target: string | null) => {
        if (target === dropTargetRef.current) return;
        clearHoverExpandTimer();
        dropTargetRef.current = target;
        setDropTarget(target);

        if (target) {
            void Haptics.selectionAsync().catch(() => undefined);
        }

        const decoded = decodeDeckDropTarget(target);
        if (!decoded || decoded.kind !== 'deck' || decoded.placement !== 'inside') return;
        const targetRow = visibleRowsRef.current.find((row) => row.deck.name === decoded.name);
        if (!targetRow?.children.length || expandedDecksRef.current.has(decoded.name)) return;

        // Hovering over a collapsed parent opens it, so deeply nested destinations remain
        // reachable without cancelling the current drag.
        hoverExpandTimerRef.current = setTimeout(() => {
            hoverExpandTimerRef.current = null;
            if (!draggingRef.current || dropTargetRef.current !== target) return;
            animateDeckTreeLayout();
            updateExpandedDecks((prev) => {
                if (prev.has(decoded.name)) return prev;
                setDeckCollapsed(targetRow.deck.id, false);
                const next = new Set(prev).add(decoded.name);
                expandedDecksRef.current = next;
                setVisibleRows((rows) => toggleDeckBranchRows(
                    rows,
                    deckTreeRef.current,
                    decoded.name,
                    next,
                ));
                return next;
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
        deckScrollRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
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
        if (node.deck.isFiltered || isCatalogDeck(node.deck)) return;
        draggingRef.current = node.deck.name;
        dragPageYRef.current = pageY;
        dropTargetRef.current = null;
        setDraggingDeck(node.deck.name);
        setDropTarget(null);
        updateDragPreviewPosition(pageY);
        dragPreviewLift.stopAnimation();
        dragPreviewLift.setValue(0);
        // The picked-up deck rises to full size without overshooting it.
        Animated.spring(dragPreviewLift, {
            toValue: 1,
            ...MotionSpring.lift,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        }).start();
        setShowAddMenu(false);

        // Refresh screen-space geometry at gesture time. Safe-area changes, rotation and the
        // Simulator title bar can all make the value captured by the initial onLayout stale.
        listWrapRef.current?.measureInWindow((_x, y, _width, height) => {
            if (y > 0) listTopRef.current = y;
            if (height > 0) listHeightRef.current = height;
            updateDeckDrag(pageY);
        });
        updateDeckDrag(pageY);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
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
                updateExpandedDecks((prev) => remapExpandedDeckPaths(
                    prev,
                    dragged,
                    nextName,
                    getParentDeckName(nextName),
                ));
                refresh();
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            } catch (e) {
                console.warn('[Decks] drag reorder failed:', e);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
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
            updateExpandedDecks((prev) => remapExpandedDeckPaths(
                prev,
                dragged,
                nextName,
                targetParent,
            ));
            refresh();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        } catch (e) {
            console.warn('[Decks] drag move failed:', e);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
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

    const getDragResponder = useCallback((node: DeckTreeNode) => {
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
    }, []);

    // ---- Rendering ----

    const renderDeckRow = useCallback((node: DeckTreeNode, isExpanded: boolean) => {
        const deck = node.deck;
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
        const dragResponder = !deck.isFiltered && !isCatalogDeck(deck)
            ? getDragResponder(node)
            : null;
        const maxIndentDepth = isCompact ? 4 : 10;
        const visualDepth = Math.min(node.depth, maxIndentDepth);
        // FlatList rows are siblings, so retain the former nested hierarchy with bounded padding.
        // Keep the name usable on narrow phones even for deeply nested decks.
        const indentStep = isCompact ? Math.min(16, Math.max(4, (width - 300) / 4)) : 24;
        const contentIndent = 8 + visualDepth * indentStep;

        return (
            <View
                style={[
                    styles.deckRow,
                    { paddingLeft: contentIndent },
                    isDragging && styles.deckRowDragging,
                    isInsideDropTarget && styles.deckRowDropTarget,
                ]}
            >
                {rowDropFeedback && (isDropBefore || isDropAfter) && (
                    <View
                        style={[
                            styles.deckDropLabel,
                            isDropBefore ? styles.deckDropLabelBefore : styles.deckDropLabelAfter,
                            { pointerEvents: 'none' },
                        ]}
                    >
                        <Text style={styles.deckDropLabelText} numberOfLines={1}>
                            {rowDropFeedback.title}
                        </Text>
                    </View>
                )}
                {rowDropFeedback && isInsideDropTarget && (
                    <View style={[styles.deckInsideDropBadge, { pointerEvents: 'none' }]}>
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

                <View style={styles.deckMain}>
                    <DeckNameButton
                        style={styles.deckNameTouchable}
                        onPress={() => handleStudyDeck(deck.name)}
                        drag={dragResponder ? {
                            begin: (pageY) => dragHandlersRef.current?.begin(node, pageY),
                            move: (pageY) => dragHandlersRef.current?.move(pageY),
                            complete: () => dragHandlersRef.current?.complete(),
                            cancel: () => dragHandlersRef.current?.cancel(),
                        } : undefined}
                        accessibilityLabel={l(`${displayName} destesini çalış`, `Study ${displayName} deck`)}
                        accessibilityHint={dragResponder ? l('Taşımak için basılı tutup sürükleyin', 'Touch and hold, then drag to move') : undefined}
                        {...webTitle(l(`${displayName}: çalış`, `${displayName}: study`))}
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
                    </DeckNameButton>

                    <DeckListCounts
                        newCount={node.newCount}
                        learnCount={node.learnCount}
                        reviewCount={node.reviewCount}
                    />
                    {showWelcome && deck.id === DEFAULT_DECK_ID ? (
                        <Text style={styles.deckHint}>
                            {l('Deste seçmeden eklediğiniz kartlar buraya gelir.', 'Cards you add without choosing a deck go here.')}
                        </Text>
                    ) : null}
                </View>

                {dragResponder && (
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
                {!dragResponder && (
                    <View
                        style={[styles.dragHandle, styles.dragHandleDisabled]}
                        accessible
                        accessibilityLabel={deck.isFiltered
                            ? l('Filtrelenmiş desteler alt deste olarak taşınamaz', 'Filtered decks cannot be moved into the deck tree')
                            : l('Hazır paket desteleri taşınamaz', 'Ready-made pack decks cannot be moved')}
                    >
                        <Text style={styles.dragHandleText}>⠿</Text>
                    </View>
                )}

                <TouchableOpacity
                    style={styles.gearBtn}
                    onPress={() => openMenu(deck)}
                    accessibilityRole="button"
                    accessibilityLabel={l(`${displayName} deste menüsü`, `${displayName} deck menu`)}
                >
                    <Text style={styles.gearText}>•••</Text>
                </TouchableOpacity>
            </View>
        );
    }, [
        colors,
        decodedDropTarget,
        dragDropFeedback,
        draggingDeck,
        getDragResponder,
        handleStudyDeck,
        isCompact,
        l,
        openMenu,
        showWelcome,
        styles,
        toggleExpand,
        width,
    ]);

    /**
     * The optional catalog appears in the deck list exactly where a deck would, with its real
     * size and a clear free-unlock action instead of an ad banner above the tree.
     */
    const renderLockedCatalogCard = useCallback(() => (
        <TouchableOpacity
            style={styles.lockedDeckCard}
            onPress={() => router.push('/catalog' as any)}
            accessibilityRole="button"
            accessibilityLabel={l(
                `${BKA_CATALOG_DEFAULT_ROOT_DECK} hazır kart paketi, ${formatCount(BKA_MANIFEST.totals.cards, 'tr')} kart. Ücretsiz kurmak için dokunun.`,
                `${BKA_CATALOG_DEFAULT_ROOT_DECK} ready-made card pack, ${formatCount(BKA_MANIFEST.totals.cards, 'en')} cards. Tap to install it for free.`,
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
    ), [catalogInstalling, colors.accent, l, router, styles]);

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

    // A centred dialog on wide layouts; on iPhone the same fields sit in a bottom sheet.
    const renderDescriptionModal = (deck: Deck) => (
        <View style={styles.modalCard}>{renderDescriptionFields(deck)}</View>
    );

    const renderDescriptionFields = (deck: Deck) => (
        <>
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
                accessibilityLabel={l('Deste açıklaması', 'Deck description')}
            />
            <View style={styles.markdownToggleRow}>
                <View style={styles.markdownToggleCopy}>
                    <Text style={styles.markdownToggleTitle}>{l('Markdown olarak yorumla', 'Interpret as Markdown')}</Text>
                    <Text style={styles.markdownToggleSubtitle}>
                        {l(
                            'Metni Markdown olarak işler: başlıklar, kalın ve italik yazı, listeler ve bağlantılar biçimli görünür.',
                            'Treats the text as Markdown: headings, bold and italic text, lists and links are shown formatted.',
                        )}
                    </Text>
                </View>
                <Switch
                    value={descriptionMarkdown}
                    onValueChange={setDescriptionMarkdown}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.white}
                    accessibilityLabel={l('Markdown olarak yorumla', 'Interpret as Markdown')}
                />
            </View>
            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveDescription}>
                    <Text style={styles.modalBtnPrimaryText}>{t('common.save')}</Text>
                </TouchableOpacity>
            </View>
        </>
    );

    const renderVirtualizedRow = useCallback(({ item }: { item: DeckListRowModel }) => (
        <VirtualizedDeckRow
            row={item}
            renderRow={renderDeckRow}
        />
    ), [renderDeckRow]);
    const deckRowKey = useCallback((item: DeckListRowModel) => item.key, []);
    const deckListHeader = useMemo(() => (
        <>
            {fullCatalogPresent ? null : renderLockedCatalogCard()}
            {showWelcome ? (
                <DeckListWelcome
                    showCatalog={!fullCatalogPresent}
                    catalogCardCount={BKA_MANIFEST.totals.cards}
                    onOpenCatalog={() => router.push('/catalog' as any)}
                    onAddCard={openAddCard}
                    onImport={() => router.push(DATA_IMPORT_ROUTE as any)}
                    onDismiss={dismissWelcome}
                />
            ) : null}
        </>
    ), [dismissWelcome, fullCatalogPresent, openAddCard, renderLockedCatalogCard, router, showWelcome]);
    const deckListEmpty = useMemo(() => (
        <View style={styles.emptyState}>
            {snapshotLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
            ) : (
                <>
                    <Text style={styles.emptyStateIcon}>＋</Text>
                    <Text style={styles.emptyStateTitle}>{l('İlk destenizi oluşturun', 'Create your first deck')}</Text>
                    <Text style={styles.emptyStateText}>{l('Sağ alttaki ＋ ile bir deste oluşturun veya ⋮ › İçe aktar ile Anki’den bir deste getirin.', 'Create a deck with ＋ at the bottom right, or bring one in from Anki with ⋮ › Import.')}</Text>
                </>
            )}
        </View>
    ), [colors.accent, l, snapshotLoading, styles]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t('tabs.decks')}</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={refresh}
                        accessibilityRole="button"
                        accessibilityLabel={l('Desteleri yenile', 'Refresh decks')}
                    >
                        <Text style={styles.headerBtnText}>↻</Text>
                    </TouchableOpacity>
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
                            <View style={styles.overflowIcon}><DeckOverflowGlyph kind="emptyCards" color={colors.textSecondary} /></View>
                            <Text style={styles.overflowLabel}>{l('Boş kartlar', 'Empty Cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute(DATA_IMPORT_ROUTE)}
                        >
                            <View style={styles.overflowIcon}><DeckOverflowGlyph kind="import" color={colors.textSecondary} /></View>
                            <Text style={styles.overflowLabel}>{t('root.import')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute(DATA_EXPORT_ROUTE)}
                        >
                            <View style={styles.overflowIcon}><DeckOverflowGlyph kind="export" color={colors.textSecondary} /></View>
                            <Text style={styles.overflowLabel}>{l('Dışa aktar', 'Export')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={handleCreateBackup}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedek oluştur', 'Create backup')}
                        >
                            <View style={styles.overflowIcon}><DeckOverflowGlyph kind="backup" color={colors.textSecondary} /></View>
                            <Text style={styles.overflowLabel}>{l('Yedek oluştur', 'Create Backup')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => openOverflowRoute('/backups')}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yedekten geri yükle', 'Restore from backup')}
                        >
                            <View style={styles.overflowIcon}><DeckOverflowGlyph kind="restore" color={colors.textSecondary} /></View>
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

            <DeckListColumnHeaders />

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
                <FlatList
                    ref={deckScrollRef}
                    style={styles.deckList}
                    data={visibleRows}
                    renderItem={renderVirtualizedRow}
                    keyExtractor={deckRowKey}
                    CellRendererComponent={DeckDragCell}
                    ListHeaderComponent={deckListHeader}
                    ListEmptyComponent={deckListEmpty}
                    ListFooterComponent={<View style={{ height: DECK_ADD_MENU_LIST_INSET }} />}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!draggingDeck}
                    onScroll={(e) => {
                        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                    }}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_width, height) => {
                        listContentHeightRef.current = height;
                    }}
                    initialNumToRender={isCompact ? 12 : 20}
                    maxToRenderPerBatch={isCompact ? 10 : 16}
                    windowSize={7}
                    removeClippedSubviews={!draggingDeck}
                />

                {draggingDeck && getParentDeckName(draggingDeck) && (
                    <View
                        style={[
                            styles.rootDropZone,
                            dropTarget === ROOT_DROP_TARGET && styles.rootDropZoneActive,
                            { pointerEvents: 'none' },
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
                            { pointerEvents: 'none' },
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

            <DeckAddMenu
                bottom={insets.bottom + bottomBarHeight + Spacing.md}
                visible={showAddMenu}
                onOpen={() => setShowAddMenu(true)}
                onClose={() => setShowAddMenu(false)}
                onCreateFilteredDeck={() => openCreateFilteredDeck()}
                onCreateDeck={openCreateDeck}
                onAddCard={openAddCard}
            />

            <View style={styles.bottomBar} onLayout={(event) => setBottomBarHeight(event.nativeEvent.layout.height)}>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/browser' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kartlarımı aç', 'Open Browse')}
                >
                    <CardsGlyph color={colors.textSecondary} size={20} />
                    <Text style={styles.bottomBtnText} {...BOTTOM_LABEL_FIT}>{t('sidebar.myCards')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/stopwatch' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kronometreyi aç', 'Open stopwatch')}
                >
                    <StopwatchIcon color={colors.textSecondary} size={20} />
                    <Text style={styles.bottomBtnText} {...BOTTOM_LABEL_FIT}>{l('Kronometre', 'Stopwatch')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/stats' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('İstatistikleri aç', 'Open statistics')}
                >
                    <StatsGlyph color={colors.textSecondary} size={20} />
                    <Text style={styles.bottomBtnText} {...BOTTOM_LABEL_FIT}>{t('tabs.statistics')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/settings' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Ayarları aç', 'Open settings')}
                >
                    <GearGlyph color={colors.textSecondary} size={20} />
                    <Text style={styles.bottomBtnText} {...BOTTOM_LABEL_FIT}>{t('tabs.settings')}</Text>
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
                // Custom study, and the description on iPhone, bring their own bottom sheets, so
                // they stay out of this shared container.
                visible={modal !== null && modal.kind !== 'custom' && !(isCompact && modal.kind === 'description')}
                transparent
                animationType="fade"
                onRequestClose={() => setModal(null)}
                onDismiss={handleDeckModalDismiss}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
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
                    {modal?.kind === 'menu' && (
                        <DeckRowMenu
                            deckName={modal.deck.name}
                            actions={deckMenuActions}
                            onSelect={(action) => handleDeckMenuAction(modal.deck, action)}
                        />
                    )}
                    {modal?.kind === 'rename' && renderRenameModal(modal.deck)}
                    {modal?.kind === 'create-subdeck' && renderCreateSubdeckModal(modal.deck)}
                    {!isCompact && modal?.kind === 'description' && renderDescriptionModal(modal.deck)}
                </KeyboardAvoidingView>
            </Modal>

            {isCompact && descriptionDeck ? (
                <BottomSheetModal
                    visible={modal?.kind === 'description'}
                    onClose={() => setModal(null)}
                    avoidKeyboard
                    backdropLabel={l('Açık pencereyi kapat', 'Close open dialog')}
                    containerStyle={compactSheetTopInset}
                    sheetStyle={[styles.modalCard, styles.modalCardCompact]}
                >
                    {renderDescriptionFields(descriptionDeck)}
                </BottomSheetModal>
            ) : null}

            <FilteredDeckOptionsModal
                visible={filteredDeckFormVisible}
                deck={filteredDeckFormDeck}
                settings={settings}
                onClose={() => setFilteredDeckFormVisible(false)}
                onSaved={refresh}
                // A built deck opens on its overview.
                onCreated={(deckName) => {
                    refresh();
                    handleOpenOverview(deckName);
                }}
            />

            {customStudyDeck ? (
                <CustomStudyModal
                    visible={modal?.kind === 'custom'}
                    deck={customStudyDeck}
                    settings={settings}
                    onClose={() => setModal(null)}
                    onChanged={refresh}
                    // Anki makes the new session the current deck and shows its overview.
                    onSessionCreated={handleOpenOverview}
                />
            ) : null}
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
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerBtnText: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textSecondary },

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
        ...StyleSheet.absoluteFill,
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
    overflowIcon: { width: 22, alignItems: 'center' },
    overflowLabel: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '500' },

    listWrap: { flex: 1, position: 'relative' },
    deckList: { flex: 1 },
    deckRow: {
        position: 'relative',
        flexDirection: 'row',
        // Every control is 44 pt tall, so this is centring for a one-line row; when the counts
        // wrap under a long name, the chevron and buttons stay level with the name.
        alignItems: 'flex-start',
        paddingVertical: 10,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckNameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
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
    // The name and its counts share a wrapping line: a name that does not fit beside the
    // counts gets the whole width (a word is never broken) and the counts move under it.
    // The name must not shrink: Yoga would rather narrow it than wrap the counts, which breaks
    // words on iPhone; maxWidth keeps a name longer than the row inside it instead.
    deckMain: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    // Padding rather than margin: the browser adds a margin on top of maxWidth.
    deckNameTouchable: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%', paddingLeft: 2, minHeight: 44, justifyContent: 'center' },
    deckName: { flexShrink: 1, fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
    deckNameFiltered: { color: colors.badgeNew, fontStyle: 'italic' },
    // A line of its own under the name and counts: the wrapping row puts a full-width child below.
    deckHint: { width: '100%', paddingLeft: 2, paddingBottom: 2, fontSize: FontSize.sm, color: colors.textMuted },
    dragHandle: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        // A phone browser would otherwise claim the drag as a page scroll before the row moves.
        ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none' } as object) : null),
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
    bottomBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

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
    markdownToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        minHeight: 56,
        gap: Spacing.md,
    },
    markdownToggleCopy: {
        flex: 1,
        justifyContent: 'center',
    },
    markdownToggleTitle: {
        fontSize: FontSize.md,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    markdownToggleSubtitle: {
        fontSize: FontSize.xs,
        lineHeight: 16,
        color: colors.textMuted,
        marginTop: 2,
    },
    modalBackdropHit: { ...StyleSheet.absoluteFill },
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
    descriptionInput: { minHeight: 150, paddingTop: Spacing.md },
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
    modalBtnSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
    });
}
