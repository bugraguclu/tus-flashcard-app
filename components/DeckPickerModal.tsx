import { useEffect, useMemo, useRef, useState } from 'react';
import {
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text } from './AppText';
import { FontSize, Shadows, Spacing, type ColorScheme } from '../constants/theme';
import { buildDeckTree } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { useI18n } from '../hooks/useI18n';
import CardsGlyph from './CardsGlyph';
import DisclosureChevron from './DisclosureChevron';
import { userFacingErrorMessage } from '../lib/userFacingError';
import { Button, CloseButton, IconButton } from './ui/Button';
import { SelectedMark } from './ui/Choice';
import { EmptyState, Notice } from './ui/Feedback';
import { SearchField, TextField } from './ui/Fields';
import { BackIcon, PlusIcon, SearchIcon } from './ui/icons';
import { Radius, Type } from './ui/tokens';

import {
    filterDeckTree,
    flattenVisibleDeckPicker,
    initialExpandedDeckNames,
    prioritizeDeckTree,
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
    // Which deck the picker opens on. The caller owns this: it knows whether the operation is
    // scoped to the deck being studied, the deck the selected cards live in, or the one already
    // chosen, and passes that as `activeDeckName`. Reading the collection's current deck here
    // instead would silently override a caller that deliberately pointed somewhere else.
    const targetDeckName = activeDeckName || selectedDeckName || null;

    // The deck list is the single source of truth for sibling order, so the picker lists decks
    // in exactly the order the user arranged them on the deck screen, prioritizing the active deck.
    const tree = useMemo(() => buildDeckTree(decks), [decks]);
    const prioritizedTree = useMemo(
        () => prioritizeDeckTree(tree, targetDeckName),
        [tree, targetDeckName],
    );

    // Opening the picker is what resets its branches — not every new `decks` array a caller
    // happens to build during render. Keying the reset on the tree instead would re-run it on
    // each render at any call site that does not memoize the prop, snapping every branch the
    // user opened shut again, so the tree is read through a ref rather than a dependency.
    const prioritizedTreeRef = useRef(prioritizedTree);
    prioritizedTreeRef.current = prioritizedTree;

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
        setExpanded(initialExpandedDeckNames(prioritizedTreeRef.current, targetDeckName));
    }, [visible, targetDeckName]);

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

    // Searching and naming a new deck are steps inside the picker: the leading arrow steps back
    // out of them. On the list itself the picker closes with ×, as a dialog does.
    const inStep = searching || creating;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={handleBack}
        >
            <KeyboardAvoidingView
                style={[styles.layer, { backgroundColor: colors.scrim }]}
                behavior={Platform.OS === 'ios' && (searching || creating) ? 'padding' : undefined}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={closeAccessibilityLabel}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <View style={styles.header}>
                        {inStep ? (
                            <IconButton accessibilityLabel={closeAccessibilityLabel} onPress={handleBack}>
                                <BackIcon color={colors.accent} />
                            </IconButton>
                        ) : null}

                        {creating ? (
                            <TextField
                                style={styles.headerField}
                                value={newDeckName}
                                onChangeText={(value) => {
                                    setNewDeckName(value);
                                    if (createError) setCreateError(null);
                                }}
                                placeholder={l('Yeni deste adı', 'New deck name')}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={submitCreate}
                                accessibilityLabel={l('Yeni deste adı', 'New deck name')}
                            />
                        ) : searching ? (
                            <SearchField
                                style={styles.headerField}
                                value={query}
                                onChangeText={setQuery}
                                placeholder={searchPlaceholder}
                                clearLabel={l('Aramayı temizle', 'Clear search')}
                                autoFocus
                                accessibilityLabel={searchPlaceholder}
                            />
                        ) : (
                            <Text style={[Type.title, styles.title]} numberOfLines={1} accessibilityRole="header">{title}</Text>
                        )}

                        {!inStep && (
                            <IconButton accessibilityLabel={searchAccessibilityLabel} onPress={() => setSearching(true)}>
                                <SearchIcon color={colors.textSecondary} size={22} />
                            </IconButton>
                        )}
                        {creating ? (
                            <Button label={t('common.create')} size="compact" onPress={submitCreate} />
                        ) : (
                            <IconButton accessibilityLabel={createAccessibilityLabel} onPress={handleCreate}>
                                <PlusIcon color={colors.accent} />
                            </IconButton>
                        )}
                        {!inStep && <CloseButton accessibilityLabel={closeAccessibilityLabel} onPress={onClose} />}
                    </View>

                    {creating ? (
                        <View style={styles.createBody}>
                            <Text style={[Type.title, { color: colors.textPrimary }]}>{l('Yeni deste oluştur', 'Create a new deck')}</Text>
                            <Text style={[Type.body, styles.createDescription]}>
                                {l(
                                    'Deste burada oluşturulur ve mevcut işleminiz için otomatik seçilir. Bu ekrandan ayrılmazsınız.',
                                    'The deck is created here and automatically selected for your current task. You will not leave this screen.',
                                )}
                            </Text>
                            {createError ? <Notice tone="danger">{createError}</Notice> : null}
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
                                style={[
                                    styles.row,
                                    rows.length === 0 && styles.rowLast,
                                    selectedDeckName === null && styles.rowActive,
                                ]}
                                onPress={() => onSelect(null)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: selectedDeckName === null }}
                            >
                                <View style={styles.allIcon}>
                                    <CardsGlyph color={colors.textMuted} size={20} />
                                </View>
                                <Text style={[styles.rowText, selectedDeckName === null && styles.rowTextActive]}>{allDecksLabel}</Text>
                                {selectedDeckName === null && <SelectedMark />}
                            </TouchableOpacity>
                        ) : null}
                        renderItem={({ item: { node, depth }, index }) => {
                            const hasChildren = node.children.length > 0;
                            const isExpanded = searching || expanded.has(node.deck.name);
                            const active = selectedDeckName === node.deck.name;
                            const isLast = index === rows.length - 1;
                            return (
                                <View
                                    key={node.deck.id}
                                    style={[
                                        styles.row,
                                        isLast && styles.rowLast,
                                        active && styles.rowActive,
                                        { paddingLeft: Spacing.md + Math.min(depth, 8) * 20 },
                                    ]}
                                >
                                    {hasChildren ? (
                                        <TouchableOpacity
                                            style={styles.disclosureButton}
                                            onPress={() => toggleExpanded(node.deck.name)}
                                            // The slop makes the 38-wide column a full target, into the row's inset.
                                            hitSlop={{ left: 6 }}
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
                                        {active && <SelectedMark />}
                                    </TouchableOpacity>
                                </View>
                            );
                        }}
                        ListEmptyComponent={query.trim() ? <EmptyState title={emptySearchLabel} /> : null}
                    />}

                    <View style={styles.footer}>
                        <Button label={cancelLabel} variant="plain" onPress={onClose} />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        layer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 420,
            height: '78%',
            maxHeight: 680,
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: Radius.card,
            ...Shadows.lg,
        },
        // A white header inside the card: the title, or the field of the step the picker is in.
        header: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            paddingLeft: Spacing.sm,
            paddingRight: Spacing.xs,
            paddingVertical: Spacing.xs,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        title: { flex: 1, paddingLeft: Spacing.sm, color: colors.textPrimary },
        headerField: { flex: 1, minWidth: 0 },
        scroll: { flex: 1, backgroundColor: colors.bgCard },
        row: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        rowLast: { borderBottomWidth: 0 },
        rowActive: { backgroundColor: colors.accentLight },
        allIcon: { width: 38, alignItems: 'center' },
        disclosureButton: { width: 38, height: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
        disclosureSpacer: { width: 38 },
        rowMain: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        rowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '500' },
        rowTextActive: { color: colors.accent, fontWeight: '600' },
        createBody: { flex: 1, padding: Spacing.xl, gap: Spacing.sm, backgroundColor: colors.bgCard },
        createDescription: { color: colors.textSecondary, lineHeight: 22, marginBottom: Spacing.sm },
        footer: {
            minHeight: 54,
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingHorizontal: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            backgroundColor: colors.bgCard,
        },
    });
}
