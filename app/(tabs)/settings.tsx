import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
    Platform,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { loadSettings, saveSettings, resetAllData, exportAllData, DEFAULT_SETTINGS } from '../../lib/storage';
import type { AppSettings } from '../../lib/types';

export default function SettingsScreen() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        loadSettings().then((value) => {
            setSettings(value);
            setLoading(false);
        });
    }, []);

    const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        await saveSettings(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const handleExport = async () => {
        try {
            const json = await exportAllData();
            if (Platform.OS === 'web') {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `tus-flashcard-export-${new Date().toISOString().split('T')[0]}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
            } else {
                Alert.alert('Dışa aktarma', 'Yedek verisi üretildi.');
            }
        } catch {
            Alert.alert('Hata', 'Dışa aktarma başarısız.');
        }
    };

    const handleReset = () => {
        Alert.alert(
            '⚠️ İlerlemeyi Sıfırla',
            'Bu işlem tüm çalışma verisini sıfırlar. Geri alınamaz.',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Sıfırla',
                    style: 'destructive',
                    onPress: async () => {
                        await resetAllData();
                        await saveSettings(DEFAULT_SETTINGS);
                        setSettings(DEFAULT_SETTINGS);
                        Alert.alert('✅ Sıfırlandı', 'Tüm ilerleme temizlendi.');
                    },
                },
            ],
        );
    };

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

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🧠 Scheduler</Text>
                    <Text style={styles.sectionDesc}>
                        Uygulama şu anda Anki V3 davranışına göre çalışır. Again/Hard/Good/Easy akışı kalıcı olarak SQLite üzerinde saklanır.
                    </Text>
                    <View style={styles.algorithmCardActive}>
                        <Text style={styles.algName}>ANKI_V3</Text>
                        <Text style={styles.algDesc}>Learning + Relearning + Review pipeline</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Çalışma Ayarları</Text>

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
                        <Text style={styles.settingLabel}>Günlük Review Limiti</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dailyReviewLimit', Math.max(20, settings.dailyReviewLimit - 20))}
                            >
                                <Text style={styles.stepBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.inputValue}>{settings.dailyReviewLimit}</Text>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dailyReviewLimit', settings.dailyReviewLimit + 20)}
                            >
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Queue Sırası</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'learning-review-new' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'learning-review-new')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'learning-review-new' && styles.optionTextActive]}>
                                    Learning → Review → New
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'learning-new-review' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'learning-new-review')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'learning-new-review' && styles.optionTextActive]}>
                                    Learning → New → Review
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>New Card Order</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'sequential' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'sequential')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'sequential' && styles.optionTextActive]}>
                                    Sequential
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'random' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'random')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'random' && styles.optionTextActive]}>
                                    Random
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Learning Steps (dakika)</Text>
                        <View style={styles.inputRow}>
                            {[[1, 10], [1, 10, 60], [5, 20], [1, 5, 15]].map((steps, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.optionBtn,
                                        JSON.stringify(settings.learningSteps) === JSON.stringify(steps) && styles.optionBtnActive,
                                    ]}
                                    onPress={() => updateSetting('learningSteps', steps)}
                                >
                                    <Text
                                        style={[
                                            styles.optionText,
                                            JSON.stringify(settings.learningSteps) === JSON.stringify(steps) && styles.optionTextActive,
                                        ]}
                                    >
                                        {steps.join(', ')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Lapse Steps (dakika)</Text>
                        <View style={styles.inputRow}>
                            {[[10], [5, 15], [10, 30], [1, 10]].map((steps, index) => (
                                <TouchableOpacity
                                    key={`lapse-${index}`}
                                    style={[
                                        styles.optionBtn,
                                        JSON.stringify(settings.lapseSteps) === JSON.stringify(steps) && styles.optionBtnActive,
                                    ]}
                                    onPress={() => updateSetting('lapseSteps', steps)}
                                >
                                    <Text
                                        style={[
                                            styles.optionText,
                                            JSON.stringify(settings.lapseSteps) === JSON.stringify(steps) && styles.optionTextActive,
                                        ]}
                                    >
                                        {steps.join(', ')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Graduating Interval (gün)</Text>
                        <View style={styles.inputRow}>
                            {[1, 2, 3, 4].map((value) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.optionBtn, settings.graduatingInterval === value && styles.optionBtnActive]}
                                    onPress={() => updateSetting('graduatingInterval', value)}
                                >
                                    <Text style={[styles.optionText, settings.graduatingInterval === value && styles.optionTextActive]}>
                                        {value}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Easy Interval (gün)</Text>
                        <View style={styles.inputRow}>
                            {[3, 4, 5, 7].map((value) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.optionBtn, settings.easyInterval === value && styles.optionBtnActive]}
                                    onPress={() => updateSetting('easyInterval', value)}
                                >
                                    <Text style={[styles.optionText, settings.easyInterval === value && styles.optionTextActive]}>
                                        {value}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Lapse New Interval (%)</Text>
                        <View style={styles.inputRow}>
                            {[0.4, 0.5, 0.7, 0.8].map((value) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.optionBtn, settings.lapseNewInterval === value && styles.optionBtnActive]}
                                    onPress={() => updateSetting('lapseNewInterval', value)}
                                >
                                    <Text style={[styles.optionText, settings.lapseNewInterval === value && styles.optionTextActive]}>
                                        {Math.round(value * 100)}%
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💾 Veri Yönetimi</Text>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
                        <Text style={styles.actionBtnText}>📤 Verileri Dışa Aktar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleReset}>
                        <Text style={[styles.actionBtnText, styles.dangerText]}>🗑️ İlerlemeyi Sıfırla</Text>
                    </TouchableOpacity>
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

    algorithmCardActive: {
        borderColor: Colors.accent,
        backgroundColor: Colors.accentLight,
        borderWidth: 1,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
    },
    algName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.accent },
    algDesc: { fontSize: FontSize.sm, color: Colors.accentHover, marginTop: 2 },

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
});
