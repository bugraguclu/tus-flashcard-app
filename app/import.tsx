import React, { useState } from 'react';
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
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { TUS_SUBJECTS } from '../lib/data';
import { alert } from '../lib/confirm';
import { readUriText } from '../lib/files';
import { useApp } from './(tabs)/app-context';
import { importDelimitedNotes } from '../lib/importNotes';
import { importApkg } from '../lib/importApkg';
import { getNoteType, type SearchIndexCard } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES, subjectToDeckId } from '../lib/models';
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
    const { bumpDataVersion, settings } = useApp();

    const [subject, setSubject] = useState(TUS_SUBJECTS[0].id);
    const [topic, setTopic] = useState('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileText, setFileText] = useState<string | null>(null);
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
    const [isApkg, setIsApkg] = useState(false);
    const [rowCount, setRowCount] = useState(0);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportSummary | null>(null);

    const selectedSubject = TUS_SUBJECTS.find((entry) => entry.id === subject);
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
                    deckId: subjectToDeckId(subject),
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

                <Text style={styles.label}>DERS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                    {TUS_SUBJECTS.map((entry) => (
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
                    placeholderTextColor={Colors.textMuted}
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
                            <ActivityIndicator color={Colors.white} />
                        ) : (
                            <Text style={styles.importBtnText}>📥 İçe Aktar</Text>
                        )}
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>İptal</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.md },
    help: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
    helpStrong: { fontWeight: '700', color: Colors.textPrimary },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: Colors.textMuted,
        textTransform: 'uppercase',
    },
    subjectScroll: { marginBottom: 4 },
    subjectChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        marginRight: 6,
    },
    subjectChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
    subjectChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
    subjectChipTextActive: { color: Colors.accent, fontWeight: '600' },
    input: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        fontSize: FontSize.md,
        color: Colors.textPrimary,
    },
    fileBtn: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    fileBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },
    fileInfo: { fontSize: FontSize.sm, color: Colors.textMuted },
    importBtn: {
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    importBtnDisabled: { opacity: 0.5 },
    importBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
    resultCard: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    resultTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
    resultNote: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
    resultValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
    resultAdded: { color: Colors.accent },
    doneBtn: {
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    doneBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.white },
    cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
    cancelBtnText: { fontSize: FontSize.md, color: Colors.textMuted },
});
