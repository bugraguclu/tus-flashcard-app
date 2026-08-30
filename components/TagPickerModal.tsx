import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import { Text, TextInput } from './Typography';
import { TouchableOpacity } from './Touchable';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { getAllTags } from '../lib/noteManager';
import {
    allRowsSelected,
    buildTagPickerRows,
    parseNewTags,
    tagKey,
    uniqueTags,
    type TagPickerRow,
} from '../lib/tagPickerRows';
import { useI18n } from '../hooks/useI18n';

interface TagPickerModalProps {
    visible: boolean;
    selectedTags: string[];
    onCancel: () => void;
    onConfirm: (tags: string[]) => void;
    /** Browser filters select existing collection tags; the editor keeps creation enabled. */
    allowCreate?: boolean;
    title?: string;
}

export default function TagPickerModal({
    visible,
    selectedTags,
    onCancel,
    onConfirm,
    allowCreate = true,
    title,
}: TagPickerModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [knownTags, setKnownTags] = useState<string[]>([]);
    const [draftTags, setDraftTags] = useState<string[]>([]);
    const [searchVisible, setSearchVisible] = useState(false);
    const [addVisible, setAddVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [newTagText, setNewTagText] = useState('');

    useEffect(() => {
        if (!visible) return;
        Keyboard.dismiss();
        const selected = uniqueTags(selectedTags);
        const all = uniqueTags([...getAllTags(), ...selected])
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        setKnownTags(all);
        setDraftTags(selected);
        setSearchText('');
        setNewTagText('');
        setSearchVisible(false);
        setAddVisible(false);
    }, [visible, selectedTags]);

    const rows = useMemo(
        () => buildTagPickerRows({
            known: knownTags,
            selected: draftTags,
            query: searchVisible ? searchText : '',
        }),
        [knownTags, draftTags, searchText, searchVisible],
    );
    const filteredTags = useMemo(() => rows.map((row) => row.tag), [rows]);
    const allVisibleSelected = allRowsSelected(rows);

    const toggleTag = (tag: string) => {
        const key = tagKey(tag);
        setDraftTags((current) => current.some((entry) => tagKey(entry) === key)
            ? current.filter((entry) => tagKey(entry) !== key)
            : [...current, tag]);
    };

    const toggleAllVisible = () => {
        const visibleKeys = new Set(filteredTags.map(tagKey));
        if (allVisibleSelected) {
            setDraftTags((current) => current.filter((tag) => !visibleKeys.has(tagKey(tag))));
            return;
        }
        setDraftTags((current) => uniqueTags([...current, ...filteredTags]));
    };

    const addTags = () => {
        const parsed = parseNewTags(newTagText);
        if (parsed.length === 0) return;

        const canonical = parsed.map((tag) => (
            knownTags.find((known) => tagKey(known) === tagKey(tag)) ?? tag
        ));
        setKnownTags((current) => uniqueTags([...current, ...canonical])
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        setDraftTags((current) => uniqueTags([...current, ...canonical]));
        setNewTagText('');
        Keyboard.dismiss();
        setAddVisible(false);
    };

    const keyExtractor = useCallback((row: TagPickerRow) => row.key, []);

    const renderRow = useCallback(({ item }: { item: TagPickerRow }) => (
        <TouchableOpacity
            style={[styles.tagRow, { paddingLeft: Spacing.md + Math.min(item.depth, 8) * 18 }]}
            onPress={() => toggleTag(item.tag)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.selected }}
            accessibilityLabel={item.label}
        >
            <Text style={[styles.tagText, item.selected && styles.tagTextSelected]} numberOfLines={2}>
                {item.label}
            </Text>
            <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                {item.selected && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
        </TouchableOpacity>
    ), [styles]);

    const listEmpty = (
        <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{l('Etiket bulunamadı', 'No tags found')}</Text>
            <Text style={styles.emptyText}>
                {allowCreate
                    ? l('＋ düğmesiyle yeni bir etiket ekleyebilirsiniz.', 'Use ＋ to add a new tag.')
                    : l('Koleksiyonda bu aramayla eşleşen etiket yok.', 'No collection tag matches this search.')}
            </Text>
        </View>
    );

    const toggleSearch = () => {
        if (searchVisible) Keyboard.dismiss();
        setSearchVisible((current) => !current);
        setAddVisible(false);
    };

    const toggleAdd = () => {
        if (addVisible) Keyboard.dismiss();
        setAddVisible((current) => !current);
        setSearchVisible(false);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={onCancel}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' && (searchVisible || addVisible) ? 'padding' : undefined}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onCancel}
                    accessibilityLabel={l('Etiket penceresini kapat', 'Close tags dialog')}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>{title ?? l('Etiketler', 'Tags')}</Text>
                        <TouchableOpacity
                            style={[styles.headerAction, searchVisible && styles.headerActionActive]}
                            onPress={toggleSearch}
                            accessibilityRole="button"
                            accessibilityLabel={l('Etiketlerde ara', 'Search tags')}
                        >
                            <Text style={styles.searchIcon}>⌕</Text>
                        </TouchableOpacity>
                        {allowCreate && (
                            <TouchableOpacity
                                style={[styles.headerAction, addVisible && styles.headerActionActive]}
                                onPress={toggleAdd}
                                accessibilityRole="button"
                                accessibilityLabel={l('Yeni etiket ekle', 'Add new tag')}
                            >
                                <Text style={styles.headerActionText}>＋</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.headerAction}
                            onPress={toggleAllVisible}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: allVisibleSelected }}
                            accessibilityLabel={allVisibleSelected
                                ? l('Görünen etiketlerin seçimini kaldır', 'Deselect all visible tags')
                                : l('Görünen etiketlerin tümünü seç', 'Select all visible tags')}
                        >
                            <View
                                style={[
                                    styles.selectAllCheckbox,
                                    allVisibleSelected && styles.selectAllCheckboxSelected,
                                ]}
                            >
                                {allVisibleSelected && <Text style={styles.selectAllCheckboxTick}>✓</Text>}
                            </View>
                        </TouchableOpacity>
                    </View>

                    {searchVisible && (
                        <View style={styles.inputBar}>
                            <Text style={styles.inputIcon}>⌕</Text>
                            <TextInput
                                style={styles.input}
                                value={searchText}
                                onChangeText={setSearchText}
                                placeholder={l('Etiket ara…', 'Search tags…')}
                                placeholderTextColor={colors.textMuted}
                                autoFocus
                                autoCorrect={false}
                                returnKeyType="search"
                            />
                            {searchText.length > 0 && (
                                <TouchableOpacity
                                    style={styles.inlineAction}
                                    onPress={() => setSearchText('')}
                                    accessibilityLabel={l('Aramayı temizle', 'Clear search')}
                                >
                                    <Text style={styles.inlineActionText}>×</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {allowCreate && addVisible && (
                        <View style={styles.addPanel}>
                            <TextInput
                                style={styles.addInput}
                                value={newTagText}
                                onChangeText={setNewTagText}
                                placeholder={l('Yeni etiket · birden fazlası için boşluk kullanın', 'New tag · separate multiple tags with spaces')}
                                placeholderTextColor={colors.textMuted}
                                autoFocus
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="done"
                                onSubmitEditing={addTags}
                            />
                            <TouchableOpacity
                                style={[styles.addButton, !newTagText.trim() && styles.buttonDisabled]}
                                onPress={addTags}
                                disabled={!newTagText.trim()}
                            >
                                <Text style={styles.addButtonText}>{t('common.add')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <FlatList
                        style={styles.list}
                        data={rows}
                        renderItem={renderRow}
                        keyExtractor={keyExtractor}
                        showsVerticalScrollIndicator
                        // The search and "new tag" fields sit above the list: a tap on a tag must
                        // toggle it rather than being consumed by dismissing the keyboard.
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        ListEmptyComponent={listEmpty}
                        initialNumToRender={18}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS !== 'web'}
                    />

                    <View style={styles.footer}>
                        <Text style={styles.selectionCount}>
                            {l(`${draftTags.length} seçili`, `${draftTags.length} selected`)}
                        </Text>
                        <TouchableOpacity style={styles.footerButton} onPress={onCancel}>
                            <Text style={styles.footerButtonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerButton} onPress={() => onConfirm(uniqueTags(draftTags))}>
                            <Text style={styles.footerButtonText}>{l('Onayla', 'Confirm')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.xxl,
            backgroundColor: 'rgba(0,0,0,0.38)',
        },
        card: {
            width: '100%',
            maxWidth: 440,
            height: '82%',
            overflow: 'hidden',
            backgroundColor: colors.bgSecondary,
            borderRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        header: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.md,
            paddingRight: 4,
            backgroundColor: colors.accent,
        },
        headerTitle: { flex: 1, color: colors.white, fontSize: FontSize.xl, fontWeight: '600' },
        headerAction: {
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.full,
        },
        headerActionActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
        headerActionText: { color: colors.white, fontSize: 29, lineHeight: 31, fontWeight: '300' },
        searchIcon: { color: colors.white, fontSize: 30, lineHeight: 31, transform: [{ rotate: '-18deg' }] },
        selectAllCheckbox: {
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 3,
            backgroundColor: 'transparent',
        },
        selectAllCheckboxSelected: {
            borderWidth: 3,
            borderColor: colors.white,
        },
        selectAllCheckboxTick: {
            color: colors.white,
            fontSize: 17,
            lineHeight: 18,
            fontWeight: '900',
        },
        inputBar: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            gap: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        inputIcon: { width: 24, color: colors.textMuted, fontSize: 25 },
        input: { flex: 1, minHeight: 48, color: colors.textPrimary, fontSize: FontSize.md },
        inlineAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
        inlineActionText: { color: colors.textMuted, fontSize: 28, fontWeight: '300' },
        addPanel: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            padding: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        addInput: {
            flex: 1,
            minHeight: 46,
            paddingHorizontal: Spacing.md,
            color: colors.textPrimary,
            fontSize: FontSize.sm,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        addButton: {
            minWidth: 72,
            minHeight: 46,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
        },
        addButtonText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '700' },
        buttonDisabled: { opacity: 0.45 },
        list: { flex: 1 },
        tagRow: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingRight: Spacing.lg,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        tagText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        tagTextSelected: { color: colors.accent, fontWeight: '700' },
        checkbox: {
            width: 23,
            height: 23,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.textMuted,
            borderRadius: 3,
            backgroundColor: colors.bgCard,
        },
        checkboxSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
        checkboxTick: { color: colors.white, fontSize: 16, lineHeight: 17, fontWeight: '900' },
        emptyState: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: 56 },
        emptyTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        emptyText: { marginTop: Spacing.sm, color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
        footer: {
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        selectionCount: { flex: 1, paddingLeft: Spacing.sm, color: colors.textMuted, fontSize: FontSize.xs },
        footerButton: { minWidth: 82, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
        footerButtonText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
    });
}
