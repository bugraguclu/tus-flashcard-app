import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { BorderRadius, FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { alert } from '../lib/confirm';
import { downloadBytesFileWeb, downloadTextFileWeb, getLegacyFileSystem } from '../lib/files';
import { buildAnkiExport, type AnkiExportFormat } from '../lib/exportAnkiPackage';
import { bytesToBase64 } from '../lib/mediaStore';
import { useI18n } from '../hooks/useI18n';
import SheetModal from '../components/SheetModal';
import { getDbSetting } from '../lib/storage';

const FORMATS: { id: AnkiExportFormat; tr: string; en: string }[] = [
    { id: 'colpkg', tr: 'Anki Koleksiyon Paketi (.colpkg)', en: 'Anki Collection Package (.colpkg)' },
    { id: 'apkg', tr: 'Anki Deste Paketi (.apkg)', en: 'Anki Deck Package (.apkg)' },
    { id: 'notesTxt', tr: 'Düz Metin Notları (.txt)', en: 'Notes in Plain Text (.txt)' },
    { id: 'cardsTxt', tr: 'Düz Metin Kartları (.txt)', en: 'Cards in Plain Text (.txt)' },
];

export default function ExportScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const deckName = typeof params.deck === 'string' && params.deck ? params.deck : undefined;
    const selectionExport = params.selection === 'browser';
    const selectedCardIds = useMemo(() => {
        if (!selectionExport) return undefined;
        try {
            const parsed = JSON.parse(getDbSetting('browser_export_card_ids') ?? '[]');
            return Array.isArray(parsed)
                ? parsed.filter((value): value is number => Number.isSafeInteger(value))
                : [];
        } catch {
            return [];
        }
    }, [selectionExport]);
    const availableFormats = selectionExport ? FORMATS.filter((item) => item.id !== 'colpkg') : FORMATS;
    const [format, setFormat] = useState<AnkiExportFormat>(deckName || selectionExport ? 'apkg' : 'colpkg');
    const [includeMedia, setIncludeMedia] = useState(true);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const selected = FORMATS.find((item) => item.id === format)!;
    const packageFormat = format === 'apkg' || format === 'colpkg';

    const handleExport = async () => {
        if (selectionExport && selectedCardIds?.length === 0) {
            alert(t('common.error'), l('Dışa aktarılacak seçili kart bulunamadı.', 'No selected cards are available to export.'));
            return;
        }
        setBusy(true);
        try {
            const artifact = await buildAnkiExport(format, deckName, includeMedia, selectedCardIds);
            if (Platform.OS === 'web') {
                if (artifact.text !== undefined) downloadTextFileWeb(artifact.fileName, artifact.text, artifact.mimeType);
                else if (artifact.bytes) downloadBytesFileWeb(artifact.fileName, artifact.bytes, artifact.mimeType);
                return;
            }
            const fs = getLegacyFileSystem();
            const uri = `${fs.cacheDirectory ?? ''}${artifact.fileName}`;
            if (artifact.text !== undefined) {
                await fs.writeAsStringAsync(uri, artifact.text, { encoding: fs.EncodingType.UTF8 });
            } else if (artifact.bytes) {
                await fs.writeAsStringAsync(uri, bytesToBase64(artifact.bytes), { encoding: fs.EncodingType.Base64 });
            } else {
                throw new Error('Dışa aktarılacak veri oluşturulamadı.');
            }
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: artifact.mimeType, dialogTitle: artifact.fileName });
            } else {
                alert(l('Bilgi', 'Info'), l(`Dosya oluşturuldu: ${uri}`, `File created: ${uri}`));
            }
        } catch (error) {
            console.warn('[Export] failed:', error);
            alert(t('common.error'), error instanceof Error ? error.message : l('Dışa aktarma başarısız oldu.', 'Export failed.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.dialog}>
                {selectionExport ? (
                    <Text style={styles.selectionCaption}>{l(`${selectedCardIds?.length ?? 0} seçili kart dışa aktarılacak.`, `${selectedCardIds?.length ?? 0} selected cards will be exported.`)}</Text>
                ) : null}
                <Text style={styles.label}>{l('Dışa aktarma biçimi:', 'Export format:')}</Text>
                <TouchableOpacity style={styles.selector} onPress={() => setPickerOpen(true)} accessibilityRole="button">
                    <Text style={styles.selectorText}>{l(selected.tr, selected.en)}</Text>
                    <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>

                {packageFormat ? (
                    <View style={styles.includeBlock}>
                        <Text style={styles.label}>{l('Dahil et:', 'Include:')}</Text>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setIncludeMedia((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: includeMedia }}>
                            <View style={[styles.checkbox, includeMedia && styles.checkboxChecked]}>
                                {includeMedia ? <Text style={styles.checkmark}>✓</Text> : null}
                            </View>
                            <Text style={styles.checkboxText}>{l('Medyayı dahil et', 'Include media')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => router.back()} disabled={busy}>
                        <Text style={styles.actionText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={handleExport} disabled={busy}>
                        {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.actionText}>{l('Dışa Aktar', 'Export')}</Text>}
                    </TouchableOpacity>
                </View>
            </View>

            <SheetModal visible={pickerOpen} onClose={() => setPickerOpen(false)}>
                <ScrollView>
                    {availableFormats.map((item) => (
                        <TouchableOpacity key={item.id} style={[styles.formatOption, item.id === format && styles.formatOptionActive]} onPress={() => { setFormat(item.id); setPickerOpen(false); }}>
                            <Text style={[styles.formatOptionText, item.id === format && styles.formatOptionTextActive]}>{l(item.tr, item.en)}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </SheetModal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', padding: Spacing.lg },
        dialog: { backgroundColor: colors.bgCard, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: 8, borderWidth: 1, borderColor: colors.border },
        label: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        selectionCaption: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
        selector: { minHeight: 48, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgPrimary, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        selectorText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        chevron: { fontSize: 18, color: colors.textSecondary, marginLeft: 8 },
        includeBlock: { gap: 10, marginTop: 8 },
        checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
        checkbox: { width: 22, height: 22, borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
        checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkmark: { color: colors.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },
        checkboxText: { fontSize: FontSize.md, color: colors.textPrimary },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: Spacing.lg },
        actionButton: { minHeight: 44, minWidth: 90, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
        actionText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '700' },
        formatOption: { minHeight: 54, justifyContent: 'center', paddingHorizontal: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        formatOptionActive: { backgroundColor: colors.accentLight },
        formatOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
        formatOptionTextActive: { color: colors.accent, fontWeight: '700' },
    });
}
