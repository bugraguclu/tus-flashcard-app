// Anki-style deck list: the app's landing screen. Deck tree with per-deck counts,
// tap-to-study (parents include their subdecks), a gear menu per deck (rename, move,
// options/limits, custom study, delete) and drag-and-drop nesting via the row handle.

import React, { useState, useMemo, useCallback, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
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
    type DeckTreeNode,
} from '../../lib/deckManager';
import { getDeckDisplayName, getParentDeckName, FILTERED_ORDERS, type Deck } from '../../lib/models';
import { alert, confirm } from '../../lib/confirm';
import { useApp } from './_layout';

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
    const router = useRouter();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings, dataVersion, bumpDataVersion } = useApp();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(new Set());
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
        return buildDeckTree(decks, counts);
    }, [refreshToken, dataVersion, settings.dayRolloverHour, settings.learnAheadMinutes]);

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

    const toggleExpand = (deckName: string) => {
        setExpandedDecks((prev) => {
            const next = new Set(prev);
            if (next.has(deckName)) next.delete(deckName);
            else next.add(deckName);
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
            alert('Hata', 'Deste oluşturulamadı.');
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

    const openFilterOptions = (deck: Deck) => {
        setFilterSearch(deck.searchQuery ?? '');
        setFilterLimit(String(deck.searchLimit ?? 100));
        setFilterOrder(deck.searchOrder ?? 0);
        setFilterSearch2(deck.searchQuery2 ?? '');
        setFilterLimit2(String(deck.searchLimit2 ?? 100));
        setFilterReschedule(deck.reschedule ?? true);
        setModal({ kind: 'filter', deck });
    };

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
            alert('Hata', 'Filtre seçenekleri kaydedilemedi.');
        }
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
                    'Özel çalışma oturumu hazır',
                    `"${getDeckDisplayName(session.name)}" güncellendi. Şimdi çalışmak ister misin?`,
                    () => handleStudy(session.name),
                );
            }
        } catch (e) {
            console.warn('[Decks] special session failed:', e);
            alert('Hata', 'Özel çalışma oturumu oluşturulamadı.');
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
            alert('Hata', e instanceof Error ? e.message : 'Yeniden adlandırma başarısız.');
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
            alert('Hata', e instanceof Error ? e.message : 'Taşıma başarısız.');
        }
    };

    const handleBoost = (extraNew: number, extraReview: number) => {
        if (modal?.kind !== 'custom') return;
        addDeckTodayBoost(modal.deck.id, extraNew, extraReview, settings.dayRolloverHour);
        setModal(null);
        refresh();
        alert('✅ Bugünlük limit artırıldı', extraNew > 0
            ? `Bugün bu desteden ${extraNew} ek yeni kart gelecek.`
            : `Bugün bu destede ${extraReview} ek tekrara izin verildi.`);
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
                    'Özel çalışma oturumu hazır',
                    `"${getDeckDisplayName(session.name)}" oluşturuldu. Şimdi çalışmak ister misin?`,
                    () => handleStudy(session.name),
                );
            }
        } catch (e) {
            console.warn('[Decks] custom study failed:', e);
            alert('Hata', 'Özel çalışma oturumu oluşturulamadı.');
        }
    };

    const handleDelete = (deck: Deck) => {
        confirm(
            'Desteyi sil',
            deck.isFiltered
                ? `"${getDeckDisplayName(deck.name)}" silinecek; kartlar ait oldukları destelere döner.`
                : `"${getDeckDisplayName(deck.name)}" tüm alt desteleri ve içindeki kartlarla birlikte silinecek. Bu işlem geri alınamaz.`,
            () => {
                try {
                    deleteDeck(deck.id);
                    setModal(null);
                    refresh();
                } catch (e) {
                    console.warn('[Decks] delete failed:', e);
                    alert('Hata', 'Deste silinemedi.');
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
                alert('Hata', e instanceof Error ? e.message : 'Taşıma başarısız.');
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
        const dragResponder = makeDragResponder(node);

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
                    { paddingLeft: 8 + node.depth * 22 },
                    isDragging && styles.deckRowDragging,
                    isDropTarget && styles.deckRowDropTarget,
                ]}
            >
                {hasChildren ? (
                    <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => toggleExpand(deck.name)}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? 'Alt desteleri gizle' : 'Alt desteleri göster'}
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
                    accessibilityLabel={`${displayName} destesini aç`}
                    {...webTitle(`${displayName}: genel bakis (calismak icin ustune, sonra Simdi Calis)`)}
                >
                    <Text
                        style={[styles.deckName, deck.isFiltered && styles.deckNameFiltered]}
                        numberOfLines={1}
                    >
                        {displayName}
                    </Text>
                </TouchableOpacity>

                <View style={styles.countsRow}>
                    <Text style={[styles.countBadge, styles.countNew]}>{node.newCount}</Text>
                    <Text style={[styles.countBadge, styles.countLearn]}>{node.learnCount}</Text>
                    <Text style={[styles.countBadge, styles.countReview]}>{node.reviewCount}</Text>
                </View>

                <View
                    style={styles.dragHandle}
                    {...dragResponder.panHandlers}
                    {...webTitle('Sürükleyip başka bir desteye bırak: alt deste yapar')}
                >
                    <Text style={styles.dragHandleText}>⠿</Text>
                </View>

                <TouchableOpacity
                    style={styles.gearBtn}
                    onPress={() => openMenu(deck)}
                    accessibilityRole="button"
                    accessibilityLabel={`${displayName} deste seçenekleri`}
                >
                    <Text style={styles.gearText}>⚙️</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderMenuModal = (deck: Deck) => (
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setModal(null); handleStudy(deck.name); }}>
                <Text style={styles.menuItemText}>▶️  Çalış</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => openRename(deck)}>
                <Text style={styles.menuItemText}>✏️  Yeniden Adlandır</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setModal({ kind: 'move', deck })}>
                <Text style={styles.menuItemText}>📁  Taşı (alt deste yap)</Text>
            </TouchableOpacity>
            {!deck.isFiltered && (
                <>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => { setModal(null); router.push(`/deck-options?deckId=${deck.id}` as any); }}
                    >
                        <Text style={styles.menuItemText}>⚙️  Seçenekler (günlük limitler)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => openCustomStudy(deck)}>
                        <Text style={styles.menuItemText}>🎯  Özel Çalışma</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => { setModal(null); router.push(`/export?deck=${encodeURIComponent(deck.name)}` as any); }}
                    >
                        <Text style={styles.menuItemText}>📤  Dışa Aktar</Text>
                    </TouchableOpacity>
                </>
            )}
            {deck.isFiltered && (
                <TouchableOpacity style={styles.menuItem} onPress={() => openFilterOptions(deck)}>
                    <Text style={styles.menuItemText}>🔍  Filtre Seçenekleri</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => handleDelete(deck)}>
                <Text style={[styles.menuItemText, styles.menuItemDanger]}>🗑️  Sil</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                <Text style={styles.modalCancelText}>Kapat</Text>
            </TouchableOpacity>
        </View>
    );

    const renderRenameModal = (deck: Deck) => (
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Yeniden Adlandır</Text>
            <TextInput
                style={styles.modalInput}
                value={renameText}
                onChangeText={setRenameText}
                onSubmitEditing={handleRename}
                autoFocus
                placeholder="Deste adı"
                placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleRename}>
                    <Text style={styles.modalBtnPrimaryText}>Kaydet</Text>
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
            <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Nereye taşınsın?</Text>
                <ScrollView style={styles.moveList}>
                    {getParentDeckName(deck.name) && (
                        <TouchableOpacity style={styles.menuItem} onPress={() => handleMoveTo(null)}>
                            <Text style={styles.menuItemText}>📂  Kök seviyeye taşı</Text>
                        </TouchableOpacity>
                    )}
                    {targets.map((target) => (
                        <TouchableOpacity key={target.id} style={styles.menuItem} onPress={() => handleMoveTo(target.name)}>
                            <Text style={styles.menuItemText} numberOfLines={1}>📁  {target.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                    <Text style={styles.modalCancelText}>Vazgeç</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderCustomModal = (deck: Deck) => (
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Özel Çalışma — {getDeckDisplayName(deck.name)}</Text>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>Bugünlük yeni kart limitini artır</Text>
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
                        <Text style={styles.modalBtnPrimaryText}>Uygula</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>Bugünlük tekrar limitini artır</Text>
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
                        <Text style={styles.modalBtnPrimaryText}>Uygula</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>Çalışma oturumu oluştur (filtrelenmiş alt deste)</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={customLimit}
                        onChangeText={setCustomLimit}
                        keyboardType="number-pad"
                        placeholder="Kart sayısı"
                        placeholderTextColor={colors.textMuted}
                    />
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={customTag}
                        onChangeText={setCustomTag}
                        placeholder="Etiket (opsiyonel)"
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateCustomSession}>
                    <Text style={styles.modalBtnPrimaryText}>🎯 Oturum Oluştur</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>Unutulanları tekrar et (son N günde "Tekrar" denenler)</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={forgottenDays}
                        onChangeText={setForgottenDays}
                        keyboardType="number-pad"
                        placeholder="Gün"
                        placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleCreateSpecialSession(
                            `deck:"${deck.name}" rated:${parseCount(forgottenDays, 7) || 7}:1`,
                            { reschedule: true, searchOrder: 6 },
                        )}
                    >
                        <Text style={styles.modalBtnPrimaryText}>Oluştur</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>İleriye çalış (N gün içinde vadesi gelecekler)</Text>
                <View style={styles.inlineRow}>
                    <TextInput
                        style={[styles.modalInput, styles.inlineInput]}
                        value={aheadDays}
                        onChangeText={setAheadDays}
                        keyboardType="number-pad"
                        placeholder="Gün"
                        placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                        style={styles.modalBtnPrimary}
                        onPress={() => handleCreateSpecialSession(
                            `deck:"${deck.name}" prop:due<=${parseCount(aheadDays, 3) || 3}`,
                            { reschedule: true, searchOrder: 0 },
                        )}
                    >
                        <Text style={styles.modalBtnPrimaryText}>Oluştur</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.customSection}>
                <Text style={styles.fieldLabel}>Yeni kartları önizle (zamanlamaya dokunmaz)</Text>
                <TouchableOpacity
                    style={styles.modalBtnPrimary}
                    onPress={() => handleCreateSpecialSession(
                        `deck:"${deck.name}" is:new`,
                        { reschedule: false, searchOrder: 4 },
                    )}
                >
                    <Text style={styles.modalBtnPrimaryText}>👁️ Önizleme Oturumu</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
                Hepsi "{'Özel Çalışma Oturumu'} ({getDeckDisplayName(deck.name)})" alt destesini kurar; yenisi
                bir öncekinin yerine geçer.
            </Text>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(null)}>
                <Text style={styles.modalCancelText}>Kapat</Text>
            </TouchableOpacity>
        </View>
    );

    const renderFilterModal = (deck: Deck) => (
        <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔍 Filtre — {getDeckDisplayName(deck.name)}</Text>

            <Text style={styles.fieldLabel}>Arama</Text>
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
                    placeholder="Limit"
                    placeholderTextColor={colors.textMuted}
                />
            </View>
            <Text style={styles.fieldLabel}>Sıralama</Text>
            <View style={styles.orderWrap}>
                {FILTERED_ORDERS.map((label, index) => (
                    <TouchableOpacity
                        key={label}
                        style={[styles.orderChip, filterOrder === index && styles.orderChipActive]}
                        onPress={() => setFilterOrder(index)}
                    >
                        <Text style={[styles.orderChipText, filterOrder === index && styles.orderChipTextActive]}>
                            {label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.fieldLabel}>İkinci filtre (opsiyonel)</Text>
            <View style={styles.inlineRow}>
                <TextInput
                    style={[styles.modalInput, styles.inlineInput]}
                    value={filterSearch2}
                    onChangeText={setFilterSearch2}
                    placeholder="İkinci arama (boş = kapalı)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                />
                <TextInput
                    style={[styles.modalInput, { width: 76 }]}
                    value={filterLimit2}
                    onChangeText={setFilterLimit2}
                    keyboardType="number-pad"
                    placeholder="Limit"
                    placeholderTextColor={colors.textMuted}
                />
            </View>

            <TouchableOpacity style={styles.rescheduleRow} onPress={() => setFilterReschedule((prev) => !prev)}>
                <Text style={styles.menuItemText}>
                    {filterReschedule ? '☑' : '☐'}  Cevaplara göre yeniden zamanla
                </Text>
            </TouchableOpacity>
            {!filterReschedule && (
                <Text style={styles.modalHint}>
                    Kapalı: önizleme modu — cevaplar kartların zamanlamasını hiç değiştirmez.
                </Text>
            )}

            <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setModal(null)}>
                    <Text style={styles.modalBtnSecondaryText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.modalBtnSecondary}
                    onPress={() => { refresh(); alert('Yenilendi', 'Oturum güncel aramayla yeniden toplandı.'); }}
                >
                    <Text style={styles.modalBtnSecondaryText}>↻ Yeniden Oluştur</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveFilterOptions}>
                    <Text style={styles.modalBtnPrimaryText}>Kaydet</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Desteler</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => setShowAddDeck(!showAddDeck)}>
                        <Text style={styles.headerBtnText}>+ Deste</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={refresh}
                        accessibilityRole="button"
                        accessibilityLabel="Desteleri yenile"
                    >
                        <Text style={styles.headerBtnText}>↻</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => setShowOverflowMenu(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Diğer seçenekler"
                    >
                        <Text style={styles.headerBtnText}>⋮</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal visible={showOverflowMenu} transparent animationType="fade" onRequestClose={() => setShowOverflowMenu(false)}>
                <TouchableOpacity style={styles.overflowOverlay} activeOpacity={1} onPress={() => setShowOverflowMenu(false)}>
                    <View style={styles.overflowSheet}>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/empty-cards' as any); }}
                        >
                            <Text style={styles.overflowIcon}>🧹</Text>
                            <Text style={styles.overflowLabel}>Boş Kartlar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/import' as any); }}
                        >
                            <Text style={styles.overflowIcon}>📥</Text>
                            <Text style={styles.overflowLabel}>İçe Aktar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.overflowRow}
                            onPress={() => { setShowOverflowMenu(false); router.push('/export' as any); }}
                        >
                            <Text style={styles.overflowIcon}>📤</Text>
                            <Text style={styles.overflowLabel}>Dışa Aktar</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {showAddDeck && (
                <View style={styles.addDeckRow}>
                    <TextInput
                        style={styles.addDeckInput}
                        placeholder="Deste adı (örn: Python::Fonksiyonlar::İleri)"
                        placeholderTextColor={colors.textMuted}
                        value={newDeckName}
                        onChangeText={setNewDeckName}
                        onSubmitEditing={handleAddDeck}
                        autoFocus
                    />
                    <TouchableOpacity style={styles.addDeckBtn} onPress={handleAddDeck}>
                        <Text style={styles.addDeckBtnText}>Ekle</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.columnHeaders}>
                <Text style={styles.columnLabel}>Deste</Text>
                <View style={styles.countsRow}>
                    <Text style={[styles.columnCount, { color: colors.badgeNew }]}>Yeni</Text>
                    <Text style={[styles.columnCount, { color: colors.badgeLearn }]}>Öğren</Text>
                    <Text style={[styles.columnCount, { color: colors.badgeReview }]}>Tekrar</Text>
                </View>
                <View style={{ width: 72 }} />
            </View>

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
                >
                    {visibleRows.map((node) => renderDeckRow(node))}
                    <View style={{ height: 80 }} />
                </ScrollView>
            </View>

            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/editor' as any)}>
                    <Text style={styles.bottomBtnIcon}>＋</Text>
                    <Text style={styles.bottomBtnText}>Kart Ekle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/browser' as any)}>
                    <Text style={styles.bottomBtnIcon}>🗂️</Text>
                    <Text style={styles.bottomBtnText}>Kartlarım</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/stats' as any)}>
                    <Text style={styles.bottomBtnIcon}>📊</Text>
                    <Text style={styles.bottomBtnText}>İstatistik</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/settings' as any)}>
                    <Text style={styles.bottomBtnIcon}>⚙️</Text>
                    <Text style={styles.bottomBtnText}>Ayarlar</Text>
                </TouchableOpacity>
            </View>

            {draggingDeck && (
                <View style={styles.dragBanner}>
                    <Text style={styles.dragBannerText}>
                        “{getDeckDisplayName(draggingDeck)}” taşınıyor — hedef desteye bırak
                        {dropTarget ? ` → ${dropTarget}` : ''}
                    </Text>
                </View>
            )}

            <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={() => setModal(null)}>
                <View style={styles.modalOverlay}>
                    {modal?.kind === 'menu' && renderMenuModal(modal.deck)}
                    {modal?.kind === 'rename' && renderRenameModal(modal.deck)}
                    {modal?.kind === 'move' && renderMoveModal(modal.deck)}
                    {modal?.kind === 'custom' && renderCustomModal(modal.deck)}
                    {modal?.kind === 'filter' && renderFilterModal(modal.deck)}
                </View>
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
        paddingVertical: 6,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    headerBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.accent },

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
        paddingVertical: 12,
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

    deckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckRowDragging: { opacity: 0.4 },
    deckRowDropTarget: {
        backgroundColor: colors.accentLight,
        borderBottomColor: colors.accent,
        borderBottomWidth: 2,
    },
    expandBtn: { width: 24, alignItems: 'center', justifyContent: 'center' },
    expandArrow: { fontSize: 14, color: colors.textMuted },
    expandDot: { fontSize: 10, color: colors.border },
    deckNameTouchable: { flex: 1, marginLeft: 4 },
    deckName: { fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
    deckNameFiltered: { color: colors.badgeNew, fontStyle: 'italic' },

    countsRow: { flexDirection: 'row', gap: 0 },
    countBadge: { fontSize: FontSize.md, fontWeight: '700', width: 48, textAlign: 'center' },
    countNew: { color: colors.badgeNew },
    countLearn: { color: colors.badgeLearn },
    countReview: { color: colors.badgeReview },

    dragHandle: {
        width: 32,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : null),
    },
    dragHandleText: { fontSize: 16, color: colors.textMuted },
    gearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    gearText: { fontSize: 16 },

    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        ...Shadows.md,
    },
    bottomBtn: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
    bottomBtnIcon: { fontSize: 20 },
    bottomBtnText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

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
    modalCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        ...Shadows.lg,
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
        paddingVertical: 8,
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
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: Spacing.md,
    },
    modalBtnPrimary: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 9,
        alignItems: 'center',
    },
    modalBtnPrimaryText: { color: colors.white, fontWeight: '700', fontSize: FontSize.sm },
    modalBtnSecondary: {
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    modalBtnSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
    modalCancel: { marginTop: Spacing.md, alignItems: 'center', paddingVertical: 6 },
    modalCancelText: { color: colors.textMuted, fontWeight: '600' },

    menuItem: {
        paddingVertical: 11,
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
