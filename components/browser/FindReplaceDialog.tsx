import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, ScrollView, View } from 'react-native';
import { Text } from '../AppText';
import { AppDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import type { ColorScheme } from '../../constants/theme';
import type { NoteType } from '../../lib/models';
import type { CollectionChange } from '../../lib/deferredInvalidation';
import { localizeFieldName, type SupportedLocale } from '../../lib/i18n';
import { alert, confirm } from '../../lib/confirm';
import { setDbSetting } from '../../lib/storage';
import { fieldNamesOfNoteTypes } from '../../lib/browserFieldNames';
import {
    compileFindReplace,
    findReplaceWithBackup,
    FindReplaceInputError,
    previewFindReplace,
    type FindReplaceErrorCode,
    type FindReplacePreview,
    type FindReplaceRequest,
} from '../../lib/findReplace';
import { readBrowserBoolean } from './browserHelpers';
import { ChoiceSelect, ToolCheckbox } from './noteToolControls';
import { bulkEditFailure, noteCount } from './noteToolMessages';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import type { NoteToolStyles } from './noteToolStyles';

/** Anki keeps both choices from one use to the next; these are the browser's own keys. */
const IGNORE_CASE_KEY = 'browser_find_replace_ignore_case';
const REGEX_KEY = 'browser_find_replace_regex';

interface FindReplaceDialogProps {
    colors: ColorScheme;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    noteTypes: NoteType[];
    onChanged: (change: CollectionChange) => void;
    onClose: () => void;
    /** The notes selected in the browser; empty when nothing is selected. */
    selectedNoteIds: number[];
    /** The note types of the selected notes, whose fields "In" lists while the selection is the scope. */
    selectedNoteTypeIds: number[];
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    toolStyles: NoteToolStyles;
    visible: boolean;
}

type Notice = { tone: 'info' | 'error'; text: string } | null;

/** Anki's Find and Replace: Find, Replace With, In, and its three options. */
export function FindReplaceDialog({
    colors,
    l,
    locale,
    noteTypes,
    onChanged,
    onClose,
    selectedNoteIds,
    selectedNoteTypeIds,
    styles,
    t,
    toolStyles,
    visible,
}: FindReplaceDialogProps) {
    // Find and Replace With stay filled in for the next use while the browser is open.
    const [find, setFind] = useState('');
    const [replacement, setReplacement] = useState('');
    const [targetKey, setTargetKey] = useState('fields');
    const [targetOpen, setTargetOpen] = useState(false);
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [ignoreCase, setIgnoreCase] = useState(() => readBrowserBoolean(IGNORE_CASE_KEY, true));
    const [regex, setRegex] = useState(() => readBrowserBoolean(REGEX_KEY, false));
    const [busy, setBusy] = useState<'counting' | 'applying' | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const runRef = useRef(0);
    const hasSelection = selectedNoteIds.length > 0;

    // As in Anki, "Selected notes only" starts on whenever notes are selected and is unavailable
    // otherwise; turning it off applies the change to the whole collection.
    useEffect(() => {
        if (!visible) return;
        setSelectedOnly(hasSelection);
        setTargetOpen(false);
        setNotice(null);
        setBusy(null);
    }, [visible, hasSelection]);

    const inSelection = selectedOnly && hasSelection;
    const options = useMemo(() => [
        { key: 'fields', label: l('Tüm alanlar', 'All fields') },
        { key: 'tags', label: l('Etiketler', 'Tags') },
        ...fieldNamesOfNoteTypes(noteTypes, inSelection ? selectedNoteTypeIds : undefined)
            .map((name) => ({ key: `field:${name}`, label: localizeFieldName(locale, name) })),
    ], [inSelection, l, locale, noteTypes, selectedNoteTypeIds]);
    // A field the current scope does not have falls back to every field.
    const target = options.some((option) => option.key === targetKey) ? targetKey : 'fields';

    const close = () => {
        if (busy === 'applying') return;
        runRef.current += 1;
        setBusy(null);
        onClose();
    };

    const inputMessage = (code: FindReplaceErrorCode) => {
        switch (code) {
            case 'empty-find': return l('Bulunacak metni yazın.', 'Type the text to find.');
            case 'invalid-regex': return l('Düzenli ifade geçersiz; hiçbir not değiştirilmedi.', 'The regular expression is not valid; no note was changed.');
            case 'tag-separator': return l('Etiketler boşluk içeremez, bu yüzden yeni metinde boşluk olamaz.', 'Tags cannot contain spaces, so the replacement cannot either.');
        }
    };

    const buildRequest = (): FindReplaceRequest => ({
        find,
        replacement,
        target: target === 'fields'
            ? { kind: 'fields' }
            : target === 'tags'
                ? { kind: 'tags' }
                : { kind: 'field', name: target.slice('field:'.length) },
        noteIds: inSelection ? selectedNoteIds : null,
        ignoreCase,
        regex,
    });

    const confirmMessage = (preview: FindReplacePreview) => {
        const scope = inSelection
            ? l(`Kapsam: seçili ${noteCount(preview.scopeNoteCount, l)}.`, `Scope: ${noteCount(preview.scopeNoteCount, l)} selected.`)
            : l(`Kapsam: tüm koleksiyon (${noteCount(preview.scopeNoteCount, l)}).`, `Scope: the whole collection (${noteCount(preview.scopeNoteCount, l)}).`);
        return [
            scope,
            l(`${noteCount(preview.changeCount, l)} değişecek.`, `${noteCount(preview.changeCount, l)} will change.`),
            preview.protectedCount > 0
                ? l(`${preview.protectedCount} katalog notu korumalı olduğu için olduğu gibi kalacak.`, `${preview.protectedCount} protected catalog notes will stay as they are.`)
                : null,
            l('Değiştirmeden önce koleksiyonun bir güvenlik yedeği alınır.', 'A safety backup of the collection is taken first.'),
        ].filter(Boolean).join('\n');
    };

    const apply = async (request: FindReplaceRequest) => {
        setBusy('applying');
        try {
            const { backupFileName, result } = await findReplaceWithBackup(request);
            setBusy(null);
            onClose();
            onChanged({ keepsStudyQueue: !result.cardsChanged });
            alert(l('Bul ve değiştir', 'Find and Replace'), [
                l(`${result.updated} not güncellendi.`, result.updated === 1 ? '1 note updated.' : `${result.updated} notes updated.`),
                result.protectedSkipped > 0
                    ? l(`${result.protectedSkipped} katalog notu korumalı olduğu için değiştirilmedi.`, `${result.protectedSkipped} protected catalog notes were left unchanged.`)
                    : null,
                l(`Koleksiyonun önceki hâli ${backupFileName} yedeğinde.`, `The collection as it was is in the backup ${backupFileName}.`),
            ].filter(Boolean).join('\n'));
        } catch (error) {
            console.warn('[Browser] find and replace failed:', error);
            setBusy(null);
            if (error instanceof FindReplaceInputError) {
                setNotice({ tone: 'error', text: inputMessage(error.code) });
                return;
            }
            const failure = bulkEditFailure(error, { l, t });
            alert(failure.title, failure.message);
        }
    };

    const submit = () => {
        if (busy) return;
        const request = buildRequest();
        try {
            compileFindReplace(request);
        } catch (error) {
            if (!(error instanceof FindReplaceInputError)) throw error;
            setNotice({ tone: 'error', text: inputMessage(error.code) });
            return;
        }
        setDbSetting(IGNORE_CASE_KEY, ignoreCase ? '1' : '0');
        setDbSetting(REGEX_KEY, regex ? '1' : '0');
        setNotice(null);
        setTargetOpen(false);
        setBusy('counting');
        const run = ++runRef.current;
        // Counting reads every note in scope; the spinner paints first.
        InteractionManager.runAfterInteractions(() => {
            if (run !== runRef.current) return;
            let preview: FindReplacePreview;
            try {
                preview = previewFindReplace(request);
            } catch (error) {
                console.warn('[Browser] find and replace preview failed:', error);
                setBusy(null);
                setNotice({ tone: 'error', text: l('Notlar okunamadı; hiçbir not değiştirilmedi.', 'The notes could not be read; no note was changed.') });
                return;
            }
            setBusy(null);
            if (preview.changeCount === 0) {
                setNotice({
                    tone: 'info',
                    text: preview.protectedCount > 0
                        ? l(`Yalnızca korumalı ${preview.protectedCount} katalog notunda eşleşme var; hiçbir not değiştirilmedi.`, `Only ${preview.protectedCount} protected catalog notes match; no note was changed.`)
                        : l('Eşleşme bulunamadı; hiçbir not değiştirilmedi.', 'No match found; no note was changed.'),
                });
                return;
            }
            confirm(
                l('Bul ve değiştir', 'Find and Replace'),
                confirmMessage(preview),
                () => { void apply(request); },
                { destructive: true, confirmLabel: l('Değiştir', 'Replace') },
            );
        });
    };

    const editable = busy === null;

    return (
        <AppDialog
            visible={visible}
            onClose={close}
            title={l('Bul ve değiştir', 'Find and Replace')}
            closeLabel={l('Bul ve değiştir penceresini kapat', 'Close Find and Replace')}
            actions={(
                <>
                    <Button variant="plain" label={t('common.cancel')} onPress={close} disabled={busy === 'applying'} />
                    <Button
                        label={l('Değiştir…', 'Replace…')}
                        accessibilityLabel={l('Değiştir', 'Replace')}
                        onPress={submit}
                        disabled={!editable}
                    />
                </>
            )}
        >
            <ScrollView style={toolStyles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>{l('Bul', 'Find')}</Text>
                <TextField
                    value={find}
                    onChangeText={(value) => { setFind(value); setNotice(null); }}
                    editable={editable}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={l('Bulunacak metin', 'Text to find')}
                />
                <Text style={styles.fieldLabel}>{l('Şununla değiştir', 'Replace With')}</Text>
                <TextField
                    value={replacement}
                    onChangeText={(value) => { setReplacement(value); setNotice(null); }}
                    editable={editable}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={l('Yerine yazılacak metin', 'Replacement text')}
                />
                <Text style={styles.fieldLabel}>{l('Konum', 'In')}</Text>
                <ChoiceSelect
                    disabled={!editable}
                    expanded={targetOpen}
                    label={l('Konum', 'In')}
                    onSelect={(key) => { setTargetKey(key); setTargetOpen(false); setNotice(null); }}
                    onToggle={() => setTargetOpen((open) => !open)}
                    options={options}
                    selectedKey={target}
                    toolStyles={toolStyles}
                />
                <ToolCheckbox
                    checked={inSelection}
                    disabled={!hasSelection || !editable}
                    label={hasSelection
                        ? l(`Yalnızca seçili notlar (${selectedNoteIds.length})`, `Selected notes only (${selectedNoteIds.length})`)
                        : l('Yalnızca seçili notlar', 'Selected notes only')}
                    onPress={() => { setSelectedOnly((value) => !value); setNotice(null); }}
                />
                <ToolCheckbox
                    checked={ignoreCase}
                    disabled={!editable}
                    label={l('Büyük/küçük harfi yok say', 'Ignore case')}
                    onPress={() => { setIgnoreCase((value) => !value); setNotice(null); }}
                />
                <ToolCheckbox
                    checked={regex}
                    disabled={!editable}
                    label={l('Girdiyi düzenli ifade olarak kullan', 'Treat input as regular expression')}
                    onPress={() => { setRegex((value) => !value); setNotice(null); }}
                />
                {regex && (
                    <Text style={toolStyles.hint}>
                        {l('Gruplar yeni metinde ${1} veya $1 ile kullanılır.', 'Use ${1} or $1 for a group in the replacement.')}
                    </Text>
                )}
                {notice && (
                    <Text style={[toolStyles.notice, notice.tone === 'error' && toolStyles.noticeError]} accessibilityLiveRegion="polite">
                        {notice.text}
                    </Text>
                )}
                {busy && (
                    <View style={toolStyles.busyRow} accessibilityLiveRegion="polite">
                        <ActivityIndicator color={colors.accent} />
                        <Text style={toolStyles.busyText}>
                            {busy === 'counting'
                                ? l('Eşleşen notlar sayılıyor…', 'Counting matching notes…')
                                : l('Yedek alınıyor ve notlar güncelleniyor…', 'Backing up and updating notes…')}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </AppDialog>
    );
}
