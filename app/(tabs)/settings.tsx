import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AppState,
    Linking,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import {
    DEFAULT_KEY_BINDINGS,
    DEFAULT_SETTINGS,
    exportAllData,
    importAllData,
    loadSettings,
    resetAllData,
    resetSettingsToDefaults,
    saveSettings,
} from '../../lib/storage';
import { checkDatabase } from '../../lib/maintenance';
import { downloadTextFileWeb, getLegacyFileSystem, readUriText } from '../../lib/files';
import { alert, confirm } from '../../lib/confirm';
import { useApp } from './_layout';
import { useI18n } from '../../hooks/useI18n';
import type { AppLanguage, AppSettings, KeyBindings, ThemeMode } from '../../lib/types';
import { normalizeHardwareKey } from '../../lib/hardwareKeyboard';
import {
    disableStudyNotifications,
    getDueReviewCountAt,
    getStudyNotificationPermission,
    requestStudyNotificationPermission,
    type StudyNotificationPermission,
} from '../../lib/studyNotifications';

type SectionId =
    | 'general'
    | 'newStudy'
    | 'reviewing'
    | 'notifications'
    | 'appearance'
    | 'controls'
    | 'accessibility'
    | 'backups'
    | 'data'
    | 'about';

type Category = {
    id: SectionId;
    icon: string;
    title: string;
    summary: string;
};

const PRIVACY_URL = 'https://bugraguclu.github.io/tus-flashcard-app/privacy.html';
const SUPPORT_URL = 'https://bugraguclu.github.io/tus-flashcard-app/';

function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toUpperCase() : key;
}

const KEY_ROWS: Array<{ field: keyof KeyBindings; tr: string; en: string }> = [
    { field: 'showAnswer', tr: 'Cevabı göster', en: 'Show answer' },
    { field: 'again', tr: 'Tekrar', en: 'Answer again' },
    { field: 'hard', tr: 'Zor', en: 'Answer hard' },
    { field: 'good', tr: 'İyi', en: 'Answer good' },
    { field: 'easy', tr: 'Kolay', en: 'Answer easy' },
    { field: 'replayAudio', tr: 'Medyayı yeniden oynat', en: 'Replay media' },
    { field: 'buryCard', tr: 'Kartı göm', en: 'Bury card' },
    { field: 'suspendCard', tr: 'Kartı askıya al', en: 'Suspend card' },
    { field: 'markNote', tr: 'Notu işaretle', en: 'Mark note' },
];

function Group({ title, description, children, styles }: {
    title: string;
    description?: string;
    children: React.ReactNode;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.group}>
            <Text style={styles.groupTitle}>{title}</Text>
            {description ? <Text style={styles.groupDescription}>{description}</Text> : null}
            {children}
        </View>
    );
}

function ToggleRow({ label, summary, value, onChange, styles }: {
    label: string;
    summary?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <TouchableOpacity
            style={styles.preferenceRow}
            onPress={() => onChange(!value)}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: value }}
        >
            <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceLabel}>{label}</Text>
                {summary ? <Text style={styles.preferenceSummary}>{summary}</Text> : null}
            </View>
            <Switch value={value} onValueChange={onChange} trackColor={{ true: '#71c7a5' }} />
        </TouchableOpacity>
    );
}

