import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

/** The answer that made a card a leech; `nonce` tells two such answers apart. */
export type ReviewerLeechNoticeState = { nonce: number; suspended: boolean };

type Props = {
    notice: ReviewerLeechNoticeState | null;
    /** Distance from the bottom edge, clear of the answer bar. */
    bottom: number;
};

/**
 * Anki's "Card was a leech." note after the answer that made the card a leech, saying too when the
 * leech action suspended it, so the card does not leave the session unexplained. It shows for a
 * moment over the reviewer and never takes a tap; the reviewer clears it.
 */
export default function ReviewerLeechNotice({ notice, bottom }: Props) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const message = notice?.suspended
        ? l('Kart “Sürekli Unutulan Kart” olarak işaretlendi ve askıya alındı.', 'Card was a leech. It has been suspended.')
        : l('Kart “Sürekli Unutulan Kart” olarak işaretlendi.', 'Card was a leech.');
    const nonce = notice?.nonce ?? null;

    // VoiceOver does not read a live region; the notice is announced instead.
    useEffect(() => {
        if (nonce !== null) AccessibilityInfo.announceForAccessibility(message);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nonce]);

    if (!notice) return null;
    return (
        <View key={notice.nonce} style={[styles.overlay, { bottom }, { pointerEvents: 'none' }]} accessibilityLiveRegion="polite">
            <View style={styles.notice}>
                <Text style={styles.text}>{message}</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { position: 'absolute', zIndex: 300, left: Spacing.lg, right: Spacing.lg, alignItems: 'center' },
        notice: {
            maxWidth: 420,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.btnHard,
            backgroundColor: colors.btnHardBg,
            ...Shadows.md,
        },
        text: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
    });
}
