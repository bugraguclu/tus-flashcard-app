import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { localDateToYmd, ymdToLocalDate } from '../../lib/studyPlans';

/**
 * Building blocks of the study tools' screens (analysis, planning, clearing): a titled card with
 * an optional footnote, a label–value row, a date field and a segmented control.
 */

export function ToolSection({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    return (
        <View style={styles.section}>
            {title ? <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">{title}</Text> : null}
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderLight }]}>{children}</View>
            {footer ? <Text style={[styles.footer, { color: colors.textMuted }]}>{footer}</Text> : null}
        </View>
    );
}

export function ToolRow({ label, value, children, last = false }: { label: string; value?: string; children?: React.ReactNode; last?: boolean }) {
    const colors = useThemeColors();
    return (
        <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
            {value !== undefined ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
            {children}
        </View>
    );
}

export function DateField({ label, ymd, onChange, minimumYmd, last }: {
    label: string;
    ymd: string;
    onChange: (ymd: string) => void;
    minimumYmd?: string;
    last?: boolean;
}) {
    const { localeTag } = useI18n();
    return (
        <ToolRow label={label} last={last}>
            <DateTimePicker
                value={ymdToLocalDate(ymd)}
                mode="date"
                display="compact"
                locale={localeTag}
                minimumDate={minimumYmd ? ymdToLocalDate(minimumYmd) : undefined}
                onChange={(_event, value) => { if (value) onChange(localDateToYmd(value)); }}
            />
        </ToolRow>
    );
}

export function Segmented<T extends string>({ options, value, onChange }: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
}) {
    const colors = useThemeColors();
    return (
        <View style={[styles.segmentTrack, { backgroundColor: colors.bgInput }]} accessibilityRole="tablist">
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <TouchableOpacity
                        key={option.value}
                        style={[styles.segment, selected && { backgroundColor: colors.accent }]}
                        onPress={() => onChange(option.value)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                    >
                        <Text style={[styles.segmentText, { color: selected ? colors.white : colors.textSecondary }]}>{option.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export function ToolButton({ label, onPress, tone = 'primary', disabled = false }: {
    label: string;
    onPress: () => void;
    tone?: 'primary' | 'danger' | 'plain';
    disabled?: boolean;
}) {
    const colors = useThemeColors();
    const background = tone === 'primary' ? colors.accent : tone === 'danger' ? colors.btnAgain : 'transparent';
    const text = tone === 'plain' ? colors.accent : colors.white;
    return (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: background }, tone === 'plain' && { borderWidth: 1, borderColor: colors.accent }, disabled && styles.disabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
        >
            <Text style={[styles.buttonText, { color: text }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    section: { gap: Spacing.xs },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: Spacing.xs },
    card: { borderRadius: BorderRadius.md, borderWidth: 1, overflow: 'hidden' },
    footer: { fontSize: FontSize.xs, lineHeight: 16, paddingHorizontal: Spacing.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.md,
        minHeight: 48,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    rowLabel: { flex: 1, fontSize: FontSize.md },
    rowValue: { fontSize: FontSize.md, fontWeight: '700', fontVariant: ['tabular-nums'] },
    segmentTrack: { flexDirection: 'row', borderRadius: 999, padding: 3 },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
    segmentText: { fontSize: FontSize.sm, fontWeight: '700' },
    button: { alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg },
    buttonText: { fontSize: FontSize.md, fontWeight: '800' },
    disabled: { opacity: 0.45 },
});
