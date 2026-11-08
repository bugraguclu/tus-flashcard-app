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

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeColors } from '../constants/theme';
import { getAllDecks, getDeck, getDeckByName, createOrSelectDeck } from '../lib/deckManager';
import {
    newDeckPickerEntries,
    resolveInitialTargetDeckId,
    textImportHeaderPresets,
    type ImportDeckChoice,
} from '../lib/importTargetDeck';
import { buildTextImportOptions, type ColumnMapping } from '../lib/importTextOptions';
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
import { MAX_APKG_BYTES } from '../lib/importApkg';
import { importPackageWithBackup } from '../lib/packageImportWorkflow';
import { getAllNoteTypes, getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { defaultDelimitedMapping, delimitedContainsHtml, parseDelimited } from '../lib/importDelimited';
import { dbUpsertFtsCard, readOnlyTabMessage } from '../lib/db';
import { commitCollectionWrite } from '../lib/collectionWrite';
import { useI18n } from '../hooks/useI18n';
import DeckPickerModal from '../components/DeckPickerModal';
import NoteTypePickerModal from '../components/NoteTypePickerModal';
import ImportLogView from '../components/ImportLogView';
import { BackupNotRestorableError, createBackupNow } from '../lib/backup';
import {
    getImportPickerTypes,
    importFileNameFromUri,
    inferImportFileType,
    isPackageImport,
    type ImportFileType,
} from '../lib/importFile';
import { importLogFromCounts, type ImportLog } from '../lib/importLog';
import ScreenHeader from '../components/ScreenHeader';
import { userFacingErrorMessage } from '../lib/userFacingError';
import { createImportStyles } from '../components/import/importStyles';
import { importCopy, type PackageSummary, type UpdateChoice } from '../components/import/importCopy';
import ImportFilePrompt from '../components/import/ImportFilePrompt';
import PackageImportOptions from '../components/import/PackageImportOptions';
import TextImportOptions from '../components/import/TextImportOptions';
import FieldMappingSection from '../components/import/FieldMappingSection';

const MAX_TEXT_CHARS = 50_000_000;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;
/** Data rows shown under the field-mapping headers, as Anki's import preview does. */
const PREVIEW_ROWS = 5;
/** Anki truncates a very wide file's preview rather than rendering hundreds of columns. */
const MAX_PREVIEW_COLUMNS = 24;
/** Rows sampled to decide how wide the file is; a ragged file must not lose its later columns. */
const WIDTH_SAMPLE_ROWS = 200;
/** The note type a file without a usable `#notetype:` header starts on: the stock Basic type. */
const DEFAULT_NOTE_TYPE_ID = 1;

type PickedFile = {
    name: string;
    type: ImportFileType;
    text: string | null;
    bytes: Uint8Array | null;
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
        /** A file handed over without a readable path — a web drop or launch — names itself here. */
        incomingName?: string | string[];
        deckId?: string;
        deckName?: string;
        deck?: string;
    }>();
    const incomingUri = params.incomingUri;
    const incomingName = params.incomingName;
    const { settings, refreshSettings } = useAppSettings();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const colors = useThemeColors();
    const styles = useMemo(() => createImportStyles(colors), [colors]);

    const [file, setFile] = useState<PickedFile | null>(null);
    const [importing, setImporting] = useState(false);
    const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
    const handledIncomingUri = useRef<string | null>(null);

    // Text-import options, in the order Anki lists them.
    const [separator, setSeparator] = useState<string | null>(null);
    const [guessedSeparator, setGuessedSeparator] = useState<string>(',');
    const [allowHtml, setAllowHtml] = useState(false);
    const [noteTypeId, setNoteTypeId] = useState<number>(DEFAULT_NOTE_TYPE_ID);
    const [deckChoice, setDeckChoice] = useState<ImportDeckChoice>(
        () => ({ kind: 'existing', deckId: resolveInitialTargetDeckId(params) }),
    );
    /** A deck the file's `#deck:` header names that does not exist yet; the picker keeps offering it. */
    const [headerNewDeckName, setHeaderNewDeckName] = useState<string | null>(null);
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
    const [updateNotes, setUpdateNotes] = useState<UpdateChoice>('ifNewer');
    const [updateNoteTypes, setUpdateNoteTypes] = useState<UpdateChoice>('ifNewer');

    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showNoteTypePicker, setShowNoteTypePicker] = useState(false);

    const targetDeckId = deckChoice.kind === 'existing' ? deckChoice.deckId : null;
    /** The chosen existing deck; while a new deck is chosen, the deck its id is sent alongside. */
    const targetDeck = useMemo(
        () => (targetDeckId !== null ? getDeck(targetDeckId) : null) ?? getDeckByName('Varsayılan') ?? getDeck(1),
        [targetDeckId, dataVersion],
    );
    const deckChoiceName = deckChoice.kind === 'new' ? deckChoice.name : targetDeck?.name ?? null;
    const deckPickerDecks = useMemo(() => {
        const decks = getAllDecks();
        const choosable = decks.filter((deck) => !deck.isFiltered);
        return headerNewDeckName ? [...choosable, ...newDeckPickerEntries(headerNewDeckName, decks)] : choosable;
    }, [dataVersion, showDeckPicker, headerNewDeckName]);
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
     * Anki's default mapping (lib/importDelimited.ts): fields by `#columns:` name or in column
     * order, and the first free column after them as tags.
     */
    const defaultMapping = useMemo(() => {
        const mapping = new Map<number, ColumnMapping>();
        if (!metadata) return mapping;
        const defaults = defaultDelimitedMapping(metadata, columnCount, selectedNoteType.fields.map((field) => field.name));
        for (let column = 0; column < columnCount; column++) if (!metaColumns.has(column)) mapping.set(column, 'none');
        defaults.fieldColumns.forEach((column, index) => { if (column >= 0 && !metaColumns.has(column)) mapping.set(column, `field:${index}`); });
        if (defaults.tagsColumn && !metaColumns.has(defaults.tagsColumn - 1)) mapping.set(defaults.tagsColumn - 1, 'tags');
        return mapping;
    }, [columnCount, metaColumns, metadata, selectedNoteType]);

    // `#if matches:` and `#match scope:` preselect the matching choices, as in Anki.
    useEffect(() => {
        if (metadata?.ifMatches) setDuplicateResolution(metadata.ifMatches);
        if (metadata?.matchScope) setMatchScope(metadata.matchScope);
    }, [metadata?.ifMatches, metadata?.matchScope]);

    const mappingFor = (column: number): ColumnMapping => columnMappings[column] ?? defaultMapping.get(column) ?? 'none';

    /**
     * A `#notetype column` gives every row its own note type, each with its own field list, so a
     * single mapping table cannot describe the file. Anki drops the mapping UI here and maps the
     * remaining columns onto each row's own fields in order; this screen does the same.
     */
    const perRowNoteTypes = Boolean(metadata?.notetypeColumn);

    const handleBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/decks' as any);
    };

    /** Every file starts afresh, as Anki opens a new import screen per file: its own headers or none. */
    const resetOptions = () => {
        setOutcome(null);
        setColumnMappings({});
        setSeparator(null);
        setNoteTypeId(DEFAULT_NOTE_TYPE_ID);
        setDeckChoice({ kind: 'existing', deckId: resolveInitialTargetDeckId(params) });
        setHeaderNewDeckName(null);
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
        setAllowHtml(guess.metadata.html ?? delimitedContainsHtml(guess.rows));
        // A deck the header names that does not exist is preselected too, and made only on import.
        const presets = textImportHeaderPresets(guess.metadata, getAllDecks(), getAllNoteTypes());
        if (presets.noteTypeId !== null) setNoteTypeId(presets.noteTypeId);
        if (presets.deck) setDeckChoice(presets.deck);
        if (presets.deck?.kind === 'new') setHeaderNewDeckName(presets.deck.name);
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
        const name = (Array.isArray(incomingName) ? incomingName[0] : incomingName) || importFileNameFromUri(uri);
        const incomingType = inferImportFileType(name) ?? inferImportFileType(uri);
        if (!incomingType) return;
        handledIncomingUri.current = uri;
        void loadFile(uri, name, incomingType).catch(reportFileError);
    // The URI is the event identity; localization changes must not re-import the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingUri]);

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: getImportPickerTypes(Platform.OS),
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

    const currentTextImportOptions = (): ImportOptions => buildTextImportOptions({
        noteType: selectedNoteType,
        // A chosen deck deleted meanwhile falls back to the deck shown in its place.
        deck: deckChoice.kind === 'new' ? deckChoice : { kind: 'existing', deckId: targetDeck?.id ?? 1 },
        fallbackDeckId: targetDeck?.id ?? 1,
        separator,
        perRowNoteTypes,
        columnCount,
        metaColumns,
        mappingFor,
        headerTagsColumn: metadata?.tagsColumn,
        tagAllNotes,
        tagUpdatedNotes,
        duplicateResolution,
        matchScope,
        allowHtml,
    });

    const importInFlightRef = useRef(false);
    const importFailed = l('İçe aktarma tamamlanamadı. Dosyanızı kontrol edip tekrar deneyin.', 'Import could not be completed. Check your file and try again.');

    const runImport = async (textOptions: ImportOptions | null, backupFirst: boolean) => {
        if (!file || importInFlightRef.current) return;
        const readOnly = readOnlyTabMessage();
        if (readOnly) {
            alert(t('common.error'), readOnly);
            return;
        }
        importInFlightRef.current = true;
        setImporting(true);
        // Let the spinner paint before the synchronous, possibly large import blocks the thread.
        await new Promise((resolve) => setTimeout(resolve, 0));

        try {
            const next = await commitCollectionWrite(async () => {
                let indexed: SearchIndexCard[] = [];
                let next: ImportOutcome | null = null;

                if (packageImport && file.bytes) {
                    // A package can update existing notes as well as add new ones, so every package
                    // import is snapshotted first. A .colpkg replacement needs a restorable snapshot
                    // and stops before reading the package when a damaged row prevents one.
                    const result = await importPackageWithBackup(file.bytes, {
                        // `subject`/`topic` are the TUS catalog's own grouping; a learner's file is
                        // filed under the deck it lands in.
                        subject: targetDeck?.name ?? 'genel',
                        topic: 'Genel',
                        rolloverHour: settings.dayRolloverHour,
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
                                duplicate: result.duplicates - (result.conflicting ?? 0),
                                conflicting: result.conflicting ?? 0,
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
                    if (file.type === 'colpkg') {
                        // The replaced collection brought its own options (next day starts at, FSRS…).
                        refreshSettings();
                        await refreshCatalogAccess();
                    }
                }
                return next;
            });
            if (next) {
                bumpDataVersion();
                setOutcome(next);
            }
        } catch (error) {
            console.warn('[Import] import failed:', error);
            if (error instanceof BackupNotRestorableError) {
                alert(t('backup.notRestorableTitle'), t('backup.notRestorableMessage'));
                return;
            }
            alert(t('common.error'), userFacingErrorMessage(error, importFailed));
        } finally {
            importInFlightRef.current = false;
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
                textOptions = currentTextImportOptions();
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
            alert(t('common.error'), userFacingErrorMessage(error, importFailed));
        }
    };

    const { packageExtraLines } = importCopy(l);

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={t('root.import')}
                onBack={handleBack}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
            />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                {!file ? (
                    <ImportFilePrompt styles={styles} l={l} onPick={pickFile} />
                ) : null}

                {file ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{l('DOSYA', 'FILE')}</Text>
                        <View style={styles.fileRow}>
                            <View style={styles.fileCopy}>
                                <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
                                {packageImport ? null : (
                                    <Text style={styles.fileMeta}>
                                        {l(`${parsed?.rows.length ?? 0} not`, `${parsed?.rows.length ?? 0} notes`)}
                                    </Text>
                                )}
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
                        <TextImportOptions
                            separator={separator}
                            guessedSeparator={guessedSeparator}
                            onSeparator={(value) => {
                                setSeparator(value);
                                setColumnMappings({});
                            }}
                            allowHtml={allowHtml}
                            setAllowHtml={setAllowHtml}
                            notetypeColumn={metadata?.notetypeColumn}
                            deckColumn={metadata?.deckColumn}
                            noteTypeName={localizeNoteTypeName(locale, selectedNoteType.name)}
                            deckName={deckChoiceName?.replaceAll('::', ' › ') ?? '—'}
                            newDeckNotice={deckChoice.kind === 'new'
                                ? l(
                                    `Yeni deste oluşturulacak: ${deckChoice.name.replaceAll('::', ' › ')}`,
                                    `A new deck will be created: ${deckChoice.name.replaceAll('::', ' › ')}`,
                                )
                                : null}
                            onPickNoteType={() => setShowNoteTypePicker(true)}
                            onPickDeck={() => setShowDeckPicker(true)}
                            duplicateResolution={duplicateResolution}
                            setDuplicateResolution={setDuplicateResolution}
                            matchScope={matchScope}
                            setMatchScope={setMatchScope}
                            tagAllNotes={tagAllNotes}
                            setTagAllNotes={setTagAllNotes}
                            tagUpdatedNotes={tagUpdatedNotes}
                            setTagUpdatedNotes={setTagUpdatedNotes}
                            styles={styles}
                            mutedColor={colors.textMuted}
                            cancelLabel={t('common.cancel')}
                            l={l}
                        />

                        <FieldMappingSection
                            fields={selectedNoteType.fields}
                            notetypeColumn={metadata?.notetypeColumn}
                            columnCount={columnCount}
                            visibleColumnCount={visibleColumnCount}
                            previewRows={previewRows}
                            metaColumns={metaColumns}
                            defaultMapping={defaultMapping}
                            mappingFor={mappingFor}
                            setColumnMappings={setColumnMappings}
                            styles={styles}
                            accentColor={colors.accent}
                            cancelLabel={t('common.cancel')}
                            l={l}
                        />
                    </>
                ) : null}

                {file && packageImport && !outcome ? (
                    <PackageImportOptions
                        fileType={file.type === 'colpkg' ? 'colpkg' : 'apkg'}
                        withScheduling={withScheduling}
                        setWithScheduling={setWithScheduling}
                        withDeckConfigs={withDeckConfigs}
                        setWithDeckConfigs={setWithDeckConfigs}
                        updateNotes={updateNotes}
                        setUpdateNotes={setUpdateNotes}
                        updateNoteTypes={updateNoteTypes}
                        setUpdateNoteTypes={setUpdateNoteTypes}
                        styles={styles}
                        mutedColor={colors.textMuted}
                        cancelLabel={t('common.cancel')}
                        l={l}
                    />
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
                    selectedDeckName={deckChoiceName}
                    activeDeckName={deckChoiceName}
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
                        if (deck) setDeckChoice({ kind: 'existing', deckId: deck.id });
                        // A stand-in for the header's new deck (or one of its new parents).
                        else if (deckPickerDecks.some((entry) => entry.id < 0 && entry.name === name)) setDeckChoice({ kind: 'new', name });
                        else return;
                        setShowDeckPicker(false);
                    }}
                    onCreateDeck={(name) => {
                        const created = createOrSelectDeck(name);
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
        </SafeAreaView>
    );
}
