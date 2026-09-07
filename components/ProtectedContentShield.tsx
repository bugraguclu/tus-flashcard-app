import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LockGlyph from './LockGlyph';
import { useI18n } from '../hooks/useI18n';
import { useThemeColors, type ColorScheme } from '../constants/theme';
import type { ScreenGuardSnapshot } from '../lib/screenGuardPolicy';

/**
 * In-app half of the catalog capture protection.
 *
 * The native guard covers the window, but it cannot cover every route on iOS: a screen recording
 * still runs, and a screenshot still fires. This overlay closes that gap from the JavaScript
 * side. It covers the card while a capture is running, and again for a few seconds after a
 * screenshot — the shot that just happened cannot be taken back, but the next one now costs a
 * wait and a deliberate tap, which is what stops a deck being walked through a frame at a time.
 *
 * Place it as the last child of a screen's root container so it covers the card beneath it.
 */
export default function ProtectedContentShield({ state }: { state: ScreenGuardSnapshot }) {
    const colors = useThemeColors();
    const styles = createStyles(colors);
    const { l } = useI18n();

    if (!state.blank) return null;

    // A running capture is the more actionable of the two: the learner has something to turn
    // off. A screenshot is already over, so that wording says what happens next instead.
    const capturing = state.captured;

    return (
        <View style={styles.blanket} accessibilityRole="alert">
            <LockGlyph color={colors.textSecondary} size={34} />
            <Text style={styles.blanketTitle}>
                {l('İçerik gizlendi', 'Content hidden')}
            </Text>
            <Text style={styles.blanketBody}>
                {capturing
                    ? l(
                        'Ekran kaydı veya yansıtma açıkken dahili TUS kartları gösterilmez. Kaydı durdurduğunuzda kart geri gelir.',
                        'Built-in TUS cards are not shown while screen recording or mirroring is active. Stop the capture and the card returns.',
                    )
                    : l(
                        'Dahili TUS kartlarının ekran görüntüsü alınamaz. Kart birkaç saniye içinde geri gelecek.',
                        'Built-in TUS cards cannot be screenshotted. The card comes back in a few seconds.',
                    )}
            </Text>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        blanket: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            paddingHorizontal: 36,
            backgroundColor: colors.bgPrimary,
            zIndex: 100,
        },
        blanketTitle: {
            fontSize: 17,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        blanketBody: {
            fontSize: 14,
            lineHeight: 20,
            textAlign: 'center',
            color: colors.textSecondary,
        },
    });
}
