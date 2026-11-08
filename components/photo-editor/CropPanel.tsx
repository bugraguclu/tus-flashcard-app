import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { PHOTO_CROP_ASPECTS, type PhotoCropAspectId } from '../../lib/photoCrop';
import type { PhotoTurnDirection } from '../../lib/photoGeometry';
import { ToolSegment, ToolTrack } from '../drawing/DrawingToolbar';
import { Chip } from '../ui/Choice';
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
            <ToolTrack>
                {actions.map(({ key, label, Glyph, onPress, enabled }) => (
                    <ToolSegment
                        key={key}
                        role="button"
                        label={label}
                        glyph={Glyph}
                        onPress={onPress}
                        disabled={!enabled}
                        accessibilityLabel={key === 'reset' ? l('Kırpmayı ve döndürmeyi sıfırla', 'Reset crop and rotation') : label}
                    />
                ))}
            </ToolTrack>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.aspects}
                accessibilityLabel={l('Kırpma oranı', 'Crop ratio')}
            >
                {PHOTO_CROP_ASPECTS.map((id) => (
                    <Chip
                        key={id}
                        label={aspectLabel(id)}
                        selected={id === aspect}
                        onPress={() => onAspectChange(id)}
                        disabled={disabled}
                        accessibilityLabel={id.includes(':') ? l(`Oran ${id}`, `Ratio ${id}`) : aspectLabel(id)}
                    />
                ))}
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
        aspects: { alignItems: 'center', gap: Spacing.xs, minHeight: 44 },
    });
}
