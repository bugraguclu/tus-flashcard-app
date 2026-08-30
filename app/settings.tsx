import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
    BorderRadius,
    FontSize,
    Shadows,
    Spacing,
    useThemeColors,
    type ColorScheme,
} from '../constants/theme';
import {
    DEFAULT_KEY_BINDINGS,
    DEFAULT_SETTINGS,
    loadSettings,
    resetSettingsToDefaults,
    saveSettings,
} from '../lib/storage';
import { checkDatabase, optimizeDatabase } from '../lib/maintenance';
import { alert, confirm } from '../lib/confirm';
import { useAppSettings, useCatalogStatus, useCollectionInvalidation } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import type {
    AppLanguage,
    AppSettings,
    KeyBindings,
    ReviewGestureAction,
    ReviewTapZone,
    StudyNotificationThreshold,
} from '../lib/types';
import { checkMedia } from '../lib/mediaMaintenance';
import BoundedIntegerInput, { type BoundedIntegerInputHandle } from '../components/BoundedIntegerInput';
import {
    disableStudyNotifications,
    requestStudyNotificationPermission,
} from '../lib/studyNotifications';
import {
    normalizeStudyNotificationThreshold,
    STUDY_NOTIFICATION_THRESHOLDS,
} from '../lib/studyNotificationPolicy';
import { DATA_EXPORT_ROUTE, DATA_IMPORT_ROUTE } from '../lib/dataManagementRoutes';
import { createBackupNow } from '../lib/backup';
import { resetAllDataWithBackup, ResetWorkflowError } from '../lib/resetWorkflow';
import {
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    normalizeSwipeSensitivity,
    REVIEW_TAP_ZONES,
} from '../lib/reviewerTouchControls';

type SectionId =
    | 'general'
    | 'newStudy'
    | 'reviewing'
    | 'notifications'
    | 'controls'
    | 'accessibility'
    | 'data'
    | 'about';

type Category = {
    id: SectionId;
    icon: string;
    title: string;
    summary: string;
};

const PRIVACY_URL = 'https://bugraguclu.github.io/tus-flashcard-app/privacy.html';
const SUPPORT_URL = 'https://bugraguclu.github.io/tus-flashcard-app/support.html';

type GestureSettingKey = 'swipeLeftAction' | 'swipeRightAction' | 'swipeUpAction' | 'swipeDownAction';
type TapSide = 'question' | 'answer';
type GesturePickerTarget =
    | { kind: 'swipe'; field: GestureSettingKey }
    | { kind: 'tap'; side: TapSide; zone: ReviewTapZone };

type MemoizedSectionProps = { render: () => React.ReactNode };

const GeneralSettingsSection = React.memo(function GeneralSettingsSection({ render }: MemoizedSectionProps) {
    return <>{render()}</>;
});

const ReviewingSettingsSection = React.memo(function ReviewingSettingsSection({ render }: MemoizedSectionProps) {
    return <>{render()}</>;
});

const ControlsSettingsSection = React.memo(function ControlsSettingsSection({ render }: MemoizedSectionProps) {
    return <>{render()}</>;
});

const DataManagementSettingsSection = React.memo(function DataManagementSettingsSection({ render }: MemoizedSectionProps) {
    return <>{render()}</>;
});

function formatKeyLabel(key: string): string {
    if (key === ' ') return 'Space';
    return key.length === 1 ? key.toUpperCase() : key;
}

function settingsMatch(actual: AppSettings, expected: AppSettings): boolean {
    return (Object.keys(expected) as Array<keyof AppSettings>).every((key) => (
        JSON.stringify(actual[key]) === JSON.stringify(expected[key])
    ));
}

const KEY_ROWS: Array<{ field: keyof KeyBindings; tr: string; en: string }> = [
    { field: 'showAnswer', tr: 'Cevabı göster', en: 'Show answer' },
    { field: 'again', tr: 'Tekrar', en: 'Answer again' },
    { field: 'hard', tr: 'Zor', en: 'Answer hard' },
    { field: 'good', tr: 'İyi', en: 'Answer good' },
    { field: 'easy', tr: 'Kolay', en: 'Answer easy' },
    { field: 'replayAudio', tr: 'Sesi yeniden oynat', en: 'Replay audio' },
    { field: 'buryCard', tr: 'Kartı göm', en: 'Bury card' },
    { field: 'suspendCard', tr: 'Kartı askıya al', en: 'Suspend card' },
    { field: 'markNote', tr: 'Notu işaretle', en: 'Mark note' },
];

