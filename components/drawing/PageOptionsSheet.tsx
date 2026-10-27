import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    BLANK_CANVAS_BACKGROUNDS,
    BLANK_CANVAS_PAPERS,
    BLANK_CANVAS_SHAPES,
    type BlankCanvasShape,
} from '../../lib/blankCanvas';
import type { BlankCanvasSetup } from '../../lib/blankCanvasSetup';
import PaperSwatch, { pageColorLabel, paperLabel } from '../PaperSwatch';
import SwipeDismissSheet from '../SwipeDismissSheet';

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

/** Paper, page colour and shape, changed in place while the drawing stays on the page. */
export function PageOptionsSheet({ visible, setup, onChange, onClose }: PageOptionsSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Sayfa seçeneklerini kapat', 'Close page options')}
                />
                <SwipeDismissSheet active={visible} style={styles.sheet} onDismiss={onClose}>
                    <Text style={styles.title}>{l('Sayfa', 'Page')}</Text>

                    <Text style={styles.groupLabel}>{l('Kağıt', 'Paper')}</Text>
                    <View style={styles.chipRow}>
                        {BLANK_CANVAS_PAPERS.map((paper) => {
                            const selected = setup.paper === paper;
                            return (
                                <TouchableOpacity
                                    key={paper}
                                    style={[styles.chip, selected && styles.chipActive]}
                                    onPress={() => onChange({ ...setup, paper })}
                                    accessibilityRole="button"
                                    accessibilityLabel={paperLabel(paper, l)}
                                    accessibilityState={{ selected }}
                                >
                                    <PaperSwatch
                                        paper={paper}
                                        background={setup.background}
                                        width={40}
                                        height={30}
                                        style={styles.chipSwatch}
                                    />
                                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                                        {paperLabel(paper, l)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.groupLabel}>{l('Zemin', 'Page colour')}</Text>
                    <View style={styles.chipRow}>
                        {BLANK_CANVAS_BACKGROUNDS.map((option) => {
                            const selected = setup.background === option.color;
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[styles.chip, selected && styles.chipActive]}
                                    onPress={() => onChange({ ...setup, background: option.color })}
                                    accessibilityRole="button"
                                    accessibilityLabel={pageColorLabel(option.id, l)}
                                    accessibilityState={{ selected }}
                                >
                                    <View style={[styles.chipSwatch, styles.colorSwatch, { backgroundColor: option.color }]} />
                                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                                        {pageColorLabel(option.id, l)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.groupLabel}>{l('Biçim', 'Shape')}</Text>
                    <View style={styles.chipRow}>
                        {BLANK_CANVAS_SHAPES.map((option) => {
                            const selected = setup.shape === option.id;
                            // The outline is the page's shape fitted into a 36 x 28 box.
                            const fit = Math.min(36 / option.width, 28 / option.height);
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[styles.chip, selected && styles.chipActive]}
                                    onPress={() => onChange({ ...setup, shape: option.id })}
                                    accessibilityRole="button"
                                    accessibilityLabel={shapeLabel(option.id, l)}
                                    accessibilityState={{ selected }}
                                >
                                    <View style={styles.shapeBox}>
                                        <View
                                            style={[
                                                styles.shapeGlyph,
                                                { width: option.width * fit, height: option.height * fit },
                                                selected && { borderColor: colors.accent },
                                            ]}
                                        />
                                    </View>
                                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                                        {shapeLabel(option.id, l)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={styles.doneButton}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Sayfa seçeneklerini kapat', 'Close page options')}
                    >
                        <Text style={styles.doneText}>{l('Tamam', 'Done')}</Text>
                    </TouchableOpacity>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            paddingBottom: 32,
            ...Shadows.lg,
        },
        title: {
            fontSize: FontSize.lg,
            fontWeight: '700',
            color: colors.textPrimary,
            marginBottom: Spacing.xs,
        },
        groupLabel: {
            fontSize: FontSize.sm,
            fontWeight: '700',
            color: colors.textSecondary,
            marginTop: Spacing.md,
            marginBottom: Spacing.sm,
        },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        chip: {
            minWidth: 72,
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.md,
            borderWidth: 2,
            borderColor: colors.borderLight,
            backgroundColor: colors.bgInput,
        },
        chipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        chipSwatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        colorSwatch: { width: 40, height: 30 },
        chipText: { fontSize: FontSize.sm, color: colors.textSecondary, fontWeight: '600' },
        chipTextActive: { color: colors.textPrimary },
        shapeBox: { width: 40, height: 30, alignItems: 'center', justifyContent: 'center' },
        shapeGlyph: { borderRadius: 3, borderWidth: 2, borderColor: colors.textMuted },
        doneButton: {
            marginTop: Spacing.xl,
            minHeight: 50,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        doneText: { color: colors.white, fontWeight: '800', fontSize: FontSize.md },
    });
}
