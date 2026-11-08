import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    TouchableWithoutFeedback,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text, useLayoutTextScale } from '../components/AppText';
import { createSettingsStyles as createStyles } from '../components/settings/settingsStyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useThemeColors } from '../constants/theme';
import {
    DEFAULT_SETTINGS,
    defaultSettingsKeepingDeckOptions,
    loadSettings,
    saveSettingsDurably,
} from '../lib/storage';
import { normalizeBackupPolicy } from '../lib/backupPolicy';
import { rebaseSettingsDraft } from '../lib/settingsDraft';
import { searchSettingsCategories } from '../lib/settingsSearch';
import { turkishAblative } from '../lib/turkishSuffix';
import KeyboardSettingsSection from '../components/settings/KeyboardSettingsSection';
import TextSizeSlider from '../components/settings/TextSizeSlider';
import { settingsCategories, type SettingsSectionId } from '../components/settings/settingsCategories';
import {
    checkDatabase,
    repairChangedRows,
    repairableDefectCount,
    totalDefectCount,
    type DatabaseCheckResult,
    type DatabaseOptimizeResult,
    type MaintenanceStep,
} from '../lib/maintenance';
import { MaintenanceWorkflowError, optimizeDatabaseWithBackup } from '../lib/maintenanceWorkflow';
import { alert, confirm, confirmAsync } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { useAppSettingsActions, useCatalogStatus, useCollectionInvalidation } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import type {
    AppLanguage,
    AppSettings,
    KeyBindings,
    ReviewGestureAction,
    ReviewTapZone,
    StudyNotificationThreshold,
} from '../lib/types';
import BoundedIntegerInput, { type BoundedIntegerInputHandle } from '../components/BoundedIntegerInput';
import GearGlyph from '../components/GearGlyph';
import CardsGlyph from '../components/CardsGlyph';
import BrainGlyph from '../components/BrainGlyph';
import BellGlyph from '../components/BellGlyph';
import HandTapGlyph from '../components/HandTapGlyph';
import AccessibilityGlyph from '../components/AccessibilityGlyph';
import ArchiveBoxGlyph from '../components/ArchiveBoxGlyph';
import InfoCircleGlyph from '../components/InfoCircleGlyph';
import ScreenHeader from '../components/ScreenHeader';
import { Button, HelpButton } from '../components/ui/Button';
import { Card, Divider, SectionLabel } from '../components/ui/Card';
import { SegmentedControl, SelectedMark } from '../components/ui/Choice';
import { AppDialog } from '../components/ui/Dialog';
import { EmptyState, LoadingState, Notice } from '../components/ui/Feedback';
import { SearchField } from '../components/ui/Fields';
import { ListRow, SelectRow, SwitchRow, ValueRow } from '../components/ui/Rows';
import { Stepper } from '../components/ui/Stepper';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ExternalLinkIcon, RefreshIcon } from '../components/ui/icons';
import {
    disableStudyNotifications,
    requestStudyNotificationPermission,
    studyNotificationsSupported,
} from '../lib/studyNotifications';
import {
    normalizeStudyNotificationThreshold,
    STUDY_NOTIFICATION_THRESHOLDS,
} from '../lib/studyNotificationPolicy';
import { DATA_EXPORT_ROUTE, DATA_IMPORT_ROUTE } from '../lib/dataManagementRoutes';
import { resetAllDataWithBackup, ResetWorkflowError } from '../lib/resetWorkflow';
import { BackupNotRestorableError } from '../lib/backup';
import { hasSnapshotChanged, stableSnapshot } from '../lib/dirtyState';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

import {
    canGradeRevealedCard,
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    matchingSwipePreset,
    normalizeSwipeSensitivity,
    REVIEW_TAP_ZONES,
    SWIPE_PRESETS,
    type SwipePresetId,
} from '../lib/reviewerTouchControls';

type SectionId = SettingsSectionId;

function CategoryGlyph({ id, color }: { id: SectionId; color: string }) {
    switch (id) {
        case 'general':
            return <GearGlyph color={color} size={22} />;
        case 'newStudy':
            return <CardsGlyph color={color} size={22} />;
        case 'reviewing':
            return <BrainGlyph color={color} size={22} />;
        case 'notifications':
            return <BellGlyph color={color} size={22} />;
        case 'controls':
            return <HandTapGlyph color={color} size={22} />;
        case 'accessibility':
            return <AccessibilityGlyph color={color} size={22} />;
        case 'data':
            return <ArchiveBoxGlyph color={color} size={22} />;
        case 'about':
            return <InfoCircleGlyph color={color} size={22} />;
        default:
            return <GearGlyph color={color} size={22} />;
    }
}

const PRIVACY_URL = 'https://bugraguclu.github.io/tus-flashcard-app/privacy.html';
const SUPPORT_URL = 'https://bugraguclu.github.io/tus-flashcard-app/support.html';

type GestureSettingKey = 'swipeLeftAction' | 'swipeRightAction' | 'swipeUpAction' | 'swipeDownAction';
type SwipeDirection = 'left' | 'right' | 'up' | 'down';
type TapSide = 'question' | 'answer';
/** Shown as the swipe preset while the directions match neither preset; no segment is chosen. */
const CUSTOM_SWIPE_LAYOUT = 'custom';
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

function settingsMatch(actual: AppSettings, expected: AppSettings): boolean {
    return stableSnapshot(actual) === stableSnapshot(expected);
}

type SettingsStyles = ReturnType<typeof createStyles>;

/** A setting with a few short options: its label and summary over a segmented control. */
function ChoiceRow<T extends string>({ label, summary, value, options, onChange, styles }: {
    label: string;
    summary?: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (value: T) => void;
    styles: SettingsStyles;
}) {
    return (
        <View style={styles.block}>
            <View style={styles.blockCopy}>
                <Text style={styles.label}>{label}</Text>
                {summary ? <Text style={styles.summary}>{summary}</Text> : null}
            </View>
            <SegmentedControl fill options={options} value={value} onChange={onChange} accessibilityLabel={label} />
        </View>
    );
}

function StepperRow({ label, summary, value, suffix, minimumDigits, step, min, max, wrap = false, inline = false, onChange, styles }: {
    label: string;
    summary?: string;
    value: number;
    suffix?: string;
    minimumDigits?: number;
    step: number;
    min: number;
    max: number;
    wrap?: boolean;
    inline?: boolean;
    onChange: (value: number) => void;
    styles: SettingsStyles;
}) {
    const { l } = useI18n();
    const { width } = useWindowDimensions();
    const summaryBelow = inline && width < 480;
    const inputRef = useRef<BoundedIntegerInputHandle>(null);

    return (
        <View style={styles.block}>
            <View style={inline ? styles.inlineStepperLayout : styles.stackedStepperLayout}>
                <View style={inline ? styles.inlineStepperCopy : styles.blockCopy}>
                    <Text style={styles.label}>{label}</Text>
                    {summary && !summaryBelow ? <Text style={styles.summary}>{summary}</Text> : null}
                </View>
                <Stepper
                    onDecrement={() => inputRef.current?.stepBy(-step)}
                    onIncrement={() => inputRef.current?.stepBy(step)}
                    decrementLabel={`${label} ${l('azalt', 'decrease')}`}
                    incrementLabel={`${label} ${l('artır', 'increase')}`}
                    style={inline ? styles.inlineStepper : undefined}
                >
                    <BoundedIntegerInput
                        ref={inputRef}
                        bare
                        value={value}
                        min={min}
                        max={max}
                        wrap={wrap}
                        suffix={suffix}
                        minimumDigits={minimumDigits}
                        onChange={onChange}
                        accessibilityLabel={label}
                    />
                </Stepper>
            </View>
            {summary && summaryBelow ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>
    );
}

/** The direction of a swipe, for its row. */
function SwipeDirectionIcon({ direction, color, styles }: { direction: SwipeDirection; color: string; styles: SettingsStyles }) {
    if (direction === 'up') return <ArrowUpIcon color={color} size={22} />;
    if (direction === 'down') return <ArrowDownIcon color={color} size={22} />;
    return (
        <View style={direction === 'left' ? styles.turnLeft : styles.turnRight}>
            <ArrowUpIcon color={color} size={22} />
        </View>
    );
}

/** ↺, for putting something back the way it was. */
function RestoreIcon({ color, size = 22, styles }: { color: string; size?: number; styles: SettingsStyles }) {
    return (
        <View style={styles.mirrored}>
            <RefreshIcon color={color} size={size} />
        </View>
    );
}

/**
 * One choice of a picker dialog; the chosen one ends in the tick. The kit has no single-choice
 * row, so this one keeps the radio semantics VoiceOver reads the choice with.
 */
function PickerOption({ label, selected, onPress, styles }: {
    label: string;
    selected: boolean;
    onPress: () => void;
    styles: SettingsStyles;
}) {
    return (
        <TouchableOpacity
            style={styles.pickerOption}
            onPress={onPress}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
        >
            <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected]}>{label}</Text>
            <SelectedMark visible={selected} />
        </TouchableOpacity>
    );
}

