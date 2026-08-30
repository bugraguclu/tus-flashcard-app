import React, { useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
} from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { getAllDecks, getDeck } from '../lib/deckManager';
import { alert } from '../lib/confirm';
import { readUriBytes, readUriText } from '../lib/files';
import { useApp } from '../contexts/AppContext';
import { importDelimitedNotes } from '../lib/importNotes';
import { importApkg } from '../lib/importApkg';
import { getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { parseDelimited } from '../lib/importDelimited';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';
import DeckPickerModal from '../components/DeckPickerModal';

const ANKI_BASIC_NOTETYPE_ID = 1;

type ImportSummary = {
    added: number;
    duplicates: number;
    emptyRows: number;
    clozeImported?: number;
    withMedia?: number;
    progressCards?: number;
    progressReviews?: number;
    mediaImported?: number;
    mediaSkipped?: number;
};

type ImportFileType = 'csv' | 'tsv' | 'txt' | 'apkg' | 'colpkg';

type ImportFormat = {
    id: ImportFileType;
    mimeTypes: string[];
    extensions: string[];
};

const MAX_TEXT_CHARS = 50_000_000;

const IMPORT_FORMATS: ImportFormat[] = [
    {
        id: 'csv',
        mimeTypes: ['text/csv', 'application/csv', 'text/comma-separated-values'],
        extensions: ['csv'],
    },
    {
        id: 'tsv',
        mimeTypes: ['text/tab-separated-values', 'text/tsv', 'text/plain'],
        extensions: ['tsv'],
    },
    {
        id: 'txt',
        mimeTypes: ['text/plain'],
        extensions: ['txt'],
    },
    {
        id: 'apkg',
        mimeTypes: ['application/zip', 'application/x-zip-compressed', '*/*'],
        extensions: ['apkg'],
    },
    {
        id: 'colpkg',
        mimeTypes: ['application/zip', 'application/x-zip-compressed', '*/*'],
        extensions: ['colpkg'],
    },
];

function delimiterForFileType(fileType: ImportFileType): string | undefined {
    return fileType === 'tsv' ? '\t' : undefined;
}

function delimitedParseOptions(fileType: ImportFileType): { delimiter?: string } {
    const delimiter = delimiterForFileType(fileType);
    return delimiter ? { delimiter } : {};
}

function getFileExtension(name: string): string | undefined {
    const trimmed = name.trim().toLowerCase();
    const dot = trimmed.lastIndexOf('.');
    if (dot <= 0 || dot === trimmed.length - 1) return undefined;
    return trimmed.slice(dot + 1);
}

export default function ImportScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { bumpDataVersion, settings, dataVersion } = useApp();
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
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportSummary | null>(null);

    const selectedFormat = availableFormats.find((format) => format.id === fileType) ?? availableFormats[0] ?? IMPORT_FORMATS[0]!;
    const selectedSubject = subjects.find((entry) => entry.id === subject);
    const hasFile = fileText !== null || fileBytes !== null;

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
                    '.apkg seçildi: notlar, cloze kartlar, çalışma geçmişi ve uygun medya dosyaları paketten alınır.',
                    '.apkg selected: notes, cloze cards, review history, and eligible media files are imported from the package.',
                );
            case 'colpkg':
                return l(
                    '.colpkg seçildi: tüm Anki koleksiyon paketindeki notlar, cloze kartlar, çalışma geçmişi ve medya alınır.',
                    '.colpkg selected: notes, cloze cards, review history, and media are imported from the full Anki collection package.',
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
                return l('Güncel ve eski Anki paket biçimleri desteklenir.', 'Current and legacy Anki package formats are supported.');
            case 'tsv':
                return null;
        }
    };

    const pickFileButtonLabel = () => {
        if (fileName) return l('Dosyayı Değiştir', 'Change File');
        switch (fileType) {
            case 'csv':
                return l('CSV Dosyası Seç', 'Choose CSV File');
            case 'tsv':
                return l('TSV Dosyası Seç', 'Choose TSV File');
            case 'txt':
                return l('TXT Dosyası Seç', 'Choose TXT File');
            case 'apkg':
                return l('Anki .apkg Paketi Seç', 'Choose Anki .apkg Package');
            case 'colpkg':
                return l('Anki .colpkg Paketi Seç', 'Choose Anki .colpkg Package');
        }
    };

    const openNewSubject = () => {
        setNewSubjectName('');
        setShowNewSubject(true);
    };

    const handleCreateSubject = () => {
        const result = createCourse(newSubjectName);
        if (!result.created) {
            alert(t('common.error'), result.error ?? l('Ders oluşturulamadı.', 'Could not create the course.'));
            return;
        }
        setSubject(result.subject.id);
        setTargetDeckId(null);
        setTopic('');
        setShowNewSubject(false);
        setNewSubjectName('');
        bumpDataVersion();
    };

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: selectedFormat.mimeTypes,
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const asset = picked.assets[0];
            const extension = getFileExtension(asset.name);
            const extensionMatches = !extension || selectedFormat.extensions.includes(extension);

            if (!extensionMatches) {
                alert(
                    l('Dosya Tipi Uyuşmuyor', 'File Type Mismatch'),
                    l(
                        `${formatLabel(fileType)} seçili. Lütfen bu biçime uygun bir dosya seçin.`,
                        `${formatLabel(fileType)} is selected. Please choose a file that matches this format.`,
                    ),
                );
                return;
            }

            setFileName(asset.name);
            setResult(null);

            if (fileType === 'apkg' || fileType === 'colpkg') {
                setFileBytes(await readUriBytes(asset.uri));
                setFileText(null);
                setRowCount(0);
            } else {
                const text = await readUriText(asset.uri);
                if (text.length > MAX_TEXT_CHARS) {
                    setFileName(null);
                    alert(t('common.error'), l('Metin dosyası çok büyük (en fazla yaklaşık 50 MB).', 'The text file is too large (maximum about 50 MB).'));
                    return;
                }
                setFileText(text);
                setFileBytes(null);
                setRowCount(parseDelimited(text, delimitedParseOptions(fileType)).rows.length);
            }
        } catch (e) {
            console.warn('[Import] file read failed:', e);
            alert(t('common.error'), l('Dosya okunamadı.', 'Could not read the file.'));
        }
    };

    const handleImport = async () => {
        if (!hasFile) {
            alert(t('common.error'), l('Önce bir dosya seçin.', 'Select a file first.'));
            return;
        }

        setImporting(true);
        // Let the spinner paint before the synchronous, possibly large import blocks the thread.
        await new Promise((resolve) => setTimeout(resolve, 0));

        try {
            const topicValue = topic.trim() || 'Genel';
            let imported: (ImportSummary & { indexed: SearchIndexCard[] }) | null = null;

            if ((fileType === 'apkg' || fileType === 'colpkg') && fileBytes) {
                imported = await importApkg(fileBytes, {
                    subject,
                    topic: topicValue,
                    rolloverHour: settings.dayRolloverHour,
                });
            } else if (fileText !== null) {
                const noteType =
                    getNoteType(ANKI_BASIC_NOTETYPE_ID) ??
                    BUILTIN_NOTE_TYPES.find((nt) => nt.id === ANKI_BASIC_NOTETYPE_ID)!;
                imported = importDelimitedNotes(fileText, {
                    noteType,
                    deckId: targetDeckId ?? resolveSubjectDeckId(subject),
                    ...delimitedParseOptions(fileType),
                    defaultFields: ['', ''],
                    tags: [subject, topicValue.replace(/\s+/g, '-')],
                });
            }

            if (imported) {
                // Index only the imported cards, not the whole collection (native FTS; no-op on web).
                for (const card of imported.indexed) dbUpsertFtsCard(card);
                bumpDataVersion();
                setResult(imported);
            }
        } catch (e) {
            console.warn('[Import] import failed:', e);
            alert(t('common.error'), e instanceof Error ? e.message : l('İçe aktarma başarısız oldu.', 'Import failed.'));
        } finally {
            setImporting(false);
        }
    };

    const selectedFormatNotice = formatNotice(fileType);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
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
                            <Text
                                style={[styles.subjectChipText, subject === entry.id && styles.subjectChipTextActive]}
                            >
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
                        <Text style={styles.resultTitle}>{l('İçe Aktarma Tamamlandı', 'Import Complete')}</Text>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>{l('Eklenen', 'Added')}</Text>
                            <Text style={[styles.resultValue, styles.resultAdded]}>{result.added}</Text>
                        </View>
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
                        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
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

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
            </ScrollView>

            <DeckPickerModal
                visible={showDeckPicker}
                colors={colors}
                decks={deckPickerDecks}
                selectedDeckName={targetDeckId === null ? null : targetDeck?.name ?? null}
                title={l('Hedef Deste', 'Target Deck')}
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
                onCreateDeck={() => router.push(`/decks?create=${Date.now()}` as any)}
            />

            <Modal visible={showNewSubject} transparent animationType="fade" onRequestClose={() => setShowNewSubject(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowNewSubject(false)}
                        accessibilityLabel={l('Yeni ders penceresini kapat', 'Close new course dialog')}
                    />
                    <View style={styles.modalCard}>
                        <Text scaleRole="title" style={styles.modalTitle}>{l('Yeni Ders', 'New Course')}</Text>
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
    content: { padding: Spacing.lg, gap: Spacing.md },
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