function Group({ title, description, onHelpPress, helpLabel, children, styles }: {
    title: string;
    description?: string;
    onHelpPress?: () => void;
    helpLabel?: string;
    children: React.ReactNode;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.group}>
            <View style={styles.groupTitleRow}>
                <Text style={styles.groupTitle}>{title}</Text>
                {onHelpPress ? (
                    <TouchableOpacity
                        style={styles.groupHelpButton}
                        onPress={onHelpPress}
                        accessibilityRole="button"
                        accessibilityLabel={helpLabel ?? title}
                    >
                        <Text style={styles.groupHelpText}>?</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            {description ? <Text style={styles.groupDescription}>{description}</Text> : null}
            {children}
        </View>
    );
}

function GestureActionRow({ icon, label, value, onPress, styles }: {
    icon: string;
    label: string;
    value: string;
    onPress: () => void;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <TouchableOpacity
            style={styles.gestureActionRow}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value}`}
        >
            <View style={styles.gestureDirectionIcon}>
                <Text style={styles.gestureDirectionText}>{icon}</Text>
            </View>
            <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceLabel}>{label}</Text>
                <Text style={styles.gestureActionValue}>{value}</Text>
            </View>
            <Text style={styles.appearanceValueArrow}>›</Text>
        </TouchableOpacity>
    );
}

function DataActionRow({ icon, label, detail, onPress, danger = false, divider = true, disabled = false, styles }: {
    icon: string;
    label: string;
    detail?: string;
    onPress: () => void;
    danger?: boolean;
    divider?: boolean;
    disabled?: boolean;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <TouchableOpacity
            style={[styles.dataActionRow, !divider && styles.dataActionRowNoDivider, disabled && { opacity: 0.5 }]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
        >
            <View style={[styles.dataActionIcon, danger && styles.dataActionIconDanger]}>
                <Text style={[styles.dataActionIconText, danger && styles.dataActionIconTextDanger]}>{icon}</Text>
            </View>
            <View style={styles.dataActionCopy}>
                <Text style={[styles.dataActionLabel, danger && styles.dangerText]}>{label}</Text>
                {detail ? <Text style={styles.dataActionDetail}>{detail}</Text> : null}
            </View>
            <Text style={[styles.dataActionArrow, danger && styles.dangerText]}>›</Text>
        </TouchableOpacity>
    );
}

function ToggleRow({ label, summary, value, onChange, divider = true, styles }: {
    label: string;
    summary?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    divider?: boolean;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <TouchableOpacity
            style={[styles.preferenceRow, !divider && styles.preferenceRowNoDivider]}
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

function StepperRow({ label, summary, value, suffix, minimumDigits, step, min, max, onChange, styles }: {
    label: string;
    summary?: string;
    value: number;
    suffix?: string;
    minimumDigits?: number;
    step: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    const inputRef = useRef<BoundedIntegerInputHandle>(null);

    return (
        <View style={styles.preferenceBlock}>
            <Text style={styles.preferenceLabel}>{label}</Text>
            {summary ? <Text style={styles.preferenceSummary}>{summary}</Text> : null}
            <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepButton} onPress={() => inputRef.current?.stepBy(-step)}>
                    <Text style={styles.stepButtonText}>−</Text>
                </TouchableOpacity>
                <BoundedIntegerInput
                    ref={inputRef}
                    value={value}
                    min={min}
                    max={max}
                    suffix={suffix}
                    minimumDigits={minimumDigits}
                    onChange={onChange}
                    accessibilityLabel={label}
                    style={styles.stepValueInput}
                />
                <TouchableOpacity style={styles.stepButton} onPress={() => inputRef.current?.stepBy(step)}>
                    <Text style={styles.stepButtonText}>+</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function SwipeSensitivitySlider({ value, onChange, label, summary, styles }: {
    value: number;
    onChange: (value: number) => void;
    label: string;
    summary: string;
    styles: ReturnType<typeof createStyles>;
}) {
    const normalized = normalizeSwipeSensitivity(value);
    const [draft, setDraft] = useState(normalized);
    const [trackWidth, setTrackWidth] = useState(1);

    useEffect(() => setDraft(normalized), [normalized]);

    const valueAt = (locationX: number) => normalizeSwipeSensitivity(
        1 + (Math.max(0, Math.min(trackWidth, locationX - 10)) / trackWidth) * 199,
    );
    const commit = (next: number) => {
        setDraft(next);
        onChange(next);
    };
    const ratio = (draft - 1) / 199;

    return (
        <View style={styles.swipeSensitivityBlock}>
            <View style={styles.swipeSensitivityHeader}>
                <Text style={styles.preferenceLabel}>{label}</Text>
                <Text style={styles.swipeSensitivityValue}>{draft}%</Text>
            </View>
            <Text style={styles.preferenceSummary}>{summary}</Text>
            <View
                style={styles.swipeSliderTouchTarget}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => setDraft(valueAt(event.nativeEvent.locationX))}
                onResponderMove={(event) => setDraft(valueAt(event.nativeEvent.locationX))}
                onResponderRelease={(event) => commit(valueAt(event.nativeEvent.locationX))}
                onResponderTerminate={() => setDraft(normalized)}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={label}
                accessibilityValue={{ min: 1, max: 200, now: draft, text: `${draft}%` }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'increment') commit(normalizeSwipeSensitivity(draft + 10));
                    if (event.nativeEvent.actionName === 'decrement') commit(normalizeSwipeSensitivity(draft - 10));
                }}
            >
                <View
                    style={styles.swipeSliderTrack}
                    pointerEvents="none"
                    onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                >
                    <View style={[styles.swipeSliderFill, { width: `${ratio * 100}%` }]} />
                    <View style={[styles.swipeSliderThumb, { left: `${ratio * 100}%` }]} />
                </View>
            </View>
        </View>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktopWeb = Platform.OS === 'web' && width >= 600;
    const { refreshSettings: refreshData } = useAppSettings();
    const { invalidateCollection, markSchedulingStale } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const { l, deviceLanguage } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionId | null>(null);
    const [search, setSearch] = useState('');
    const [recordingField, setRecordingField] = useState<keyof KeyBindings | null>(null);
    const [controlsHelpVisible, setControlsHelpVisible] = useState(false);
    const [gesturePickerTarget, setGesturePickerTarget] = useState<GesturePickerTarget | null>(null);
    const [tapSide, setTapSide] = useState<TapSide>('question');
    const [notificationThresholdPickerVisible, setNotificationThresholdPickerVisible] = useState(false);
    const [maintenanceAction, setMaintenanceAction] = useState<'optimize' | 'reset' | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveFailedRef = useRef(false);
    const sectionScrollRef = useRef<ScrollView>(null);

    const gestureActionOptions = useMemo<Array<{ value: ReviewGestureAction; label: string }>>(() => [
        { value: 'off', label: l('Eylem yok', 'No action') },
        { value: 'showAnswer', label: l('Cevabı göster', 'Show answer') },
        { value: 'again', label: l('Yanıtla: Tekrar', 'Answer: Again') },
        { value: 'hard', label: l('Yanıtla: Zor', 'Answer: Hard') },
        { value: 'good', label: l('Yanıtla: İyi', 'Answer: Good') },
        { value: 'easy', label: l('Yanıtla: Kolay', 'Answer: Easy') },
        { value: 'undo', label: l('Son işlemi geri al', 'Undo last action') },
        { value: 'edit', label: l('Notu düzenle', 'Edit note') },
        { value: 'mark', label: l('Notu işaretle / işareti kaldır', 'Mark / unmark note') },
        { value: 'bury', label: l('Kartı göm', 'Bury card') },
        { value: 'suspend', label: l('Kartı askıya al', 'Suspend card') },
        { value: 'replayAudio', label: l('Sesi yeniden oynat', 'Replay audio') },
        { value: 'flag', label: l('Bayrak seçiciyi aç', 'Open flag picker') },
        { value: 'tools', label: l('Araçları aç', 'Open tools') },
        { value: 'decks', label: l('Destelere dön', 'Return to decks') },
    ], [l]);

    const gestureActionLabel = useCallback((action: ReviewGestureAction | undefined) => (
        gestureActionOptions.find((option) => option.value === action)?.label
        ?? gestureActionOptions[0].label
    ), [gestureActionOptions]);

    const notificationThresholdOptions = useMemo<Array<{
        value: StudyNotificationThreshold | null;
        label: string;
    }>>(() => [
        { value: null, label: l('Asla bildirme', 'Never notify') },
        { value: 0, label: l('Bekleyen tekrar varsa', 'When reviews are waiting') },
        ...STUDY_NOTIFICATION_THRESHOLDS
            .filter((threshold) => threshold > 0)
            .map((threshold) => ({
                value: threshold,
                label: l(
                    `${threshold}’den fazla kartın zamanı geldiyse`,
                    `More than ${threshold} cards are due`,
                ),
            })),
    ], [l]);

    const notificationThresholdLabel = (
        enabled: boolean | undefined,
        threshold: StudyNotificationThreshold | undefined,
    ) => {
        const value = enabled ? normalizeStudyNotificationThreshold(threshold) : null;
        return notificationThresholdOptions.find((option) => option.value === value)?.label
            ?? notificationThresholdOptions[1].label;
    };

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, []);

    const showSavedState = useCallback(() => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 1400);
    }, []);

    const persistAndRefreshSettings = useCallback((next: AppSettings): boolean => {
        const result = saveSettings(next);
        const persisted = loadSettings();
        setSettings(persisted);
        refreshData();
        if (!result.ok || !settingsMatch(persisted, result.settings)) {
            lastSaveFailedRef.current = true;
            setSaved(false);
            alert(
                l('Ayarlar kaydedilemedi', 'Settings Not Saved'),
                l('Değişiklik cihaz depolamasına yazılamadı. Önceki ayarlar korunuyor.', 'The change could not be written to device storage. Your previous settings are preserved.'),
            );
            return false;
        }
        lastSaveFailedRef.current = false;
        showSavedState();
        return true;
    }, [l, refreshData, showSavedState]);

    const updateSettings = useCallback((patch: Partial<AppSettings>): boolean => {
        const updated = { ...settings, ...patch };
        return persistAndRefreshSettings(updated);
    }, [persistAndRefreshSettings, settings]);

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        const didSave = updateSettings({ [key]: value } as Pick<AppSettings, K>);
        if (didSave && (key === 'dayRolloverHour' || key === 'learnAheadMinutes')) {
            markSchedulingStale();
        }
        return didSave;
    }, [markSchedulingStale, updateSettings]);

    const openSection = useCallback((section: SectionId) => {
        Keyboard.dismiss();
        setActiveSection(section);
    }, []);

    useEffect(() => {
        if (!activeSection) return;
        sectionScrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [activeSection]);

    const handleSaveSettings = () => {
        // Every preference is persisted by updateSetting. Dismissing the keyboard commits an
        // active numeric draft via onBlur; re-saving this render's older settings object here
        // could otherwise overwrite that freshly committed number.
        Keyboard.dismiss();
        if (!lastSaveFailedRef.current) showSavedState();
    };

    const handleStudyNotificationsToggle = async (
        enabled: boolean,
        threshold: StudyNotificationThreshold = normalizeStudyNotificationThreshold(settings.studyNotificationThreshold),
    ) => {
        if (Platform.OS !== 'ios') {
            alert(l('Yalnızca iPhone ve iPad', 'iPhone and iPad only'), l('Bu ayar AnkiMobile uyumlu iOS bildirimleri içindir.', 'This setting controls AnkiMobile-compatible iOS notifications.'));
            return;
        }

        if (!enabled) {
            updateSetting('studyNotificationsEnabled', false);
            await disableStudyNotifications().catch((error) => console.warn('[Settings] notification disable failed:', error));
            return;
        }

        try {
            const permission = await requestStudyNotificationPermission();
            if (permission.state !== 'granted' && permission.state !== 'limited') {
                updateSettings({
                    studyNotificationsEnabled: false,
                    studyNotificationThreshold: threshold,
                });
                alert(
                    l('Bildirim izni gerekli', 'Notification permission required'),
                    l('Günlük çalışma hatırlatmasını açmak için iOS Ayarları’nda bildirimlere izin verin.', 'Allow notifications in iOS Settings to enable the daily study reminder.'),
                );
                return;
            }
            updateSettings({
                studyNotificationsEnabled: true,
                studyNotificationThreshold: threshold,
            });
        } catch (error) {
            console.warn('[Settings] notification permission failed:', error);
            alert(l('Bildirim açılamadı', 'Could not enable notifications'), l('Bildirim izni alınamadı. Lütfen iOS Ayarları’nı kontrol edin.', 'Notification permission could not be obtained. Check iOS Settings.'));
        }
    };

    const handleStudyNotificationPolicySelect = async (
        value: StudyNotificationThreshold | null,
    ) => {
        setNotificationThresholdPickerVisible(false);
        if (value === null) {
            await handleStudyNotificationsToggle(false);
            return;
        }
        await handleStudyNotificationsToggle(true, value);
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

    const categories = useMemo<Category[]>(() => [
        { id: 'general', icon: '⚙️', title: l('Genel', 'General'), summary: l('Dil • Tema • Düzenleme', 'Language • Theme • Editing') },
        { id: 'newStudy', icon: '🃏', title: l('Yeni çalışma ekranı', 'New study screen'), summary: l('Ekran • Araç çubuğu • Yanıt düğmeleri', 'Screen • Toolbar • Answer buttons') },
        { id: 'reviewing', icon: '🧠', title: l('İnceleme', 'Reviewing'), summary: l('Zamanlama • Ekranı açık tut', 'Scheduling • Keep screen on') },
        {
            id: 'notifications',
            icon: '🔔',
            title: l('Bildirimler', 'Notifications'),
            summary: settings.studyNotificationsEnabled
                ? `${notificationThresholdLabel(true, settings.studyNotificationThreshold)} · ${String(settings.studyNotificationHour ?? 9).padStart(2, '0')}:${String(settings.studyNotificationMinute ?? 0).padStart(2, '0')}`
                : l('Kapalı', 'Off'),
        },
        {
            id: 'controls',
            icon: '☝️',
            title: l('Kontroller', 'Controls'),
            summary: isDesktopWeb
                ? l('Hareketler • Klavye', 'Gestures • Keyboard')
                : l('Kaydırma • Dokunma', 'Swipe • Touch'),
        },
        { id: 'accessibility', icon: '♿️', title: l('Erişilebilirlik', 'Accessibility'), summary: l('Kart yakınlaştırma • Yanıt düğmesi boyutu', 'Card zoom • Answer button size') },
        { id: 'data', icon: '🗄️', title: l('Veri yönetimi', 'Data Management'), summary: l('Yedekleme • Aktarım • Bakım', 'Backups • Transfer • Maintenance') },
        { id: 'about', icon: 'ℹ️', title: l('Hakkında', 'About'), summary: `TusAnkiM ${Constants.expoConfig?.version ?? '1.0.0'}` },
    ], [isDesktopWeb, l, notificationThresholdOptions, settings.studyNotificationHour, settings.studyNotificationMinute, settings.studyNotificationThreshold, settings.studyNotificationsEnabled]);

    const activeCategory = categories.find((item) => item.id === activeSection) ?? null;
    const filteredCategories = categories.filter((item) => `${item.title} ${item.summary}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    const handleBack = () => {
        if (activeSection) {
            setActiveSection(null);
            return;
        }
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/decks' as any);
    };

    const handleExport = useCallback(() => router.push(DATA_EXPORT_ROUTE), [router]);
    const handleImport = useCallback(() => router.push(DATA_IMPORT_ROUTE), [router]);

    const handleCheckDatabase = useCallback(() => {
        try {
            const result = checkDatabase();
            const integrityMessage = result.integrity === 'ok'
                ? l('Bütünlük: tamam', 'Integrity: OK')
                : result.integrity === 'check_failed'
                    ? l('Bütünlük kontrolü tamamlanamadı', 'Integrity check could not be completed')
                    : l('Bütünlük sorunu algılandı', 'An integrity issue was detected');
            alert(
                l('Veritabanını kontrol et', 'Check Database'),
                [
                    integrityMessage,
                    `${l('Sahipsiz kartlar', 'Orphan cards')}: ${result.orphanCards}`,
                    `${l('Sahipsiz notlar', 'Orphan notes')}: ${result.orphanNotes}`,
                ].filter(Boolean).join('\n'),
            );
        } catch (error) {
            console.warn('[Settings] database check failed:', error);
            alert(l('Hata', 'Error'), l('Veritabanı kontrol edilemedi.', 'Database check failed.'));
        }
    }, [l]);

    const handleOptimizeDatabase = useCallback(() => {
        if (maintenanceAction) return;
        confirm(
            l('Veritabanını onar ve optimize et', 'Repair and Optimize Database'),
            l(
                'Bu işlem veritabanını sıkıştırır, indeksleri yeniler ve arama dizinini yeniden oluşturur. Başlamadan önce güvenlik yedeği alınacaktır.',
                'This compacts the database, refreshes indexes, and rebuilds search. A safety backup will be created first.',
            ),
            () => {
                void (async () => {
                    setMaintenanceAction('optimize');
                    try {
                        await createBackupNow();
                        // Allow the busy state to paint before synchronous SQLite maintenance.
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        const result = optimizeDatabase();
                        alert(
                            l('Optimizasyon tamamlandı', 'Optimization Complete'),
                            result.ftsReindexed > 0
                                ? l(`${result.ftsReindexed} kartın arama dizini yenilendi.`, `Search was rebuilt for ${result.ftsReindexed} cards.`)
                                : l('Veritabanı indeksleri yenilendi.', 'Database indexes were refreshed.'),
                        );
                    } catch (error) {
                        console.warn('[Settings] database optimization failed:', error);
                        alert(
                            l('Optimizasyon tamamlanamadı', 'Optimization Failed'),
                            l('Hiçbir onarım güvenlik yedeği alınmadan başlatılmaz. Yedekler ekranını kontrol edip tekrar deneyin.', 'No repair starts without a safety backup. Check Backups and try again.'),
                        );
                    } finally {
                        setMaintenanceAction(null);
                    }
                })();
            },
        );
    }, [l, maintenanceAction]);

    const handleCheckMedia = useCallback(async () => {
        try {
            const result = await checkMedia();
            const preview = (items: string[]) => items.slice(0, 5).join('\n');
            alert(
                l('Medyayı kontrol et', 'Check Media'),
                [
                    `${l('Başvurulan dosya', 'Referenced files')}: ${result.referenced}`,
                    `${l('Saklanan dosya', 'Stored files')}: ${result.stored}`,
                    `${l('Eksik', 'Missing')}: ${result.missing.length}`,
                    result.missing.length ? preview(result.missing) : '',
                    `${l('Kullanılmayan', 'Unused')}: ${result.unused.length}`,
                    result.unused.length ? preview(result.unused) : '',
                    result.missing.length > 5 || result.unused.length > 5 ? l('İlk 5 dosya gösteriliyor.', 'Showing the first 5 files.') : '',
                ].filter(Boolean).join('\n'),
            );
        } catch (error) {
            console.warn('[Settings] media check failed:', error);
            alert(l('Hata', 'Error'), l('Medya kontrolü tamamlanamadı.', 'Media check could not be completed.'));
        }
    }, [l]);

    const handleResetSettings = useCallback(() => {
        confirm(l('Varsayılan ayarlar', 'Default Settings'), l('Tüm uygulama ayarları varsayılana döndürülsün mü?', 'Restore all app settings to defaults?'), () => {
            const result = resetSettingsToDefaults();
            if (!result.ok) {
                alert(l('Ayarlar sıfırlanamadı', 'Settings Not Reset'), l('Varsayılan ayarlar cihaz depolamasına yazılamadı.', 'Default settings could not be written to device storage.'));
                return;
            }
            setSettings(loadSettings());
            refreshData();
            markSchedulingStale();
        });
    }, [l, markSchedulingStale, refreshData]);

    const handleResetProgress = useCallback(() => {
        if (maintenanceAction) return;
        confirm(l('İlerlemeyi sıfırla', 'Reset Progress'), l('Kartlar, çalışma geçmişi ve ilerleme silinecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulacak.', 'Cards, review history, and progress will be deleted after a restorable safety backup is created.'), () => {
            void (async () => {
                setMaintenanceAction('reset');
                try {
                    const { backupFileName } = await resetAllDataWithBackup();
                    setSettings(loadSettings());
                    refreshData();
                    invalidateCollection();
                    // Reset removes both the installed catalog rows and its local access marker.
                    await refreshCatalogAccess();
                    alert(
                        l('İlerleme sıfırlandı', 'Progress Reset'),
                        l(`Geri dönüş için ${backupFileName} yedeği saklandı.`, `The backup ${backupFileName} was kept for recovery.`),
                    );
                } catch (error) {
                    console.warn('[Settings] reset progress failed:', error);
                    const retained = error instanceof ResetWorkflowError && error.backupFileName;
                    alert(
                        l('Sıfırlama tamamlanamadı', 'Reset Failed'),
                        retained
                            ? l(`Veriler tamamen sıfırlanamadı. ${retained} güvenlik yedeği korundu.`, `The reset did not complete. Safety backup ${retained} was retained.`)
                            : l('Güvenlik yedeği oluşturulamadığı için hiçbir veri silinmedi.', 'No data was deleted because the safety backup could not be created.'),
                    );
                } finally {
                    setMaintenanceAction(null);
                }
            })();
        }, { destructive: true });
    }, [invalidateCollection, l, maintenanceAction, refreshCatalogAccess, refreshData]);

    const renderGeneral = useCallback(() => (
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
            <Group title={l('Tema', 'Theme')} styles={styles}>
                <View style={styles.themeChoiceRow}>
                    {([
                        { value: 'system' as const, label: l('Sistem', 'System') },
                        { value: 'light' as const, label: l('Açık', 'Light') },
                        { value: 'dark' as const, label: l('Koyu', 'Dark') },
                    ]).map((option) => {
                        const selected = settings.themeMode === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                style={[styles.themeChoiceButton, selected && styles.themeChoiceButtonActive]}
                                onPress={() => updateSetting('themeMode', option.value)}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                            >
                                <Text style={[styles.themeChoiceText, selected && styles.themeChoiceTextActive]}>{option.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
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
                <ToggleRow
                    label={l('Pano görsellerini PNG olarak yapıştır', 'Paste clipboard images as PNG')}
                    summary={l('Editöre yapıştırılan görseli koleksiyon medyasına dönüştürür; çevrimdışı ve dışa aktarmada korunur.', 'Converts pasted images into collection media so they remain available offline and in exports.')}
                    value={Boolean(settings.pasteClipboardImagesAsPng)}
                    onChange={(value) => updateSetting('pasteClipboardImagesAsPng', value)}
                    styles={styles}
                />
                <ToggleRow
                    label={l('Yazarak cevap alanlarını devre dışı bırak', 'Never type answers')}
                    summary={l('Yazarak cevap şablonlarında klavyeyi açmadan normal kartı gösterir.', 'Shows type-answer cards without opening the answer keyboard.')}
                    value={Boolean(settings.neverTypeAnswer)}
                    onChange={(value) => updateSetting('neverTypeAnswer', value)}
                    styles={styles}
                />
                {!settings.neverTypeAnswer ? (
                    <>
                        <ToggleRow
                            label={l('Cevabı kartın içine yaz', 'Type answer into the card')}
                            summary={l('Giriş alanını şablondaki {{type:Alan}} konumuna yerleştirir ve kartın #typeans stilini uygular.', 'Places the input at {{type:Field}} so the card’s #typeans styling applies.')}
                            value={Boolean(settings.typeAnswerInCard)}
                            onChange={(value) => updateSetting('typeAnswerInCard', value)}
                            styles={styles}
                        />
                        <ToggleRow
                            label={l('Yazarak cevap alanına odaklan', 'Focus type-in-answer')}
                            summary={l('Yazarak cevap kartı açıldığında alanı seçer ve klavyeyi açar.', 'Selects the field and opens the keyboard when a type-answer card appears.')}
                            value={settings.focusTypeAnswer !== false}
                            onChange={(value) => updateSetting('focusTypeAnswer', value)}
                            styles={styles}
                        />
                    </>
                ) : null}
            </Group>
            <View style={styles.group}>
                <ToggleRow
                    label={l('Dosya adlarını göster', 'Show filenames')}
                    summary={l('Kart tarayıcısındaki soru/cevap alanlarında ses dosyası adlarını gösterir.', 'Displays audio filenames in the card browser question/answer fields.')}
                    value={Boolean(settings.showBrowserAudioFilenames)}
                    onChange={(value) => updateSetting('showBrowserAudioFilenames', value)}
                    divider={false}
                    styles={styles}
                />
            </View>
            {Platform.OS === 'android' ? (
                <Group title={l('Android gezinme', 'Android navigation')} description={l('AnkiDroid’dan esinlenen, Android’e özgü isteğe bağlı davranışlar.', 'Optional Android-specific behaviors inspired by AnkiDroid.')} styles={styles}>
                    <ToggleRow label={l('Tam ekrandan sağa kaydırınca menüyü aç', 'Open menu with a full-screen right swipe')} value={Boolean(settings.fullScreenNavigationDrawer)} onChange={(value) => updateSetting('fullScreenNavigationDrawer', value)} styles={styles} />
                    <ToggleRow label={l('Geri/çıkış için iki kez geri bas', 'Press back twice to go back/exit')} value={Boolean(settings.doubleBackToExit)} onChange={(value) => updateSetting('doubleBackToExit', value)} styles={styles} />
                </Group>
            ) : null}
            <TouchableOpacity style={styles.outlineButton} onPress={handleResetSettings}>
                <Text style={styles.outlineButtonText}>↺ {l('Varsayılan ayarlara dön', 'Restore default settings')}</Text>
            </TouchableOpacity>
        </>
    ), [deviceLanguage, handleResetSettings, l, settings, styles, updateSetting]);

    const renderNewStudy = () => (
        <>
            <Group title={l('Yeni çalışma ekranı', 'New study screen')} styles={styles}>
                <ToggleRow
                    label={l('Yeni çalışma ekranını kullan', 'Use new study screen')}
                    summary={l('Yeni araç çubuğu, sabit yanıt alanı ve yönlü yanıt geri bildirimini etkinleştirir.', 'Enables the new toolbar, fixed answer area and directional answer feedback.')}
                    value={Boolean(settings.newStudyScreenEnabled)}
                    onChange={(value) => updateSetting('newStudyScreenEnabled', value)}
                    styles={styles}
                />
            </Group>
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
                <ToggleRow label={l('Yanıt geri bildirimini göster', 'Show answer feedback')} summary={l('Tekrar yanıtında kırmızı çarpı, tüm yanıt düğmelerinde dokunsal geri bildirim gösterir.', 'Shows a red cross for Again and haptic feedback for all answer buttons.')} value={settings.showAnswerFeedback !== false} onChange={(value) => updateSetting('showAnswerFeedback', value)} styles={styles} />
                <ToggleRow label={l('Ortaya hizala', 'Center align')} summary={l('Kart içeriğini dikey olarak ortalar.', 'Centers card content vertically.')} value={Boolean(settings.centerCardContent)} onChange={(value) => updateSetting('centerCardContent', value)} styles={styles} />
                <ToggleRow label={l('Deste başlığını göster', 'Show deck title')} value={settings.showDeckTitle !== false} onChange={(value) => updateSetting('showDeckTitle', value)} styles={styles} />
                <ToggleRow label={l('Kalan süreyi göster', 'Show remaining time')} summary={l('Mevcut hızla tahmini bitiş süresini gösterir.', 'Shows an estimated time remaining at the current pace.')} value={Boolean(settings.showRemainingTime)} onChange={(value) => updateSetting('showRemainingTime', value)} styles={styles} />
            </Group>
            <Group title={l('Araç çubuğu', 'Toolbar')} styles={styles}>
                <ToggleRow label={l('Araç çubuğunu göster', 'Show toolbar')} summary={l('Geri, deste kapsamı, sayaçlar ve kart işlemlerini gösterir.', 'Shows back, deck scope, counts and card actions.')} value={settings.showStudyTopBar !== false} onChange={(value) => updateSetting('showStudyTopBar', value)} styles={styles} />
                {settings.showStudyTopBar !== false ? (
                    <ChoiceRow
                        label={l('Araç çubuğu konumu', 'Toolbar position')}
                        value={settings.reviewerToolbarPosition ?? 'top'}
                        options={[
                            { value: 'top', label: l('Üst', 'Top') },
                            { value: 'bottom', label: l('Alt', 'Bottom') },
                        ]}
                        onChange={(value) => updateSetting('reviewerToolbarPosition', value)}
                        styles={styles}
                    />
                ) : null}
            </Group>
            <Group title={l('Yanıt düğmeleri', 'Answer buttons')} styles={styles}>
                <ToggleRow
                    label={l('Yanıt düğmelerini göster', 'Show answer buttons')}
                    summary={l('Kapalıyken kartlar dokunma bölgeleri veya kaydırma hareketleriyle yanıtlanır.', 'When hidden, cards are answered with tap zones or swipe gestures.')}
                    value={settings.showAnswerButtons !== false}
                    onChange={(value) => {
                        if (!value && !settings.gesturesEnabled && settings.ninePointTouchEnabled === false) {
                            alert(
                                l('Dokunma veya kaydırmayı etkinleştirin', 'Enable taps or swipes'),
                                l(
                                    'Yanıt düğmelerini gizlemeden önce Kontroller bölümünde 9 noktalı dokunmayı veya kaydırma hareketlerini etkinleştirin.',
                                    'Enable 9-point touch or swipe gestures in Controls before hiding answer buttons.',
                                ),
                            );
                            return;
                        }
                        updateSetting('showAnswerButtons', value);
                    }}
                    styles={styles}
                />
                <ToggleRow label={l('Sonraki inceleme süresini göster', 'Show next review time above answer buttons')} value={settings.showNextReviewTimes} onChange={(value) => updateSetting('showNextReviewTimes', value)} styles={styles} />
                <ToggleRow label={l('Zor ve Kolay düğmelerini gizle', 'Hide Hard and Easy buttons')} summary={l('Yalnızca Tekrar ve İyi gösterilir.', 'Only Again and Good are shown.')} value={Boolean(settings.hideHardAndEasy)} onChange={(value) => updateSetting('hideHardAndEasy', value)} styles={styles} />
                <ToggleRow label={l('Otomatik ilerleme', 'Auto advance')} summary={l('Kart açıldıktan sekiz saniye sonra cevabı gösterir.', 'Reveals the answer eight seconds after a card opens.')} value={settings.autoAdvance} onChange={(value) => updateSetting('autoAdvance', value)} styles={styles} />
            </Group>
        </>
    );

    const renderReviewing = useCallback(() => (
        <>
            <Group title={l('Zamanlama', 'Scheduling')} styles={styles}>
                <StepperRow label={l('Sonraki günün başlangıcı', 'Start of next day')} summary={l('Günlük istatistikler ve limitler bu saatte yenilenir.', 'Daily statistics and limits reset at this hour.')} value={settings.dayRolloverHour} suffix=":00" minimumDigits={2} step={1} min={0} max={23} onChange={(value) => updateSetting('dayRolloverHour', value)} styles={styles} />
                <StepperRow label={l('Önceden öğrenme sınırı', 'Learn ahead limit')} summary={l('Sırada başka kart kalmadığında öğrenme kartlarını erken gösterir.', 'Shows learning cards early when nothing else is queued.')} value={settings.learnAheadMinutes} suffix={l('dk.', 'mins')} step={5} min={0} max={120} onChange={(value) => updateSetting('learnAheadMinutes', value)} styles={styles} />
                <StepperRow label={l('Zaman kutusu sınırı', 'Timebox time limit')} summary={l('Her zaman kutusu sona erdiğinde çalıştığınız kart sayısını gösterir; 0 özelliği kapatır.', 'Shows how many cards you studied when each timebox ends; 0 disables it.')} value={settings.timeboxMinutes ?? 0} suffix={l('dk.', 'mins')} step={1} min={0} max={9999} onChange={(value) => updateSetting('timeboxMinutes', value)} styles={styles} />
            </Group>
            <Group title={l('Gelişmiş', 'Advanced')} styles={styles}>
                <ToggleRow label={l('Ekranı açık tut', 'Keep screen on')} summary={l('Çalışma sırasında ekran zaman aşımını devre dışı bırakır.', 'Disables screen timeout while reviewing.')} value={Boolean(settings.keepScreenOn)} onChange={(value) => updateSetting('keepScreenOn', value)} styles={styles} />
                <ToggleRow label={l('Sesi otomatik oynat', 'Automatically play audio')} value={settings.autoPlayAudio} onChange={(value) => updateSetting('autoPlayAudio', value)} styles={styles} />
                <ToggleRow label={l('Yanıtlarken sesi kes', 'Interrupt audio when answering')} value={settings.interruptAudioOnAnswer} onChange={(value) => updateSetting('interruptAudioOnAnswer', value)} styles={styles} />
            </Group>
        </>
    ), [l, settings, styles, updateSetting]);

    const renderNotifications = () => (
        <Group title={l('Bildirimler', 'Notifications')} styles={styles}>
            <ToggleRow
                label={l('Bildirimler', 'Notifications')}
                value={Boolean(settings.studyNotificationsEnabled)}
                onChange={(value) => { void handleStudyNotificationsToggle(value); }}
                styles={styles}
            />
            <TouchableOpacity
                style={styles.preferenceRow}
                onPress={() => setNotificationThresholdPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={l('Şu durumda bildir', 'Notify when')}
                accessibilityValue={{ text: notificationThresholdLabel(settings.studyNotificationsEnabled, settings.studyNotificationThreshold) }}
            >
                <View style={styles.preferenceCopy}>
                    <Text style={styles.preferenceLabel}>{l('Şu durumda bildir', 'Notify when')}</Text>
                    <Text style={styles.preferenceSummary}>
                        {notificationThresholdLabel(settings.studyNotificationsEnabled, settings.studyNotificationThreshold)}
                    </Text>
                </View>
                <Text style={styles.appearanceValueArrow}>›</Text>
            </TouchableOpacity>
            {settings.studyNotificationsEnabled && Platform.OS === 'ios' ? (
                <View style={styles.preferenceBlock}>
                    <Text style={styles.preferenceLabel}>{l('Hatırlatma saati', 'Reminder time')}</Text>
                    <Text style={styles.preferenceSummary}>{l('Her gün bu yerel saatte zamanı gelmiş kartlar kontrol edilir.', 'The reminder checks for due cards at this local time each day.')}</Text>
                    <View style={styles.notificationTimeRow}>
                        <BoundedIntegerInput
                            value={settings.studyNotificationHour ?? 9}
                            min={0}
                            max={23}
                            minimumDigits={2}
                            onChange={(value) => updateSetting('studyNotificationHour', value)}
                            accessibilityLabel={l('Hatırlatma saati, saat', 'Reminder hour')}
                        />
                        <Text style={styles.timeSeparator}>:</Text>
                        <BoundedIntegerInput
                            value={settings.studyNotificationMinute ?? 0}
                            min={0}
                            max={59}
                            minimumDigits={2}
                            onChange={(value) => updateSetting('studyNotificationMinute', value)}
                            accessibilityLabel={l('Hatırlatma saati, dakika', 'Reminder minute')}
                        />
                    </View>
                </View>
            ) : null}
            {Platform.OS === 'ios' ? (
                <View style={styles.notificationPlatformNote}>
                    <Text style={styles.preferenceSummary}>
                        {l(
                            'Titreşim ve LED/flaş uyarıları iOS Ayarları tarafından yönetilir; uygulamalar bunları ayrı ayrı zorlayamaz.',
                            'Vibration and LED/flash alerts are controlled by iOS Settings and cannot be forced separately by an app.',
                        )}
                    </Text>
                </View>
            ) : null}
        </Group>
    );

    const renderControls = useCallback(() => (
        <>
            <Group
                title={l('Dokunma ve kaydırma', 'Taps and swipes')}
                description={l(
                    'Kart yüzeyindeki dokuz bölgeye ve dört kaydırma yönüne ayrı eylemler atayın.',
                    'Assign separate actions to the nine card zones and four swipe directions.',
                )}
                onHelpPress={() => setControlsHelpVisible(true)}
                helpLabel={l('Çalışma kontrolleri yardımını aç', 'Open reviewer controls help')}
                styles={styles}
            >
                <ToggleRow
                    label={l('9 noktalı dokunma', '9-point touch')}
                    summary={l('Kart yüzeyini 3×3 bölgeye ayırır; soru ve yanıt tarafları ayrı ayrı ayarlanır.', 'Divides the card surface into a 3×3 grid; question and answer sides are configured separately.')}
                    value={settings.ninePointTouchEnabled !== false}
                    onChange={(value) => updateSettings({
                        ninePointTouchEnabled: value,
                        ...(value || settings.gesturesEnabled || settings.showAnswerButtons !== false ? {} : { showAnswerButtons: true }),
                    })}
                    styles={styles}
                />
                {settings.ninePointTouchEnabled !== false ? (
                    <View style={styles.tapMappingBlock}>
                        <ChoiceRow
                            label={l('Kart tarafı', 'Card side')}
                            value={tapSide}
                            options={[
                                { value: 'question', label: l('Soru', 'Question') },
                                { value: 'answer', label: l('Yanıt', 'Answer') },
                            ]}
                            onChange={setTapSide}
                            styles={styles}
                        />
                        <View style={styles.tapGrid}>
                            {REVIEW_TAP_ZONES.map((zone) => {
                                const labels: Record<ReviewTapZone, string> = {
                                    topLeft: l('Sol üst', 'Top left'),
                                    topCenter: l('Üst', 'Top center'),
                                    topRight: l('Sağ üst', 'Top right'),
                                    middleLeft: l('Sol', 'Middle left'),
                                    middleCenter: l('Orta', 'Center'),
                                    middleRight: l('Sağ', 'Middle right'),
                                    bottomLeft: l('Sol alt', 'Bottom left'),
                                    bottomCenter: l('Alt', 'Bottom center'),
                                    bottomRight: l('Sağ alt', 'Bottom right'),
                                };
                                const actions = tapSide === 'question'
                                    ? settings.questionTapActions ?? DEFAULT_QUESTION_TAP_ACTIONS
                                    : settings.answerTapActions ?? DEFAULT_ANSWER_TAP_ACTIONS;
                                return (
                                    <TouchableOpacity
                                        key={`${tapSide}-${zone}`}
                                        style={styles.tapGridCell}
                                        onPress={() => setGesturePickerTarget({ kind: 'tap', side: tapSide, zone })}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${labels[zone]}: ${gestureActionLabel(actions[zone])}`}
                                    >
                                        <Text style={styles.tapGridZone}>{labels[zone]}</Text>
                                        <Text style={styles.tapGridAction} numberOfLines={2}>{gestureActionLabel(actions[zone])}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                ) : null}
                <ToggleRow
                    label={l('Kaydırma hareketlerini etkinleştir', 'Enable swipe gestures')}
                    summary={l('Kapalıyken çalışma ekranı tüm kaydırmaları normal kart gezinmesine bırakır.', 'When off, the reviewer leaves every swipe to normal card navigation.')}
                    value={Boolean(settings.gesturesEnabled)}
                    onChange={(value) => updateSettings({
                        gesturesEnabled: value,
                        ...(value || settings.showAnswerButtons !== false ? {} : { showAnswerButtons: true }),
                    })}
                    styles={styles}
                />
                {settings.gesturesEnabled ? (
                    <>
                        <View style={styles.gesturePresetBlock}>
                            <Text style={styles.preferenceLabel}>{l('Hazır düzenler', 'Presets')}</Text>
                            <Text style={styles.preferenceSummary}>{l('Bir düzen seçin, ardından yönleri tek tek değiştirebilirsiniz.', 'Choose a preset, then fine-tune each direction.')}</Text>
                            <View style={styles.choiceRow}>
                                <TouchableOpacity
                                    style={styles.choiceButton}
                                    onPress={() => updateSettings({
                                        swipeLeftAction: 'tools',
                                        swipeRightAction: 'decks',
                                        swipeUpAction: 'off',
                                        swipeDownAction: 'off',
                                    })}
                                >
                                    <Text style={styles.choiceText}>{l('iPhone için dengeli', 'Balanced for iPhone')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.choiceButton}
                                    onPress={() => updateSettings({
                                        swipeLeftAction: 'again',
                                        swipeRightAction: 'good',
                                        swipeUpAction: 'easy',
                                        swipeDownAction: 'hard',
                                    })}
                                >
                                    <Text style={styles.choiceText}>{l('Hızlı yanıt', 'Fast answers')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {([
                            ['swipeLeftAction', '←', l('Sola kaydırma', 'Swipe left'), settings.swipeLeftAction ?? 'tools'],
                            ['swipeRightAction', '→', l('Sağa kaydırma', 'Swipe right'), settings.swipeRightAction ?? 'decks'],
                            ['swipeUpAction', '↑', l('Yukarı kaydırma', 'Swipe up'), settings.swipeUpAction ?? 'off'],
                            ['swipeDownAction', '↓', l('Aşağı kaydırma', 'Swipe down'), settings.swipeDownAction ?? 'off'],
                        ] as Array<[GestureSettingKey, string, string, ReviewGestureAction]>).map(([field, icon, label, action]) => (
                            <GestureActionRow
                                key={field}
                                icon={icon}
                                label={label}
                                value={gestureActionLabel(action)}
                                onPress={() => setGesturePickerTarget({ kind: 'swipe', field })}
                                styles={styles}
                            />
                        ))}
                        <SwipeSensitivitySlider
                            label={l('Kaydırma hassasiyeti', 'Swipe sensitivity')}
                            summary={l('Yüksek değer daha kısa hareketleri, düşük değer daha uzun ve belirgin hareketleri algılar.', 'A higher value detects shorter movements; a lower value requires a longer, deliberate swipe.')}
                            value={settings.swipeSensitivity ?? 100}
                            onChange={(value) => updateSetting('swipeSensitivity', value)}
                            styles={styles}
                        />
                    </>
                ) : null}
            </Group>
            {Platform.OS !== 'web' ? (
                <Group title={l('Ekran kontrolü', 'On-screen control')} styles={styles}>
                    <ToggleRow
                    label={l('Yüzen Araçlar düğmesini göster', 'Show the floating Tools button')}
                        summary={l('Araç menüsüne tek elle erişmek için çalışma ekranında sabit bir düğme gösterir.', 'Shows a fixed reviewer button for one-handed access to the Tools menu.')}
                        value={Boolean(settings.showToolsOverlayButton)}
                        onChange={(value) => updateSetting('showToolsOverlayButton', value)}
                        styles={styles}
                    />
                    {settings.showToolsOverlayButton ? (
                        <ChoiceRow
                            label={l('Araçlar düğmesi konumu', 'Tools button position')}
                            value={settings.toolsOverlayPosition ?? 'right'}
                            options={[{ value: 'left', label: l('Sol', 'Left') }, { value: 'right', label: l('Sağ', 'Right') }]}
                            onChange={(value) => updateSetting('toolsOverlayPosition', value)}
                            styles={styles}
                        />
                    ) : null}
                </Group>
            ) : null}
            {isDesktopWeb ? (
                <Group title={l('Klavye', 'Keyboard')} description={l('Bir satırda Değiştir’e basın, ardından fiziksel klavyedeki yeni tuşa basın.', 'Choose Change on a row, then press the new key on the physical keyboard.')} styles={styles}>
                    {KEY_ROWS.map((row) => (
                        <View key={row.field} style={styles.keyRow}>
                            <Text style={styles.keyLabel}>{l(row.tr, row.en)}</Text>
                            <View style={styles.keyActions}>
                                <View style={styles.keyChip}><Text style={styles.keyChipText}>{recordingField === row.field ? l('Bir tuşa basın', 'Press a key') : formatKeyLabel(settings.keyBindings[row.field])}</Text></View>
                                <TouchableOpacity style={styles.smallButton} onPress={() => setRecordingField(recordingField === row.field ? null : row.field)}>
                                    <Text style={styles.smallButtonText}>{recordingField === row.field ? l('İptal', 'Cancel') : l('Değiştir', 'Change')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                    {JSON.stringify(settings.keyBindings) !== JSON.stringify(DEFAULT_KEY_BINDINGS) ? (
                        <TouchableOpacity style={styles.actionButton} onPress={() => updateSetting('keyBindings', DEFAULT_KEY_BINDINGS)}>
                            <Text style={styles.actionButtonText}>{l('Kısayolları sıfırla', 'Reset shortcuts')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </Group>
            ) : null}
        </>
    ), [gestureActionLabel, isDesktopWeb, l, recordingField, settings, styles, tapSide, updateSetting, updateSettings]);

    const renderAccessibility = () => (
        <>
            <Group title={l('Kart', 'Card')} styles={styles}>
                <StepperRow label={l('Kart yakınlaştırma', 'Card zoom')} value={settings.cardZoomPercent ?? 100} suffix="%" step={10} min={50} max={200} onChange={(value) => updateSetting('cardZoomPercent', value)} styles={styles} />
                <StepperRow label={l('Görsel yakınlaştırma', 'Image zoom')} value={settings.imageZoomPercent ?? 100} suffix="%" step={10} min={50} max={200} onChange={(value) => updateSetting('imageZoomPercent', value)} styles={styles} />
            </Group>
            <Group title={l('Yanıt düğmeleri', 'Answer buttons')} styles={styles}>
                <StepperRow label={l('Yanıt düğmesi boyutu', 'Answer button size')} value={settings.answerButtonScalePercent ?? 100} suffix="%" step={10} min={100} max={175} onChange={(value) => updateSetting('answerButtonScalePercent', value)} styles={styles} />
                <ToggleRow label={l('Büyük yanıt düğmelerini iki satırda göster', 'Show large answer buttons in two rows')} value={Boolean(settings.twoRowAnswerButtons)} onChange={(value) => updateSetting('twoRowAnswerButtons', value)} styles={styles} />
                <StepperRow label={l('Cevabı göster basılı tutma süresi', 'Show answer long-press time')} summary={l('0 ms normal dokunmadır.', '0 ms uses a normal tap.')} value={settings.showAnswerLongPressMs ?? 0} suffix="ms" step={100} min={0} max={2000} onChange={(value) => updateSetting('showAnswerLongPressMs', value)} styles={styles} />
                <StepperRow label={l('Çift dokunma aralığı', 'Double tap time interval')} summary={l('Yanlışlıkla iki kez yanıtlamayı önler.', 'Prevents accidental double answers.')} value={settings.answerDoubleTapMs ?? 200} suffix="ms" step={50} min={0} max={1000} onChange={(value) => updateSetting('answerDoubleTapMs', value)} styles={styles} />
            </Group>
            <Group title={l('Kart tarayıcısı', 'Card browser')} styles={styles}>
                <StepperRow label={l('Yazı ölçeği', 'Font scaling')} value={settings.browserFontScalePercent ?? 100} suffix="%" step={10} min={75} max={175} onChange={(value) => updateSetting('browserFontScalePercent', value)} styles={styles} />
            </Group>
        </>
    );

    const renderData = useCallback(() => (
        <>
            <View style={styles.dataStatusCard}>
                <View style={styles.dataStatusIcon}><Text style={styles.dataStatusIconText}>✓</Text></View>
                <View style={styles.dataStatusCopy}>
                    <Text style={styles.dataStatusTitle}>{l('Bu iPhone’da saklanıyor', 'Stored on this iPhone')}</Text>
                    <Text style={styles.dataStatusText}>{l('Değişiklikleriniz anında kaydedilir.', 'Your changes are saved immediately.')}</Text>
                </View>
                <View style={styles.dataStatusBadge}><Text style={styles.dataStatusBadgeText}>{l('YEREL', 'LOCAL')}</Text></View>
            </View>

            <Group title={l('Yedekleme', 'Backup')} styles={styles}>
                <ToggleRow
                    label={l('Otomatik yedekleme', 'Automatic backup')}
                    summary={l('Haftada bir', 'Weekly')}
                    value={settings.autoBackupEnabled !== false}
                    onChange={(value) => updateSetting('autoBackupEnabled', value)}
                    divider={false}
                    styles={styles}
                />
                <View style={styles.dataRetentionRow}>
                    <Text style={styles.dataRetentionLabel}>{l('Saklama', 'Retention')}</Text>
                    <Text style={styles.dataRetentionValue}>{l('7 yedek + 3 güvenlik kopyası', '7 backups + 3 safety copies')}</Text>
                </View>
                <DataActionRow
                    icon="↻"
                    label={l('Yedekleri yönet', 'Manage backups')}
                    detail={l('Görüntüle veya geri yükle', 'View or restore')}
                    onPress={() => router.push('/backups')}
                    styles={styles}
                />
            </Group>

            <Group title={l('İçe ve dışa aktar', 'Import and export')} styles={styles}>
                <DataActionRow icon="↑" label={l('Verileri dışa aktar', 'Export data')} onPress={handleExport} divider={false} styles={styles} />
                <DataActionRow icon="↓" label={l('Verileri içe aktar', 'Import data')} onPress={handleImport} styles={styles} />
            </Group>

            <Group title={l('Bakım', 'Maintenance')} styles={styles}>
                <DataActionRow
                    icon="✓"
                    label={l('Veritabanını kontrol et', 'Check database')}
                    detail={l('Salt okunur bütünlük denetimi', 'Read-only integrity audit')}
                    onPress={handleCheckDatabase}
                    disabled={maintenanceAction !== null}
                    divider={false}
                    styles={styles}
                />
                <DataActionRow
                    icon="⌁"
                    label={maintenanceAction === 'optimize' ? l('Optimize ediliyor…', 'Optimizing…') : l('Onar ve optimize et', 'Repair and optimize')}
                    detail={l('Yedek alır; veritabanı ve arama indekslerini yeniler', 'Backs up, then refreshes database and search indexes')}
                    onPress={handleOptimizeDatabase}
                    disabled={maintenanceAction !== null}
                    styles={styles}
                />
                <DataActionRow icon="▧" label={l('Medyayı kontrol et', 'Check media')} onPress={() => void handleCheckMedia()} disabled={maintenanceAction !== null} styles={styles} />
                <DataActionRow
                    icon="↺"
                    label={maintenanceAction === 'reset' ? l('Sıfırlanıyor…', 'Resetting…') : l('İlerlemeyi sıfırla', 'Reset progress')}
                    onPress={handleResetProgress}
                    disabled={maintenanceAction !== null}
                    danger
                    styles={styles}
                />
            </Group>
        </>
    ), [handleCheckDatabase, handleCheckMedia, handleExport, handleImport, handleOptimizeDatabase, handleResetProgress, l, maintenanceAction, settings.autoBackupEnabled, styles, updateSetting]);

    const renderAbout = () => (
        <Group title="TusAnkiM" description={l(`Sürüm ${Constants.expoConfig?.version ?? '1.0.0'} • Anki paket desteğine sahip yerel öncelikli kart uygulaması`, `Version ${Constants.expoConfig?.version ?? '1.0.0'} • Local-first flashcard app with Anki package support`)} styles={styles}>
            <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={styles.linkText}>{l('Gizlilik politikası', 'Privacy Policy')}</Text><Text style={styles.linkArrow}>↗</Text></TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(SUPPORT_URL)}><Text style={styles.linkText}>{l('Destek', 'Support')}</Text><Text style={styles.linkArrow}>↗</Text></TouchableOpacity>
        </Group>
    );

    const renderActiveSection = () => {
        switch (activeSection) {
            case 'general': return <GeneralSettingsSection render={renderGeneral} />;
            case 'newStudy': return renderNewStudy();
            case 'reviewing': return <ReviewingSettingsSection render={renderReviewing} />;
            case 'notifications': return renderNotifications();
            case 'controls': return <ControlsSettingsSection render={renderControls} />;
            case 'accessibility': return renderAccessibility();
            case 'data': return <DataManagementSettingsSection render={renderData} />;
            case 'about': return renderAbout();
            default: return null;
        }
    };

    if (loading) {
        return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingIcon}>⚙️</Text></View></SafeAreaView>;
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <SafeAreaView style={styles.container}>
            <View style={styles.screenHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    accessibilityRole="button"
                    accessibilityLabel={activeSection ? l('Ayarlara dön', 'Back to settings') : l('Geri dön', 'Go back')}
                >
                    <Text style={styles.backButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.screenTitle} numberOfLines={1}>
                    {activeCategory?.title ?? l('Ayarlar', 'Settings')}
                </Text>
                {activeSection ? (
                    <TouchableOpacity
                        style={[styles.headerSaveButton, saved && styles.headerSaveButtonSaved]}
                        onPress={handleSaveSettings}
                        accessibilityRole="button"
                        accessibilityLabel={saved ? l('Ayarlar kaydedildi', 'Settings saved') : l('Ayarları kaydet', 'Save settings')}
                    >
                        <Text style={[styles.headerSaveText, saved && styles.headerSaveTextSaved]}>
                            {saved ? `✓ ${l('Kaydedildi', 'Saved')}` : l('Kaydet', 'Save')}
                        </Text>
                    </TouchableOpacity>
                ) : <View style={styles.headerSpacer} />}
            </View>
            <ScrollView
                key={activeSection ?? 'settings-root'}
                ref={sectionScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                automaticallyAdjustKeyboardInsets={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
                {activeSection && activeCategory ? (
                    renderActiveSection()
                ) : (
                    <>
                        <View style={styles.searchBox}>
                            <Text style={styles.searchIcon}>⌕</Text>
                            <TextInput value={search} onChangeText={setSearch} placeholder={l('Ara…', 'Search…')} placeholderTextColor={colors.textMuted} style={styles.searchInput} />
                        </View>
                        <View style={styles.categoryList}>
                            {filteredCategories.map((category, index) => (
                                <TouchableOpacity
                                    key={category.id}
                                    style={[styles.categoryRow, index > 0 && styles.categoryDivider]}
                                    onPress={() => openSection(category.id)}
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
            {controlsHelpVisible ? <Modal
                visible={controlsHelpVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setControlsHelpVisible(false)}
                statusBarTranslucent
            >
                <View style={styles.controlsHelpOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setControlsHelpVisible(false)}
                        accessibilityLabel={l('Kontroller yardımını kapat', 'Close controls help')}
                    />
                    <View style={styles.controlsHelpCard} accessibilityViewIsModal>
                        <View style={styles.controlsHelpHeader}>
                            <View style={styles.controlsHelpHeaderCopy}>
                                <Text style={styles.controlsHelpEyebrow}>{l('ÇALIŞMA KONTROLLERİ', 'REVIEWER CONTROLS')}</Text>
                                <Text style={styles.controlsHelpTitle}>{l('Dokunma ve kaydırmayı özelleştirin', 'Customize taps and swipes')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.controlsHelpClose}
                                onPress={() => setControlsHelpVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Yardımı kapat', 'Close help')}
                            >
                                <Text style={styles.controlsHelpCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.controlsHelpScroll}
                            contentContainerStyle={styles.controlsHelpContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={styles.controlsHelpIntro}>
                                {l(
                                    'Kartın dokuz bölgesini ve dört kaydırma yönünü en sık kullandığınız işlemlere bağlayabilirsiniz. Seçimleriniz yalnızca çalışma ekranında geçerlidir.',
                                    'Connect the card’s nine tap zones and four swipe directions to the actions you use most. Your choices apply only while studying.',
                                )}
                            </Text>

                            <View style={styles.controlsHelpPanel}>
                                <Text style={styles.controlsHelpPanelTitle}>{l('9 noktalı dokunma', '9-point touch')}</Text>
                                <Text style={styles.controlsHelpPanelText}>
                                    {l(
                                        'Soru tarafında varsayılan olarak her bölge yanıtı gösterir. Yanıt tarafında sol sütun Tekrar, orta sütun kapalı, sağ sütun İyi eylemini uygular. Bağlantılar, form alanları ve ses denetimleri kendi dokunmalarını almaya devam eder.',
                                        'On the question side, every zone shows the answer by default. On the answer side, the left column answers Again, the center column is off, and the right column answers Good. Links, form fields, and audio controls continue to receive their own taps.',
                                    )}
                                </Text>
                            </View>

                            <View style={styles.controlsHelpStatus}>
                                <View style={[styles.controlsHelpStatusDot, (settings.gesturesEnabled || settings.ninePointTouchEnabled !== false) && styles.controlsHelpStatusDotEnabled]} />
                                <Text style={styles.controlsHelpStatusText}>
                                    {l(
                                        `9 noktalı dokunma ${settings.ninePointTouchEnabled !== false ? 'açık' : 'kapalı'} · Kaydırma ${settings.gesturesEnabled ? 'açık' : 'kapalı'}`,
                                        `9-point touch ${settings.ninePointTouchEnabled !== false ? 'on' : 'off'} · Swipes ${settings.gesturesEnabled ? 'on' : 'off'}`,
                                    )}
                                </Text>
                            </View>

                            <Text style={styles.controlsHelpSectionTitle}>{l('Şu anki yönleriniz', 'Your current directions')}</Text>
                            <View style={styles.controlsHelpDirectionList}>
                                {([
                                    ['←', l('Sola kaydırma', 'Swipe left'), settings.swipeLeftAction ?? 'tools'],
                                    ['→', l('Sağa kaydırma', 'Swipe right'), settings.swipeRightAction ?? 'decks'],
                                    ['↑', l('Yukarı kaydırma', 'Swipe up'), settings.swipeUpAction ?? 'off'],
                                    ['↓', l('Aşağı kaydırma', 'Swipe down'), settings.swipeDownAction ?? 'off'],
                                ] as Array<[string, string, ReviewGestureAction]>).map(([icon, label, action]) => (
                                    <View key={label} style={styles.controlsHelpDirectionRow}>
                                        <View style={styles.controlsHelpDirectionIcon}>
                                            <Text style={styles.controlsHelpDirectionIconText}>{icon}</Text>
                                        </View>
                                        <View style={styles.controlsHelpDirectionCopy}>
                                            <Text style={styles.controlsHelpDirectionLabel}>{label}</Text>
                                            <Text style={styles.controlsHelpDirectionValue}>{gestureActionLabel(action)}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <View style={styles.controlsHelpPanel}>
                                <Text style={styles.controlsHelpPanelTitle}>{l('Yanıt hareketleri nasıl çalışır?', 'How do answer gestures work?')}</Text>
                                <Text style={styles.controlsHelpPanelText}>
                                    {l(
                                        'Kartın sorusu açıksa bir yanıt eylemi önce cevabı gösterir. Cevap açıkken aynı dokunma veya kaydırma seçtiğiniz Tekrar, Zor, İyi ya da Kolay yanıtını uygular. Böylece görülmemiş bir cevap yanlışlıkla puanlanmaz.',
                                        'When the question is showing, an answer action reveals it first. Once the answer is visible, the same tap or swipe applies your selected Again, Hard, Good, or Easy rating. This prevents an unseen answer from being graded accidentally.',
                                    )}
                                </Text>
                            </View>

                            <View style={styles.controlsHelpPanel}>
                                <Text style={styles.controlsHelpPanelTitle}>{l('Hassasiyet ayarı', 'Sensitivity')}</Text>
                                <Text style={styles.controlsHelpPanelText}>
                                    {l(
                                        `Geçerli değeriniz %${settings.swipeSensitivity ?? 100}. Yüksek değer kısa hareketleri daha kolay algılar; düşük değer daha uzun ve belirgin bir kaydırma ister. Başlangıç için %100 dengeli bir seçimdir.`,
                                        `Your current value is ${settings.swipeSensitivity ?? 100}%. A higher value recognizes shorter movements; a lower value requires a longer, more deliberate swipe. 100% is a balanced starting point.`,
                                    )}
                                </Text>
                            </View>

                            <View style={styles.controlsHelpPanel}>
                                <Text style={styles.controlsHelpPanelTitle}>{l('Hazır düzenler', 'Presets')}</Text>
                                <View style={styles.controlsHelpBulletRow}>
                                    <Text style={styles.controlsHelpBullet}>•</Text>
                                    <Text style={styles.controlsHelpPanelText}><Text style={styles.controlsHelpStrong}>{l('iPhone için dengeli:', 'Balanced for iPhone:')}</Text> {l('sol Araçlar, sağ Desteler; dikey hareketler kapalı.', 'left opens Tools, right returns to Decks; vertical gestures are off.')}</Text>
                                </View>
                                <View style={styles.controlsHelpBulletRow}>
                                    <Text style={styles.controlsHelpBullet}>•</Text>
                                    <Text style={styles.controlsHelpPanelText}><Text style={styles.controlsHelpStrong}>{l('Hızlı yanıt:', 'Fast answers:')}</Text> {l('sol Tekrar, sağ İyi, yukarı Kolay, aşağı Zor.', 'left Again, right Good, up Easy and down Hard.')}</Text>
                                </View>
                            </View>

                            <View style={styles.controlsHelpNotice}>
                                <Text style={styles.controlsHelpNoticeTitle}>{l('Güvenli kullanım', 'Safe operation')}</Text>
                                <Text style={styles.controlsHelpNoticeText}>
                                    {l(
                                        'Kaydırmayı kapatırsanız kart hareketleri normal gezinmeye bırakılır. Yanıt düğmelerini gizlemek için 9 noktalı dokunma veya kaydırmadan en az biri etkin olmalıdır.',
                                        'When swipes are off, card movements are left to normal navigation. Before hiding answer buttons, keep either 9-point touch or swipes enabled.',
                                    )}
                                </Text>
                            </View>
                        </ScrollView>

                        <View style={styles.controlsHelpFooter}>
                            <TouchableOpacity
                                style={styles.controlsHelpDone}
                                onPress={() => setControlsHelpVisible(false)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.controlsHelpDoneText}>{l('Anladım', 'Got it')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal> : null}
            {gesturePickerTarget !== null ? <Modal
                visible={gesturePickerTarget !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setGesturePickerTarget(null)}
            >
                <View style={styles.themeModalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setGesturePickerTarget(null)} />
                    <View style={[styles.themeModalCard, styles.gesturePickerCard]} accessibilityViewIsModal>
                        <View style={styles.gesturePickerHeader}>
                            <Text style={styles.themeModalTitle}>
                                {gesturePickerTarget?.kind === 'tap'
                                    ? l('Dokunma eylemi', 'Tap action')
                                    : l('Kaydırma eylemi', 'Swipe action')}
                            </Text>
                            <TouchableOpacity
                                style={styles.gesturePickerClose}
                                onPress={() => setGesturePickerTarget(null)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Eylem seçiciyi kapat', 'Close action picker')}
                            >
                                <Text style={styles.gesturePickerCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {gestureActionOptions.map((option) => {
                                let selected = false;
                                if (gesturePickerTarget?.kind === 'swipe') {
                                    selected = (settings[gesturePickerTarget.field] ?? 'off') === option.value;
                                } else if (gesturePickerTarget?.kind === 'tap') {
                                    const actions = gesturePickerTarget.side === 'question'
                                        ? settings.questionTapActions ?? DEFAULT_QUESTION_TAP_ACTIONS
                                        : settings.answerTapActions ?? DEFAULT_ANSWER_TAP_ACTIONS;
                                    selected = actions[gesturePickerTarget.zone] === option.value;
                                }
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        style={[styles.themeModalOption, selected && styles.themeModalOptionActive]}
                                        onPress={() => {
                                            if (gesturePickerTarget?.kind === 'swipe') {
                                                updateSetting(gesturePickerTarget.field, option.value);
                                            } else if (gesturePickerTarget?.kind === 'tap') {
                                                const field = gesturePickerTarget.side === 'question'
                                                    ? 'questionTapActions'
                                                    : 'answerTapActions';
                                                const fallback = gesturePickerTarget.side === 'question'
                                                    ? DEFAULT_QUESTION_TAP_ACTIONS
                                                    : DEFAULT_ANSWER_TAP_ACTIONS;
                                                updateSetting(field, {
                                                    ...(settings[field] ?? fallback),
                                                    [gesturePickerTarget.zone]: option.value,
                                                });
                                            }
                                            setGesturePickerTarget(null);
                                        }}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: selected }}
                                    >
                                        <Text style={[styles.themeModalOptionText, selected && styles.themeModalOptionTextActive]}>{option.label}</Text>
                                        {selected ? <Text style={styles.themeModalCheck}>✓</Text> : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal> : null}
            {notificationThresholdPickerVisible ? <Modal
                visible={notificationThresholdPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setNotificationThresholdPickerVisible(false)}
            >
                <View style={styles.themeModalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotificationThresholdPickerVisible(false)} />
                    <View style={[styles.themeModalCard, styles.gesturePickerCard]} accessibilityViewIsModal>
                        <View style={styles.gesturePickerHeader}>
                            <Text style={styles.themeModalTitle}>{l('Şu durumda bildir', 'Notify when')}</Text>
                            <TouchableOpacity
                                style={styles.gesturePickerClose}
                                onPress={() => setNotificationThresholdPickerVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Bildirim koşulu seçicisini kapat', 'Close notification condition picker')}
                            >
                                <Text style={styles.gesturePickerCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {notificationThresholdOptions.map((option) => {
                                const selected = option.value === null
                                    ? !settings.studyNotificationsEnabled
                                    : settings.studyNotificationsEnabled
                                        && normalizeStudyNotificationThreshold(settings.studyNotificationThreshold) === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value ?? 'never'}
                                        style={[styles.themeModalOption, selected && styles.themeModalOptionActive]}
                                        onPress={() => { void handleStudyNotificationPolicySelect(option.value); }}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: selected }}
                                    >
                                        <Text style={[styles.themeModalOptionText, selected && styles.themeModalOptionTextActive]}>{option.label}</Text>
                                        {selected ? <Text style={styles.themeModalCheck}>✓</Text> : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal> : null}
        </SafeAreaView>
        </TouchableWithoutFeedback>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        loadingIcon: { fontSize: 48 },
        screenHeader: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        screenTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        headerSpacer: { width: 72 },
        headerSaveButton: { minWidth: 78, minHeight: 40, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
        headerSaveButtonSaved: { backgroundColor: colors.btnGoodBg, borderWidth: 1, borderColor: colors.btnGood },
        headerSaveText: { fontSize: FontSize.sm, fontWeight: '800', color: colors.white },
        headerSaveTextSaved: { color: colors.btnGood },
        scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },
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
        backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        backButtonText: { fontSize: 40, lineHeight: 42, color: colors.accent, fontWeight: '300' },
        group: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, ...Shadows.sm },
        groupTitleRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
        groupTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
        groupHelpButton: { width: 32, height: 32, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        groupHelpText: { fontSize: FontSize.md, color: colors.accent, fontWeight: '900' },
        groupDescription: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 19, marginBottom: Spacing.sm },
        controlsHelpOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, backgroundColor: 'rgba(9, 20, 17, 0.56)' },
        controlsHelpCard: { width: '100%', maxWidth: 540, maxHeight: '86%', overflow: 'hidden', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, ...Shadows.lg },
        controlsHelpHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.lg, paddingBottom: Spacing.md, backgroundColor: colors.accentLight, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        controlsHelpHeaderCopy: { flex: 1, minWidth: 0, paddingRight: Spacing.sm },
        controlsHelpEyebrow: { marginBottom: 5, fontSize: 10, lineHeight: 14, letterSpacing: 1.2, fontWeight: '900', color: colors.accent },
        controlsHelpTitle: { fontSize: FontSize.xl, lineHeight: 26, fontWeight: '800', color: colors.textPrimary },
        controlsHelpClose: { width: 40, height: 40, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
        controlsHelpCloseText: { fontSize: 29, lineHeight: 31, fontWeight: '300', color: colors.textSecondary },
        controlsHelpScroll: { flexShrink: 1 },
        controlsHelpContent: { padding: Spacing.lg, gap: Spacing.md },
        controlsHelpIntro: { fontSize: FontSize.md, lineHeight: 22, color: colors.textSecondary },
        controlsHelpStatus: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.bgSecondary },
        controlsHelpStatusDot: { width: 10, height: 10, marginRight: Spacing.sm, borderRadius: 5, backgroundColor: colors.textMuted },
        controlsHelpStatusDotEnabled: { backgroundColor: colors.btnGood },
        controlsHelpStatusText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19, fontWeight: '700', color: colors.textPrimary },
        controlsHelpSectionTitle: { marginTop: Spacing.xs, fontSize: FontSize.md, lineHeight: 21, fontWeight: '800', color: colors.textPrimary },
        controlsHelpDirectionList: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, backgroundColor: colors.bgSecondary },
        controlsHelpDirectionRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
        controlsHelpDirectionIcon: { width: 34, height: 34, marginRight: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        controlsHelpDirectionIconText: { fontSize: FontSize.lg, lineHeight: 22, fontWeight: '900', color: colors.accent },
        controlsHelpDirectionCopy: { flex: 1, paddingVertical: Spacing.sm },
        controlsHelpDirectionLabel: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: '700', color: colors.textPrimary },
        controlsHelpDirectionValue: { marginTop: 2, fontSize: FontSize.sm, lineHeight: 18, color: colors.accent },
        controlsHelpPanel: { padding: Spacing.md, borderWidth: 1, borderColor: colors.borderLight, borderRadius: BorderRadius.md, backgroundColor: colors.bgCard },
        controlsHelpPanelTitle: { marginBottom: 5, fontSize: FontSize.md, lineHeight: 21, fontWeight: '800', color: colors.textPrimary },
        controlsHelpPanelText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20, color: colors.textSecondary },
        controlsHelpBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.xs },
        controlsHelpBullet: { width: 18, fontSize: FontSize.md, lineHeight: 20, fontWeight: '900', color: colors.accent },
        controlsHelpStrong: { fontWeight: '800', color: colors.textPrimary },
        controlsHelpNotice: { padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.accentLight },
        controlsHelpNoticeTitle: { marginBottom: 4, fontSize: FontSize.sm, lineHeight: 19, fontWeight: '900', color: colors.accent },
        controlsHelpNoticeText: { fontSize: FontSize.sm, lineHeight: 20, color: colors.textSecondary },
        controlsHelpFooter: { padding: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgCard },
        controlsHelpDone: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, backgroundColor: colors.accent },
        controlsHelpDoneText: { fontSize: FontSize.md, fontWeight: '800', color: colors.white },
        dataStatusCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.lg, backgroundColor: colors.bgCard, ...Shadows.sm },
        dataStatusIcon: { width: 42, height: 42, marginRight: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        dataStatusIconText: { fontSize: FontSize.lg, fontWeight: '900', color: colors.accent },
        dataStatusCopy: { flex: 1, minWidth: 0 },
        dataStatusTitle: { fontSize: FontSize.md, lineHeight: 20, fontWeight: '800', color: colors.textPrimary },
        dataStatusText: { marginTop: 3, fontSize: FontSize.sm, lineHeight: 18, color: colors.textMuted },
        dataStatusBadge: { minHeight: 26, marginLeft: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        dataStatusBadgeText: { fontSize: 10, letterSpacing: 0.7, fontWeight: '900', color: colors.accent },
        dataRetentionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        dataRetentionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        dataRetentionValue: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: colors.textMuted, textAlign: 'right' },
        dataActionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        dataActionRowNoDivider: { borderTopWidth: 0 },
        dataActionIcon: { width: 36, height: 36, marginRight: Spacing.md, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        dataActionIconDanger: { backgroundColor: colors.btnAgainBg },
        dataActionIconText: { fontSize: FontSize.lg, lineHeight: 22, fontWeight: '800', color: colors.accent },
        dataActionIconTextDanger: { color: colors.btnAgain },
        dataActionCopy: { flex: 1, paddingVertical: Spacing.sm },
        dataActionLabel: { fontSize: FontSize.md, lineHeight: 20, fontWeight: '700', color: colors.textPrimary },
        dataActionDetail: { marginTop: 2, fontSize: FontSize.sm, lineHeight: 18, color: colors.textMuted },
        dataActionArrow: { paddingLeft: Spacing.sm, fontSize: 27, lineHeight: 29, fontWeight: '300', color: colors.textMuted },
        preferenceRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.sm },
        preferenceRowNoDivider: { borderTopWidth: 0 },
        preferenceCopy: { flex: 1, paddingRight: Spacing.md },
        preferenceBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.md },
        preferenceLabel: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
        preferenceSummary: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 18, marginTop: 3 },
        appearanceValueArrow: { fontSize: 26, color: colors.textMuted, paddingLeft: Spacing.sm },
        themeChoiceRow: { flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
        themeChoiceButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
        themeChoiceButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        themeChoiceText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textSecondary },
        themeChoiceTextActive: { color: colors.accent, fontWeight: '800' },
        choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
        choiceButton: { minHeight: 42, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary },
        choiceButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        choiceText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        choiceTextActive: { color: colors.accent, fontWeight: '800' },
        gesturePresetBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
        tapMappingBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingBottom: Spacing.md },
        tapGrid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, backgroundColor: colors.bgSecondary },
        tapGridCell: { width: '33.3333%', minHeight: 78, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: Spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
        tapGridZone: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.textSecondary, textAlign: 'center' },
        tapGridAction: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.accent, textAlign: 'center' },
        gestureActionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingVertical: Spacing.sm },
        gestureDirectionIcon: { width: 38, height: 38, marginRight: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        gestureDirectionText: { fontSize: FontSize.xl, color: colors.accent, fontWeight: '800' },
        gestureActionValue: { marginTop: 2, fontSize: FontSize.sm, lineHeight: 18, color: colors.accent, fontWeight: '700' },
        stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
        stepButton: { width: 48, height: 44, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },
        stepButtonText: { fontSize: FontSize.xl, color: colors.textPrimary, fontWeight: '700' },
        stepValueInput: { flex: 1, maxWidth: 148 },
        swipeSensitivityBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
        swipeSensitivityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
        swipeSensitivityValue: { fontSize: FontSize.sm, fontWeight: '800', color: colors.accent },
        swipeSliderTouchTarget: { height: 46, justifyContent: 'center', marginTop: Spacing.sm, paddingHorizontal: 10 },
        swipeSliderTrack: { height: 6, borderRadius: BorderRadius.full, backgroundColor: colors.border, overflow: 'visible' },
        swipeSliderFill: { height: 6, borderRadius: BorderRadius.full, backgroundColor: colors.accent },
        swipeSliderThumb: { position: 'absolute', top: -7, width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 2, borderColor: colors.bgCard, backgroundColor: colors.accent, ...Shadows.sm },
        notificationTimeRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: Spacing.sm, gap: Spacing.xs },
        notificationPlatformNote: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
        timeSeparator: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },
        outlineButton: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSecondary },
        outlineButtonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        themeModalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, backgroundColor: 'rgba(0,0,0,0.42)' },
        themeModalCard: { width: '100%', maxWidth: 420, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, padding: Spacing.lg, ...Shadows.lg },
        themeModalTitle: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: Spacing.sm },
        themeModalOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        themeModalOptionActive: { backgroundColor: colors.accentLight },
        themeModalOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        themeModalOptionTextActive: { color: colors.accent, fontWeight: '800' },
        themeModalCheck: { fontSize: FontSize.lg, color: colors.accent, fontWeight: '900' },
        gesturePickerCard: { maxHeight: '82%', paddingBottom: Spacing.sm },
        gesturePickerHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
        gesturePickerClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
        gesturePickerCloseText: { fontSize: 30, lineHeight: 32, color: colors.textMuted, fontWeight: '300' },
        actionButton: { minHeight: 48, marginTop: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
        actionButtonText: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' },
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
