import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LockGlyph from './LockGlyph';
import { useI18n } from '../hooks/useI18n';
import { useThemeColors, type ColorScheme } from '../constants/theme';
import type { ScreenGuardSnapshot } from '../lib/screenGuardPolicy';

const SCREENSHOT_WARNING_MS = 4000;

/**
 * In-app half of the catalog capture protection.
 *
 * The native guard covers the window, but it cannot cover every route on iOS: a screen
 * recording still runs, and a screenshot still fires. This overlay closes that gap from the
 * JavaScript side — it blanks the card for as long as the display is being captured, and it
 * tells the learner when a screenshot was taken so the block does not look like a glitch.
 *
 * Place it as the last child of a screen's root container so it covers the card beneath it.
 */
export default function ProtectedContentShield({ state }: { state: ScreenGuardSnapshot }) {
    const colors = useThemeColors();
    const styles = createStyles(colors);
    const { l } = useI18n();
    const [warning, setWarning] = useState(false);
    const seenScreenshots = useRef(state.screenshots);

    useEffect(() => {
        if (state.screenshots <= seenScreenshots.current) return;
        seenScreenshots.current = state.screenshots;
        setWarning(true);
        const timer = setTimeout(() => setWarning(false), SCREENSHOT_WARNING_MS);
        return () => clearTimeout(timer);
    }, [state.screenshots]);

    if (!state.blank && !warning) return null;

    if (state.blank) {
        return (
            <View style={styles.blanket} accessibilityRole="alert">
                <LockGlyph color={colors.textSecondary} size={34} />
                <Text style={styles.blanketTitle}>
                    {l('İçerik gizlendi', 'Content hidden')}
                </Text>
                <Text style={styles.blanketBody}>
                    {l(
                        'Ekran kaydı veya yansıtma açıkken dahili TUS kartları gösterilmez. Kaydı durdurduğunuzda kart geri gelir.',
                        'Built-in TUS cards are not shown while screen recording or mirroring is active. Stop the capture and the card returns.',
                    )}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.banner} pointerEvents="none" accessibilityRole="alert">
            <LockGlyph color={colors.btnAgain} size={15} />
            <Text style={styles.bannerText}>
                {l(
                    'Dahili TUS kartlarının ekran görüntüsü alınamaz.',
                    'Built-in TUS cards cannot be screenshotted.',
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
        banner: {
            position: 'absolute',
            left: 16,
            right: 16,
            top: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.btnAgain,
            backgroundColor: colors.btnAgainBg,
            zIndex: 100,
        },
        bannerText: {
            flex: 1,
            fontSize: 13,
            fontWeight: '600',
            color: colors.btnAgain,
        },
    });
}
