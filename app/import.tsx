/**
 * Anki's import screen.
 *
 * Anki asks for the file first and derives everything else from it: the extension picks the
 * importer, and the screen that follows is the option list for that importer — separator, HTML,
 * note type, deck, duplicate handling, match scope, the two tag inputs and the field-mapping
 * table for text files; learning progress, deck presets and the two update choices for packages.
 * The import then ends on an Import Log rather than a bare count.
 *
 * https://docs.ankiweb.net/importing/text-files.html
 * https://docs.ankiweb.net/importing/packaged-decks.html
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { createDeck, getAllDecks, getAvailableDeckName, getDeck, getDeckByName } from '../lib/deckManager';
import { resolveInitialTargetDeckId } from '../lib/importTargetDeck';
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
import { getAllNoteTypes, getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { parseDelimited, SEPARATOR_CHOICES, separatorChoiceForDelimiter } from '../lib/importDelimited';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import DeckPickerModal from '../components/DeckPickerModal';
import NoteTypePickerModal from '../components/NoteTypePickerModal';
import ImportLogView, { type ImportLogExtraLine } from '../components/ImportLogView';
import { createBackupNow } from '../lib/backup';
import {
    ALL_IMPORT_MIME_TYPES,
    importFileNameFromUri,
    importFormatLabel,
    inferImportFileType,
    isPackageImport,
    type ImportFileType,
} from '../lib/importFile';
import { importLogFromCounts, type ImportLog } from '../lib/importLog';
import ScreenHeader from '../components/ScreenHeader';
import { userFacingErrorMessage } from '../lib/userFacingError';

function ChevronDownIcon({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Path d="m7 9.5 5 5 5-5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

const MAX_TEXT_CHARS = 50_000_000;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;
/** Data rows shown under the field-mapping headers, as Anki's import preview does. */
const PREVIEW_ROWS = 5;
/** Anki truncates a very wide file's preview rather than rendering hundreds of columns. */
const MAX_PREVIEW_COLUMNS = 24;
/** Rows sampled to decide how wide the file is; a ragged file must not lose its later columns. */
const WIDTH_SAMPLE_ROWS = 200;

type PickedFile = {
    name: string;
    type: ImportFileType;
    text: string | null;
    bytes: Uint8Array | null;
};

/** What a text column is mapped to: a note field, the tags field, or nothing. */
type ColumnMapping = `field:${number}` | 'tags' | 'none';

type PackageSummary = {
    cardsImported?: number;
    progressCards?: number;
    progressReviews?: number;
    mediaImported?: number;
    mediaSkipped?: number;
    mediaRenamed?: number;
    withMedia?: number;
    structurePreserved?: boolean;
};

type ImportOutcome = {
    log: ImportLog;
    package?: PackageSummary;
};

