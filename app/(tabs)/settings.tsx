// ============================================================
// TUS Flashcard - Ayarlar Ekranı
// ============================================================

import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, Alert,
    Platform,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { loadSettings, saveSettings, resetAllData, exportAllData, DEFAULT_SETTINGS } from '../../lib/storage';
import { getAvailableAlgorithms } from '../../lib/scheduler';
import type { AppSettings, AlgorithmType } from '../../lib/types';

export default function SettingsScreen() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        loadSettings().then(s => { setSettings(s); setLoading(false); });
    }, []);

    const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        await saveSettings(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleExport = async () => {
        try {
            const json = await exportAllData();
            if (Platform.OS === 'web') {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tus-flashcard-export-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                Alert.alert('Dışa aktarma', 'Veriler hazırlandı. Paylaşmak istiyor musunuz?');
            }
        } catch (e) {
            Alert.alert('Hata', 'Dışa aktarma başarısız.');
        }
    };

    const handleReset = () => {
        Alert.alert(
            '⚠️ İlerlemeyi Sıfırla',
            'Tüm kart ilerlemeleriniz silinecek. Bu işlem geri alınamaz.',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Sıfırla',
                    style: 'destructive',
                    onPress: async () => {
                        await resetAllData();
                        Alert.alert('✅ Sıfırlandı', 'Tüm ilerleme sıfırlandı.');
                    },
                },
            ],
        );
    };

    const algorithms = getAvailableAlgorithms();

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 48 }}>⚙️</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>⚙️ Ayarlar</Text>
                    {saved && (
                        <View style={styles.savedBadge}>
                            <Text style={styles.savedText}>✓ Kaydedildi</Text>
                        </View>
                    )}
                </View>

                {/* Algoritma Seçimi */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🧠 Zamanlama Algoritması</Text>
                    <Text style={styles.sectionDesc}>
                        Kartların ne sıklıkla gösterileceğini belirleyen algoritmayı seçin.
                    </Text>
                    <View style={styles.algorithmGrid}>
                        {algorithms.map(alg => (
                            <TouchableOpacity
                                key={alg.type}
                                style={[styles.algorithmCard, settings.algorithm === alg.type && styles.algorithmCardActive]}
                                onPress={() => updateSetting('algorithm', alg.type)}
                            >
                                <Text style={[styles.algName, settings.algorithm === alg.type && styles.algNameActive]}>
                                    {alg.name}
                                </Text>
                                <Text style={[styles.algDesc, settings.algorithm === alg.type && styles.algDescActive]}>
                                    {alg.description}
                                </Text>
                                {settings.algorithm === alg.type && <Text style={styles.algCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* FSRS Ayarları */}
                {settings.algorithm === 'FSRS' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>📐 FSRS Ayarları</Text>
                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>Hedef Hatırlama Oranı</Text>
                            <View style={styles.sliderRow}>
                                {[0.8, 0.85, 0.9, 0.95].map(val => (
                                    <TouchableOpacity
                                        key={val}
                                        style={[styles.optionBtn, settings.desiredRetention === val && styles.optionBtnActive]}
                                        onPress={() => updateSetting('desiredRetention', val)}
                                    >
                                        <Text style={[styles.optionText, settings.desiredRetention === val && styles.optionTextActive]}>
                                            %{val * 100}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                )}

                {/* Genel Ayarlar */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Genel Ayarlar</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Günlük Yeni Kart Limiti</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dailyNewLimit', Math.max(1, settings.dailyNewLimit - 5))}
                            >
                                <Text style={styles.stepBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.inputValue}>{settings.dailyNewLimit}</Text>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dailyNewLimit', settings.dailyNewLimit + 5)}
                            >
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Öğrenme Adımları (dakika)</Text>
                        <View style={styles.inputRow}>
                            {[[1, 10], [1, 10, 60], [5, 20], [1, 5, 15]].map((steps, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[
                                        styles.optionBtn,
                                        JSON.stringify(settings.learningSteps) === JSON.stringify(steps) && styles.optionBtnActive,
                                    ]}
                                    onPress={() => updateSetting('learningSteps', steps)}
                                >
                                    <Text style={[
                                        styles.optionText,
                                        JSON.stringify(settings.learningSteps) === JSON.stringify(steps) && styles.optionTextActive,
                                    ]}>
                                        {steps.join(', ')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Mezuniyet Aralığı (gün)</Text>
                        <View style={styles.inputRow}>
                            {[1, 2, 3, 4].map(val => (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.optionBtn, settings.graduatingInterval === val && styles.optionBtnActive]}
                                    onPress={() => updateSetting('graduatingInterval', val)}
                                >
                                    <Text style={[styles.optionText, settings.graduatingInterval === val && styles.optionTextActive]}>
                                        {val}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Kolay Kart Aralığı (gün)</Text>
                        <View style={styles.inputRow}>
                            {[3, 4, 5, 7].map(val => (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.optionBtn, settings.easyInterval === val && styles.optionBtnActive]}
                                    onPress={() => updateSetting('easyInterval', val)}
                                >
                                    <Text style={[styles.optionText, settings.easyInterval === val && styles.optionTextActive]}>
                                        {val}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Data Management */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💾 Veri Yönetimi</Text>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
                        <Text style={styles.actionBtnText}>📤 Verileri Dışa Aktar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleReset}>
                        <Text style={[styles.actionBtnText, styles.dangerText]}>🗑️ İlerlemeyi Sıfırla</Text>
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>TusAnkiM v1.0</Text>
                    <Text style={styles.footerText}>Powered by Kürşad Güçlü</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 80 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
    savedBadge: {
        backgroundColor: Colors.btnGoodBg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: BorderRadius.sm,
    },
    savedText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.btnGood },

    section: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
    sectionDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 20 },

    algorithmGrid: { gap: 8 },
    algorithmCard: {
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.bgSecondary,
        position: 'relative',
    },
    algorithmCardActive: {
        borderColor: Colors.accent,
        backgroundColor: Colors.accentLight,
    },
    algName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    algNameActive: { color: Colors.accent },
    algDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
    algDescActive: { color: Colors.accentHover },
    algCheck: { position: 'absolute', top: 10, right: 12, fontSize: FontSize.lg, color: Colors.accent, fontWeight: '700' },

    settingRow: { marginTop: Spacing.md },
    settingLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },

    inputRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    stepBtn: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.bgSecondary,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepBtnText: { fontSize: FontSize.xl, fontWeight: '600', color: Colors.textPrimary },
    inputValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.accent, minWidth: 40, textAlign: 'center', lineHeight: 36 },

    sliderRow: { flexDirection: 'row', gap: 8 },
    optionBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: Colors.bgSecondary,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
    },
    optionBtnActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
    optionText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
    optionTextActive: { color: Colors.accent, fontWeight: '700' },

    actionBtn: {
        paddingVertical: Spacing.md,
        backgroundColor: Colors.bgSecondary,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    actionBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    dangerBtn: { borderColor: '#e8c4c0' },
    dangerText: { color: Colors.btnAgain },

    footer: { alignItems: 'center', marginTop: Spacing.md, gap: 2 },
    footerText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
