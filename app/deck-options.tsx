// Anki-style deck options screen: preset management plus every per-deck scheduling,
// display-order, burying, audio and easy-days setting the queue engine honors.
// Edits the deck's RAW config (boost-free) — "today only" extras live in custom study.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    KeyboardAvoidingView,
    Keyboard,
    Modal,
    Platform,
    Switch,
    Pressable,
    useWindowDimensions,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { useApp } from '../contexts/AppContext';
import {
    getDeck,
    getDeckConfig,
    getAllDeckConfigs,
    getDecksUsingConfig,
    saveDeckConfig,
    createPreset,
    renamePreset,
    restoreDeckConfigDefaults,
    deletePreset,
    assignDeckConfig,
    applyConfigToSubdecks,
    setDeckDescription,
    getDeckTodayLimits,
    setDeckTodayLimits,
    setDeckLimitOverrides,
} from '../lib/deckManager';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, type DeckConfig } from '../lib/models';
import type { AutoAdvanceAnswerAction, NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from '../lib/types';
import { normalizeNewCardGatherOrder } from '../lib/queueBuild';
import { saveCollectionDeckOptions } from '../lib/storage';
import {
    formatAnkiStepText,
    parseAnkiStepText,
    parseBoundedDecimalDraft,
    parseBoundedIntegerDraft,
    sanitizeNumericDraft,
    type NumericDraftIssue,
} from '../lib/deckOptionsForm';
import { useI18n } from '../hooks/useI18n';
import { getDB } from '../lib/db';
import SwipeDismissSheet from '../components/SwipeDismissSheet';

const DAY_FACTORS = [1, 0.5, 0] as const;

function parseCount(text: string, fallback: number, max: number = 9999): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
}

type ScreenStyles = ReturnType<typeof createStyles>;
type SelectOption = { key: string; label: string };
type OptionHelp = {
    title: string;
    summary: string;
    points: string[];
    note?: string;
    eyebrow: string;
    noteLabel: string;
    dismissLabel: string;
};

