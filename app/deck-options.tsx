// Anki-style deck options screen: preset management plus every per-deck scheduling,
// display-order, burying, audio and easy-days setting the queue engine honors.
// Edits the deck's RAW config (boost-free) — "today only" extras live in custom study.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Keyboard,
    useWindowDimensions,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { goBackOr } from '../lib/backNavigation';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import {
    getDeck,
    getAllDecks,
    getDeckByName,
    createDeck,
    getAvailableDeckName,
    getDeckConfig,
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
import DeckPickerModal from '../components/DeckPickerModal';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, type DeckConfig } from '../lib/models';
import type { AutoAdvanceAnswerAction, NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from '../lib/types';
import { normalizeNewCardGatherOrder } from '../lib/queueBuild';
import { withoutPreservedReviewOrder } from '../lib/exportAnkiPackage';
import { saveCollectionDeckOptions } from '../lib/storage';
import {
    deckOptionsWarnings,
    isDeckOptionFieldVisible,
    resolveReviewSortOrderForScheduler,
    reviewSortOrderChoices,
    type DeckOptionsWarning,
    type DeckOptionsWarningId,
    type ReviewSortOrderLabelId,
} from '../lib/deckOptionsRules';
import {
    formatAnkiStepText,
    parseAnkiStepText,
    parseBoundedDecimalDraft,
    parseBoundedIntegerDraft,
    type NumericDraftIssue,
} from '../lib/deckOptionsForm';
import {
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
    FSRS_DESIRED_RETENTION_MAX,
    FSRS_DESIRED_RETENTION_MIN,
    formatFsrsCutoffDate,
    formatFsrsParameterText,
    parseFsrsCutoffDate,
    parseFsrsParameterText,
} from '../lib/fsrs';
import {
    FSRS_MIN_TRAINING_REVIEWS,
    FSRS_RECOMMENDED_TRAINING_REVIEWS,
    buildFsrsTrainingItems,
    optimizeFsrsParameters,
} from '../lib/fsrsOptimizer';
import {
    collectFsrsTrainingHistories,
    countFsrsTrainingReviews,
    rebuildFsrsMemoryStates,
} from '../lib/fsrsMaintenance';
import { useI18n } from '../hooks/useI18n';
import { getDB } from '../lib/db';
import { hasSnapshotChanged, stableSnapshot } from '../lib/dirtyState';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { createDeckOptionsStyles } from '../components/deck-options/deckOptionsStyles';
import { DeckOptionsContext } from '../components/deck-options/DeckOptionsContext';
import {
    Field,
    FieldAdvice,
    LimitTabs,
    OptionCard,
    SelectSetting,
    SwitchRow,
    TextBlockSetting,
} from '../components/deck-options/SettingControls';
import { buildOptionHelp, deckOptionsWarningText } from '../components/deck-options/deckOptionsCopy';
import { PresetActionsMenu, PresetPickerModal, RenamePresetModal } from '../components/deck-options/PresetModals';
import type { SelectOption } from '../components/deck-options/types';

const DAY_FACTORS = [1, 0.5, 0] as const;

export default function DeckOptionsScreen() {
    const { t, l } = useI18n();
    const dayLabels = l('Pzt,Sal,Çar,Per,Cum,Cmt,Paz', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
    const factorLabel = (factor: number) => factor === 1 ? l('Normal', 'Normal') : factor === 0.5 ? l('Azaltılmış', 'Reduced') : l('Yok', 'None');
    const colors = useThemeColors();
    const styles = useMemo(() => createDeckOptionsStyles(colors), [colors]);
    const { width } = useWindowDimensions();
    const useTwoColumns = width >= 900;
    const router = useRouter();
    const params = useLocalSearchParams();
    const { settings, refreshSettings: refreshData } = useAppSettings();
    const { markSchedulingStale, invalidateCollection } = useCollectionInvalidation();

    const routeDeckId = Number(Array.isArray(params.deckId) ? params.deckId[0] : params.deckId);
    const [activeDeckId, setActiveDeckId] = useState(routeDeckId);
    const [deckRevision, setDeckRevision] = useState(0);
    const deck = useMemo(
        () => (Number.isFinite(activeDeckId) ? getDeck(activeDeckId) : null) ?? getAllDecks().find((d) => !d.isFiltered) ?? null,
        [activeDeckId, deckRevision],
    );
    const todayLimits = useMemo(
        () => deck ? getDeckTodayLimits(deck.id, settings.dayRolloverHour) : {},
        [deck?.id, settings.dayRolloverHour],
    );

    const focusField = typeof params.focus === 'string' ? params.focus : null;
    const newLimitInputRef = useRef<TextInput>(null);
    const reviewLimitInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (focusField === 'newLimit') {
            const timer = setTimeout(() => {
                newLimitInputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        } else if (focusField === 'reviewLimit') {
            const timer = setTimeout(() => {
                reviewLimitInputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [focusField]);

    const [configId, setConfigId] = useState<number>(deck?.configId || DEFAULT_DECK_CONFIG.id);
    const [presetRevision, setPresetRevision] = useState(0);
    const initialConfig = useMemo(() => getDeckConfig(configId), [configId, presetRevision]);

    // Form state, re-seeded whenever the preset changes.
    const [form, setForm] = useState(() => formFromConfig(initialConfig, deck?.description ?? ''));
    const [savedSnapshot, setSavedSnapshot] = useState(() => stableSnapshot({
        configId: deck?.configId || DEFAULT_DECK_CONFIG.id,
        form: formFromConfig(initialConfig, deck?.description ?? ''),
    }));
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    /**
     * "Reschedule cards on change" is a request carried by one save, not a stored preference:
     * Anki's screen starts it off every time it opens, so that agreeing to rewrite every due date
     * once cannot quietly rewrite them all again on the next unrelated save.
     */
    const [rescheduleOnSave, setRescheduleOnSave] = useState(false);
    /** Set by the optimizer so the save can record when these parameters were fitted. */
    const [optimizedAtMs, setOptimizedAtMs] = useState<number | null>(null);
    const [optimizing, setOptimizing] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [deckPickerOpen, setDeckPickerOpen] = useState(false);
    const [presetPickerOpen, setPresetPickerOpen] = useState(false);
    const [presetActionsOpen, setPresetActionsOpen] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameText, setRenameText] = useState('');
    const initialScope = (params.scope === 'deck' || params.scope === 'today') ? params.scope : 'preset';
    const [newLimitScope, setNewLimitScope] = useState<'preset' | 'deck' | 'today'>(initialScope);
    const [reviewLimitScope, setReviewLimitScope] = useState<'preset' | 'deck' | 'today'>(initialScope);

    useEffect(() => {
        if (params.scope === 'deck' || params.scope === 'today') {
            setNewLimitScope(params.scope);
            setReviewLimitScope(params.scope);
        }
    }, [params.scope]);

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
            audioPlaybackRate: String(config.audioPlaybackRate ?? 1.0),
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
            // FSRS: the switches are collection-wide, the rest belongs to this preset.
            fsrsEnabled: settings.fsrsEnabled === true,
            fsrsShortTermWithSteps: settings.fsrsShortTermWithSteps === true,
            desiredRetention: (config.desiredRetention ?? FSRS_DEFAULT_DESIRED_RETENTION).toFixed(2),
            historicalRetention: (config.historicalRetention ?? FSRS_DEFAULT_HISTORICAL_RETENTION).toFixed(2),
            fsrsParams: formatFsrsParameterText(config.fsrsParams),
            ignoreRevlogsBefore: formatFsrsCutoffDate(config.ignoreRevlogsBeforeMs),
            description,
        };
    }

    const snapshotForm = (nextConfigId: number, nextForm: typeof form) => stableSnapshot({
        configId: nextConfigId,
        form: nextForm,
    });
    // A reschedule request is an unsaved change like any other: it starts off, so it can only
    // be on because the learner turned it on, and Save is what carries it out.
    const isDirty = hasSnapshotChanged(savedSnapshot, { configId, form }) || rescheduleOnSave;
    useUnsavedChangesGuard(isDirty, {
        title: l('Kaydedilmemiş değişiklikler', 'Unsaved changes'),
        message: l(
            'Bu sayfada kaydedilmemiş ayarlar var. Çıkarsanız değişiklikler kaybolacak.',
            'There are unsaved settings on this page. They will be lost if you leave.',
        ),
    });

    const applyPresetSelection = (nextId: number, markSaved = false) => {
        const currentDeck = getDeck(activeDeckId) ?? deck;
        const currentTodayLimits = currentDeck
            ? getDeckTodayLimits(currentDeck.id, settings.dayRolloverHour)
            : {};
        const nextForm = formFromConfig(
            getDeckConfig(nextId),
            form.description,
            currentDeck,
            currentTodayLimits,
        );
        setConfigId(nextId);
        setForm(nextForm);
        if (markSaved) setSavedSnapshot(snapshotForm(nextId, nextForm));
        setRescheduleOnSave(false);
        setOptimizedAtMs(null);
        setSaveState('idle');
        setSaveMessage('');
        setPresetPickerOpen(false);
    };

    const applyDeckSelection = (nextDeckId: number) => {
        const nextDeck = getDeck(nextDeckId);
        if (!nextDeck) return;
        const nextConfigId = nextDeck.configId || DEFAULT_DECK_CONFIG.id;
        const nextTodayLimits = getDeckTodayLimits(nextDeck.id, settings.dayRolloverHour);
        const nextForm = formFromConfig(
            getDeckConfig(nextConfigId),
            nextDeck.description,
            nextDeck,
            nextTodayLimits,
        );
        setActiveDeckId(nextDeck.id);
        setConfigId(nextConfigId);
        setForm(nextForm);
        setSavedSnapshot(snapshotForm(nextConfigId, nextForm));
        setRescheduleOnSave(false);
        setOptimizedAtMs(null);
        setSaveState('idle');
        setSaveMessage('');
        setDeckPickerOpen(false);
    };

    const switchDeck = (nextDeckId: number) => {
        if (nextDeckId === activeDeckId) {
            setDeckPickerOpen(false);
            return;
        }
        if (!isDirty) {
            applyDeckSelection(nextDeckId);
            return;
        }
        confirm(
            l('Kaydedilmemiş ayarlar', 'Unsaved settings'),
            l(
                'Başka bir desteye geçerseniz bu formdaki kaydedilmemiş değişiklikler silinecek.',
                'Switching decks will discard the unsaved changes in this form.',
            ),
            () => applyDeckSelection(nextDeckId),
            { destructive: true },
        );
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

    // The visible toolbar summary is stable while the form is edited. Avoid repeating deck
    // ownership queries for every keystroke or toggle change.
    const currentPresetSummary = useMemo(() => {
        const presetDecks = getDecksUsingConfig(configId);
        return {
            usedBy: presetDecks.length,
            name: getDeckConfig(configId).name,
        };
    }, [configId, presetRevision]);
    const usedBy = currentPresetSummary.usedBy;
    const presetName = currentPresetSummary.name;
    const regularDecks = useMemo(
        () => getAllDecks().filter((d) => !d.isFiltered),
        [deckRevision],
    );

    if (!deck) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.missing}>{l('Deste bulunamadı.', 'Deck not found.')}</Text>
            </SafeAreaView>
        );
    }

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

    /**
     * Read the form.
     *
     * Two rules follow Anki. A field the running scheduler hides is still carried through — its
     * stored value belongs to the preset and must survive a save made while FSRS is on — but it
     * can never report an error, because an error the learner cannot see is an error they cannot
     * fix. And a value that is merely unwise (a short maximum interval, Easy below Good) is
     * advice, printed under the field by `deckOptionsWarnings`, never a refusal to save.
     */
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
        /** A field the scheduler hides: keep a usable draft, fall back to what is stored. */
        const hiddenInteger = (key: FormKey, min: number, max: number, stored: number) => {
            integers[key] = parseBoundedIntegerDraft(String(form[key]), min, max).value ?? stored;
        };
        const hiddenDecimal = (key: FormKey, min: number, max: number, stored: number) => {
            decimals[key] = parseBoundedDecimalDraft(String(form[key]), min, max).value ?? stored;
        };
        const shows = (field: Parameters<typeof isDeckOptionFieldVisible>[0]) =>
            isDeckOptionFieldVisible(field, form.fsrsEnabled);
        // The preset as it is on disk. Read from the memo rather than the database: this runs on
        // every keystroke, and a stable object is also what keeps the advice below memoized.
        const stored = initialConfig;

        integer('newPerDay', 0, 9999);
        integer('maxReviewsPerDay', 0, 9999);
        integer('deckNewLimit', 0, 9999, true);
        integer('deckReviewLimit', 0, 9999, true);
        integer('todayNewLimit', 0, 9999, true);
        integer('todayReviewLimit', 0, 9999, true);
        integer('leechThreshold', 1, 9999);
        integer('maxAnswerSecs', 1, 7200);
        integer('maxIvl', 1, 36500);
        // Anki's Auto Advance dwells are fractions of a second, not whole ones: a card can be
        // revealed after 2.5 seconds.
        decimal('secondsToShowQuestion', 0, 7200);
        decimal('secondsToShowAnswer', 0, 7200);

        if (shows('graduatingIvl')) integer('graduatingIvl', 1, 36500);
        else hiddenInteger('graduatingIvl', 1, 36500, stored.graduatingIvl);
        if (shows('easyIvl')) integer('easyIvl', 1, 36500);
        else hiddenInteger('easyIvl', 1, 36500, stored.easyIvl);
        if (shows('minIvl')) integer('minIvl', 1, 36500);
        else hiddenInteger('minIvl', 1, 36500, stored.minIvl);
        if (shows('newIvlPercent')) integer('newIvlPercent', 0, 100);
        else hiddenInteger('newIvlPercent', 0, 100, Math.round((stored.newIvlPercent ?? 0) * 100));
        // The multiplier bounds are Anki's, widened wherever this app was already more permissive
        // so that a preset which arrived in a package can still be saved without being retyped.
        if (shows('startingEase')) decimal('startingEase', 1.3, 5);
        else hiddenDecimal('startingEase', 1.3, 5, stored.startingEase / 1000);
        if (shows('easyBonus')) decimal('easyBonus', 1, 5);
        else hiddenDecimal('easyBonus', 1, 5, stored.easyBonus);
        if (shows('hardIvl')) decimal('hardIvl', 0.5, 2);
        else hiddenDecimal('hardIvl', 0.5, 2, stored.hardIvl);
        if (shows('ivlModifier')) decimal('ivlModifier', 0.1, 3);
        else hiddenDecimal('ivlModifier', 0.1, 3, stored.ivlModifier);

        if (shows('desiredRetention')) {
            decimal('desiredRetention', FSRS_DESIRED_RETENTION_MIN, FSRS_DESIRED_RETENTION_MAX);
        } else {
            hiddenDecimal(
                'desiredRetention',
                FSRS_DESIRED_RETENTION_MIN,
                FSRS_DESIRED_RETENTION_MAX,
                stored.desiredRetention ?? FSRS_DEFAULT_DESIRED_RETENTION,
            );
        }
        if (shows('historicalRetention')) {
            decimal('historicalRetention', 0.5, 1);
        } else {
            hiddenDecimal(
                'historicalRetention',
                0.5,
                1,
                stored.historicalRetention ?? FSRS_DEFAULT_HISTORICAL_RETENTION,
            );
        }

        if (shows('fsrsParams') && parseFsrsParameterText(form.fsrsParams) === null) {
            errors.fsrsParams = l(
                'FSRS parametreleri 17, 19 veya 21 sayıdan oluşmalıdır.',
                'FSRS parameters must be a list of 17, 19 or 21 numbers.',
            );
        }
        if (shows('ignoreRevlogsBefore')
            && form.ignoreRevlogsBefore.trim() !== ''
            && !/^\d{4}-\d{2}-\d{2}$/.test(form.ignoreRevlogsBefore.trim())) {
            errors.ignoreRevlogsBefore = l('Tarihi YYYY-AA-GG olarak yazın.', 'Enter the date as YYYY-MM-DD.');
        }

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

        return { errors, integers, decimals, learningSteps, relearningSteps, stored };
    };

    /**
     * Anki's "Optimize" button. Training runs on the JS thread, so the interactive path is capped
     * to a few thousand reviews and a short schedule; that is enough to move the parameters off
     * the defaults without freezing the screen.
     */
    const INTERACTIVE_TRAINING_ITEM_CAP = 2000;
    const INTERACTIVE_TRAINING_ITERATIONS = 15;

    const handleOptimizeFsrs = () => {
        Keyboard.dismiss();
        if (optimizing) return;
        setOptimizing(true);
        try {
            const ignoreBefore = parseFsrsCutoffDate(form.ignoreRevlogsBefore);
            const histories = collectFsrsTrainingHistories(settings, { ignoreRevlogsBeforeMs: ignoreBefore });
            const reviewCount = countFsrsTrainingReviews(histories);

            if (reviewCount < FSRS_MIN_TRAINING_REVIEWS) {
                alert(
                    l('Yeterli geçmiş yok', 'Not enough history'),
                    l(
                        `Optimizasyon için en az ${FSRS_MIN_TRAINING_REVIEWS} tekrar gerekiyor; şu an ${reviewCount} var. Bir süre daha çalışıp tekrar deneyin.`,
                        `Optimizing needs at least ${FSRS_MIN_TRAINING_REVIEWS} reviews; there are ${reviewCount}. Study a while longer and try again.`,
                    ),
                );
                return;
            }

            const items = buildFsrsTrainingItems(histories, INTERACTIVE_TRAINING_ITEM_CAP);
            // Train inside the box Anki's trainer uses, which depends on the preset being edited:
            // extra relearning steps lower the shared w17/w18 ceiling, and same-day repeats put a
            // floor under w19. An unparseable steps field falls back to the single-step ceiling.
            const relearningSteps = parseAnkiStepText(form.relearningSteps, true);
            const result = optimizeFsrsParameters(items, {
                initialParameters: parseFsrsParameterText(form.fsrsParams) ?? undefined,
                iterations: INTERACTIVE_TRAINING_ITERATIONS,
                clamp: {
                    numRelearningSteps: relearningSteps?.length ?? 1,
                    enableShortTerm: form.fsrsShortTermWithSteps,
                },
            });

            if (!result.improved) {
                alert(
                    l('Parametreler zaten uygun', 'Parameters already fit'),
                    l(
                        'Mevcut parametreler bu geçmişi daha iyi açıklıyor; değişiklik yapılmadı.',
                        'The current parameters already explain this history best; nothing was changed.',
                    ),
                );
                return;
            }

            set('fsrsParams', formatFsrsParameterText(result.parameters));
            setOptimizedAtMs(Date.now());
            const warning = reviewCount < FSRS_RECOMMENDED_TRAINING_REVIEWS
                ? l(
                    `\n\nUyarı: ${FSRS_RECOMMENDED_TRAINING_REVIEWS} tekrarın altında sonuçlar oynak olabilir.`,
                    `\n\nNote: below ${FSRS_RECOMMENDED_TRAINING_REVIEWS} reviews the result can be unstable.`,
                )
                : '';
            alert(
                l('Parametreler güncellendi', 'Parameters updated'),
                l(
                    `${result.after.reviewCount} tekrar üzerinde tahmin hatası ${result.before.logLoss.toFixed(4)} → ${result.after.logLoss.toFixed(4)}. Uygulamak için Kaydet'e basın.${warning}`,
                    `Prediction error over ${result.after.reviewCount} reviews: ${result.before.logLoss.toFixed(4)} → ${result.after.logLoss.toFixed(4)}. Press Save to apply.${warning}`,
                ),
            );
        } catch (error) {
            console.warn('[DeckOptions] FSRS optimization failed:', error);
            alert(t('common.error'), l('Parametreler hesaplanamadı.', 'Could not compute the parameters.'));
        } finally {
            setOptimizing(false);
        }
    };

    const validation = validateFormDraft();
    const hasValidationErrors = Object.keys(validation.errors).length > 0;

    const warningText = (id: DeckOptionsWarningId): string => deckOptionsWarningText(id, l);

    /**
     * Anki's deck options advice, keyed by the field it belongs under. None of it blocks a save:
     * these are the warnings its own screen prints while happily storing the value.
     */
    const warningsByField = useMemo(() => {
        const daysSinceOptimization = validation.stored.fsrsParamsOptimizedAtMs
            ? (Date.now() - validation.stored.fsrsParamsOptimizedAtMs) / 86400000
            : undefined;
        const storedEasyDays = Array.isArray(validation.stored.easyDays) && validation.stored.easyDays.length === 7
            ? validation.stored.easyDays
            : [1, 1, 1, 1, 1, 1, 1];
        const warnings = deckOptionsWarnings({
            fsrsEnabled: form.fsrsEnabled,
            learningSteps: validation.learningSteps,
            relearningSteps: validation.relearningSteps,
            insertionOrder: form.insertionOrder,
            newPerDay: validation.integers.newPerDay,
            reviewsPerDay: validation.integers.maxReviewsPerDay,
            graduatingIvl: validation.integers.graduatingIvl,
            easyIvl: validation.integers.easyIvl,
            minIvl: validation.integers.minIvl,
            maxIvl: validation.integers.maxIvl,
            maxAnswerSecs: validation.integers.maxAnswerSecs,
            desiredRetention: validation.decimals.desiredRetention,
            easyDays: form.easyDays,
            easyDaysChanged: form.easyDays.some((factor, index) => factor !== storedEasyDays[index]),
            rescheduleOnChange: rescheduleOnSave,
            daysSinceOptimization,
        });
        const grouped: Record<string, DeckOptionsWarning[]> = {};
        for (const warning of warnings) {
            (grouped[warning.field] ??= []).push(warning);
        }
        return grouped;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form, validation.stored, rescheduleOnSave]);

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
                // Saving the form is an explicit choice, so it replaces any FSRS-only review
                // order preserved from an imported package rather than being overridden by it.
                ankiRaw: withoutPreservedReviewOrder(base.ankiRaw),
                buryNewSiblings: form.buryNewSiblings,
                buryReviewSiblings: form.buryReviewSiblings,
                buryInterdayLearningSiblings: form.buryInterdayLearningSiblings,
                autoPlayAudio: form.autoPlayAudio,
                audioPlaybackRate: parseFloat(form.audioPlaybackRate) || 1.0,
                skipQuestionWhenReplayingAnswer: form.skipQuestionWhenReplayingAnswer,
                showTimer: form.showTimer,
                maxAnswerSecs: integer('maxAnswerSecs'),
                stopTimerOnAnswer: form.stopTimerOnAnswer,
                secondsToShowQuestion: decimal('secondsToShowQuestion'),
                secondsToShowAnswer: decimal('secondsToShowAnswer'),
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
                fsrsParams: parseFsrsParameterText(form.fsrsParams) ?? undefined,
                desiredRetention: decimal('desiredRetention'),
                historicalRetention: decimal('historicalRetention'),
                ignoreRevlogsBeforeMs: parseFsrsCutoffDate(form.ignoreRevlogsBefore),
                // Stamped only by a run of the optimizer, so the "time to optimize again" nudge
                // measures the age of the fit rather than the age of the last unrelated save.
                fsrsParamsOptimizedAtMs: optimizedAtMs ?? base.fsrsParamsOptimizedAtMs,
                // The review order follows the scheduler: a preset left on retrievability cannot
                // stay there once FSRS is off, because no card carries the column any more.
                reviewSortOrder: resolveReviewSortOrderForScheduler(form.reviewSortOrder, form.fsrsEnabled),
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
            // Only the switches this screen actually owns. `fsrsShortTermWithSteps` is read for
            // the optimizer's clamp and has no control here, so writing it back would do nothing
            // but overwrite a value something else may have changed while this screen was open.
            saveCollectionDeckOptions({
                newCardsIgnoreReviewLimit: form.newCardsIgnoreReviewLimit,
                limitsStartFromTop: form.limitsStartFromTop,
                fsrsEnabled: form.fsrsEnabled,
            });
            if (includeSubdecks) subdecksChanged = applyConfigToSubdecks(deck.id);
            db.execSync('COMMIT;');
            transactionOpen = false;

            // Anki recomputes memory states when an FSRS input changes, and rewrites due dates
            // too when the learner asked for it. Nothing runs while FSRS is off. Asking for a
            // reschedule is enough on its own: it is a request to redo the dates from the
            // parameters already stored, whether or not this save changed any of them.
            const fsrsInputsChanged = form.fsrsEnabled
                && (settings.fsrsEnabled !== true
                    || formatFsrsParameterText(base.fsrsParams) !== formatFsrsParameterText(updated.fsrsParams)
                    || base.desiredRetention !== updated.desiredRetention
                    || base.historicalRetention !== updated.historicalRetention
                    || base.ignoreRevlogsBeforeMs !== updated.ignoreRevlogsBeforeMs);
            if (fsrsInputsChanged || (form.fsrsEnabled && rescheduleOnSave)) {
                try {
                    rebuildFsrsMemoryStates(
                        { ...settings, fsrsEnabled: true },
                        { reschedule: rescheduleOnSave },
                    );
                } catch (memoryError) {
                    console.warn('[DeckOptions] FSRS memory rebuild failed:', memoryError);
                }
            }

            // The transaction is already durable here. A presentation refresh must never turn a
            // successful commit into a false “nothing was saved” error.
            try {
                const savedDeck = getDeck(deck.id) ?? deck;
                const savedToday = getDeckTodayLimits(deck.id, settings.dayRolloverHour);
                const normalizedForm = formFromConfig(getDeckConfig(configId), savedDeck.description, savedDeck, savedToday);
                setForm(normalizedForm);
                setSavedSnapshot(snapshotForm(configId, normalizedForm));
                setRescheduleOnSave(false);
                setOptimizedAtMs(null);
                setPresetRevision((value) => value + 1);
                setDeckRevision((value) => value + 1);
                refreshData();
                markSchedulingStale();
            } catch (refreshError) {
                console.warn('[DeckOptions] saved but refresh failed:', refreshError);
                setSavedSnapshot(snapshotForm(configId, form));
                markSchedulingStale();
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
            markSchedulingStale();
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
            markSchedulingStale();
        };
        if (!isDirty) clone();
        else confirm(
            l('Bu deste için ayrı ayar grubu', 'Separate preset for this deck'),
            l(
                'Seçili ayar grubu kopyalanıp yalnızca bu desteye atanacak; kaydedilmemiş değişiklikler bırakılacak.',
                'The selected preset will be copied and assigned only to this deck; unsaved changes will be discarded.',
            ),
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
                    markSchedulingStale();
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
                markSchedulingStale();
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

    /** The review orders Anki offers for the scheduler in use, with its labels. */
    const reviewOrderOptions: SelectOption[] = reviewSortOrderChoices(form.fsrsEnabled).map((choice) => {
        const labels: Record<ReviewSortOrderLabelId, string> = {
            dueThenRandom: l('Zamanı gelen, sonra rastgele', 'Due date, then random'),
            dueThenDeck: l('Zamanı gelen, sonra deste', 'Due date, then deck'),
            deckThenDue: l('Deste, sonra zamanı gelen', 'Deck, then due date'),
            intervalsAsc: l('Aralık artan', 'Ascending intervals'),
            intervalsDesc: l('Aralık azalan', 'Descending intervals'),
            easeAsc: l('Kolaylık artan', 'Ascending ease'),
            easeDesc: l('Kolaylık azalan', 'Descending ease'),
            difficultyAsc: l('Zorluk artan', 'Ascending difficulty'),
            difficultyDesc: l('Zorluk azalan', 'Descending difficulty'),
            retrievabilityAsc: l('Hatırlanabilirlik artan', 'Ascending retrievability'),
            retrievabilityDesc: l('Hatırlanabilirlik azalan', 'Descending retrievability'),
            relativeOverdueness: l('Göreli gecikmişlik', 'Relative overdueness'),
            random: l('Rastgele', 'Random'),
            added: l('Eklenme sırası', 'Order added'),
            reverseAdded: l('Son eklenen önce', 'Latest added first'),
        };
        return { key: choice.order, label: labels[choice.label] };
    });

    /**
     * What the parameters field says beneath itself: when this preset was last fitted, which is
     * the only way to tell a set the optimizer produced from the shipped defaults.
     */
    const optimizedAtHint = (() => {
        const base = l('17, 19 veya 21 sayı. Boş bırakmak varsayılanlara döner.', '17, 19 or 21 numbers. Leaving it empty restores the defaults.');
        const stampedAt = optimizedAtMs ?? validation.stored.fsrsParamsOptimizedAtMs;
        if (!stampedAt) return base;
        const date = new Date(stampedAt).toISOString().slice(0, 10);
        return `${base} ${l(`Son optimizasyon: ${date}.`, `Last optimized: ${date}.`)}`;
    })();

    const cancelLabel = t('common.cancel');
    const limitLabels = {
        preset: l('Ayar grubu', 'Preset'),
        deck: l('Bu deste', 'This deck'),
        today: l('Yalnızca bugün', 'Today only'),
    };
    const optionHelp = buildOptionHelp(l);
    const scopedNewValue = newLimitScope === 'preset'
        ? form.newPerDay
        : newLimitScope === 'deck'
            ? form.deckNewLimit
            : form.todayNewLimit;
    const scopedNewPlaceholder = newLimitScope === 'preset'
        ? '20'
        : newLimitScope === 'deck'
            ? (form.newPerDay.trim() || '20')
            : (form.deckNewLimit.trim() || form.newPerDay.trim() || '20');

    const scopedReviewValue = reviewLimitScope === 'preset'
        ? form.maxReviewsPerDay
        : reviewLimitScope === 'deck'
            ? form.deckReviewLimit
            : form.todayReviewLimit;
    const scopedReviewPlaceholder = reviewLimitScope === 'preset'
        ? '200'
        : reviewLimitScope === 'deck'
            ? (form.maxReviewsPerDay.trim() || '200')
            : (form.deckReviewLimit.trim() || form.maxReviewsPerDay.trim() || '200');

    const setScopedNewValue = (value: string) => set(newLimitScope === 'preset' ? 'newPerDay' : newLimitScope === 'deck' ? 'deckNewLimit' : 'todayNewLimit', value);
    const setScopedReviewValue = (value: string) => set(reviewLimitScope === 'preset' ? 'maxReviewsPerDay' : reviewLimitScope === 'deck' ? 'deckReviewLimit' : 'todayReviewLimit', value);
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
    const deckOptionsContextValue = useMemo(() => ({
        styles,
        colors,
        errors: validation.errors,
        warnings: warningsByField,
        warningText,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [styles, colors, validation.errors, warningsByField, l]);

    return (
        <DeckOptionsContext.Provider value={deckOptionsContextValue}>
            <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => goBackOr(router)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Deste genel bakışına dön', 'Back to deck overview')}
                >
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{l('Deste seçenekleri', 'Deck Options')}</Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>{deck.name.replaceAll('::', ' › ')}</Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                automaticallyAdjustKeyboardInsets={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >

                <View style={styles.presetToolbar}>
                    <TouchableOpacity
                        style={styles.presetSelector}
                        onPress={() => { Keyboard.dismiss(); setDeckPickerOpen(true); }}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Deste: ${deck.name.replaceAll('::', ' › ')}`, `Deck: ${deck.name.replaceAll('::', ' › ')}`)}
                    >
                        <View style={styles.presetSelectorTextWrap}>
                            <Text style={styles.presetSelectorLabel}>{l('Deste', 'Deck')}</Text>
                            <Text style={styles.presetSelectorName} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>
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

                <TouchableOpacity
                    style={styles.presetRow}
                    onPress={() => { Keyboard.dismiss(); setPresetPickerOpen(true); }}
                    accessibilityRole="button"
                    accessibilityLabel={l(
                        `Ayar grubu: ${presetName}, ${usedBy} destede kullanılıyor. Değiştirmek için dokunun.`,
                        `Preset: ${presetName}, used by ${usedBy} decks. Tap to change.`,
                    )}
                >
                    <View style={styles.presetSelectorTextWrap}>
                        <Text style={styles.presetSelectorLabel}>{l('Ayar grubu', 'Preset')}</Text>
                        <Text style={styles.presetSelectorName} numberOfLines={1}>{presetName}</Text>
                    </View>
                    <Text style={styles.presetSelectorMeta} numberOfLines={1}>
                        {l(`${usedBy} deste`, `${usedBy} decks`)}
                    </Text>
                    <Text style={styles.presetSelectorChevron}>⌄</Text>
                </TouchableOpacity>

                <View
                    style={[
                        styles.saveStatus,
                        !currentStatusMessage && styles.saveStatusHidden,
                        (hasValidationErrors && isDirty) || saveState === 'error'
                            ? styles.saveStatusError
                            : saveState === 'saved'
                                ? styles.saveStatusSuccess
                                : styles.saveStatusPending,
                        { pointerEvents: currentStatusMessage ? 'auto' : 'none' },
                    ]}
                    accessibilityLiveRegion="polite"
                >
                    <View style={[
                        styles.saveStatusDot,
                        (hasValidationErrors && isDirty) || saveState === 'error'
                            ? { backgroundColor: colors.btnAgain }
                            : saveState === 'saved'
                                ? { backgroundColor: colors.btnGood }
                                : { backgroundColor: colors.btnHard },
                    ]} />
                    <Text style={styles.saveStatusText}>{currentStatusMessage || ' '}</Text>
                </View>

                <OptionCard wide={useTwoColumns} title={l('Günlük limitler', 'Daily Limits')} styles={styles} help={optionHelp.dailyLimits}>
                    <LimitTabs value={newLimitScope} onChange={setNewLimitScope} styles={styles} labels={limitLabels} />
                    <Field
                        field={newLimitScope === 'preset' ? 'newPerDay' : newLimitScope === 'deck' ? 'deckNewLimit' : 'todayNewLimit'}
                        label={l('Günlük yeni kart', 'New cards/day')}
                        value={scopedNewValue}
                        placeholder={scopedNewPlaceholder}
                        onChange={setScopedNewValue}
                        inputRef={newLimitInputRef}
                    />
                    <LimitTabs value={reviewLimitScope} onChange={setReviewLimitScope} styles={styles} labels={limitLabels} />
                    <Field
                        field={reviewLimitScope === 'preset' ? 'maxReviewsPerDay' : reviewLimitScope === 'deck' ? 'deckReviewLimit' : 'todayReviewLimit'}
                        label={l('Günlük en fazla tekrar', 'Maximum reviews/day')}
                        value={scopedReviewValue}
                        placeholder={scopedReviewPlaceholder}
                        onChange={setScopedReviewValue}
                        inputRef={reviewLimitInputRef}
                    />
                    <FieldAdvice field="maxReviewsPerDay" />
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
                <FieldAdvice field="learningSteps" />
                {/* FSRS derives the first day-scale interval from the card's own memory state,
                    so these two are hidden while it is on, exactly as Anki hides them. */}
                {!form.fsrsEnabled ? (
                    <>
                        <Field field="graduatingIvl" label={l('Mezuniyet aralığı (gün)', 'Graduating interval (days)')} value={form.graduatingIvl} onChange={(t) => set('graduatingIvl', t)} />
                        <Field field="easyIvl" label={l('Kolay aralığı (gün)', 'Easy interval (days)')} value={form.easyIvl} onChange={(t) => set('easyIvl', t)} />
                        <FieldAdvice field="easyIvl" />
                    </>
                ) : null}
                <SelectSetting
                    label={l('Ekleniş sırası', 'Insertion order')}
                    value={form.insertionOrder}
                    options={[{ key: 'sequential', label: l('Sıralı', 'Sequential') }, { key: 'random', label: l('Rastgele', 'Random') }]}
                    onChange={(key) => set('insertionOrder', key as 'sequential' | 'random')}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <FieldAdvice field="insertionOrder" />
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
                <FieldAdvice field="relearningSteps" />
                {!form.fsrsEnabled ? (
                    <Field field="minIvl" label={l('En az aralık (gün)', 'Minimum interval (days)')} value={form.minIvl} onChange={(t) => set('minIvl', t)} />
                ) : null}
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

                <OptionCard wide={useTwoColumns} title="FSRS" styles={styles} help={optionHelp.fsrs}>
                    <SwitchRow
                        label={l('FSRS zamanlayıcısını kullan', 'Use the FSRS scheduler')}
                        value={form.fsrsEnabled}
                        onChange={(value) => {
                            setSaveState('idle');
                            setSaveMessage('');
                            // Switching the scheduler off takes away the column a retrievability
                            // order sorts on, so the preset moves to the nearest order that is
                            // still meaningful rather than silently sorting by nothing.
                            setForm((prev) => ({
                                ...prev,
                                fsrsEnabled: value,
                                reviewSortOrder: resolveReviewSortOrderForScheduler(prev.reviewSortOrder, value),
                            }));
                            if (!value) setRescheduleOnSave(false);
                        }}
                    />
                    <Text style={styles.fieldHint}>
                        {l(
                            'FSRS her kart için hafıza gücünü (stability) ve zorluğunu izler; aralıkları kolaylık çarpanı yerine bu iki sayıdan hesaplar. Anahtar tüm koleksiyon için, aşağıdaki değerler bu ön ayar içindir.',
                            'FSRS tracks each card’s memory strength and difficulty, and derives intervals from those instead of an ease multiplier. The switch is collection-wide; the values below belong to this preset.',
                        )}
                    </Text>

                    {form.fsrsEnabled && (
                        <>
                            <Field
                                field="desiredRetention"
                                kind="decimal"
                                label={l('Hedeflenen hatırlama oranı', 'Desired retention')}
                                value={form.desiredRetention}
                                onChange={(value) => set('desiredRetention', value)}
                                hint={l(
                                    '0,70–0,99. Yüksek değer daha sık tekrar demektir; Anki 0,90 önerir.',
                                    '0.70–0.99. A higher value means more frequent reviews; Anki recommends 0.90.',
                                )}
                            />
                            <FieldAdvice field="desiredRetention" />
                            <SwitchRow
                                label={l('Değişiklikte kartları yeniden zamanla', 'Reschedule cards on change')}
                                value={rescheduleOnSave}
                                onChange={(value) => {
                                    setSaveState('idle');
                                    setSaveMessage('');
                                    setRescheduleOnSave(value);
                                }}
                            />
                            <Text style={styles.fieldHint}>
                                {l(
                                    'Kapalıyken yeni ayarlar yalnızca bundan sonraki cevapları etkiler; açıkken mevcut vade tarihleri de yeniden hesaplanır. Bu seçim tek bir kayda aittir ve ekran her açıldığında kapalı başlar.',
                                    'While off, new settings affect only future answers; while on, existing due dates are recomputed as well. The choice belongs to one save: it starts off every time this screen opens.',
                                )}
                            </Text>

                            <TouchableOpacity
                                style={[styles.optimizeButton, optimizing && styles.optimizeButtonBusy]}
                                onPress={handleOptimizeFsrs}
                                disabled={optimizing}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: optimizing }}
                            >
                                <Text style={styles.optimizeButtonText}>
                                    {optimizing
                                        ? l('Hesaplanıyor…', 'Optimizing…')
                                        : l('Parametreleri optimize et', 'Optimize parameters')}
                                </Text>
                            </TouchableOpacity>
                            <Text style={styles.fieldHint}>
                                {l(
                                    'Kendi tekrar geçmişinizden 21 parametreyi yeniden hesaplar. Sonuç yalnızca mevcut parametrelerden daha iyi tahmin ediyorsa alana yazılır.',
                                    'Refits the 21 parameters from your own review history. The result is written to the field only when it predicts better than the current one.',
                                )}
                            </Text>

                            <TextBlockSetting
                                label={l('FSRS parametreleri', 'FSRS parameters')}
                                value={form.fsrsParams}
                                onChange={(value) => set('fsrsParams', value)}
                                styles={styles}
                                colors={colors}
                                error={validation.errors.fsrsParams}
                                hint={optimizedAtHint}
                            />
                            <FieldAdvice field="fsrsParams" />
                            <Field
                                field="historicalRetention"
                                kind="decimal"
                                label={l('Geçmiş hatırlama oranı', 'Historical retention')}
                                value={form.historicalRetention}
                                onChange={(value) => set('historicalRetention', value)}
                                hint={l(
                                    'Tekrar kaydı olmayan eski kartların hafıza durumu bu orana göre tahmin edilir.',
                                    'Used to estimate the memory state of older cards that have no review log.',
                                )}
                            />
                            <Field
                                field="ignoreRevlogsBefore"
                                kind="text"
                                label={l('Şu tarihten önceki tekrarları yok say', 'Ignore reviews before')}
                                value={form.ignoreRevlogsBefore}
                                onChange={(value) => set('ignoreRevlogsBefore', value)}
                                hint={l('YYYY-AA-GG. Boş bırakılırsa tüm geçmiş kullanılır.', 'YYYY-MM-DD. Leave empty to use the whole history.')}
                            />
                        </>
                    )}
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
                    options={reviewOrderOptions}
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
                <SelectSetting
                    label={l('Ses oynatma hızı', 'Audio playback speed')}
                    value={form.audioPlaybackRate}
                    options={[
                        { key: '0.75', label: '0.75x' },
                        { key: '1', label: '1.0x' },
                        { key: '1.25', label: '1.25x' },
                        { key: '1.5', label: '1.5x' },
                        { key: '2', label: '2.0x' },
                    ]}
                    onChange={(v) => set('audioPlaybackRate', v)}
                    styles={styles}
                    colors={colors}
                    cancelLabel={cancelLabel}
                />
                <SwitchRow
                    label={l('Cevabı yeniden oynatırken soruyu atla', 'Skip question when replaying answer')}
                    value={form.skipQuestionWhenReplayingAnswer}
                    onChange={(value) => set('skipQuestionWhenReplayingAnswer', value)}
                />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Zamanlayıcılar', 'Timers')} styles={styles} help={optionHelp.timers}>
                    <Field field="maxAnswerSecs" label={l('En fazla cevap süresi', 'Maximum answer time')} value={form.maxAnswerSecs} onChange={(value) => set('maxAnswerSecs', value)} suffix={l('sn', 'sec')} />
                    <FieldAdvice field="maxAnswerSecs" />
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
                        kind="decimal"
                        label={l('Soruyu gösterme süresi', 'Question display time')}
                        value={form.secondsToShowQuestion}
                        onChange={(value) => set('secondsToShowQuestion', value)}
                        suffix={l('sn', 'sec')}
                        hint={l('0 = kapalı · ondalık yazılabilir (2,5)', '0 = disabled · decimals allowed (2.5)')}
                    />
                    <Field
                        field="secondsToShowAnswer"
                        kind="decimal"
                        label={l('Cevabı gösterme süresi', 'Answer display time')}
                        value={form.secondsToShowAnswer}
                        onChange={(value) => set('secondsToShowAnswer', value)}
                        suffix={l('sn', 'sec')}
                        hint={l('0 = kapalı · ondalık yazılabilir (2,5)', '0 = disabled · decimals allowed (2.5)')}
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
                <FieldAdvice field="easyDays" />
                </OptionCard>

                <OptionCard wide={useTwoColumns} title={l('Gelişmiş', 'Advanced')} styles={styles} help={optionHelp.advanced}>
                <Field field="maxIvl" label={l('En fazla aralık (gün)', 'Maximum interval (days)')} value={form.maxIvl} onChange={(t) => set('maxIvl', t)} />
                <FieldAdvice field="maxIvl" />
                {/* The ease multipliers are the classic scheduler's whole arithmetic; FSRS never
                    reads one, so Anki hides them rather than leaving dials that turn nothing. */}
                {!form.fsrsEnabled ? (
                    <>
                        <Field field="startingEase" kind="decimal" label={l('Başlangıç kolaylığı', 'Starting ease')} value={form.startingEase} onChange={(t) => set('startingEase', t)} hint={l('1,30–5,00 arası. Örn. 2,50', 'Between 1.30 and 5.00. E.g. 2.50')} />
                        <Field field="easyBonus" kind="decimal" label={l('Kolay bonusu', 'Easy bonus')} value={form.easyBonus} onChange={(t) => set('easyBonus', t)} hint={l('1,00–5,00 arası. Varsayılan 1,30', 'Between 1.00 and 5.00. Default 1.30')} />
                        <Field field="hardIvl" kind="decimal" label={l('Zor aralık çarpanı', 'Hard interval multiplier')} value={form.hardIvl} onChange={(t) => set('hardIvl', t)} hint={l('0,50–2,00 arası. Varsayılan 1,20', 'Between 0.50 and 2.00. Default 1.20')} />
                        <Field field="ivlModifier" kind="decimal" label={l('Aralık düzenleyici', 'Interval modifier')} value={form.ivlModifier} onChange={(t) => set('ivlModifier', t)} />
                        <Field field="newIvlPercent" label={l('Yeni aralık (%) — unutma sonrası', 'New interval (%) after lapse')} value={form.newIvlPercent} onChange={(t) => set('newIvlPercent', t)} hint={l('0 = baştan başla', '0 = start over')} />
                    </>
                ) : (
                    <Text style={styles.fieldHint}>
                        {l(
                            'FSRS açıkken kolaylık çarpanları kullanılmaz; aralıkları kartın hafıza durumu belirler. Hedeflenen hatırlama oranı ve parametreler FSRS bölümündedir.',
                            'With FSRS on the ease multipliers are unused: intervals come from each card’s memory state. Desired retention and the parameters live in the FSRS section.',
                        )}
                    </Text>
                )}
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

            {presetActionsOpen ? (
                <PresetActionsMenu
                    actions={[
                        { label: l('Kaydet', 'Save'), action: handleSave },
                        // Changing the preset has its own row at the top of the screen now,
                        // where Anki keeps it, so the menu is the actions on that preset.
                        { label: l('Bu deste için ayrı ayar grubu oluştur', 'Create a Separate Preset for This Deck'), action: handleClonePreset },
                        { label: l('Varsayılana dön', 'Restore Defaults'), action: handleRestoreDefaults },
                        { label: l('Ayar grubu ekle', 'Add Preset'), action: handleAddPreset },
                        { label: l('Ayar grubunu yeniden adlandır', 'Rename preset'), action: () => { setRenameText(presetName); setRenameOpen(true); } },
                        { label: l('Kaydet ve tüm alt destelere uygula', 'Save and Apply to All Subdecks'), action: handleApplyToSubdecks },
                        { label: l('Sil', 'Delete'), action: handleDeletePreset, destructive: true },
                    ]}
                    onClose={() => setPresetActionsOpen(false)}
                    styles={styles}
                />
            ) : null}

            {deckPickerOpen ? (
                <DeckPickerModal
                    visible={deckPickerOpen}
                    colors={colors}
                    decks={regularDecks}
                    selectedDeckName={deck.name}
                    activeDeckName={deck.name}
                    title={l('Deste seç', 'Choose Deck')}
                    allDecksLabel={null}
                    searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                    emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                    cancelLabel={t('common.cancel')}
                    closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                    searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                    createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                    onClose={() => setDeckPickerOpen(false)}
                    onSelect={(pickedName) => {
                        if (!pickedName) return;
                        const picked = getDeckByName(pickedName);
                        if (!picked) return;
                        switchDeck(picked.id);
                        setDeckPickerOpen(false);
                    }}
                    onCreateDeck={(name) => {
                        try {
                            const created = createDeck(getAvailableDeckName(name));
                            setDeckRevision((v) => v + 1);
                            invalidateCollection();
                            return created.name;
                        } catch (e) {
                            console.warn('[DeckOptions] create deck failed:', e);
                            return null;
                        }
                    }}
                />
            ) : null}

            {presetPickerOpen ? (
                <PresetPickerModal
                    activePresetId={configId}
                    onPick={switchPreset}
                    onClose={() => setPresetPickerOpen(false)}
                    styles={styles}
                    l={l}
                    t={t}
                />
            ) : null}

            {renameOpen ? (
                <RenamePresetModal
                    value={renameText}
                    onChangeValue={setRenameText}
                    onSave={() => {
                        const nextName = renameText.trim();
                        if (!nextName) {
                            alert(l('Geçersiz ad', 'Invalid name'), l('Ayar grubu adı boş olamaz.', 'The preset name cannot be empty.'));
                            return;
                        }
                        try {
                            renamePreset(configId, nextName);
                            setPresetRevision((value) => value + 1);
                            setRenameOpen(false);
                        } catch (error) {
                            console.warn('[DeckOptions] preset rename failed:', error);
                            alert(t('common.error'), l('Ayar grubu yeniden adlandırılamadı.', 'Could not rename the preset.'));
                        }
                    }}
                    onClose={() => setRenameOpen(false)}
                    styles={styles}
                    l={l}
                    t={t}
                />
            ) : null}
        </SafeAreaView>
        </DeckOptionsContext.Provider>
    );
}
