import { useMemo, type ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    BLANK_CANVAS_BACKGROUNDS,
    BLANK_CANVAS_PAPERS,
    BLANK_CANVAS_SHAPES,
    type BlankCanvasShape,
} from '../../lib/blankCanvas';
import type { BlankCanvasSetup } from '../../lib/blankCanvasSetup';
import PaperSwatch, { pageColorLabel, paperLabel } from '../PaperSwatch';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/Card';
import { AppSheet } from '../ui/Sheet';
import { Radius } from '../ui/tokens';

type Localize = (turkish: string, english: string) => string;

export function shapeLabel(shape: BlankCanvasShape, l: Localize): string {
    if (shape === 'square') return l('Kare', 'Square');
    if (shape === 'portrait') return l('Dikey', 'Portrait');
    return l('Yatay', 'Landscape');
}

interface PageOptionsSheetProps {
    visible: boolean;
    setup: BlankCanvasSetup;
    onChange: (setup: BlankCanvasSetup) => void;
    onClose: () => void;
}

/**
 * Paper, page colour and shape, changed in place while the drawing stays on the page. Each choice
 * is a tile with a preview of the page it gives, which a chip cannot draw.
 */
export function PageOptionsSheet({ visible, setup, onChange, onClose }: PageOptionsSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const tile = (key: string, label: string, selected: boolean, onPress: () => void, preview: ReactNode) => (
        <TouchableOpacity
            key={key}
            style={[styles.tile, selected && styles.tileActive]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
        >
            {preview}
            <Text style={[styles.tileText, selected && styles.tileTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={l('Sayfa', 'Page')}
            backdropLabel={l('Sayfa seçeneklerini kapat', 'Close page options')}
        >
            <View style={styles.groups}>
                <View style={styles.group}>
                    <SectionLabel>{l('Kağıt', 'Paper')}</SectionLabel>
                    <View style={styles.tileRow}>
                        {BLANK_CANVAS_PAPERS.map((paper) => tile(
                            paper,
                            paperLabel(paper, l),
                            setup.paper === paper,
                            () => onChange({ ...setup, paper }),
                            <PaperSwatch paper={paper} background={setup.background} width={40} height={30} style={styles.swatch} />,
                        ))}
                    </View>
                </View>

                <View style={styles.group}>
                    <SectionLabel>{l('Zemin', 'Page colour')}</SectionLabel>
                    <View style={styles.tileRow}>
                        {BLANK_CANVAS_BACKGROUNDS.map((option) => tile(
                            option.id,
                            pageColorLabel(option.id, l),
                            setup.background === option.color,
                            () => onChange({ ...setup, background: option.color }),
                            <View style={[styles.swatch, styles.colorSwatch, { backgroundColor: option.color }]} />,
                        ))}
                    </View>
                </View>

                <View style={styles.group}>
                    <SectionLabel>{l('Biçim', 'Shape')}</SectionLabel>
                    <View style={styles.tileRow}>
                        {BLANK_CANVAS_SHAPES.map((option) => {
                            const selected = setup.shape === option.id;
                            // The outline is the page's shape fitted into a 36 x 28 box.
                            const fit = Math.min(36 / option.width, 28 / option.height);
                            return tile(
                                option.id,
                                shapeLabel(option.id, l),
                                selected,
                                () => onChange({ ...setup, shape: option.id }),
                                <View style={styles.shapeBox}>
                                    <View
                                        style={[
                                            styles.shapeGlyph,
                                            { width: option.width * fit, height: option.height * fit },
                                            selected && { borderColor: colors.accent },
                                        ]}
                                    />
                                </View>,
                            );
                        })}
                    </View>
                </View>
            </View>

            <Button
                label={l('Tamam', 'Done')}
                onPress={onClose}
                accessibilityLabel={l('Sayfa seçeneklerini kapat', 'Close page options')}
                style={styles.done}
            />
        </AppSheet>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        groups: { gap: Spacing.lg },
        group: { gap: Spacing.sm },
        tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        tile: {
            minWidth: 72,
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            borderRadius: Radius.inset,
            borderWidth: 2,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        tileActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        // The previews are small pictures of a page, so their corners are the page's, not a control's.
        swatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        colorSwatch: { width: 40, height: 30 },
        tileText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '500' },
        tileTextActive: { color: colors.textPrimary },
        shapeBox: { width: 40, height: 30, alignItems: 'center', justifyContent: 'center' },
        shapeGlyph: { borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted },
        done: { marginTop: Spacing.xl },
    });
}
