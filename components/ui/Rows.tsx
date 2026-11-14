import React from 'react';
import { type StyleProp, StyleSheet, Switch, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { SelectedMark } from './Choice';
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from './icons';
import { DISABLED_OPACITY, Type } from './tokens';

/**
 * Rows for a `Card` (or `Section`): each spans the card, pads itself 16 points from its edges and
 * leaves the hairline between rows to the card, so a list reads the same on every screen.
 */

/** The app's switch: accent when on, the border tone when off. */
export function AppSwitch({ value, onValueChange, disabled, accessibilityLabel }: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    accessibilityLabel?: string;
}) {
    const colors = useThemeColors();
    return (
        <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={{ false: colors.border, true: colors.accent }}
            ios_backgroundColor={colors.border}
            thumbColor={colors.white}
            accessibilityLabel={accessibilityLabel}
        />
    );
}

/** What VoiceOver reads for a row: its title, value and a plain-text summary, in reading order. */
function spokenLabel(title: string, value?: string, summary?: React.ReactNode): string {
    return [title, value, typeof summary === 'string' ? summary : undefined].filter(Boolean).join(', ');
}

function RowText({ title, summary, destructive, titleLines = 2 }: {
    title: string;
    summary?: React.ReactNode;
    destructive?: boolean;
    titleLines?: number;
}) {
    const colors = useThemeColors();
    return (
        <View style={styles.copy}>
            <Text style={[Type.rowTitle, { color: destructive ? colors.danger : colors.textPrimary }]} numberOfLines={titleLines}>
                {title}
            </Text>
            {summary ? <Text style={[Type.caption, { color: colors.textMuted }]}>{summary}</Text> : null}
        </View>
    );
}

interface ListRowProps {
    title: string;
    summary?: React.ReactNode;
    /** A 22-point line icon, drawn in its own column. */
    icon?: React.ReactNode;
    /** The current value, shown before the chevron. */
    value?: string;
    onPress?: () => void;
    /** The trailing ›; on by default for a row that opens something. */
    chevron?: boolean;
    /** Anything else at the row's end: a badge, a spinner. */
    accessory?: React.ReactNode;
    /**
     * Makes the row an option of a single-choice list: a tick marks the chosen one, the row
     * speaks as a radio button and has no chevron.
     */
    selected?: boolean;
    /** Makes the row a disclosure: a down or up chevron, and its expanded state spoken. */
    expanded?: boolean;
    destructive?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    /** `link` for a row that leaves the app (a web page); `button` otherwise. */
    accessibilityRole?: 'button' | 'link';
    style?: StyleProp<ViewStyle>;
}

