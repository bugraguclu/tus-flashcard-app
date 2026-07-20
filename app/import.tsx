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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Modal } from 'react-native';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, resolveSubjectDeckId } from '../lib/subjects';
import { getAllDecks, getDeck } from '../lib/deckManager';
import { alert } from '../lib/confirm';
import { readUriText } from '../lib/files';
import { useApp } from './(tabs)/app-context';
import { importDelimitedNotes } from '../lib/importNotes';
import { importApkg } from '../lib/importApkg';
import { getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES } from '../lib/models';
import { parseDelimited } from '../lib/importDelimited';
import { dbUpsertFtsCard } from '../lib/db';

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
    const router = useRouter();
    const { bumpDataVersion, settings, dataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

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
                type: ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/zip', '*/*'],
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const asset = picked.assets[0];
            const apkg = asset.name.toLowerCase().endsWith('.apkg');

            if (apkg && Platform.OS !== 'web') {
                alert('Bilgi', '.apkg içe aktarma şu an yalnızca web sürümünde destekleniyor.');
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
                    alert('Hata', 'Metin dosyası çok büyük (en fazla ~50 MB).');
                    return;
                }
                setFileText(text);
                setFileBytes(null);
                setRowCount(parseDelimited(text).rows.length);
            }
        } catch (e) {
            console.warn('[Import] file read failed:', e);
            alert('Hata', 'Dosya okunamadı.');
        }
    };

    const handleImport = async () => {
        if (!hasFile) {
            alert('Hata', 'Önce bir dosya seçin.');
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
            alert('Hata', e instanceof Error ? e.message : 'İçe aktarma başarısız oldu.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    CSV/TSV dosyası (<Text style={styles.helpStrong}>Soru, Cevap, Kaynak</Text>) veya bir Anki{' '}
                    <Text style={styles.helpStrong}>.apkg</Text> paketi içe aktarın. Ayırıcı otomatik algılanır;
                    aynı sorulu kartlar atlanır.
                </Text>

                <Text style={styles.label}>HEDEF DESTE</Text>
                <TouchableOpacity
                    style={styles.deckSelector}
                    onPress={() => setShowDeckPicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Hedef desteyi seç"
                >
                    <Text style={styles.deckSelectorText} numberOfLines={1}>
                        🗃️ {targetDeck?.name ?? '—'} ▾
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>DERS</Text>
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

                <Text style={styles.label}>KONU (Kaynak sütunu yoksa)</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder={selectedSubject?.topics[0] || 'Genel'}
                    placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.label}>DOSYA</Text>
                <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
                    <Text style={styles.fileBtnText}>📄 {fileName ? 'Dosyayı Değiştir' : 'Dosya Seç'}</Text>
                </TouchableOpacity>
                {fileName && (
                    <Text style={styles.fileInfo}>
                        {fileName} · {isApkg ? 'Anki paketi' : `${rowCount} satır`}
                    </Text>
                )}

                {result ? (
                    <View style={styles.resultCard}>
                        <Text style={styles.resultTitle}>İçe aktarma tamamlandı</Text>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>Eklenen</Text>
                            <Text style={[styles.resultValue, styles.resultAdded]}>{result.added}</Text>
                        </View>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>Zaten var (atlandı)</Text>
                            <Text style={styles.resultValue}>{result.duplicates}</Text>
                        </View>
                        <View style={styles.resultRow}>
                            <Text style={styles.resultLabel}>Boş kart</Text>
                            <Text style={styles.resultValue}>{result.emptyRows}</Text>
                        </View>
                        {result.clozeImported ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Boşluk doldurma (cloze)</Text>
                                <Text style={styles.resultValue}>{result.clozeImported}</Text>
                            </View>
                        ) : null}
                        {result.progressCards ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Çalışma geçmişiyle gelen kart</Text>
                                <Text style={styles.resultValue}>{result.progressCards}</Text>
                            </View>
                        ) : null}
                        {result.mediaImported ? (
                            <View style={styles.resultRow}>
                                <Text style={styles.resultLabel}>Medya dosyası</Text>
                                <Text style={styles.resultValue}>{result.mediaImported}</Text>
                            </View>
                        ) : null}
                        {result.withMedia && !result.mediaImported ? (
                            <Text style={styles.resultNote}>
                                ⚠️ {result.withMedia} kartta medya var; medya dosyaları içe aktarılamadı.
                            </Text>
                        ) : null}
                        {result.mediaSkipped ? (
                            <Text style={styles.resultNote}>
                                ⚠️ {result.mediaSkipped} medya dosyası atlandı (eksik veya çok büyük).
                            </Text>
                        ) : null}
                        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
                            <Text style={styles.doneBtnText}>Bitti</Text>
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
                            <Text style={styles.importBtnText}>📥 İçe Aktar</Text>
                        )}
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>İptal</Text>
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={showDeckPicker} transparent animationType="fade" onRequestClose={() => setShowDeckPicker(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Hedef Deste</Text>
                        <ScrollView style={{ maxHeight: 320 }}>
                            <TouchableOpacity
                                style={styles.deckOption}
                                onPress={() => { setTargetDeckId(null); setShowDeckPicker(false); }}
                            >
                                <Text style={[styles.deckOptionText, targetDeckId === null && styles.deckOptionActive]}>
                                    ✨ Otomatik — seçilen dersin destesi
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
                            <Text style={styles.cancelBtnText}>Vazgeç</Text>
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
