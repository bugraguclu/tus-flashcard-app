import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { MotionDuration, NATIVE_DRIVER } from '../../constants/motion';
import { useI18n } from '../../hooks/useI18n';
import { easedWindow } from '../../lib/motion';

/**
 * How long the first statistics may take before the spinner shows. Most collections are read
 * sooner than this and their cards fade straight in; a spinner flashed on every visit would only
 * be noise.
 */
export const LOADING_DELAY_MS = 300;

/**
 * What stands where the statistics cards will be until the first snapshot arrives: a spinner and
 * "Loading…", or the failure message.
 *
 * The wait and the fade are one animation on the native driver. The review log is read
 * synchronously, so JavaScript is busy for exactly as long as the spinner is needed, and a timer
 * set there would fire only once the wait is over.
 */
export default function StatsLoadState({ failed }: { failed: boolean }) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const clock = useRef(new Animated.Value(0)).current;
    const total = LOADING_DELAY_MS + MotionDuration.fade;
    const opacity = useMemo(
        () => clock.interpolate({ ...easedWindow(LOADING_DELAY_MS / total, 1), extrapolate: 'clamp' }),
        [clock, total],
    );

    useEffect(() => {
        if (failed) return undefined;
        const animation = Animated.timing(clock, {
            toValue: 1,
            duration: total,
            easing: Easing.linear,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        animation.start();
        return () => animation.stop();
    }, [clock, failed, total]);

    if (failed) {
        return (
            <View style={styles.state} accessible>
                <Text style={styles.text}>{l('İstatistikler yüklenemedi.', 'Statistics could not be loaded.')}</Text>
            </View>
        );
    }
    return (
        <Animated.View style={[styles.state, { opacity }]} accessible>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.text}>{t('common.loading')}</Text>
        </Animated.View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
        text: { color: colors.textSecondary, fontSize: FontSize.sm },
    });
}
