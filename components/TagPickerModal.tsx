import { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    InteractionManager,
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
import { FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { getAllTags } from '../lib/noteManager';
import { filterTagsForSearch, searchNamesKnownTag } from '../lib/tagPickerFilter';
import { useI18n } from '../hooks/useI18n';
import { Button, CloseButton, IconButton } from './ui/Button';
import { Divider } from './ui/Card';
import { Badge, Checkbox } from './ui/Choice';
import { EmptyState, LoadingState } from './ui/Feedback';
import { SearchField, TextField } from './ui/Fields';
import { PlusIcon } from './ui/icons';
import { HIT_TARGET, Radius, Type } from './ui/tokens';

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
    /** Offered where tags can be renamed (the browser's tag filter): holding a row asks for it. */
    onRenameTag?: (tag: string) => void;
}

/** Which entries are the same tag. The search field matches by its own, looser rules (lib/tagPickerFilter.ts). */
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
    onRenameTag,
}: TagPickerModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [knownTags, setKnownTags] = useState<string[]>([]);
    const [draftTags, setDraftTags] = useState<string[]>([]);
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
    const trimmedQuery = searchText.trim();
    const filteredTags = useMemo(
        () => filterTagsForSearch(knownTags, trimmedQuery),
        [knownTags, trimmedQuery],
    );

    const hasExactMatch = useMemo(
        () => searchNamesKnownTag(knownTags, trimmedQuery),
        [knownTags, trimmedQuery],
    );

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

    const quickAddTag = (raw: string) => {
        const parsed = parseNewTags(raw);
        if (parsed.length === 0) return;

        const canonical = parsed.map((tag) => (
            knownTags.find((known) => tagKey(known) === tagKey(tag)) ?? tag
        ));
        setKnownTags((current) => uniqueTags([...current, ...canonical])
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
        setDraftTags((current) => uniqueTags([...current, ...canonical]));
        setSearchText('');
        Keyboard.dismiss();
    };

    const toggleAdd = () => {
        if (addVisible) Keyboard.dismiss();
        setAddVisible((current) => !current);
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
                style={[styles.overlay, { backgroundColor: colors.scrim }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onCancel}
                    accessibilityRole="button"
                    accessibilityLabel={l('Etiket penceresini kapat', 'Close tags dialog')}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <View style={styles.header}>
                        <Text style={[Type.title, styles.headerTitle]} numberOfLines={1} accessibilityRole="header">
                            {title ?? l('Etiketler', 'Tags')}
                        </Text>
                        {allowCreate && (
                            <IconButton
                                style={addVisible ? { backgroundColor: colors.accentLight } : undefined}
                                onPress={toggleAdd}
                                selected={addVisible}
                                accessibilityLabel={l('Yeni etiket ekle', 'Add new tag')}
                            >
                                <PlusIcon color={colors.accent} />
                            </IconButton>
                        )}
                        {/* The tick box selects every tag the search leaves visible. */}
                        <TouchableOpacity
                            style={styles.headerCheck}
                            onPress={toggleAllVisible}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: allVisibleSelected }}
                            aria-checked={allVisibleSelected}
                            accessibilityLabel={allVisibleSelected
                                ? l('Görünen etiketlerin seçimini kaldır', 'Deselect all visible tags')
                                : l('Görünen etiketlerin tümünü seç', 'Select all visible tags')}
                        >
                            <Checkbox checked={allVisibleSelected} />
                        </TouchableOpacity>
                        <CloseButton accessibilityLabel={l('Kapat', 'Close')} onPress={onCancel} />
                    </View>

                    <View style={styles.searchContainer}>
                        <SearchField
                            value={searchText}
                            onChangeText={setSearchText}
                            placeholder={l('Etiketlerde ara…', 'Search tags…')}
                            autoCapitalize="none"
                            clearLabel={l('Aramayı temizle', 'Clear search')}
                            accessibilityLabel={l('Etiketlerde ara', 'Search tags')}
                        />
                        {onRenameTag && (
                            <Text style={styles.renameHint}>
                                {l('Yeniden adlandırmak için bir etikete basılı tutun.', 'Hold a tag to rename it.')}
                            </Text>
                        )}
                    </View>

                    {allowCreate && addVisible && (
                        <View style={styles.addPanel}>
                            <View style={styles.addInputRow}>
                                <TextField
                                    style={styles.addInput}
                                    value={newTagText}
                                    onChangeText={setNewTagText}
                                    placeholder={l('Yeni etiket adı…', 'New tag name…')}
                                    autoFocus
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    onSubmitEditing={addTags}
                                    accessibilityLabel={l('Yeni etiket adı', 'New tag name')}
                                />
                                <Button
                                    label={t('common.add')}
                                    size="compact"
                                    onPress={addTags}
                                    disabled={!newTagText.trim()}
                                />
                            </View>
                            <Text style={[Type.caption, styles.addHelperText]}>
                                {l('Birden fazla etiketi boşlukla ayırın. Alt etiket için :: kullanın (ör. farmakoloji::antibiyotik).', 'Separate several tags with spaces. Use :: for a sub-tag (e.g. pharmacology::antibiotics).')}
                            </Text>
                        </View>
                    )}

                    {allowCreate && trimmedQuery.length > 0 && !hasExactMatch && (
                        <TouchableOpacity
                            style={styles.quickAddRow}
                            onPress={() => quickAddTag(trimmedQuery)}
                            accessibilityRole="button"
                            accessibilityLabel={l(`"${trimmedQuery}" etiketini ekle`, `Add tag "${trimmedQuery}"`)}
                        >
                            <View style={[styles.quickAddIcon, { backgroundColor: colors.accent }]}>
                                <PlusIcon color={colors.onAccent} size={16} />
                            </View>
                            <Text style={styles.quickAddText} numberOfLines={1}>
                                {l(`"${trimmedQuery}" etiketini ekle`, `Add tag "${trimmedQuery}"`)}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {loadingTags ? (
                        <LoadingState label={l('Etiketler yükleniyor…', 'Loading tags…')} style={styles.loadingState} />
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
                            ItemSeparatorComponent={Divider}
                            ListEmptyComponent={(
                                <EmptyState
                                    title={l('Etiket bulunamadı', 'No tags found')}
                                    body={allowCreate
                                        ? l('Yeni bir etiket eklemek için arama kutusunu veya ＋ düğmesini kullanabilirsiniz.', 'Use search or ＋ to add a new tag.')
                                        : l('Koleksiyonda bu aramayla eşleşen etiket yok.', 'No collection tag matches this search.')}
                                />
                            )}
                            renderItem={({ item: tag }) => {
                                const selected = selectedKeys.has(tagKey(tag));
                                const depth = Math.max(0, tag.split('::').length - 1);
                                return (
                                    <TouchableOpacity
                                        key={tagKey(tag)}
                                        style={[
                                            styles.tagRow,
                                            { paddingLeft: Spacing.lg + Math.min(depth, 8) * 18 },
                                        ]}
                                        onPress={() => toggleTag(tag)}
                                        onLongPress={onRenameTag ? () => onRenameTag(tag) : undefined}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                        aria-checked={selected}
                                        accessibilityLabel={tag.replaceAll('::', ' › ')}
                                        accessibilityActions={onRenameTag ? [{ name: 'rename', label: l('Yeniden adlandır', 'Rename') }] : undefined}
                                        onAccessibilityAction={onRenameTag
                                            ? (event) => { if (event.nativeEvent.actionName === 'rename') onRenameTag(tag); }
                                            : undefined}
                                    >
                                        <Text style={[styles.tagText, selected && styles.tagTextSelected]} numberOfLines={2}>
                                            {tag.replaceAll('::', ' › ')}
                                        </Text>
                                        <Checkbox checked={selected} />
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    )}

                    <View style={styles.footer}>
                        <View style={styles.selectionInfo}>
                            <Badge label={String(draftTags.length)} tone={draftTags.length > 0 ? 'accent' : 'neutral'} style={styles.selectionBadge} />
                            <Text style={[Type.bodyStrong, { color: colors.textPrimary }]}>
                                {l('seçili', 'selected')}
                            </Text>
                        </View>

                        <View style={styles.footerActions}>
                            <Button label={t('common.cancel')} variant="plain" onPress={onCancel} />
                            <Button label={l('Onayla', 'Confirm')} onPress={() => onConfirm(uniqueTags(draftTags))} />
                        </View>
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
        },
        card: {
            width: '100%',
            maxWidth: 440,
            height: '82%',
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: Radius.card,
            ...Shadows.lg,
        },
        // A white header inside the card, as every picker and dialog draws it.
        header: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.xs,
        },
        headerTitle: { flex: 1, color: colors.textPrimary },
        headerCheck: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
        searchContainer: {
            paddingHorizontal: Spacing.lg,
            paddingBottom: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        renameHint: { marginTop: Spacing.xs, color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },
        addPanel: {
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        addInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm + 2,
        },
        addInput: { flex: 1 },
        addHelperText: { color: colors.textMuted, marginTop: 6, paddingHorizontal: 2 },
        quickAddRow: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm + 2,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm + 2,
            backgroundColor: colors.accentLight,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        quickAddIcon: {
            width: 26,
            height: 26,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
        },
        quickAddText: {
            flex: 1,
            color: colors.accent,
            fontSize: FontSize.lg,
            fontWeight: '600',
        },
        list: { flex: 1 },
        loadingState: { flex: 1 },
        tagRow: {
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingRight: Spacing.lg,
            paddingVertical: Spacing.sm + 2,
            backgroundColor: colors.bgCard,
        },
        tagText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md + 1 },
        tagTextSelected: { color: colors.accent, fontWeight: '600' },
        footer: {
            minHeight: 68,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            gap: Spacing.md,
        },
        selectionInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            flexShrink: 1,
        },
        selectionBadge: { alignSelf: 'center' },
        footerActions: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
        },
    });
}
