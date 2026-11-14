import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { useI18n } from '../../hooks/useI18n';
import { getDecksUsingConfig } from '../../lib/deckManager';
import { parseFsrsParameterText } from '../../lib/fsrs';
import { evaluateFsrsPreset, fsrsEvaluationFigures } from '../../lib/fsrsEvaluate';
import type { AppSettings } from '../../lib/types';
import type { DeckOptionsStyles } from './deckOptionsStyles';

/**
 * Anki's "Evaluate" button beside Optimize: the log loss and RMSE(bins) of the parameters in the
 * field, measured on the history Optimize trains on (lib/fsrsEvaluate.ts). It runs in slices that
 * give the screen back between them, shows how far it is, and a second tap stops it, as Optimize
 * does. It reads the collection only; the preset, its parameters and every card stay as they are.
 */
export default function FsrsEvaluateButton({ presetId, settings, paramsText, ignoreRevlogsBeforeMs, otherBusy, onBusyChange, styles }: {
    presetId: number;
    settings: AppSettings;
    /** The parameter field as typed; an empty field means the default parameters. */
    paramsText: string;
    ignoreRevlogsBeforeMs: number;
    /** Optimize is running: Evaluate waits, as Anki's button does. */
    otherBusy: boolean;
    onBusyChange?: (busy: boolean) => void;
    styles: DeckOptionsStyles;
}) {
    const { l } = useI18n();
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    // A result belongs to the inputs it was measured on; editing them hides it.
    const [outcome, setOutcome] = useState<{ key: string; text: string } | null>(null);
    const stopRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => () => {
        mounted.current = false;
        stopRef.current = true;
    }, []);

    const inputKey = `${presetId}|${paramsText.trim()}|${ignoreRevlogsBeforeMs}`;
    const shown = outcome && outcome.key === inputKey ? outcome.text : null;

    const noHistoryText = l(
        'Bu ayar grubunun kartlarında değerlendirmeye yetecek tekrar geçmişi yok.',
        'Insufficient review history: the cards of this preset have no reviews to evaluate on yet.',
    );
    const failedText = l(
        'Değerlendirme yapılamadı: bu parametreler geçmişiniz için geçerli bir tahmin üretmedi.',
        'Could not evaluate: these parameters do not give a valid prediction for your history.',
    );

    const finish = (text: string) => {
        if (!mounted.current) return;
        setOutcome({ key: inputKey, text });
        AccessibilityInfo.announceForAccessibility?.(text);
    };

    const evaluate = async () => {
        Keyboard.dismiss();
        if (running) {
            stopRef.current = true;
            return;
        }
        const parameters = parseFsrsParameterText(paramsText);
        if (parameters === null) {
            const text = l(
                'Önce FSRS parametrelerini düzeltin: 17, 19 veya 21 sayı olmalıdır.',
                'Fix the FSRS parameters first: they must be a list of 17, 19 or 21 numbers.',
            );
            finish(text);
            return;
        }
        stopRef.current = false;
        setProgress(0);
        setRunning(true);
        onBusyChange?.(true);
        try {
            const result = await evaluateFsrsPreset({
                deckIds: getDecksUsingConfig(presetId).map((deck) => deck.id),
                settings,
                parameters,
                ignoreRevlogsBeforeMs,
                onProgress: (done, total) => {
                    if (mounted.current) setProgress(done / total);
                    return !stopRef.current;
                },
            });
            if (!result) return;
            if (!result.evaluation) {
                finish(noHistoryText);
                return;
            }
            const turkish = fsrsEvaluationFigures(result.evaluation, ',');
            const english = fsrsEvaluationFigures(result.evaluation);
            const text = l(
                `Log loss: ${turkish.logLoss}, RMSE(bins): %${turkish.rmsePercent}. ${result.reviews} tekrar üzerinde; küçük değerler parametrelerin tekrar geçmişinize daha iyi uyduğunu gösterir.`,
                `Log loss: ${english.logLoss}, RMSE(bins): ${english.rmsePercent}%. Over ${result.reviews} reviews; smaller numbers indicate a better fit to your review history.`,
            );
            finish(text);
        } catch (error) {
            console.warn('[DeckOptions] FSRS evaluation failed:', error);
            finish(failedText);
        } finally {
            if (mounted.current) setRunning(false);
            onBusyChange?.(false);
        }
    };

    const percent = Math.round(progress * 100);
    const disabled = otherBusy && !running;

    return (
        <View>
            <TouchableOpacity
                style={[styles.optimizeButton, (running || disabled) && styles.optimizeButtonBusy]}
                onPress={evaluate}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={running
                    ? l(`Değerlendiriliyor, yüzde ${percent}`, `Evaluating, ${percent} percent`)
                    : l('Parametreleri değerlendir', 'Evaluate parameters')}
                accessibilityHint={running
                    ? l('Durdurmak için dokunun', 'Tap to stop')
                    : l('Log loss ve RMSE(bins) değerlerini hesaplar; hiçbir şeyi değiştirmez', 'Computes log loss and RMSE(bins); changes nothing')}
                // `disabled` already reaches VoiceOver through the touchable itself.
                accessibilityState={{ busy: running }}
            >
                <Text style={styles.optimizeButtonText}>
                    {running
                        ? l(`Değerlendiriliyor… %${percent} (durdur)`, `Evaluating… ${percent}% (stop)`)
                        : l('Parametreleri değerlendir', 'Evaluate parameters')}
                </Text>
            </TouchableOpacity>
            {shown ? (
                <View style={[styles.warningBox, styles.warningBoxInfo]} accessibilityLiveRegion="polite">
                    <Text style={[styles.warningText, styles.warningTextInfo]} selectable>
                        {shown}
                    </Text>
                </View>
            ) : (
                <Text style={styles.fieldHint}>
                    {l(
                        'Alandaki parametrelerin bu ayar grubunun geçmişini ne kadar iyi açıkladığını Anki gibi ölçer (log loss ve RMSE). Hiçbir şeyi değiştirmez.',
                        'Measures, as Anki does, how well the parameters in the field explain this preset\'s history (log loss and RMSE). It changes nothing.',
                    )}
                </Text>
            )}
        </View>
    );
}
