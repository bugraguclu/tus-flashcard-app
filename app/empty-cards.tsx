import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useApp } from './(tabs)/app-context';
import { findEmptyCards, deleteAnkiCardOnly, type EmptyCardEntry } from '../lib/noteManager';
import { dbDeleteFtsCard } from '../lib/db';

export default function EmptyCardsScreen() {
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
            alert('Hata', 'Kart silinemedi.');
        }
    };

    const deleteAll = () => {
        if (!entries || entries.length === 0) return;
        confirm(
            'Boş Kartları Sil',
            `${entries.length} boş kart kalıcı olarak silinecek. Notların kendisi ve geçerli diğer kartları etkilenmeyecek.`,
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
                    alert('Hata', 'Kartlar silinemedi.');
                } finally {
                    setBusy(false);
                }
            },
            { destructive: true },
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    Şablonu artık mevcut olmayan, alanı boşalmış ya da metinden kaldırılmış bir kapama
                    numarasına ait kartlar burada listelenir. Bunlar notun kendisini değil, yalnızca
                    o tek geçersiz kartı temsil eder.
                </Text>

                {entries === null ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.help}>Taranıyor…</Text>
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyIcon}>✅</Text>
                        <Text style={styles.emptyText}>Boş kart bulunamadı.</Text>
                    </View>
                ) : (
                    <>
                        <TouchableOpacity
                            style={[styles.deleteAllBtn, busy && styles.btnDisabled]}
                            onPress={deleteAll}
                            disabled={busy}
                        >
                            <Text style={styles.deleteAllText}>🗑️ Tümünü Sil ({entries.length})</Text>
                        </TouchableOpacity>

                        {entries.map((entry) => (
                            <View key={entry.cardId} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.rowQuestion} numberOfLines={2}>
                                        {entry.question || '(boş)'}
                                    </Text>
                                    <Text style={styles.rowReason}>{entry.reason}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.rowDeleteBtn}
                                    onPress={() => deleteOne(entry.cardId)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Bu kartı sil"
                                >
                                    <Text style={styles.rowDeleteText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </>
                )}

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
