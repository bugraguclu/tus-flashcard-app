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
import { useI18n } from '../hooks/useI18n';

export default function ExportScreen() {
    const { t, l } = useI18n();
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
                alert(l('Bilgi', 'Info'), l(`Dosya oluşturuldu: ${uri}`, `File created: ${uri}`));
            }
        } catch (e) {
            console.warn('[Export] failed:', e);
            alert(t('common.error'), l('Dışa aktarma başarısız oldu.', 'Export failed.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>{l('Dışa Aktar', 'Export')}</Text>
                <Text style={styles.help}>
                    {deckName
                        ? l(`“${deckName}” destesindeki ${noteCount} not (alt desteler dahil), Anki’nin düz metin biçimiyle uyumlu bir .txt dosyasına aktarılır.`, `${noteCount} notes from “${deckName}” (including subdecks) will be exported to an Anki-compatible plain-text .txt file.`)
                        : l(`Koleksiyonunuzdaki tüm notlar (${noteCount} not), Anki’nin düz metin biçimiyle uyumlu bir .txt dosyasına aktarılır.`, `All notes in your collection (${noteCount} notes) will be exported to an Anki-compatible plain-text .txt file.`)}
                    {l(' Bu dosya İçe Aktar ekranından geri yüklenebilir.', ' You can restore this file from the Import screen.')}
                </Text>

                <TouchableOpacity
                    style={[styles.exportBtn, busy && styles.btnDisabled]}
                    onPress={handleExport}
                    disabled={busy}
                >
                    <Text style={styles.exportBtnText}>
                        {busy ? l('Hazırlanıyor…', 'Preparing…') : deckName ? l('Desteyi Dışa Aktar', 'Export Deck') : l('Tüm Kartları Dışa Aktar', 'Export All Cards')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelText}>{t('common.close')}</Text>
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
