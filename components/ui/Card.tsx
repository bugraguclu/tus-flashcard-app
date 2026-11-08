import React from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { Radius, Type } from './tokens';

/** A hairline between two rows of a card or list. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
    const colors = useThemeColors();
    return <View style={[styles.divider, { backgroundColor: colors.borderLight }, style]} />;
}

interface CardProps {
    children: React.ReactNode;
    /** Pads the content (16) for a card of text, charts or fields; rows bring their own padding. */
    padded?: boolean;
    /** Draws a hairline between consecutive children, for a card that holds rows. */
    divided?: boolean;
    /** A heading drawn inside the card (a `CardHeader`), above its rows or content. */
    title?: string;
    /** Under the title: what the card is for. */
    description?: string;
    /** Beside the title, e.g. a `HelpButton` or a badge. */
    accessory?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** The white surface every group of rows, chart or form section sits on. */
export function Card({ children, padded = false, divided = false, title, description, accessory, style }: CardProps) {
    const colors = useThemeColors();
    const header = title ? (
        <CardHeader
            key="card-header"
            title={title}
            description={description}
            accessory={accessory}
            style={padded ? undefined : styles.headerInRows}
        />
    ) : null;
    const items = divided ? [header, ...React.Children.toArray(children)].filter(Boolean) : null;
    return (
        // The shadow sits on the outer view: iOS clips a shadow drawn by a view that clips its content.
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }, style]}>
            <View style={[styles.clip, padded && styles.padded]}>
                {items
                    ? items.map((child, index) => (
                        <React.Fragment key={(child as React.ReactElement).key ?? index}>
                            {index > 0 ? <Divider /> : null}
                            {child}
                        </React.Fragment>
                    ))
                    : <>{header}{children}</>}
            </View>
        </View>
    );
}

interface CardHeaderProps {
    title: string;
    /** Under the title: what the card is for. */
    description?: string;
    /** Beside the title, e.g. a `HelpButton` or a badge. */
    accessory?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/** A card's own heading, drawn inside it. */
export function CardHeader({ title, description, accessory, style }: CardHeaderProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.header, style]}>
            <View style={styles.headerRow}>
                <Text style={[Type.sectionTitle, styles.headerTitle, { color: colors.textPrimary }]} accessibilityRole="header">
                    {title}
                </Text>
                {accessory}
            </View>
            {description ? <Text style={[Type.caption, { color: colors.textMuted }]}>{description}</Text> : null}
        </View>
    );
}

/** The small all-caps name of a group, set above its card. */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
    const colors = useThemeColors();
    return (
        <View style={[styles.labelWrap, style]}>
            <Text style={[Type.label, { color: colors.textMuted }]} accessibilityRole="header">{children}</Text>
        </View>
    );
}

/** A footnote under a card. */
export function SectionFootnote({ children }: { children: React.ReactNode }) {
    const colors = useThemeColors();
    return <Text style={[Type.caption, styles.footnote, { color: colors.textMuted }]}>{children}</Text>;
}

interface SectionProps {
    label?: string;
    footnote?: React.ReactNode;
    children: React.ReactNode;
    /** Passed to the card; rows are divided unless a card of free content asks for padding. */
    padded?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** A labelled group: the label, a card of rows and an optional footnote. */
export function Section({ label, footnote, children, padded = false, style }: SectionProps) {
    return (
        <View style={[styles.section, style]}>
            {label ? <SectionLabel>{label}</SectionLabel> : null}
            <Card padded={padded} divided={!padded}>{children}</Card>
            {footnote ? <SectionFootnote>{footnote}</SectionFootnote> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
    card: {
        borderRadius: Radius.card,
        borderWidth: 1,
        ...Shadows.sm,
    },
    clip: { borderRadius: Radius.card - 1, overflow: 'hidden' },
    padded: { padding: Spacing.lg, gap: Spacing.md },
    headerInRows: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm + 2 },
    header: { gap: Spacing.xs },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 24 },
    headerTitle: { flex: 1 },
    labelWrap: { paddingHorizontal: Spacing.xs },
    footnote: { paddingHorizontal: Spacing.xs },
    section: { gap: Spacing.xs + 2 },
});
