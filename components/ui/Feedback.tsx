import React from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { Radius, Type } from './tokens';

interface EmptyStateProps {
    title: string;
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
            <Text style={[Type.sectionTitle, styles.center, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
            {body ? <Text style={[Type.caption, styles.center, { color: colors.textMuted }]}>{body}</Text> : null}
            {action ? <View style={styles.emptyAction}>{action}</View> : null}
        </View>
    );
}

/** A small spinner, with what is loading when it takes a while. */
export function LoadingState({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
    const colors = useThemeColors();
    return (
        <View style={[styles.loading, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
            <ActivityIndicator color={colors.accent} />
            {label ? <Text style={[Type.caption, styles.center, { color: colors.textMuted }]}>{label}</Text> : null}
        </View>
    );
}

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

interface NoticeProps {
    tone?: NoticeTone;
    title?: string;
    children?: React.ReactNode;
    /** E.g. a compact `Button` that resolves what the notice is about. */
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** A boxed note under a field or at the top of a form: a warning, an error, a hint or a success. */
export function Notice({ tone = 'info', title, children, action, style }: NoticeProps) {
    const colors = useThemeColors();
    const palette = {
        info: { border: colors.border, background: colors.bgSecondary, title: colors.textPrimary },
        warning: { border: colors.warning, background: colors.warningBg, title: colors.warning },
        danger: { border: colors.danger, background: colors.dangerBg, title: colors.danger },
        success: { border: colors.success, background: colors.successBg, title: colors.success },
    }[tone];
    return (
        <View
            style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.background }, style]}
            accessibilityLiveRegion="polite"
        >
            {title ? <Text style={[styles.noticeTitle, { color: palette.title }]}>{title}</Text> : null}
            {children ? (
                typeof children === 'string'
                    ? <Text style={[Type.caption, { color: tone === 'info' ? colors.textSecondary : colors.textPrimary }]}>{children}</Text>
                    : children
            ) : null}
            {action ? <View style={styles.noticeAction}>{action}</View> : null}
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
    noticeTitle: { fontSize: FontSize.sm, fontWeight: '800' },
    noticeAction: { marginTop: Spacing.sm, alignItems: 'flex-start' },
    track: { height: 6, borderRadius: 3, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3 },
});
