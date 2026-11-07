import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet } from 'react-native';
import { Text } from './AppText';
import { BorderRadius, FontSize, Spacing, dropShadow, useThemeColors, type ColorScheme } from '../constants/theme';

export interface TransientNoticeMessage {
    /** A new id shows the notice again, even with the same text. */
    id: number;
    text: string;
}

const VISIBLE_MS = 2200;

/**
 * A short confirmation ("Note added") that appears under the header and goes away by itself, the
 * way Anki's Add window acknowledges a note: nothing has to be dismissed and the screen stays in
 * use the whole time. It never takes touches, and VoiceOver reads it once.
 */
export default function TransientNotice({ message }: { message: TransientNoticeMessage | null }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!message) return undefined;
        AccessibilityInfo.announceForAccessibility(message.text);
        // Not an interaction: a notice must not hold back work queued behind running animations
        // (InteractionManager), such as the deck list's refresh after the editor closes.
        const timing = (toValue: number, duration: number) => Animated.timing(opacity, {
            toValue,
            duration,
            useNativeDriver: Platform.OS !== 'web',
            isInteraction: false,
        });
        opacity.setValue(0);
        timing(1, 150).start();
        const timer = setTimeout(() => timing(0, 220).start(), VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [message, opacity]);

    if (!message) return null;
    return (
        <Animated.View
            style={[styles.wrap, { opacity, pointerEvents: 'none' }]}
            accessibilityLiveRegion="polite"
            accessibilityRole={Platform.OS === 'web' ? ('status' as never) : undefined}
        >
            <Text style={styles.check}>✓</Text>
            <Text style={styles.text} numberOfLines={2}>{message.text}</Text>
        </Animated.View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        wrap: {
            position: 'absolute',
            top: Spacing.sm,
            alignSelf: 'center',
            maxWidth: '90%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.textPrimary,
            ...dropShadow({ y: 4, blur: 14, opacity: 0.18, elevation: 6 }),
        },
        check: { fontSize: FontSize.md, fontWeight: '800', color: colors.accent },
        text: { flexShrink: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.bgCard },
    });
}
