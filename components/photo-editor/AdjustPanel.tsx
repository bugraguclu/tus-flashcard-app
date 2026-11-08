import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    PHOTO_ADJUSTMENT_KEYS,
    PHOTO_FILTERS,
    photoFilterMatching,
    type PhotoAdjustmentKey,
    type PhotoAdjustments,
    type PhotoFilterId,
} from '../../lib/photoAdjustments';
import { ToolSegment, ToolTrack } from '../drawing/DrawingToolbar';
import { Chip } from '../ui/Choice';
import { Radius } from '../ui/tokens';
import { AdjustmentSlider } from './AdjustmentSlider';
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
            <ToolTrack accessibilityRole="tablist">
                {tabs.map((id) => {
                    const moved = id !== 'filters' && adjustments[id] !== 0;
                    return (
                        <ToolSegment
                            key={id}
                            role="tab"
                            label={tabLabel(id)}
                            glyph={TAB_GLYPHS[id]}
                            selected={tab === id}
                            onPress={() => onTabChange(id)}
                            accessibilityLabel={moved ? `${tabLabel(id)}: ${adjustments[id as PhotoAdjustmentKey]}` : tabLabel(id)}
                            badge={moved ? <View style={styles.movedDot} /> : null}
                        />
                    );
                })}
            </ToolTrack>
            {tab === 'filters' ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                    accessibilityLabel={l('Hazır görünümler', 'Ready-made looks')}
                >
                    {PHOTO_FILTERS.map(({ id }) => (
                        <Chip
                            key={id}
                            label={filterLabel(id)}
                            selected={id === activeFilter}
                            onPress={() => onFilter(id)}
                            disabled={disabled}
                        />
                    ))}
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
        movedDot: { position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: Radius.pill, backgroundColor: colors.accent },
        filters: { alignItems: 'center', gap: Spacing.xs, minHeight: 44 },
    });
}
