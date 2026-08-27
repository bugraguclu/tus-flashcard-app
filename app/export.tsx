import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { BorderRadius, FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { alert } from '../lib/confirm';
import { downloadBytesFileWeb, downloadTextFileWeb, getLegacyFileSystem } from '../lib/files';
import { buildAnkiExport, type AnkiExportFormat, type ExportCollectionSource } from '../lib/exportAnkiPackage';
import { bytesToBase64 } from '../lib/mediaStore';
import { useI18n } from '../hooks/useI18n';
import { getDbSetting } from '../lib/storage';
import { getAllDecks } from '../lib/deckManager';
import { isCatalogDeck } from '../lib/catalogProtection';
import DeckExportSelector from '../components/DeckExportSelector';
import ScreenHeader from '../components/ScreenHeader';
import { userFacingErrorMessage } from '../lib/userFacingError';
import { readBackup } from '../lib/backup';
import { parseBackupExportSource } from '../lib/backupExport';

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
    const backupName = typeof params.backup === 'string' && params.backup ? params.backup : undefined;
    const backupExport = Boolean(backupName);
    const selectionExport = params.selection === 'browser';
    const [backupSource, setBackupSource] = useState<ExportCollectionSource | undefined>();
    const [sourceLoading, setSourceLoading] = useState(backupExport);
    const [sourceError, setSourceError] = useState<string | null>(null);
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
    const exportableDecks = useMemo(
        () => (backupExport ? backupSource?.decks ?? [] : getAllDecks())
            .filter((deck) => !deck.isFiltered && !isCatalogDeck(deck)),
        [backupExport, backupSource],
    );
    const initialDeckScopeIds = useMemo(() => new Set(
        exportableDecks
            .filter((deck) => !deckName || deck.name === deckName || deck.name.startsWith(`${deckName}::`))
            .map((deck) => deck.id),
    ), [deckName, exportableDecks]);
    const [selectedDeckIds, setSelectedDeckIds] = useState<Set<number>>(
        () => selectionExport ? new Set() : new Set(initialDeckScopeIds),
    );
    const [format, setFormat] = useState<AnkiExportFormat>(deckName || selectionExport ? 'apkg' : 'colpkg');
    const [includeMedia, setIncludeMedia] = useState(true);
    const [includeScheduling, setIncludeScheduling] = useState(backupExport);
    const [includeDeckConfigs, setIncludeDeckConfigs] = useState(true);
    const [includeHtml, setIncludeHtml] = useState(true);
    const [includeTags, setIncludeTags] = useState(true);
    const [includeDeck, setIncludeDeck] = useState(true);
    const [includeNotetype, setIncludeNotetype] = useState(true);
    const [includeGuid, setIncludeGuid] = useState(true);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const allDecksSelected = exportableDecks.length > 0
        && exportableDecks.every((deck) => selectedDeckIds.has(deck.id));
    const availableFormats = selectionExport || !allDecksSelected
        ? FORMATS.filter((item) => item.id !== 'colpkg')
        : FORMATS;
    const selected = FORMATS.find((item) => item.id === format)!;
    const packageFormat = format === 'apkg' || format === 'colpkg';

    const handleBack = () => {
        if (backupExport) {
            router.replace('/backups' as any);
            return;
        }
        if (router.canGoBack()) router.back();
        else router.replace('/decks' as any);
    };

    useEffect(() => {
        if (!backupName) {
            setBackupSource(undefined);
            setSourceLoading(false);
            setSourceError(null);
            return;
        }
        let cancelled = false;
        setSourceLoading(true);
        setSourceError(null);
        void readBackup(backupName)
            .then((contents) => parseBackupExportSource(contents, backupName))
            .then((source) => {
                if (cancelled) return;
                setBackupSource(source);
                const deckIds = source.decks
                    .filter((deck) => !deck.isFiltered && !isCatalogDeck(deck))
                    .map((deck) => deck.id);
                setSelectedDeckIds(new Set(deckIds));
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('[Export] backup source failed:', error);
                setBackupSource(undefined);
                setSelectedDeckIds(new Set());
                setSourceError(l(
                    'Bu yedek dışa aktarma için okunamadı. Yedek değiştirilmedi.',
                    'This backup could not be read for export. The backup was not changed.',
                ));
            })
            .finally(() => {
                if (!cancelled) setSourceLoading(false);
            });
        return () => { cancelled = true; };
    }, [backupName, l]);

    useEffect(() => {
        if (!sourceLoading && exportableDecks.length > 0 && format === 'colpkg' && !allDecksSelected) setFormat('apkg');
    }, [allDecksSelected, exportableDecks.length, format, sourceLoading]);

    const handleExport = async () => {
        if (backupExport && !backupSource) {
            alert(t('common.error'), sourceError ?? l('Yedek henüz hazırlanmadı.', 'The backup is not ready yet.'));
            return;
        }
        if (selectionExport && selectedCardIds?.length === 0) {
            alert(t('common.error'), l('Dışa aktarılacak seçili kart bulunamadı.', 'No selected cards are available to export.'));
            return;
        }
        if (!selectionExport && selectedDeckIds.size === 0) {
            alert(t('common.error'), l('Dışa aktarılacak en az bir deste seçin.', 'Select at least one deck to export.'));
            return;
        }
        const unchangedDeckScope = Boolean(deckName)
            && selectedDeckIds.size === initialDeckScopeIds.size
            && [...selectedDeckIds].every((id) => initialDeckScopeIds.has(id));
        setBusy(true);
        try {
            const artifact = await buildAnkiExport(format, unchangedDeckScope ? deckName : undefined, includeMedia, selectedCardIds, {
                selectedDeckIds: selectionExport || format === 'colpkg' ? undefined : [...selectedDeckIds],
                includeScheduling,
                includeDeckConfigs,
                includeHtml,
                includeTags,
                includeDeck,
                includeNotetype,
                includeGuid,
            }, backupSource);
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
                throw new Error(l('Dışa aktarılacak veri oluşturulamadı.', 'Could not create the export data.'));
            }
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: artifact.mimeType, dialogTitle: artifact.fileName });
            } else {
                alert(l('Bilgi', 'Info'), l(`Dosya oluşturuldu: ${uri}`, `File created: ${uri}`));
            }
        } catch (error) {
            console.warn('[Export] failed:', error);
            alert(t('common.error'), userFacingErrorMessage(
                error,
                l('Dışa aktarma tamamlanamadı. Lütfen tekrar deneyin.', 'Export could not be completed. Please try again.'),
            ));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={backupExport ? l('Yedeği dışa aktar', 'Export Backup') : l('Dışa aktar', 'Export')}
                onBack={handleBack}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
            />
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.dialog}>
                {backupExport ? (
                    <View style={styles.backupNotice}>
                        <Text style={styles.backupNoticeTitle}>{l('Seçilen yedekten hazırlanıyor', 'Prepared from selected backup')}</Text>
                        <Text style={styles.backupNoticeName} numberOfLines={2}>{backupName}</Text>
                        <Text style={styles.backupNoticeText}>{l(
                            'Seçenekler yalnızca bu anlık görüntüye uygulanır; mevcut koleksiyonunuz değiştirilmez. Oluşturulan dosya şifreli değildir, yalnızca güvendiğiniz yerlere gönderin.',
                            'The options apply only to this snapshot; your current collection is not changed. The generated file is not encrypted, so send it only to locations you trust.',
                        )}</Text>
                    </View>
                ) : null}
                {sourceLoading ? <ActivityIndicator style={styles.sourceLoader} color={colors.accent} /> : null}
                {sourceError ? <Text style={styles.sourceError}>{sourceError}</Text> : null}
                {!sourceLoading && !sourceError ? <>
                {!selectionExport ? (
                    <DeckExportSelector
                        decks={exportableDecks}
                        selectedIds={selectedDeckIds}
                        onChange={setSelectedDeckIds}
                        initiallyExpandedDeck={deckName}
                    />
                ) : null}
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
                        {backupExport ? (
                            <Text style={styles.optionHint}>{l(
                                'JSON yedeği medya dosyalarını saklamaz. Açıkken yalnızca bu cihazda hâlâ bulunan eşleşen medya eklenir.',
                                'JSON backups do not store media files. When enabled, only matching media still present on this device is included.',
                            )}</Text>
                        ) : null}
                        {format === 'apkg' ? (
                            <>
                                <TouchableOpacity style={styles.checkboxRow} onPress={() => setIncludeScheduling((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: includeScheduling }}>
                                    <View style={[styles.checkbox, includeScheduling && styles.checkboxChecked]}>
                                        {includeScheduling ? <Text style={styles.checkmark}>✓</Text> : null}
                                    </View>
                                    <View style={styles.optionCopy}>
                                        <Text style={styles.checkboxText}>{l('Çalışma programını dahil et', 'Include scheduling information')}</Text>
                                        <Text style={styles.optionHint}>{l('Kapalıysa kartlar yeni duruma döner; geçmiş, bayraklar, “marked” ve “leech” etiketleri temizlenir.', 'When off, cards are reset to New; history, flags, and “marked” and “leech” tags are removed.')}</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.checkboxRow} onPress={() => setIncludeDeckConfigs((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: includeDeckConfigs }}>
                                    <View style={[styles.checkbox, includeDeckConfigs && styles.checkboxChecked]}>
                                        {includeDeckConfigs ? <Text style={styles.checkmark}>✓</Text> : null}
                                    </View>
                                    <Text style={styles.checkboxText}>{l('Deste ayarlarını dahil et', 'Include deck presets')}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <Text style={styles.optionHint}>{l('.colpkg tüm koleksiyonu çalışma programıyla birlikte içerir.', '.colpkg always contains the whole collection with scheduling.')}</Text>
                        )}
                    </View>
                ) : (
                    <View style={styles.includeBlock}>
                        <Text style={styles.label}>{l('Dahil et:', 'Include:')}</Text>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setIncludeHtml((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: includeHtml }}>
                            <View style={[styles.checkbox, includeHtml && styles.checkboxChecked]}>{includeHtml ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                            <Text style={styles.checkboxText}>{l('HTML biçimlendirmesi', 'HTML formatting')}</Text>
                        </TouchableOpacity>
                        {format === 'notesTxt' ? (
                            <>
                                {([
                                    [includeTags, setIncludeTags, l('Etiketler', 'Tags')],
                                    [includeDeck, setIncludeDeck, l('Deste', 'Deck')],
                                    [includeNotetype, setIncludeNotetype, l('Not türü', 'Note type')],
                                    [includeGuid, setIncludeGuid, 'GUID'],
                                ] as const).map(([checked, setter, label]) => (
                                    <TouchableOpacity key={label} style={styles.checkboxRow} onPress={() => setter(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                                        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                                        <Text style={styles.checkboxText}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        ) : null}
                    </View>
                )}

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionButton, (!selectionExport && selectedDeckIds.size === 0) && styles.actionButtonDisabled]}
                        onPress={handleExport}
                        disabled={busy || (!selectionExport && selectedDeckIds.size === 0)}
                    >
                        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.actionText}>{l('Dışa aktar', 'Export')}</Text>}
                    </TouchableOpacity>
                </View>
                </> : null}
                </View>
            </ScrollView>

            <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
                <View style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} />
                    <View style={styles.pickerCard}>
                        <ScrollView>
                            {availableFormats.map((item) => (
                                <TouchableOpacity key={item.id} style={[styles.formatOption, item.id === format && styles.formatOptionActive]} onPress={() => { setFormat(item.id); setPickerOpen(false); }}>
                                    <Text style={[styles.formatOptionText, item.id === format && styles.formatOptionTextActive]}>{l(item.tr, item.en)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        scrollContent: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', justifyContent: 'flex-start', padding: Spacing.lg, paddingBottom: 100 },
        dialog: { backgroundColor: colors.bgCard, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: 8, borderWidth: 1, borderColor: colors.border },
        label: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        selectionCaption: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
        backupNotice: { padding: Spacing.md, gap: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentLight, marginBottom: Spacing.sm },
        backupNoticeTitle: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '800' },
        backupNoticeName: { color: colors.textPrimary, fontSize: FontSize.xs, fontWeight: '600' },
        backupNoticeText: { color: colors.textSecondary, fontSize: FontSize.xs, lineHeight: 17 },
        sourceLoader: { marginVertical: Spacing.xl },
        sourceError: { color: colors.btnAgain, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', paddingVertical: Spacing.lg },
        selector: { minHeight: 48, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgPrimary, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        selectorText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        chevron: { fontSize: 18, color: colors.textSecondary, marginLeft: 8 },
        includeBlock: { gap: 10, marginTop: 8 },
        checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
        checkbox: { width: 22, height: 22, borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
        checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkmark: { color: colors.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },
        checkboxText: { fontSize: FontSize.md, color: colors.textPrimary },
        optionCopy: { flex: 1, gap: 2 },
        optionHint: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted },
        actions: { marginTop: Spacing.lg },
        actionButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: colors.accent },
        actionButtonDisabled: { opacity: 0.4 },
        actionText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
        pickerCard: { width: '100%', maxWidth: 520, backgroundColor: colors.bgCard, borderRadius: BorderRadius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
        formatOption: { minHeight: 54, justifyContent: 'center', paddingHorizontal: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        formatOptionActive: { backgroundColor: colors.accentLight },
        formatOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
        formatOptionTextActive: { color: colors.accent, fontWeight: '700' },
    });
}
