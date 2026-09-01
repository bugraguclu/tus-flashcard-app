import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    InteractionManager,
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
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { getAllTags } from '../lib/noteManager';
import { useI18n } from '../hooks/useI18n';

interface TagPickerModalProps {
    visible: boolean;
    selectedTags: string[];
    onCancel: () => void;
    onConfirm: (tags: string[]) => void;
    /** Browser filters select existing collection tags; the editor keeps creation enabled. */
    allowCreate?: boolean;
    title?: string;
    /** Browser filters load only tags reachable from the active deck/card scope. */
    loadTags?: () => string[];
}

function tagKey(tag: string): string {
    return tag.normalize('NFC').toLowerCase();
}

function uniqueTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
        const normalized = raw.normalize('NFC').trim();
        const tag = tagKey(normalized) === 'marked' ? 'marked' : normalized;
        if (!tag) continue;
        const key = tagKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(tag);
    }
    return result;
}

/** Anki separates tags with whitespace and uses :: for hierarchical tag paths. */
function parseNewTags(raw: string): string[] {
    return uniqueTags(raw
        .split(/\s+/)
        .map((tag) => tag.replace(/[\u0000-\u001f\u007f]/g, ''))
        .map((tag) => tag.split('::').filter(Boolean).join('::'))
        .filter(Boolean));
}

