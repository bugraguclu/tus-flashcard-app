import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { SheetNoDrag } from '../SwipeDismissSheet';
import { FontSize, Spacing, resolveThemeColors, useIsDarkTheme, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { ACCENT_PRESETS, isCustomAccent, normalizeAccentColor } from '../../lib/accentTheme';
import { Button } from '../ui/Button';
import { AccentSwatches, ColorPicker } from '../ui/ColorPicker';
import { AppSheet } from '../ui/Sheet';

/**
 * Settings › General › Accent colour: nine ready colours and one of the learner's own. A tap
 * recolours the app at once (Settings previews its draft), so the app itself is the preview.
 */
export function AccentColorSetting({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const { l } = useI18n();
    const accent = normalizeAccentColor(value);
    const custom = isCustomAccent(accent);
    // The learner's own colour stays in the grid while they try a preset, for this visit.
    const [ownColor, setOwnColor] = useState<string | null>(custom ? accent : null);
    const [pickerOpen, setPickerOpen] = useState(false);
    // The picker is built the first time it is asked for, then stays mounted so it can animate out.
    const [pickerBuilt, setPickerBuilt] = useState(false);
    const openPicker = () => { setPickerBuilt(true); setPickerOpen(true); };
    if (custom && ownColor !== accent) setOwnColor(accent);

    const mode = isDark ? 'dark' : 'light';
    const swatches = useMemo(() => ACCENT_PRESETS.map((preset) => ({
        value: preset.id,
        color: resolveThemeColors(mode, mode, preset.id).colors.accent,
        label: l(preset.tr, preset.en),
    })), [l, mode]);
    const chosenName = custom
        ? `${l('Özel', 'Custom')} · ${accent.toUpperCase()}`
        : swatches.find((swatch) => swatch.value === accent)?.label ?? '';

    const pressCustom = () => {
        // A first tap on a colour picked earlier chooses it; the picker opens for a new colour, or
        // to change the one in use.
        if (ownColor && !custom) onChange(ownColor);
        else openPicker();
    };

    return (
        <View style={styles.root}>
            <AccentSwatches
                swatches={swatches}
                value={accent}
                onSelect={onChange}
                custom={ownColor ? { color: resolveThemeColors(mode, mode, ownColor).colors.accent, selected: custom } : null}
                customLabel={l('Özel renk', 'Custom colour')}
                onPressCustom={pressCustom}
            />
            <View style={styles.footer}>
                <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>{chosenName}</Text>
                {custom ? (
                    <Button variant="plain" size="compact" label={l('Rengi değiştir', 'Change colour')} onPress={openPicker} />
                ) : null}
            </View>
            {pickerBuilt ? (
            <AppSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={l('Özel renk', 'Custom colour')}>
                <SheetNoDrag style={styles.sheetBody}>
                    <ColorPicker
                        value={ownColor ?? colors.accent}
                        onChange={onChange}
                        accessibilityLabel={l('Özel renk', 'Custom colour')}
                    />
                </SheetNoDrag>
            </AppSheet>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: Spacing.xs },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, gap: Spacing.sm },
    name: { flexShrink: 1, fontSize: FontSize.md },
    sheetBody: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.md },
});
