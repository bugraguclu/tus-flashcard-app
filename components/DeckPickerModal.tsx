import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../constants/theme';
import { buildDeckTree } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { useI18n } from '../hooks/useI18n';
import DisclosureChevron from './DisclosureChevron';
import { userFacingErrorMessage } from '../lib/userFacingError';

import {
    filterDeckTree,
    flattenVisibleDeckPicker,
    initialExpandedDeckNames,
    prioritizeDeckTree,
    type VisibleDeckPickerRow,
} from '../lib/deckPickerExpansion';

type Props = {
    visible: boolean;
    colors: ColorScheme;
    decks: Deck[];
    selectedDeckName: string | null;
    /** The active deck currently being studied or edited, prioritized to the top and expanded. */
    activeDeckName?: string | null;
    title: string;
    allDecksLabel: string | null;
    searchPlaceholder: string;
    emptySearchLabel: string;
    cancelLabel: string;
    closeAccessibilityLabel: string;
    searchAccessibilityLabel: string;
    createAccessibilityLabel: string;
    onClose: () => void;
    onSelect: (name: string | null) => void;
    /** Create a deck without leaving the picker and return its final (possibly de-duplicated) name. */
    onCreateDeck: (name: string) => string | null;
};

export default function DeckPickerModal({
    visible,
    colors,
    decks,
    selectedDeckName,
    activeDeckName,
    title,
    allDecksLabel,
    searchPlaceholder,
    emptySearchLabel,
    cancelLabel,
    closeAccessibilityLabel,
    searchAccessibilityLabel,
    createAccessibilityLabel,
    onClose,
    onSelect,
    onCreateDeck,
}: Props) {
    const { t, l } = useI18n();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [searching, setSearching] = useState(false);
    const [creating, setCreating] = useState(false);
    const [query, setQuery] = useState('');
    const [newDeckName, setNewDeckName] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const targetDeckName = activeDeckName || selectedDeckName || null;

    // The deck list is the single source of truth for sibling order, so the picker lists decks
    // in exactly the order the user arranged them on the deck screen, prioritizing the active deck.
    const tree = useMemo(() => buildDeckTree(decks), [decks]);
    const prioritizedTree = useMemo(
        () => prioritizeDeckTree(tree, targetDeckName),
        [tree, targetDeckName],
    );

    useEffect(() => {
        if (!visible) return;
        // A deck picker can be launched while an editor/search field still owns the keyboard.
        // Start the picker from the full window, then let its own search field opt back in.
        Keyboard.dismiss();
        setSearching(false);
        setCreating(false);
        setQuery('');
        setNewDeckName('');
        setCreateError(null);
        setExpanded(initialExpandedDeckNames(prioritizedTree, targetDeckName));
    }, [visible, prioritizedTree, targetDeckName]);

    const filteredTree = useMemo(
        () => filterDeckTree(prioritizedTree, query.trim()),
        [prioritizedTree, query],
    );
    const rows = useMemo(
        () => flattenVisibleDeckPicker(filteredTree, expanded, searching && query.trim().length > 0),
        [filteredTree, expanded, searching, query],
    );

    const toggleExpanded = (name: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleBack = () => {
        if (creating) {
            Keyboard.dismiss();
            setCreating(false);
            setNewDeckName('');
            setCreateError(null);
            return;
        }
        if (searching) {
            Keyboard.dismiss();
            setSearching(false);
            setQuery('');
            return;
        }
        onClose();
    };

    const handleCreate = () => {
        Keyboard.dismiss();
        setSearching(false);
        setQuery('');
        setCreateError(null);
        setCreating(true);
    };

    const submitCreate = () => {
        const requestedName = newDeckName.trim();
        if (!requestedName) {
            setCreateError(l('Deste adı boş bırakılamaz.', 'Deck name cannot be empty.'));
            return;
        }
        try {
            const createdName = onCreateDeck(requestedName);
            if (!createdName) {
                setCreateError(l('Deste oluşturulamadı.', 'Could not create the deck.'));
                return;
            }
            Keyboard.dismiss();
            setCreating(false);
            setNewDeckName('');
            setCreateError(null);
            onSelect(createdName);
        } catch (error) {
            console.warn('[DeckPicker] create deck failed:', error);
            setCreateError(userFacingErrorMessage(
                error,
                l('Deste oluşturulamadı. Lütfen tekrar deneyin.', 'Could not create the deck. Please try again.'),
            ));
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={handleBack}
        >
            <KeyboardAvoidingView
                style={styles.keyboardLayer}
                behavior={Platform.OS === 'ios' && (searching || creating) ? 'padding' : undefined}
            >
                <Pressable style={styles.overlay} onPress={onClose}>
                    <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
                    <View style={styles.toolbar}>
                        <TouchableOpacity
                            style={styles.toolbarButton}
                            onPress={handleBack}
                            accessibilityRole="button"
                            accessibilityLabel={closeAccessibilityLabel}
                        >
                            <Text style={styles.backIcon}>←</Text>
                        </TouchableOpacity>

                        {creating ? (
                            <TextInput
                                style={styles.searchInput}
                                value={newDeckName}
                                onChangeText={(value) => {
                                    setNewDeckName(value);
                                    if (createError) setCreateError(null);
                                }}
                                placeholder={l('Yeni deste adı', 'New deck name')}
                                placeholderTextColor="rgba(255,255,255,0.72)"
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={submitCreate}
                                accessibilityLabel={l('Yeni deste adı', 'New deck name')}
                            />
                        ) : searching ? (
                            <TextInput
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                placeholder={searchPlaceholder}
                                placeholderTextColor="rgba(255,255,255,0.72)"
                                autoFocus
                                autoCorrect={false}
                                returnKeyType="search"
                                accessibilityLabel={searchPlaceholder}
                            />
                        ) : (
                            <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        )}

                        {!searching && !creating && (
                            <TouchableOpacity
                                style={styles.toolbarButton}
                                onPress={() => setSearching(true)}
                                accessibilityRole="button"
                                accessibilityLabel={searchAccessibilityLabel}
                            >
                                <View style={styles.searchGlyph}>
                                    <View style={styles.searchGlyphCircle} />
                                    <View style={styles.searchGlyphHandle} />
                                </View>
                            </TouchableOpacity>
                        )}
                        {creating ? (
                            <TouchableOpacity
                                style={styles.createConfirmButton}
                                onPress={submitCreate}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.create')}
                            >
                                <Text style={styles.createConfirmText}>{t('common.create')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.toolbarButton}
                                onPress={handleCreate}
                                accessibilityRole="button"
                                accessibilityLabel={createAccessibilityLabel}
                            >
                                <Text style={styles.plusIcon}>＋</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {creating ? (
                        <View style={styles.createBody}>
                            <Text style={styles.createTitle}>{l('Yeni deste oluştur', 'Create a new deck')}</Text>
                            <Text style={styles.createDescription}>
                                {l(
                                    'Deste burada oluşturulur ve mevcut işleminiz için otomatik seçilir. Bu ekrandan ayrılmazsınız.',
                                    'The deck is created here and automatically selected for your current task. You will not leave this screen.',
                                )}
                            </Text>
                            {createError ? <Text style={styles.createError}>{createError}</Text> : null}
                        </View>
                    ) : <FlatList
                        style={styles.scroll}
                        data={rows}
                        keyExtractor={({ node }) => String(node.deck.id)}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={18}
                        maxToRenderPerBatch={18}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS !== 'web'}
                        ListHeaderComponent={!query.trim() && allDecksLabel !== null ? (
                            <TouchableOpacity
                                style={[styles.row, selectedDeckName === null && styles.rowActive]}
                                onPress={() => onSelect(null)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: selectedDeckName === null }}
                            >
                                <Text style={styles.allIcon}>▦</Text>
                                <Text style={[styles.rowText, selectedDeckName === null && styles.rowTextActive]}>{allDecksLabel}</Text>
                                {selectedDeckName === null && <Text style={styles.check}>✓</Text>}
                            </TouchableOpacity>
                        ) : null}
                        renderItem={({ item: { node, depth } }) => {
                            const hasChildren = node.children.length > 0;
                            const isExpanded = searching || expanded.has(node.deck.name);
                            const active = selectedDeckName === node.deck.name;
                            return (
                                <View key={node.deck.id} style={[styles.row, active && styles.rowActive, { paddingLeft: Spacing.md + Math.min(depth, 8) * 20 }]}>
                                    {hasChildren ? (
                                        <TouchableOpacity
                                            style={styles.disclosureButton}
                                            onPress={() => toggleExpanded(node.deck.name)}
                                            accessibilityRole="button"
                                            accessibilityState={{ expanded: isExpanded }}
                                        >
                                            <DisclosureChevron expanded={isExpanded} color={colors.textPrimary} />
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={styles.disclosureSpacer} />
                                    )}
                                    <TouchableOpacity
                                        style={styles.rowMain}
                                        onPress={() => onSelect(node.deck.name)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={node.deck.name.replaceAll('::', ' › ')}
                                    >
                                        <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                                            {getDeckDisplayName(node.deck.name)}
                                        </Text>
                                        {active && <Text style={styles.check}>✓</Text>}
                                    </TouchableOpacity>
                                </View>
                            );
                        }}
                        ListEmptyComponent={query.trim() ? (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyText}>{emptySearchLabel}</Text>
                            </View>
                        ) : null}
                    />}

                    <TouchableOpacity style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.cancelText}>{cancelLabel}</Text>
                    </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        keyboardLayer: { flex: 1 },
        overlay: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.42)',
        },
        card: {
            width: '100%',
            maxWidth: 420,
            height: '78%',
            maxHeight: 680,
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        toolbar: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.xs,
            backgroundColor: colors.accent,
        },
        toolbarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
        createConfirmButton: { minWidth: 72, height: 48, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
        createConfirmText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
        backIcon: { color: colors.white, fontSize: 27, lineHeight: 29, fontWeight: '400' },
        searchGlyph: { width: 24, height: 24, position: 'relative' },
        searchGlyphCircle: { position: 'absolute', left: 2, top: 2, width: 15, height: 15, borderWidth: 2.2, borderColor: colors.white, borderRadius: 9 },
        searchGlyphHandle: { position: 'absolute', left: 16, top: 16, width: 9, height: 2.2, borderRadius: 2, backgroundColor: colors.white, transform: [{ rotate: '45deg' }] },
        plusIcon: { color: colors.white, fontSize: 28, lineHeight: 30, fontWeight: '300' },
        title: { flex: 1, color: colors.white, fontSize: FontSize.xl, fontWeight: '800' },
        searchInput: {
            flex: 1,
            minWidth: 0,
            height: 44,
            paddingHorizontal: Spacing.sm,
            color: colors.white,
            fontSize: FontSize.lg,
        },
        scroll: { flex: 1, backgroundColor: colors.bgCard },
        row: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        rowActive: { backgroundColor: colors.accentLight },
        allIcon: { width: 38, color: colors.textMuted, fontSize: 19, textAlign: 'center' },
        disclosureButton: { width: 38, height: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
        disclosureSpacer: { width: 38 },
        rowMain: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        rowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '600' },
        rowTextActive: { color: colors.accent, fontWeight: '800' },
        check: { color: colors.accent, fontSize: 20, fontWeight: '900' },
        emptyWrap: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
        emptyText: { color: colors.textMuted, fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
        createBody: { flex: 1, padding: Spacing.xl, backgroundColor: colors.bgCard },
        createTitle: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.sm },
        createDescription: { color: colors.textSecondary, fontSize: FontSize.md, lineHeight: 22 },
        createError: { color: colors.btnAgain, fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing.lg, fontWeight: '700' },
        cancelButton: {
            minHeight: 54,
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingHorizontal: Spacing.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        cancelText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800' },
    });
}
