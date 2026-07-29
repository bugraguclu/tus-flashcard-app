import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Platform,
    Linking,
    useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
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
import { useI18n } from '../../hooks/useI18n';
import type { TranslationKey } from '../../lib/i18n';
import type { AppLanguage, AppSettings, KeyBindings, ThemeMode } from '../../lib/types';

/** Human label for a stored key binding value (a raw KeyboardEvent.key). */
function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    if (key.length === 1) return key.toUpperCase();
    return key;
}

const KEY_BINDING_ROWS: Array<{ field: keyof KeyBindings; labelKey: TranslationKey }> = [
    { field: 'showAnswer', labelKey: 'anki.showAnswer' },
    { field: 'again', labelKey: 'anki.again' },
    { field: 'hard', labelKey: 'anki.hard' },
    { field: 'good', labelKey: 'anki.good' },
    { field: 'easy', labelKey: 'anki.easy' },
    { field: 'replayAudio', labelKey: 'settings.keyReplayAudio' },
    { field: 'buryCard', labelKey: 'settings.keyBuryCard' },
    { field: 'suspendCard', labelKey: 'settings.keySuspendCard' },
    { field: 'markNote', labelKey: 'settings.keyMarkNote' },
];

const PRIVACY_URL = 'https://bugraguclu.github.io/tus-flashcard-app/privacy.html';
const SUPPORT_URL = 'https://bugraguclu.github.io/tus-flashcard-app/';

