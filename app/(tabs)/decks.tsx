// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename, move,
// options/limits, custom study, delete) and drag-and-drop nesting via the row handle.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
    Platform,
    KeyboardAvoidingView,
    useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import {
    getAllDecks,
    getCardCountsByDeck,
    buildDeckTree,
    flattenDeckTree,
    createDeck,
    deleteDeck,
    renameDeck,
    moveDeckUnder,
    addDeckTodayBoost,
    createOrReplaceCustomStudySession,
    updateFilteredDeck,
    rebuildFilteredDeck,
    setDeckCollapsed,
    type DeckTreeNode,
} from '../../lib/deckManager';
import { getDeckDisplayName, getParentDeckName, FILTERED_ORDERS, type Deck } from '../../lib/models';
import { alert, confirm } from '../../lib/confirm';
import { getStudyQueue } from '../../lib/studyRepository';
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
    | { kind: 'custom'; deck: Deck }
    | { kind: 'filter'; deck: Deck }
    | null;

function parseCount(text: string, fallback: number = 0): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export default function DecksScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const isDesktopWeb = Platform.OS === 'web' && !isCompact;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings, dataVersion, bumpDataVersion } = useApp();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(() => new Set(
        getAllDecks().filter((deck) => !deck.collapsed).map((deck) => deck.name),
    ));
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [showOverflowMenu, setShowOverflowMenu] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [refreshToken, setRefreshToken] = useState(0);
    const [modal, setModal] = useState<ModalState>(null);

    // Modal form fields (filled when the corresponding modal opens).
    const [renameText, setRenameText] = useState('');
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
    const scrollOffsetRef = useRef(0);
    const listTopRef = useRef(0);
    const listWrapRef = useRef<View>(null);
    const [draggingDeck, setDraggingDeck] = useState<string | null>(null);
    const draggingRef = useRef<string | null>(null);
    const dropTargetRef = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

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

    const refresh = useCallback(() => {
        setRefreshToken((value) => value + 1);
        bumpDataVersion();
    }, [bumpDataVersion]);

    const toggleExpand = (deck: Deck) => {
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
            createDeck(name);
            setNewDeckName('');
            setShowAddDeck(false);
            refresh();
        } catch (e) {
            console.warn('[Decks] createDeck failed:', e);
            alert(t('common.error'), l('Deste oluşturulamadı.', 'Could not create the deck.'));
        }
    };

    // ---- Gear menu actions ----

    const openMenu = (deck: Deck) => setModal({ kind: 'menu', deck });

    const openRename = (deck: Deck) => {
        setRenameText(getDeckDisplayName(deck.name));
        setModal({ kind: 'rename', deck });
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
        const leaf = renameText.trim();
        if (!leaf) return;

        try {
            const parent = getParentDeckName(modal.deck.name);
            renameDeck(modal.deck.id, parent ? `${parent}::${leaf}` : leaf);
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
            moveDeckUnder(modal.deck.id, targetName);
            if (targetName) {
                setExpandedDecks((prev) => new Set(prev).add(targetName));
            }
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

    // ---- Drag & drop ----

    const isDescendantOf = (name: string, ancestor: string) => name.startsWith(`${ancestor}::`);

    const findDropTarget = (contentY: number, dragged: string): string | null => {
        for (const row of visibleRows) {
            const layout = rowLayouts.current.get(row.deck.name);
            if (!layout) continue;
            if (contentY < layout.y || contentY > layout.y + layout.h) continue;
            const name = row.deck.name;
            if (name === dragged || isDescendantOf(name, dragged) || row.deck.isFiltered) return null;
            return name;
        }
        return null;
    };

    const makeDragResponder = (node: DeckTreeNode) => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
            draggingRef.current = node.deck.name;
            dropTargetRef.current = null;
            setDraggingDeck(node.deck.name);
            setDropTarget(null);
        },
        onPanResponderMove: (_evt, gesture) => {
            if (!draggingRef.current) return;
            const contentY = gesture.moveY - listTopRef.current + scrollOffsetRef.current;
            const target = findDropTarget(contentY, draggingRef.current);
            if (target !== dropTargetRef.current) {
                dropTargetRef.current = target;
                setDropTarget(target);
            }
        },
        onPanResponderRelease: () => {
            const dragged = draggingRef.current;
            const target = dropTargetRef.current;
            draggingRef.current = null;
            dropTargetRef.current = null;
            setDraggingDeck(null);
            setDropTarget(null);

            if (!dragged || !target) return;
            const deck = getAllDecks().find((entry) => entry.name === dragged);
            if (!deck) return;
            try {
                moveDeckUnder(deck.id, target);
                setExpandedDecks((prev) => new Set(prev).add(target));
                refresh();
            } catch (e) {
                console.warn('[Decks] drag move failed:', e);
                alert(t('common.error'), e instanceof Error ? e.message : l('Deste taşınamadı.', 'Could not move the deck.'));
            }
        },
        onPanResponderTerminate: () => {
            draggingRef.current = null;
            dropTargetRef.current = null;
            setDraggingDeck(null);
            setDropTarget(null);
        },
    });

    // ---- Rendering ----

    const renderDeckRow = (node: DeckTreeNode) => {
        const deck = node.deck;
        const isExpanded = expandedDecks.has(deck.name);
        const hasChildren = node.children.length > 0;
        const displayName = getDeckDisplayName(deck.name);
        const isDragging = draggingDeck === deck.name;
        const isDropTarget = dropTarget === deck.name;
        const dragResponder = isDesktopWeb ? makeDragResponder(node) : null;

        return (
            <View
                key={deck.id}
                onLayout={(e) => {
                    rowLayouts.current.set(deck.name, {
                        y: e.nativeEvent.layout.y,
                        h: e.nativeEvent.layout.height,
                    });
                }}
                style={[
                    styles.deckRow,
                    isCompact && styles.deckRowCompact,
                    { paddingLeft: (isCompact ? 4 : 8) + node.depth * (isCompact ? 14 : 22) },
                    isDragging && styles.deckRowDragging,
                    isDropTarget && styles.deckRowDropTarget,
                ]}
            >
                {hasChildren ? (
                    <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => toggleExpand(deck)}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? l('Alt desteleri gizle', 'Hide subdecks') : l('Alt desteleri göster', 'Show subdecks')}
                    >
                        <Text style={styles.expandArrow}>{isExpanded ? '▾' : '▸'}</Text>
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

                {isDesktopWeb && dragResponder && (
                    <View
                        style={styles.dragHandle}
                        {...dragResponder.panHandlers}
                        {...webTitle(l('Sürükleyip başka bir desteye bırakarak alt deste yapın', 'Drag onto another deck to make a subdeck'))}
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

    const renderMenuModal = (deck: Deck) => (
        <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalTitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setModal(null); handleStudy(deck.name); }}>
                <Text style={styles.menuItemText}>▶️  {t('common.study')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => openRename(deck)}>
                <Text style={styles.menuItemText}>✏️  {l('Yeniden Adlandır', 'Rename')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setModal({ kind: 'move', deck })}>
                <Text style={styles.menuItemText}>📁  {l('Taşı (alt deste yap)', 'Move (make subdeck)')}</Text>
            </TouchableOpacity>
            {!deck.isFiltered && (
                <>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => { setModal(null); router.push(`/deck-options?deckId=${deck.id}` as any); }}
                    >
                        <Text style={styles.menuItemText}>⚙️  {l('Seçenekler (günlük limitler)', 'Options (daily limits)')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => openCustomStudy(deck)}>
                        <Text style={styles.menuItemText}>🎯  {t('anki.customStudy')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => { setModal(null); router.push(`/export?deck=${encodeURIComponent(deck.name)}` as any); }}
                    >
                        <Text style={styles.menuItemText}>📤  {l('Dışa Aktar', 'Export')}</Text>
                    </TouchableOpacity>
                </>
            )}
            {deck.isFiltered && (
                <TouchableOpacity style={styles.menuItem} onPress={() => openFilterOptions(deck)}>
                    <Text style={styles.menuItemText}>🔍  {l('Filtre Seçenekleri', 'Filtered Deck Options')}</Text>
                </TouchableOpacity>
            )}
            {deck.isFiltered && (
                <TouchableOpacity style={styles.menuItem} onPress={() => handleRebuildFilter(deck)}>
                    <Text style={styles.menuItemText}>↻  {l('Yeniden Oluştur', 'Rebuild')}</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => handleDelete(deck)}>
                <Text style={[styles.menuItemText, styles.menuItemDanger]}>🗑️  {t('common.delete')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                <Text style={styles.modalCancelText}>{t('common.close')}</Text>
            </TouchableOpacity>
        </View>
    );

    const renderRenameModal = (deck: Deck) => (
        <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalTitle}>{l('Yeniden Adlandır', 'Rename')}</Text>
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
                        <TouchableOpacity style={styles.menuItem} onPress={() => handleMoveTo(null)}>
                            <Text style={styles.menuItemText}>📂  {l('Kök seviyeye taşı', 'Move to top level')}</Text>
                        </TouchableOpacity>
                    )}
                    {targets.map((target) => (
                        <TouchableOpacity key={target.id} style={styles.menuItem} onPress={() => handleMoveTo(target.name)}>
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

    const renderFilterModal = (deck: Deck) => (
        <ScrollView
            style={[styles.modalCard, isCompact && styles.modalCardCompact, styles.modalCardScrollable]}
            contentContainerStyle={styles.modalCardScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            {isCompact && <View style={styles.sheetHandle} />}
            <Text style={styles.modalTitle}>🔍 {t('anki.filteredDeck')} — {getDeckDisplayName(deck.name)}</Text>

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
                <TouchableOpacity
                    style={styles.modalBtnSecondary}
                    onPress={() => handleRebuildFilter(deck)}
                >
                    <Text style={styles.modalBtnSecondaryText}>↻ {l('Yeniden Oluştur', 'Rebuild')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveFilterOptions}>
                    <Text style={styles.modalBtnPrimaryText}>{t('common.save')}</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );

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
                        style={[styles.headerBtn, styles.headerBtnPrimary]}
                        onPress={() => setShowAddDeck(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                    >
                        <Text style={styles.headerBtnText}>+ {t('common.deck')}</Text>
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
                        style={styles.headerBtn}
                        onPress={() => setShowOverflowMenu(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Diğer seçenekler', 'More options')}
                    >
                        <Text style={styles.headerBtnText}>⋮</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isCompact && (
                <View style={styles.todayCard}>
                    <View style={styles.todayMetric}>
                        <Text style={[styles.todayValue, { color: colors.badgeNew }]}>{todaySummary.new}</Text>
                        <Text style={styles.todayLabel}>{t('anki.new')}</Text>
                    </View>
                    <View style={styles.todayDivider} />
                    <View style={styles.todayMetric}>
                        <Text style={[styles.todayValue, { color: colors.badgeLearn }]}>{todaySummary.learn}</Text>
                        <Text style={styles.todayLabel}>{t('anki.learn')}</Text>
                    </View>
                    <View style={styles.todayDivider} />
                    <View style={styles.todayMetric}>
                        <Text style={[styles.todayValue, { color: colors.badgeReview }]}>{todaySummary.review}</Text>
                        <Text style={styles.todayLabel}>{t('anki.review')}</Text>
                    </View>
                </View>
            )}

            <Modal visible={showOverflowMenu} transparent animationType="fade" onRequestClose={() => setShowOverflowMenu(false)}>
                <TouchableOpacity style={styles.overflowOverlay} activeOpacity={1} onPress={() => setShowOverflowMenu(false)}>
                    <View style={styles.overflowSheet}>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/empty-cards' as any); }}
                        >
                            <Text style={styles.overflowIcon}>🧹</Text>
                            <Text style={styles.overflowLabel}>{l('Boş Kartlar', 'Empty Cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/import' as any); }}
                        >
                            <Text style={styles.overflowIcon}>📥</Text>
                            <Text style={styles.overflowLabel}>{t('root.import')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/export' as any); }}
                        >
                            <Text style={styles.overflowIcon}>📤</Text>
                            <Text style={styles.overflowLabel}>{l('Dışa Aktar', 'Export')}</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={showAddDeck} transparent animationType="slide" onRequestClose={() => setShowAddDeck(false)}>
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, isCompact && styles.modalOverlayCompact]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={[styles.modalCard, isCompact && styles.modalCardCompact]}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.modalEyebrow}>{l('YENİ DESTE', 'NEW DECK')}</Text>
                        <Text style={styles.modalTitle}>{l('Çalışma alanınızı oluşturun', 'Create your study space')}</Text>
                        <Text style={styles.modalHint}>
                            {isCompact
                                ? l('Alt deste yapmak için desteyi oluşturduktan sonra ••• menüsünden Taşı’yı seçin.', 'After creating it, select Move from the ••• menu to make it a subdeck.')
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
                onLayout={() => {
                    listWrapRef.current?.measureInWindow((_x, y) => {
                        listTopRef.current = y;
                    });
                }}
            >
                <ScrollView
                    style={styles.deckList}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!draggingDeck}
                    onScroll={(e) => {
                        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                    }}
                    scrollEventThrottle={32}
                    contentContainerStyle={isCompact ? styles.deckListContentCompact : undefined}
                >
                    {visibleRows.length > 0 ? visibleRows.map((node) => renderDeckRow(node)) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateIcon}>＋</Text>
                            <Text style={styles.emptyStateTitle}>{l('İlk destenizi oluşturun', 'Create your first deck')}</Text>
                            <Text style={styles.emptyStateText}>{l('Kartlarınızı ders ve konuya göre düzenlemeye buradan başlayın.', 'Start organizing your cards by subject and topic.')}</Text>
                        </View>
                    )}
                    <View style={{ height: 80 }} />
                </ScrollView>
            </View>

            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/editor' as any)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Yeni kart ekle', 'Add new card')}
                >
                    <Text style={styles.bottomBtnIcon}>＋</Text>
                    <Text style={styles.bottomBtnText}>{t('sidebar.addCard')}</Text>
                </TouchableOpacity>
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
                        {l(`“${getDeckDisplayName(draggingDeck)}” taşınıyor — hedef desteye bırak`, `Moving “${getDeckDisplayName(draggingDeck)}” — drop it on the target deck`)}
                        {dropTarget ? ` → ${dropTarget}` : ''}
                    </Text>
                </View>
            )}

            <Modal visible={modal !== null} transparent animationType={isCompact ? 'slide' : 'fade'} onRequestClose={() => setModal(null)}>
                <KeyboardAvoidingView
                    style={[styles.modalOverlay, isCompact && styles.modalOverlayCompact]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {modal?.kind === 'menu' && renderMenuModal(modal.deck)}
                    {modal?.kind === 'rename' && renderRenameModal(modal.deck)}
                    {modal?.kind === 'move' && renderMoveModal(modal.deck)}
                    {modal?.kind === 'custom' && renderCustomModal(modal.deck)}
                    {modal?.kind === 'filter' && renderFilterModal(modal.deck)}
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
    headerBtnPrimary: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    headerBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.accent },

    todayCard: {
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        ...Shadows.sm,
    },
    todayMetric: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
    todayValue: { fontSize: FontSize.xl, fontWeight: '800', fontVariant: ['tabular-nums'] },
    todayLabel: { fontSize: FontSize.sm, color: colors.textMuted, fontWeight: '600' },
    todayDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: colors.border },

    overflowOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        alignItems: 'flex-end',
        paddingTop: 56,
        paddingRight: Spacing.lg,
    },
    overflowSheet: {
        minWidth: 200,
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

    addDeckRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: 8,
        backgroundColor: colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    addDeckInput: {
        flex: 1,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },
    addDeckBtn: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        justifyContent: 'center',
    },
    addDeckBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },

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

    listWrap: { flex: 1 },
    deckList: { flex: 1 },
    deckListContentCompact: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },

    deckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckRowCompact: {
        minHeight: 82,
        marginVertical: 4,
        paddingVertical: Spacing.sm,
        paddingRight: 4,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: BorderRadius.md,
        ...Shadows.sm,
    },
    deckRowDragging: { opacity: 0.4 },
    deckRowDropTarget: {
        backgroundColor: colors.accentLight,
        borderBottomColor: colors.accent,
        borderBottomWidth: 2,
    },
    expandBtn: { width: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    expandArrow: { fontSize: 18, color: colors.textMuted },
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
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : null),
    },
    dragHandleText: { fontSize: 16, color: colors.textMuted },
    gearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    gearText: { fontSize: 16, fontWeight: '800', color: colors.textMuted, letterSpacing: -1 },

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
    modalCard: {
        width: '100%',
        maxWidth: 420,
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
