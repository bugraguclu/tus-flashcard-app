import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { createDeck, getAllDecks, getAvailableDeckName, getDeck } from '../lib/deckManager';
import { alert, confirmAsync } from '../lib/confirm';
import { assertKnownFileSize, readUriBytes, readUriText } from '../lib/files';
import { useAppSettings, useCatalogStatus, useCollectionInvalidation } from '../contexts/AppContext';
import {
    importDelimitedNotes,
    previewDelimitedNotes,
    type DuplicateResolution,
    type ImportOptions,
    type MatchScope,
} from '../lib/importNotes';
import { importApkg, MAX_APKG_BYTES } from '../lib/importApkg';
import { getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { parseDelimited } from '../lib/importDelimited';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import DeckPickerModal from '../components/DeckPickerModal';
import { createBackupNow } from '../lib/backup';
import {
    getImportFileExtension,
    importFileNameFromUri,
    inferImportFileType,
    IMPORT_FORMATS,
    type ImportFileType,
} from '../lib/importFile';
import ScreenHeader from '../components/ScreenHeader';
import { userFacingErrorMessage } from '../lib/userFacingError';

const ANKI_BASIC_NOTETYPE_ID = 1;

type ImportSummary = {
    added: number;
    updated?: number;
    duplicates: number;
    emptyRows: number;
    clozeImported?: number;
    withMedia?: number;
    progressCards?: number;
    progressReviews?: number;
    mediaImported?: number;
    mediaSkipped?: number;
    mediaRenamed?: number;
    cardsImported?: number;
    structurePreserved?: boolean;
};

const MAX_TEXT_CHARS = 50_000_000;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;

function delimiterForFileType(fileType: ImportFileType): string | undefined {
    return fileType === 'tsv' ? '\t' : undefined;
}

function delimitedParseOptions(fileType: ImportFileType): { delimiter?: string } {
    const delimiter = delimiterForFileType(fileType);
    return delimiter ? { delimiter } : {};
}

export default function ImportScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { incomingUri } = useLocalSearchParams<{ incomingUri?: string | string[] }>();
    const { settings } = useAppSettings();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const availableFormats = IMPORT_FORMATS;

    const subjects = React.useMemo(() => getAllSubjects(), [dataVersion]);
    const [subject, setSubject] = useState(subjects[0]?.id ?? '');
    const [topic, setTopic] = useState('');
    // Anki's "import into deck": null follows the selected course's deck.
    const [targetDeckId, setTargetDeckId] = useState<number | null>(null);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showNewSubject, setShowNewSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const targetDeck = useMemo(
        () => getDeck(targetDeckId ?? resolveSubjectDeckId(subject)),
        [targetDeckId, subject, dataVersion],
    );
    const deckPickerDecks = useMemo(
        () => getAllDecks().filter((deck) => !deck.isFiltered),
        [dataVersion, showDeckPicker],
    );
    const [fileType, setFileType] = useState<ImportFileType>('csv');
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileText, setFileText] = useState<string | null>(null);
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
    const [rowCount, setRowCount] = useState(0);
    const [withScheduling, setWithScheduling] = useState(false);
    const [withDeckConfigs, setWithDeckConfigs] = useState(true);
    const [updateNotes, setUpdateNotes] = useState<'ifNewer' | 'always' | 'never'>('ifNewer');
    const [updateNoteTypes, setUpdateNoteTypes] = useState<'ifNewer' | 'always' | 'never'>('ifNewer');
    const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolution>('update');
    const [matchScope, setMatchScope] = useState<MatchScope>('notetype');
    const [textHtml, setTextHtml] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportSummary | null>(null);
    const handledIncomingUri = useRef<string | null>(null);

    const selectedFormat = availableFormats.find((format) => format.id === fileType) ?? availableFormats[0] ?? IMPORT_FORMATS[0]!;
    const selectedSubject = subjects.find((entry) => entry.id === subject);
    const hasFile = fileText !== null || fileBytes !== null;
    const packageImport = fileType === 'apkg' || fileType === 'colpkg';

    const handleBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/decks' as any);
    };

    const resetPickedFile = () => {
        setFileName(null);
        setFileText(null);
        setFileBytes(null);
        setRowCount(0);
        setResult(null);
    };

    const selectFileType = (next: ImportFileType) => {
        if (next === fileType) return;
        setFileType(next);
        resetPickedFile();
    };

    const formatLabel = (type: ImportFileType) => {
        switch (type) {
            case 'csv':
                return 'CSV';
            case 'tsv':
                return 'TSV';
            case 'txt':
                return 'TXT';
            case 'apkg':
                return '.apkg';
            case 'colpkg':
                return '.colpkg';
        }
    };

    const formatDescription = (type: ImportFileType) => {
        switch (type) {
            case 'csv':
                return l(
                    'CSV seçildi: virgül/noktalı virgül ayırıcı ve tırnaklı alanlar Anki uyumlu şekilde okunur.',
                    'CSV selected: comma/semicolon delimiters and quoted fields are read in an Anki-compatible way.',
                );
            case 'tsv':
                return l(
                    'TSV seçildi: sekmeyle ayrılmış alanlar doğrudan ve güvenli şekilde alınır.',
                    'TSV selected: tab-separated fields are imported directly and safely.',
                );
            case 'txt':
                return l(
                    'TXT seçildi: Anki metin dışa aktarımları, #separator satırları ve otomatik ayırıcı algılama desteklenir.',
                    'TXT selected: Anki text exports, #separator lines, and automatic delimiter detection are supported.',
                );
            case 'apkg':
                return l(
                    '.apkg seçildi: paket koleksiyona eklenir; deste ağacı, not türleri, alanlar, şablonlar, CSS ve medya korunur.',
                    '.apkg selected: the package is added to the collection; deck tree, note types, fields, templates, CSS, and media are retained.',
                );
            case 'colpkg':
                return l(
                    '.colpkg seçildi: Anki’deki gibi mevcut koleksiyon silinip paketteki koleksiyonla değiştirilir. Mevcut medya dosyaları silinmez.',
                    '.colpkg selected: as in Anki, the current collection is deleted and replaced by the package. Existing media files are not deleted.',
                );
        }
    };

    const formatNotice = (type: ImportFileType) => {
        switch (type) {
            case 'csv':
                return l(
                    'CSV için ilk üç sütun Soru, Cevap, Kaynak olmalı; Kaynak boşsa aşağıdaki Konu kullanılır.',
                    'For CSV, the first three columns should be Question, Answer, Source; if Source is empty, the Topic below is used.',
                );
            case 'txt':
                return l(
                    'TXT dosyası çok serbest biçimliyse daha doğru sonuç için başına #separator:tab veya #separator:comma ekleyin.',
                    'If the TXT file is very free-form, add #separator:tab or #separator:comma at the top for more accurate results.',
                );
            case 'apkg':
            case 'colpkg':
                return l(
                    'Paketin kendi deste adları korunur; Anki paketi için hedef deste seçimi kullanılmaz.',
                    'The package keeps its own deck names; target-deck selection is not used for Anki packages.',
                );
            case 'tsv':
                return null;
        }
    };

    const pickFileButtonLabel = () => {
        if (fileName) return l('Dosyayı değiştir', 'Change File');
        switch (fileType) {
            case 'csv':
                return l('CSV dosyası seç', 'Choose CSV File');
            case 'tsv':
                return l('TSV dosyası seç', 'Choose TSV File');
            case 'txt':
                return l('TXT dosyası seç', 'Choose TXT File');
            case 'apkg':
                return l('Anki .apkg paketi seç', 'Choose Anki .apkg Package');
            case 'colpkg':
                return l('Anki .colpkg paketi seç', 'Choose Anki .colpkg Package');
        }
    };

    const openNewSubject = () => {
        setNewSubjectName('');
        setShowNewSubject(true);
    };

    const handleCreateSubject = () => {
        const result = createCourse(newSubjectName);
        if (!result.created) {
            alert(t('common.error'), userFacingErrorMessage(
                result.error,
                l('Ders oluşturulamadı. Lütfen tekrar deneyin.', 'Could not create the course. Please try again.'),
            ));
            return;
        }
        setSubject(result.subject.id);
        setTargetDeckId(null);
        setTopic('');
        setShowNewSubject(false);
        setNewSubjectName('');
        bumpDataVersion();
    };

    const loadFile = async (uri: string, name: string, nextType: ImportFileType, knownSize?: number) => {
        setFileType(nextType);
        setFileName(name);
        setResult(null);

        if (nextType === 'apkg' || nextType === 'colpkg') {
            assertKnownFileSize(knownSize, MAX_APKG_BYTES);
            setFileBytes(await readUriBytes(uri, MAX_APKG_BYTES));
            setFileText(null);
            setRowCount(0);
            return;
        }

        assertKnownFileSize(knownSize, MAX_TEXT_BYTES);
        const text = await readUriText(uri, MAX_TEXT_BYTES);
        if (text.length > MAX_TEXT_CHARS) {
            resetPickedFile();
            throw new Error('IMPORT_TEXT_TOO_LARGE');
        }
        setFileText(text);
        setFileBytes(null);
        const parsed = parseDelimited(text, delimitedParseOptions(nextType));
        setRowCount(parsed.rows.length);
        setTextHtml(parsed.metadata.html ?? false);
    };

    useEffect(() => {
        const uri = Array.isArray(incomingUri) ? incomingUri[0] : incomingUri;
        if (!uri || handledIncomingUri.current === uri) return;
        const incomingType = inferImportFileType(uri);
        if (!incomingType) return;
        handledIncomingUri.current = uri;
        void loadFile(uri, importFileNameFromUri(uri), incomingType).catch((error) => {
            console.warn('[Import] incoming file read failed:', error);
            alert(
                t('common.error'),
                error instanceof Error && (error.message === 'IMPORT_TEXT_TOO_LARGE' || error.message === 'FILE_TOO_LARGE')
                    ? l('Dosya güvenli boyut sınırını aşıyor.', 'The file exceeds the safe size limit.')
                    : l('Paylaşılan dosya okunamadı.', 'The shared file could not be read.'),
            );
        });
    // The URI is the event identity; localization changes must not re-import the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingUri]);

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: selectedFormat.mimeTypes,
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const asset = picked.assets[0];
            const extension = getImportFileExtension(asset.name);
            const extensionMatches = !extension || selectedFormat.extensions.includes(extension);

            if (!extensionMatches) {
                alert(
                    l('Dosya türü uyuşmuyor', 'File Type Mismatch'),
                    l(
                        `${formatLabel(fileType)} seçili. Lütfen bu biçime uygun bir dosya seçin.`,
                        `${formatLabel(fileType)} is selected. Please choose a file that matches this format.`,
                    ),
                );
                return;
            }

            await loadFile(asset.uri, asset.name, fileType, asset.size);
        } catch (e) {
            console.warn('[Import] file read failed:', e);
            alert(
                t('common.error'),
                e instanceof Error && (e.message === 'IMPORT_TEXT_TOO_LARGE' || e.message === 'FILE_TOO_LARGE')
                    ? l('Dosya güvenli boyut sınırını aşıyor.', 'The file exceeds the safe size limit.')
                    : l('Dosya okunamadı.', 'Could not read the file.'),
            );
        }
    };

    const buildTextImportOptions = (): ImportOptions => {
        const noteType =
            getNoteType(ANKI_BASIC_NOTETYPE_ID) ??
            BUILTIN_NOTE_TYPES.find((nt) => nt.id === ANKI_BASIC_NOTETYPE_ID)!;
        return {
            noteType,
            deckId: targetDeckId ?? resolveSubjectDeckId(subject),
            ...delimitedParseOptions(fileType),
            defaultFields: ['', ''],
            duplicateResolution,
            matchScope,
            isHtml: textHtml,
        };
    };

    const executeImport = async (textOptions: ImportOptions | null, backupTextUpdates: boolean) => {
        setImporting(true);
        // Let the spinner paint before the synchronous, possibly large import blocks the thread.
        await new Promise((resolve) => setTimeout(resolve, 0));

        try {
            const topicValue = topic.trim() || 'Genel';
            let imported: (ImportSummary & { indexed: SearchIndexCard[] }) | null = null;

            if ((fileType === 'apkg' || fileType === 'colpkg') && fileBytes) {
                // A package can update existing notes as well as add new ones. Snapshot every
                // package import so an unexpected device/storage failure is recoverable.
                await createBackupNow();
                imported = await importApkg(fileBytes, {
                    subject,
                    topic: topicValue,
                    rolloverHour: settings.dayRolloverHour,
                    fileName: fileName ?? undefined,
                    withScheduling: fileType === 'colpkg' ? true : withScheduling,
                    withDeckConfigs: fileType === 'colpkg' ? true : withDeckConfigs,
                    updateNotes,
                    updateNoteTypes,
                    replaceCollection: fileType === 'colpkg',
                });
            } else if (fileText !== null && textOptions) {
                // A same-first-field update replaces the existing note's fields and tags. Keep the
                // exact same recovery guarantee as package imports whenever the preview found one.
                if (backupTextUpdates) await createBackupNow();
                imported = importDelimitedNotes(fileText, textOptions);
            }

            if (imported) {
                // Index only the imported cards, not the whole collection (native FTS; no-op on web).
                for (const card of imported.indexed) dbUpsertFtsCard(card);
                bumpDataVersion();
                if (fileType === 'colpkg') await refreshCatalogAccess();
                setResult(imported);
            }
        } catch (e) {
            console.warn('[Import] import failed:', e);
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('İçe aktarma tamamlanamadı. Dosyanızı kontrol edip tekrar deneyin.', 'Import could not be completed. Check your file and try again.'),
            ));
        } finally {
            setImporting(false);
        }
    };

    const handleImport = async () => {
        if (!hasFile) {
            alert(t('common.error'), l('Önce bir dosya seçin.', 'Select a file first.'));
            return;
        }

        try {
            if (fileType === 'colpkg') {
                const accepted = await confirmAsync(
                    l('Koleksiyon değiştirilsin mi?', 'Replace Collection?'),
                    l(
                        'Bu işlem tüm kartlarınızı, destelerinizi ve çalışma geçmişinizi paketteki koleksiyonla değiştirecek. İşlem başlamadan önce güvenlik yedeği alınacaktır.',
                        'This will replace all cards, decks, and review history with the collection in the package. A safety backup will be created before it starts.',
                    ),
                    { destructive: true },
                );
                if (!accepted) return;
            }

            let textOptions: ImportOptions | null = null;
            let backupTextUpdates = false;
            if (fileText !== null) {
                textOptions = buildTextImportOptions();
                const preview = previewDelimitedNotes(fileText, textOptions);
                backupTextUpdates = preview.updated > 0;
                if (backupTextUpdates) {
                    const accepted = await confirmAsync(
                        l('Mevcut notlar güncellensin mi?', 'Update Existing Notes?'),
                        l(
                            `${preview.added} yeni not eklenecek, ${preview.updated} mevcut notun alanları ve etiketleri değiştirilecek, ${preview.duplicates} not atlanacak. İşlemden önce güvenlik yedeği alınacaktır.`,
                            `${preview.added} new notes will be added, ${preview.updated} existing notes will have their fields and tags replaced, and ${preview.duplicates} notes will be skipped. A safety backup will be created first.`,
                        ),
                        { destructive: true },
                    );
                    if (!accepted) return;
                }
            }

            await executeImport(textOptions, backupTextUpdates);
        } catch (e) {
            console.warn('[Import] import preview failed:', e);
            alert(t('common.error'), userFacingErrorMessage(
                e,
                l('İçe aktarma tamamlanamadı. Dosyanızı kontrol edip tekrar deneyin.', 'Import could not be completed. Check your file and try again.'),
            ));
        }
    };

    const selectedFormatNotice = formatNotice(fileType);

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={t('root.import')}
                onBack={handleBack}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
            />
            <ScrollView contentContainerStyle={styles.content}>
                {!packageImport ? (
                    <>
                        <Text style={styles.label}>{l('HEDEF DESTE', 'TARGET DECK')}</Text>
                        <TouchableOpacity
                            style={styles.deckSelector}
                            onPress={() => setShowDeckPicker(true)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Hedef desteyi seç', 'Select target deck')}
                        >
                            <Text style={styles.deckSelectorText} numberOfLines={1}>
                                🗃️ {targetDeck?.name ?? '—'} ▾
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.label}>{l('DERS', 'SUBJECT')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                            <TouchableOpacity
                                style={[styles.subjectChip, styles.subjectChipNew]}
                                onPress={openNewSubject}
                                accessibilityRole="button"
                                accessibilityLabel={l('Yeni ders oluştur', 'Create new course')}
                            >
                                <Text style={[styles.subjectChipText, styles.subjectChipNewText]}>{l('+ Yeni', '+ New')}</Text>
                            </TouchableOpacity>
                            {subjects.map((entry) => (
                                <TouchableOpacity
                                    key={entry.id}
                                    style={[styles.subjectChip, subject === entry.id && styles.subjectChipActive]}
                                    onPress={() => setSubject(entry.id)}
                                >
                                    <Text style={[styles.subjectChipText, subject === entry.id && styles.subjectChipTextActive]}>
                                        {entry.icon} {entry.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.label}>{l('KONU (Kaynak sütunu yoksa)', 'TOPIC (when there is no Source column)')}</Text>
                        <TextInput
                            style={styles.input}
                            value={topic}
                            onChangeText={setTopic}
                            placeholder={selectedSubject?.topics[0] || l('Genel', 'General')}
                            placeholderTextColor={colors.textMuted}
                        />
                    </>
                ) : null}

                <Text style={styles.label}>{l('DOSYA TİPİ', 'FILE TYPE')}</Text>
                <View style={styles.formatGrid}>
                    {availableFormats.map((format) => {
                        const active = fileType === format.id;
                        return (
                            <TouchableOpacity
                                key={format.id}
                                style={[styles.formatChip, active && styles.formatChipActive]}
                                onPress={() => selectFileType(format.id)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={l(`${formatLabel(format.id)} dosya tipi`, `${formatLabel(format.id)} file type`)}
                            >
                                <Text style={[styles.formatChipText, active && styles.formatChipTextActive]}>
                                    {formatLabel(format.id)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <View style={styles.formatInfoCard}>
                    <Text style={styles.formatInfoText}>{formatDescription(fileType)}</Text>
                    {selectedFormatNotice ? <Text style={styles.formatNoticeText}>{selectedFormatNotice}</Text> : null}
                </View>

                {packageImport ? (
                    <View style={styles.packageOptionsCard}>
                        <Text style={styles.label}>{l('ANKI İÇE AKTARMA SEÇENEKLERİ', 'ANKI IMPORT OPTIONS')}</Text>
                        {fileType === 'apkg' ? (
                            <>
                                <TouchableOpacity style={styles.checkboxRow} onPress={() => setWithScheduling((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: withScheduling }}>
                                    <View style={[styles.checkbox, withScheduling && styles.checkboxChecked]}>{withScheduling ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                                    <View style={styles.optionCopy}>
                                        <Text style={styles.optionText}>{l('Çalışma ilerlemesini içe aktar', 'Import learning progress')}</Text>
                                        <Text style={styles.optionHint}>{l('Kapalıysa kartlar yeni başlar; “marked” ve “leech” etiketleri ile kaynak çalışma geçmişi içe aktarılmaz.', 'When off, cards start as new; “marked” and “leech” tags and source review history are not imported.')}</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.checkboxRow} onPress={() => setWithDeckConfigs((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: withDeckConfigs }}>
                                    <View style={[styles.checkbox, withDeckConfigs && styles.checkboxChecked]}>{withDeckConfigs ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                                    <Text style={styles.optionText}>{l('Deste ayarlarını içe aktar', 'Import deck presets')}</Text>
                                </TouchableOpacity>
                                <Text style={styles.optionLabel}>{l('Mevcut notlar', 'Existing notes')}</Text>
                                <View style={styles.updateChoiceRow}>
                                    {([
                                        ['ifNewer', l('Yeniyse güncelle', 'Update if newer')],
                                        ['always', l('Her zaman güncelle', 'Always update')],
                                        ['never', l('Güncelleme', 'Never update')],
                                    ] as const).map(([value, label]) => (
                                        <TouchableOpacity key={value} style={[styles.updateChoice, updateNotes === value && styles.updateChoiceActive]} onPress={() => setUpdateNotes(value)} accessibilityRole="radio" accessibilityState={{ selected: updateNotes === value }}>
                                            <Text style={[styles.updateChoiceText, updateNotes === value && styles.updateChoiceTextActive]}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <Text style={styles.optionLabel}>{l('Mevcut not türleri', 'Existing note types')}</Text>
                                <View style={styles.updateChoiceRow}>
                                    {([
                                        ['ifNewer', l('Yeniyse güncelle', 'Update if newer')],
                                        ['always', l('Her zaman güncelle', 'Always update')],
                                        ['never', l('Güncelleme', 'Never update')],
                                    ] as const).map(([value, label]) => (
                                        <TouchableOpacity key={value} style={[styles.updateChoice, updateNoteTypes === value && styles.updateChoiceActive]} onPress={() => setUpdateNoteTypes(value)} accessibilityRole="radio" accessibilityState={{ selected: updateNoteTypes === value }}>
                                            <Text style={[styles.updateChoiceText, updateNoteTypes === value && styles.updateChoiceTextActive]}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        ) : (
                            <Text style={styles.destructiveNotice}>{l('⚠️ Bu işlem kartlarınızı, destelerinizi ve çalışma geçmişinizi paketteki koleksiyonla değiştirecek.', '⚠️ This will replace your cards, decks, and review history with the collection in the package.')}</Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.packageOptionsCard}>
                        <Text style={styles.label}>{l('ANKI METİN İÇE AKTARMA SEÇENEKLERİ', 'ANKI TEXT IMPORT OPTIONS')}</Text>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setTextHtml((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: textHtml }}>
                            <View style={[styles.checkbox, textHtml && styles.checkboxChecked]}>{textHtml ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                            <Text style={styles.optionText}>{l('Alanlarda HTML’e izin ver', 'Allow HTML in fields')}</Text>
                        </TouchableOpacity>
                        <Text style={styles.optionLabel}>{l('Aynı ilk alana sahip not', 'Same first field')}</Text>
                        <View style={styles.updateChoiceRow}>
                            {([
                                ['update', l('Güncelle', 'Update')],
                                ['preserve', l('Atla', 'Ignore')],
                                ['duplicate', l('Yeni not ekle', 'Import as new')],
                            ] as const).map(([value, label]) => (
                                <TouchableOpacity key={value} style={[styles.updateChoice, duplicateResolution === value && styles.updateChoiceActive]} onPress={() => setDuplicateResolution(value)} accessibilityRole="radio" accessibilityState={{ selected: duplicateResolution === value }}>
                                    <Text style={[styles.updateChoiceText, duplicateResolution === value && styles.updateChoiceTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.optionLabel}>{l('Eşleşme kapsamı', 'Match scope')}</Text>
                        <View style={styles.updateChoiceRow}>
                            {([
                                ['notetype', l('Not türü', 'Note type')],
                                ['notetypeAndDeck', l('Not türü ve deste', 'Note type and deck')],
                            ] as const).map(([value, label]) => (
                                <TouchableOpacity key={value} style={[styles.updateChoice, matchScope === value && styles.updateChoiceActive]} onPress={() => setMatchScope(value)} accessibilityRole="radio" accessibilityState={{ selected: matchScope === value }}>
                                    <Text style={[styles.updateChoiceText, matchScope === value && styles.updateChoiceTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.optionHint}>{l('#deck, #notetype ve bunların sütun başlıkları dosyada varsa otomatik uygulanır.', '#deck, #notetype, and their column headers are applied automatically when present.')}</Text>
                    </View>
                )}

                <Text style={styles.label}>{l('DOSYA', 'FILE')}</Text>
                <TouchableOpacity
                    style={styles.fileBtn}
                    onPress={pickFile}
                    accessibilityRole="button"
                    accessibilityLabel={l(`${formatLabel(fileType)} dosyası seç`, `Choose a ${formatLabel(fileType)} file`)}
                >
                    <Text style={styles.fileBtnText}>📄 {pickFileButtonLabel()}</Text>
                </TouchableOpacity>
                {fileName && (
                    <Text style={styles.fileInfo}>
                        {fileName} · {fileType === 'apkg' || fileType === 'colpkg' ? l('Anki paketi', 'Anki package') : l(`${rowCount} satır`, `${rowCount} rows`)}
                    </Text>
                )}

                {result ? (
                    <View style={styles.resultCard}>
                        <Text style={styles.resultTitle}>{l('İçe aktarma tamamlandı', 'Import Complete')}</Text>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>{l('Eklenen', 'Added')}</Text>
                            <Text style={[styles.resultValue, styles.resultAdded]}>{result.added}</Text>
                        </View>
                        {result.updated ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{l('Güncellenen', 'Updated')}</Text>
                                <Text style={styles.resultValue}>{result.updated}</Text>
                            </View>
                        ) : null}
                        {result.cardsImported !== undefined ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{l('Korunan Anki kartı', 'Anki cards retained')}</Text>
                                <Text style={styles.resultValue}>{result.cardsImported}</Text>
                            </View>
                        ) : null}
                        {result.structurePreserved ? (
                            <Text style={styles.resultNote}>
                                {l('✓ Deste yapısı, not türleri, alanlar, şablonlar ve CSS korundu.', '✓ Deck structure, note types, fields, templates, and CSS were retained.')}
                            </Text>
                        ) : null}
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>{l('Zaten var (atlandı)', 'Duplicates (skipped)')}</Text>
                            <Text style={styles.resultValue}>{result.duplicates}</Text>
                        </View>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>{l('Boş kart', 'Empty cards')}</Text>
                            <Text style={styles.resultValue}>{result.emptyRows}</Text>
                        </View>
                        {result.clozeImported ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{l('Boşluk Doldurma (Cloze)', 'Cloze')}</Text>
                                <Text style={styles.resultValue}>{result.clozeImported}</Text>
                            </View>
                        ) : null}
                        {result.progressCards ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{l('Çalışma geçmişiyle gelen kart', 'Cards with review history')}</Text>
                                <Text style={styles.resultValue}>{result.progressCards}</Text>
                            </View>
                        ) : null}
                        {result.mediaImported ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>{l('Medya dosyası', 'Media files')}</Text>
                                <Text style={styles.resultValue}>{result.mediaImported}</Text>
                            </View>
                        ) : null}
                        {result.withMedia && !result.mediaImported ? (
                            <Text style={styles.resultNote}>
                                {l(`⚠️ ${result.withMedia} kartta medya var; medya dosyaları içe aktarılamadı.`, `⚠️ ${result.withMedia} cards reference media; the media files could not be imported.`)}
                            </Text>
                        ) : null}
                        {result.mediaSkipped ? (
                            <Text style={styles.resultNote}>
                                {l(`⚠️ ${result.mediaSkipped} medya dosyası atlandı (eksik veya çok büyük).`, `⚠️ ${result.mediaSkipped} media files were skipped (missing or too large).`)}
                            </Text>
                        ) : null}
                        {result.mediaRenamed ? (
                            <Text style={styles.resultNote}>
                                {l(`ℹ️ ${result.mediaRenamed} çakışan medya dosyası güvenli bir adla eklendi.`, `ℹ️ ${result.mediaRenamed} conflicting media files were added under safe new names.`)}
                            </Text>
                        ) : null}
                        <TouchableOpacity style={styles.doneBtn} onPress={handleBack}>
                            <Text style={styles.doneBtnText}>{t('common.completed')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.importBtn, (!hasFile || importing) && styles.importBtnDisabled]}
                        onPress={handleImport}
                        disabled={!hasFile || importing}
                    >
                        {importing ? (
                            <ActivityIndicator color={colors.white} />
                        ) : (
                            <Text style={styles.importBtnText}>📥 {t('root.import')}</Text>
                        )}
                    </TouchableOpacity>
                )}

            </ScrollView>

            <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={deckPickerDecks}
                selectedDeckName={targetDeckId === null ? null : targetDeck?.name ?? null}
                title={l('Hedef deste', 'Target Deck')}
                allDecksLabel={l('Otomatik — seçilen dersin destesi', 'Automatic — deck for the selected subject')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setShowDeckPicker(false)}
                onSelect={(name) => {
                    if (!name) {
                        setTargetDeckId(null);
                        setShowDeckPicker(false);
                        return;
                    }
                    const deck = deckPickerDecks.find((candidate) => candidate.name === name);
                    if (!deck) return;
                    setTargetDeckId(deck.id);
                    setShowDeckPicker(false);
                }}
                onCreateDeck={(name) => {
                    const created = createDeck(getAvailableDeckName(name));
                    bumpDataVersion();
                    return created.name;
                }}
            />

            <Modal visible={showNewSubject} transparent animationType="fade" onRequestClose={() => setShowNewSubject(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowNewSubject(false)}
                        accessibilityLabel={l('Yeni ders penceresini kapat', 'Close new course dialog')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Yeni ders', 'New Course')}</Text>
                        <TextInput
                            style={styles.input}
                            value={newSubjectName}
                            onChangeText={setNewSubjectName}
                            placeholder={l('Ders adı', 'Course name')}
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={handleCreateSubject}
                        />
                        <TouchableOpacity style={styles.doneBtn} onPress={handleCreateSubject}>
                            <Text style={styles.doneBtnText}>{t('common.create')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNewSubject(false)}>
                            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    subjectScroll: { marginBottom: 4 },
    subjectChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 6,
    },
    subjectChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    subjectChipNew: { borderColor: colors.accent },
    subjectChipText: { fontSize: FontSize.sm, color: colors.textSecondary },
    subjectChipTextActive: { color: colors.accent, fontWeight: '600' },
    subjectChipNewText: { color: colors.accent, fontWeight: '700' },
    formatGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    packageOptionsCard: { gap: 10, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
    checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkmark: { color: colors.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },
    optionCopy: { flex: 1, gap: 2 },
    optionText: { flex: 1, fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '600' },
    optionHint: { fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted },
    optionLabel: { fontSize: FontSize.xs, color: colors.textSecondary, fontWeight: '700', marginTop: 2 },
    updateChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    updateChoice: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border },
    updateChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    updateChoiceText: { fontSize: FontSize.xs, color: colors.textSecondary },
    updateChoiceTextActive: { color: colors.accent, fontWeight: '700' },
    destructiveNotice: { color: colors.btnAgain, fontSize: FontSize.sm, lineHeight: 20, fontWeight: '600' },
    formatChip: {
        minWidth: 72,
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    formatChipActive: {
        backgroundColor: colors.accentLight,
        borderColor: colors.accent,
    },
    formatChipText: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    formatChipTextActive: { color: colors.accent },
    formatInfoCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        gap: 6,
    },
    formatInfoText: {
        fontSize: FontSize.sm,
        color: colors.textSecondary,
        lineHeight: 19,
    },
    formatNoticeText: {
        fontSize: FontSize.sm,
        color: colors.textMuted,
        lineHeight: 19,
    },
    input: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },
    fileBtn: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    fileBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
    fileInfo: { fontSize: FontSize.sm, color: colors.textMuted },
    importBtn: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    importBtnDisabled: { opacity: 0.5 },
    importBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    resultCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    resultTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultLabel: { fontSize: FontSize.md, color: colors.textSecondary },
    resultNote: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 4 },
    resultValue: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    resultAdded: { color: colors.accent },
    doneBtn: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    doneBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
    cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
    cancelBtnText: { fontSize: FontSize.md, color: colors.textMuted },
    deckSelector: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
    },
    deckSelectorText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
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
        gap: Spacing.sm,
    },
    modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    });
}