export default function TagPickerModal({
    visible,
    selectedTags,
    onCancel,
    onConfirm,
    allowCreate = true,
    title,
    loadTags = getAllTags,
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
    const [loadingTags, setLoadingTags] = useState(false);

    useEffect(() => {
        if (!visible) return;
        Keyboard.dismiss();
        const selected = uniqueTags(selectedTags);
        // Paint the modal first. A collection can contain thousands of distinct tags; the SQL
        // aggregation and sort must not compete with the opening animation on the JS thread.
        setKnownTags(selected);
        setDraftTags(selected);
        setSearchText('');
        setNewTagText('');
        setSearchVisible(false);
        setAddVisible(false);
        setLoadingTags(true);
        let cancelled = false;
        const task = InteractionManager.runAfterInteractions(() => {
            try {
                const all = uniqueTags([...loadTags(), ...selected])
                    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
                if (!cancelled) setKnownTags(all);
            } finally {
                if (!cancelled) setLoadingTags(false);
            }
        });
        return () => {
            cancelled = true;
            task.cancel();
        };
    }, [visible, selectedTags, loadTags]);

    const selectedKeys = useMemo(() => new Set(draftTags.map(tagKey)), [draftTags]);
    const filteredTags = useMemo(() => {
        const query = searchVisible ? tagKey(searchText.trim()) : '';
        if (!query) return knownTags;
        return knownTags.filter((tag) => tagKey(tag).includes(query));
    }, [knownTags, searchText, searchVisible]);
    const allVisibleSelected = filteredTags.length > 0
        && filteredTags.every((tag) => selectedKeys.has(tagKey(tag)));

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
                            <View style={styles.searchPill}>
                                <Text style={styles.inputIcon}>⌕</Text>
                                <TextInput
                                    style={styles.searchInput}
                                    value={searchText}
                                    onChangeText={setSearchText}
                                    placeholder={l('Etiketlerde ara…', 'Search tags…')}
                                    placeholderTextColor={colors.textMuted}
                                    autoFocus
                                    autoCorrect={false}
                                    returnKeyType="search"
                                    clearButtonMode="while-editing"
                                    accessibilityLabel={l('Etiketlerde ara', 'Search tags')}
                                />
                                {searchText.length > 0 && Platform.OS !== 'ios' && (
                                    <TouchableOpacity
                                        style={styles.inlineAction}
                                        onPress={() => setSearchText('')}
                                        accessibilityLabel={l('Aramayı temizle', 'Clear search')}
                                    >
                                        <Text style={styles.inlineActionText}>×</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    {allowCreate && addVisible && (
                        <View style={styles.addPanel}>
                            <View style={styles.addInputRow}>
                                <TextInput
                                    style={styles.addInput}
                                    value={newTagText}
                                    onChangeText={setNewTagText}
                                    placeholder={l('Yeni etiket adı…', 'New tag name…')}
                                    placeholderTextColor={colors.textMuted}
                                    autoFocus
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    onSubmitEditing={addTags}
                                    accessibilityLabel={l('Yeni etiket adı', 'New tag name')}
                                />
                                <TouchableOpacity
                                    style={[styles.addButton, !newTagText.trim() && styles.buttonDisabled]}
                                    onPress={addTags}
                                    disabled={!newTagText.trim()}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('common.add')}
                                >
                                    <Text style={styles.addButtonText}>{t('common.add')}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.addHelperText}>
                                {l('Birden fazla etiket eklemek için boşluk kullanın.', 'Separate multiple tags with spaces.')}
                            </Text>
                        </View>
                    )}

                    {loadingTags ? (
                        <View style={styles.loadingState}>
                            <ActivityIndicator color={colors.accent} />
                            <Text style={styles.loadingText}>{l('Etiketler yükleniyor…', 'Loading tags…')}</Text>
                        </View>
                    ) : (
                    <FlatList
                        style={styles.list}
                        data={filteredTags}
                        keyExtractor={tagKey}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={16}
                        maxToRenderPerBatch={16}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS !== 'web'}
                        ListEmptyComponent={(
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>{l('Etiket bulunamadı', 'No tags found')}</Text>
                                <Text style={styles.emptyText}>
                                    {allowCreate
                                        ? l('＋ düğmesiyle yeni bir etiket ekleyebilirsiniz.', 'Use ＋ to add a new tag.')
                                        : l('Koleksiyonda bu aramayla eşleşen etiket yok.', 'No collection tag matches this search.')}
                                </Text>
                            </View>
                        )}
                        renderItem={({ item: tag }) => {
                            const selected = selectedKeys.has(tagKey(tag));
                            const depth = Math.max(0, tag.split('::').length - 1);
                            return (
                                <TouchableOpacity
                                    key={tagKey(tag)}
                                    style={[styles.tagRow, { paddingLeft: Spacing.md + Math.min(depth, 8) * 18 }]}
                                    onPress={() => toggleTag(tag)}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: selected }}
                                    accessibilityLabel={tag.replaceAll('::', ' › ')}
                                >
                                    <Text style={[styles.tagText, selected && styles.tagTextSelected]} numberOfLines={2}>
                                        {tag.replaceAll('::', ' › ')}
                                    </Text>
                                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                                        {selected && <Text style={styles.checkboxTick}>✓</Text>}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                    )}

                    <View style={styles.footer}>
                        <Text style={styles.selectionCount}>
                            {l(`${draftTags.length} seçili`, `${draftTags.length} selected`)}
                        </Text>
                        <TouchableOpacity style={styles.footerButton} onPress={onCancel}>
                            <Text style={styles.footerButtonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.footerButton, styles.footerConfirmButton]} onPress={() => onConfirm(uniqueTags(draftTags))}>
                            <Text style={styles.footerConfirmText}>{l('Onayla', 'Confirm')}</Text>
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
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.xs,
            backgroundColor: colors.accent,
        },
        headerTitle: { flex: 1, color: colors.white, fontSize: FontSize.lg, fontWeight: '700' },
        headerAction: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.full,
        },
        headerActionActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
        headerActionText: { color: colors.white, fontSize: 24, lineHeight: 26, fontWeight: '400' },
        searchIcon: { color: colors.white, fontSize: 22, lineHeight: 24 },
        selectAllCheckbox: {
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: BorderRadius.sm,
            backgroundColor: 'transparent',
        },
        selectAllCheckboxSelected: {
            borderWidth: 2,
            borderColor: colors.white,
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
        },
        selectAllCheckboxTick: {
            color: colors.white,
            fontSize: 15,
            lineHeight: 16,
            fontWeight: '900',
        },
        inputBar: {
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        searchPill: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.borderLight,
            paddingHorizontal: Spacing.md,
            minHeight: 44,
        },
        inputIcon: { color: colors.textMuted, fontSize: 18, marginRight: Spacing.xs },
        searchInput: {
            flex: 1,
            minHeight: 40,
            color: colors.textPrimary,
            fontSize: FontSize.md,
            paddingVertical: Platform.OS === 'ios' ? 8 : 4,
            paddingHorizontal: 0,
        },
        inlineAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
        inlineActionText: { color: colors.textMuted, fontSize: 22, fontWeight: '400' },
        addPanel: {
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        addInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
        },
        addInput: {
            flex: 1,
            minHeight: 44,
            paddingHorizontal: Spacing.md,
            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
            color: colors.textPrimary,
            fontSize: FontSize.md,
            backgroundColor: colors.bgInput,
            borderWidth: 1,
            borderColor: colors.borderLight,
            borderRadius: BorderRadius.md,
        },
        addButton: {
            minWidth: 70,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.md,
        },
        addButtonText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '700' },
        addHelperText: {
            fontSize: FontSize.xs,
            color: colors.textMuted,
            marginTop: 6,
            paddingHorizontal: 2,
            lineHeight: 16,
        },
        buttonDisabled: { opacity: 0.45 },
        list: { flex: 1 },
        loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
        loadingText: { color: colors.textMuted, fontSize: FontSize.sm },
        tagRow: {
            minHeight: 50,
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
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgCard,
        },
        checkboxSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
        checkboxTick: { color: colors.white, fontSize: 15, lineHeight: 16, fontWeight: '900' },
        emptyState: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: 56 },
        emptyTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        emptyText: { marginTop: Spacing.sm, color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
        footer: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        selectionCount: { flex: 1, paddingLeft: Spacing.xs, color: colors.textSecondary, fontSize: FontSize.xs, fontWeight: '500' },
        footerButton: { minWidth: 76, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
        footerConfirmButton: { backgroundColor: colors.accentLight, marginLeft: Spacing.xs },
        footerButtonText: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        footerConfirmText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
    });
}
