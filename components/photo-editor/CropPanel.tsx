import { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { PHOTO_CROP_ASPECTS, type PhotoCropAspectId } from '../../lib/photoCrop';
import type { PhotoTurnDirection } from '../../lib/photoGeometry';
import { ROW_LABEL_FIT } from './editorModel';
import { MirrorGlyph, RevertGlyph, RotateLeftGlyph, RotateRightGlyph } from './photoEditorGlyphs';

interface CropPanelProps {
    aspect: PhotoCropAspectId;
    onAspectChange: (aspect: PhotoCropAspectId) => void;
    onTurn: (direction: PhotoTurnDirection) => void;
    onMirror: () => void;
    /** Back to the whole photo, upright and unmirrored. */
    onReset: () => void;
    canReset: boolean;
    disabled: boolean;
}

/** The crop screen's two rows: turn, mirror and reset, then the shapes the frame can be locked to. */
export function CropPanel({ aspect, onAspectChange, onTurn, onMirror, onReset, canReset, disabled }: CropPanelProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const aspectLabel = (id: PhotoCropAspectId) => {
        switch (id) {
            case 'free': return l('Serbest', 'Free');
            case 'original': return l('Orijinal', 'Original');
            case 'square': return l('Kare', 'Square');
            default: return id;
        }
    };

    const actions: { key: string; label: string; Glyph: typeof RevertGlyph; onPress: () => void; enabled: boolean }[] = [
        { key: 'left', label: l('Sola döndür', 'Rotate Left'), Glyph: RotateLeftGlyph, onPress: () => onTurn('ccw'), enabled: !disabled },
        { key: 'right', label: l('Sağa döndür', 'Rotate Right'), Glyph: RotateRightGlyph, onPress: () => onTurn('cw'), enabled: !disabled },
        { key: 'mirror', label: l('Yansıt', 'Mirror'), Glyph: MirrorGlyph, onPress: onMirror, enabled: !disabled },
        { key: 'reset', label: l('Sıfırla', 'Reset'), Glyph: RevertGlyph, onPress: onReset, enabled: !disabled && canReset },
    ];

    return (
        <View style={styles.bar}>
            <View style={styles.segment}>
                {actions.map(({ key, label, Glyph, onPress, enabled }) => (
                    <TouchableOpacity
                        key={key}
                        style={[styles.action, !enabled && styles.disabled]}
                        onPress={onPress}
                        disabled={!enabled}
                        accessibilityRole="button"
                        accessibilityLabel={key === 'reset' ? l('Kırpmayı ve döndürmeyi sıfırla', 'Reset crop and rotation') : label}
                        accessibilityState={{ disabled: !enabled }}
                    >
                        <Glyph color={colors.textSecondary} size={20} />
                        <Text style={styles.actionLabel} {...ROW_LABEL_FIT}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aspects}
                accessibilityRole="radiogroup"
                accessibilityLabel={l('Kırpma oranı', 'Crop ratio')}
            >
                {PHOTO_CROP_ASPECTS.map((id) => {
                    const selected = id === aspect;
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.chip, selected && styles.chipActive]}
                            onPress={() => onAspectChange(id)}
                            disabled={disabled}
                            accessibilityRole="radio"
                            accessibilityLabel={id.includes(':') ? l(`Oran ${id}`, `Ratio ${id}`) : aspectLabel(id)}
                            accessibilityState={{ selected, disabled }}
                            aria-checked={selected}
                        >
                            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{aspectLabel(id)}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        bar: {
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            gap: Spacing.sm,
        },
        segment: {
            flexDirection: 'row',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.md,
            padding: 3,
            gap: 2,
        },
        action: {
            flex: 1,
            minHeight: 46,
            paddingHorizontal: 2,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        },
        actionLabel: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        disabled: { opacity: 0.35 },
        aspects: { alignItems: 'center', gap: Spacing.xs, minHeight: 44 },
        chip: {
            minHeight: 34,
            minWidth: 52,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        chipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        chipText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        chipTextActive: { color: colors.accent },
    });
}
