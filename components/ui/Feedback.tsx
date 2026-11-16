import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { MotionDuration, NATIVE_DRIVER } from '../../constants/motion';
import { easedWindow } from '../../lib/motion';
import { Radius, Type } from './tokens';

interface EmptyStateProps {
    /** Leave it out when one sentence says it all; `body` is then drawn as the message. */
    title?: string;
    body?: string;
    /** A line icon above the title. */
    icon?: React.ReactNode;
    /** Usually a `Button` that fills the emptiness. */
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** What a list or screen shows when it has nothing in it yet. */
export function EmptyState({ title, body, icon, action, style }: EmptyStateProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.empty, style]}>
            {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
            {title ? <Text style={[Type.sectionTitle, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text> : null}
            {body ? <Text style={[title ? Type.caption : Type.body, styles.center, { color: title ? colors.textMuted : colors.textSecondary }]}>{body}</Text> : null}
            {action ? <View style={styles.emptyAction}>{action}</View> : null}
        </View>
    );
}

/**
 * How long a `delayed` loading state stays blank. Most waits it covers end sooner, and their
 * content then appears straight away: a spinner flashed on every visit would only be noise.
 */
export const LOADING_STATE_DELAY_MS = 300;

interface LoadingStateProps {
    label?: string;
    /**
     * Stay blank for `LOADING_STATE_DELAY_MS`, then fade in. For a wait most visits never notice,
     * such as Statistics reading the review log.
     */
    delayed?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** A small spinner, with what is loading when it takes a while. */
export function LoadingState({ label, delayed = false, style }: LoadingStateProps) {
    const colors = useThemeColors();
    const content = (
        <>
            <ActivityIndicator color={colors.accent} />
            {label ? <Text style={[Type.caption, styles.center, { color: colors.textMuted }]}>{label}</Text> : null}
        </>
    );
    const containerStyle = [styles.loading, style];
    if (delayed) return <DelayedLoading style={containerStyle} label={label}>{content}</DelayedLoading>;
    return (
        <View style={containerStyle} accessibilityRole="progressbar" accessibilityLabel={label}>
            {content}
        </View>
    );
}

/**
 * The wait and the fade are one animation on the native driver. What is being waited for usually
 * keeps JavaScript busy (a synchronous read) for exactly as long as the spinner is needed, so a
 * JavaScript timer would fire only once the wait is over.
 */
function DelayedLoading({ style, label, children }: { style: StyleProp<ViewStyle>; label?: string; children: React.ReactNode }) {
    const clock = useRef(new Animated.Value(0)).current;
    const total = LOADING_STATE_DELAY_MS + MotionDuration.fade;
    const opacity = useMemo(
        () => clock.interpolate({ ...easedWindow(LOADING_STATE_DELAY_MS / total, 1), extrapolate: 'clamp' }),
        [clock, total],
    );
    useEffect(() => {
        const animation = Animated.timing(clock, {
            toValue: 1,
            duration: total,
            easing: Easing.linear,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        animation.start();
        return () => animation.stop();
    }, [clock, total]);
    return (
        <Animated.View style={[style, { opacity }]} accessibilityRole="progressbar" accessibilityLabel={label}>
            {children}
        </Animated.View>
    );
}

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

interface NoticeProps {
    tone?: NoticeTone;
    title?: string;
    children?: React.ReactNode;
    /** A small line icon before the text, in the notice's colour. */
    icon?: React.ReactNode;
    /** E.g. a compact `Button` that resolves what the notice is about. */
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** A boxed note under a field or at the top of a form: a warning, an error, a hint or a success. */
export function Notice({ tone = 'info', title, children, icon, action, style }: NoticeProps) {
    const colors = useThemeColors();
    const palette = {
        info: { border: colors.border, background: colors.bgSecondary, title: colors.textPrimary },
        warning: { border: colors.warning, background: colors.warningBg, title: colors.warning },
        danger: { border: colors.danger, background: colors.dangerBg, title: colors.danger },
        success: { border: colors.success, background: colors.successBg, title: colors.success },
    }[tone];
    const body = (
        <>
            {title ? <Text style={[styles.noticeTitle, { color: palette.title }]}>{title}</Text> : null}
            {children ? (
                typeof children === 'string'
                    ? <Text style={[Type.caption, { color: tone === 'info' ? colors.textSecondary : colors.textPrimary }]}>{children}</Text>
                    : children
            ) : null}
            {action ? <View style={styles.noticeAction}>{action}</View> : null}
        </>
    );
    return (
        <View
            style={[styles.notice, icon ? styles.noticeWithIcon : null, { borderColor: palette.border, backgroundColor: palette.background }, style]}
            accessibilityLiveRegion="polite"
        >
            {icon ? (
                <>
                    <View style={styles.noticeIcon}>{icon}</View>
                    <View style={styles.noticeBody}>{body}</View>
                </>
            ) : body}
        </View>
    );
}

interface ProgressBarProps {
    /** From 0 to 1. */
    value: number;
    color?: string;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

/** A thin bar showing how far along something is. */
export function ProgressBar({ value, color, accessibilityLabel, style }: ProgressBarProps) {
    const colors = useThemeColors();
    const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    return (
        <View
            style={[styles.track, { backgroundColor: colors.borderLight }, style]}
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
        >
            <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: color ?? colors.accent }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { textAlign: 'center' },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        paddingVertical: Spacing.xxxl + Spacing.lg,
        paddingHorizontal: Spacing.xl,
    },
    emptyIcon: { marginBottom: Spacing.sm },
    emptyAction: { marginTop: Spacing.lg, alignSelf: 'stretch', alignItems: 'center' },
    loading: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
    notice: { gap: Spacing.xs, padding: Spacing.md, borderRadius: Radius.inset, borderWidth: 1 },
    noticeWithIcon: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    noticeIcon: { paddingTop: 1 },
    noticeBody: { flex: 1, minWidth: 0, gap: Spacing.xs },
    noticeTitle: { fontSize: FontSize.sm, fontWeight: '600' },
    noticeAction: { marginTop: Spacing.sm, alignItems: 'flex-start' },
    track: { height: 6, borderRadius: 3, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
});
