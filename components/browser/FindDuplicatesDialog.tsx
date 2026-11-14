import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, InteractionManager, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { AppDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { ChevronRightIcon } from '../ui/icons';
import type { ColorScheme } from '../../constants/theme';
import type { NoteType } from '../../lib/models';
import type { CollectionChange } from '../../lib/deferredInvalidation';
import { localizeFieldName, type SupportedLocale } from '../../lib/i18n';
import { alert, confirm } from '../../lib/confirm';
import { commitCollectionWrite } from '../../lib/collectionWrite';
import { isValidSearchQuery } from '../../lib/searchValidation';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import { fieldNamesOfNoteTypes } from '../../lib/browserFieldNames';
import { DUPLICATE_TAG, duplicateNoteIds, findDuplicates, tagDuplicates, type DuplicateGroup } from '../../lib/findDuplicates';
import { ChoiceSelect } from './noteToolControls';
import { noteCount } from './noteToolMessages';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import type { NoteToolStyles } from './noteToolStyles';

interface FindDuplicatesDialogProps {
    colors: ColorScheme;
    /** The collection's revision: results found before an edit are searched again on reopening. */
    dataVersion: number;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    noteTypes: NoteType[];
    onChanged: (change: CollectionChange) => void;
    onClose: () => void;
    /** Show a group's notes in the list: a search, applied in place. */
    onShowGroup: (search: string) => void;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    toolStyles: NoteToolStyles;
    visible: boolean;
}

interface Results {
    groups: DuplicateGroup[];
    fieldName: string;
    search: string;
    dataVersion: number;
}

type Notice = { tone: 'info' | 'error'; text: string } | null;

/** Anki's Find Duplicates: a field, an optional search, the groups, and Tag Duplicates. */
export function FindDuplicatesDialog({
    colors,
    dataVersion,
    l,
    locale,
    noteTypes,
    onChanged,
    onClose,
    onShowGroup,
    styles,
    t,
    toolStyles,
    visible,
}: FindDuplicatesDialogProps) {
    const fieldNames = useMemo(() => fieldNamesOfNoteTypes(noteTypes), [noteTypes]);
    const [fieldName, setFieldName] = useState<string | null>(null);
    const [fieldOpen, setFieldOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState<'searching' | 'tagging' | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    // Kept while the browser is open, so coming back from a group shows the list again.
    const [results, setResults] = useState<Results | null>(null);
    const runRef = useRef(0);

    // The stock "Front" field is the usual first choice; otherwise the first name in the list.
    const field = fieldName && fieldNames.includes(fieldName)
        ? fieldName
        : fieldNames.find((name) => name === 'Front') ?? fieldNames[0] ?? '';
    const options = useMemo(
        () => fieldNames.map((name) => ({ key: name, label: localizeFieldName(locale, name) })),
        [fieldNames, locale],
    );

    const run = (searchField: string, searchText: string) => {
        if (!searchField) return;
        if (searchText.trim() && !isValidSearchQuery(searchText)) {
            setNotice({ tone: 'error', text: l('Arama geçersiz. Terimleri, tırnakları ve parantezleri kontrol edin.', 'Invalid search. Check the terms, quotes and parentheses.') });
            return;
        }
        setNotice(null);
        setFieldOpen(false);
        setBusy('searching');
        const token = ++runRef.current;
        // Comparing reads every note in scope; the spinner paints first.
        InteractionManager.runAfterInteractions(() => {
            if (token !== runRef.current) return;
            try {
                setResults({ groups: findDuplicates(searchField, searchText, noteTypes), fieldName: searchField, search: searchText, dataVersion });
            } catch (error) {
                console.warn('[Browser] find duplicates failed:', error);
                setNotice({ tone: 'error', text: userFacingErrorMessage(error, l('Yinelenenler aranamadı.', 'Duplicates could not be searched.')) });
            } finally {
                setBusy(null);
            }
        });
    };

    // Results found before the collection changed are found again when the dialog reopens.
    useEffect(() => {
        if (!visible) return;
        setNotice(null);
        if (results && results.dataVersion !== dataVersion) run(results.fieldName, results.search);
        // Only reopening decides this; a change while the dialog is open keeps its list.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const close = () => {
        if (busy === 'tagging') return;
        runRef.current += 1;
        setBusy(null);
        onClose();
    };

    const showGroup = (group: DuplicateGroup) => {
        onClose();
        onShowGroup(group.search);
    };

    const tagAll = () => {
        if (!results || results.groups.length === 0 || busy) return;
        const ids = duplicateNoteIds(results.groups);
        confirm(
            l('Yinelenenleri etiketle', 'Tag Duplicates'),
            l(
                `${noteCount(ids.length, l)} “${DUPLICATE_TAG}” etiketini alacak. Etiketi zaten olan notlar değişmez.`,
                `${noteCount(ids.length, l)} will get the tag “${DUPLICATE_TAG}”. Notes that already have it stay as they are.`,
            ),
            () => {
                void (async () => {
                    setBusy('tagging');
                    try {
                        const tagged = await commitCollectionWrite(() => tagDuplicates(results.groups));
                        // Tags belong to notes, so a study session keeps its queue, as in Anki.
                        onChanged({ keepsStudyQueue: true });
                        setNotice({
                            tone: 'info',
                            text: l(`${noteCount(tagged, l)} “${DUPLICATE_TAG}” etiketini aldı.`, `${noteCount(tagged, l)} got the tag “${DUPLICATE_TAG}”.`),
                        });
                    } catch (error) {
                        console.warn('[Browser] tag duplicates failed:', error);
                        alert(t('common.error'), userFacingErrorMessage(error, l('Notlar etiketlenemedi; hiçbir not değişmedi.', 'The notes could not be tagged; no note changed.')));
                    } finally {
                        setBusy(null);
                    }
                })();
            },
            { confirmLabel: l('Etiketle', 'Tag') },
        );
    };

    const groups = results?.groups ?? [];
    const groupedNotes = useMemo(() => duplicateNoteIds(groups).length, [groups]);

    return (
        <AppDialog
            visible={visible}
            onClose={close}
            title={l('Yinelenenleri bul', 'Find Duplicates')}
            message={l('Seçilen alanı aynı olan notlar gruplanır; biçimlendirme yok sayılır, medya dosya adları korunur.', 'Notes whose chosen field is the same are grouped; formatting is ignored, media file names are kept.')}
            closeLabel={l('Yinelenenleri bul penceresini kapat', 'Close Find Duplicates')}
            actions={(
                <>
                    {groups.length > 0 && (
                        <Button
                            variant="secondary"
                            label={l('Yinelenenleri etiketle', 'Tag Duplicates')}
                            onPress={tagAll}
                            disabled={busy !== null}
                        />
                    )}
                    <Button variant="plain" label={t('common.close')} onPress={close} disabled={busy === 'tagging'} />
                </>
            )}
        >
            <Text style={styles.fieldLabel}>{l('Alan', 'Field')}</Text>
            <ChoiceSelect
                disabled={busy !== null}
                expanded={fieldOpen}
                label={l('Alan', 'Field')}
                onSelect={(key) => { setFieldName(key); setFieldOpen(false); }}
                onToggle={() => setFieldOpen((open) => !open)}
                options={options}
                selectedKey={field}
                toolStyles={toolStyles}
            />
            <Text style={styles.fieldLabel}>{l('İsteğe bağlı arama', 'Optional search')}</Text>
            <View style={toolStyles.searchRow}>
                <TextField
                    style={toolStyles.searchInput}
                    value={search}
                    onChangeText={(value) => { setSearch(value); setNotice(null); }}
                    editable={busy === null}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => run(field, search)}
                    placeholder={l('örn. deck:Anatomi', 'e.g. deck:Anatomy')}
                    accessibilityLabel={l('İsteğe bağlı arama', 'Optional search')}
                />
                <Button
                    size="compact"
                    label={l('Ara', 'Search')}
                    accessibilityLabel={l('Yinelenenleri ara', 'Search for duplicates')}
                    onPress={() => run(field, search)}
                    disabled={busy !== null || !field}
                />
            </View>
            {notice && (
                <Text style={[toolStyles.notice, notice.tone === 'error' && toolStyles.noticeError]} accessibilityLiveRegion="polite">
                    {notice.text}
                </Text>
            )}
            {busy && (
                <View style={toolStyles.busyRow} accessibilityLiveRegion="polite">
                    <ActivityIndicator color={colors.accent} />
                    <Text style={toolStyles.busyText}>
                        {busy === 'searching' ? l('Notlar karşılaştırılıyor…', 'Comparing notes…') : l('Notlar etiketleniyor…', 'Tagging notes…')}
                    </Text>
                </View>
            )}
            {results && busy !== 'searching' && (
                <Text style={toolStyles.resultSummary} accessibilityLiveRegion="polite">
                    {groups.length === 0
                        ? l('Yinelenen not bulunamadı.', 'No duplicates found.')
                        : l(
                            `${groups.length} grupta ${groupedNotes} not bulundu.`,
                            `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} found across ${noteCount(groupedNotes, l)}.`,
                        )}
                </Text>
            )}
            {results && busy !== 'searching' && groups.length > 0 && (
                <FlatList
                    style={toolStyles.groupList}
                    data={groups}
                    keyExtractor={(group) => group.noteIds.join(',')}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={12}
                    renderItem={({ item: group }) => {
                        const shown = group.value.trim() ? group.value : l('(yalnızca boşluk)', '(spaces only)');
                        return (
                            <TouchableOpacity
                                style={toolStyles.groupRow}
                                onPress={() => showGroup(group)}
                                accessibilityRole="button"
                                accessibilityLabel={`${noteCount(group.noteIds.length, l)}: ${shown}`}
                                accessibilityHint={l('Bu notları listede gösterir', 'Shows these notes in the list')}
                            >
                                <Text style={toolStyles.groupCount}>{noteCount(group.noteIds.length, l)}</Text>
                                <Text style={toolStyles.groupValue} numberOfLines={2}>{shown}</Text>
                                <ChevronRightIcon color={colors.textMuted} />
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </AppDialog>
    );
}
