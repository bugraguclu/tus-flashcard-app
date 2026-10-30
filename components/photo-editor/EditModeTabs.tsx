import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { PenGlyph } from '../drawing/drawingGlyphs';
import { ROW_LABEL_FIT } from './editorModel';
import { AdjustGlyph, CropGlyph } from './photoEditorGlyphs';

export type PhotoEditMode = 'crop' | 'adjust' | 'draw';

const MODES: { id: PhotoEditMode; Glyph: typeof CropGlyph }[] = [
    { id: 'crop', Glyph: CropGlyph },
    { id: 'adjust', Glyph: AdjustGlyph },
    { id: 'draw', Glyph: PenGlyph },
];

interface EditModeTabsProps {
    mode: PhotoEditMode;
    onChange: (mode: PhotoEditMode) => void;
    /** Extra space under the tabs for the home indicator. */
    bottomInset: number;
}

/** What the photo editor is doing to the photo: cropping and turning it, adjusting it, or drawing on it. */
export function EditModeTabs({ mode, onChange, bottomInset }: EditModeTabsProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const labels: Record<PhotoEditMode, string> = {
        crop: l('Kırp', 'Crop'),
        adjust: l('Ayarla', 'Adjust'),
        draw: l('Çiz', 'Draw'),
    };

    return (
        <View style={[styles.bar, { paddingBottom: Spacing.xs + bottomInset }]} accessibilityRole="tablist">
            {MODES.map(({ id, Glyph }) => {
                const selected = mode === id;
                return (
                    <TouchableOpacity
                        key={id}
                        style={styles.tab}
                        onPress={() => onChange(id)}
                        accessibilityRole="tab"
                        accessibilityLabel={labels[id]}
                        accessibilityState={{ selected }}
                    >
                        <View style={[styles.marker, selected && { backgroundColor: colors.accent }]} />
                        <Glyph color={selected ? colors.accent : colors.textMuted} size={22} />
                        <Text style={[styles.label, selected && styles.labelActive]} {...ROW_LABEL_FIT}>{labels[id]}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        bar: {
            flexDirection: 'row',
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingHorizontal: Spacing.md,
        },
        tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
        marker: { position: 'absolute', top: 0, width: 28, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
        label: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted },
        labelActive: { color: colors.accent },
    });
}