export default function SettingsScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktopWeb = Platform.OS === 'web' && width >= 600;
    const { refreshData, bumpDataVersion } = useApp();
    const { t, deviceLanguage } = useI18n();
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
        // Persist synchronously before refreshing the shared context. This is especially
        // important for language changes: every mounted screen should switch in one render.
        const updated = { ...settings, [key]: value };
        saveSettings(updated);
        setSettings(updated);
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
                alert(t('settings.exportTitle'), t('settings.exportCreated', { fileName }));
            }
        } catch (e) {
            console.warn('[Settings] export failed:', e);
            alert(t('common.error'), t('settings.exportFailed'));
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
                t('settings.importTitle'),
                t('settings.importWarning'),
                async () => {
                    const ok = await importAllData(json);
                    if (ok) {
                        setSettings(loadSettings());
                        refreshData();
                        bumpDataVersion();
                        alert(t('common.completed'), t('settings.imported'));
                    } else {
                        alert(t('common.error'), t('settings.invalidBackup'));
                    }
                },
                { destructive: true },
            );
        } catch (e) {
            console.warn('[Settings] import failed:', e);
            alert(t('common.error'), t('settings.fileReadFailed'));
        }
    };

    const handleCheckDatabase = () => {
        try {
            const result = checkDatabase();
            const lines = [
                result.integrity === 'ok'
                    ? t('settings.integrityOk')
                    : t('settings.integrityIssue', { result: result.integrity }),
                result.orphanCards === 0
                    ? t('settings.noOrphanCards')
                    : t('settings.orphanCards', { count: result.orphanCards }),
                result.orphanNotes === 0
                    ? t('settings.noOrphanNotes')
                    : t('settings.orphanNotes', { count: result.orphanNotes }),
            ];
            if (result.ftsReindexed > 0) {
                lines.push(t('settings.searchRebuilt', { count: result.ftsReindexed }));
            }
            alert(t('settings.databaseCheck'), lines.join('\n'));
        } catch (e) {
            console.warn('[Settings] check database failed:', e);
            alert(t('common.error'), t('settings.databaseCheckFailed'));
        }
    };

    const handleReset = () => {
        confirm(
            t('settings.resetProgressTitle'),
            t('settings.resetProgressWarning'),
            async () => {
                await resetAllData();
                saveSettings(DEFAULT_SETTINGS);
                setSettings(DEFAULT_SETTINGS);
                refreshData();
                bumpDataVersion();
                alert(t('settings.resetDone'), t('settings.progressCleared'));
            },
            { destructive: true },
        );
    };

    const handleResetSettingsToDefaults = () => {
        confirm(
            t('settings.resetDefaults'),
            t('settings.resetDefaultsMessage'),
            () => {
                resetSettingsToDefaults();
                setSettings(loadSettings());
                refreshData();
                bumpDataVersion();
                alert(t('common.completed'), t('settings.defaultsRestored'));
            },
        );
    };

    // Keyboard bindings are a desktop-web preference. They stay out of every compact/mobile
    // surface, so a touch user never sees controls that cannot help their current device.
    useEffect(() => {
        if (!isDesktopWeb || typeof window === 'undefined' || !recordingField) return;

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
    }, [isDesktopWeb, recordingField, settings.keyBindings]);

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
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                automaticallyAdjustContentInsets
            >
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{t('settings.title')}</Text>
                    {saved && (
                        <View style={styles.savedBadge}>
                            <Text style={styles.savedText}>✓ {t('common.saved')}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.language')}</Text>
                        <Text style={styles.sectionDesc}>{t('settings.languageDescription')}</Text>
                        <View style={styles.inputRow}>
                            {([
                                ['system', t('settings.languageSystem')],
                                ['tr', t('common.turkish')],
                                ['en', t('common.english')],
                            ] as Array<[AppLanguage, string]>).map(([language, label]) => (
                                <TouchableOpacity
                                    key={language}
                                    style={[styles.optionBtn, settings.language === language && styles.optionBtnActive]}
                                    onPress={() => updateSetting('language', language)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: settings.language === language }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.optionText, settings.language === language && styles.optionTextActive]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {settings.language === 'system' && (
                            <Text style={styles.systemLanguageHint}>
                                {t('settings.languageSystemValue', {
                                    language: deviceLanguage === 'tr' ? t('common.turkish') : t('common.english'),
                                })}
                            </Text>
                        )}
                    </View>
                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.theme')}</Text>
                        <View style={styles.inputRow}>
                            {([
                                ['system', t('settings.followSystem')],
                                ['light', t('settings.light')],
                                ['dark', t('settings.dark')],
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
                    <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.dayStart')}</Text>
                        <Text style={styles.sectionDesc}>{t('settings.dayStartDescription')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.learnAhead')}</Text>
                        <Text style={styles.sectionDesc}>
                            {settings.learnAheadMinutes > 0
                                ? t('settings.learnAheadOn', { minutes: settings.learnAheadMinutes })
                                : t('settings.learnAheadOff')}
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

                    {isDesktopWeb && (
                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>{t('settings.keyBindings')}</Text>
                            <Text style={styles.sectionDesc}>{t('settings.keyBindingsDescription')}</Text>
                            {KEY_BINDING_ROWS.map(({ field, labelKey }) => (
                                <View key={field} style={styles.keyBindingRow}>
                                    <Text style={styles.keyBindingLabel}>{t(labelKey)}</Text>
                                    <View style={styles.inputRow}>
                                        <View style={styles.keyChip}>
                                            <Text style={styles.keyChipText}>
                                                {recordingField === field ? t('settings.pressAKey') : formatKeyLabel(settings.keyBindings[field])}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.optionBtn}
                                            onPress={() => setRecordingField(recordingField === field ? null : field)}
                                        >
                                            <Text style={styles.optionText}>
                                                {recordingField === field ? t('settings.cancelEscape') : t('settings.change')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                            {JSON.stringify(settings.keyBindings) !== JSON.stringify(DEFAULT_KEY_BINDINGS) && (
                                <TouchableOpacity
                                    style={[styles.actionBtn, { marginTop: Spacing.sm }]}
                                    onPress={() => updateSetting('keyBindings', DEFAULT_KEY_BINDINGS)}
                                >
                                    <Text style={styles.actionBtnText}>{t('settings.resetKeyBindings')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <TouchableOpacity style={[styles.actionBtn, { marginTop: Spacing.lg }]} onPress={handleResetSettingsToDefaults}>
                        <Text style={styles.actionBtnText}>↺ {t('settings.resetDefaults')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('settings.scheduler')}</Text>
                    <Text style={styles.sectionDesc}>{t('settings.schedulerDescription')}</Text>
                    <View style={styles.algorithmCardActive}>
                        <Text style={styles.algName}>ANKI_V3</Text>
                        <Text style={styles.algDesc}>{t('settings.schedulerFlow')}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('settings.studyOptions')}</Text>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.dailyNewLimit')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.dailyReviewLimit')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.newPlacement')}</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'mix' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'mix')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'mix' && styles.optionTextActive]}>
                                    {t('settings.mix')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'before' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'before')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'before' && styles.optionTextActive]}>
                                    {t('settings.newFirst')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.queueOrder === 'after' && styles.optionBtnActive]}
                                onPress={() => updateSetting('queueOrder', 'after')}
                            >
                                <Text style={[styles.optionText, settings.queueOrder === 'after' && styles.optionTextActive]}>
                                    {t('settings.newLast')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.newOrder')}</Text>
                        <View style={styles.inputRow}>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'sequential' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'sequential')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'sequential' && styles.optionTextActive]}>
                                    {t('settings.sequential')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.optionBtn, settings.newCardOrder === 'random' && styles.optionBtnActive]}
                                onPress={() => updateSetting('newCardOrder', 'random')}
                            >
                                <Text style={[styles.optionText, settings.newCardOrder === 'random' && styles.optionTextActive]}>
                                    {t('settings.random')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>{t('settings.learningSteps')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.relearningSteps')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.graduatingInterval')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.easyInterval')}</Text>
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
                        <Text style={styles.settingLabel}>{t('settings.newIntervalAfterLapse')}</Text>
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
                    <Text style={styles.sectionTitle}>{t('settings.dataManagement')}</Text>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/backups')}>
                        <Text style={styles.actionBtnText}>🗄️ {t('root.backups')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleExport}>
                        <Text style={styles.actionBtnText}>{t('settings.exportData')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleImport}>
                        <Text style={styles.actionBtnText}>{t('settings.importData')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleCheckDatabase}>
                        <Text style={styles.actionBtnText}>{t('settings.checkDatabase')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleReset}>
                        <Text style={[styles.actionBtnText, styles.dangerText]}>{t('settings.resetProgress')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
                    <Text style={styles.sectionDesc}>{t('settings.aboutDescription', { version: Constants.expoConfig?.version ?? '1.0.0' })}</Text>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => Linking.openURL(PRIVACY_URL)}
                        accessibilityRole="link"
                        accessibilityLabel={t('settings.openPrivacy')}
                    >
                        <Text style={styles.linkText}>{t('settings.privacy')}</Text>
                        <Text style={styles.linkArrow}>↗</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.linkRow}
                        onPress={() => Linking.openURL(SUPPORT_URL)}
                        accessibilityRole="link"
                        accessibilityLabel={t('settings.openSupport')}
                    >
                        <Text style={styles.linkText}>{t('settings.support')}</Text>
                        <Text style={styles.linkArrow}>↗</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md, paddingBottom: 80 },
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
        systemLanguageHint: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing.sm },

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
            width: 44,
            height: 44,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepBtnText: { fontSize: FontSize.xl, fontWeight: '600', color: colors.textPrimary },
        inputValue: { fontSize: FontSize.xl, fontWeight: '700', color: colors.accent, minWidth: 44, textAlign: 'center', lineHeight: 44 },

        optionBtn: {
            minHeight: 44,
            justifyContent: 'center',
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
            minHeight: 48,
            justifyContent: 'center',
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
        linkRow: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        linkText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
        linkArrow: { fontSize: FontSize.lg, color: colors.textMuted },
    });
}
