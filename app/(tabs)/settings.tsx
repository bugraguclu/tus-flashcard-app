import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../../constants/theme';
import {
    loadSettings,
    saveSettings,
    resetAllData,
    resetSettingsToDefaults,
    exportAllData,
    importAllData,
    DEFAULT_SETTINGS,
    DEFAULT_KEY_BINDINGS,
} from '../../lib/storage';
import { checkDatabase } from '../../lib/maintenance';
import { downloadTextFileWeb, getLegacyFileSystem, readUriText } from '../../lib/files';
import { confirm, alert } from '../../lib/confirm';
import { useApp } from './_layout';
import type { AppSettings, KeyBindings, ThemeMode } from '../../lib/types';

/** Human label for a stored key binding value (a raw KeyboardEvent.key). */
function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    if (key.length === 1) return key.toUpperCase();
    return key;
}

const KEY_BINDING_ROWS: Array<{ field: keyof KeyBindings; label: string }> = [
    { field: 'showAnswer', label: 'Cevabı Göster' },
    { field: 'again', label: 'Tekrar (Again)' },
    { field: 'hard', label: 'Zor (Hard)' },
    { field: 'good', label: 'İyi (Good)' },
    { field: 'easy', label: 'Kolay (Easy)' },
];

export default function SettingsScreen() {
    const router = useRouter();
    const { refreshData, bumpDataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Field currently waiting for the user to press a key (web only); null = not recording.
    const [recordingField, setRecordingField] = useState<keyof KeyBindings | null>(null);

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);

        return () => {
            if (savedTimerRef.current) {
                clearTimeout(savedTimerRef.current);
                savedTimerRef.current = null;
            }
        };
    }, []);

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => {
            const updated = { ...prev, [key]: value };
            saveSettings(updated);
            return updated;
        });
        // Side effects that touch other components' state must happen outside the updater
        // above — React invokes that callback during the render phase, and calling another
        // component's setState from there (refreshData/bumpDataVersion live in AppProvider)
        // triggers "Cannot update a component while rendering a different component".
        refreshData();
        bumpDataVersion();

        setSaved(true);
        if (savedTimerRef.current) {
            clearTimeout(savedTimerRef.current);
        }
        savedTimerRef.current = setTimeout(() => {
            setSaved(false);
            savedTimerRef.current = null;
        }, 1500);
    };

    const handleExport = async () => {
        try {
            const json = await exportAllData();
            const fileName = `tus-flashcard-export-${new Date().toISOString().split('T')[0]}.json`;

            if (Platform.OS === 'web') {
                downloadTextFileWeb(fileName, json);
                return;
            }

            // Native: write to the cache dir and hand the file to the share sheet.
            const fs = getLegacyFileSystem();
            const target = `${fs.cacheDirectory ?? ''}${fileName}`;
            await fs.writeAsStringAsync(target, json);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(target, { mimeType: 'application/json', dialogTitle: fileName });
            } else {
                alert('Dışa aktarma', `Yedek dosyası oluşturuldu: ${fileName}`);
            }
        } catch (e) {
            console.warn('[Settings] export failed:', e);
            alert('Hata', 'Dışa aktarma başarısız.');
        }
    };

    const handleImport = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: ['application/json', 'text/plain', '*/*'],
                copyToCacheDirectory: true,
            });
            if (picked.canceled || !picked.assets?.length) return;

            const json = await readUriText(picked.assets[0].uri);

            confirm(
                'Verileri İçe Aktar',
                'Mevcut koleksiyonun yerine seçilen dosya yüklenecek. Bu işlem geri alınamaz.',
                async () => {
                    const ok = await importAllData(json);
                    if (ok) {
                        setSettings(loadSettings());
                        refreshData();
                        bumpDataVersion();
                        alert('Tamamlandı', 'Veriler içe aktarıldı.');
                    } else {
                        alert('Hata', 'Dosya içe aktarılamadı. Geçerli bir yedek dosyası seçin.');
                    }
                },
                { destructive: true },
            );
        } catch (e) {
            console.warn('[Settings] import failed:', e);
            alert('Hata', 'Dosya okunamadı.');
        }
    };

    const handleCheckDatabase = () => {
        try {
            const result = checkDatabase();
            const lines = [
                result.integrity === 'ok'
                    ? '✓ Dosya bütünlüğü: sorun yok'
                    : `⚠️ Dosya bütünlüğü: ${result.integrity}`,
                result.orphanCards === 0
                    ? '✓ Sahipsiz kart yok'
                    : `⚠️ ${result.orphanCards} sahipsiz kart bulundu`,
                result.orphanNotes === 0
                    ? '✓ Kartsız not yok'
                    : `⚠️ ${result.orphanNotes} kartsız not bulundu`,
            ];
            if (result.ftsReindexed > 0) {
                lines.push(`✓ Arama dizini yeniden oluşturuldu (${result.ftsReindexed} kart)`);
            }
            alert('Veritabanı Denetimi', lines.join('\n'));
        } catch (e) {
            console.warn('[Settings] check database failed:', e);
            alert('Hata', 'Veritabanı denetimi başarısız.');
        }
    };

    const handleReset = () => {
        confirm(
            'İlerlemeyi Sıfırla',
            'Bu işlem tüm çalışma verisini sıfırlar. Geri alınamaz.',
            async () => {
                await resetAllData();
                saveSettings(DEFAULT_SETTINGS);
                setSettings(DEFAULT_SETTINGS);
                refreshData();
                bumpDataVersion();
                alert('Sıfırlandı', 'Tüm ilerleme temizlendi.');
            },
            { destructive: true },
        );
    };

    const handleResetSettingsToDefaults = () => {
        confirm(
            'Varsayılan Ayarlara Dön',
            'Tüm ayarlar (görünüm, tercihler, zamanlayıcı) varsayılana döner. Kartların ve ilerlemenin dokunulmaz.',
            () => {
                resetSettingsToDefaults();
                setSettings(loadSettings());
                refreshData();
                bumpDataVersion();
                alert('Tamamlandı', 'Ayarlar varsayılana döndürüldü.');
            },
        );
    };

    // Web-only key capture: while recordingField is set, the next keydown becomes that
    // binding's value. Native platforms don't get shortcuts at all (see index.tsx), so there
    // is nothing to capture there — the row still shows a disabled/inert current value.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || !recordingField) return;

        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            if (event.key === 'Escape') {
                setRecordingField(null);
                return;
            }
            updateSetting('keyBindings', { ...settings.keyBindings, [recordingField]: event.key });
            setRecordingField(null);
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordingField, settings.keyBindings]);

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
                    <Text style={styles.sectionTitle}>🎨 Görünüm</Text>
                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Tema</Text>
                        <View style={styles.inputRow}>
                            {([
                                ['system', 'Sistemi Takip Et'],
                                ['light', 'Açık'],
                                ['dark', 'Koyu'],
                            ] as Array<[ThemeMode, string]>).map(([mode, label]) => (
                                <TouchableOpacity
                                    key={mode}
                                    style={[styles.optionBtn, settings.themeMode === mode && styles.optionBtnActive]}
                                    onPress={() => updateSetting('themeMode', mode)}
                                >
                                    <Text style={[styles.optionText, settings.themeMode === mode && styles.optionTextActive]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🧑‍💻 Kullanıcı Tercihleri</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Günün Başlangıç Saati</Text>
                        <Text style={styles.sectionDesc}>
                            Günlük istatistikler ve kart limitleri bu saatte sıfırlanır (varsayılan 04:00).
                        </Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dayRolloverHour', (settings.dayRolloverHour + 23) % 24)}
                            >
                                <Text style={styles.stepBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.inputValue}>{String(settings.dayRolloverHour).padStart(2, '0')}:00</Text>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('dayRolloverHour', (settings.dayRolloverHour + 1) % 24)}
                            >
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Öğrenme Kartlarını Erken Gösterme (dk)</Text>
                        <Text style={styles.sectionDesc}>
                            {settings.learnAheadMinutes > 0
                                ? `Zamanlayıcısı dolmasına ${settings.learnAheadMinutes} dakikadan az kalan öğrenme kartları, sırada başka kart kalmayınca otomatik gösterilir.`
                                : 'Kapalı: öğrenme kartları yalnızca "⚡ Beklemeden Çalış" ile ya da zamanlayıcıları dolunca gösterilir.'}
                        </Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('learnAheadMinutes', Math.max(0, settings.learnAheadMinutes - 5))}
                            >
                                <Text style={styles.stepBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.inputValue}>{settings.learnAheadMinutes}</Text>
                            <TouchableOpacity
                                style={styles.stepBtn}
                                onPress={() => updateSetting('learnAheadMinutes', Math.min(120, settings.learnAheadMinutes + 5))}
                            >
                                <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Tuş Atamaları</Text>
                        <Text style={styles.sectionDesc}>
                            {Platform.OS === 'web'
                                ? 'Değiştir\'e basıp ardından istediğin tuşa bas.'
                                : 'Klavye kısayolları yalnızca web sürümünde çalışır.'}
                        </Text>
                        {KEY_BINDING_ROWS.map(({ field, label }) => (
                            <View key={field} style={styles.keyBindingRow}>
                                <Text style={styles.keyBindingLabel}>{label}</Text>
                                <View style={styles.inputRow}>
                                    <View style={styles.keyChip}>
                                        <Text style={styles.keyChipText}>
                                            {recordingField === field ? 'Bir tuşa basın…' : formatKeyLabel(settings.keyBindings[field])}
                                        </Text>
                                    </View>
                                    {Platform.OS === 'web' && (
                                        <TouchableOpacity
                                            style={styles.optionBtn}
                                            onPress={() => setRecordingField(recordingField === field ? null : field)}
                                        >
                                            <Text style={styles.optionText}>
                                                {recordingField === field ? 'İptal (Esc)' : 'Değiştir'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))}
                        {JSON.stringify(settings.keyBindings) !== JSON.stringify(DEFAULT_KEY_BINDINGS) && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { marginTop: Spacing.sm }]}
                                onPress={() => updateSetting('keyBindings', DEFAULT_KEY_BINDINGS)}
                            >
                                <Text style={styles.actionBtnText}>Tuş Atamalarını Sıfırla</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity style={[styles.actionBtn, { marginTop: Spacing.lg }]} onPress={handleResetSettingsToDefaults}>
                        <Text style={styles.actionBtnText}>↺ Varsayılan Ayarlara Dön</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🧠 Zamanlayıcı</Text>
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
                        <Text style={styles.settingLabel}>Günlük Tekrar Limiti</Text>
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
                        <Text style={styles.settingLabel}>Yeni Kart Yerleşimi</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'mix' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'mix')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'mix' && styles.optionTextActive]}>
                                    Karışık
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'before' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'before')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'before' && styles.optionTextActive]}>
                                    Önce Yeni
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'after' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'after')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'after' && styles.optionTextActive]}>
                                    Sonra Yeni
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Yeni Kart Sırası</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'sequential' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'sequential')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'sequential' && styles.optionTextActive]}>
                                    Sıralı
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'random' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'random')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'random' && styles.optionTextActive]}>
                                    Rastgele
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Öğrenme Adımları (dakika)</Text>
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
                        <Text style={styles.settingLabel}>Unutma Adımları (dakika)</Text>
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
                        <Text style={styles.settingLabel}>Mezuniyet Aralığı (gün)</Text>
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
                        <Text style={styles.settingLabel}>Kolay Aralığı (gün)</Text>
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
                        <Text style={styles.settingLabel}>Unutma Sonrası Yeni Aralık (%)</Text>
                        <View style={styles.inputRow}>
                            {[0.4, 0.5, 0.7, 0.8].map((value) => (
                                <TouchableOpacity
                                    key={value}
                                    style={[styles.optionBtn, settings.lapseIntervalMultiplier === value && styles.optionBtnActive]}
                                    onPress={() => updateSetting('lapseIntervalMultiplier', value)}
                                >
                                    <Text style={[styles.optionText, settings.lapseIntervalMultiplier === value && styles.optionTextActive]}>
                                        {Math.round(value * 100)}%
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💾 Veri Yönetimi</Text>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/backups')}>
                        <Text style={styles.actionBtnText}>🗄️ Yedekler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
                        <Text style={styles.actionBtnText}>📤 Verileri Dışa Aktar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleImport}>
                        <Text style={styles.actionBtnText}>📥 Verileri İçe Aktar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleCheckDatabase}>
                        <Text style={styles.actionBtnText}>🩺 Veritabanını Denetle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleReset}>
                        <Text style={[styles.actionBtnText, styles.dangerText]}>🗑️ İlerlemeyi Sıfırla</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 80 },
        headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary },
        savedBadge: {
            backgroundColor: colors.btnGoodBg,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: BorderRadius.sm,
        },
        savedText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.btnGood },

        section: {
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            padding: Spacing.lg,
            ...Shadows.sm,
        },
        sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
        sectionDesc: { fontSize: FontSize.sm, color: colors.textMuted, marginBottom: Spacing.md, lineHeight: 20 },

        algorithmCardActive: {
            borderColor: colors.accent,
            backgroundColor: colors.accentLight,
            borderWidth: 1,
            borderRadius: BorderRadius.sm,
            padding: Spacing.md,
        },
        algName: { fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
        algDesc: { fontSize: FontSize.sm, color: colors.accentHover, marginTop: 2 },

        settingRow: { marginTop: Spacing.md },
        settingLabel: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },

        inputRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
        stepBtn: {
            width: 36,
            height: 36,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepBtnText: { fontSize: FontSize.xl, fontWeight: '600', color: colors.textPrimary },
        inputValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.accent, minWidth: 40, textAlign: 'center', lineHeight: 36 },

        optionBtn: {
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        optionBtnActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
        optionText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '500' },
        optionTextActive: { color: colors.accent, fontWeight: '700' },

        keyBindingRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 6,
        },
        keyBindingLabel: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '500' },
        keyChip: {
            minWidth: 64,
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            backgroundColor: colors.accentLight,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
        },
        keyChipText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },

        actionBtn: {
            paddingVertical: Spacing.md,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            marginTop: Spacing.sm,
        },
        actionBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        dangerBtn: { borderColor: '#e8c4c0' },
        dangerText: { color: colors.btnAgain },
    });
}