function ChoiceRow<T extends string>({ label, summary, value, options, onChange, styles }: {
    label: string;
    summary?: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.preferenceBlock}>
            <Text style={styles.preferenceLabel}>{label}</Text>
            {summary ? <Text style={styles.preferenceSummary}>{summary}</Text> : null}
            <View style={styles.choiceRow}>
                {options.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        style={[styles.choiceButton, value === option.value && styles.choiceButtonActive]}
                        onPress={() => onChange(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: value === option.value }}
                    >
                        <Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

function StepperRow({ label, summary, value, display, step, min, max, onChange, styles }: {
    label: string;
    summary?: string;
    value: number;
    display?: string;
    step: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.preferenceBlock}>
            <Text style={styles.preferenceLabel}>{label}</Text>
            {summary ? <Text style={styles.preferenceSummary}>{summary}</Text> : null}
            <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepButton} onPress={() => onChange(Math.max(min, value - step))}>
                    <Text style={styles.stepButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepValue}>{display ?? value}</Text>
                <TouchableOpacity style={styles.stepButton} onPress={() => onChange(Math.min(max, value + step))}>
                    <Text style={styles.stepButtonText}>+</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktopWeb = Platform.OS === 'web' && width >= 600;
    const canRecordHardwareKeys = Platform.OS !== 'web' || isDesktopWeb;
    const { refreshData, bumpDataVersion, dataVersion } = useApp();
    const { l, deviceLanguage } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionId | null>(null);
    const [search, setSearch] = useState('');
    const [recordingField, setRecordingField] = useState<keyof KeyBindings | null>(null);
    const [notificationPermission, setNotificationPermission] = useState<StudyNotificationPermission>({
        state: Platform.OS === 'ios' ? 'undetermined' : 'unavailable',
        canAskAgain: Platform.OS === 'ios',
        allowsAlert: false,
        allowsBadge: false,
    });
    const [currentDueReviews, setCurrentDueReviews] = useState(0);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, []);

    const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
        const updated = { ...settings, ...patch };
        saveSettings(updated);
        const persisted = loadSettings();
        setSettings(persisted);
        refreshData();
        bumpDataVersion();
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 1400);
        return persisted;
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        updateSettings({ [key]: value } as Pick<AppSettings, K>);
    };

    useEffect(() => {
        if (activeSection !== 'notifications' || Platform.OS !== 'ios') return;
        let active = true;
        const refresh = () => {
            void getStudyNotificationPermission()
                .then((permission) => {
                    if (!active) return;
                    setNotificationPermission(permission);
                    setCurrentDueReviews(getDueReviewCountAt(Date.now(), loadSettings().dayRolloverHour));
                })
                .catch((error) => console.warn('[Settings] notification status failed:', error));
        };
        refresh();
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') refresh();
        });
        return () => {
            active = false;
            subscription.remove();
        };
    }, [activeSection, dataVersion]);

    const handleStudyNotificationsToggle = async (enabled: boolean) => {
        if (Platform.OS !== 'ios') {
            alert(l('Yalnızca iPhone ve iPad', 'iPhone and iPad only'), l('Bu ayar AnkiMobile uyumlu iOS bildirimleri içindir.', 'This setting controls AnkiMobile-compatible iOS notifications.'));
            return;
        }

        if (!enabled) {
            updateSetting('studyNotificationsEnabled', false);
            await disableStudyNotifications().catch((error) => console.warn('[Settings] notification disable failed:', error));
            setCurrentDueReviews(0);
            return;
        }

        try {
            const permission = await requestStudyNotificationPermission();
            setNotificationPermission(permission);
            if (permission.state !== 'granted' && permission.state !== 'limited') {
                updateSetting('studyNotificationsEnabled', false);
                alert(
                    l('Bildirim izni gerekli', 'Notification permission required'),
                    l('Günlük çalışma hatırlatmasını açmak için iOS Ayarları’nda bildirimlere izin verin.', 'Allow notifications in iOS Settings to enable the daily study reminder.'),
                );
                return;
            }
            updateSetting('studyNotificationsEnabled', true);
            setCurrentDueReviews(getDueReviewCountAt(Date.now(), settings.dayRolloverHour));
        } catch (error) {
            console.warn('[Settings] notification permission failed:', error);
            alert(l('Bildirim açılamadı', 'Could not enable notifications'), l('Bildirim izni alınamadı. Lütfen iOS Ayarları’nı kontrol edin.', 'Notification permission could not be obtained. Check iOS Settings.'));
        }
    };

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

    const recordNativeHardwareKey = (rawKey: string) => {
        if (!recordingField) return;
        const key = normalizeHardwareKey(rawKey);
        if (key === 'Escape') {
            setRecordingField(null);
            return;
        }
        updateSetting('keyBindings', { ...settings.keyBindings, [recordingField]: key });
        setRecordingField(null);
    };

    const categories = useMemo<Category[]>(() => [
        { id: 'general', icon: '⚙️', title: l('Genel', 'General'), summary: l('Dil • Düzenleme • Sistem geneli', 'Language • Editing • System-wide') },
        { id: 'newStudy', icon: '🃏', title: l('Yeni çalışma ekranı', 'New study screen'), summary: l('Ekran • Araç çubuğu • Yanıt düğmeleri', 'Screen • Toolbar • Answer buttons') },
        { id: 'reviewing', icon: '🧠', title: l('İnceleme', 'Reviewing'), summary: l('Zamanlama • Ekranı açık tut', 'Scheduling • Keep screen on') },
        {
            id: 'notifications',
            icon: '🔔',
            title: l('Bildirimler', 'Notifications'),
            summary: settings.studyNotificationsEnabled
                ? `${l('Açık', 'On')} · ${String(settings.studyNotificationHour ?? 9).padStart(2, '0')}:${String(settings.studyNotificationMinute ?? 0).padStart(2, '0')}`
                : l('Kapalı', 'Off'),
        },
        { id: 'appearance', icon: '🎨', title: l('Görünüm', 'Appearance'), summary: l('Temalar • Çalışma ekranı', 'Themes • Study screen') },
        { id: 'controls', icon: '☝️', title: l('Kontroller', 'Controls'), summary: l('Hareketler • Klavye', 'Gestures • Keyboard') },
        { id: 'accessibility', icon: '♿️', title: l('Erişilebilirlik', 'Accessibility'), summary: l('Kart yakınlaştırma • Yanıt düğmesi boyutu', 'Card zoom • Answer button size') },
        { id: 'backups', icon: '💾', title: l('Yedekler', 'Backups'), summary: l('Sıklık • Saklama süresi', 'Frequency • Lifetime') },
        { id: 'data', icon: '🗄️', title: l('Veri Yönetimi', 'Data management'), summary: l('İçe aktar • Dışa aktar • Veritabanı', 'Import • Export • Database') },
        { id: 'about', icon: 'ℹ️', title: l('Hakkında', 'About'), summary: `TusAnkiM ${Constants.expoConfig?.version ?? '1.0.0'}` },
    ], [l, settings.studyNotificationHour, settings.studyNotificationMinute, settings.studyNotificationsEnabled]);

    const activeCategory = categories.find((item) => item.id === activeSection) ?? null;
    const filteredCategories = categories.filter((item) => `${item.title} ${item.summary}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    const handleExport = async () => {
        try {
            const json = await exportAllData();
            const fileName = `tus-flashcard-export-${new Date().toISOString().split('T')[0]}.json`;
            if (Platform.OS === 'web') {
                downloadTextFileWeb(fileName, json);
                return;
            }
            const fs = getLegacyFileSystem();
            const target = `${fs.cacheDirectory ?? ''}${fileName}`;
            await fs.writeAsStringAsync(target, json);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(target, { mimeType: 'application/json', dialogTitle: fileName });
            }
        } catch (error) {
            console.warn('[Settings] export failed:', error);
            alert(l('Hata', 'Error'), l('Veriler dışa aktarılamadı.', 'Data could not be exported.'));
        }
    };

    const handleImport = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const json = await readUriText(picked.assets[0].uri);
            confirm(
                l('Verileri İçe Aktar', 'Import Data'),
                l('Mevcut koleksiyon içe aktarılan verilerle değiştirilecek.', 'The current collection will be replaced with the imported data.'),
                async () => {
                    const ok = await importAllData(json);
                    if (!ok) {
                        alert(l('Hata', 'Error'), l('Geçersiz yedek dosyası.', 'Invalid backup file.'));
                        return;
                    }
                    setSettings(loadSettings());
                    refreshData();
                    bumpDataVersion();
                    alert(l('Tamamlandı', 'Completed'), l('Veriler içe aktarıldı.', 'Data imported.'));
                },
                { destructive: true },
            );
        } catch (error) {
            console.warn('[Settings] import failed:', error);
            alert(l('Hata', 'Error'), l('Dosya okunamadı.', 'The file could not be read.'));
        }
    };

    const handleCheckDatabase = () => {
        try {
            const result = checkDatabase();
            alert(
                l('Veritabanını Kontrol Et', 'Check Database'),
                [
                    result.integrity === 'ok' ? l('Bütünlük: tamam', 'Integrity: OK') : `${l('Bütünlük', 'Integrity')}: ${result.integrity}`,
                    `${l('Sahipsiz kartlar', 'Orphan cards')}: ${result.orphanCards}`,
                    `${l('Sahipsiz notlar', 'Orphan notes')}: ${result.orphanNotes}`,
                    result.ftsReindexed > 0 ? `${l('Arama dizini yenilendi', 'Search index rebuilt')}: ${result.ftsReindexed}` : '',
                ].filter(Boolean).join('\n'),
            );
        } catch (error) {
            console.warn('[Settings] database check failed:', error);
            alert(l('Hata', 'Error'), l('Veritabanı kontrol edilemedi.', 'Database check failed.'));
        }
    };

    const handleResetSettings = () => {
        confirm(l('Varsayılan Ayarlar', 'Default Settings'), l('Tüm uygulama ayarları varsayılana döndürülsün mü?', 'Restore all app settings to defaults?'), () => {
            resetSettingsToDefaults();
            setSettings(loadSettings());
            refreshData();
            bumpDataVersion();
        });
    };

    const handleResetProgress = () => {
        confirm(l('İlerlemeyi Sıfırla', 'Reset Progress'), l('Kartlar, çalışma geçmişi ve ilerleme silinecek.', 'Cards, review history, and progress will be deleted.'), async () => {
            await resetAllData();
            saveSettings(DEFAULT_SETTINGS);
            setSettings(loadSettings());
            refreshData();
            bumpDataVersion();
        }, { destructive: true });
    };

    const handleSelectStudyBackground = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];
            const fs = getLegacyFileSystem();
            if (!fs.documentDirectory) throw new Error('Document directory unavailable');
            const extension = asset.name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const target = `${fs.documentDirectory}tus-study-background.${extension}`;
            await fs.deleteAsync(target, { idempotent: true });
            await fs.copyAsync({ from: asset.uri, to: target });
            updateSetting('studyBackgroundImageUri', target);
        } catch (error) {
            console.warn('[Settings] study background failed:', error);
            alert(l('Hata', 'Error'), l('Arka plan görseli kaydedilemedi.', 'The background image could not be saved.'));
        }
    };

    const renderGeneral = () => (
        <>
            <Group title={l('Dil', 'Language')} styles={styles}>
                <ChoiceRow
                    label={l('Uygulama dili', 'App language')}
                    summary={settings.language === 'system'
                        ? l(`Cihaz dili: ${deviceLanguage === 'tr' ? 'Türkçe' : 'English'}`, `Device language: ${deviceLanguage === 'tr' ? 'Türkçe' : 'English'}`)
                        : l('Uygulamanın arayüz dilini seçin.', 'Choose the app interface language.')}
                    value={settings.language}
                    options={[
                        { value: 'system' as AppLanguage, label: l('Sistem', 'System') },
                        { value: 'tr' as AppLanguage, label: 'Türkçe' },
                        { value: 'en' as AppLanguage, label: 'English' },
                    ]}
                    onChange={(value) => updateSetting('language', value)}
                    styles={styles}
                />
            </Group>
            <Group title={l('Düzenleme', 'Editing')} styles={styles}>
                <ChoiceRow
                    label={l('Yeni kartların destesi', 'Deck for new cards')}
                    summary={l('Kart ekleme ekranının başlangıç destesini belirler.', 'Sets the initial deck in the add-card screen.')}
                    value={settings.newCardDeckMode ?? 'current'}
                    options={[
                        { value: 'current', label: l('Geçerli deste', 'Current deck') },
                        { value: 'default', label: l('Varsayılan', 'Default') },
                    ]}
                    onChange={(value) => updateSetting('newCardDeckMode', value)}
                    styles={styles}
                />
            </Group>
            <TouchableOpacity style={styles.outlineButton} onPress={handleResetSettings}>
                <Text style={styles.outlineButtonText}>↺ {l('Varsayılan ayarlara dön', 'Restore default settings')}</Text>
            </TouchableOpacity>
        </>
    );

    const renderNewStudy = () => (
        <>
            <Group title={l('Ekran', 'Screen')} styles={styles}>
                <ChoiceRow
                    label={l('Çerçeve stili', 'Frame style')}
                    value={settings.studyFrameStyle ?? 'card'}
                    options={[{ value: 'card', label: l('Kart', 'Card') }, { value: 'plain', label: l('Yok', 'None') }]}
                    onChange={(value) => updateSetting('studyFrameStyle', value)}
                    styles={styles}
                />
                <ToggleRow label={l('Kalan kart sayısını göster', 'Show remaining card count')} value={settings.showRemainingCount} onChange={(value) => updateSetting('showRemainingCount', value)} styles={styles} />
                <ToggleRow label={l('Sesli kartlarda oynatma düğmelerini göster', 'Show play buttons on cards with audio')} value={settings.showAudioPlayButtons !== false} onChange={(value) => updateSetting('showAudioPlayButtons', value)} styles={styles} />
                <ToggleRow label={l('Yanıt geri bildirimini göster', 'Show answer feedback')} summary={l('Yanıt verildiğinde dokunsal geri bildirim sağlar.', 'Provides haptic feedback when an answer is submitted.')} value={settings.showAnswerFeedback !== false} onChange={(value) => updateSetting('showAnswerFeedback', value)} styles={styles} />
            </Group>
            <Group title={l('Araç çubuğu', 'Toolbar')} styles={styles}>
                <ToggleRow label={l('Üst araç çubuğunu göster', 'Show top toolbar')} summary={l('Geri, deste, beyaz tahta, bayrak ve diğer işlemleri gösterir.', 'Shows back, deck, whiteboard, flag and more actions.')} value={settings.showStudyTopBar !== false} onChange={(value) => updateSetting('showStudyTopBar', value)} styles={styles} />
            </Group>
            <Group title={l('Yanıt düğmeleri', 'Answer buttons')} styles={styles}>
                <ToggleRow
                    label={l('Yanıt düğmelerini göster', 'Show answer buttons')}
                    summary={l('Kapalıyken kartlar kaydırma hareketleriyle yanıtlanır.', 'When hidden, cards are answered with swipe gestures.')}
                    value={settings.showAnswerButtons !== false}
                    onChange={(value) => {
                        if (!value && !settings.gesturesEnabled) {
                            alert(l('Hareketleri etkinleştirin', 'Enable gestures'), l('Yanıt düğmelerini gizlemeden önce Kontroller bölümünde kaydırma hareketlerini etkinleştirin.', 'Enable swipe gestures in Controls before hiding answer buttons.'));
                            return;
                        }
                        updateSetting('showAnswerButtons', value);
                    }}
                    styles={styles}
                />
                <ToggleRow label={l('Sonraki inceleme süresini göster', 'Show next review time above answer buttons')} value={settings.showNextReviewTimes} onChange={(value) => updateSetting('showNextReviewTimes', value)} styles={styles} />
                <ToggleRow label={l('Zor ve Kolay düğmelerini gizle', 'Hide Hard and Easy buttons')} summary={l('Yalnızca Tekrar ve İyi gösterilir.', 'Only Again and Good are shown.')} value={Boolean(settings.hideHardAndEasy)} onChange={(value) => updateSetting('hideHardAndEasy', value)} styles={styles} />
                <ChoiceRow label={l('Yanıt düğmelerinin konumu', 'Answer buttons position')} value={settings.answerButtonsPosition ?? 'bottom'} options={[{ value: 'bottom', label: l('Alt', 'Bottom') }, { value: 'top', label: l('Üst', 'Top') }]} onChange={(value) => updateSetting('answerButtonsPosition', value)} styles={styles} />
                <ToggleRow label={l('Otomatik ilerleme', 'Auto advance')} summary={l('Kart açıldıktan sekiz saniye sonra cevabı gösterir.', 'Reveals the answer eight seconds after a card opens.')} value={settings.autoAdvance} onChange={(value) => updateSetting('autoAdvance', value)} styles={styles} />
            </Group>
        </>
    );

    const renderReviewing = () => (
        <>
            <Group title={l('Zamanlama', 'Scheduling')} styles={styles}>
                <StepperRow label={l('Sonraki günün başlangıcı', 'Start of next day')} summary={l('Günlük istatistikler ve limitler bu saatte yenilenir.', 'Daily statistics and limits reset at this hour.')} value={settings.dayRolloverHour} display={`${String(settings.dayRolloverHour).padStart(2, '0')}:00`} step={1} min={0} max={23} onChange={(value) => updateSetting('dayRolloverHour', value)} styles={styles} />
                <StepperRow label={l('Önceden öğrenme sınırı', 'Learn ahead limit')} summary={l('Sırada başka kart kalmadığında öğrenme kartlarını erken gösterir.', 'Shows learning cards early when nothing else is queued.')} value={settings.learnAheadMinutes} display={`${settings.learnAheadMinutes} ${l('dk.', 'mins')}`} step={5} min={0} max={120} onChange={(value) => updateSetting('learnAheadMinutes', value)} styles={styles} />
                <StepperRow label={l('Zaman kutusu sınırı', 'Timebox time limit')} summary={l('Bu süre dolunca çalışma özeti gösterilir; 0 kapalıdır.', 'Shows a study summary after this time; 0 disables it.')} value={settings.timeboxMinutes ?? 0} display={`${settings.timeboxMinutes ?? 0} ${l('dk.', 'mins')}`} step={5} min={0} max={180} onChange={(value) => updateSetting('timeboxMinutes', value)} styles={styles} />
            </Group>
            <Group title={l('Gelişmiş', 'Advanced')} styles={styles}>
                <ToggleRow label={l('Ekranı açık tut', 'Keep screen on')} summary={l('Çalışma sırasında ekran zaman aşımını devre dışı bırakır.', 'Disables screen timeout while reviewing.')} value={Boolean(settings.keepScreenOn)} onChange={(value) => updateSetting('keepScreenOn', value)} styles={styles} />
                <ToggleRow label={l('Sesi otomatik oynat', 'Automatically play audio')} value={settings.autoPlayAudio} onChange={(value) => updateSetting('autoPlayAudio', value)} styles={styles} />
                <ToggleRow label={l('Yanıtlarken sesi kes', 'Interrupt audio when answering')} value={settings.interruptAudioOnAnswer} onChange={(value) => updateSetting('interruptAudioOnAnswer', value)} styles={styles} />
            </Group>
        </>
    );

    const renderNotifications = () => {
        const time = new Date();
        time.setHours(settings.studyNotificationHour ?? 9, settings.studyNotificationMinute ?? 0, 0, 0);
        const permissionLabel = notificationPermission.state === 'granted'
            ? l('İzin verildi', 'Allowed')
            : notificationPermission.state === 'limited'
                ? l('iOS’ta kısmen izin verildi', 'Partially allowed in iOS')
                : notificationPermission.state === 'denied'
                    ? l('iOS tarafından engellendi', 'Blocked by iOS')
                    : notificationPermission.state === 'undetermined'
                        ? l('Henüz izin istenmedi', 'Not requested yet')
                        : l('Bu platformda kullanılamıyor', 'Unavailable on this platform');

        return (
            <>
                <Group
                    title={l('Çalışma hatırlatması', 'Study reminder')}
                    description={l('AnkiMobile gibi, seçtiğiniz saatte yalnızca bekleyen tekrar kartınız varsa tek bir günlük bildirim gösterir. Öğrenme adımı dolan her kart için ayrı bildirim gönderilmez.', 'Like AnkiMobile, one daily alert appears at your selected time only when reviews are waiting. It does not alert separately for each learning step that becomes due.')}
                    styles={styles}
                >
                    <ToggleRow
                        label={l('Zamanı gelen kartlar için uyar', 'Alert when reviews are due')}
                        summary={l('Bildirim, o gün bekleyen tekrar kartlarının sayısını içerir.', 'The alert includes the number of reviews waiting that day.')}
                        value={Boolean(settings.studyNotificationsEnabled)}
                        onChange={(value) => { void handleStudyNotificationsToggle(value); }}
                        styles={styles}
                    />
                    {settings.studyNotificationsEnabled && Platform.OS === 'ios' ? (
                        <View style={styles.preferenceBlock}>
                            <Text style={styles.preferenceLabel}>{l('Hatırlatma saati', 'Reminder time')}</Text>
                            <Text style={styles.preferenceSummary}>{l('Her gün bu yerel saatte kontrol edilir.', 'Reviews are checked at this local time each day.')}</Text>
                            <View style={styles.notificationTimeRow}>
                                <DateTimePicker
                                    value={time}
                                    mode="time"
                                    display="compact"
                                    locale={deviceLanguage === 'tr' ? 'tr-TR' : 'en-US'}
                                    onChange={(_event, selectedTime) => {
                                        if (!selectedTime) return;
                                        updateSettings({
                                            studyNotificationHour: selectedTime.getHours(),
                                            studyNotificationMinute: selectedTime.getMinutes(),
                                        });
                                    }}
                                />
                            </View>
                        </View>
                    ) : null}
                    <View style={styles.notificationStatusRow}>
                        <View style={[styles.notificationStatusDot, (notificationPermission.state === 'granted' || notificationPermission.state === 'limited') && styles.notificationStatusDotActive]} />
                        <View style={styles.preferenceCopy}>
                            <Text style={styles.preferenceLabel}>{l('iOS bildirim izni', 'iOS notification permission')}</Text>
                            <Text style={styles.preferenceSummary}>{permissionLabel}</Text>
                        </View>
                    </View>
                    {(notificationPermission.state === 'denied' || notificationPermission.state === 'limited' || notificationPermission.state === 'granted') ? (
                        <TouchableOpacity style={styles.actionButton} onPress={() => Linking.openSettings().catch(() => undefined)}>
                            <Text style={styles.actionButtonText}>{l('iOS bildirim ayarlarını aç', 'Open iOS notification settings')} ↗</Text>
                        </TouchableOpacity>
                    ) : null}
                </Group>

                <Group
                    title={l('Uygulama simgesi rozeti', 'App icon badge')}
                    description={l('Bildirimler açıkken rozet, şu anda bekleyen tekrar kartı sayısıyla otomatik güncellenir. Bildirimleri kapatmak rozeti temizler.', 'When notifications are enabled, the badge automatically shows the current number of waiting reviews. Turning notifications off clears it.')}
                    styles={styles}
                >
                    <View style={styles.badgePreviewRow}>
                        <View style={styles.badgePreviewIcon}>
                            <Text style={styles.badgePreviewMark}>🧠</Text>
                            {settings.studyNotificationsEnabled && notificationPermission.allowsBadge && currentDueReviews > 0 ? (
                                <View style={styles.badgePreviewCount}>
                                    <Text style={styles.badgePreviewCountText}>{currentDueReviews > 99 ? '99+' : currentDueReviews}</Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={styles.preferenceCopy}>
                            <Text style={styles.preferenceLabel}>{l('Bekleyen tekrarlar', 'Reviews waiting')}</Text>
                            <Text style={styles.preferenceSummary}>
                                {l(`${currentDueReviews} tekrar kartı`, `${currentDueReviews} review cards`)}
                            </Text>
                        </View>
                    </View>
                </Group>
            </>
        );
    };

    const renderAppearance = () => (
        <>
            <Group title={l('Temalar', 'Themes')} styles={styles}>
                <ChoiceRow label={l('Tema', 'Theme')} value={settings.themeMode} options={[{ value: 'system' as ThemeMode, label: l('Sistemi izle', 'Follow system') }, { value: 'light' as ThemeMode, label: l('Açık', 'Light') }, { value: 'dark' as ThemeMode, label: l('Koyu', 'Dark') }]} onChange={(value) => updateSetting('themeMode', value)} styles={styles} />
            </Group>
            <Group title={l('Arka plan', 'Background')} styles={styles}>
                <TouchableOpacity style={styles.actionButton} onPress={handleSelectStudyBackground}>
                    <Text style={styles.actionButtonText}>{settings.studyBackgroundImageUri ? l('Arka plan görselini değiştir', 'Change background image') : l('Görsel seç', 'Select image')}</Text>
                </TouchableOpacity>
                {settings.studyBackgroundImageUri ? (
                    <TouchableOpacity style={styles.actionButton} onPress={() => updateSetting('studyBackgroundImageUri', null)}>
                        <Text style={styles.actionButtonText}>{l('Arka plan görselini kaldır', 'Remove background image')}</Text>
                    </TouchableOpacity>
                ) : null}
            </Group>
            <Group title={l('Çalışma ekranı', 'Study screen')} styles={styles}>
                <ToggleRow label={l('Ortaya hizala', 'Center align')} summary={l('Kart içeriğini dikey olarak ortalar.', 'Centers card content vertically.')} value={Boolean(settings.centerCardContent)} onChange={(value) => updateSetting('centerCardContent', value)} styles={styles} />
                <ToggleRow label={l('Deste başlığını göster', 'Show deck title')} value={settings.showDeckTitle !== false} onChange={(value) => updateSetting('showDeckTitle', value)} styles={styles} />
                <ToggleRow label={l('Kalan süreyi göster', 'Show remaining time')} summary={l('Mevcut hızla tahmini bitiş süresini gösterir.', 'Shows an estimated time remaining at the current pace.')} value={Boolean(settings.showRemainingTime)} onChange={(value) => updateSetting('showRemainingTime', value)} styles={styles} />
            </Group>
        </>
    );

    const renderControls = () => (
        <>
            <Group title={l('Hareketler', 'Gestures')} styles={styles}>
                <ToggleRow
                    label={l('Kaydırma hareketlerini etkinleştir', 'Enable swipe gestures')}
                    summary={l('Sağa: cevabı göster/İyi, sola: cevabı göster/Tekrar. Hareketler kapatılırsa gizli cevap düğmeleri yeniden açılır.', 'Right: show answer/Good, left: show answer/Again. Hidden answer buttons are restored if gestures are disabled.')}
                    value={Boolean(settings.gesturesEnabled)}
                    onChange={(value) => updateSettings({
                        gesturesEnabled: value,
                        ...(value || settings.showAnswerButtons !== false ? {} : { showAnswerButtons: true }),
                    })}
                    styles={styles}
                />
                <StepperRow label={l('Kaydırma hassasiyeti', 'Swipe sensitivity')} value={settings.swipeSensitivity ?? 100} display={`${settings.swipeSensitivity ?? 100}%`} step={25} min={25} max={200} onChange={(value) => updateSetting('swipeSensitivity', value)} styles={styles} />
            </Group>
            <Group title={l('Klavye', 'Keyboard')} description={l('Bir satırda Değiştir’e basın, ardından fiziksel klavyedeki yeni tuşa basın.', 'Choose Change on a row, then press the new key on the physical keyboard.')} styles={styles}>
                {Platform.OS !== 'web' && recordingField ? (
                    <TextInput
                        autoFocus
                        value=""
                        onChangeText={() => undefined}
                        onKeyPress={(event) => recordNativeHardwareKey(event.nativeEvent.key)}
                        showSoftInputOnFocus={false}
                        caretHidden
                        autoCapitalize="none"
                        autoCorrect={false}
                        contextMenuHidden
                        accessible={false}
                        importantForAccessibility="no-hide-descendants"
                        style={styles.hardwareKeyboardCapture}
                    />
                ) : null}
                {KEY_ROWS.map((row) => (
                    <View key={row.field} style={styles.keyRow}>
                        <Text style={styles.keyLabel}>{l(row.tr, row.en)}</Text>
                        <View style={styles.keyActions}>
                            <View style={styles.keyChip}><Text style={styles.keyChipText}>{recordingField === row.field ? l('Bir tuşa basın', 'Press a key') : formatKeyLabel(settings.keyBindings[row.field])}</Text></View>
                            {canRecordHardwareKeys ? (
                                <TouchableOpacity style={styles.smallButton} onPress={() => setRecordingField(recordingField === row.field ? null : row.field)}>
                                    <Text style={styles.smallButtonText}>{recordingField === row.field ? l('İptal', 'Cancel') : l('Değiştir', 'Change')}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                ))}
                {JSON.stringify(settings.keyBindings) !== JSON.stringify(DEFAULT_KEY_BINDINGS) ? (
                    <TouchableOpacity style={styles.actionButton} onPress={() => updateSetting('keyBindings', DEFAULT_KEY_BINDINGS)}>
                        <Text style={styles.actionButtonText}>{l('Kısayolları sıfırla', 'Reset shortcuts')}</Text>
                    </TouchableOpacity>
                ) : null}
            </Group>
        </>
    );

    const renderAccessibility = () => (
        <>
            <Group title={l('Kart', 'Card')} styles={styles}>
                <StepperRow label={l('Kart yakınlaştırma', 'Card zoom')} value={settings.cardZoomPercent ?? 100} display={`${settings.cardZoomPercent ?? 100}%`} step={10} min={50} max={200} onChange={(value) => updateSetting('cardZoomPercent', value)} styles={styles} />
                <StepperRow label={l('Görsel yakınlaştırma', 'Image zoom')} value={settings.imageZoomPercent ?? 100} display={`${settings.imageZoomPercent ?? 100}%`} step={10} min={50} max={200} onChange={(value) => updateSetting('imageZoomPercent', value)} styles={styles} />
            </Group>
            <Group title={l('Yanıt düğmeleri', 'Answer buttons')} styles={styles}>
                <StepperRow label={l('Yanıt düğmesi boyutu', 'Answer button size')} value={settings.answerButtonScalePercent ?? 100} display={`${settings.answerButtonScalePercent ?? 100}%`} step={10} min={75} max={175} onChange={(value) => updateSetting('answerButtonScalePercent', value)} styles={styles} />
                <ToggleRow label={l('Büyük yanıt düğmelerini iki satırda göster', 'Show large answer buttons in two rows')} value={Boolean(settings.twoRowAnswerButtons)} onChange={(value) => updateSetting('twoRowAnswerButtons', value)} styles={styles} />
                <StepperRow label={l('Cevabı göster basılı tutma süresi', 'Show answer long-press time')} summary={l('0 ms normal dokunmadır.', '0 ms uses a normal tap.')} value={settings.showAnswerLongPressMs ?? 0} display={`${settings.showAnswerLongPressMs ?? 0} ms`} step={100} min={0} max={2000} onChange={(value) => updateSetting('showAnswerLongPressMs', value)} styles={styles} />
                <StepperRow label={l('Çift dokunma aralığı', 'Double tap time interval')} summary={l('Yanlışlıkla iki kez yanıtlamayı önler.', 'Prevents accidental double answers.')} value={settings.answerDoubleTapMs ?? 200} display={`${settings.answerDoubleTapMs ?? 200} ms`} step={50} min={0} max={1000} onChange={(value) => updateSetting('answerDoubleTapMs', value)} styles={styles} />
            </Group>
            <Group title={l('Kart tarayıcısı', 'Card browser')} styles={styles}>
                <StepperRow label={l('Yazı ölçeği', 'Font scaling')} value={settings.browserFontScalePercent ?? 100} display={`${settings.browserFontScalePercent ?? 100}%`} step={10} min={75} max={175} onChange={(value) => updateSetting('browserFontScalePercent', value)} styles={styles} />
            </Group>
        </>
    );

    const renderBackups = () => (
        <>
            <Group title={l('Otomatik yedekleme', 'Automatic backups')} description={l('Koleksiyon uygulama açıkken seçilen aralıkta yedeklenir. Geri yüklemeden önce ayrıca geri alınabilir bir kopya oluşturulur.', 'The collection is backed up at the selected interval while the app is active. A recoverable copy is also made before every restore.')} styles={styles}>
                <ToggleRow label={l('Otomatik yedeklemeyi etkinleştir', 'Enable automatic backups')} value={settings.autoBackupEnabled !== false} onChange={(value) => updateSetting('autoBackupEnabled', value)} styles={styles} />
                <ChoiceRow label={l('Otomatik yedekler arasındaki süre', 'Minutes between automatic backups')} value={String(settings.backupIntervalMinutes ?? 30)} options={[5, 15, 30, 60, 360, 1440].map((value) => ({ value: String(value), label: value < 60 ? `${value} ${l('dk.', 'min')}` : value === 1440 ? l('1 gün', '1 day') : `${value / 60} ${l('sa.', 'hr')}` }))} onChange={(value) => updateSetting('backupIntervalMinutes', Number(value))} styles={styles} />
            </Group>
            <Group title={l('Saklama süresi', 'Lifetime')} styles={styles}>
                <StepperRow label={l('Saklanacak günlük yedekler', 'Daily backups to keep')} value={settings.backupDailyCopies ?? 12} step={1} min={0} max={99} onChange={(value) => updateSetting('backupDailyCopies', value)} styles={styles} />
                <StepperRow label={l('Saklanacak haftalık yedekler', 'Weekly backups to keep')} value={settings.backupWeeklyCopies ?? 10} step={1} min={0} max={99} onChange={(value) => updateSetting('backupWeeklyCopies', value)} styles={styles} />
                <StepperRow label={l('Saklanacak aylık yedekler', 'Monthly backups to keep')} value={settings.backupMonthlyCopies ?? 9} step={1} min={0} max={99} onChange={(value) => updateSetting('backupMonthlyCopies', value)} styles={styles} />
                <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/backups')}>
                    <Text style={styles.actionButtonText}>{l('Yedekleri görüntüle ve geri yükle', 'View and restore backups')} ›</Text>
                </TouchableOpacity>
            </Group>
        </>
    );

    const renderData = () => (
        <Group title={l('Koleksiyon', 'Collection')} styles={styles}>
            <TouchableOpacity style={styles.actionButton} onPress={handleExport}><Text style={styles.actionButtonText}>{l('Verileri dışa aktar', 'Export data')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleImport}><Text style={styles.actionButtonText}>{l('Verileri içe aktar', 'Import data')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleCheckDatabase}><Text style={styles.actionButtonText}>{l('Veritabanını kontrol et', 'Check database')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleResetProgress}><Text style={[styles.actionButtonText, styles.dangerText]}>{l('İlerlemeyi sıfırla', 'Reset progress')}</Text></TouchableOpacity>
        </Group>
    );

    const renderAbout = () => (
        <Group title="TusAnkiM" description={l(`Sürüm ${Constants.expoConfig?.version ?? '1.0.0'} • Anki uyumlu yerel çalışma uygulaması`, `Version ${Constants.expoConfig?.version ?? '1.0.0'} • Anki-compatible local study app`)} styles={styles}>
            <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={styles.linkText}>{l('Gizlilik Politikası', 'Privacy Policy')}</Text><Text style={styles.linkArrow}>↗</Text></TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(SUPPORT_URL)}><Text style={styles.linkText}>{l('Destek', 'Support')}</Text><Text style={styles.linkArrow}>↗</Text></TouchableOpacity>
        </Group>
    );

    const renderActiveSection = () => {
        switch (activeSection) {
            case 'general': return renderGeneral();
            case 'newStudy': return renderNewStudy();
            case 'reviewing': return renderReviewing();
            case 'notifications': return renderNotifications();
            case 'appearance': return renderAppearance();
            case 'controls': return renderControls();
            case 'accessibility': return renderAccessibility();
            case 'backups': return renderBackups();
            case 'data': return renderData();
            case 'about': return renderAbout();
            default: return null;
        }
    };

    if (loading) {
        return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingIcon}>⚙️</Text></View></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} automaticallyAdjustContentInsets>
                {activeSection && activeCategory ? (
                    <>
                        <View style={styles.detailHeader}>
                            <TouchableOpacity style={styles.backButton} onPress={() => setActiveSection(null)} accessibilityLabel={l('Ayarlara dön', 'Back to settings')}>
                                <Text style={styles.backButtonText}>‹</Text>
                            </TouchableOpacity>
                            <View style={styles.detailTitleWrap}>
                                <Text style={styles.detailIcon}>{activeCategory.icon}</Text>
                                <Text style={styles.detailTitle}>{activeCategory.title}</Text>
                            </View>
                            {saved ? <Text style={styles.savedText}>✓ {l('Kaydedildi', 'Saved')}</Text> : <View style={styles.headerSpacer} />}
                        </View>
                        {renderActiveSection()}
                    </>
                ) : (
                    <>
                        <View style={styles.titleRow}>
                            <Text style={styles.title}>⚙️ {l('Ayarlar', 'Settings')}</Text>
                            {saved ? <Text style={styles.savedText}>✓ {l('Kaydedildi', 'Saved')}</Text> : null}
                        </View>
                        <View style={styles.searchBox}>
                            <Text style={styles.searchIcon}>⌕</Text>
                            <TextInput value={search} onChangeText={setSearch} placeholder={l('Ara…', 'Search…')} placeholderTextColor={colors.textMuted} style={styles.searchInput} />
                        </View>
                        <View style={styles.categoryList}>
                            {filteredCategories.map((category, index) => (
                                <TouchableOpacity
                                    key={category.id}
                                    style={[styles.categoryRow, index > 0 && styles.categoryDivider]}
                                    onPress={() => setActiveSection(category.id)}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.categoryIcon}>{category.icon}</Text>
                                    <View style={styles.categoryCopy}>
                                        <Text style={styles.categoryTitle}>{category.title}</Text>
                                        <Text style={styles.categorySummary}>{category.summary}</Text>
                                    </View>
                                    <Text style={styles.categoryArrow}>›</Text>
                                </TouchableOpacity>
                            ))}
                            {filteredCategories.length === 0 ? <Text style={styles.emptySearch}>{l('Eşleşen ayar bulunamadı.', 'No matching settings found.')}</Text> : null}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        hardwareKeyboardCapture: { position: 'absolute', width: 1, height: 1, left: -10, bottom: 0, opacity: 0 },
        loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        loadingIcon: { fontSize: 48 },
        scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },
        titleRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        title: { fontSize: FontSize.xxxl, fontWeight: '800', color: colors.textPrimary },
        savedText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.btnGood },
        searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, paddingHorizontal: Spacing.lg, ...Shadows.sm },
        searchIcon: { fontSize: 25, color: colors.textSecondary, marginRight: Spacing.sm, transform: [{ rotate: '-20deg' }] },
        searchInput: { flex: 1, fontSize: FontSize.lg, color: colors.textPrimary, paddingVertical: 0 },
        categoryList: { backgroundColor: colors.bgCard, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...Shadows.sm },
        categoryRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
        categoryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        categoryIcon: { width: 42, fontSize: 24, color: colors.textSecondary },
        categoryCopy: { flex: 1, gap: 2 },
        categoryTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        categorySummary: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 18 },
        categoryArrow: { fontSize: 28, color: colors.textMuted, paddingLeft: Spacing.sm },
        emptySearch: { padding: Spacing.xxl, textAlign: 'center', color: colors.textMuted },
        detailHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
        backButtonText: { fontSize: 40, lineHeight: 42, color: colors.accent, fontWeight: '300' },
        detailTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        detailIcon: { fontSize: 23 },
        detailTitle: { flexShrink: 1, fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },
        headerSpacer: { width: 58 },
        group: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, ...Shadows.sm },
        groupTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
        groupDescription: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 19, marginBottom: Spacing.sm },
        preferenceRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.sm },
        preferenceCopy: { flex: 1, paddingRight: Spacing.md },
        preferenceBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.md },
        preferenceLabel: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
        preferenceSummary: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 18, marginTop: 3 },
        choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
        choiceButton: { minHeight: 42, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
        choiceButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        choiceText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        choiceTextActive: { color: colors.accent, fontWeight: '800' },
        stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
        stepButton: { width: 48, height: 44, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },
        stepButtonText: { fontSize: FontSize.xl, color: colors.textPrimary, fontWeight: '700' },
        stepValue: { minWidth: 82, textAlign: 'center', fontSize: FontSize.xl, fontWeight: '800', color: colors.accent },
        notificationTimeRow: { minHeight: 48, alignItems: 'flex-start', justifyContent: 'center', marginTop: Spacing.sm },
        notificationStatusRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.sm },
        notificationStatusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textMuted },
        notificationStatusDotActive: { backgroundColor: colors.btnGood },
        badgePreviewRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.md },
        badgePreviewIcon: { width: 58, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.border, position: 'relative' },
        badgePreviewMark: { fontSize: 28 },
        badgePreviewCount: { position: 'absolute', top: -7, right: -9, minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.btnAgain, borderWidth: 2, borderColor: colors.bgCard },
        badgePreviewCountText: { color: colors.white, fontSize: 10, fontWeight: '900' },
        outlineButton: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },
        outlineButtonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        actionButton: { minHeight: 48, marginTop: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
        actionButtonText: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },
        dangerButton: { borderColor: '#e8c4c0' },
        dangerText: { color: colors.btnAgain },
        keyRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, gap: Spacing.sm },
        keyLabel: { flex: 1, fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
        keyActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        keyChip: { minWidth: 54, minHeight: 32, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, backgroundColor: colors.accentLight },
        keyChipText: { fontSize: FontSize.sm, color: colors.accent, fontWeight: '800' },
        smallButton: { minHeight: 36, paddingHorizontal: Spacing.sm, justifyContent: 'center', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border },
        smallButtonText: { fontSize: FontSize.xs, color: colors.textSecondary, fontWeight: '700' },
        linkRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        linkText: { fontSize: FontSize.md, color: colors.accent, fontWeight: '700' },
        linkArrow: { fontSize: FontSize.lg, color: colors.textMuted },
    });
}
