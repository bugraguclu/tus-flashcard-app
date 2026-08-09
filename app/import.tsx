import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    Platform,
    Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Modal } from 'react-native';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, resolveSubjectDeckId } from '../lib/subjects';
import { getAllDecks, getDeck } from '../lib/deckManager';
import { alert } from '../lib/confirm';
import { readUriText } from '../lib/files';
import { useApp } from '../contexts/AppContext';
import { importDelimitedNotes } from '../lib/importNotes';
import { importApkg } from '../lib/importApkg';
import { getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { parseDelimited } from '../lib/importDelimited';
import { dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';

const TUS_BASIC_NOTETYPE_ID = 4;

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

const MAX_TEXT_CHARS = 50_000_000;

async function readAssetBytes(uri: string): Promise<Uint8Array> {
    const buffer = await (await fetch(uri)).arrayBuffer();
    return new Uint8Array(buffer);
}

export default function ImportScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { bumpDataVersion, settings, dataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const supportsApkgImport = Platform.OS === 'web';

    const subjects = React.useMemo(() => getAllSubjects(), [dataVersion]);
    const [subject, setSubject] = useState(subjects[0]?.id ?? '');
    const [topic, setTopic] = useState('');
    // Anki's "import into deck": null follows the selected course's deck.
    const [targetDeckId, setTargetDeckId] = useState<number | null>(null);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const targetDeck = useMemo(
        () => getDeck(targetDeckId ?? resolveSubjectDeckId(subject)),
        [targetDeckId, subject, dataVersion],
    );
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileText, setFileText] = useState<string | null>(null);
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
    const [isApkg, setIsApkg] = useState(false);
    const [rowCount, setRowCount] = useState(0);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportSummary | null>(null);

    const selectedSubject = subjects.find((entry) => entry.id === subject);
    const hasFile = fileText !== null || fileBytes !== null;

    const pickFile = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: supportsApkgImport
                    ? ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/zip', '*/*']
                    : ['text/csv', 'text/tab-separated-values', 'text/plain'],
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const asset = picked.assets[0];
            const apkg = asset.name.toLowerCase().endsWith('.apkg');

            if (apkg && Platform.OS !== 'web') {
                alert(l('Desteklenmeyen Dosya', 'Unsupported File'), l('Bu cihazda CSV, TSV veya TXT dosyası seçin.', 'Select a CSV, TSV, or TXT file on this device.'));
                return;
            }

            setFileName(asset.name);
            setIsApkg(apkg);
            setResult(null);

            if (apkg) {
                setFileBytes(await readAssetBytes(asset.uri));
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
                setRowCount(parseDelimited(text).rows.length);
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

            if (isApkg && fileBytes) {
                imported = await importApkg(fileBytes, {
                    subject,
                    topic: topicValue,
                    rolloverHour: settings.dayRolloverHour,
                });
            } else if (fileText !== null) {
                const noteType =
                    getNoteType(TUS_BASIC_NOTETYPE_ID) ??
                    BUILTIN_NOTE_TYPES.find((nt) => nt.id === TUS_BASIC_NOTETYPE_ID)!;
                imported = importDelimitedNotes(fileText, {
                    noteType,
                    deckId: targetDeckId ?? resolveSubjectDeckId(subject),
                    defaultFields: ['', '', topicValue],
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

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    {supportsApkgImport ? (
                        <>
                            {l('Bir CSV/TSV dosyası (', 'Import a CSV/TSV file (')}<Text style={styles.helpStrong}>{l('Soru, Cevap, Kaynak', 'Question, Answer, Source')}</Text>{l(') veya Anki ', ') or an Anki ')}
                            <Text style={styles.helpStrong}>.apkg</Text>{l(' paketi içe aktarın.', ' package.')}
                        </>
                    ) : (
                        <>
                            {l('CSV, TSV veya TXT dosyası içe aktarın. Sütun sırası: ', 'Import a CSV, TSV, or TXT file. Column order: ')}
                            <Text style={styles.helpStrong}>{l('Soru, Cevap, Kaynak', 'Question, Answer, Source')}</Text>.
                        </>
                    )}{' '}
                    {l(' Ayırıcı otomatik olarak algılanır; aynı soruya sahip kartlar atlanır.', ' The delimiter is detected automatically; cards with duplicate questions are skipped.')}
                </Text>

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

                <Text style={styles.label}>{l('DOSYA', 'FILE')}</Text>
                <TouchableOpacity
                    style={styles.fileBtn}
                    onPress={pickFile}
                    accessibilityRole="button"
                    accessibilityLabel={supportsApkgImport ? l('İçe aktarılacak dosyayı seç', 'Select a file to import') : l('CSV, TSV veya TXT dosyası seç', 'Select a CSV, TSV, or TXT file')}
                >
                    <Text style={styles.fileBtnText}>📄 {fileName ? l('Dosyayı Değiştir', 'Change File') : l('Dosya Seç', 'Choose File')}</Text>
                </TouchableOpacity>
                {fileName && (
                    <Text style={styles.fileInfo}>
                        {fileName} · {isApkg ? l('Anki paketi', 'Anki package') : l(`${rowCount} satır`, `${rowCount} rows`)}
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

            <Modal visible={showDeckPicker} transparent animationType="fade" onRequestClose={() => setShowDeckPicker(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setShowDeckPicker(false)}
                        accessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Hedef Deste', 'Target Deck')}</Text>
                        <ScrollView style={{ maxHeight: 320 }}>
                            <TouchableOpacity
                                style={styles.deckOption}
                                onPress={() => { setTargetDeckId(null); setShowDeckPicker(false); }}
                            >
                                <Text style={[styles.deckOptionText, targetDeckId === null && styles.deckOptionActive]}>
                                    ✨ {l('Otomatik — seçilen dersin destesi', 'Automatic — deck for the selected subject')}
                                </Text>
                            </TouchableOpacity>
                            {getAllDecks().filter((deck) => !deck.isFiltered).map((deck) => (
                                <TouchableOpacity
                                    key={deck.id}
                                    style={styles.deckOption}
                                    onPress={() => { setTargetDeckId(deck.id); setShowDeckPicker(false); }}
                                >
                                    <Text
                                        style={[styles.deckOptionText, targetDeckId === deck.id && styles.deckOptionActive]}
                                        numberOfLines={1}
                                    >
                                        🗃️ {deck.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeckPicker(false)}>
                            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.md },
    help: { fontSize: FontSize.sm, color: colors.textSecondary, lineHeight: 20 },
    helpStrong: { fontWeight: '700', color: colors.textPrimary },
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
    subjectChipText: { fontSize: FontSize.sm, color: colors.textSecondary },
    subjectChipTextActive: { color: colors.accent, fontWeight: '600' },
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
    deckOption: {
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
    deckOptionActive: { color: colors.accent, fontWeight: '700' },
    });
}
