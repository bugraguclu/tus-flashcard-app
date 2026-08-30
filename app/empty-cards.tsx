import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    type ListRenderItemInfo,
} from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useApp } from '../contexts/AppContext';
import { findEmptyCards, deleteAnkiCardOnly, type EmptyCardEntry } from '../lib/noteManager';
import { dbDeleteFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';

export default function EmptyCardsScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { bumpDataVersion, dataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [entries, setEntries] = useState<EmptyCardEntry[] | null>(null);
    const [busy, setBusy] = useState(false);

    const scan = () => {
        setEntries(null);
        // findEmptyCards is synchronous SQLite work; defer one tick so the loading state paints.
        setTimeout(() => setEntries(findEmptyCards()), 0);
    };

    useEffect(() => { scan(); }, [dataVersion]);

    const deleteOne = (cardId: number) => {
        try {
            deleteAnkiCardOnly(cardId);
            dbDeleteFtsCard(cardId);
            bumpDataVersion();
            setEntries((prev) => (prev ? prev.filter((e) => e.cardId !== cardId) : prev));
        } catch (e) {
            console.warn('[EmptyCards] delete failed:', e);
            alert(t('common.error'), l('Kart silinemedi.', 'Could not delete the card.'));
        }
    };

    const deleteAll = () => {
        if (!entries || entries.length === 0) return;
        confirm(
            l('Boş Kartları Sil', 'Delete Empty Cards'),
            l(`${entries.length} boş kart kalıcı olarak silinecek. Notların kendisi ve diğer geçerli kartları etkilenmeyecek.`, `${entries.length} empty cards will be permanently deleted. Their notes and other valid cards will not be affected.`),
            () => {
                setBusy(true);
                try {
                    for (const entry of entries) {
                        deleteAnkiCardOnly(entry.cardId);
                        dbDeleteFtsCard(entry.cardId);
                    }
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

    // A botched import can leave thousands of empty cards; every row was being mounted at once.
    const renderRow = useCallback(({ item }: ListRenderItemInfo<EmptyCardEntry>) => (
        <View style={styles.row}>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowQuestion} numberOfLines={2}>
                    {item.question || l('(boş)', '(empty)')}
                </Text>
                <Text style={styles.rowReason}>{item.reason}</Text>
            </View>
            <TouchableOpacity
                style={styles.rowDeleteBtn}
                onPress={() => deleteOne(item.cardId)}
                accessibilityRole="button"
                accessibilityLabel={l('Bu kartı sil', 'Delete this card')}
            >
                <Text style={styles.rowDeleteText}>✕</Text>
            </TouchableOpacity>
        </View>
    ), [styles, l]);

    const header = (
        <>
            <Text style={styles.help}>
                {l('Şablonu artık bulunmayan, alanı boş olan veya metinden kaldırılmış bir kapama numarasına ait kartlar burada listelenir. Bunlar notun kendisini değil, yalnızca geçersiz kartı temsil eder.', 'Cards whose template no longer exists, whose field is empty, or whose cloze number was removed from the text appear here. These represent only the invalid card, not the note itself.')}
            </Text>

            {entries === null ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.help}>{l('Taranıyor…', 'Scanning…')}</Text>
                </View>
            ) : entries.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyIcon}>✅</Text>
                    <Text style={styles.emptyText}>{l('Boş kart bulunamadı.', 'No empty cards found.')}</Text>
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.deleteAllBtn, busy && styles.btnDisabled]}
                    onPress={deleteAll}
                    disabled={busy}
                >
                    <Text style={styles.deleteAllText}>🗑️ {l('Tümünü Sil', 'Delete All')} ({entries.length})</Text>
                </TouchableOpacity>
            )}
        </>
    );

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={entries ?? []}
                renderItem={renderRow}
                keyExtractor={(item) => String(item.cardId)}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator
                ListHeaderComponent={header}
                ListFooterComponent={(
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                        <Text style={styles.cancelText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                )}
            />
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
        cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
        cancelText: { fontSize: FontSize.md, color: colors.textMuted },
    });
}