function SwipeSensitivitySlider({ value, onChange, label, summary, styles }: {
    value: number;
    onChange: (value: number) => void;
    label: string;
    summary: string;
    styles: SettingsStyles;
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
        <View style={styles.block}>
            <View style={styles.blockCopy}>
                <View style={styles.swipeSensitivityHeader}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.swipeSensitivityValue}>{draft}%</Text>
                </View>
                <Text style={styles.summary}>{summary}</Text>
            </View>
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
                    style={[styles.swipeSliderTrack, { pointerEvents: 'none' }]}
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
    const { refreshSettings: refreshData, previewSettings } = useAppSettingsActions();
    const { invalidateCollection, markSchedulingStale } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const textScale = useLayoutTextScale();
    const { width } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors, textScale, width), [colors, textScale, width]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionId | null>(null);
    const [search, setSearch] = useState('');
    const [controlsHelpVisible, setControlsHelpVisible] = useState(false);
    const [gesturePickerTarget, setGesturePickerTarget] = useState<GesturePickerTarget | null>(null);
    const [tapSide, setTapSide] = useState<TapSide>('question');
    const [notificationThresholdPickerVisible, setNotificationThresholdPickerVisible] = useState(false);
    const [maintenanceAction, setMaintenanceAction] = useState<'optimize' | 'reset' | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveFailedRef = useRef(false);
    const sectionScrollRef = useRef<ScrollView>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    // The stored settings the draft started from; savedSnapshot is the same value serialized.
    const baselineRef = useRef<AppSettings | null>(null);

    const markSaved = useCallback((persisted: AppSettings) => {
        baselineRef.current = persisted;
        setSavedSnapshot(stableSnapshot(persisted));
    }, []);

    const isDirty = hasSnapshotChanged(savedSnapshot, settings);
    // The confirmation lingers briefly after a save, but an edit made meanwhile is not saved.
    const showSaved = saved && !isDirty;
    useUnsavedChangesGuard(isDirty, {
        title: l('Kaydedilmemiş değişiklikler', 'Unsaved changes'),
        message: l(
            'Ayarlarınız kaydedilmedi. Çıkarsanız değişiklikler kaybolacak.',
            'Your settings have not been saved. They will be lost if you leave.',
        ),
    });

    const gestureActionOptions = useMemo<Array<{ value: ReviewGestureAction; label: string }>>(() => [
        { value: 'off', label: l('Eylem yok', 'No action') },
        { value: 'showAnswer', label: l('Cevabı göster', 'Show answer') },
        { value: 'again', label: l('Yanıtla: Tekrar', 'Answer: Again') },
        { value: 'hard', label: l('Yanıtla: Zor', 'Answer: Hard') },
        { value: 'good', label: l('Yanıtla: İyi', 'Answer: Good') },
        { value: 'easy', label: l('Yanıtla: Kolay', 'Answer: Easy') },
        { value: 'undo', label: l('Son işlemi geri al', 'Undo last action') },
        { value: 'addNote', label: l('Not ekle', 'Add note') },
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
            // Only review cards are counted, so the wording says reviews, not cards.
            .map((threshold) => ({
                value: threshold,
                label: l(
                    `${threshold}${turkishAblative(threshold)} fazla tekrar kartının zamanı geldiyse`,
                    `More than ${threshold} reviews are due`,
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
        const loaded = loadSettings();
        setSettings(loaded);
        markSaved(loaded);
        setLoading(false);
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, [markSaved]);

    // Backups (restore) and Import (a collection package) open over Settings and rewrite the
    // settings rows. When Settings is shown again its draft moves onto them, keeping only the
    // learner's own edits, so a later Save cannot write the old values back.
    useFocusEffect(useCallback(() => {
        const baseline = baselineRef.current;
        if (!baseline) return;
        const latest = loadSettings();
        if (settingsMatch(latest, baseline)) return;
        setSettings((draft) => rebaseSettingsDraft(baseline, draft, latest));
        markSaved(latest);
    }, [markSaved]));

    // Keep the whole app in sync with the draft, while device storage remains untouched until Save.
    useEffect(() => {
        if (!loading) previewSettings(settings);
    }, [loading, previewSettings, settings]);

    // A discarded draft must not remain active in screens that stay mounted behind Settings.
    useEffect(() => () => refreshData(), [refreshData]);

    const showSavedState = useCallback(() => {
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 1400);
    }, []);

    const updateSettings = useCallback((patch: Partial<AppSettings>) => {
        setSettings((prev) => ({ ...prev, ...patch }));
    }, []);

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleKeyBindingsChange = useCallback((bindings: KeyBindings) => {
        updateSetting('keyBindings', bindings);
    }, [updateSetting]);

    const openSection = useCallback((section: SectionId) => {
        Keyboard.dismiss();
        setActiveSection(section);
    }, []);

    useEffect(() => {
        if (!activeSection) return;
        sectionScrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [activeSection]);

    // iOS 26 makes a rightward drag anywhere on a screen a back swipe, and decides so as the
    // finger lands, before a slider here can claim it. Pages with a slider (text size,
    // swipe sensitivity) keep only the edge swipe; every other page gets the platform default.
    const navigation = useNavigation();
    const pageHasSlider = activeSection === 'general' || activeSection === 'controls';
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        navigation.setOptions({ fullScreenGestureEnabled: pageHasSlider ? false : undefined });
    }, [navigation, pageHasSlider]);

    const handleSaveSettings = useCallback(async () => {
        if (saving) return;
        Keyboard.dismiss();
        let current = settingsRef.current;
        setSaving(true);
        // A tap zone or swipe direction set to another action can leave a hidden answer bar with
        // nothing that grades; Controls warns about it, and Save never stores it.
        if (!canGradeRevealedCard(current)) {
            const showButtons = await confirmAsync(
                l('Kartları yanıtlamanın bir yolu kalmadı', 'No way left to answer cards'),
                l(
                    'Yanıt düğmeleri gizli ve etkin hiçbir dokunma bölgesi veya kaydırma yönü Tekrar, Zor, İyi ya da Kolay uygulamıyor. Yanıt düğmeleri geri açılarak kaydedilsin mi?',
                    'The answer buttons are hidden and no enabled tap zone or swipe direction answers Again, Hard, Good, or Easy. Save with the answer buttons shown again?',
                ),
                { confirmLabel: l('Düğmeleri aç ve kaydet', 'Show buttons and save') },
            );
            if (!showButtons) {
                setSaving(false);
                return;
            }
            current = { ...current, showAnswerButtons: true };
            setSettings((draft) => ({ ...draft, showAnswerButtons: true }));
        }
        const baseline = baselineRef.current ?? current;
        // Fields this draft did not touch are taken as stored now, not as they were when it opened.
        const result = await saveSettingsDurably(rebaseSettingsDraft(baseline, current, loadSettings()));
        setSaving(false);
        const persisted = loadSettings();
        if (!result.ok || !settingsMatch(persisted, result.settings)) {
            lastSaveFailedRef.current = true;
            setSaved(false);
            alert(
                l('Ayarlar kaydedilemedi', 'Settings Not Saved'),
                l('Değişiklik cihaz depolamasına kaydedilemedi. Lütfen yeniden deneyin.', 'The change could not be saved to device storage. Please try again.'),
            );
            return;
        }
        // Preserve edits made while the durable write was pending.
        setSettings((draft) => {
            const next = rebaseSettingsDraft(current, draft, persisted);
            return settingsMatch(draft, next) ? draft : next;
        });
        markSaved(persisted);
        refreshData();
        lastSaveFailedRef.current = false;

        if (
            baseline.dayRolloverHour !== persisted.dayRolloverHour
            || baseline.learnAheadMinutes !== persisted.learnAheadMinutes
        ) {
            markSchedulingStale();
        }

        showSavedState();
    }, [l, markSaved, markSchedulingStale, refreshData, saving, showSavedState]);

    const handleStudyNotificationsToggle = async (
        enabled: boolean,
        threshold: StudyNotificationThreshold = normalizeStudyNotificationThreshold(settings.studyNotificationThreshold),
    ) => {
        if (!studyNotificationsSupported()) {
            alert(
                l('Bildirimler desteklenmiyor', 'Notifications not supported'),
                Platform.OS === 'web'
                    ? l('Bu tarayıcı site bildirimlerini desteklemiyor.', 'This browser does not support site notifications.')
                    : l('Bu ayar AnkiMobile uyumlu iOS bildirimleri içindir.', 'This setting controls AnkiMobile-compatible iOS notifications.'),
            );
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
                if (Platform.OS === 'web') {
                    // A page cannot open the browser's settings; it can only say where they are.
                    alert(
                        l('Bildirim izni gerekli', 'Notification permission required'),
                        l(
                            'Günlük çalışma hatırlatması için tarayıcınızın site ayarlarından bu siteye bildirim izni verin.',
                            'Allow notifications for this site in your browser’s site settings to enable the daily study reminder.',
                        ),
                    );
                    return;
                }
                await promptPermissionSettings({
                    title: l('Bildirim izni gerekli', 'Notification permission required'),
                    message: l(
                        'Günlük çalışma hatırlatmasını açmak için iOS Ayarları’nda bildirimlere izin verin.',
                        'Allow notifications in iOS Settings to enable the daily study reminder.',
                    ),
                    settingsLabel: l('Ayarları Aç', 'Open Settings'),
                    cancelLabel: t('common.cancel'),
                });
                return;
            }
            updateSettings({
                studyNotificationsEnabled: true,
                studyNotificationThreshold: threshold,
            });
        } catch (error) {
            console.warn('[Settings] notification permission failed:', error);
            await promptPermissionSettings({
                title: l('Bildirim açılamadı', 'Could not enable notifications'),
                message: l(
                    'Bildirim izni alınamadı. Lütfen iOS Ayarları’nı kontrol edin.',
                    'Notification permission could not be obtained. Check iOS Settings.',
                ),
                settingsLabel: l('Ayarları Aç', 'Open Settings'),
                cancelLabel: t('common.cancel'),
            });
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

    const categories = useMemo(() => settingsCategories(l), [l]);

    const activeCategory = categories.find((item) => item.id === activeSection) ?? null;
    const searchResults = useMemo(() => searchSettingsCategories(categories, search), [categories, search]);

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

    /** One line per defect, shared by the audit report and the repair preview so they agree. */
    const describeFindings = useCallback((result: DatabaseCheckResult) => [
        `${l('Sahipsiz kart', 'Orphaned cards')}: ${result.orphanCards}`,
        `${l('Kartsız not', 'Notes without cards')}: ${result.orphanNotes}`,
        `${l('Destesi kayıp kart', 'Cards with a missing deck')}: ${result.strandedCards}`,
        `${l('Filtre artığı kalan kart', 'Cards left with filtered-deck state')}: ${result.filteredLeftoverCards}`,
        `${l('Geçersiz aralıklı kart', 'Cards with an invalid interval')}: ${result.invalidIntervalCards}`,
        `${l('Sırası taşmış yeni kart', 'New cards with an out-of-range position')}: ${result.highPositionNewCards}`,
        `${l('Geçersiz tarihli kart', 'Cards with an invalid due date')}: ${result.invalidDueCards}`,
        `${l('Geçersiz şablon sıralı kart', 'Cards with an invalid template ordinal')}: ${result.invalidOrdinalCards}`,
        `${l('Artık ön-filtre tarihi taşıyan kart', 'Cards keeping a stale pre-filter due')}: ${result.orphanedOriginalDueCards}`,
        `${l('Son tekrar zamanı hatalı kart', 'Cards with a wrong last review time')}: ${result.lastReviewTimeCards}`,
        `${l('Okunamayan not', 'Unreadable notes')}: ${result.unreadableNotes}`,
    ], [l]);

    const handleCheckDatabase = useCallback(() => {
        try {
            const result = checkDatabase();
            const integrityMessage = result.integrity === 'ok'
                ? l('Bütünlük: tamam', 'Integrity: OK')
                : result.integrity === 'check_failed'
                    ? l('Bütünlük kontrolü tamamlanamadı', 'Integrity check could not be completed')
                    : l('Bütünlük sorunu algılandı', 'An integrity issue was detected');

            const hints: string[] = [];
            if (repairableDefectCount(result) > 0) {
                hints.push(l(
                    '“Onar ve optimize et” bu satırları düzeltebilir.',
                    '“Repair and optimize” can fix these rows.',
                ));
            }
            if (result.unreadableNotes > 0) {
                hints.push(l(
                    'Okunamayan notlar otomatik onarılamaz: metinleri yalnızca bir yedekten geri gelebilir.',
                    'Unreadable notes cannot be repaired automatically: their text can only come back from a backup.',
                ));
            }
            if (totalDefectCount(result) === 0) {
                hints.push(l('Onarılacak bir şey yok.', 'Nothing needs repair.'));
            }

            alert(
                l('Veritabanını kontrol et', 'Check Database'),
                [integrityMessage, ...describeFindings(result), '', ...hints].join('\n'),
            );
        } catch (error) {
            console.warn('[Settings] database check failed:', error);
            alert(l('Hata', 'Error'), l('Veritabanı kontrol edilemedi.', 'Database check failed.'));
        }
    }, [describeFindings, l]);

    const stepLabel = useCallback((step: MaintenanceStep) => ({
        repair: l('onarım', 'repair'),
        reindex: l('indeks yenileme', 'reindex'),
        analyze: l('istatistik güncelleme', 'analyze'),
        search: l('arama dizini', 'search index'),
        compact: l('sıkıştırma', 'compaction'),
    }[step]), [l]);

    /** What the run actually did, line by line — never a fixed sentence that outlives the facts. */
    const describeOptimizeResult = useCallback((
        result: DatabaseOptimizeResult,
        backupFileName: string,
        backupRestorable: boolean,
    ) => {
        const { repair } = result;
        const lines: string[] = [];

        if (repair.orphanCardsDeleted > 0) {
            lines.push(l(`${repair.orphanCardsDeleted} sahipsiz kart silindi.`, `Deleted ${repair.orphanCardsDeleted} orphaned cards.`));
        }
        if (repair.orphanNotesDeleted > 0) {
            lines.push(l(`${repair.orphanNotesDeleted} kartsız not silindi.`, `Deleted ${repair.orphanNotesDeleted} notes that had no cards.`));
        }
        if (repair.orphanNotesRecovered > 0) {
            lines.push(repair.recoveryDeckName
                ? l(
                    `${repair.orphanNotesRecovered} kartsız notun ilk kartı yeniden oluşturuldu; kartlar “${repair.recoveryDeckName}” destesinde.`,
                    `Recreated the first card of ${repair.orphanNotesRecovered} notes that had no cards; the cards are in “${repair.recoveryDeckName}”.`,
                )
                : l(
                    `${repair.orphanNotesRecovered} kartsız notun ilk kartı yeniden oluşturuldu.`,
                    `Recreated the first card of ${repair.orphanNotesRecovered} notes that had no cards.`,
                ));
        }
        if (repair.strandedCardsRehomed > 0) {
            lines.push(repair.recoveryDeckName
                ? l(
                    `${repair.strandedCardsRehomed} kartın destesi onarıldı; kurtarılanlar “${repair.recoveryDeckName}” destesinde.`,
                    `Repaired the deck of ${repair.strandedCardsRehomed} cards; the rescued ones are in “${repair.recoveryDeckName}”.`,
                )
                : l(`${repair.strandedCardsRehomed} kart kendi destesine geri döndü.`, `Returned ${repair.strandedCardsRehomed} cards to their own deck.`));
        }
        if (repair.filteredLeftoversCleared > 0) {
            lines.push(l(
                `${repair.filteredLeftoversCleared} kartın filtrelenmiş deste artığı temizlendi.`,
                `Cleared leftover filtered-deck state from ${repair.filteredLeftoversCleared} cards.`,
            ));
        }
        if (repair.intervalsClamped > 0) {
            lines.push(l(
                `${repair.intervalsClamped} kartın geçersiz aralığı düzeltildi.`,
                `Fixed the invalid interval on ${repair.intervalsClamped} cards.`,
            ));
        }
        if (repair.newCardPositionsWrapped > 0) {
            lines.push(l(
                `${repair.newCardPositionsWrapped} yeni kartın sırası geçerli aralığa alındı.`,
                `Brought the position of ${repair.newCardPositionsWrapped} new cards back into range.`,
            ));
        }
        if (repair.duesRepaired > 0) {
            lines.push(l(
                `${repair.duesRepaired} kartın geçersiz tarihi düzeltildi.`,
                `Fixed the invalid due date on ${repair.duesRepaired} cards.`,
            ));
        }
        if (repair.ordinalsClamped > 0) {
            lines.push(l(
                `${repair.ordinalsClamped} kartın şablon sırası geçerli aralığa alındı.`,
                `Brought the template ordinal of ${repair.ordinalsClamped} cards back into range.`,
            ));
        }
        if (repair.originalDuesCleared > 0) {
            lines.push(l(
                `${repair.originalDuesCleared} kartın artık ön-filtre tarihi temizlendi.`,
                `Cleared a stale pre-filter due from ${repair.originalDuesCleared} cards.`,
            ));
        }
        if (repair.lastReviewTimesRepaired > 0) {
            lines.push(l(
                `${repair.lastReviewTimesRepaired} kartın son tekrar zamanı tekrar geçmişinden düzeltildi.`,
                `Fixed the last review time of ${repair.lastReviewTimesRepaired} cards from their review history.`,
            ));
        }
        if (repair.protectedRowsKept > 0) {
            lines.push(l(
                `${repair.protectedRowsKept} katalog satırına dokunulmadı; ücretli içerik yeniden kurularak onarılır.`,
                `${repair.protectedRowsKept} catalog rows were left alone; paid content is repaired by reinstalling it.`,
            ));
        }
        if (repair.unreadableNotes > 0) {
            lines.push(l(
                `${repair.unreadableNotes} not okunamıyor ve otomatik onarılamaz.`,
                `${repair.unreadableNotes} notes are unreadable and cannot be repaired automatically.`,
            ));
        }
        if (lines.length === 0) {
            lines.push(l('Onarılacak bozuk satır yoktu.', 'There were no broken rows to repair.'));
        }

        lines.push(result.ftsReindexed > 0
            ? l(`${result.ftsReindexed} kartın arama dizini yenilendi.`, `Search was rebuilt for ${result.ftsReindexed} cards.`)
            : l('Veritabanı indeksleri yenilendi.', 'Database indexes were refreshed.'));

        if (result.freedBytes > 0) {
            const freed = result.freedBytes >= 1024 * 1024
                ? `${Math.round(result.freedBytes / (1024 * 1024))} MB`
                : `${Math.max(1, Math.round(result.freedBytes / 1024))} KB`;
            lines.push(l(`${freed} yer geri kazanıldı.`, `${freed} of space was reclaimed.`));
        }

        if (result.failedSteps.length > 0) {
            const names = result.failedSteps.map(stepLabel).join(', ');
            lines.push('', l(`Tamamlanamayan adımlar: ${names}.`, `Steps that did not finish: ${names}.`));
        }

        lines.push('', backupRestorable
            ? l(`Güvenlik yedeği: ${backupFileName}`, `Safety backup: ${backupFileName}`)
            : l(
                `Kurtarma kopyası: ${backupFileName}. Hasarlı satırları olduğu gibi içerir; Yedekler’den paylaşılabilir ama doğrudan geri yüklenemez.`,
                `Recovery copy: ${backupFileName}. It keeps the damaged rows as they were; it can be shared from Backups but cannot be restored directly.`,
            ));
        return lines.join('\n');
    }, [l, stepLabel]);

    /**
     * Audit first, then show what the repair would change, then repair. The learner approves the
     * actual findings rather than a generic warning, and a run that deletes rows says so before
     * it starts.
     */
    const handleOptimizeDatabase = useCallback(() => {
        if (maintenanceAction) return;
        void (async () => {
            let findings: DatabaseCheckResult;
            try {
                findings = checkDatabase();
            } catch (error) {
                console.warn('[Settings] pre-repair audit failed:', error);
                alert(
                    l('Hata', 'Error'),
                    l('Veritabanı okunamadı, onarım başlatılmadı.', 'The database could not be read, so no repair was started.'),
                );
                return;
            }

            const repairable = repairableDefectCount(findings);
            const preview = repairable > 0
                ? [
                    l('Bulunanlar:', 'Found:'),
                    ...describeFindings(findings),
                    '',
                    l(
                        'Sahipsiz kartlar silinecek; kartsız notların ilk kartı yeniden oluşturulacak ve destesi kayıp kartlar kurtarılacak. Not metni silinmez.',
                        'Orphaned cards will be deleted; notes without cards get their first card back, and cards whose deck is gone will be rescued. No note text is deleted.',
                    ),
                ].join('\n')
                : l('Onarılacak bozuk satır bulunamadı.', 'No broken rows were found to repair.');

            const accepted = await confirmAsync(
                l('Veritabanını onar ve optimize et', 'Repair and Optimize Database'),
                [
                    preview,
                    '',
                    l(
                        'Ardından veritabanı sıkıştırılır, indeksler ve arama dizini yenilenir. Başlamadan önce güvenlik yedeği alınacaktır.',
                        'The database is then compacted and its indexes and search index refreshed. A safety backup will be created first.',
                    ),
                ].join('\n'),
                { destructive: repairable > 0 },
            );
            if (!accepted) return;

            setMaintenanceAction('optimize');
            try {
                // Allow the busy state to paint before synchronous SQLite maintenance.
                await new Promise((resolve) => setTimeout(resolve, 0));
                const { backupFileName, backupRestorable, result } = await optimizeDatabaseWithBackup();
                // Deleted, moved and reindexed rows all invalidate what the open screens are showing.
                if (repairChangedRows(result.repair) || result.ftsReindexed > 0) invalidateCollection();
                alert(
                    result.failedSteps.length > 0
                        ? l('Kısmen tamamlandı', 'Partly Completed')
                        : l('Optimizasyon tamamlandı', 'Optimization Complete'),
                    describeOptimizeResult(result, backupFileName, backupRestorable),
                );
            } catch (error) {
                console.warn('[Settings] database optimization failed:', error);
                const retained = error instanceof MaintenanceWorkflowError ? error.backupFileName : undefined;
                const retainedRestorable = !(error instanceof MaintenanceWorkflowError) || error.backupRestorable !== false;
                alert(
                    l('Optimizasyon tamamlanamadı', 'Optimization Failed'),
                    retained && !retainedRestorable
                        ? l(
                            `Onarım başlatıldı ama tamamlanamadı. ${retained} kurtarma kopyası korundu; hasarlı satırları içerdiği için Yedekler’den yalnızca paylaşılabilir, doğrudan geri yüklenemez.`,
                            `The repair started but did not finish. Recovery copy ${retained} was retained; because it keeps the damaged rows it can be shared from Backups but not restored directly.`,
                        )
                    : retained
                        ? l(
                            `Onarım başlatıldı ama tamamlanamadı. ${retained} güvenlik yedeği korundu; Yedekler ekranından geri yükleyebilirsiniz.`,
                            `The repair started but did not finish. Safety backup ${retained} was retained; you can restore it from Backups.`,
                        )
                        : l(
                            'Güvenlik yedeği alınamadığı için hiçbir satır değiştirilmedi. Yedekler ekranını kontrol edip tekrar deneyin.',
                            'No row was changed because the safety backup could not be created. Check Backups and try again.',
                        ),
                );
            } finally {
                setMaintenanceAction(null);
            }
        })();
    }, [describeFindings, describeOptimizeResult, invalidateCollection, l, maintenanceAction]);

    const handleResetSettings = useCallback(() => {
        confirm(
            l('Varsayılan ayarlar', 'Default Settings'),
            l(
                'Bütün sayfalardaki ayarlar ilk değerlerine döner: dil Türkçe, tema Açık, yazı boyutu Normal, klavye kısayolları varsayılan tuşlar. Deste seçenekleri, kartlarınız ve çalışma geçmişiniz değişmez.',
                'Settings on every page return to their starting values: language Türkçe, theme Light, text size Default, keyboard shortcuts on their default keys. Deck options, your cards and your study history are kept.',
            ),
            () => {
                void (async () => {
                    // Saved like any other change, so the web build has committed it before success shows.
                    const result = await saveSettingsDurably(defaultSettingsKeepingDeckOptions(loadSettings()));
                    if (!result.ok) {
                        alert(l('Ayarlar sıfırlanamadı', 'Settings Not Reset'), l('Varsayılan ayarlar cihaz depolamasına yazılamadı.', 'Default settings could not be written to device storage.'));
                        return;
                    }
                    const persisted = loadSettings();
                    setSettings(persisted);
                    markSaved(persisted);
                    refreshData();
                    markSchedulingStale();
                    showSavedState();
                })();
            },
            { confirmLabel: l('Varsayılana dön', 'Restore defaults'), destructive: true },
        );
    }, [l, markSaved, markSchedulingStale, refreshData, showSavedState]);

    const handleResetProgress = useCallback(() => {
        if (maintenanceAction) return;
        confirm(l('İlerlemeyi sıfırla', 'Reset Progress'), l(
            'Bütün desteler, notlar, kartlar, not türleri, çalışma geçmişi ve Kronometre oturumları silinecek; uygulama ayarları da ilk değerlerine dönecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulur.',
            'All decks, notes, cards, note types, study history and Stopwatch sessions will be deleted, and app settings will return to their starting values. A restorable safety backup is created first.',
        ), () => {
            void (async () => {
                setMaintenanceAction('reset');
                try {
                    const { backupFileName } = await resetAllDataWithBackup();
                    const persisted = loadSettings();
                    setSettings(persisted);
                    markSaved(persisted);
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
                    if (error instanceof ResetWorkflowError && error.cause instanceof BackupNotRestorableError) {
                        alert(t('backup.notRestorableTitle'), t('backup.notRestorableMessage'));
                        return;
                    }
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
    }, [invalidateCollection, l, maintenanceAction, markSaved, refreshCatalogAccess, refreshData, t]);

    const renderGeneral = useCallback(() => (
        <>
            <Card padded title={l('Dil', 'Language')}>
                <SegmentedControl
                    fill
                    accessibilityLabel={l('Dil', 'Language')}
                    value={settings.language}
                    onChange={(value) => updateSetting('language', value)}
                    options={[
                        { value: 'system' as AppLanguage, label: l('Sistem', 'System') },
                        { value: 'tr' as AppLanguage, label: 'Türkçe' },
                        { value: 'en' as AppLanguage, label: 'English' },
                    ]}
                />
            </Card>
            <Card padded title={l('Tema', 'Theme')}>
                <SegmentedControl
                    fill
                    accessibilityLabel={l('Tema', 'Theme')}
                    value={settings.themeMode}
                    onChange={(value) => updateSetting('themeMode', value)}
                    options={[
                        { value: 'system' as const, label: l('Sistem', 'System') },
                        { value: 'light' as const, label: l('Açık', 'Light') },
                        { value: 'dark' as const, label: l('Koyu', 'Dark') },
                    ]}
                />
            </Card>
            <Card padded title={l('Yazı boyutu', 'Text size')}>
                <TextSizeSlider value={settings.textSizeLevel} onChange={(level) => updateSetting('textSizeLevel', level)} />
            </Card>
            <Card divided title={l('Düzenleme', 'Editing')}>
                <ChoiceRow
                    label={l('Yeni kartların destesi', 'Deck for new cards')}
                    summary={l('Kart ekleme ekranı bir desteden açılmadığında başlangıç destesini seçer. Geçerli deste en son çalıştığınız destedir.', 'Picks the starting deck when the add-card screen is not opened from a deck. Current deck is the deck you studied last.')}
                    value={settings.newCardDeckMode ?? 'current'}
                    options={[
                        { value: 'current', label: l('Geçerli deste', 'Current deck') },
                        { value: 'default', label: l('Varsayılan', 'Default') },
                    ]}
                    onChange={(value) => updateSetting('newCardDeckMode', value)}
                    styles={styles}
                />
                <SwitchRow
                    title={l('Pano görsellerini PNG olarak yapıştır', 'Paste clipboard images as PNG')}
                    summary={l('Yapıştırılan görseller her zaman koleksiyon medyasına kaydedilir: açıkken PNG, kapalıyken JPEG olarak.', 'Pasted images are always saved as collection media: as PNG when on, as JPEG when off.')}
                    value={Boolean(settings.pasteClipboardImagesAsPng)}
                    onValueChange={(value) => updateSetting('pasteClipboardImagesAsPng', value)}
                />
                <SwitchRow
                    title={l('Yazarak cevap alanlarını devre dışı bırak', 'Never type answers')}
                    summary={l('Yazarak cevap şablonlarında klavyeyi açmadan normal kartı gösterir.', 'Shows type-answer cards without opening the answer keyboard.')}
                    value={Boolean(settings.neverTypeAnswer)}
                    onValueChange={(value) => updateSetting('neverTypeAnswer', value)}
                />
                {/* One row each, so the card draws a hairline between them. */}
                {!settings.neverTypeAnswer ? (
                    <SwitchRow
                        title={l('Cevabı kartın içine yaz', 'Type answer into the card')}
                        summary={l('Giriş alanını şablondaki {{type:Alan}} konumuna yerleştirir ve kartın #typeans stilini uygular.', 'Places the input at {{type:Field}} so the card’s #typeans styling applies.')}
                        value={Boolean(settings.typeAnswerInCard)}
                        onValueChange={(value) => updateSetting('typeAnswerInCard', value)}
                    />
                ) : null}
                {!settings.neverTypeAnswer ? (
                    <SwitchRow
                        title={l('Yazarak cevap alanına odaklan', 'Focus type-in-answer')}
                        summary={l('Yazarak cevap kartı açıldığında alanı seçer ve klavyeyi açar.', 'Selects the field and opens the keyboard when a type-answer card appears.')}
                        value={settings.focusTypeAnswer !== false}
                        onValueChange={(value) => updateSetting('focusTypeAnswer', value)}
                    />
                ) : null}
            </Card>
            <Card>
                <SwitchRow
                    title={l('Dosya adlarını göster', 'Show filenames')}
                    summary={l('Kart tarayıcısındaki soru/cevap alanlarında ses dosyası adlarını gösterir.', 'Displays audio filenames in the card browser question/answer fields.')}
                    value={Boolean(settings.showBrowserAudioFilenames)}
                    onValueChange={(value) => updateSetting('showBrowserAudioFilenames', value)}
                />
            </Card>
            {Platform.OS === 'android' ? (
                <Card divided title={l('Android gezinme', 'Android navigation')} description={l('AnkiDroid’dan esinlenen, Android’e özgü isteğe bağlı davranışlar.', 'Optional Android-specific behaviors inspired by AnkiDroid.')}>
                    <SwitchRow title={l('Tam ekrandan sağa kaydırınca menüyü aç', 'Open menu with a full-screen right swipe')} value={Boolean(settings.fullScreenNavigationDrawer)} onValueChange={(value) => updateSetting('fullScreenNavigationDrawer', value)} />
                    <SwitchRow title={l('Geri/çıkış için iki kez geri bas', 'Press back twice to go back/exit')} value={Boolean(settings.doubleBackToExit)} onValueChange={(value) => updateSetting('doubleBackToExit', value)} />
                </Card>
            ) : null}
            <Button
                variant="secondary"
                icon={<RestoreIcon color={colors.textPrimary} size={18} styles={styles} />}
                label={l('Varsayılan ayarlara dön', 'Restore default settings')}
                onPress={handleResetSettings}
            />
        </>
    ), [colors, handleResetSettings, l, settings, styles, updateSetting]);

    const renderNewStudy = () => (
        <>
            <Card divided title={l('Yeni çalışma ekranı', 'New study screen')}>
                <SwitchRow
                    title={l('Yeni çalışma ekranını kullan', 'Use new study screen')}
                    summary={settings.showStudyTopBar === false
                        ? l(
                            'Yönlü yanıt geri bildirimini etkinleştirir. Yeni araç çubuğu, aşağıdaki "Araç çubuğunu göster" kapalı olduğu sürece gizli kalır.',
                            'Enables directional answer feedback. The new toolbar stays hidden while "Show toolbar" below is off.',
                        )
                        : l(
                            'Kalan kart sayılarını, süreyi ve tahmini bitişi gösteren yeni araç çubuğunu ve yönlü yanıt geri bildirimini etkinleştirir.',
                            'Enables the new toolbar with remaining counts, timer and estimated finish, and directional answer feedback.',
                        )}
                    value={Boolean(settings.newStudyScreenEnabled)}
                    onValueChange={(value) => updateSetting('newStudyScreenEnabled', value)}
                />
            </Card>
            <Card divided title={l('Ekran', 'Screen')}>
                <ChoiceRow
                    label={l('Çerçeve stili', 'Frame style')}
                    value={settings.studyFrameStyle ?? 'card'}
                    options={[{ value: 'card', label: l('Kart', 'Card') }, { value: 'plain', label: l('Yok', 'None') }]}
                    onChange={(value) => updateSetting('studyFrameStyle', value)}
                    styles={styles}
                />
                <SwitchRow title={l('Kalan kart sayısını göster', 'Show remaining card count')} value={settings.showRemainingCount} onValueChange={(value) => updateSetting('showRemainingCount', value)} />
                <SwitchRow title={l('Sesli kartlarda oynatma düğmelerini göster', 'Show play buttons on cards with audio')} value={settings.showAudioPlayButtons !== false} onValueChange={(value) => updateSetting('showAudioPlayButtons', value)} />
                <SwitchRow title={l('Yanıt geri bildirimini göster', 'Show answer feedback')} summary={l('Tekrar yanıtında kırmızı çarpı, tüm yanıt düğmelerinde dokunsal geri bildirim gösterir.', 'Shows a red cross for Again and haptic feedback for all answer buttons.')} value={settings.showAnswerFeedback !== false} onValueChange={(value) => updateSetting('showAnswerFeedback', value)} />
                <SwitchRow title={l('Ortaya hizala', 'Center align')} summary={l('Kart içeriğini dikey olarak ortalar.', 'Centers card content vertically.')} value={Boolean(settings.centerCardContent)} onValueChange={(value) => updateSetting('centerCardContent', value)} />
                <SwitchRow title={l('Deste başlığını göster', 'Show deck title')} value={settings.showDeckTitle !== false} onValueChange={(value) => updateSetting('showDeckTitle', value)} />
                <SwitchRow title={l('Kalan süreyi göster', 'Show remaining time')} summary={l('Mevcut hızla tahmini bitiş süresini gösterir.', 'Shows an estimated time remaining at the current pace.')} value={Boolean(settings.showRemainingTime)} onValueChange={(value) => updateSetting('showRemainingTime', value)} />
            </Card>
            <Card divided title={l('Araç çubuğu', 'Toolbar')}>
                <SwitchRow title={l('Araç çubuğunu göster', 'Show toolbar')} summary={l('Geri, deste kapsamı, sayaçlar ve kart işlemlerini gösterir.', 'Shows back, deck scope, counts and card actions.')} value={settings.showStudyTopBar !== false} onValueChange={(value) => updateSetting('showStudyTopBar', value)} />
                {settings.showStudyTopBar !== false && Boolean(settings.newStudyScreenEnabled) ? (
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
            </Card>
            <Card divided title={l('Yanıt düğmeleri', 'Answer buttons')}>
                <SwitchRow
                    title={l('Yanıt düğmelerini göster', 'Show answer buttons')}
                    summary={l('Kapalıyken kartlar dokunma bölgeleri veya kaydırma hareketleriyle yanıtlanır.', 'When hidden, cards are answered with tap zones or swipe gestures.')}
                    value={settings.showAnswerButtons !== false}
                    onValueChange={(value) => {
                        if (!value && !canGradeRevealedCard({ ...settings, showAnswerButtons: false })) {
                            alert(
                                l('Dokunma veya kaydırmayı etkinleştirin', 'Enable taps or swipes'),
                                l(
                                    'Yanıt düğmelerini gizlemeden önce Kontroller bölümünde bir dokunma bölgesine veya kaydırma yönüne Tekrar, Zor, İyi ya da Kolay atayın.',
                                    'Before hiding the answer buttons, assign Again, Hard, Good, or Easy to a tap zone or swipe direction in Controls.',
                                ),
                            );
                            return;
                        }
                        updateSetting('showAnswerButtons', value);
                    }}
                />
                <SwitchRow title={l('Sonraki inceleme süresini göster', 'Show next review time above answer buttons')} value={settings.showNextReviewTimes} onValueChange={(value) => updateSetting('showNextReviewTimes', value)} />
                <SwitchRow title={l('Zor ve Kolay düğmelerini gizle', 'Hide Hard and Easy buttons')} summary={l('Yalnızca Tekrar ve İyi gösterilir.', 'Only Again and Good are shown.')} value={Boolean(settings.hideHardAndEasy)} onValueChange={(value) => updateSetting('hideHardAndEasy', value)} />
                <SwitchRow title={l('Otomatik ilerleme', 'Auto advance')} summary={l('Deste seçeneklerindeki Otomatik ilerleme sürelerini çalıştırır. Süreleri her deste için Deste seçenekleri › Otomatik ilerleme bölümünde verin; 0 saniye kapalı demektir.', 'Runs the Auto Advance times set in deck options. Set them per deck in Deck Options › Auto Advance; 0 seconds means off.')} value={settings.autoAdvance} onValueChange={(value) => updateSetting('autoAdvance', value)} />
            </Card>
        </>
    );

    const renderReviewing = useCallback(() => (
        <>
            <Card divided title={l('Zamanlama', 'Scheduling')}>
                <StepperRow label={l('Sonraki günün başlangıcı', 'Start of next day')} summary={l('Günlük istatistikler ve limitler bu saatte yenilenir.', 'Daily statistics and limits reset at this hour.')} value={settings.dayRolloverHour} suffix=":00" minimumDigits={2} step={1} min={0} max={23} wrap onChange={(value) => updateSetting('dayRolloverHour', value)} styles={styles} />
                <StepperRow label={l('Önceden öğrenme sınırı', 'Learn ahead limit')} summary={l('Sırada başka kart kalmadığında öğrenme kartlarını erken gösterir.', 'Shows learning cards early when nothing else is queued.')} value={settings.learnAheadMinutes} suffix={l('dk.', 'mins')} step={5} min={0} max={120} onChange={(value) => updateSetting('learnAheadMinutes', value)} styles={styles} />
                <StepperRow label={l('Zaman kutusu sınırı', 'Timebox time limit')} summary={l('Her zaman kutusu sona erdiğinde çalıştığınız kart sayısını gösterir; 0 özelliği kapatır.', 'Shows how many cards you studied when each timebox ends; 0 disables it.')} value={settings.timeboxMinutes ?? 0} suffix={l('dk.', 'mins')} step={1} min={0} max={9999} onChange={(value) => updateSetting('timeboxMinutes', value)} styles={styles} />
            </Card>
            <Card divided title={l('Gelişmiş', 'Advanced')}>
                <SwitchRow title={l('Ekranı açık tut', 'Keep screen on')} summary={l('Çalışma sırasında ekran zaman aşımını devre dışı bırakır.', 'Disables screen timeout while reviewing.')} value={Boolean(settings.keepScreenOn)} onValueChange={(value) => updateSetting('keepScreenOn', value)} />
                <SwitchRow title={l('Sesi otomatik oynat', 'Automatically play audio')} value={settings.autoPlayAudio} onValueChange={(value) => updateSetting('autoPlayAudio', value)} />
                <ChoiceRow
                    label={l('Ses oynatma hızı', 'Audio playback speed')}
                    summary={l('Varsayılan ayar grubunu ve kendi hızı olmayan desteleri etkiler. Bir ayar grubuna özel hız Deste seçenekleri › Ses bölümünden verilir.', 'Affects the Default preset and decks without a speed of their own. A preset’s own speed is set in Deck Options › Audio.')}
                    value={String(settings.audioPlaybackRate ?? 1.0)}
                    options={[
                        { label: '0.75x', value: '0.75' },
                        { label: '1.0x', value: '1' },
                        { label: '1.25x', value: '1.25' },
                        { label: '1.5x', value: '1.5' },
                        { label: '2.0x', value: '2' },
                    ]}
                    onChange={(value) => updateSetting('audioPlaybackRate', parseFloat(value))}
                    styles={styles}
                />
                <SwitchRow title={l('Yanıtlarken sesi kes', 'Interrupt audio when answering')} summary={l('Cevap açılınca ya da sonraki karta geçilince çalan ses dosyasını ve metin okumayı keser. Kapalıyken ses dosyası sonuna kadar çalar, yeni yüzün sesleri onu bekler.', 'Stops the sound file or text-to-speech still playing when the answer is shown or the next card appears. When off, the sound file plays to its end and the new side’s audio follows it.')} value={settings.interruptAudioOnAnswer} onValueChange={(value) => updateSetting('interruptAudioOnAnswer', value)} />
            </Card>
        </>
    ), [l, settings, styles, updateSetting]);

    const renderNotifications = () => (
        <Card divided title={l('Bildirimler', 'Notifications')}>
            <SwitchRow
                title={l('Bildirimler', 'Notifications')}
                value={Boolean(settings.studyNotificationsEnabled)}
                onValueChange={(value) => { void handleStudyNotificationsToggle(value); }}
            />
            <SelectRow
                label={l('Şu durumda bildir', 'Notify when')}
                value={notificationThresholdLabel(settings.studyNotificationsEnabled, settings.studyNotificationThreshold)}
                onPress={() => setNotificationThresholdPickerVisible(true)}
            />
            {settings.studyNotificationsEnabled && studyNotificationsSupported() ? (
                <ValueRow
                    label={l('Hatırlatma saati', 'Reminder time')}
                    summary={l('Her gün bu yerel saatte zamanı gelmiş kartlar kontrol edilir.', 'The reminder checks for due cards at this local time each day.')}
                >
                    <View style={styles.notificationTimeRow}>
                        <BoundedIntegerInput
                            value={settings.studyNotificationHour ?? 9}
                            min={0}
                            max={23}
                            wrap
                            minimumDigits={2}
                            onChange={(value) => updateSetting('studyNotificationHour', value)}
                            accessibilityLabel={l('Hatırlatma saati, saat', 'Reminder hour')}
                            style={styles.notificationTimeInput}
                        />
                        <Text style={styles.timeSeparator}>:</Text>
                        <BoundedIntegerInput
                            value={settings.studyNotificationMinute ?? 0}
                            min={0}
                            max={59}
                            wrap
                            minimumDigits={2}
                            onChange={(value) => updateSetting('studyNotificationMinute', value)}
                            accessibilityLabel={l('Hatırlatma saati, dakika', 'Reminder minute')}
                            style={styles.notificationTimeInput}
                        />
                    </View>
                </ValueRow>
            ) : null}
        </Card>
    );

    const activeSwipePreset = matchingSwipePreset(settings);
    const gradingIsStranded = !canGradeRevealedCard(settings);
    // Turning a control off must never leave a revealed card with nothing that can grade it.
    const updateSettingsKeepingGrading = useCallback((patch: Partial<AppSettings>) => {
        updateSettings(canGradeRevealedCard({ ...settings, ...patch }) ? patch : { ...patch, showAnswerButtons: true });
    }, [settings, updateSettings]);

    const renderControls = useCallback(() => (
        <>
            <Card
                divided
                title={l('Dokunma ve kaydırma', 'Taps and swipes')}
                description={l(
                    'Kart yüzeyindeki dokuz bölgeye ve dört kaydırma yönüne ayrı eylemler atayın.',
                    'Assign separate actions to the nine card zones and four swipe directions.',
                )}
                accessory={(
                    <HelpButton
                        accessibilityLabel={l('Çalışma kontrolleri yardımını aç', 'Open reviewer controls help')}
                        onPress={() => setControlsHelpVisible(true)}
                    />
                )}
            >
                <SwitchRow
                    title={l('9 noktalı dokunma', '9-point touch')}
                    summary={l('Kart yüzeyini 3×3 bölgeye ayırır; soru ve yanıt tarafları ayrı ayrı ayarlanır.', 'Divides the card surface into a 3×3 grid; question and answer sides are configured separately.')}
                    value={settings.ninePointTouchEnabled !== false}
                    onValueChange={(value) => updateSettingsKeepingGrading({ ninePointTouchEnabled: value })}
                />
                {settings.ninePointTouchEnabled !== false ? (
                    <View style={styles.block}>
                        <Text style={styles.label}>{l('Kart tarafı', 'Card side')}</Text>
                        <SegmentedControl
                            fill
                            accessibilityLabel={l('Kart tarafı', 'Card side')}
                            value={tapSide}
                            options={[
                                { value: 'question', label: l('Soru', 'Question') },
                                { value: 'answer', label: l('Yanıt', 'Answer') },
                            ]}
                            onChange={setTapSide}
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
                <SwitchRow
                    title={l('Kaydırma hareketlerini etkinleştir', 'Enable swipe gestures')}
                    summary={l('Kapalıyken çalışma ekranı tüm kaydırmaları normal kart gezinmesine bırakır.', 'When off, the reviewer leaves every swipe to normal card navigation.')}
                    value={Boolean(settings.gesturesEnabled)}
                    onValueChange={(value) => updateSettingsKeepingGrading({ gesturesEnabled: value })}
                />
                {/* An array, not a fragment, so the card draws a hairline between its rows. */}
                {settings.gesturesEnabled ? [
                    <View key="presets" style={styles.block}>
                        <View style={styles.blockCopy}>
                            <Text style={styles.label}>{l('Hazır düzenler', 'Presets')}</Text>
                            <Text style={styles.summary}>{l('Bir düzen seçin, ardından yönleri tek tek değiştirebilirsiniz.', 'Choose a preset, then fine-tune each direction.')}</Text>
                        </View>
                        <SegmentedControl<SwipePresetId | typeof CUSTOM_SWIPE_LAYOUT>
                            fill
                            accessibilityLabel={l('Hazır düzenler', 'Presets')}
                            value={activeSwipePreset ?? CUSTOM_SWIPE_LAYOUT}
                            options={[
                                { value: 'balanced', label: l('iPhone için dengeli', 'Balanced for iPhone') },
                                { value: 'fastAnswers', label: l('Hızlı yanıt', 'Fast answers') },
                            ]}
                            onChange={(preset) => {
                                if (preset !== CUSTOM_SWIPE_LAYOUT) updateSettingsKeepingGrading(SWIPE_PRESETS[preset]);
                            }}
                        />
                        {activeSwipePreset === null ? (
                            <Text style={styles.summary}>{l('Özel düzen kullanılıyor.', 'Using a custom layout.')}</Text>
                        ) : null}
                    </View>,
                    ...([
                        ['swipeLeftAction', 'left', l('Sola kaydırma', 'Swipe left'), settings.swipeLeftAction ?? 'tools'],
                        ['swipeRightAction', 'right', l('Sağa kaydırma', 'Swipe right'), settings.swipeRightAction ?? 'decks'],
                        ['swipeUpAction', 'up', l('Yukarı kaydırma', 'Swipe up'), settings.swipeUpAction ?? 'off'],
                        ['swipeDownAction', 'down', l('Aşağı kaydırma', 'Swipe down'), settings.swipeDownAction ?? 'off'],
                    ] as Array<[GestureSettingKey, SwipeDirection, string, ReviewGestureAction]>).map(([field, direction, label, action]) => (
                        <ListRow
                            key={field}
                            icon={<SwipeDirectionIcon direction={direction} color={colors.accent} styles={styles} />}
                            title={label}
                            summary={<Text style={styles.actionValue}>{gestureActionLabel(action)}</Text>}
                            onPress={() => setGesturePickerTarget({ kind: 'swipe', field })}
                            accessibilityLabel={`${label}: ${gestureActionLabel(action)}`}
                        />
                    )),
                    <SwipeSensitivitySlider
                        key="sensitivity"
                        label={l('Kaydırma hassasiyeti', 'Swipe sensitivity')}
                        summary={l('Yüksek değer daha kısa hareketleri, düşük değer daha uzun ve belirgin hareketleri algılar.', 'A higher value detects shorter movements; a lower value requires a longer, deliberate swipe.')}
                        value={settings.swipeSensitivity ?? 100}
                        onChange={(value) => updateSetting('swipeSensitivity', value)}
                        styles={styles}
                    />,
                ] : null}
                {gradingIsStranded ? (
                    <View style={styles.block} accessibilityRole="alert">
                        <Notice
                            tone="warning"
                            title={l('Kartları yanıtlamanın bir yolu kalmadı', 'No way left to answer cards')}
                            action={(
                                <Button
                                    size="compact"
                                    label={l('Yanıt düğmelerini geri aç', 'Show the answer buttons again')}
                                    onPress={() => updateSetting('showAnswerButtons', true)}
                                />
                            )}
                        >
                            {l(
                                'Yanıt düğmeleri gizli ve etkin hiçbir dokunma bölgesi veya kaydırma yönü Tekrar, Zor, İyi ya da Kolay uygulamıyor. Bir bölgeye veya yöne bir yanıt eylemi atayın ya da yanıt düğmelerini geri açın.',
                                'The answer buttons are hidden and no enabled tap zone or swipe direction answers Again, Hard, Good, or Easy. Assign an answer action to a zone or direction, or bring the answer buttons back.',
                            )}
                        </Notice>
                    </View>
                ) : null}
            </Card>
            <Card divided title={l('Ekran kontrolü', 'On-screen control')}>
                <SwitchRow
                    title={l('Yüzen Araçlar düğmesini göster', 'Show the floating Tools button')}
                    summary={l('Araç menüsüne tek elle erişmek için çalışma ekranında sabit bir düğme gösterir.', 'Shows a fixed reviewer button for one-handed access to the Tools menu.')}
                    value={Boolean(settings.showToolsOverlayButton)}
                    onValueChange={(value) => updateSetting('showToolsOverlayButton', value)}
                />
                {settings.showToolsOverlayButton ? (
                    <View style={styles.block}>
                        <View style={styles.blockCopy}>
                            <Text style={styles.label}>{l('Düğme konumu', 'Button position')}</Text>
                            <Text style={styles.summary}>
                                {l('Tek elle çalışma sırasında başparmağınızla en rahat ulaşabileceğiniz tarafı belirleyin.', 'Select the side easiest to reach with your thumb during one-handed review.')}
                            </Text>
                        </View>

                        <SegmentedControl
                            fill
                            accessibilityLabel={l('Düğme konumu', 'Button position')}
                            value={settings.toolsOverlayPosition ?? 'right'}
                            onChange={(position) => updateSetting('toolsOverlayPosition', position)}
                            options={[
                                { value: 'left', label: l('◧ Sol taraf', '◧ Left side') },
                                { value: 'right', label: l('◨ Sağ taraf', '◨ Right side') },
                            ]}
                        />

                        <View style={styles.overlayPreviewWrap}>
                            <Pressable
                                style={styles.overlayPreviewMock}
                                onPress={() => updateSetting('toolsOverlayPosition', settings.toolsOverlayPosition === 'left' ? 'right' : 'left')}
                                accessibilityRole="button"
                                accessibilityLabel={l('Düğme konumunu değiştir', 'Toggle button position')}
                            >
                                <View style={styles.overlayPreviewTopBar}>
                                    <View style={styles.overlayPreviewDot} />
                                    <View style={styles.overlayPreviewHeaderLine} />
                                    <View style={styles.overlayPreviewDot} />
                                </View>
                                <View style={styles.overlayPreviewCard}>
                                    <View style={[styles.overlayPreviewTextLine, { width: '70%' }]} />
                                    <View style={[styles.overlayPreviewTextLine, { width: '85%' }]} />
                                    <View style={[styles.overlayPreviewTextLine, { width: '50%' }]} />
                                </View>
                                <View style={styles.overlayPreviewBottomBar}>
                                    <View style={styles.overlayPreviewMiniBtn} />
                                    <View style={styles.overlayPreviewMiniBtn} />
                                    <View style={styles.overlayPreviewMiniBtn} />
                                </View>
                                <View
                                    style={[
                                        styles.overlayPreviewFloatingBtn,
                                        settings.toolsOverlayPosition === 'left'
                                            ? styles.overlayPreviewFloatingBtnLeft
                                            : styles.overlayPreviewFloatingBtnRight,
                                    ]}
                                >
                                    <GearGlyph color={colors.onAccent} size={13} />
                                </View>
                            </Pressable>
                            <Text style={styles.overlayPreviewCaption}>
                                {settings.toolsOverlayPosition === 'left'
                                    ? l('Düğme ekranın sol alt tarafında görünecektir.', 'Button will appear on the bottom-left of the screen.')
                                    : l('Düğme ekranın sağ alt tarafında görünecektir.', 'Button will appear on the bottom-right of the screen.')}
                            </Text>
                        </View>
                    </View>
                ) : null}
            </Card>
            <KeyboardSettingsSection bindings={settings.keyBindings} onChange={handleKeyBindingsChange} />
        </>
    ), [activeSwipePreset, colors, gestureActionLabel, gradingIsStranded, handleKeyBindingsChange, l, settings, styles, tapSide, updateSetting, updateSettings, updateSettingsKeepingGrading]);

    const renderAccessibility = () => (
        <>
            <Card divided title={l('Kart', 'Card')}>
                <StepperRow inline label={l('Kart yakınlaştırma', 'Card zoom')} value={settings.cardZoomPercent ?? 100} suffix="%" step={10} min={50} max={200} onChange={(value) => updateSetting('cardZoomPercent', value)} styles={styles} />
                <StepperRow inline label={l('Görsel yakınlaştırma', 'Image zoom')} value={settings.imageZoomPercent ?? 100} suffix="%" step={10} min={50} max={200} onChange={(value) => updateSetting('imageZoomPercent', value)} styles={styles} />
            </Card>
            <Card divided title={l('Yanıt düğmeleri', 'Answer buttons')}>
                <StepperRow inline label={l('Yanıt düğmesi boyutu', 'Answer button size')} value={settings.answerButtonScalePercent ?? 100} suffix="%" step={10} min={100} max={175} onChange={(value) => updateSetting('answerButtonScalePercent', value)} styles={styles} />
                <SwitchRow title={l('Büyük yanıt düğmelerini iki satırda göster', 'Show large answer buttons in two rows')} value={Boolean(settings.twoRowAnswerButtons)} onValueChange={(value) => updateSetting('twoRowAnswerButtons', value)} />
                <StepperRow inline label={l('Cevabı göster basılı tutma süresi', 'Show answer long-press time')} summary={l('0 ms normal dokunmadır. Yalnızca Cevabı göster düğmesine uygulanır.', '0 ms uses a normal tap. Applies only to the Show Answer button.')} value={settings.showAnswerLongPressMs ?? 0} suffix="ms" step={100} min={0} max={2000} onChange={(value) => updateSetting('showAnswerLongPressMs', value)} styles={styles} />
                <StepperRow inline label={l('Çift dokunma aralığı', 'Double tap time interval')} summary={l('Yanlışlıkla iki kez yanıtlamayı önler.', 'Prevents accidental double answers.')} value={settings.answerDoubleTapMs ?? 200} suffix="ms" step={50} min={0} max={1000} onChange={(value) => updateSetting('answerDoubleTapMs', value)} styles={styles} />
            </Card>
            <Card divided title={l('Kart tarayıcısı', 'Card browser')}>
                <StepperRow inline label={l('Yazı ölçeği', 'Font scaling')} value={settings.browserFontScalePercent ?? 100} suffix="%" step={10} min={75} max={175} onChange={(value) => updateSetting('browserFontScalePercent', value)} styles={styles} />
            </Card>
        </>
    );

    // Read from the stored policy, which a restored backup can bring with it, not from the defaults.
    const backupPolicy = normalizeBackupPolicy(settings);
    const autoBackupSummary = l(
        `Değişiklik varsa yaklaşık ${backupPolicy.backupIntervalMinutes} dakikada bir; ${backupPolicy.backupDailyCopies} günlük, ${backupPolicy.backupWeeklyCopies} haftalık, ${backupPolicy.backupMonthlyCopies} aylık kopya`,
        `About every ${backupPolicy.backupIntervalMinutes} minutes when there are changes; ${backupPolicy.backupDailyCopies} daily, ${backupPolicy.backupWeeklyCopies} weekly, ${backupPolicy.backupMonthlyCopies} monthly copies`,
    );
    const renderData = useCallback(() => (
        <>
            <Card divided title={l('Yedekleme', 'Backup')}>
                <SwitchRow
                    title={l('Otomatik yedekleme', 'Automatic backup')}
                    summary={autoBackupSummary}
                    value={settings.autoBackupEnabled !== false}
                    onValueChange={(value) => updateSetting('autoBackupEnabled', value)}
                />
                <ListRow
                    icon={<RefreshIcon color={colors.accent} />}
                    title={l('Yedekleri yönet', 'Manage backups')}
                    summary={l('Görüntüle veya geri yükle', 'View or restore')}
                    onPress={() => router.push('/backups')}
                />
            </Card>

            <Card divided title={l('İçe ve dışa aktar', 'Import and export')}>
                <ListRow icon={<ArrowUpIcon color={colors.accent} size={22} />} title={l('Verileri dışa aktar', 'Export data')} onPress={handleExport} />
                <ListRow icon={<ArrowDownIcon color={colors.accent} size={22} />} title={l('Deste ve verileri içe aktar', 'Import decks and data')} onPress={handleImport} />
            </Card>

            <Card divided title={l('Bakım', 'Maintenance')}>
                <ListRow
                    icon={<CheckIcon color={colors.accent} size={22} />}
                    title={l('Veritabanını kontrol et', 'Check database')}
                    summary={l('Salt okunur bütünlük denetimi', 'Read-only integrity audit')}
                    onPress={handleCheckDatabase}
                    disabled={maintenanceAction !== null}
                />
                <ListRow
                    // The kit has no repair glyph; the gear stands for maintenance.
                    icon={<GearGlyph color={colors.accent} size={22} />}
                    title={maintenanceAction === 'optimize' ? l('Optimize ediliyor…', 'Optimizing…') : l('Onar ve optimize et', 'Repair and optimize')}
                    summary={l('Önce denetler ve onaylatır; yedek alıp bozuk satırları onarır ve indeksleri yeniler', 'Audits and confirms first, then backs up, repairs broken rows and refreshes indexes')}
                    onPress={handleOptimizeDatabase}
                    disabled={maintenanceAction !== null}
                />
                <ListRow
                    icon={<RestoreIcon color={colors.danger} styles={styles} />}
                    title={maintenanceAction === 'reset' ? l('Sıfırlanıyor…', 'Resetting…') : l('İlerlemeyi sıfırla', 'Reset progress')}
                    onPress={handleResetProgress}
                    disabled={maintenanceAction !== null}
                    destructive
                />
            </Card>
        </>
    ), [autoBackupSummary, colors, handleCheckDatabase, handleExport, handleImport, handleOptimizeDatabase, handleResetProgress, l, maintenanceAction, settings.autoBackupEnabled, styles, updateSetting]);

    const openExternalPage = (url: string) => {
        Linking.openURL(url).catch((error) => {
            console.warn('[Settings] could not open link:', error);
            alert(
                l('Sayfa açılamadı', 'Could Not Open Page'),
                l(`Bağlantı açılamadı. Tarayıcıda şu adresi açın: ${url}`, `The link could not be opened. Open this address in a browser: ${url}`),
            );
        });
    };

    const renderAbout = () => (
        <Card divided title="TusAnkiM" description={l(`Sürüm ${Constants.expoConfig?.version ?? '1.0.0'} • Anki paketleriyle çalışan, verilerini cihazınızda tutan bağımsız bir kart uygulaması. Anki veya Ankitects ile bağlantılı değildir.`, `Version ${Constants.expoConfig?.version ?? '1.0.0'} • An independent flashcard app that works with Anki packages and keeps its data on your device. Not affiliated with Anki or Ankitects.`)}>
            <ListRow title={l('Gizlilik politikası', 'Privacy Policy')} onPress={() => openExternalPage(PRIVACY_URL)} chevron={false} accessory={<ExternalLinkIcon color={colors.textMuted} />} />
            <ListRow title={l('Destek', 'Support')} onPress={() => openExternalPage(SUPPORT_URL)} chevron={false} accessory={<ExternalLinkIcon color={colors.textMuted} />} />
        </Card>
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
        return <SafeAreaView style={styles.container}><LoadingState style={styles.loading} /></SafeAreaView>;
    }

    return (
        <KeyboardDismissArea>
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={activeCategory?.title ?? l('Ayarlar', 'Settings')}
                backAccessibilityLabel={activeSection ? l('Ayarlara dön', 'Back to settings') : l('Geri dön', 'Go back')}
                onBack={handleBack}
                actions={activeSection || isDirty ? (
                    <Button
                        size="compact"
                        variant={showSaved ? 'secondary' : 'primary'}
                        icon={showSaved ? <CheckIcon color={colors.success} size={14} /> : undefined}
                        label={showSaved ? l('Kaydedildi', 'Saved') : l('Kaydet', 'Save')}
                        numberOfLines={1}
                        onPress={handleSaveSettings}
                        disabled={!isDirty && !showSaved}
                        busy={saving}
                        accessibilityLabel={showSaved ? l('Ayarlar kaydedildi', 'Settings saved') : l('Ayarları kaydet', 'Save settings')}
                        style={styles.headerSaveButton}
                    />
                ) : undefined}
            />
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
                        <SearchField
                            value={search}
                            onChangeText={setSearch}
                            placeholder={l('Ara…', 'Search…')}
                            accessibilityLabel={l('Ayarlarda ara', 'Search settings')}
                            clearLabel={l('Aramayı temizle', 'Clear search')}
                            autoCapitalize="none"
                        />
                        {searchResults.length > 0 ? (
                            <Card divided>
                                {searchResults.map(({ category, matchedSettings }) => {
                                    // A match on a single setting names it, so the row says where the setting is.
                                    const detail = matchedSettings.length > 0 ? matchedSettings.join(' • ') : category.summary;
                                    return (
                                        <ListRow
                                            key={category.id}
                                            icon={<CategoryGlyph id={category.id} color={colors.accent} />}
                                            title={category.title}
                                            // At a large text size the contents wrap; a no-break space keeps each
                                            // separator with the heading after it, so no line ends on a bullet.
                                            summary={detail.replaceAll(' • ', ' •\u00A0')}
                                            onPress={() => openSection(category.id)}
                                            accessibilityLabel={category.title}
                                            accessibilityHint={detail}
                                        />
                                    );
                                })}
                            </Card>
                        ) : (
                            <EmptyState
                                title={l(
                                    'Eşleşen ayar bulunamadı. Bir ayarın veya kategorinin adıyla arayın; örneğin “bildirim” veya “zaman kutusu”.',
                                    'No matching settings found. Search by the name of a setting or a category, for example “notification” or “timebox”.',
                                )}
                            />
                        )}
                    </>
                )}
            </ScrollView>
            {controlsHelpVisible ? (
                <AppDialog
                    visible
                    onClose={() => setControlsHelpVisible(false)}
                    title={l('Dokunma ve kaydırmayı özelleştirin', 'Customize taps and swipes')}
                    closeButton
                    actions={<Button label={l('Anladım', 'Got it')} onPress={() => setControlsHelpVisible(false)} />}
                >
                    <ScrollView
                        style={styles.helpScroll}
                        contentContainerStyle={styles.helpContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <SectionLabel>{l('ÇALIŞMA KONTROLLERİ', 'REVIEWER CONTROLS')}</SectionLabel>
                        <Text style={styles.helpIntro}>
                            {l(
                                'Kartın dokuz bölgesini ve dört kaydırma yönünü en sık kullandığınız işlemlere bağlayabilirsiniz. Seçimleriniz yalnızca çalışma ekranında geçerlidir.',
                                'Connect the card’s nine tap zones and four swipe directions to the actions you use most. Your choices apply only while studying.',
                            )}
                        </Text>

                        <Notice title={l('9 noktalı dokunma', '9-point touch')}>
                            {l(
                                'Soru tarafında varsayılan olarak her bölge yanıtı gösterir. Yanıt tarafında sol sütun Tekrar, orta sütun kapalı, sağ sütun İyi eylemini uygular. Bağlantılar, form alanları ve ses denetimleri kendi dokunmalarını almaya devam eder.',
                                'On the question side, every zone shows the answer by default. On the answer side, the left column answers Again, the center column is off, and the right column answers Good. Links, form fields, and audio controls continue to receive their own taps.',
                            )}
                        </Notice>

                        <View style={styles.helpStatus}>
                            <View style={[styles.helpStatusDot, (settings.gesturesEnabled || settings.ninePointTouchEnabled !== false) && styles.helpStatusDotOn]} />
                            <Text style={styles.helpStatusText}>
                                {l(
                                    `9 noktalı dokunma ${settings.ninePointTouchEnabled !== false ? 'açık' : 'kapalı'} · Kaydırma ${settings.gesturesEnabled ? 'açık' : 'kapalı'}`,
                                    `9-point touch ${settings.ninePointTouchEnabled !== false ? 'on' : 'off'} · Swipes ${settings.gesturesEnabled ? 'on' : 'off'}`,
                                )}
                            </Text>
                        </View>

                        <Text style={styles.helpSectionTitle} accessibilityRole="header">{l('Şu anki yönleriniz', 'Your current directions')}</Text>
                        <Card divided>
                            {([
                                ['left', l('Sola kaydırma', 'Swipe left'), settings.swipeLeftAction ?? 'tools'],
                                ['right', l('Sağa kaydırma', 'Swipe right'), settings.swipeRightAction ?? 'decks'],
                                ['up', l('Yukarı kaydırma', 'Swipe up'), settings.swipeUpAction ?? 'off'],
                                ['down', l('Aşağı kaydırma', 'Swipe down'), settings.swipeDownAction ?? 'off'],
                            ] as Array<[SwipeDirection, string, ReviewGestureAction]>).map(([direction, label, action]) => (
                                <ListRow
                                    key={label}
                                    icon={<SwipeDirectionIcon direction={direction} color={colors.accent} styles={styles} />}
                                    title={label}
                                    summary={<Text style={styles.actionValue}>{gestureActionLabel(action)}</Text>}
                                />
                            ))}
                        </Card>

                        <Notice title={l('Yanıt hareketleri nasıl çalışır?', 'How do answer gestures work?')}>
                            {l(
                                'Kartın sorusu açıksa bir yanıt eylemi önce cevabı gösterir. Cevap açıkken aynı dokunma veya kaydırma seçtiğiniz Tekrar, Zor, İyi ya da Kolay yanıtını uygular. Böylece görülmemiş bir cevap yanlışlıkla puanlanmaz.',
                                'When the question is showing, an answer action reveals it first. Once the answer is visible, the same tap or swipe applies your selected Again, Hard, Good, or Easy rating. This prevents an unseen answer from being graded accidentally.',
                            )}
                        </Notice>

                        <Notice title={l('Hassasiyet ayarı', 'Sensitivity')}>
                            {l(
                                `Geçerli değeriniz %${settings.swipeSensitivity ?? 100}. Yüksek değer kısa hareketleri daha kolay algılar; düşük değer daha uzun ve belirgin bir kaydırma ister. Başlangıç için %100 dengeli bir seçimdir.`,
                                `Your current value is ${settings.swipeSensitivity ?? 100}%. A higher value recognizes shorter movements; a lower value requires a longer, more deliberate swipe. 100% is a balanced starting point.`,
                            )}
                        </Notice>

                        <Notice title={l('Hazır düzenler', 'Presets')}>
                            <View style={styles.helpBulletRow}>
                                <Text style={styles.helpBullet}>•</Text>
                                <Text style={styles.helpBulletText}><Text style={styles.helpStrong}>{l('iPhone için dengeli:', 'Balanced for iPhone:')}</Text> {l('sol Araçlar, sağ Desteler; dikey hareketler kapalı.', 'left opens Tools, right returns to Decks; vertical gestures are off.')}</Text>
                            </View>
                            <View style={styles.helpBulletRow}>
                                <Text style={styles.helpBullet}>•</Text>
                                <Text style={styles.helpBulletText}><Text style={styles.helpStrong}>{l('Hızlı yanıt:', 'Fast answers:')}</Text> {l('sol Tekrar, sağ İyi, yukarı Kolay, aşağı Zor.', 'left Again, right Good, up Easy and down Hard.')}</Text>
                            </View>
                        </Notice>

                        <Notice title={l('Güvenli kullanım', 'Safe operation')}>
                            {l(
                                'Kaydırmayı kapatırsanız kart hareketleri normal gezinmeye bırakılır. Yanıt düğmelerini gizlemek için 9 noktalı dokunma veya kaydırmadan en az biri etkin olmalıdır.',
                                'When swipes are off, card movements are left to normal navigation. Before hiding answer buttons, keep either 9-point touch or swipes enabled.',
                            )}
                        </Notice>
                    </ScrollView>
                </AppDialog>
            ) : null}
            {gesturePickerTarget !== null ? (
                <AppDialog
                    visible
                    onClose={() => setGesturePickerTarget(null)}
                    title={gesturePickerTarget.kind === 'tap'
                        ? l('Dokunma eylemi', 'Tap action')
                        : l('Kaydırma eylemi', 'Swipe action')}
                    closeButton
                >
                    <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
                        {gestureActionOptions.map((option, index) => {
                            let selected = false;
                            if (gesturePickerTarget.kind === 'swipe') {
                                selected = (settings[gesturePickerTarget.field] ?? 'off') === option.value;
                            } else {
                                const actions = gesturePickerTarget.side === 'question'
                                    ? settings.questionTapActions ?? DEFAULT_QUESTION_TAP_ACTIONS
                                    : settings.answerTapActions ?? DEFAULT_ANSWER_TAP_ACTIONS;
                                selected = actions[gesturePickerTarget.zone] === option.value;
                            }
                            return (
                                <React.Fragment key={option.value}>
                                    {index > 0 ? <Divider /> : null}
                                    <PickerOption
                                        label={option.label}
                                        selected={selected}
                                        styles={styles}
                                        onPress={() => {
                                            if (gesturePickerTarget.kind === 'swipe') {
                                                updateSetting(gesturePickerTarget.field, option.value);
                                            } else {
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
                                    />
                                </React.Fragment>
                            );
                        })}
                    </ScrollView>
                </AppDialog>
            ) : null}
            {notificationThresholdPickerVisible ? (
                <AppDialog
                    visible
                    onClose={() => setNotificationThresholdPickerVisible(false)}
                    title={l('Şu durumda bildir', 'Notify when')}
                    closeButton
                >
                    <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
                        {notificationThresholdOptions.map((option, index) => {
                            const selected = option.value === null
                                ? !settings.studyNotificationsEnabled
                                : settings.studyNotificationsEnabled
                                    && normalizeStudyNotificationThreshold(settings.studyNotificationThreshold) === option.value;
                            return (
                                <React.Fragment key={option.value ?? 'never'}>
                                    {index > 0 ? <Divider /> : null}
                                    <PickerOption
                                        label={option.label}
                                        selected={Boolean(selected)}
                                        styles={styles}
                                        onPress={() => { void handleStudyNotificationPolicySelect(option.value); }}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </ScrollView>
                </AppDialog>
            ) : null}
        </SafeAreaView>
        </KeyboardDismissArea>
    );
}

/**
 * Closes the iPhone keyboard when the learner taps outside a field. On web the same press also
 * fires for the click that focuses a field and would blur it at once, so the web build leaves it out.
 */
function KeyboardDismissArea({ children }: { children: React.ReactElement }) {
    if (Platform.OS === 'web') return children;
    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            {children}
        </TouchableWithoutFeedback>
    );
}
