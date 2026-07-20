import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { downloadTextFileWeb, getLegacyFileSystem } from '../lib/files';
import { buildExportText, exportFileName, getNoteIdsInDeck } from '../lib/exportNotes';
import { getAllNotes } from '../lib/noteManager';

export default function ExportScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [busy, setBusy] = useState(false);

    // Optional deck scope (gear menu → "Dışa Aktar" on a deck).
    const deckName = typeof params.deck === 'string' && params.deck ? params.deck : undefined;

    const noteCount = useMemo(
        () => (deckName ? getNoteIdsInDeck(deckName).size : getAllNotes().length),
        [deckName],
    );

    const handleExport = async () => {
        setBusy(true);
        try {
            const text = buildExportText(deckName);
            const name = exportFileName(deckName);

            if (Platform.OS === 'web') {
                downloadTextFileWeb(name, text, 'text/plain');
                return;
            }

            const fs = getLegacyFileSystem();
            const uri = `${fs.cacheDirectory ?? ''}${name}`;
            await fs.writeAsStringAsync(uri, text, { encoding: fs.EncodingType.UTF8 });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: name });
            } else {
                alert('Bilgi', `Dosya oluşturuldu: ${uri}`);
            }
        } catch (e) {
            console.warn('[Export] failed:', e);
            alert('Hata', 'Dışa aktarma başarısız oldu.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>📤 Dışa Aktar</Text>
                <Text style={styles.help}>
                    {deckName
                        ? `"${deckName}" destesindeki (alt desteler dahil) ${noteCount} not, Anki'nin düz metin biçimiyle uyumlu bir .txt dosyasına aktarılır.`
                        : `Koleksiyonundaki tüm notlar (${noteCount} not), Anki'nin düz metin biçimiyle uyumlu bir .txt dosyasına aktarılır.`}
                    {' '}Bu dosya, İçe Aktar ekranından geri yüklenebilir.
                </Text>

                <TouchableOpacity
                    style={[styles.exportBtn, busy && styles.btnDisabled]}
                    onPress={handleExport}
                    disabled={busy}
                >
                    <Text style={styles.exportBtnText}>
                        {busy ? 'Hazırlanıyor…' : deckName ? '📤 Desteyi Dışa Aktar' : '📤 Tüm Kartları Dışa Aktar'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Kapat</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.md },
        title: { fontSize: FontSize.xl, fontWeight: '700', color: colors.textPrimary },
        help: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 20 },
        exportBtn: {
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            marginTop: Spacing.md,
        },
        btnDisabled: { opacity: 0.6 },
        exportBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
        cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
        cancelText: { fontSize: FontSize.md, color: colors.textMuted },
    });
}
