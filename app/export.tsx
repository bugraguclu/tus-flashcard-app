import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { BorderRadius, FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { alert } from '../lib/confirm';
import { getLegacyFileSystem, shareOrDownloadFileWeb } from '../lib/files';
import { buildAnkiExport, type AnkiExportFormat, type ExportArtifact, type ExportCollectionSource } from '../lib/exportAnkiPackage';
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

/** Anki's export formats, in the order of its dialog. */
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
    const [recoveryArtifact, setRecoveryArtifact] = useState<ExportArtifact | undefined>();
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
    // Anki's export dialog defaults (qt/aqt/forms/exporting.ui, exporting.py): scheduling on,
    // except when the dialog is opened from one deck; deck presets and the deck, note type and
    // GUID columns off; media, HTML and tags on.
    const [includeMedia, setIncludeMedia] = useState(true);
    const [includeScheduling, setIncludeScheduling] = useState(backupExport || !deckName);
    const [includeDeckConfigs, setIncludeDeckConfigs] = useState(false);
    const [includeHtml, setIncludeHtml] = useState(true);
    const [includeTags, setIncludeTags] = useState(true);
    const [includeDeck, setIncludeDeck] = useState(false);
    const [includeNotetype, setIncludeNotetype] = useState(false);
    const [includeGuid, setIncludeGuid] = useState(false);
    // Anki's "Support older Anki versions", off by default: packages use the current format.
    const [legacySupport, setLegacySupport] = useState(false);
    const [busy, setBusy] = useState(false);
    // Anki confirms what an export actually contained instead of closing silently.
    const [summary, setSummary] = useState<string[] | null>(null);
    const allDecksSelected = exportableDecks.length > 0
        && exportableDecks.every((deck) => selectedDeckIds.has(deck.id));
    // A collection package is always the whole collection, so a selection of cards cannot be one.
    const availableFormats = selectionExport ? FORMATS.filter((item) => item.id !== 'colpkg') : FORMATS;
    const packageFormat = format === 'apkg' || format === 'colpkg';
    const choosesDecks = !selectionExport && format !== 'colpkg';
    const nothingSelected = !recoveryArtifact && choosesDecks && selectedDeckIds.size === 0;

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
        setRecoveryArtifact(undefined);
        void readBackup(backupName)
            .then((contents) => {
                if (JSON.parse(contents)?.recoveryOnly === true) {
                    if (!cancelled) setRecoveryArtifact({ fileName: backupName, mimeType: 'application/json', text: contents });
                    return undefined;
                }
                return parseBackupExportSource(contents, backupName);
            })
            .then((source) => {
                if (cancelled || !source) return;
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
        if (!deckName) return;
        const all = getAllDecks();
        const isRequestedCatalog = all.some((d) => (d.name === deckName || d.name.startsWith(`${deckName}::`)) && isCatalogDeck(d));
        if (isRequestedCatalog) {
            alert(
                l('Katalog Korumalı', 'Catalog Protected'),
                l('Dahili TUS desteleri dışa aktarılamaz.', 'Built-in TUS decks cannot be exported.'),
                () => handleBack(),
            );
        }
    }, [deckName, l]);

    const handleExport = async () => {
        if (backupExport && !backupSource && !recoveryArtifact) {
            alert(t('common.error'), sourceError ?? l('Yedek henüz hazırlanmadı.', 'The backup is not ready yet.'));
            return;
        }
        if (selectionExport && selectedCardIds?.length === 0) {
            alert(t('common.error'), l('Dışa aktarılacak seçili kart bulunamadı.', 'No selected cards are available to export.'));
            return;
        }
        if (nothingSelected) {
            alert(t('common.error'), l('Dışa aktarılacak en az bir deste seçin.', 'Select at least one deck to export.'));
            return;
        }
        const unchangedDeckScope = Boolean(deckName)
            && selectedDeckIds.size === initialDeckScopeIds.size
            && [...selectedDeckIds].every((id) => initialDeckScopeIds.has(id));
        setBusy(true);
        setSummary(null);
        try {
            const artifact = recoveryArtifact ?? await buildAnkiExport(format, unchangedDeckScope ? deckName : undefined, includeMedia, selectedCardIds, {
                // Every deck selected is Anki's "All Decks": the whole collection.
                selectedDeckIds: !choosesDecks || allDecksSelected ? undefined : [...selectedDeckIds],
                includeScheduling,
                includeDeckConfigs,
                includeHtml,
                includeTags,
                includeDeck,
                includeNotetype,
                includeGuid,
                legacySupport,
            }, backupSource);
            const lines: string[] = [];
            if (artifact.noteCount !== undefined) {
                lines.push(l(`${artifact.noteCount} not dışa aktarıldı.`, `${artifact.noteCount} notes exported.`));
            }
            if (artifact.cardCount !== undefined) {
                lines.push(l(`${artifact.cardCount} kart dışa aktarıldı.`, `${artifact.cardCount} cards exported.`));
            }
            if (artifact.mediaCount) {
                lines.push(l(`${artifact.mediaCount} medya dosyası dışa aktarıldı.`, `Exported ${artifact.mediaCount} media files.`));
            }
            setSummary(lines.length ? lines : null);
            if (Platform.OS === 'web') {
                const contents = artifact.text ?? artifact.bytes;
                if (contents !== undefined) await shareOrDownloadFileWeb(artifact.fileName, contents, artifact.mimeType);
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
                {recoveryArtifact ? <Text style={styles.backupNoticeText}>{l('Bu kopya hasarlı satırları kurtarma için saklar. Ham JSON dosyasını paylaşabilirsiniz; doğrudan geri yüklenemez.', 'This copy preserves damaged rows for recovery. You can share the raw JSON file; it cannot be restored directly.')}</Text> : <>
                <Text style={styles.label}>{l('Dışa aktarma biçimi', 'Export format')}</Text>
                <View accessibilityRole="radiogroup">
                    {availableFormats.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.checkboxRow}
                            onPress={() => setFormat(item.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: item.id === format }}
                            aria-checked={item.id === format}
                        >
                            <View style={[styles.radio, item.id === format && styles.radioSelected]}>
                                {item.id === format ? <View style={styles.radioDot} /> : null}
                            </View>
                            <Text style={styles.checkboxText}>{l(item.tr, item.en)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {choosesDecks ? (
                    <DeckExportSelector
                        decks={exportableDecks}
                        selectedIds={selectedDeckIds}
                        onChange={setSelectedDeckIds}
                        initiallyExpandedDeck={deckName}
                    />
                ) : (
                    <Text style={styles.selectionCaption}>{selectionExport
                        ? l(`${selectedCardIds?.length ?? 0} seçili kart dışa aktarılacak.`, `${selectedCardIds?.length ?? 0} selected cards will be exported.`)
                        : l('Koleksiyonun tamamı, çalışma programıyla birlikte.', 'The whole collection, with its scheduling.')}</Text>
                )}

                <Text style={styles.label}>{l('Dahil et', 'Include')}</Text>
                {packageFormat ? <>
                    {format === 'apkg' ? <>
                        <CheckboxRow styles={styles} checked={includeScheduling} onToggle={setIncludeScheduling}
                            label={l('Çalışma programını dahil et', 'Include scheduling information')}
                            hint={l('Kapalıysa kartlar yeni duruma döner; geçmiş, bayraklar, “marked” ve “leech” etiketleri temizlenir.', 'When off, cards are reset to New; history, flags, and “marked” and “leech” tags are removed.')} />
                        <CheckboxRow styles={styles} checked={includeDeckConfigs} onToggle={setIncludeDeckConfigs}
                            label={l('Deste ayarlarını dahil et', 'Include deck presets')} />
                    </> : null}
                    <CheckboxRow styles={styles} checked={includeMedia} onToggle={setIncludeMedia}
                        label={l('Medyayı dahil et', 'Include media')}
                        hint={backupExport ? l(
                            'JSON yedeği medya dosyalarını saklamaz. Açıkken yalnızca bu cihazda hâlâ bulunan eşleşen medya eklenir.',
                            'JSON backups do not store media files. When enabled, only matching media still present on this device is included.',
                        ) : undefined} />
                    <CheckboxRow styles={styles} checked={legacySupport} onToggle={setLegacySupport}
                        label={l('Eski Anki sürümlerini destekle', 'Support older Anki versions')}
                        hint={l('Paketi, yeni biçimi açamayan eski Anki sürümlerinin (2.1.50 öncesi) de açabileceği biçimde yazar.', 'Writes the package in the format Anki versions before 2.1.50, which cannot read the current one, also open.')} />
                </> : <>
                    <CheckboxRow styles={styles} checked={includeHtml} onToggle={setIncludeHtml}
                        label={l('HTML ve medya referanslarını dahil et', 'Include HTML and media references')} />
                    {format === 'notesTxt' ? <>
                        <CheckboxRow styles={styles} checked={includeTags} onToggle={setIncludeTags} label={l('Etiketleri dahil et', 'Include tags')} />
                        <CheckboxRow styles={styles} checked={includeDeck} onToggle={setIncludeDeck} label={l('Deste adını dahil et', 'Include deck name')} />
                        <CheckboxRow styles={styles} checked={includeNotetype} onToggle={setIncludeNotetype} label={l('Not türü adını dahil et', 'Include note type name')} />
                        <CheckboxRow styles={styles} checked={includeGuid} onToggle={setIncludeGuid} label={l('Benzersiz kimliği dahil et', 'Include unique identifier')} />
                    </> : null}
                </>}
                </>}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.actionButton, nothingSelected && styles.actionButtonDisabled]}
                        onPress={handleExport}
                        disabled={busy || nothingSelected}
                        accessibilityRole="button"
                        accessibilityLabel={l('Dışa aktar', 'Export')}
                        accessibilityState={{ disabled: busy || nothingSelected, busy }}
                    >
                        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.actionText}>{l('Dışa aktar', 'Export')}</Text>}
                    </TouchableOpacity>
                    {summary ? (
                        <View style={styles.summaryBlock}>
                            {summary.map((line) => (
                                <Text key={line} style={styles.summaryLine}>{line}</Text>
                            ))}
                        </View>
                    ) : null}
                </View>
                </> : null}
                </View>
            </ScrollView>

        </SafeAreaView>
    );
}

