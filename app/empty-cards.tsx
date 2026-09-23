import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { findEmptyCards, deleteAnkiCardOnly, deleteAnkiCardsOnly, type EmptyCardEntry } from '../lib/noteManager';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';

function emptyCardReason(reason: EmptyCardEntry['reason'], l: (tr: string, en: string) => string): string {
    if (reason.includes('Kapama')) return l('Kapama metinde yok', 'Cloze is missing from the text');
    if (reason.includes('Şablon')) return l('Şablon artık yok', 'Template no longer exists');
    return l('Ön yüz boş', 'Front is empty');
}

export default function EmptyCardsScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [entries, setEntries] = useState<EmptyCardEntry[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    const scan = () => {
        setEntries(null);
        setError(false);
        // findEmptyCards is synchronous SQLite work; defer one tick so the loading state paints.
        setTimeout(() => {
            try {
                setEntries(findEmptyCards());
            } catch (e) {
                console.warn('[EmptyCards] scan failed:', e);
                setError(true);
                setEntries([]);
            }
        }, 0);
    };

    useEffect(() => { scan(); }, [dataVersion]);

    const deleteOne = (entry: EmptyCardEntry) => {
        confirm(
            l('Boş kartı sil', 'Delete Empty Card'),
            l('Bu kart silinecek. Not ve diğer kartlar korunur.', 'This card will be deleted. The note and other cards stay intact.'),
            () => {
                try {
                    deleteAnkiCardOnly(entry.cardId);
                    bumpDataVersion();
                    setEntries((prev) => (prev ? prev.filter((e) => e.cardId !== entry.cardId) : prev));
                } catch (e) {
                    console.warn('[EmptyCards] delete failed:', e);
                    alert(t('common.error'), l('Kart silinemedi.', 'Could not delete the card.'));
                }
            },
            { destructive: true },
        );
    };

    const deleteAll = () => {
        if (!entries || entries.length === 0) return;
        confirm(
            l('Boş kartları sil', 'Delete Empty Cards'),
            l(`${entries.length} boş kart kalıcı olarak silinecek. Notların kendisi ve diğer geçerli kartları etkilenmeyecek.`, `${entries.length} empty cards will be permanently deleted. Their notes and other valid cards will not be affected.`),
            () => {
                setBusy(true);
                try {
                    deleteAnkiCardsOnly(entries.map((entry) => entry.cardId));
                    bumpDataVersion();
                    setEntries([]);
                } catch (e) {
                    console.warn('[EmptyCards] bulk delete failed:', e);
                    alert(t('common.error'), l('Kartlar silinemedi.', 'Could not delete the cards.'));
                } finally {
                    setBusy(false);
                }
            },
            { destructive: true },
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={l('Boş kartlar', 'Empty Cards')}
                onBack={() => router.canGoBack() ? router.back() : router.replace('/decks' as any)}
                backAccessibilityLabel={l('Destelere dön', 'Back to decks')}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    {l('Ön yüzü artık üretilemeyen kartlar burada görünür. Silmek kartı kaldırır; notu ve diğer kartları korur.', 'Cards whose front can no longer be generated appear here. Deleting one keeps its note and other cards.')}
                </Text>

                {entries === null ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.help}>{l('Taranıyor…', 'Scanning…')}</Text>
                    </View>
                ) : error ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>{l('Kartlar taranamadı.', 'Cards could not be scanned.')}</Text>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={scan} accessibilityRole="button" accessibilityLabel={l('Tekrar tara', 'Scan again')}>
                            <Text style={styles.secondaryBtnText}>{t('common.retry')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyIcon}>✅</Text>
                        <Text style={styles.emptyText}>{l('Boş kart bulunamadı.', 'No empty cards found.')}</Text>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity
                            style={[styles.deleteAllBtn, busy && styles.btnDisabled]}
                            onPress={deleteAll}
                            disabled={busy}
                        >
                            <Text style={styles.deleteAllText}>🗑️ {l('Tümünü sil', 'Delete All')} ({entries.length})</Text>
                        </TouchableOpacity>

                        {entries.map((entry) => (
                            <View key={entry.cardId} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.rowQuestion} numberOfLines={2}>
                                        {entry.question || l('(boş)', '(empty)')}
                                    </Text>
                                    <Text style={styles.rowReason}>{emptyCardReason(entry.reason, l)}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.rowDeleteBtn}
                                    onPress={() => deleteOne(entry)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Bu kartı sil', 'Delete this card')}
                                >
                                    <Text style={styles.rowDeleteText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.sm },
        help: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 20 },
        loadingBox: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
        emptyBox: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xxl },
        emptyIcon: { fontSize: 32 },
        emptyText: { fontSize: FontSize.md, color: colors.textSecondary },
        secondaryBtn: {
            marginTop: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        secondaryBtnText: { color: colors.accent, fontWeight: '600' },
        deleteAllBtn: {
            backgroundColor: colors.badgeNewBg,
            borderWidth: 1,
            borderColor: colors.badgeNew,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
        },
        btnDisabled: { opacity: 0.5 },
        deleteAllText: { color: colors.badgeNew, fontWeight: '700' },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            padding: Spacing.md,
        },
        rowQuestion: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '600' },
        rowReason: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
        rowDeleteBtn: {
            width: 32,
            height: 32,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgInput,
        },
        rowDeleteText: { color: colors.badgeNew, fontWeight: '700' },
    });
}