function OptionCard({ title, children, styles, wide = false, help }: {
    title: string;
    children: React.ReactNode;
    styles: ScreenStyles;
    wide?: boolean;
    help?: OptionHelp;
}) {
    const { height: windowHeight } = useWindowDimensions();
    const [helpOpen, setHelpOpen] = useState(false);
    const closeHelp = () => setHelpOpen(false);

    return (
        <View style={[styles.optionCard, wide && styles.optionCardWide]}>
            <View style={styles.optionCardHeader}>
                <Text style={styles.optionCardTitle}>{title}</Text>
                {help ? (
                    <TouchableOpacity
                        style={styles.helpButton}
                        onPress={() => { Keyboard.dismiss(); setHelpOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${title}: ${help.title}`}
                        accessibilityHint={help.summary}
                        accessibilityState={{ expanded: helpOpen }}
                    >
                        <View style={styles.helpBadge} pointerEvents="none">
                            <Text style={styles.helpBadgeText}>?</Text>
                        </View>
                    </TouchableOpacity>
                ) : null}
            </View>
            <View style={styles.optionCardBody}>{children}</View>
            {help ? (
                <Modal
                    visible={helpOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={closeHelp}
                    statusBarTranslucent
                >
                    <SafeAreaView style={styles.helpOverlay}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={closeHelp}
                            accessibilityLabel={help.dismissLabel}
                        />
                        <SwipeDismissSheet
                            active={helpOpen}
                            style={[styles.helpSheet, { maxHeight: Math.max(280, windowHeight - 120) }]}
                            onDismiss={closeHelp}
                            accessibilityViewIsModal
                        >
                            <View style={styles.helpSheetHeader}>
                                <View style={styles.helpSheetTitleWrap}>
                                    <Text style={styles.helpSheetEyebrow}>{help.eyebrow}</Text>
                                    <Text style={styles.helpSheetTitle}>{help.title}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.helpCloseButton}
                                    onPress={closeHelp}
                                    accessibilityRole="button"
                                    accessibilityLabel={help.dismissLabel}
                                >
                                    <Text style={styles.helpCloseText}>×</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                style={styles.helpSheetScroll}
                                contentContainerStyle={styles.helpSheetContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.helpSummary}>{help.summary}</Text>
                                <View style={styles.helpPoints}>
                                    {help.points.map((point, index) => (
                                        <View key={`${index}-${point}`} style={styles.helpPointRow}>
                                            <View style={styles.helpPointDot} />
                                            <Text style={styles.helpPointText}>{point}</Text>
                                        </View>
                                    ))}
                                </View>
                                {help.note ? (
                                    <View style={styles.helpNote}>
                                        <Text style={styles.helpNoteLabel}>{help.noteLabel}</Text>
                                        <Text style={styles.helpNoteText}>{help.note}</Text>
                                    </View>
                                ) : null}
                            </ScrollView>
                            <TouchableOpacity
                                style={styles.helpDismissButton}
                                onPress={closeHelp}
                                accessibilityRole="button"
                            >
                                <Text style={styles.helpDismissText}>{help.dismissLabel}</Text>
                            </TouchableOpacity>
                        </SwipeDismissSheet>
                    </SafeAreaView>
                </Modal>
            ) : null}
        </View>
    );
}

function NumberSetting({ label, value, onChange, styles, suffix, hint, kind = 'integer', error }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    styles: ScreenStyles;
    suffix?: string;
    hint?: string;
    kind?: 'integer' | 'decimal' | 'steps';
    error?: string;
}) {
    const keyboardType = kind === 'integer'
        ? 'number-pad' as const
        : kind === 'decimal'
            ? 'decimal-pad' as const
            : 'default' as const;
    const maxLength = kind === 'steps' ? 128 : kind === 'decimal' ? 10 : 5;
    return (
        <View style={styles.settingBlock}>
            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>{label}</Text>
                <View style={styles.numberControl}>
                    <TextInput
                        style={[styles.numberInput, error && styles.numberInputInvalid]}
                        value={value}
                        onChangeText={(text) => onChange(
                            kind === 'steps'
                                ? text.slice(0, maxLength)
                                : sanitizeNumericDraft(text, kind === 'decimal').slice(0, maxLength),
                        )}
                        keyboardType={keyboardType}
                        selectTextOnFocus
                        maxLength={maxLength}
                        autoCorrect={false}
                        autoCapitalize="none"
                        accessibilityLabel={label}
                        accessibilityHint={error}
                    />
                    {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
                </View>
            </View>
            {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text> : null}
            {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
        </View>
    );
}

function ToggleSetting({ label, value, onChange, styles, colors, hint }: {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    styles: ScreenStyles;
    colors: ColorScheme;
    hint?: string;
}) {
    return (
        <View style={styles.settingBlock}>
            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Switch
                    value={value}
                    onValueChange={onChange}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    accessibilityLabel={label}
                />
            </View>
            {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
        </View>
    );
}

function SelectSetting({ label, value, options, onChange, styles, colors, cancelLabel }: {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    styles: ScreenStyles;
    colors: ColorScheme;
    cancelLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.key === value) ?? options[0];
    return (
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label}</Text>
            <TouchableOpacity
                style={styles.selectControl}
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
            >
                <Text style={styles.selectControlText} numberOfLines={1}>{selected?.label ?? ''}</Text>
                <Text style={styles.selectChevron}>⌄</Text>
            </TouchableOpacity>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{label}</Text>
                        <ScrollView style={styles.selectList}>
                            {options.map((option) => (
                                <TouchableOpacity
                                    key={option.key}
                                    style={[styles.selectOption, option.key === value && styles.selectOptionActive]}
                                    onPress={() => { onChange(option.key); setOpen(false); }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: option.key === value }}
                                >
                                    <Text style={[styles.selectOptionText, option.key === value && { color: colors.accent, fontWeight: '700' }]}>
                                        {option.label}
                                    </Text>
                                    {option.key === value ? <Text style={styles.selectCheck}>✓</Text> : null}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={cancelLabel}>
                            <Text style={styles.cancelText}>{cancelLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function LimitTabs({ value, onChange, styles, labels }: {
    value: 'preset' | 'deck' | 'today';
    onChange: (value: 'preset' | 'deck' | 'today') => void;
    styles: ScreenStyles;
    labels: { preset: string; deck: string; today: string };
}) {
    return (
        <View style={styles.limitTabs}>
            {(['preset', 'deck', 'today'] as const).map((key) => (
                <TouchableOpacity
                    key={key}
                    style={[styles.limitTab, value === key && styles.limitTabActive]}
                    onPress={() => onChange(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: value === key }}
                >
                    <Text style={[styles.limitTabText, value === key && styles.limitTabTextActive]}>{labels[key]}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function DeckOptionsScreen() {
    const { t, l } = useI18n();
    const dayLabels = l('Pzt,Sal,Çar,Per,Cum,Cmt,Paz', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
    const factorLabel = (factor: number) => factor === 1 ? l('Normal', 'Normal') : factor === 0.5 ? l('Azaltılmış', 'Reduced') : l('Yok', 'None');
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { width } = useWindowDimensions();
    const useTwoColumns = width >= 900;
    const router = useRouter();
    const navigation = useNavigation();
    const params = useLocalSearchParams();
    const { bumpDataVersion, refreshData, settings } = useApp();

    const deckId = Number(Array.isArray(params.deckId) ? params.deckId[0] : params.deckId);
    const deck = useMemo(() => (Number.isFinite(deckId) ? getDeck(deckId) : null), [deckId]);
    const todayLimits = useMemo(
        () => deck ? getDeckTodayLimits(deck.id, settings.dayRolloverHour) : {},
        [deck?.id, settings.dayRolloverHour],
    );

    const [configId, setConfigId] = useState<number>(deck?.configId || DEFAULT_DECK_CONFIG.id);
    const [presetRevision, setPresetRevision] = useState(0);
    const initialConfig = useMemo(() => getDeckConfig(configId), [configId, presetRevision]);

    // Form state, re-seeded whenever the preset changes.
    const [form, setForm] = useState(() => formFromConfig(initialConfig, deck?.description ?? ''));
    const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({
        configId: deck?.configId || DEFAULT_DECK_CONFIG.id,
        form: formFromConfig(initialConfig, deck?.description ?? ''),
    }));
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveMessage, setSaveMessage] = useState('');
    const allowNavigationRef = useRef(false);
    const [presetPickerOpen, setPresetPickerOpen] = useState(false);
    const [presetActionsOpen, setPresetActionsOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameText, setRenameText] = useState('');
    const [newLimitScope, setNewLimitScope] = useState<'preset' | 'deck' | 'today'>('preset');
    const [reviewLimitScope, setReviewLimitScope] = useState<'preset' | 'deck' | 'today'>('preset');

    function formFromConfig(
        config: DeckConfig,
        description: string,
        sourceDeck = deck,
        sourceTodayLimits = todayLimits,
    ) {
        return {
            newPerDay: String(config.newPerDay),
            maxReviewsPerDay: String(config.maxReviewsPerDay),
            deckNewLimit: sourceDeck?.newLimit === undefined ? '' : String(sourceDeck.newLimit),
            deckReviewLimit: sourceDeck?.reviewLimit === undefined ? '' : String(sourceDeck.reviewLimit),
            todayNewLimit: sourceTodayLimits.newLimit === undefined ? '' : String(sourceTodayLimits.newLimit),
            todayReviewLimit: sourceTodayLimits.reviewLimit === undefined ? '' : String(sourceTodayLimits.reviewLimit),
            learningSteps: formatAnkiStepText(config.learningSteps ?? []),
            graduatingIvl: String(config.graduatingIvl),
            easyIvl: String(config.easyIvl),
            insertionOrder: config.insertionOrder,
            relearningSteps: formatAnkiStepText(config.relearningSteps ?? []),
            minIvl: String(config.minIvl),
            leechThreshold: String(config.leechThreshold),
            leechAction: config.leechAction,
            newCardGatherOrder: normalizeNewCardGatherOrder(config.newCardGatherOrder),
            newCardSortOrder: config.newCardSortOrder ?? 'template',
            newReviewOrder: config.newReviewOrder ?? 'mix',
            interdayLearningMix: config.interdayLearningMix ?? 'mix',
            reviewSortOrder: config.reviewSortOrder ?? 'dueRandom',
            buryNewSiblings: config.buryNewSiblings,
            buryReviewSiblings: config.buryReviewSiblings,
            buryInterdayLearningSiblings: config.buryInterdayLearningSiblings,
            autoPlayAudio: config.autoPlayAudio ?? true,
            skipQuestionWhenReplayingAnswer: config.skipQuestionWhenReplayingAnswer ?? false,
            showTimer: config.showTimer,
            maxAnswerSecs: String(config.maxAnswerSecs),
            stopTimerOnAnswer: config.stopTimerOnAnswer ?? false,
            secondsToShowQuestion: String(config.secondsToShowQuestion ?? 0),
            secondsToShowAnswer: String(config.secondsToShowAnswer ?? 0),
            questionAction: config.questionAction ?? 'showAnswer',
            waitForAudio: config.waitForAudio ?? true,
            answerAction: config.answerAction ?? 'bury',
            newCardsIgnoreReviewLimit: settings.newCardsIgnoreReviewLimit === true,
            limitsStartFromTop: settings.limitsStartFromTop === true,
            easyDays: Array.isArray(config.easyDays) && config.easyDays.length === 7
                ? [...config.easyDays]
                : [1, 1, 1, 1, 1, 1, 1],
            startingEase: (config.startingEase / 1000).toFixed(2),
            easyBonus: String(config.easyBonus),
            hardIvl: String(config.hardIvl),
            ivlModifier: String(config.ivlModifier),
            maxIvl: String(config.maxIvl),
            newIvlPercent: String(Math.round((config.newIvlPercent ?? 0) * 100)),
            description,
        };
    }

    const snapshotForm = (nextConfigId: number, nextForm: typeof form) => JSON.stringify({
        configId: nextConfigId,
        form: nextForm,
    });
    const isDirty = snapshotForm(configId, form) !== savedSnapshot;

    useEffect(() => navigation.addListener('beforeRemove', (event: any) => {
        if (!isDirty || allowNavigationRef.current) return;
        event.preventDefault();
        confirm(
            l('Kaydedilmemiş değişiklikler', 'Unsaved changes'),
            l(
                'Bu sayfada kaydedilmemiş ayarlar var. Çıkarsanız değişiklikler kaybolacak.',
                'There are unsaved settings on this page. They will be lost if you leave.',
            ),
            () => {
                allowNavigationRef.current = true;
                navigation.dispatch(event.data.action);
            },
            { destructive: true },
        );
    }), [isDirty, l, navigation]);

    const applyPresetSelection = (nextId: number, markSaved = false) => {
        const nextForm = formFromConfig(getDeckConfig(nextId), form.description, getDeck(deckId) ?? deck);
        setConfigId(nextId);
        setForm(nextForm);
        if (markSaved) setSavedSnapshot(snapshotForm(nextId, nextForm));
        setSaveState('idle');
        setSaveMessage('');
        setPresetPickerOpen(false);
    };

    const switchPreset = (nextId: number) => {
        if (nextId === configId) {
            setPresetPickerOpen(false);
            return;
        }
        if (!isDirty) {
            applyPresetSelection(nextId);
            return;
        }
        confirm(
            l('Kaydedilmemiş ayarlar', 'Unsaved settings'),
            l(
                'Başka bir ayar grubuna geçerseniz bu formdaki kaydedilmemiş değişiklikler silinecek.',
                'Switching presets will discard the unsaved changes in this form.',
            ),
            () => applyPresetSelection(nextId),
            { destructive: true },
        );
    };

    if (!deck) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.missing}>{l('Deste bulunamadı.', 'Deck not found.')}</Text>
            </SafeAreaView>
        );
    }

    const usedBy = getDecksUsingConfig(configId).length;
    // Imported/internal names such as "Default" describe a config record, not a deck. Resolve
    // each config to the root deck that owns/uses it; the app's built-in config is TUS Kartları.
    const presetDisplayName = (presetId: number): string => {
        if (presetId === DEFAULT_DECK_CONFIG.id) return 'TUS Kartları';
        const presetDecks = getDecksUsingConfig(presetId);
        const representative = presetDecks.find((candidate) => !candidate.name.includes('::'))
            ?? presetDecks[0];
        return representative
            ? getDeckDisplayName(representative.name)
            : 'TUS Kartları';
    };
    const presetName = presetDisplayName(configId);

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setSaveState('idle');
        setSaveMessage('');
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const cycleEasyDay = (index: number) => {
        setSaveState('idle');
        setSaveMessage('');
        setForm((prev) => {
            const next = [...prev.easyDays];
            const current = DAY_FACTORS.indexOf(next[index] as typeof DAY_FACTORS[number]);
            next[index] = DAY_FACTORS[(current + 1) % DAY_FACTORS.length];
            return { ...prev, easyDays: next };
        });
    };

    const issueMessage = (issue: NumericDraftIssue | null, min: number, max: number): string | undefined => {
        if (!issue) return undefined;
        if (issue === 'required') return l('Bu alan zorunludur.', 'This field is required.');
        if (issue === 'integer') return l('Yalnızca tam sayı yazın.', 'Enter a whole number.');
        if (issue === 'number') return l('Geçerli bir sayı yazın.', 'Enter a valid number.');
        return l(`${min} ile ${max} arasında bir değer yazın.`, `Enter a value between ${min} and ${max}.`);
    };

    const validateFormDraft = () => {
        type FormKey = keyof typeof form;
        const errors: Partial<Record<FormKey, string>> = {};
        const integers = {} as Partial<Record<FormKey, number | undefined>>;
        const decimals = {} as Partial<Record<FormKey, number | undefined>>;
        const integer = (key: FormKey, min: number, max: number, allowEmpty = false) => {
            const result = parseBoundedIntegerDraft(String(form[key]), min, max, allowEmpty);
            integers[key] = result.value;
            const message = issueMessage(result.issue, min, max);
            if (message) errors[key] = message;
        };
        const decimal = (key: FormKey, min: number, max: number) => {
            const result = parseBoundedDecimalDraft(String(form[key]), min, max);
            decimals[key] = result.value;
            const message = issueMessage(result.issue, min, max);
            if (message) errors[key] = message;
        };

        integer('newPerDay', 0, 9999);
        integer('maxReviewsPerDay', 0, 9999);
        integer('deckNewLimit', 0, 9999, true);
        integer('deckReviewLimit', 0, 9999, true);
        integer('todayNewLimit', 0, 9999, true);
        integer('todayReviewLimit', 0, 9999, true);
        integer('graduatingIvl', 1, 36500);
        integer('easyIvl', 1, 36500);
        integer('minIvl', 1, 36500);
        integer('leechThreshold', 1, 9999);
        integer('maxAnswerSecs', 1, 7200);
        integer('secondsToShowQuestion', 0, 7200);
        integer('secondsToShowAnswer', 0, 7200);
        integer('maxIvl', 1, 36500);
        integer('newIvlPercent', 0, 100);
        decimal('startingEase', 1.3, 5);
        decimal('easyBonus', 1, 2);
        decimal('hardIvl', 1, 2);
        decimal('ivlModifier', 0.1, 3);

        const learningSteps = parseAnkiStepText(form.learningSteps);
        if (!learningSteps) {
            errors.learningSteps = l(
                'En az bir geçerli adım yazın: 30s, 10m, 2h veya 1d.',
                'Enter at least one valid step: 30s, 10m, 2h, or 1d.',
            );
        }
        const relearningSteps = parseAnkiStepText(form.relearningSteps, true);
        if (relearningSteps === null) {
            errors.relearningSteps = l(
                'Adımları boşlukla ayırın: 30s, 10m, 2h veya 1d.',
                'Separate steps with spaces: 30s, 10m, 2h, or 1d.',
            );
        }
        const graduating = integers.graduatingIvl;
        const easy = integers.easyIvl;
        if (graduating !== undefined && easy !== undefined && easy < graduating) {
            errors.easyIvl = l(
                'Kolay aralığı mezuniyet aralığından kısa olamaz.',
                'The Easy interval cannot be shorter than the graduating interval.',
            );
        }

        return { errors, integers, decimals, learningSteps, relearningSteps };
    };

    const validation = validateFormDraft();
    const hasValidationErrors = Object.keys(validation.errors).length > 0;

    const persistForm = (includeSubdecks = false): { saved: boolean; subdecksChanged: number } => {
        if (hasValidationErrors || !validation.learningSteps || validation.relearningSteps === null) {
            const firstError = Object.values(validation.errors)[0];
            alert(
                l('Ayarları kontrol edin', 'Check the settings'),
                firstError ?? l('Bazı alanlar geçerli değil.', 'Some fields are invalid.'),
            );
            return { saved: false, subdecksChanged: 0 };
        }

        let db: ReturnType<typeof getDB> | null = null;
        let transactionOpen = false;
        let subdecksChanged = 0;
        try {
            db = getDB();
            const base = getDeckConfig(configId);
            const integer = (key: keyof typeof form) => validation.integers[key] as number;
            const decimal = (key: keyof typeof form) => validation.decimals[key] as number;
            const updated: DeckConfig = {
                ...base,
                id: configId,
                mod: Math.floor(Date.now() / 1000),
                usn: -1,
                newPerDay: integer('newPerDay'),
                maxReviewsPerDay: integer('maxReviewsPerDay'),
                learningSteps: validation.learningSteps,
                graduatingIvl: integer('graduatingIvl'),
                easyIvl: integer('easyIvl'),
                insertionOrder: form.insertionOrder,
                relearningSteps: validation.relearningSteps,
                minIvl: integer('minIvl'),
                leechThreshold: integer('leechThreshold'),
                leechAction: form.leechAction,
                newCardGatherOrder: form.newCardGatherOrder,
                newCardSortOrder: form.newCardSortOrder,
                newReviewOrder: form.newReviewOrder,
                interdayLearningMix: form.interdayLearningMix,
                reviewSortOrder: form.reviewSortOrder,
                buryNewSiblings: form.buryNewSiblings,
                buryReviewSiblings: form.buryReviewSiblings,
                buryInterdayLearningSiblings: form.buryInterdayLearningSiblings,
                autoPlayAudio: form.autoPlayAudio,
                skipQuestionWhenReplayingAnswer: form.skipQuestionWhenReplayingAnswer,
                showTimer: form.showTimer,
                maxAnswerSecs: integer('maxAnswerSecs'),
                stopTimerOnAnswer: form.stopTimerOnAnswer,
                secondsToShowQuestion: integer('secondsToShowQuestion'),
                secondsToShowAnswer: integer('secondsToShowAnswer'),
                questionAction: form.questionAction,
                waitForAudio: form.waitForAudio,
                answerAction: form.answerAction,
                easyDays: [...form.easyDays],
                startingEase: Math.round(decimal('startingEase') * 1000),
                easyBonus: decimal('easyBonus'),
                hardIvl: decimal('hardIvl'),
                ivlModifier: decimal('ivlModifier'),
                maxIvl: integer('maxIvl'),
                newIvlPercent: integer('newIvlPercent') / 100,
            };

            db.execSync('BEGIN TRANSACTION;');
            transactionOpen = true;
            saveDeckConfig(updated);
            if (deck.configId !== configId) assignDeckConfig(deck.id, configId);
            setDeckLimitOverrides(deck.id, validation.integers.deckNewLimit, validation.integers.deckReviewLimit);
            setDeckTodayLimits(
                deck.id,
                validation.integers.todayNewLimit,
                validation.integers.todayReviewLimit,
                settings.dayRolloverHour,
            );
            setDeckDescription(deck.id, form.description);
            saveCollectionDeckOptions({
                newCardsIgnoreReviewLimit: form.newCardsIgnoreReviewLimit,
                limitsStartFromTop: form.limitsStartFromTop,
            });
            if (includeSubdecks) subdecksChanged = applyConfigToSubdecks(deck.id);
            db.execSync('COMMIT;');
            transactionOpen = false;

            // The transaction is already durable here. A presentation refresh must never turn a
            // successful commit into a false “nothing was saved” error.
            try {
                const savedDeck = getDeck(deck.id) ?? deck;
                const savedToday = getDeckTodayLimits(deck.id, settings.dayRolloverHour);
                const normalizedForm = formFromConfig(getDeckConfig(configId), savedDeck.description, savedDeck, savedToday);
                setForm(normalizedForm);
                setSavedSnapshot(snapshotForm(configId, normalizedForm));
                setPresetRevision((value) => value + 1);
                refreshData();
                bumpDataVersion();
            } catch (refreshError) {
                console.warn('[DeckOptions] saved but refresh failed:', refreshError);
                setSavedSnapshot(snapshotForm(configId, form));
                bumpDataVersion();
            }
            return { saved: true, subdecksChanged };
        } catch (e) {
            if (transactionOpen && db) {
                try { db.execSync('ROLLBACK;'); } catch { /* keep the original write error */ }
            }
            console.warn('[DeckOptions] save failed:', e);
            setSaveState('error');
            setSaveMessage(l('Kayıt tamamlanamadı. Hiçbir değişiklik uygulanmadı.', 'Save failed. No changes were applied.'));
            alert(t('common.error'), l('Ayarlar kaydedilemedi.', 'Could not save the settings.'));
            return { saved: false, subdecksChanged: 0 };
        }
    };

    const handleSave = () => {
        Keyboard.dismiss();
        if (!isDirty) {
            setSaveState('saved');
            setSaveMessage(l('Tüm değişiklikler kaydedildi.', 'All changes are saved.'));
            return;
        }
        setSaveState('saving');
        const result = persistForm();
        if (!result.saved) {
            if (hasValidationErrors) setSaveState('error');
            return;
        }
        const affectedDecks = getDecksUsingConfig(configId).length;
        setSaveState('saved');
        setSaveMessage(affectedDecks > 1
            ? l(`Ayarlar kaydedildi. Bu ayar grubunu kullanan ${affectedDecks} deste etkilendi.`, `Settings saved. ${affectedDecks} decks using this preset were updated.`)
            : l('Ayarlar güvenle kaydedildi.', 'Settings were saved safely.'));
    };

    const handleAddPreset = () => {
        const create = () => {
            const preset = createPreset(getDeckDisplayName(deck.name), DEFAULT_DECK_CONFIG.id);
            assignDeckConfig(deck.id, preset.id);
            applyPresetSelection(preset.id, true);
            bumpDataVersion();
        };
        if (!isDirty) create();
        else confirm(
            l('Yeni ayar grubu oluştur', 'Create a new preset'),
            l('Kaydedilmemiş değişiklikler bırakılacak ve yeni bir ayar grubu oluşturulacak.', 'Unsaved changes will be discarded and a new preset will be created.'),
            create,
            { destructive: true },
        );
    };

    const handleClonePreset = () => {
        const clone = () => {
            const preset = createPreset(l(`${getDeckDisplayName(deck.name)} ayarları`, `${getDeckDisplayName(deck.name)} options`), configId);
            assignDeckConfig(deck.id, preset.id);
            applyPresetSelection(preset.id, true);
            bumpDataVersion();
        };
        if (!isDirty) clone();
        else confirm(
            l('Ayar grubunu klonla', 'Clone preset'),
            l('Klon, son kaydedilen ayarlardan oluşturulacak; kaydedilmemiş değişiklikler bırakılacak.', 'The clone will use the last saved settings; unsaved changes will be discarded.'),
            clone,
            { destructive: true },
        );
    };

    const handleRestoreDefaults = () => {
        confirm(
            l('Varsayılana dön', 'Restore Defaults'),
            l(
                `“${presetName}” ayar grubunun zamanlama seçenekleri varsayılanlara dönecek. Bu grubu kullanan ${usedBy} deste etkilenecek. Ayar grubu adı, deste özel limitleri, yalnızca bugünkü limitler ve deste açıklaması korunacak.`,
                `Scheduling options in “${presetName}” will be restored to defaults. ${usedBy} decks using this preset will be affected. The preset name, deck-specific limits, today-only limits, and deck description will be preserved.`,
            ),
            () => {
                try {
                    const restored = restoreDeckConfigDefaults(configId);
                    const nextForm = {
                        ...formFromConfig(restored, form.description),
                        deckNewLimit: form.deckNewLimit,
                        deckReviewLimit: form.deckReviewLimit,
                        todayNewLimit: form.todayNewLimit,
                        todayReviewLimit: form.todayReviewLimit,
                        description: form.description,
                    };
                    setForm(nextForm);
                    setSavedSnapshot(snapshotForm(configId, nextForm));
                    setSaveState('saved');
                    setSaveMessage(l('Ayar grubu varsayılan değerlere döndürüldü.', 'The preset was restored to default values.'));
                    setPresetRevision((value) => value + 1);
                    bumpDataVersion();
                    alert(
                        l('Varsayılanlara dönüldü', 'Defaults Restored'),
                        l('Ayar grubunun zamanlama seçenekleri varsayılanlara döndürüldü.', 'The preset scheduling options were restored to defaults.'),
                    );
                } catch (error) {
                    console.warn('[DeckOptions] restore defaults failed:', error);
                    alert(t('common.error'), l('Ayar grubu varsayılanlara döndürülemedi.', 'The preset could not be restored to defaults.'));
                }
            },
            { destructive: true },
        );
    };

    const handleDeletePreset = () => {
        if (configId === DEFAULT_DECK_CONFIG.id) {
            alert(l('Bilgi', 'Info'), l('Varsayılan ayar grubu silinemez.', 'The default preset cannot be deleted.'));
            return;
        }
        confirm(
            l('Ayar grubunu sil', 'Delete Preset'),
            l(`“${presetName}” silinecek; bu grubu kullanan ${usedBy} deste varsayılan ayarlara dönecek.`, `“${presetName}” will be deleted; ${usedBy} decks using it will return to the default preset.`),
            () => {
                deletePreset(configId);
                bumpDataVersion();
                applyPresetSelection(DEFAULT_DECK_CONFIG.id, true);
            },
            { destructive: true },
        );
    };

    const handleApplyToSubdecks = () => {
        Keyboard.dismiss();
        setSaveState('saving');
        const result = persistForm(true);
        if (!result.saved) {
            setSaveState('error');
            return;
        }
        const changed = result.subdecksChanged;
        setSaveState('saved');
        setSaveMessage(changed > 0
            ? l(`Kaydedildi; ${changed} alt deste bu ayar grubuna geçirildi.`, `Saved; ${changed} subdecks were assigned to this preset.`)
            : l('Kaydedildi. Tüm alt desteler zaten bu ayar grubunu kullanıyor.', 'Saved. All subdecks already use this preset.'));
        alert(l('Kaydedildi ve Uygulandı', 'Saved and Applied'), changed > 0
            ? l(`Ayarlar kaydedildi; ${changed} alt deste bu ayar grubuna geçirildi.`, `Settings were saved, and ${changed} subdecks were assigned to this preset.`)
            : l('Ayarlar kaydedildi. Tüm alt desteler zaten bu ayar grubunda.', 'Settings were saved. All subdecks already use this preset.'));
    };

    const cancelLabel = t('common.cancel');
    const limitLabels = {
        preset: l('Ayar grubu', 'Preset'),
        deck: l('Bu deste', 'This deck'),
        today: l('Yalnızca bugün', 'Today only'),
    };
    const helpChrome = {
        eyebrow: l('AYAR REHBERİ', 'SETTING GUIDE'),
        noteLabel: l('NOT', 'NOTE'),
        dismissLabel: l('Anladım', 'Got it'),
    };
    const optionHelp = {
        dailyLimits: {
            title: l('Günlük limitler nasıl uygulanır?', 'How daily limits are applied'),
            summary: l(
                'Bu bölüm, bir çalışma gününde kuyruğa alınabilecek yeni ve tekrar kartlarının üst sınırını belirler.',
                'This section sets the maximum number of new and review cards that can enter a study day.',
            ),
            points: [
                l('Ayar grubu, tüm bağlı destelerin temel değeridir. “Bu deste” kalıcı bir deste istisnası, “Yalnızca bugün” ise bir sonraki çalışma gününde sıfırlanan geçici istisnadır.', 'The preset is the base value for every linked deck. “This deck” is a permanent deck override; “Today only” resets on the next study day.'),
                l('“Yeni kartlar tekrar limitini yok saysın” kapalıyken tekrar sınırı günün toplam yükünü de sınırlar. Açıkken yeni kartlar, tekrar sınırı dolsa bile gösterilebilir.', 'When “New cards ignore review limit” is off, the review cap also limits the day’s total workload. When on, new cards can still appear after the review cap is reached.'),
                l('“Limitler en üst desteden başlasın” açıkken bir alt desteyi doğrudan çalışsanız bile üst destelerin sınırları uygulanır.', 'When “Limits start from top” is on, parent-deck limits still apply when you study a subdeck directly.'),
            ],
            note: l('Gün sınırını aşmış öğrenme kartları tekrar limitine dahildir. Limitler bekleyen kartları silmez; yalnızca bugün gösterilecek miktarı sınırlar.', 'Interday learning cards count toward the review limit. Limits do not delete waiting cards; they only cap what is shown today.'),
            ...helpChrome,
        },
        newCards: {
            title: l('Yeni kartların öğrenme akışı', 'New-card learning flow'),
            summary: l('Bu seçenekler yalnızca yeni ve öğrenme aşamasındaki kartları etkiler.', 'These options affect only new cards and cards still in learning.'),
            points: [
                l('Adımları boşlukla yazın: “1m 10m”, İyi yanıtından sonra kartı önce 1, sonra 10 dakika içinde yeniden gösterir. s, m, h ve d birimleri desteklenir.', 'Enter space-separated steps: “1m 10m” shows the card after 1 minute, then 10 minutes after Good. s, m, h, and d units are supported.'),
                l('Tekrar ilk adıma döndürür. Son adımda İyi kartı mezun eder; Kolay ise kalan adımları atlayarak kolay aralığını kullanır.', 'Again returns to the first step. Good on the final step graduates the card; Easy skips the remaining steps and uses the Easy interval.'),
                l('Ekleniş sırası kartların konum numaralarını belirler. Günlük çalışma sırasını değiştirmek için “Görüntüleme Sırası” bölümünü kullanın.', 'Insertion order assigns card position numbers. Use Display Order to control the daily study sequence.'),
            ],
            note: l('Bu değişiklikler daha önce oluşturulmuş öğrenme gecikmelerini geriye dönük değiştirmez.', 'These changes do not retroactively alter learning delays that were already scheduled.'),
            ...helpChrome,
        },
        lapses: {
            title: l('Unutulan kartlara ne olur?', 'What happens to forgotten cards'),
            summary: l('Bir tekrar kartında Tekrar’a basılması “unutma” sayılır ve bu bölüm devreye girer.', 'Pressing Again on a review card counts as a lapse and activates this section.'),
            points: [
                l('Yeniden öğrenme adımları, unutulan kartın kısa aralıklarla tekrar edilmesini sağlar. Alanı boş bırakırsanız kart yeniden öğrenmeye girmeden doğrudan yeni aralık alır.', 'Relearning steps repeat the forgotten card at short delays. Leave the field empty to assign a new interval without entering relearning.'),
                l('En az aralık, yeniden öğrenme tamamlandıktan sonra verilebilecek en kısa gün aralığıdır.', 'Minimum interval is the shortest day-based delay allowed after relearning finishes.'),
                l('Eşiğe ulaşan karta “leech” etiketi eklenir. İsterseniz kart aynı anda askıya alınarak çalışma kuyruğundan çıkarılır.', 'A card reaching the threshold receives the “leech” tag. It can also be suspended and removed from the study queue.'),
            ],
            note: l('Sürekli unutulan kartları yalnızca daha sık göstermek yerine sadeleştirmek veya yeniden yazmak genellikle daha etkilidir.', 'Rewriting or simplifying a repeatedly forgotten card is often more effective than merely showing it more often.'),
            ...helpChrome,
        },
        displayOrder: {
            title: l('Toplama ve sıralama farkı', 'Gathering versus sorting'),
            summary: l('Toplama “hangi kartların”, sıralama ise toplanan kartların “hangi sırayla” gösterileceğini belirler.', 'Gathering chooses which cards enter today; sorting decides the order of the cards already gathered.'),
            points: [
                l('Yeni kart toplama sırası deste, konum, rastgele not veya rastgele kart yaklaşımıyla bugünkü yeni kart havuzunu oluşturur.', 'New-card gather order builds today’s pool by deck, position, random note, or random card.'),
                l('Yeni / tekrar sırası yeni kartların tekrarlarla karışmasını ya da önce/sonra gösterilmesini belirler. Gün aşan öğrenme / tekrar sırası aynı kararı gün sınırını aşan öğrenme kartları için verir.', 'New/review order mixes new cards with reviews or places them before/after. Interday learning/review order does the same for learning cards that crossed a day boundary.'),
                l('Tekrar sıralaması yalnızca zamanı gelmiş kartların önceliğini değiştirir; kartların vade tarihlerini veya aralıklarını değiştirmez.', 'Review sort order only changes priority among due cards; it does not alter due dates or intervals.'),
            ],
            note: l('Üst deste çalışılırken görüntüleme sırası seçtiğiniz üst destenin ayar grubundan alınır; alt destelerin görüntüleme ayarları kullanılmaz.', 'When studying a parent deck, display order comes from the selected parent deck’s preset, not its subdecks.'),
            ...helpChrome,
        },
        burying: {
            title: l('Kardeş kartları gömme', 'Burying sibling cards'),
            summary: l('Aynı nottan üretilen kartlar kardeştir; örneğin ön→arka, arka→ön ve komşu cloze kartları.', 'Cards generated from the same note are siblings, such as front→back, back→front, and adjacent cloze cards.'),
            points: [
                l('Bir kardeş gösterildiğinde etkin türdeki diğer kardeşler ertesi çalışma gününe kadar gizlenir.', 'After one sibling is shown, enabled sibling types are hidden until the next study day.'),
                l('Kuyruk önceliği gün içi öğrenme, gün aşan öğrenme, tekrar ve yeni kart şeklindedir; daha erken türdeki kart korunur.', 'Queue priority is intraday learning, interday learning, review, then new; the earlier card type is kept.'),
                l('Bu davranış, aynı oturumdaki bir kartın başka bir kardeşin cevabını ele vermesini önler.', 'This prevents one card in a session from revealing the answer to a sibling.'),
            ],
            note: l('Gömme askıya alma değildir. Kartlar otomatik geri gelir ve çalışma geçmişi değişmez.', 'Burying is not suspension. Cards return automatically and review history is unchanged.'),
            ...helpChrome,
        },
        audio: {
            title: l('Kart sesi', 'Card audio'),
            summary: l('Ses seçenekleri kart açılışını ve cevap tarafındaki manuel yeniden oynatmayı ayrı ayrı yönetir.', 'Audio options separately control card-side autoplay and manual replay on the answer side.'),
            points: [
                l('Otomatik oynatma açıkken ilgili yüzdeki ses kart yüzü görünür görünmez başlar.', 'With autoplay enabled, audio on the current side starts as soon as that side appears.'),
                l('Otomatik oynatma kapalıysa ses yalnızca karttaki oynatma kontrolüyle başlatılır.', 'With autoplay disabled, audio starts only from the card’s play control.'),
                l('“Cevabı yeniden oynatırken soruyu atla”, cevap tarafında yeniden oynat düğmesine bastığınızda soru yüzünün seslerini tekrar çalmaz.', '“Skip question when replaying answer” prevents question-side audio from replaying when Replay is used on the answer side.'),
            ],
            note: l('Soruyu atlama seçeneği otomatik oynatmayı etkilemez; yalnızca manuel yeniden oynatma davranışını değiştirir.', 'Skipping the question does not affect autoplay; it only changes manual replay behavior.'),
            ...helpChrome,
        },
        timers: {
            title: l('Cevap zamanlayıcısı', 'Answer timer'),
            summary: l('Zamanlayıcı çalışma süresini ölçer; kartın derecesini veya zamanlama aralığını değiştirmez.', 'The timer measures study time; it does not change a card’s grade or scheduling interval.'),
            points: [
                l('En fazla cevap süresi, tek bir inceleme için istatistiklere yazılabilecek süreyi sınırlar.', 'Maximum answer time caps the time recorded for a single review.'),
                l('Ekran zamanlayıcısı aynı sayacı çalışma ekranında gösterir ve üst sınıra ulaştığında durur.', 'The on-screen timer displays the same counter during study and stops at the maximum.'),
                l('“Cevap gösterilince durdur” yalnızca görünen sayacı dondurur; istatistiklere kaydedilen toplam süre cevap düğmesine basılana kadar devam eder.', '“Stop on answer” freezes only the visible timer; the time recorded for statistics continues until a grade is pressed.'),
            ],
            note: l('Sık sık üst sınırı aşıyorsanız süreyi yükseltmekten önce kartı daha kısa ve tek odaklı hâle getirmeyi düşünün.', 'If you often hit the cap, consider making the card shorter and more focused before raising the limit.'),
            ...helpChrome,
        },
        autoAdvance: {
            title: l('Otomatik ilerleme nasıl çalışır?', 'How Auto Advance works'),
            summary: l('Otomatik ilerleme, belirlediğiniz süre dolunca cevabı gösterebilir ve ardından seçtiğiniz işlemi uygulayabilir.', 'Auto Advance can reveal the answer after a delay and then perform the selected action.'),
            points: [
                l('Soru veya cevap süresini 0 yapmak o aşamayı kapatır. Soru işlemi cevabı açabilir veya yalnızca süre uyarısı gösterebilir.', 'Setting the question or answer time to 0 disables that stage. The question action can reveal the answer or only show a time reminder.'),
                l('Sesin bitmesini bekle açıkken geri sayım, o yüzdeki ses tamamlanana kadar işlemi uygulamaz.', 'When Wait for audio is on, the action is delayed until audio on that side finishes.'),
                l('Cevap işlemi kartı gömebilir, Tekrar/Zor/İyi ile yanıtlayabilir veya yalnızca süre uyarısı gösterebilir.', 'The answer action can bury the card, grade it Again/Hard/Good, or only show a time reminder.'),
            ],
            note: l('Bu ayarlar süreleri tanımlar. Çalışma ekranındaki Otomatik İlerleme anahtarı ayrıca açık olmalıdır; otomatik verilen notlar normal inceleme kaydı oluşturur.', 'These options define the timings. Auto Advance must also be enabled for studying; automatic grades create normal review-log entries.'),
            ...helpChrome,
        },
        easyDays: {
            title: l('Kolay günler neyi değiştirir?', 'How Easy Days work'),
            summary: l('Yeni bir aralık hesaplanırken vade günü küçük miktarda kaydırılarak belirli günlerdeki tekrar yükü azaltılır.', 'When a new interval is calculated, its due day is shifted slightly to reduce review load on selected weekdays.'),
            points: [
                l('Normal günü değiştirmez; Azaltılmış o güne düşen tekrarların bir bölümünü, Yok ise mümkün olan tekrarların tamamını yakın günlere kaydırır.', 'Normal leaves the day unchanged; Reduced shifts some reviews away, and None shifts all eligible reviews to nearby days.'),
                l('Bir güne dokunarak Normal → Azaltılmış → Yok sırasıyla geçebilirsiniz.', 'Tap a day to cycle Normal → Reduced → None.'),
                l('Değişiklik yalnızca bundan sonra hesaplanan aralıklara uygulanır; mevcut vadeler topluca taşınmaz.', 'The change applies only to intervals calculated from now on; existing due dates are not moved in bulk.'),
            ],
            note: l('Bütün günleri aynı seviyeye düşürmek toplam iş yükünü azaltmaz; yalnızca günler arasındaki dağılımı değiştirir.', 'Reducing every day equally does not lower total workload; it only changes distribution between days.'),
            ...helpChrome,
        },
        advanced: {
            title: l('Gelişmiş aralık ayarları', 'Advanced interval settings'),
            summary: l('Bu değerler mevcut Anki V3 / SM-2 motorunun tekrar aralıklarını doğrudan değiştirir.', 'These values directly change review intervals in the current Anki V3 / SM-2 engine.'),
            points: [
                l('Başlangıç kolaylığı yeni mezun kartın katsayısıdır. Kolay bonusu ve Zor çarpanı ilgili yanıtların aralıklarını etkiler.', 'Starting ease is assigned when a card graduates. Easy bonus and Hard multiplier affect their respective answer intervals.'),
                l('Aralık düzenleyici bütün tekrar aralıklarına ek bir çarpan uygular; en fazla aralık nihai üst sınırdır.', 'Interval modifier applies an extra multiplier to all review intervals; Maximum interval is the final upper bound.'),
                l('Yeni aralık yüzdesi, Tekrar yanıtından sonra eski aralığın ne kadarının korunacağını belirler. 0, kartı en az aralığa döndürür.', 'New interval percentage controls how much of the old interval remains after Again. 0 resets the card to the minimum interval.'),
            ],
            note: l('FSRS bu sürümde uygulanmış değildir. Ne yaptığınızdan emin değilseniz varsayılan değerleri koruyun.', 'FSRS is not implemented in this version. Keep the defaults unless you understand the scheduling impact.'),
            ...helpChrome,
        },
    } satisfies Record<string, OptionHelp>;
    // Always show the effective numeric limit. An empty override still means "inherit" in saved
    // data, but exposing that internal representation as a blank field made the setting look
    // unfinished and required explanatory copy below it.
    const effectiveDeckNewValue = form.deckNewLimit.trim() || form.newPerDay;
    const effectiveDeckReviewValue = form.deckReviewLimit.trim() || form.maxReviewsPerDay;
    const effectiveTodayNewValue = form.todayNewLimit.trim() || effectiveDeckNewValue;
    const effectiveTodayReviewValue = form.todayReviewLimit.trim() || effectiveDeckReviewValue;
    const scopedNewValue = newLimitScope === 'preset'
        ? form.newPerDay
        : newLimitScope === 'deck'
            ? effectiveDeckNewValue
            : effectiveTodayNewValue;
    const scopedReviewValue = reviewLimitScope === 'preset'
        ? form.maxReviewsPerDay
        : reviewLimitScope === 'deck'
            ? effectiveDeckReviewValue
            : effectiveTodayReviewValue;
    const setScopedNewValue = (value: string) => set(newLimitScope === 'preset' ? 'newPerDay' : newLimitScope === 'deck' ? 'deckNewLimit' : 'todayNewLimit', value);
    const setScopedReviewValue = (value: string) => set(reviewLimitScope === 'preset' ? 'maxReviewsPerDay' : reviewLimitScope === 'deck' ? 'deckReviewLimit' : 'todayReviewLimit', value);
    const reviewsWarning = parseCount(form.maxReviewsPerDay, 0) < Math.min(9999, parseCount(form.newPerDay, 0) * 10);
    const Field = ({ field, label, value, onChange, hint, suffix, kind = 'integer' }: {
        field: keyof typeof form;
        label: string;
        value: string;
        onChange: (value: string) => void;
        hint?: string;
        suffix?: string;
        kind?: 'integer' | 'decimal' | 'steps';
    }) => (
        <NumberSetting
            label={label}
            value={value}
            onChange={onChange}
            hint={hint}
            suffix={suffix}
            kind={kind}
            error={validation.errors[field]}
            styles={styles}
        />
    );
    const SwitchRow = ({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }) => (
        <ToggleSetting label={label} value={value} onChange={onChange} hint={hint} styles={styles} colors={colors} />
    );
    const saveDisabled = saveState === 'saving' || !isDirty;
    const saveLabel = saveState === 'saving'
        ? l('Kaydediliyor…', 'Saving…')
        : isDirty
            ? l('Kaydet', 'Save')
            : l('Kaydedildi', 'Saved');
    const currentStatusMessage = hasValidationErrors && isDirty
        ? l(
            `${Object.keys(validation.errors).length} alanı düzeltmeniz gerekiyor.`,
            `${Object.keys(validation.errors).length} fields need attention.`,
        )
        : saveMessage || (isDirty ? l('Kaydedilmemiş değişiklikler var.', 'There are unsaved changes.') : '');

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel={l('Deste genel bakışına dön', 'Back to deck overview')}
                >
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{l('Deste seçenekleri', 'Deck Options')}</Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >

                <View style={styles.presetToolbar}>
                    <TouchableOpacity
                        style={styles.presetSelector}
                        onPress={() => { Keyboard.dismiss(); setPresetPickerOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Ayar grubu: ${presetName}`, `Preset: ${presetName}`)}
                    >
                        <View style={styles.presetSelectorTextWrap}>
                            <Text style={styles.presetSelectorName} numberOfLines={1}>{presetName}</Text>
                            <Text style={styles.presetSelectorMeta} numberOfLines={1}>
                                {l(`${usedBy} deste tarafından kullanılıyor`, `Used by ${usedBy} decks`)}
                            </Text>
                        </View>
                        <Text style={styles.presetSelectorChevron}>⌄</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.savePrimary, saveDisabled && styles.saveControlDisabled]}
                        onPress={handleSave}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: saveDisabled }}
                        disabled={saveDisabled}
                    >
                        {saveState === 'saving'
                            ? <ActivityIndicator size="small" color={colors.white} />
                            : <Text style={styles.savePrimaryText}>{saveLabel}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.presetMoreButton} onPress={() => setPresetActionsOpen(true)} accessibilityRole="button" accessibilityLabel={l('Ayar grubu işlemleri', 'Preset actions')}>
                        <Text style={styles.presetMoreButtonText}>•••</Text>
                    </TouchableOpacity>
                </View>

                {currentStatusMessage ? (
                    <View style={[
                        styles.saveStatus,
                        (hasValidationErrors && isDirty) || saveState === 'error'
                            ? styles.saveStatusError
                            : saveState === 'saved'
                                ? styles.saveStatusSuccess
                                : styles.saveStatusPending,
                    ]} accessibilityLiveRegion="polite">
                        <View style={[
                            styles.saveStatusDot,
                            (hasValidationErrors && isDirty) || saveState === 'error'
                                ? { backgroundColor: colors.btnAgain }
                                : saveState === 'saved'
                                    ? { backgroundColor: colors.btnGood }
                                    : { backgroundColor: colors.btnHard },
                        ]} />
                        <Text style={styles.saveStatusText}>{currentStatusMessage}</Text>
                    </View>
                ) : null}

                <OptionCard wide={useTwoColumns} title={l('Günlük limitler', 'Daily Limits')} styles={styles} help={optionHelp.dailyLimits}>
                    <LimitTabs value={newLimitScope} onChange={setNewLimitScope} styles={styles} labels={limitLabels} />
                    <Field
                        field={newLimitScope === 'preset' ? 'newPerDay' : newLimitScope === 'deck' ? 'deckNewLimit' : 'todayNewLimit'}
                        label={l('Günlük yeni kart', 'New cards/day')}
                        value={scopedNewValue}
                        onChange={setScopedNewValue}
                    />
                    <LimitTabs value={reviewLimitScope} onChange={setReviewLimitScope} styles={styles} labels={limitLabels} />
                    <Field
                        field={reviewLimitScope === 'preset' ? 'maxReviewsPerDay' : reviewLimitScope === 'deck' ? 'deckReviewLimit' : 'todayReviewLimit'}
                        label={l('Günlük en fazla tekrar', 'Maximum reviews/day')}
                        value={scopedReviewValue}
                        onChange={setScopedReviewValue}
                    />
                    {reviewsWarning ? (
                        <View style={styles.warningBox}>
                            <Text style={styles.warningText}>{l(
                                'Tekrar limiti yeni kart limitine göre düşük. Dengeli bir yük için tekrar limitini günlük yeni kart sayısının yaklaşık 10 katı tutmanız önerilir.',
                                'The review limit is low relative to the new-card limit. For a balanced workload, a review limit around 10× the daily new-card count is recommended.',
                            )}</Text>
                        </View>
                    ) : null}
                    <SwitchRow
                        label={l('Yeni kartlar tekrar limitini yok saysın', 'New cards ignore review limit')}
                        value={form.newCardsIgnoreReviewLimit}
                        onChange={(value) => set('newCardsIgnoreReviewLimit', value)}
                        hint={l('Tüm ayar grupları için geçerlidir.', 'Applies to all presets.')}
                    />
                    <SwitchRow
                        label={l('Limitler en üst desteden başlasın', 'Limits start from top')}
                        value={form.limitsStartFromTop}
                        onChange={(value) => set('limitsStartFromTop', value)}
                        hint={l('Tüm ayar grupları için geçerlidir.', 'Applies to all presets.')}
                    />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Yeni kartlar', 'New Cards')} styles={styles} help={optionHelp.newCards}>
                <Field
                    field="learningSteps"
                    label={l('Öğrenme adımları', 'Learning steps')}
                    value={form.learningSteps}
                    onChange={(t) => set('learningSteps', t)}
                    hint={l('Boşlukla ayırın: 1m 10m · birimler: s, m, h, d', 'Separate with spaces: 1m 10m · units: s, m, h, d')}
                    kind="steps"
                />
                <Field field="graduatingIvl" label={l('Mezuniyet aralığı (gün)', 'Graduating interval (days)')} value={form.graduatingIvl} onChange={(t) => set('graduatingIvl', t)} />
                <Field field="easyIvl" label={l('Kolay aralığı (gün)', 'Easy interval (days)')} value={form.easyIvl} onChange={(t) => set('easyIvl', t)} />
                <SelectSetting
                    label={l('Ekleniş sırası', 'Insertion order')}
                    value={form.insertionOrder}
                    options={[{ key: 'sequential', label: l('Sıralı', 'Sequential') }, { key: 'random', label: l('Rastgele', 'Random') }]}
                    onChange={(key) => set('insertionOrder', key as 'sequential' | 'random')}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Unutmalar', 'Lapses')} styles={styles} help={optionHelp.lapses}>
                <Field
                    field="relearningSteps"
                    label={l('Yeniden öğrenme adımları', 'Relearning steps')}
                    value={form.relearningSteps}
                    onChange={(t) => set('relearningSteps', t)}
                    hint={l('Boş bırakılırsa kart yeniden öğrenmeye girmez.', 'Leave empty to skip relearning.')}
                    kind="steps"
                />
                <Field field="minIvl" label={l('En az aralık (gün)', 'Minimum interval (days)')} value={form.minIvl} onChange={(t) => set('minIvl', t)} />
                <Field
                    field="leechThreshold"
                    label={l('Sürekli unutulan kart eşiği', 'Leech threshold (lapses)')}
                    value={form.leechThreshold}
                    onChange={(t) => set('leechThreshold', t)}
                    hint={l(
                        'Kart bu sayıda unutulduğunda işaretlenir. Varsayılan: 8.',
                        'The card is marked when it reaches this many lapses. Default: 8.',
                    )}
                />
                <SelectSetting
                    label={l('Eşiğe ulaşıldığında', 'Leech action')}
                    value={form.leechAction}
                    options={[
                        { key: 'suspend', label: l('Etiketle ve askıya al', 'Tag and Suspend') },
                        { key: 'tag', label: l('Yalnızca etiketle', 'Tag Only') },
                    ]}
                    onChange={(key) => set('leechAction', key as 'suspend' | 'tag')}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Görüntüleme sırası', 'Display Order')} styles={styles} help={optionHelp.displayOrder}>
                <SelectSetting
                    label={l('Yeni kart toplama sırası', 'New card gather order')}
                    value={form.newCardGatherOrder}
                    options={[
                        { key: 'deck', label: l('Deste', 'Deck') },
                        { key: 'deckThenRandomNotes', label: l('Deste, sonra rastgele notlar', 'Deck, then random notes') },
                        { key: 'ascendingPosition', label: l('Artan konum', 'Ascending position') },
                        { key: 'descendingPosition', label: l('Azalan konum', 'Descending position') },
                        { key: 'randomNotes', label: l('Rastgele notlar', 'Random notes') },
                        { key: 'randomCards', label: l('Rastgele kartlar', 'Random cards') },
                    ]}
                    onChange={(key) => set('newCardGatherOrder', key as NewCardGatherOrder)}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <SelectSetting
                    label={l('Yeni kart sıralaması', 'New card sort order')}
                    value={form.newCardSortOrder}
                    options={[
                        { key: 'template', label: l('Kart türü, sonra toplanma sırası', 'Card type, then order gathered') },
                        { key: 'noSort', label: l('Toplanma sırası', 'Order gathered') },
                        { key: 'templateThenRandom', label: l('Kart türü, sonra rastgele', 'Card type, then random') },
                        { key: 'randomNoteThenTemplate', label: l('Rastgele not, sonra kart türü', 'Random note, then card type') },
                        { key: 'randomCard', label: l('Rastgele kart', 'Random card') },
                    ]}
                    onChange={(key) => set('newCardSortOrder', key as NewCardSortOrder)}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <SelectSetting
                    label={l('Yeni / tekrar sırası', 'New/review order')}
                    value={form.newReviewOrder}
                    options={[
                        { key: 'mix', label: l('Tekrarlarla karıştır', 'Mix with reviews') },
                        { key: 'before', label: l('Tekrarlardan önce göster', 'Show before reviews') },
                        { key: 'after', label: l('Tekrarlardan sonra göster', 'Show after reviews') },
                    ]}
                    onChange={(key) => set('newReviewOrder', key as 'mix' | 'before' | 'after')}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <SelectSetting
                    label={l('Gün aşan öğrenme / tekrar sırası', 'Interday learning/review order')}
                    value={form.interdayLearningMix}
                    options={[
                        { key: 'mix', label: l('Tekrarlarla karıştır', 'Mix with reviews') },
                        { key: 'before', label: l('Tekrarlardan önce göster', 'Show before reviews') },
                        { key: 'after', label: l('Tekrarlardan sonra göster', 'Show after reviews') },
                    ]}
                    onChange={(key) => set('interdayLearningMix', key as 'mix' | 'before' | 'after')}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <SelectSetting
                    label={l('Tekrar sıralaması', 'Review sort order')}
                    value={form.reviewSortOrder}
                    options={[
                        { key: 'dueRandom', label: l('Zamanı gelen, sonra rastgele', 'Due date, then random') },
                        { key: 'dueThenDeck', label: l('Zamanı gelen, sonra deste', 'Due date, then deck') },
                        { key: 'deckThenDue', label: l('Deste, sonra zamanı gelen', 'Deck, then due date') },
                        { key: 'intervalsAsc', label: l('Aralık artan', 'Ascending intervals') },
                        { key: 'intervalsDesc', label: l('Aralık azalan', 'Descending intervals') },
                        { key: 'easeAsc', label: l('Kolaylık artan', 'Ascending ease') },
                        { key: 'easeDesc', label: l('Kolaylık azalan', 'Descending ease') },
                        { key: 'relativeOverdueness', label: l('Göreli gecikmişlik', 'Relative overdueness') },
                        { key: 'added', label: l('Eklenme sırası', 'Order added') },
                        { key: 'reverseAdded', label: l('Ters eklenme sırası', 'Reverse order added') },
                        { key: 'random', label: l('Rastgele', 'Random') },
                    ]}
                    onChange={(key) => set('reviewSortOrder', key as ReviewSortOrder)}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Gömme', 'Burying')} styles={styles} help={optionHelp.burying}>
                <SwitchRow label={l('Yeni kardeş kartları göm', 'Bury new siblings')} value={form.buryNewSiblings} onChange={(v) => set('buryNewSiblings', v)} />
                <SwitchRow label={l('Tekrar kardeş kartları göm', 'Bury review siblings')} value={form.buryReviewSiblings} onChange={(v) => set('buryReviewSiblings', v)} />
                <SwitchRow
                    label={l('Gün aşan öğrenme kardeşlerini göm', 'Bury interday learning siblings')}
                    value={form.buryInterdayLearningSiblings}
                    onChange={(v) => set('buryInterdayLearningSiblings', v)}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Ses', 'Audio')} styles={styles} help={optionHelp.audio}>
                <SwitchRow label={l('Sesi otomatik oynat', 'Automatically play audio')} value={form.autoPlayAudio} onChange={(v) => set('autoPlayAudio', v)} />
                <SwitchRow
                    label={l('Cevabı yeniden oynatırken soruyu atla', 'Skip question when replaying answer')}
                    value={form.skipQuestionWhenReplayingAnswer}
                    onChange={(value) => set('skipQuestionWhenReplayingAnswer', value)}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Zamanlayıcılar', 'Timers')} styles={styles} help={optionHelp.timers}>
                    <Field field="maxAnswerSecs" label={l('En fazla cevap süresi', 'Maximum answer time')} value={form.maxAnswerSecs} onChange={(value) => set('maxAnswerSecs', value)} suffix={l('sn', 'sec')} />
                    <SwitchRow label={l('Ekran zamanlayıcısını göster', 'Show on-screen timer')} value={form.showTimer} onChange={(value) => set('showTimer', value)} />
                    <SwitchRow
                        label={l('Cevap gösterilince ekran zamanlayıcısını durdur', 'Stop on-screen timer on answer')}
                        value={form.stopTimerOnAnswer}
                        onChange={(value) => set('stopTimerOnAnswer', value)}
                    />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Otomatik ilerleme', 'Auto Advance')} styles={styles} help={optionHelp.autoAdvance}>
                    <Field
                        field="secondsToShowQuestion"
                        label={l('Soruyu gösterme süresi', 'Question display time')}
                        value={form.secondsToShowQuestion}
                        onChange={(value) => set('secondsToShowQuestion', value)}
                        suffix={l('sn', 'sec')}
                        hint={l('0 = kapalı', '0 = disabled')}
                    />
                    <Field
                        field="secondsToShowAnswer"
                        label={l('Cevabı gösterme süresi', 'Answer display time')}
                        value={form.secondsToShowAnswer}
                        onChange={(value) => set('secondsToShowAnswer', value)}
                        suffix={l('sn', 'sec')}
                        hint={l('0 = kapalı', '0 = disabled')}
                    />
                    <SelectSetting
                        label={l('Soru süresi dolunca', 'Question action')}
                        value={form.questionAction}
                        options={[
                            { key: 'showAnswer', label: l('Cevabı göster', 'Show answer') },
                            { key: 'showReminder', label: l('Yalnızca süre uyarısı göster', 'Show reminder only') },
                        ]}
                        onChange={(key) => set('questionAction', key as 'showAnswer' | 'showReminder')}
                        styles={styles}
                        colors={colors}
                        cancelLabel={cancelLabel}
                    />
                    <SelectSetting
                        label={l('Cevap süresi dolunca', 'Answer action')}
                        value={form.answerAction}
                        options={[
                            { key: 'bury', label: l('Kartı göm', 'Bury card') },
                            { key: 'again', label: l('Tekrar olarak yanıtla', 'Answer Again') },
                            { key: 'hard', label: l('Zor olarak yanıtla', 'Answer Hard') },
                            { key: 'good', label: l('İyi olarak yanıtla', 'Answer Good') },
                            { key: 'showReminder', label: l('Yalnızca süre uyarısı göster', 'Show reminder only') },
                        ]}
                        onChange={(key) => set('answerAction', key as AutoAdvanceAnswerAction)}
                        styles={styles}
                        colors={colors}
                        cancelLabel={cancelLabel}
                    />
                    <SwitchRow
                        label={l('Sesin bitmesini bekle', 'Wait for audio')}
                        value={form.waitForAudio}
                        onChange={(value) => set('waitForAudio', value)}
                    />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Kolay günler', 'Easy Days')} styles={styles} help={optionHelp.easyDays}>
                <Text style={styles.fieldHint}>{l('Değiştirmek için güne dokunun: Normal → Azaltılmış → Yok. Tekrarlar o günlerden kaydırılır.', 'Tap a day to cycle: Normal → Reduced → None. Reviews are shifted away from those days.')}</Text>
                <View style={styles.easyDaysRow}>
                    {dayLabels.map((label, index) => {
                        const factor = form.easyDays[index];
                        return (
                            <TouchableOpacity
                                key={label}
                                style={[
                                    styles.easyDay,
                                    factor === 0.5 && styles.easyDayReduced,
                                    factor === 0 && styles.easyDayOff,
                                ]}
                                onPress={() => cycleEasyDay(index)}
                                accessibilityRole="button"
                                accessibilityLabel={`${label}: ${factorLabel(factor)}`}
                            >
                                <Text style={styles.easyDayLabel}>{label}</Text>
                                <Text style={styles.easyDayFactor}>{factorLabel(factor)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Gelişmiş', 'Advanced')} styles={styles} help={optionHelp.advanced}>
                <Field field="startingEase" kind="decimal" label={l('Başlangıç kolaylığı', 'Starting ease')} value={form.startingEase} onChange={(t) => set('startingEase', t)} hint={l('1,30–5,00 arası. Örn. 2,50', 'Between 1.30 and 5.00. E.g. 2.50')} />
                <Field field="easyBonus" kind="decimal" label={l('Kolay bonusu', 'Easy bonus')} value={form.easyBonus} onChange={(t) => set('easyBonus', t)} />
                <Field field="hardIvl" kind="decimal" label={l('Zor aralık çarpanı', 'Hard interval multiplier')} value={form.hardIvl} onChange={(t) => set('hardIvl', t)} />
                <Field field="ivlModifier" kind="decimal" label={l('Aralık düzenleyici', 'Interval modifier')} value={form.ivlModifier} onChange={(t) => set('ivlModifier', t)} />
                <Field field="maxIvl" label={l('En fazla aralık (gün)', 'Maximum interval (days)')} value={form.maxIvl} onChange={(t) => set('maxIvl', t)} />
                <Field field="newIvlPercent" label={l('Yeni aralık (%) — unutma sonrası', 'New interval (%) after lapse')} value={form.newIvlPercent} onChange={(t) => set('newIvlPercent', t)} hint={l('0 = baştan başla', '0 = start over')} />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Deste açıklaması', 'Deck Description')} styles={styles}>
                <TextInput
                    style={[styles.input, styles.descriptionInput]}
                    value={form.description}
                    onChangeText={(t) => set('description', t)}
                    placeholder={l('Bu deste hakkında not (çalışma ekranında görünür)', 'Notes about this deck (shown on the study screen)')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                />
                </OptionCard>

            </ScrollView>

            <Modal visible={presetActionsOpen} transparent animationType="fade" onRequestClose={() => setPresetActionsOpen(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setPresetActionsOpen(false)} />
                    <View style={styles.actionMenu}>
                        {[
                            { label: l('Kaydet', 'Save'), action: handleSave },
                            { label: l('Varsayılana dön', 'Restore Defaults'), action: handleRestoreDefaults },
                            { label: l('Ayar grubu ekle', 'Add Preset'), action: handleAddPreset },
                            { label: l('Klonla', 'Clone'), action: handleClonePreset },
                            { label: l('Yeniden adlandır', 'Rename'), action: () => { setRenameText(presetName); setRenameOpen(true); } },
                            { label: l('Kaydet ve tüm alt destelere uygula', 'Save and Apply to All Subdecks'), action: handleApplyToSubdecks },
                            { label: l('Sil', 'Delete'), action: handleDeletePreset, destructive: true },
                        ].map((item) => (
                            <TouchableOpacity
                                key={item.label}
                                style={styles.actionMenuRow}
                                onPress={() => { setPresetActionsOpen(false); item.action(); }}
                            >
                                <Text style={[styles.actionMenuText, item.destructive && styles.actionMenuDanger]}>{item.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            <Modal visible={presetPickerOpen} transparent animationType="fade" onRequestClose={() => setPresetPickerOpen(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setPresetPickerOpen(false)}
                        accessibilityLabel={l('Ayar grubu seçiciyi kapat', 'Close preset picker')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Ayar grubu seç', 'Choose Preset')}</Text>
                        <ScrollView style={{ maxHeight: 320 }}>
                            {getAllDeckConfigs().map((preset) => {
                                const presetDecks = getDecksUsingConfig(preset.id);
                                const displayName = presetDisplayName(preset.id);
                                return (
                                    <TouchableOpacity key={preset.id} style={styles.presetOption} onPress={() => switchPreset(preset.id)}>
                                        <Text style={[styles.presetOptionText, preset.id === configId && styles.presetOptionActive]}>
                                            {displayName} · {l(`${presetDecks.length} deste`, `${presetDecks.length} decks`)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setPresetPickerOpen(false)}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setRenameOpen(false)}
                        accessibilityLabel={l('Yeniden adlandırma penceresini kapat', 'Close rename dialog')}
                    />
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Ayar grubunu adlandır', 'Rename Preset')}</Text>
                        <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} autoFocus />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setRenameOpen(false)}>
                                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.saveBtnSmall}
                                onPress={() => {
                                    renamePreset(configId, renameText);
                                    setPresetRevision((value) => value + 1);
                                    setRenameOpen(false);
                                    setForm((prev) => ({ ...prev }));
                                }}
                            >
                                <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        header: {
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            backgroundColor: colors.bgPrimary,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        backText: { fontSize: 34, lineHeight: 36, color: colors.accent },
        headerTitleWrap: { flex: 1, paddingHorizontal: Spacing.xs },
        headerEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.textMuted },
        headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        headerSubtitle: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
        headerSaveButton: {
            minWidth: 68,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
            paddingHorizontal: Spacing.md,
        },
        headerSaveText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.white },
        content: {
            width: '100%',
            maxWidth: 1180,
            alignSelf: 'center',
            padding: Spacing.lg,
            gap: Spacing.sm,
            paddingBottom: 72,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
        },
        missing: { margin: Spacing.xl, color: colors.textMuted, fontSize: FontSize.md },

        presetToolbar: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'stretch',
            marginBottom: Spacing.sm,
        },
        presetSelector: {
            flex: 1,
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgCard,
            paddingHorizontal: Spacing.md,
            marginRight: Spacing.sm,
        },
        presetSelectorTextWrap: { flex: 1, minWidth: 0 },
        presetSelectorName: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        presetSelectorMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
        presetSelectorChevron: { fontSize: 18, color: colors.textMuted, marginLeft: Spacing.sm },
        savePrimary: {
            minWidth: 76,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
        },
        savePrimaryText: { color: colors.white, fontWeight: '700', fontSize: FontSize.sm },
        presetMoreButton: {
            width: 46,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        presetMoreButtonText: { color: colors.textSecondary, fontSize: 15, fontWeight: '800', letterSpacing: -1 },
        saveControlDisabled: { opacity: 0.5 },
        saveStatus: {
            width: '100%',
            minHeight: 42,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            marginBottom: Spacing.sm,
            borderWidth: 1,
            borderRadius: BorderRadius.sm,
        },
        saveStatusPending: { backgroundColor: colors.btnHardBg, borderColor: colors.btnHard },
        saveStatusSuccess: { backgroundColor: colors.btnGoodBg, borderColor: colors.btnGood },
        saveStatusError: { backgroundColor: colors.btnAgainBg, borderColor: colors.btnAgain },
        saveStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm },
        saveStatusText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, lineHeight: 18, fontWeight: '600' },

        optionCard: {
            width: '100%',
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.sm,
            ...Shadows.sm,
        },
        optionCardWide: { width: '49.25%' },
        optionCardHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            paddingBottom: 7,
            marginBottom: 3,
        },
        optionCardTitle: { flex: 1, minWidth: 0, fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        helpButton: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        },
        helpBadge: {
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: colors.accentLight,
        },
        helpBadgeText: { fontSize: 13, lineHeight: 16, fontWeight: '800', color: colors.accent },
        helpOverlay: {
            flex: 1,
            justifyContent: 'flex-end',
            paddingHorizontal: Spacing.sm,
            backgroundColor: 'rgba(15, 23, 20, 0.44)',
        },
        helpSheet: {
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.lg,
            paddingTop: 32,
            overflow: 'hidden',
            ...Shadows.lg,
        },
        helpSheetHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.sm,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        helpSheetTitleWrap: { flex: 1, minWidth: 0, paddingRight: Spacing.sm },
        helpSheetEyebrow: {
            color: colors.accent,
            fontSize: 10,
            lineHeight: 14,
            fontWeight: '800',
            letterSpacing: 1.15,
            marginBottom: 2,
        },
        helpSheetTitle: { color: colors.textPrimary, fontSize: FontSize.lg, lineHeight: 24, fontWeight: '700' },
        helpCloseButton: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.full,
            backgroundColor: colors.bgInput,
        },
        helpCloseText: { color: colors.textSecondary, fontSize: 28, lineHeight: 30, fontWeight: '300', marginTop: -2 },
        helpSheetScroll: { flexShrink: 1 },
        helpSheetContent: { padding: Spacing.lg, paddingBottom: Spacing.md },
        helpSummary: { color: colors.textPrimary, fontSize: FontSize.md, lineHeight: 23, fontWeight: '600' },
        helpPoints: { gap: Spacing.md, marginTop: Spacing.lg },
        helpPointRow: { flexDirection: 'row', alignItems: 'flex-start' },
        helpPointDot: {
            width: 7,
            height: 7,
            marginTop: 7,
            marginRight: Spacing.sm,
            borderRadius: 4,
            backgroundColor: colors.accent,
        },
        helpPointText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 21 },
        helpNote: {
            marginTop: Spacing.lg,
            padding: Spacing.md,
            borderRadius: BorderRadius.sm,
            borderLeftWidth: 3,
            borderLeftColor: colors.accent,
            backgroundColor: colors.accentLight,
        },
        helpNoteLabel: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
        helpNoteText: { color: colors.textSecondary, fontSize: FontSize.xs, lineHeight: 18 },
        helpDismissButton: {
            minHeight: 50,
            marginHorizontal: Spacing.lg,
            marginTop: Spacing.xs,
            marginBottom: Spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
        },
        helpDismissText: { color: colors.white, fontSize: FontSize.md, fontWeight: '700' },
        optionCardBody: { gap: 2 },
        settingBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, paddingVertical: 7 },
        settingRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
        settingLabel: { flex: 1, minWidth: 0, fontSize: FontSize.sm, lineHeight: 19, color: colors.textPrimary },
        settingHint: { fontSize: 11, lineHeight: 16, color: colors.textMuted, marginTop: 2 },
        numberControl: {
            minWidth: 126,
            maxWidth: 180,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgInput,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
        },
        numberInput: { flex: 1, minWidth: 70, paddingVertical: 7, paddingHorizontal: 10, textAlign: 'right', color: colors.textPrimary, fontSize: FontSize.sm },
        numberInputInvalid: { color: colors.btnAgain, backgroundColor: colors.btnAgainBg },
        inputSuffix: { paddingRight: 9, color: colors.textMuted, fontSize: FontSize.xs },
        fieldError: { color: colors.btnAgain, fontSize: 11, lineHeight: 16, marginTop: 3, fontWeight: '600' },
        selectControl: {
            width: 190,
            minHeight: 38,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgInput,
            paddingHorizontal: 10,
        },
        selectControlText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.sm },
        selectChevron: { color: colors.textMuted, fontSize: 16 },
        selectList: { maxHeight: 380 },
        selectOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
        selectOptionActive: { backgroundColor: colors.accentLight },
        selectOptionText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        selectCheck: { color: colors.accent, fontSize: 17, fontWeight: '700' },
        limitTabs: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 7, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, overflow: 'hidden' },
        limitTab: { paddingVertical: 5, paddingHorizontal: 9, backgroundColor: colors.bgInput },
        limitTabActive: { backgroundColor: colors.accent },
        limitTabText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
        limitTabTextActive: { color: colors.white },
        warningBox: { backgroundColor: colors.btnHardBg, borderWidth: 1, borderColor: colors.btnHard, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: Spacing.sm },
        warningText: { color: colors.btnHard, fontSize: FontSize.xs, lineHeight: 17 },

        sectionTitle: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.2,
            color: colors.textMuted,
            marginTop: Spacing.lg,
        },

        presetCard: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.md,
            gap: 6,
            ...Shadows.sm,
        },
        presetName: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        presetMeta: { fontSize: FontSize.sm, color: colors.textMuted },
        presetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
        presetBtn: {
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        presetBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        presetBtnDanger: { color: colors.btnAgain },
        subdeckBtn: { marginTop: 4, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.sm, backgroundColor: colors.accentLight },
        subdeckBtnText: { color: colors.accent, fontWeight: '600', fontSize: FontSize.sm },

        field: { gap: 4 },
        fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary, marginTop: Spacing.xs },
        fieldHint: { fontSize: FontSize.xs, color: colors.textMuted },
        input: {
            minHeight: 44,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: 8,
            fontSize: FontSize.md,
            color: colors.textPrimary,
        },
        descriptionInput: { minHeight: 72, textAlignVertical: 'top' },

        choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
        choiceChip: {
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            borderRadius: BorderRadius.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        choiceChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        choiceText: { fontSize: FontSize.sm, color: colors.textSecondary },
        choiceTextActive: { color: colors.accent, fontWeight: '700' },

        switchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
            paddingVertical: 6,
        },
        switchLabel: { fontSize: FontSize.md, color: colors.textPrimary, flex: 1, marginRight: Spacing.md },

        easyDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
        easyDay: {
            minWidth: 64,
            alignItems: 'center',
            paddingVertical: 8,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            gap: 2,
        },
        easyDayReduced: { backgroundColor: colors.btnHardBg, borderColor: colors.btnHard },
        easyDayOff: { backgroundColor: colors.btnAgainBg, borderColor: colors.btnAgain },
        easyDayLabel: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        easyDayFactor: { fontSize: 10, color: colors.textMuted },

        saveBtn: {
            marginTop: Spacing.xl,
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.md,
            alignItems: 'center',
        },
        saveBtnSmall: {
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.sm,
            paddingVertical: 8,
            paddingHorizontal: Spacing.lg,
            alignItems: 'center',
        },
        saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
        cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        modalCard: {
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.xl,
            gap: Spacing.sm,
            ...Shadows.lg,
        },
        modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
        actionMenu: {
            width: '100%',
            maxWidth: 340,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            paddingVertical: Spacing.xs,
            ...Shadows.lg,
        },
        actionMenuRow: { minHeight: 46, justifyContent: 'center', paddingHorizontal: Spacing.lg },
        actionMenuText: { fontSize: FontSize.md, color: colors.textPrimary },
        actionMenuDanger: { color: colors.btnAgain },
        presetOption: {
            paddingVertical: 11,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        presetOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
        presetOptionActive: { color: colors.accent, fontWeight: '700' },
    });
}
