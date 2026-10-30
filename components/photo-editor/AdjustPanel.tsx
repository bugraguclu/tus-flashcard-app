import { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    PHOTO_ADJUSTMENT_KEYS,
    PHOTO_FILTERS,
    photoFilterMatching,
    type PhotoAdjustmentKey,
    type PhotoAdjustments,
    type PhotoFilterId,
} from '../../lib/photoAdjustments';
import { AdjustmentSlider } from './AdjustmentSlider';
import { ROW_LABEL_FIT } from './editorModel';
import { BrightnessGlyph, ContrastGlyph, FiltersGlyph, SaturationGlyph, WarmthGlyph } from './photoEditorGlyphs';

export type PhotoAdjustTab = 'filters' | PhotoAdjustmentKey;

const TAB_GLYPHS: Record<PhotoAdjustTab, typeof FiltersGlyph> = {
    filters: FiltersGlyph,
    brightness: BrightnessGlyph,
    contrast: ContrastGlyph,
    saturation: SaturationGlyph,
    warmth: WarmthGlyph,
};

interface AdjustPanelProps {
    tab: PhotoAdjustTab;
    onTabChange: (tab: PhotoAdjustTab) => void;
    /** The sliders as they are shown, a moving one included. */
    adjustments: PhotoAdjustments;
    onFilter: (id: PhotoFilterId) => void;
    onSlide: (key: PhotoAdjustmentKey, value: number) => void;
    onSlideEnd: (key: PhotoAdjustmentKey, value: number) => void;
    disabled: boolean;
}

/** The adjust screen's two rows: ready-made looks or one of four sliders, then what it is set to. */
export function AdjustPanel({ tab, onTabChange, adjustments, onFilter, onSlide, onSlideEnd, disabled }: AdjustPanelProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const tabLabel = (id: PhotoAdjustTab) => {
        switch (id) {
            case 'filters': return l('Filtreler', 'Filters');
            case 'brightness': return l('Parlaklık', 'Brightness');
            case 'contrast': return l('Kontrast', 'Contrast');
            case 'saturation': return l('Doygunluk', 'Saturation');
            case 'warmth': return l('Sıcaklık', 'Warmth');
        }
    };
    const filterLabel = (id: PhotoFilterId) => {
        switch (id) {
            case 'original': return l('Orijinal', 'Original');
            case 'vivid': return l('Canlı', 'Vivid');
            case 'document': return l('Belge', 'Document');
            case 'mono': return l('Siyah-beyaz', 'Mono');
            case 'warm': return l('Sıcak', 'Warm');
            case 'cool': return l('Soğuk', 'Cool');
        }
    };
    const activeFilter = photoFilterMatching(adjustments);
    const tabs: PhotoAdjustTab[] = ['filters', ...PHOTO_ADJUSTMENT_KEYS];

    return (
        <View style={styles.bar}>
            <View style={styles.segment} accessibilityRole="tablist">
                {tabs.map((id) => {
                    const selected = tab === id;
                    const Glyph = TAB_GLYPHS[id];
                    const moved = id !== 'filters' && adjustments[id] !== 0;
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.tabButton, selected && styles.tabButtonActive]}
                            onPress={() => onTabChange(id)}
                            accessibilityRole="tab"
                            accessibilityLabel={moved ? `${tabLabel(id)}: ${adjustments[id as PhotoAdjustmentKey]}` : tabLabel(id)}
                            accessibilityState={{ selected }}
                        >
                            <Glyph color={selected ? colors.accent : colors.textSecondary} size={20} />
                            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]} {...ROW_LABEL_FIT}>{tabLabel(id)}</Text>
                            {moved && <View style={styles.movedDot} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
            {tab === 'filters' ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                    accessibilityRole="radiogroup"
                    accessibilityLabel={l('Hazır görünümler', 'Ready-made looks')}
                >
                    {PHOTO_FILTERS.map(({ id }) => {
                        const selected = id === activeFilter;
                        return (
                            <TouchableOpacity
                                key={id}
                                style={[styles.chip, selected && styles.chipActive]}
                                onPress={() => onFilter(id)}
                                disabled={disabled}
                                accessibilityRole="radio"
                                accessibilityLabel={filterLabel(id)}
                                accessibilityState={{ selected, disabled }}
                                aria-checked={selected}
                            >
                                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{filterLabel(id)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            ) : (
                <AdjustmentSlider
                    key={tab}
                    label={tabLabel(tab)}
                    value={adjustments[tab]}
                    onChange={(value) => onSlide(tab, value)}
                    onChangeEnd={(value) => onSlideEnd(tab, value)}
                    disabled={disabled}
                />
            )}
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
        tabButton: {
            flex: 1,
            minHeight: 46,
            paddingHorizontal: 2,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        tabButtonActive: { backgroundColor: colors.bgCard, borderColor: colors.accent },
        tabLabel: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        tabLabelActive: { color: colors.accent },
        movedDot: { position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
        filters: { alignItems: 'center', gap: Spacing.xs, minHeight: 44 },
        chip: {
            minHeight: 34,
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
