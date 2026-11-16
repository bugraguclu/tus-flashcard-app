import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';
import { SheetScrollView } from '../SwipeDismissSheet';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';
import { ListRow, SwitchRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { localDayNumber } from '../../lib/ankiState';
import { getDecksUsingConfig } from '../../lib/deckManager';
import type { NumericDraftIssue } from '../../lib/deckOptionsForm';
import { FSRS_DEFAULT_HISTORICAL_RETENTION, parseFsrsParameterText } from '../../lib/fsrs';
import { simulateFsrs, type FsrsSimulationResult } from '../../lib/fsrsSimulator';
import { loadFsrsSimulatorSource } from '../../lib/fsrsSimulatorData';
import {
    SIMULATOR_BOUNDS,
    parseSimulatorDraft,
    simulatorBucketDays,
    simulatorDraftFromPreset,
    simulatorStepCount,
    type SimulatorDraft,
    type SimulatorNumberField,
    type SimulatorPresetValues,
} from '../../lib/fsrsSimulatorView';
import type { AppSettings, ReviewSortOrder } from '../../lib/types';
import { NumberSetting, SettingBlock, SettingHint, SettingsCard } from './SettingControls';

/** The deck-options values the simulator reads, as the form holds them. */
export interface SimulatorPresetForm extends SimulatorPresetValues {
    fsrsParams: string;
    historicalRetention: string;
    learningSteps: string;
    relearningSteps: string;
    reviewSortOrder: ReviewSortOrder;
    easyDays: number[];
}

/**
 * The results view draws its chart with react-native-svg; it is loaded the first time a result is
 * shown, so opening Deck Options does not load the chart code.
 */
const SimulatorResults = lazy(() => import('./FsrsSimulatorResults'));

interface Outcome {
    result: FsrsSimulationResult;
    today: number;
    timeAvailable: boolean;
    skipped: number;
}

/**
 * Anki's FSRS simulator (24.11+), opened from Deck Options › FSRS in a bottom sheet: the
 * preset's studied cards with their memory state and due day, plus its new cards and any extra
 * ones, simulated day by day with the inputs below (lib/fsrsSimulator.ts). It reads the collection
 * only; none of its inputs is saved to the preset.
 */
export default function FsrsSimulatorSheet({ presetId, settings, preset, storedParamsText, ignoreRevlogsBeforeMs }: {
    presetId: number;
    settings: AppSettings;
    preset: SimulatorPresetForm;
    /** The parameter text the preset was loaded with: the cards' stored states belong to it. */
    storedParamsText: string;
    ignoreRevlogsBeforeMs: number;
}) {
    const { l } = useI18n();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<SimulatorDraft>(() => simulatorDraftFromPreset(preset));
    const [showErrors, setShowErrors] = useState(false);
    const [advanced, setAdvanced] = useState(false);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [message, setMessage] = useState('');
    const stopRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => () => {
        mounted.current = false;
        stopRef.current = true;
    }, []);

    const parsed = parseSimulatorDraft(draft);
    const issueText = (field: SimulatorNumberField, issue: NumericDraftIssue | undefined) => {
        if (!issue || !showErrors) return undefined;
        const [min, max] = SIMULATOR_BOUNDS[field];
        const comma = (value: number) => String(value).replace('.', ',');
        return l(`${comma(min)}–${comma(max)} arasında bir sayı girin.`, `Enter a number from ${min} to ${max}.`);
    };

    const openSheet = () => {
        Keyboard.dismiss();
        setDraft(simulatorDraftFromPreset(preset));
        setShowErrors(false);
        setOutcome(null);
        setMessage('');
        setOpen(true);
    };
    const close = () => {
        stopRef.current = true;
        setOpen(false);
    };
    const update = <K extends keyof SimulatorDraft>(field: K, value: SimulatorDraft[K]) => setDraft((prev) => ({ ...prev, [field]: value }));

    const announce = (text: string) => {
        setMessage(text);
        AccessibilityInfo.announceForAccessibility?.(text);
    };

    const simulate = async () => {
        Keyboard.dismiss();
        if (running) {
            stopRef.current = true;
            return;
        }
        setShowErrors(true);
        const values = parsed.settings;
        if (!values) {
            announce(l('Önce işaretli alanları düzeltin.', 'Fix the marked fields first.'));
            return;
        }
        const params = parseFsrsParameterText(preset.fsrsParams);
        if (params === null) {
            announce(l(
                'Önce FSRS parametrelerini düzeltin: 17, 19 veya 21 sayı olmalıdır.',
                'Fix the FSRS parameters first: they must be a list of 17, 19 or 21 numbers.',
            ));
            return;
        }
        stopRef.current = false;
        setRunning(true);
        setProgress(0);
        setMessage('');
        try {
            // Let the button show that the run has started before the collection is read.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            const nowMs = Date.now();
            const historical = Number(preset.historicalRetention.replace(',', '.'));
            const source = loadFsrsSimulatorSource({
                deckIds: getDecksUsingConfig(presetId).map((deck) => deck.id),
                settings,
                params,
                useStoredMemory: preset.fsrsParams.trim() === storedParamsText.trim(),
                historicalRetention: Number.isFinite(historical) && historical > 0 && historical < 1 ? historical : FSRS_DEFAULT_HISTORICAL_RETENTION,
                ignoreRevlogsBeforeMs,
                nowMs,
            });
            const newCards = source.newCards + values.additionalNewCards;
            if (source.existing.length === 0 && (newCards === 0 || values.newPerDay === 0)) {
                announce(l(
                    'Simüle edilecek kart yok: bu ayar grubunda çalışılmış ya da yeni kart bulunmuyor. Ek yeni kart sayısı girebilirsiniz.',
                    'Nothing to simulate: this preset has no studied or new cards. You can add new cards to simulate.',
                ));
                return;
            }
            const result = await simulateFsrs({
                params,
                desiredRetention: values.desiredRetention,
                days: values.days,
                existing: source.existing,
                newCards,
                introducedToday: Math.min(source.introducedToday, values.newPerDay),
                newLimit: values.newPerDay,
                reviewLimit: values.reviewsPerDay,
                maxInterval: values.maxInterval,
                newCardsIgnoreReviewLimit: values.newCardsIgnoreReviewLimit,
                leechThreshold: values.leechThreshold,
                learningSteps: simulatorStepCount(preset.learningSteps),
                relearningSteps: simulatorStepCount(preset.relearningSteps),
                reviewOrder: preset.reviewSortOrder,
                easyDays: preset.easyDays,
                nextDayAtMs: source.nextDayAtMs,
                learner: source.learner,
                // The chart reads memorized cards at the end of each bar.
                memorizedStride: simulatorBucketDays(values.days),
            }, (done, total) => {
                if (mounted.current) setProgress(done / total);
                return !stopRef.current;
            });
            if (!result || !mounted.current) return;
            setOutcome({
                result,
                today: localDayNumber(nowMs, settings.dayRolloverHour),
                timeAvailable: source.timedAnswers > 0,
                skipped: source.skipped,
            });
            const reviews = result.reviews.reduce((sum, value) => sum + value, 0);
            AccessibilityInfo.announceForAccessibility?.(l(
                `Simülasyon bitti: ${values.days} günde ${reviews} tekrar.`,
                `Simulation finished: ${reviews} reviews over ${values.days} days.`,
            ));
        } catch (error) {
            console.warn('[DeckOptions] FSRS simulation failed:', error);
            announce(l('Simülasyon yapılamadı.', 'Could not run the simulation.'));
        } finally {
            if (mounted.current) setRunning(false);
        }
    };

    const numberRow = (field: SimulatorNumberField, label: string, kind: 'integer' | 'decimal' = 'integer', hint?: string) => (
        <NumberSetting
            label={label}
            value={draft[field]}
            onChange={(value) => update(field, value)}
            kind={kind}
            hint={hint}
            error={issueText(field, parsed.errors[field])}
        />
    );
    const percent = Math.round(progress * 100);

    return (
        <SettingBlock>
            <Button
                variant="secondary"
                label={l('FSRS simülatörü', 'FSRS simulator')}
                onPress={openSheet}
                accessibilityHint={l('Bu ayar grubuyla önümüzdeki günlerin iş yükünü tahmin eder; hiçbir şeyi değiştirmez', 'Estimates the coming workload with this preset; changes nothing')}
            />
            <SettingHint>
                {l(
                    'Bu ayar grubunun kartlarıyla günlük tekrar sayısını, süreyi ve ezberlenen kart sayısını tahmin eder. Ayarları değiştirmez.',
                    'Estimates daily reviews, study time and memorized cards with this preset\'s cards. It changes no setting.',
                )}
            </SettingHint>

            <AppSheet
                visible={open}
                onClose={close}
                title={l('Simülatör', 'Simulator')}
                subtitle="FSRS"
                backdropLabel={l('Simülatörü kapat', 'Close the simulator')}
                avoidKeyboard
                maxHeight="92%"
            >
                <SheetScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <SettingsCard>
                        {numberRow('days', l('Simüle edilecek gün', 'Days to simulate'))}
                        {numberRow('additionalNewCards', l('Simüle edilecek ek yeni kart', 'Additional new cards to simulate'))}
                        {numberRow('desiredRetention', l('Hedeflenen hatırlama oranı', 'Desired retention'), 'decimal')}
                        {numberRow('newPerDay', l('Günlük yeni kart', 'New cards/day'), 'integer', l(
                            'Uygulamada yeni kartlar için günlük sınır yok; burada günde kaç yeni kart öğrenmeyi düşündüğünüzü girin.',
                            'The app sets no daily limit on new cards; enter how many new cards a day you plan to learn.',
                        ))}
                        {numberRow('reviewsPerDay', l('Günlük en fazla tekrar', 'Maximum reviews/day'))}
                        <ListRow
                            title={l('Gelişmiş ayarlar', 'Advanced settings')}
                            expanded={advanced}
                            onPress={() => setAdvanced((value) => !value)}
                        />
                        {advanced ? (
                            <>
                                {numberRow('maxInterval', l('En fazla aralık (gün)', 'Maximum interval (days)'))}
                                <SwitchRow
                                    title={l('Yeni kartlar tekrar sınırını yok sayar', 'New cards ignore review limit')}
                                    value={draft.newCardsIgnoreReviewLimit}
                                    onValueChange={(value) => update('newCardsIgnoreReviewLimit', value)}
                                />
                                <SwitchRow
                                    title={l('Sürekli unutulan kartları askıya al', 'Suspend leeches')}
                                    value={draft.suspendLeeches}
                                    onValueChange={(value) => update('suspendLeeches', value)}
                                />
                                {draft.suspendLeeches ? numberRow('leechThreshold', l('Sürekli unutulan kart eşiği', 'Leech threshold (lapses)')) : null}
                                <SettingBlock>
                                    <SettingHint>
                                        {l(
                                            'Tekrar sırası, Kolay günler ve öğrenme adımları ayar grubundaki gibidir.',
                                            'The review order, Easy Days and learning steps are the preset\'s.',
                                        )}
                                    </SettingHint>
                                </SettingBlock>
                            </>
                        ) : null}
                    </SettingsCard>

                    <Button
                        label={running ? l(`Simüle ediliyor… %${percent} (durdur)`, `Simulating… ${percent}% (stop)`) : l('Simüle et', 'Simulate')}
                        onPress={simulate}
                        accessibilityLabel={running
                            ? l(`Simüle ediliyor, yüzde ${percent}`, `Simulating, ${percent} percent`)
                            : l('Simüle et', 'Simulate')}
                        accessibilityHint={running ? l('Durdurmak için dokunun', 'Tap to stop') : undefined}
                    />
                    {message ? <Notice>{message}</Notice> : null}

                    {outcome ? (
                        <View style={styles.results}>
                            <Suspense fallback={<ActivityIndicator accessibilityLabel={l('Grafik yükleniyor', 'Loading the chart')} />}>
                                <SimulatorResults result={outcome.result} today={outcome.today} timeAvailable={outcome.timeAvailable} />
                            </Suspense>
                            {outcome.skipped > 0 ? (
                                <SettingHint>
                                    {l(
                                        `Hafıza durumu bulunamayan ${outcome.skipped} kart simülasyona katılmadı.`,
                                        `${outcome.skipped} cards without a memory state were left out.`,
                                    )}
                                </SettingHint>
                            ) : null}
                        </View>
                    ) : null}
                    <SettingHint>
                        {l(
                            'Tahmin, ayar grubunun parametreleri ve geçmişinizdeki cevap alışkanlıklarıyla her gün çalıştığınızı varsayar. Aynı ayarlar her seferinde aynı sonucu verir; hiçbir kart ya da ayar değişmez.',
                            'The estimate assumes you study every day, with this preset\'s parameters and the answer habits in your history. The same inputs always give the same result; no card or setting changes.',
                        )}
                    </SettingHint>
                </SheetScrollView>
            </AppSheet>
        </SettingBlock>
    );
}

const styles = StyleSheet.create({
    scroll: { flexShrink: 1 },
    content: { gap: Spacing.md, paddingBottom: Spacing.md },
    results: { gap: Spacing.sm },
});