/** A row that opens a screen, a picker or runs an action; or an option of a list. */
export function ListRow({
    title,
    summary,
    icon,
    value,
    onPress,
    chevron,
    accessory,
    selected,
    expanded,
    destructive = false,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
    style,
}: ListRowProps) {
    const colors = useThemeColors();
    const choice = selected !== undefined;
    const disclosure = expanded !== undefined;
    const showChevron = !choice && !disclosure && (chevron ?? Boolean(onPress));
    const content = (
        <>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <RowText title={title} summary={summary} destructive={destructive} />
            {value ? <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
            {accessory}
            {choice ? <SelectedMark visible={selected} /> : null}
            {disclosure
                ? (expanded ? <ChevronUpIcon color={colors.textMuted} size={16} /> : <ChevronDownIcon color={colors.textMuted} size={16} />)
                : null}
            {showChevron ? <ChevronRightIcon color={colors.textMuted} size={16} /> : null}
        </>
    );
    if (!onPress) return <View style={[styles.row, style]}>{content}</View>;
    return (
        <TouchableOpacity
            style={[styles.row, disabled && styles.disabled, style]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole={choice ? 'radio' : accessibilityRole ?? 'button'}
            accessibilityLabel={accessibilityLabel ?? spokenLabel(title, value, summary)}
            accessibilityHint={accessibilityHint}
            accessibilityState={{
                disabled,
                ...(choice ? { checked: selected } : {}),
                ...(disclosure ? { expanded } : {}),
            }}
            aria-disabled={disabled}
            aria-checked={choice ? selected : undefined}
            aria-expanded={expanded}
        >
            {content}
        </TouchableOpacity>
    );
}

interface SwitchRowProps {
    title: string;
    summary?: React.ReactNode;
    value: boolean;
    onValueChange: (value: boolean) => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** A setting that is on or off; the whole row toggles it. */
export function SwitchRow({ title, summary, value, onValueChange, disabled = false, style }: SwitchRowProps) {
    return (
        <TouchableOpacity
            style={[styles.row, disabled && styles.disabled, style]}
            onPress={() => onValueChange(!value)}
            disabled={disabled}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityLabel={spokenLabel(title, undefined, summary)}
            accessibilityState={{ checked: value, disabled }}
            aria-checked={value}
            aria-disabled={disabled}
        >
            <RowText title={title} summary={summary} />
            {/* The row takes the tap: a switch that also took it would toggle twice on web. */}
            <View style={styles.passive} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <AppSwitch value={value} onValueChange={onValueChange} disabled={disabled} />
            </View>
        </TouchableOpacity>
    );
}

interface ValueRowProps {
    label: string;
    /** A read-only value, drawn in tabular figures. */
    value?: string;
    summary?: React.ReactNode;
    /** A control in place of the value: a field, a date picker, a stepper. */
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** A label with its value or its control at the end. */
export function ValueRow({ label, value, summary, children, style }: ValueRowProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.row, style]}>
            <View style={styles.copy}>
                <Text style={[Type.body, { color: colors.textPrimary }]}>{label}</Text>
                {summary ? <Text style={[Type.caption, { color: colors.textMuted }]}>{summary}</Text> : null}
            </View>
            {value !== undefined ? (
                <Text style={[Type.bodyStrong, styles.tabular, { color: colors.textSecondary }]}>{value}</Text>
            ) : null}
            {children}
        </View>
    );
}

interface SelectRowProps {
    label: string;
    /** The chosen option's name. */
    value: string;
    onPress: () => void;
    summary?: React.ReactNode;
    disabled?: boolean;
    /** Spoken instead of "label, value", e.g. when the value is an abbreviation. */
    accessibilityLabel?: string;
    accessibilityHint?: string;
    /** For a row whose options open in place under it: whether they are showing. */
    expanded?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** A label and the chosen option; tapping it opens the list of options. */
export function SelectRow({ label, value, onPress, summary, disabled = false, accessibilityLabel, accessibilityHint, expanded, style }: SelectRowProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.row, disabled && styles.disabled, style]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label}, ${value}`}
            accessibilityHint={accessibilityHint}
            accessibilityState={expanded === undefined ? { disabled } : { disabled, expanded }}
            aria-disabled={disabled}
            aria-expanded={expanded}
        >
            <View style={styles.copy}>
                <Text style={[Type.body, { color: colors.textPrimary }]}>{label}</Text>
                {summary ? <Text style={[Type.caption, { color: colors.textMuted }]}>{summary}</Text> : null}
            </View>
            <Text style={[styles.selectValue, { color: colors.accent }]} numberOfLines={2}>{value}</Text>
            <ChevronDownIcon color={colors.textMuted} size={16} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 2,
    },
    disabled: { opacity: DISABLED_OPACITY },
    passive: { pointerEvents: 'none' },
    icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    value: { maxWidth: '45%', fontSize: FontSize.md, textAlign: 'right' },
    tabular: { fontVariant: ['tabular-nums'], textAlign: 'right' },
    selectValue: { maxWidth: '55%', fontSize: FontSize.md, fontWeight: '500', textAlign: 'right' },
});
