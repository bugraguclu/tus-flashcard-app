import { useEffect, useMemo, useState } from 'react';
import { FlatList, InteractionManager, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { longPressHaptic } from '../lib/haptics';
import { countForTag, countMatchingSelectedTags, type BrowserTagFacetCounts } from '../lib/browserFilterCounts';
import type { BrowserTableMode } from '../lib/browserRepository';
import { getAllTags } from '../lib/noteManager';
import { filterTagsForSearch, searchNamesKnownTag } from '../lib/tagPickerFilter';
import { useI18n } from '../hooks/useI18n';
import { Button, IconButton } from './ui/Button';
import { Divider } from './ui/Card';
import { Badge, Checkbox, CheckRow } from './ui/Choice';
import { AppDialog } from './ui/Dialog';
import { EmptyState, LoadingState } from './ui/Feedback';
import { SearchField, TextField } from './ui/Fields';
import { PlusIcon } from './ui/icons';
import { Type } from './ui/tokens';

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
    loadTagCounts?: () => BrowserTagFacetCounts;
    resultUnit?: BrowserTableMode;
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
    loadTagCounts,
    resultUnit = 'cards',
    onRenameTag,
}: TagPickerModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [tagFacetCounts, setTagFacetCounts] = useState<BrowserTagFacetCounts | null>(null);
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
        setTagFacetCounts(null);
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
                if (loadTagCounts) {
                    try { const counts = loadTagCounts(); if (!cancelled) setTagFacetCounts(counts); }
                    catch (error) { console.warn('[TagPickerModal] counts failed:', error); }
                }
            } catch (error) {
                console.warn('[TagPickerModal] tag load failed:', error);
            } finally {
                if (!cancelled) setLoadingTags(false);
            }
        });
        return () => {
            cancelled = true;
            task.cancel();
        };
    }, [visible, selectedTags, loadTags, loadTagCounts]);

    const previewCount = tagFacetCounts ? countMatchingSelectedTags(tagFacetCounts, draftTags) : null;
    const confirmLabel = previewCount === null ? l('Onayla', 'Confirm') : resultUnit === 'notes'
        ? l(`${previewCount} not göster`, `Show ${previewCount} notes`)
        : l(`${previewCount} kart göster`, `Show ${previewCount} cards`);
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

    // A tag still sitting in the "new tag" field is one the learner meant to add: Onayla keeps
    // it, where it used to close the picker without it and without a word.
    const confirmTags = () => {
        const pending = addVisible
            ? parseNewTags(newTagText).map((tag) => knownTags.find((known) => tagKey(known) === tagKey(tag)) ?? tag)
            : [];
        onConfirm(uniqueTags([...draftTags, ...pending]));
    };

    const toggleAdd = () => {
        if (addVisible) Keyboard.dismiss();
        setAddVisible((current) => !current);
    };

    return (
        <AppDialog
            visible={visible}
            onClose={onCancel}
            title={title ?? l('Etiketler', 'Tags')}
            closeButton
            closeLabel={l('Etiket penceresini kapat', 'Close tags dialog')}
            cardStyle={styles.card}
            headerAccessory={(
                <>
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
                    <Checkbox
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        accessibilityLabel={allVisibleSelected
                            ? l('Görünen etiketlerin seçimini kaldır', 'Deselect all visible tags')
                            : l('Görünen etiketlerin tümünü seç', 'Select all visible tags')}
                    />
                </>
            )}
            actions={(
                <>
                    <View style={styles.selectionInfo}>
                        <Badge label={String(draftTags.length)} tone={draftTags.length > 0 ? 'accent' : 'neutral'} />
                        <Text style={[Type.bodyStrong, { color: colors.textPrimary }]}>
                            {l('seçili', 'selected')}
                        </Text>
                    </View>
                    <Button label={t('common.cancel')} variant="plain" onPress={onCancel} />
                    <Button label={confirmLabel} onPress={confirmTags} />
                </>
            )}
        >
            <View>
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
                <View>
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
                <Button
                    variant="secondary"
                    label={l(`"${trimmedQuery}" etiketini ekle`, `Add tag "${trimmedQuery}"`)}
                    icon={<PlusIcon color={colors.accent} size={20} />}
                    numberOfLines={1}
                    onPress={() => quickAddTag(trimmedQuery)}
                />
            )}

            {loadingTags ? (
                <LoadingState label={l('Etiketler yükleniyor…', 'Loading tags…')} style={styles.list} />
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
                        const depth = Math.max(0, tag.split('::').length - 1);
                        const path = tag.replaceAll('::', ' › ');
                        return (
                            <CheckRow
                                key={tagKey(tag)}
                                label={path}
                                accessory={tagFacetCounts ? <Badge label={String(countForTag(tagFacetCounts, tag))} /> : undefined}
                                accessibilityLabel={tagFacetCounts ? `${path}, ${countForTag(tagFacetCounts, tag)} ${resultUnit === 'notes' ? l('not', 'notes') : l('kart', 'cards')}` : path}
                                checked={selectedKeys.has(tagKey(tag))}
                                onChange={() => toggleTag(tag)}
                                onLongPress={onRenameTag ? () => { longPressHaptic(); onRenameTag(tag); } : undefined}
                                accessibilityActions={onRenameTag ? [{ name: 'rename', label: l('Yeniden adlandır', 'Rename') }] : undefined}
                                onAccessibilityAction={onRenameTag
                                    ? (event) => { if (event.nativeEvent.actionName === 'rename') onRenameTag(tag); }
                                    : undefined}
                                // The dialog's own padding is the rows' inset; a sub-tag steps in under its parent.
                                style={{ paddingHorizontal: 0, paddingLeft: Math.min(depth, 8) * 18 }}
                            />
                        );
                    }}
                />
            )}
        </AppDialog>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // A fixed height, so the list keeps its room while the search narrows it.
        card: { height: '82%' },
        renameHint: { marginTop: Spacing.xs, color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },
        addInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
        addInput: { flex: 1 },
        addHelperText: { color: colors.textMuted, marginTop: Spacing.s6, paddingHorizontal: Spacing.xxs },
        list: { flex: 1 },
        // Sits at the start of the actions row; the auto margin sends Cancel and Confirm to its end.
        selectionInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1, marginRight: 'auto' },
    });
}
