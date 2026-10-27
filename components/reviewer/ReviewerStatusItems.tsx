import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatStopwatch } from '../../lib/reviewerTimers';

type Props = {
    compact: boolean;
    /** Auto Advance's "show reminder" action fired for this side. */
    reminder: boolean;
    /** Seconds on the answer timer, or null when the deck's "Show answer timer" is off. */
    timerSeconds: number | null;
    /** Estimated minutes left in today's queue, or null when hidden or unknown. */
    remainingMinutes: number | null;
};

/**
 * The reviewer's status readouts: the Auto Advance reminder, the on-screen answer timer and the
 * remaining-time estimate. Both the classic and the redesigned toolbar show them, so the deck
 * options "Show on-screen timer" and the reminder action work whichever reviewer is in use.
 */
export default function ReviewerStatusItems({ compact, reminder, timerSeconds, remainingMinutes }: Props) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
    if (!reminder && timerSeconds === null && remainingMinutes === null) return null;
    return (
        <View style={styles.items}>
            {reminder ? (
                <Text style={styles.reminder} accessibilityLiveRegion="polite">
                    {l('Süre doldu', 'Time is up')}
                </Text>
            ) : null}
            {timerSeconds !== null ? (
                <Text
                    style={styles.timer}
                    accessibilityLabel={l(
                        `Bu kartta geçen süre: ${timerSeconds} saniye`,
                        `Time on this card: ${timerSeconds} seconds`,
                    )}
                >{formatStopwatch(timerSeconds)}</Text>
            ) : null}
            {remainingMinutes !== null ? (
                <Text
                    style={styles.remaining}
                    accessibilityLabel={l(
                        `Kalan tahmini süre: ${remainingMinutes} dakika`,
                        `Estimated time remaining: ${remainingMinutes} minutes`,
                    )}
                >{l(`~${remainingMinutes} dk`, `~${remainingMinutes} min`)}</Text>
            ) : null}
        </View>
    );
}

function createStyles(colors: ColorScheme, compact: boolean) {
    return StyleSheet.create({
        items: { flexShrink: 0, flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-end' : 'center', gap: compact ? 2 : 7 },
        timer: {
            flexShrink: 0,
            fontSize: FontSize.sm,
            fontWeight: '700',
            color: colors.textSecondary,
            fontVariant: ['tabular-nums'],
        },
        reminder: {
            flexShrink: 0,
            fontSize: FontSize.xs,
            fontWeight: '700',
            color: colors.btnHard,
            backgroundColor: colors.btnHardBg,
            borderRadius: BorderRadius.full,
            paddingHorizontal: 8,
            paddingVertical: 2,
            overflow: 'hidden',
        },
        remaining: { flexShrink: 0, fontSize: FontSize.sm, color: colors.textMuted, fontVariant: ['tabular-nums'] },
    });
}