type Styles = ReturnType<typeof createStyles>;

function CheckboxRow({ styles, checked, onToggle, label, hint }: {
    styles: Styles;
    checked: boolean;
    onToggle: (checked: boolean) => void;
    label: string;
    hint?: string;
}) {
    return (
        <TouchableOpacity style={styles.checkboxRow} onPress={() => onToggle(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <View style={styles.optionCopy}>
                <Text style={styles.checkboxText}>{label}</Text>
                {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
            </View>
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        scrollContent: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', justifyContent: 'flex-start', padding: Spacing.lg, paddingBottom: 100 },
        dialog: { backgroundColor: colors.bgCard, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: 8, borderWidth: 1, borderColor: colors.border },
        label: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary, marginTop: Spacing.sm },
        selectionCaption: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
        backupNotice: { padding: Spacing.md, gap: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentLight, marginBottom: Spacing.sm },
        backupNoticeTitle: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '800' },
        backupNoticeName: { color: colors.textPrimary, fontSize: FontSize.xs, fontWeight: '600' },
        backupNoticeText: { color: colors.textSecondary, fontSize: FontSize.xs, lineHeight: 17 },
        sourceLoader: { marginVertical: Spacing.xl },
        sourceError: { color: colors.btnAgain, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center', paddingVertical: Spacing.lg },
        radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
        radioSelected: { borderColor: colors.accent },
        radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
        checkboxRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
        checkbox: { width: 22, height: 22, borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
        checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkmark: { color: colors.white, fontSize: 16, fontWeight: '800', lineHeight: 18 },
        checkboxText: { fontSize: FontSize.md, color: colors.textPrimary },
        optionCopy: { flex: 1, gap: 2 },
        optionHint: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted },
        actions: { marginTop: Spacing.lg },
        summaryBlock: { marginTop: Spacing.md, gap: 2 },
        summaryLine: { fontSize: FontSize.sm, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
        actionButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: colors.accent },
        actionButtonDisabled: { opacity: 0.4 },
        actionText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
    });
}