export default function ImportScreen() {
    const { t, l, locale } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams<{
        incomingUri?: string | string[];
        deckId?: string;
        deckName?: string;
        deck?: string;
    }>();
    const incomingUri = params.incomingUri;
    const { settings } = useAppSettings();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [file, setFile] = useState<PickedFile | null>(null);
    const [importing, setImporting] = useState(false);
    const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
    const handledIncomingUri = useRef<string | null>(null);

    // Text-import options, in the order Anki lists them.
    const [separator, setSeparator] = useState<string | null>(null);
    const [guessedSeparator, setGuessedSeparator] = useState<string>(',');
    const [allowHtml, setAllowHtml] = useState(false);
    const [noteTypeId, setNoteTypeId] = useState<number>(1);
    const [targetDeckId, setTargetDeckId] = useState<number>(() => resolveInitialTargetDeckId(params));
    const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolution>('update');
    const [matchScope, setMatchScope] = useState<MatchScope>('notetype');
    const [tagAllNotes, setTagAllNotes] = useState('');
    const [tagUpdatedNotes, setTagUpdatedNotes] = useState('');
    const [columnMappings, setColumnMappings] = useState<Record<number, ColumnMapping>>({});

    // Package-import options. Anki ships "Import any learning progress" selected — the manual tells
    // learners to *leave it unselected* to strip scheduling — so a package that carries a schedule
    // keeps it unless the learner says otherwise.
    const [withScheduling, setWithScheduling] = useState(true);
    const [withDeckConfigs, setWithDeckConfigs] = useState(true);
    const [updateNotes, setUpdateNotes] = useState<'ifNewer' | 'always' | 'never'>('ifNewer');
    const [updateNoteTypes, setUpdateNoteTypes] = useState<'ifNewer' | 'always' | 'never'>('ifNewer');

    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showNoteTypePicker, setShowNoteTypePicker] = useState(false);
    const [showSeparatorPicker, setShowSeparatorPicker] = useState(false);
    const [mappingColumn, setMappingColumn] = useState<number | null>(null);
    const [choicePicker, setChoicePicker] = useState<null | 'existing' | 'matchScope' | 'updateNotes' | 'updateNoteTypes'>(null);

    const targetDeck = useMemo(
        () => getDeck(targetDeckId) ?? getDeckByName('Varsayılan') ?? getDeck(1),
        [targetDeckId, dataVersion],
    );
    const deckPickerDecks = useMemo(
        () => getAllDecks().filter((deck) => !deck.isFiltered),
        [dataVersion, showDeckPicker],
    );
    const selectedNoteType = useMemo(
        () => getNoteType(noteTypeId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === noteTypeId) ?? BUILTIN_NOTE_TYPES[0]!,
        [noteTypeId, dataVersion],
    );

    const packageImport = file ? isPackageImport(file.type) : false;

    const parsed = useMemo(() => {
        if (!file || file.text === null) return null;
        return parseDelimited(file.text, separator ? { delimiter: separator } : {});
    }, [file, separator]);

    const metadata = parsed?.metadata;
    /** Columns Anki reserves for guid/tags/deck/notetype directives; they are never note fields. */
    const metaColumns = useMemo(() => {
        const map = new Map<number, string>();
        if (!metadata) return map;
        if (metadata.guidColumn) map.set(metadata.guidColumn - 1, l('Benzersiz kimlik', 'Unique identifier'));
        if (metadata.notetypeColumn) map.set(metadata.notetypeColumn - 1, l('Not türü', 'Note type'));
        if (metadata.deckColumn) map.set(metadata.deckColumn - 1, l('Deste', 'Deck'));
        if (metadata.tagsColumn) map.set(metadata.tagsColumn - 1, l('Etiketler', 'Tags'));
        return map;
    }, [metadata, l]);

    const previewRows = useMemo(() => parsed?.rows.slice(0, PREVIEW_ROWS) ?? [], [parsed]);
    /** Every column the file has: the mapping must reach all of them, even off-screen ones. */
    const columnCount = useMemo(
        () => parsed?.rows.slice(0, WIDTH_SAMPLE_ROWS).reduce((max, row) => Math.max(max, row.length), 0) ?? 0,
        [parsed],
    );
    /** Only this many are drawn; Anki likewise stops rendering a pathologically wide file. */
    const visibleColumnCount = Math.min(columnCount, MAX_PREVIEW_COLUMNS);

    /**
     * Anki's default mapping walks the non-meta columns in order onto the note type's fields and
     * leaves anything past them ignored — it never guesses that a trailing column is tags.
     */
    const defaultMapping = useMemo(() => {
        const mapping = new Map<number, ColumnMapping>();
        let fieldIndex = 0;
        for (let column = 0; column < columnCount; column++) {
            if (metaColumns.has(column)) continue;
            mapping.set(column, fieldIndex < selectedNoteType.fields.length ? `field:${fieldIndex++}` : 'none');
        }
        return mapping;
    }, [columnCount, metaColumns, selectedNoteType]);

    const mappingFor = (column: number): ColumnMapping => columnMappings[column] ?? defaultMapping.get(column) ?? 'none';

    /**
     * A `#notetype column` gives every row its own note type, each with its own field list, so a
     * single mapping table cannot describe the file. Anki drops the mapping UI here and maps the
     * remaining columns onto each row's own fields in order; this screen does the same.
     */
    const perRowNoteTypes = Boolean(metadata?.notetypeColumn);

    const mappingLabel = (mapping: ColumnMapping): string => {
        if (mapping.startsWith('field:')) {
            const index = Number(mapping.slice(6));
            return selectedNoteType.fields[index]?.name ?? l('Geçersiz alan', 'Invalid field');
        }
        if (mapping === 'tags') return l('Etiketler', 'Tags');
        return l('Yok sayıldı', 'Ignored');
    };

    const handleBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/decks' as any);
    };

    const resetOptions = () => {
        setOutcome(null);
        setColumnMappings({});
        setMappingColumn(null);
        setSeparator(null);
    };

    const loadFile = async (uri: string, name: string, type: ImportFileType, knownSize?: number) => {
        resetOptions();

        if (isPackageImport(type)) {
            assertKnownFileSize(knownSize, MAX_APKG_BYTES);
            const bytes = await readUriBytes(uri, MAX_APKG_BYTES);
            setFile({ name, type, text: null, bytes });
            return;
        }

        assertKnownFileSize(knownSize, MAX_TEXT_BYTES);
        const text = await readUriText(uri, MAX_TEXT_BYTES);
        if (text.length > MAX_TEXT_CHARS) throw new Error('IMPORT_TEXT_TOO_LARGE');

        // Anki reads the file's own headers before showing the screen, so the separator, HTML
        // setting, note type and deck it names are what the learner sees preselected.
        const guessOptions = type === 'tsv' ? { delimiter: '\t' } : {};
        const guess = parseDelimited(text, guessOptions);
        setGuessedSeparator(guess.delimiter);
        setSeparator(type === 'tsv' ? '\t' : null);
        setAllowHtml(guess.metadata.html ?? false);
        if (guess.metadata.notetype) {
            const wanted = guess.metadata.notetype.trim().toLocaleLowerCase();
            const found = getAllNoteTypes().find((type_) => type_.name.trim().toLocaleLowerCase() === wanted);
            if (found) setNoteTypeId(found.id);
        }
        if (guess.metadata.deck) {
            const found = getDeckByName(guess.metadata.deck.trim());
            if (found) setTargetDeckId(found.id);
        }
        setFile({ name, type, text, bytes: null });
    };

    const reportFileError = (error: unknown) => {
        console.warn('[Import] file read failed:', error);
        const tooLarge = error instanceof Error
            && (error.message === 'IMPORT_TEXT_TOO_LARGE' || error.message === 'FILE_TOO_LARGE');
        alert(
            t('common.error'),
            tooLarge
                ? l('Dosya güvenli boyut sınırını aşıyor.', 'The file exceeds the safe size limit.')
                : l('Dosya okunamadı.', 'The file could not be read.'),
        );
    };

    useEffect(() => {
        const uri = Array.isArray(incomingUri) ? incomingUri[0] : incomingUri;
        if (!uri || handledIncomingUri.current === uri) return;
        const incomingType = inferImportFileType(uri);
        if (!incomingType) return;
        handledIncomingUri.current = uri;
        void loadFile(uri, importFileNameFromUri(uri), incomingType).catch(reportFileError);
    // The URI is the event identity; localization changes must not re-import the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingUri]);

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: ALL_IMPORT_MIME_TYPES,
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const asset = picked.assets[0];
            const type = inferImportFileType(asset.name) ?? inferImportFileType(asset.uri);
            if (!type) {
                alert(
                    l('Bilinmeyen dosya biçimi', 'Unknown file format'),
                    l(
                        'Yalnızca .apkg, .colpkg, .csv, .tsv ve .txt dosyaları içe aktarılabilir.',
                        'Only .apkg, .colpkg, .csv, .tsv and .txt files can be imported.',
                    ),
                );
                return;
            }
            await loadFile(asset.uri, asset.name, type, asset.size);
        } catch (error) {
            reportFileError(error);
        }
    };

    const parseTagInput = (value: string): string[] => value.split(/[\s,]+/).filter(Boolean);

    const buildTextImportOptions = (): ImportOptions => {
        const fieldColumns: number[] = new Array(selectedNoteType.fields.length).fill(-1);
        let tagsColumn = metadata?.tagsColumn;

        for (let column = 0; !perRowNoteTypes && column < columnCount; column++) {
            if (metaColumns.has(column)) continue;
            const mapping = mappingFor(column);
            if (mapping.startsWith('field:')) {
                const index = Number(mapping.slice(6));
                if (index >= 0 && index < selectedNoteType.fields.length) fieldColumns[index] = column;
            } else if (mapping === 'tags') {
                tagsColumn = column + 1;
            }
        }

        return {
            noteType: selectedNoteType,
            deckId: targetDeckId ?? targetDeck?.id ?? 1,
            ...(separator ? { delimiter: separator } : {}),
            ...(perRowNoteTypes ? {} : { fieldColumns }),
            tagsColumn,
            defaultFields: new Array(selectedNoteType.fields.length).fill(''),
            tags: parseTagInput(tagAllNotes),
            updatedTags: parseTagInput(tagUpdatedNotes),
            duplicateResolution,
            matchScope,
            isHtml: allowHtml,
        };
    };

    const runImport = async (textOptions: ImportOptions | null, backupFirst: boolean) => {
        if (!file) return;
        setImporting(true);
        // Let the spinner paint before the synchronous, possibly large import blocks the thread.
        await new Promise((resolve) => setTimeout(resolve, 0));

        try {
            let indexed: SearchIndexCard[] = [];
            let next: ImportOutcome | null = null;

            if (packageImport && file.bytes) {
                // A package can update existing notes as well as add new ones. Snapshot every
                // package import so an unexpected device/storage failure is recoverable.
                await createBackupNow();
                const result = await importApkg(file.bytes, {
                    subject: targetDeck?.name ?? 'genel',
                    topic: 'Genel',
                    rolloverHour: settings.dayRolloverHour,
                    fileName: file.name,
                    withScheduling: file.type === 'colpkg' ? true : withScheduling,
                    withDeckConfigs: file.type === 'colpkg' ? true : withDeckConfigs,
                    updateNotes,
                    updateNoteTypes,
                    replaceCollection: file.type === 'colpkg',
                });
                indexed = result.indexed;
                next = {
                    log: importLogFromCounts(
                        {
                            added: result.added,
                            updated: result.updated ?? 0,
                            duplicate: result.duplicates,
                            emptyFirstField: result.emptyRows,
                        },
                        result.totalNotes,
                    ),
                    package: {
                        cardsImported: result.cardsImported,
                        progressCards: result.progressCards,
                        progressReviews: result.progressReviews,
                        mediaImported: result.mediaImported,
                        mediaSkipped: result.mediaSkipped,
                        mediaRenamed: result.mediaRenamed,
                        withMedia: result.withMedia,
                        structurePreserved: result.structurePreserved,
                    },
                };
            } else if (file.text !== null && textOptions) {
                if (backupFirst) await createBackupNow();
                const result = importDelimitedNotes(file.text, textOptions);
                indexed = result.indexed;
                next = { log: result.log };
            }

            if (next) {
                // Index only the imported cards, not the whole collection (native FTS; no-op on web).
                for (const card of indexed) dbUpsertFtsCard(card);
                bumpDataVersion();
                if (file.type === 'colpkg') await refreshCatalogAccess();
                setOutcome(next);
            }
        } catch (error) {
            console.warn('[Import] import failed:', error);
            alert(t('common.error'), userFacingErrorMessage(
                error,
                l('İçe aktarma tamamlanamadı. Dosyanızı kontrol edip tekrar deneyin.', 'Import could not be completed. Check your file and try again.'),
            ));
        } finally {
            setImporting(false);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        try {
            if (file.type === 'colpkg') {
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
            let backupFirst = false;
            if (file.text !== null) {
                textOptions = buildTextImportOptions();
                // Anki refuses an import whose first field has no column: every row would have an
                // empty first field, so nothing would be written and no card could be generated.
                if (!perRowNoteTypes && textOptions.fieldColumns?.[0] === -1) {
                    alert(
                        l('Alan eşlemesi eksik', 'Field mapping incomplete'),
                        l(
                            'Not türünün ilk alanı bir sütuna eşlenmelidir.',
                            'The first field of the note type must be mapped to a column.',
                        ),
                    );
                    return;
                }
                const preview = previewDelimitedNotes(file.text, textOptions);
                backupFirst = preview.updated > 0;
                if (backupFirst) {
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

            await runImport(textOptions, backupFirst);
        } catch (error) {
            console.warn('[Import] import preview failed:', error);
            alert(t('common.error'), userFacingErrorMessage(
                error,
                l('İçe aktarma tamamlanamadı. Dosyanızı kontrol edip tekrar deneyin.', 'Import could not be completed. Check your file and try again.'),
            ));
        }
    };

    const existingNotesLabel = (value: DuplicateResolution) => ({
        update: l('Güncelle', 'Update'),
        preserve: l('Koru', 'Preserve'),
        duplicate: l('Kopyala', 'Duplicate'),
    }[value]);

    const matchScopeLabel = (value: MatchScope) => ({
        notetype: l('Not türü', 'Note type'),
        notetypeAndDeck: l('Not türü ve deste', 'Note type and deck'),
    }[value]);

    const updateChoiceLabel = (value: 'ifNewer' | 'always' | 'never') => ({
        ifNewer: l('Yeniyse', 'If newer'),
        always: l('Her zaman', 'Always'),
        never: l('Asla', 'Never'),
    }[value]);

    const separatorLabel = (delimiter: string) => {
        const choice = separatorChoiceForDelimiter(delimiter);
        if (!choice) return l('Özel', 'Custom');
        return {
            comma: l('Virgül', 'Comma'),
            semicolon: l('Noktalı virgül', 'Semicolon'),
            tab: l('Sekme', 'Tab'),
            space: l('Boşluk', 'Space'),
            pipe: l('Dikey çizgi', 'Pipe'),
            colon: l('İki nokta', 'Colon'),
        }[choice];
    };

    const packageExtraLines = (summary: PackageSummary): ImportLogExtraLine[] => {
        const lines: ImportLogExtraLine[] = [];
        if (summary.cardsImported) {
            lines.push({ text: l(`${summary.cardsImported} kart eklendi.`, `${summary.cardsImported} cards added.`) });
        }
        if (summary.progressCards) {
            lines.push({ text: l(
                `${summary.progressCards} kart çalışma ilerlemesiyle geldi.`,
                `${summary.progressCards} cards arrived with learning progress.`,
            ) });
        }
        if (summary.progressReviews) {
            lines.push({ text: l(
                `${summary.progressReviews} tekrar kaydı geçmişe eklendi.`,
                `${summary.progressReviews} review entries were added to the history.`,
            ) });
        }
        if (summary.mediaImported) {
            lines.push({ text: l(
                `${summary.mediaImported} medya dosyası içe aktarıldı.`,
                `Imported ${summary.mediaImported} media files.`,
            ) });
        }
        if (summary.mediaRenamed) {
            lines.push({ text: l(
                `${summary.mediaRenamed} çakışan medya dosyası güvenli bir adla eklendi.`,
                `${summary.mediaRenamed} conflicting media files were added under safe new names.`,
            ) });
        }
        if (summary.mediaSkipped) {
            lines.push({ tone: 'warning', text: l(
                `${summary.mediaSkipped} medya dosyası atlandı (eksik veya çok büyük).`,
                `${summary.mediaSkipped} media files were skipped (missing or too large).`,
            ) });
        }
        if (summary.withMedia && !summary.mediaImported) {
            lines.push({ tone: 'warning', text: l(
                `${summary.withMedia} not medya kullanıyor; medya dosyaları içe aktarılamadı.`,
                `${summary.withMedia} notes reference media; the media files could not be imported.`,
            ) });
        }
        if (summary.structurePreserved) {
            lines.push({ text: l(
                'Deste yapısı, not türleri, alanlar, şablonlar ve CSS korundu.',
                'Deck structure, note types, fields, templates and CSS were retained.',
            ) });
        }
        return lines;
    };

    const renderOptionRow = (
        label: string,
        value: string,
        onPress: () => void,
        accessibilityLabel?: string,
    ) => (
        <TouchableOpacity
            style={styles.optionRow}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        >
            <Text style={styles.optionLabel} numberOfLines={1}>{label}</Text>
            <Text style={styles.optionValue} numberOfLines={1}>{value}</Text>
            <ChevronDownIcon color={colors.textMuted} size={18} />
        </TouchableOpacity>
    );

    const renderToggleRow = (label: string, hint: string | null, checked: boolean, onToggle: () => void) => (
        <TouchableOpacity
            style={styles.toggleRow}
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
        >
            <View style={styles.toggleCopy}>
                <Text style={styles.optionLabel}>{label}</Text>
                {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
            </View>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
        </TouchableOpacity>
    );

    const renderTagRow = (label: string, hint: string, value: string, onChange: (next: string) => void) => (
        <View style={styles.tagRow}>
            <Text style={styles.optionLabel}>{label}</Text>
            <TextInput
                style={styles.tagInput}
                value={value}
                onChangeText={onChange}
                placeholder={hint}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={label}
            />
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={t('root.import')}
                onBack={handleBack}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
            />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {!file ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>{l('İçe aktarılacak dosyayı seçin', 'Choose a file to import')}</Text>
                        <Text style={styles.emptyBody}>
                            {l(
                                'Dosyanın türü uzantısından anlaşılır ve içe aktarma seçenekleri ona göre açılır.',
                                'The file type is taken from the extension, and the import options open to match it.',
                            )}
                        </Text>
                        <View style={styles.formatList}>
                            {([
                                ['.apkg', l('Anki deste paketi — deste ağacı, not türleri, medya ve isteğe bağlı çalışma geçmişi.', 'Anki deck package — deck tree, note types, media and optional review history.')],
                                ['.colpkg', l('Anki koleksiyon paketi — mevcut koleksiyonun yerine geçer.', 'Anki collection package — replaces the current collection.')],
                                ['.csv / .tsv / .txt', l('Metin dosyası — alan eşlemesi ve #başlık satırları desteklenir.', 'Text file — field mapping and #header lines are supported.')],
                            ] as const).map(([name, description]) => (
                                <View key={name} style={styles.formatItem}>
                                    <Text style={styles.formatName}>{name}</Text>
                                    <Text style={styles.formatDescription}>{description}</Text>
                                </View>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={pickFile}
                            accessibilityRole="button"
                            accessibilityLabel={l('Dosya seç', 'Choose file')}
                        >
                            <Text style={styles.primaryButtonText}>{l('Dosya seç', 'Choose File')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {file ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{l('DOSYA', 'FILE')}</Text>
                        <View style={styles.fileRow}>
                            <View style={styles.fileCopy}>
                                <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
                                <Text style={styles.fileMeta}>
                                    {packageImport
                                        ? importFormatLabel(file.type)
                                        : l(
                                            `${importFormatLabel(file.type)} · ${parsed?.rows.length ?? 0} not`,
                                            `${importFormatLabel(file.type)} · ${parsed?.rows.length ?? 0} notes`,
                                        )}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={pickFile}
                                accessibilityRole="button"
                                accessibilityLabel={l('Dosyayı değiştir', 'Change file')}
                            >
                                <Text style={styles.secondaryButtonText}>{l('Değiştir', 'Change')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}

                {file && !packageImport && !outcome ? (
                    <>
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{l('İÇE AKTARMA SEÇENEKLERİ', 'IMPORT OPTIONS')}</Text>
                            {renderOptionRow(
                                separator
                                    ? l('Alanları ayıran', 'Fields separated by')
                                    : l('Alanları ayıran (tahmin)', 'Fields separated by (guessed)'),
                                separatorLabel(separator ?? guessedSeparator),
                                () => setShowSeparatorPicker(true),
                            )}
                            {renderToggleRow(
                                l('Alanlarda HTML’e izin ver', 'Allow HTML in fields'),
                                l(
                                    'Kapalıyken metin kaçışlanır ve satır sonları <br> olur.',
                                    'When off, text is escaped and line breaks become <br>.',
                                ),
                                allowHtml,
                                () => setAllowHtml((value) => !value),
                            )}
                            {metadata?.notetypeColumn
                                ? (
                                    <View style={styles.optionRow}>
                                        <Text style={styles.optionLabel}>{l('Not türü', 'Note type')}</Text>
                                        <Text style={styles.optionValueMuted} numberOfLines={1}>
                                            {l(`Dosyadan (sütun ${metadata.notetypeColumn})`, `From file (column ${metadata.notetypeColumn})`)}
                                        </Text>
                                    </View>
                                )
                                : renderOptionRow(
                                    l('Not türü', 'Note type'),
                                    localizeNoteTypeName(locale, selectedNoteType.name),
                                    () => setShowNoteTypePicker(true),
                                )}
                            {metadata?.deckColumn
                                ? (
                                    <View style={styles.optionRow}>
                                        <Text style={styles.optionLabel}>{l('Deste', 'Deck')}</Text>
                                        <Text style={styles.optionValueMuted} numberOfLines={1}>
                                            {l(`Dosyadan (sütun ${metadata.deckColumn})`, `From file (column ${metadata.deckColumn})`)}
                                        </Text>
                                    </View>
                                )
                                : renderOptionRow(
                                    l('Deste', 'Deck'),
                                    targetDeck?.name.replaceAll('::', ' › ') ?? '—',
                                    () => setShowDeckPicker(true),
                                )}
                            {renderOptionRow(
                                l('Mevcut notlar', 'Existing notes'),
                                existingNotesLabel(duplicateResolution),
                                () => setChoicePicker('existing'),
                            )}
                            {renderOptionRow(
                                l('Eşleşme kapsamı', 'Match scope'),
                                matchScopeLabel(matchScope),
                                () => setChoicePicker('matchScope'),
                            )}
                            {renderTagRow(
                                l('Tüm notları etiketle', 'Tag all notes'),
                                l('boşlukla ayırın', 'space separated'),
                                tagAllNotes,
                                setTagAllNotes,
                            )}
                            {renderTagRow(
                                l('Güncellenen notları etiketle', 'Tag updated notes'),
                                l('boşlukla ayırın', 'space separated'),
                                tagUpdatedNotes,
                                setTagUpdatedNotes,
                            )}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{l('ALAN EŞLEMESİ', 'FIELD MAPPING')}</Text>
                            {perRowNoteTypes ? (
                                <Text style={styles.optionHint}>
                                    {l(
                                        `Dosya her satırın not türünü ${metadata?.notetypeColumn}. sütunda veriyor. Kalan sütunlar, o satırın kendi alanlarına sırayla eşlenir.`,
                                        `The file gives each row's note type in column ${metadata?.notetypeColumn}. The remaining columns are mapped in order onto that row's own fields.`,
                                    )}
                                </Text>
                            ) : null}
                            {!perRowNoteTypes && columnCount === 0 ? (
                                <Text style={styles.optionHint}>
                                    {l('Dosyada okunabilir satır bulunamadı.', 'No readable rows were found in the file.')}
                                </Text>
                            ) : null}
                            {(perRowNoteTypes ? [] : Array.from({ length: visibleColumnCount })).map((_, column) => {
                                const meta = metaColumns.get(column);
                                const sample = previewRows.map((row) => row[column] ?? '').find(Boolean) ?? '';
                                return (
                                    <View key={column} style={styles.mappingRow}>
                                        <View style={styles.mappingInfo}>
                                            <Text style={styles.mappingColumn}>
                                                {l(`Sütun ${column + 1}`, `Column ${column + 1}`)}
                                            </Text>
                                            <Text style={styles.mappingSample} numberOfLines={1}>
                                                {sample || l('(boş)', '(empty)')}
                                            </Text>
                                        </View>
                                        {meta ? (
                                            <View style={styles.mappingLockedBadge}>
                                                <Text style={styles.mappingLockedText} numberOfLines={1}>{meta}</Text>
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                style={styles.mappingBadge}
                                                onPress={() => setMappingColumn(column)}
                                                accessibilityRole="button"
                                                accessibilityLabel={l(
                                                    `Sütun ${column + 1} eşlemesi: ${mappingLabel(mappingFor(column))}`,
                                                    `Column ${column + 1} mapping: ${mappingLabel(mappingFor(column))}`,
                                                )}
                                            >
                                                <Text style={styles.mappingBadgeText} numberOfLines={1}>
                                                    {mappingLabel(mappingFor(column))}
                                                </Text>
                                                <ChevronDownIcon color={colors.accent} size={15} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                            {!perRowNoteTypes && columnCount > visibleColumnCount ? (
                                <Text style={styles.optionHint}>
                                    {l(
                                        `Yalnızca ilk ${visibleColumnCount} sütun gösteriliyor; kalan sütunlar yok sayılır.`,
                                        `Only the first ${visibleColumnCount} columns are shown; the rest are ignored.`,
                                    )}
                                </Text>
                            ) : null}
                        </View>

                        {previewRows.length > 0 ? (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    {l(`ÖNİZLEME (İLK ${previewRows.length} SATIR)`, `PREVIEW (FIRST ${previewRows.length} ROWS)`)}
                                </Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.previewTable}>
                                    <View>
                                        <View style={styles.previewHeaderRow}>
                                            {Array.from({ length: visibleColumnCount }).map((_, column) => (
                                                <View key={column} style={styles.previewCell}>
                                                    <Text style={styles.previewHeaderText} numberOfLines={1}>
                                                        {metaColumns.get(column)
                                                            ?? (perRowNoteTypes
                                                                ? l(`Sütun ${column + 1}`, `Column ${column + 1}`)
                                                                : mappingLabel(mappingFor(column)))}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                        {previewRows.map((row, rowIndex) => (
                                            <View key={rowIndex} style={styles.previewRow}>
                                                {Array.from({ length: visibleColumnCount }).map((_, column) => (
                                                    <View key={column} style={styles.previewCell}>
                                                        <Text style={styles.previewCellText} numberOfLines={2}>
                                                            {row[column] ?? ''}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        ) : null}
                    </>
                ) : null}

                {file && packageImport && !outcome ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{l('İÇE AKTARMA SEÇENEKLERİ', 'IMPORT OPTIONS')}</Text>
                        {file.type === 'apkg' ? (
                            <>
                                {renderToggleRow(
                                    l('Çalışma ilerlemesini içe aktar', 'Import any learning progress'),
                                    l(
                                        'Kapalıysa kartlar yeni başlar; “marked” ve “leech” etiketleri ile kaynak çalışma geçmişi alınmaz.',
                                        'When off, cards start as new; the “marked” and “leech” tags and the source review history are not imported.',
                                    ),
                                    withScheduling,
                                    () => setWithScheduling((value) => !value),
                                )}
                                {renderToggleRow(
                                    l('Deste ayarlarını içe aktar', 'Import any deck presets'),
                                    null,
                                    withDeckConfigs,
                                    () => setWithDeckConfigs((value) => !value),
                                )}
                                <Text style={styles.subsectionTitle}>{l('GÜNCELLEMELER', 'UPDATES')}</Text>
                                {renderOptionRow(
                                    l('Notları güncelle', 'Update notes'),
                                    updateChoiceLabel(updateNotes),
                                    () => setChoicePicker('updateNotes'),
                                )}
                                {renderOptionRow(
                                    l('Not türlerini güncelle', 'Update note types'),
                                    updateChoiceLabel(updateNoteTypes),
                                    () => setChoicePicker('updateNoteTypes'),
                                )}
                                <Text style={styles.optionHint}>
                                    {l(
                                        'Şeması değişmiş bir not türü birleştirilmez: paketteki tür ayrı bir kopya olarak eklenir ve yerel notlarınız olduğu gibi kalır.',
                                        'A note type whose schema has changed is not merged: the package’s type is added as a separate copy and your local notes are left as they are.',
                                    )}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.destructiveNotice}>
                                {l(
                                    '⚠️ Bu işlem kartlarınızı, destelerinizi ve çalışma geçmişinizi paketteki koleksiyonla değiştirecek. Mevcut medya dosyaları silinmez.',
                                    '⚠️ This will replace your cards, decks and review history with the collection in the package. Existing media files are not deleted.',
                                )}
                            </Text>
                        )}
                    </View>
                ) : null}

                {outcome ? (
                    <>
                        <ImportLogView
                            log={outcome.log}
                            colors={colors}
                            l={l}
                            extraLines={outcome.package ? packageExtraLines(outcome.package) : []}
                        />
                        <TouchableOpacity style={styles.primaryButton} onPress={handleBack} accessibilityRole="button">
                            <Text style={styles.primaryButtonText}>{t('common.completed')}</Text>
                        </TouchableOpacity>
                    </>
                ) : file ? (
                    <TouchableOpacity
                        style={[styles.primaryButton, importing && styles.primaryButtonDisabled]}
                        onPress={handleImport}
                        disabled={importing}
                        accessibilityRole="button"
                        accessibilityLabel={t('root.import')}
                    >
                        {importing
                            ? <ActivityIndicator color={colors.white} />
                            : <Text style={styles.primaryButtonText}>{t('root.import')}</Text>}
                    </TouchableOpacity>
                ) : null}
            </ScrollView>

            {showDeckPicker && (
                <DeckPickerModal
                    visible={showDeckPicker}
                    colors={colors}
                    decks={deckPickerDecks}
                    selectedDeckName={targetDeck?.name ?? null}
                    activeDeckName={targetDeck?.name ?? null}
                    title={l('Hedef deste', 'Target Deck')}
                    allDecksLabel={null}
                    searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                    emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                    cancelLabel={t('common.cancel')}
                    closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                    searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                    createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                    onClose={() => setShowDeckPicker(false)}
                    onSelect={(name) => {
                        if (!name) return;
                        const deck = getDeckByName(name);
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
            )}

            {showNoteTypePicker && (
                <NoteTypePickerModal
                    visible={showNoteTypePicker}
                    colors={colors}
                    selectedId={noteTypeId}
                    onSelect={(id) => {
                        setNoteTypeId(id);
                        // The mapping is expressed in the previous type's field indices.
                        setColumnMappings({});
                    }}
                    onClose={() => setShowNoteTypePicker(false)}
                />
            )}

            <ChoiceModal
                visible={showSeparatorPicker}
                title={l('Alanları ayıran', 'Fields separated by')}
                styles={styles}
                cancelLabel={t('common.cancel')}
                options={SEPARATOR_CHOICES.map((choice) => ({
                    value: choice.delimiter,
                    label: separatorLabel(choice.delimiter),
                    selected: (separator ?? guessedSeparator) === choice.delimiter,
                }))}
                onSelect={(value) => {
                    setSeparator(value);
                    setColumnMappings({});
                    setShowSeparatorPicker(false);
                }}
                onClose={() => setShowSeparatorPicker(false)}
            />

            <ChoiceModal
                visible={choicePicker === 'existing'}
                title={l('Mevcut notlar', 'Existing notes')}
                styles={styles}
                cancelLabel={t('common.cancel')}
                options={(['update', 'preserve', 'duplicate'] as const).map((value) => ({
                    value,
                    label: existingNotesLabel(value),
                    hint: {
                        update: l('İlk alanı eşleşen notu dosyadaki içerikle güncelle.', 'Update a note whose first field matches with the file’s content.'),
                        preserve: l('Eşleşen notu olduğu gibi bırak, satırı atla.', 'Leave the matching note untouched and skip the row.'),
                        duplicate: l('Eşleşme olsa bile yeni not olarak ekle.', 'Add as a new note even when there is a match.'),
                    }[value],
                    selected: duplicateResolution === value,
                }))}
                onSelect={(value) => {
                    setDuplicateResolution(value as DuplicateResolution);
                    setChoicePicker(null);
                }}
                onClose={() => setChoicePicker(null)}
            />

            <ChoiceModal
                visible={choicePicker === 'matchScope'}
                title={l('Eşleşme kapsamı', 'Match scope')}
                styles={styles}
                cancelLabel={t('common.cancel')}
                options={(['notetype', 'notetypeAndDeck'] as const).map((value) => ({
                    value,
                    label: matchScopeLabel(value),
                    selected: matchScope === value,
                }))}
                onSelect={(value) => {
                    setMatchScope(value as MatchScope);
                    setChoicePicker(null);
                }}
                onClose={() => setChoicePicker(null)}
            />

            <ChoiceModal
                visible={choicePicker === 'updateNotes' || choicePicker === 'updateNoteTypes'}
                title={choicePicker === 'updateNoteTypes'
                    ? l('Not türlerini güncelle', 'Update note types')
                    : l('Notları güncelle', 'Update notes')}
                styles={styles}
                cancelLabel={t('common.cancel')}
                options={(['ifNewer', 'always', 'never'] as const).map((value) => ({
                    value,
                    label: updateChoiceLabel(value),
                    selected: (choicePicker === 'updateNoteTypes' ? updateNoteTypes : updateNotes) === value,
                }))}
                onSelect={(value) => {
                    const next = value as 'ifNewer' | 'always' | 'never';
                    if (choicePicker === 'updateNoteTypes') setUpdateNoteTypes(next);
                    else setUpdateNotes(next);
                    setChoicePicker(null);
                }}
                onClose={() => setChoicePicker(null)}
            />

            <ChoiceModal
                visible={mappingColumn !== null}
                title={mappingColumn === null
                    ? ''
                    : l(`Sütun ${mappingColumn + 1} eşlemesi`, `Column ${mappingColumn + 1} mapping`)}
                styles={styles}
                cancelLabel={t('common.cancel')}
                options={[
                    ...selectedNoteType.fields.map((field, index) => ({
                        value: `field:${index}`,
                        label: field.name,
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === `field:${index}`,
                    })),
                    {
                        value: 'tags',
                        label: l('Etiketler', 'Tags'),
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === 'tags',
                    },
                    {
                        value: 'none',
                        label: l('Yok sayıldı', 'Ignored'),
                        selected: mappingColumn !== null && mappingFor(mappingColumn) === 'none',
                    },
                ]}
                onSelect={(value) => {
                    if (mappingColumn === null) return;
                    const target = value as ColumnMapping;
                    setColumnMappings((current) => {
                        const next = { ...current };
                        // A note field can only come from one column, so claiming it releases the
                        // column that held it — otherwise two columns would silently fight over it.
                        if (target.startsWith('field:')) {
                            for (let column = 0; column < columnCount; column++) {
                                if (column !== mappingColumn && (next[column] ?? defaultMapping.get(column)) === target) {
                                    next[column] = 'none';
                                }
                            }
                        }
                        next[mappingColumn] = target;
                        return next;
                    });
                    setMappingColumn(null);
                }}
                onClose={() => setMappingColumn(null)}
            />
        </SafeAreaView>
    );
}

interface ChoiceModalProps {
    visible: boolean;
    title: string;
    cancelLabel: string;
    options: { value: string; label: string; hint?: string; selected: boolean }[];
    styles: ReturnType<typeof createStyles>;
    onSelect: (value: string) => void;
    onClose: () => void;
}

/** The centered list Anki's import selects drop down into, reused by every option on this screen. */
function ChoiceModal({ visible, title, cancelLabel, options, styles, onSelect, onClose }: ChoiceModalProps) {
    if (!visible) return null;
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={cancelLabel} />
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                        {options.map((option) => (
                            <TouchableOpacity
                                key={option.value}
                                style={[styles.modalOption, option.selected && styles.modalOptionActive]}
                                onPress={() => onSelect(option.value)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: option.selected }}
                            >
                                <View style={styles.modalOptionCopy}>
                                    <Text style={[styles.modalOptionText, option.selected && styles.modalOptionTextActive]}>
                                        {option.label}
                                    </Text>
                                    {option.hint ? <Text style={styles.modalOptionHint}>{option.hint}</Text> : null}
                                </View>
                                {option.selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.modalCloseText}>{cancelLabel}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: {
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
            padding: Spacing.lg,
            paddingBottom: 100,
            gap: Spacing.md,
        },

        emptyCard: {
            gap: Spacing.md,
            padding: Spacing.lg,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        emptyTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
        emptyBody: { fontSize: FontSize.sm, lineHeight: 19, color: colors.textSecondary },
        formatList: { gap: Spacing.sm },
        formatItem: { gap: 2 },
        formatName: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
        formatDescription: { fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted },

        section: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        sectionTitle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.5,
            color: colors.textMuted,
            textTransform: 'uppercase',
            marginBottom: 4,
        },
        subsectionTitle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1.5,
            color: colors.textMuted,
            textTransform: 'uppercase',
            marginTop: Spacing.md,
            marginBottom: 2,
        },

        fileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 4 },
        fileCopy: { flex: 1, gap: 2 },
        fileName: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        fileMeta: { fontSize: FontSize.xs, color: colors.textMuted },

        optionRow: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        optionLabel: { flexShrink: 0, fontSize: FontSize.md, color: colors.textPrimary },
        optionValue: { flex: 1, textAlign: 'right', fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
        optionValueMuted: { flex: 1, textAlign: 'right', fontSize: FontSize.sm, color: colors.textMuted },
        optionHint: { fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted, paddingVertical: 6 },

        toggleRow: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingVertical: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        toggleCopy: { flex: 1, gap: 2 },
        checkbox: {
            width: 22,
            height: 22,
            borderRadius: 3,
            borderWidth: 2,
            borderColor: colors.textMuted,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkmark: { color: colors.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },

        tagRow: {
            gap: 6,
            paddingVertical: 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        tagInput: {
            minHeight: 42,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
            paddingHorizontal: Spacing.md,
            fontSize: FontSize.md,
            color: colors.textPrimary,
        },

        mappingRow: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        mappingInfo: { flex: 1, gap: 2 },
        mappingColumn: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted },
        mappingSample: { fontSize: FontSize.sm, color: colors.textPrimary },
        mappingBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            maxWidth: 190,
            minHeight: 34,
            paddingHorizontal: 10,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: colors.accentLight,
        },
        mappingBadgeText: { flexShrink: 1, fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        mappingLockedBadge: {
            maxWidth: 190,
            minHeight: 34,
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgSecondary,
        },
        mappingLockedText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textMuted },

        previewTable: { paddingTop: 4 },
        previewHeaderRow: { flexDirection: 'row' },
        previewRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        previewCell: { width: 150, paddingVertical: 8, paddingRight: Spacing.md },
        previewHeaderText: { fontSize: FontSize.xs, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
        previewCellText: { fontSize: FontSize.sm, lineHeight: 18, color: colors.textPrimary },

        destructiveNotice: { fontSize: FontSize.sm, lineHeight: 20, color: colors.btnAgain, paddingVertical: 4 },

        primaryButton: {
            minHeight: 50,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
        },
        primaryButtonDisabled: { opacity: 0.5 },
        primaryButtonText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        secondaryButton: {
            minHeight: 38,
            justifyContent: 'center',
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
        },
        secondaryButtonText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },

        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.lg,
        },
        modalCard: {
            width: '100%',
            maxWidth: 480,
            maxHeight: '80%',
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            overflow: 'hidden',
        },
        modalTitle: {
            fontSize: FontSize.md,
            fontWeight: '800',
            color: colors.textPrimary,
            padding: Spacing.md,
        },
        modalList: { flexGrow: 0 },
        modalListContent: { paddingBottom: 4 },
        modalOption: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        modalOptionActive: { backgroundColor: colors.accentLight },
        modalOptionCopy: { flex: 1, gap: 2 },
        modalOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
        modalOptionTextActive: { color: colors.accent, fontWeight: '700' },
        modalOptionHint: { fontSize: FontSize.xs, lineHeight: 16, color: colors.textMuted },
        modalCheck: { fontSize: FontSize.md, fontWeight: '800', color: colors.accent },
        modalClose: {
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        modalCloseText: { fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
    });
}
