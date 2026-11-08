import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, type TextStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { photoTextColors, type PhotoTextStyle } from '../../lib/photoEditor';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { AppSheet } from '../ui/Sheet';
import { Radius } from '../ui/tokens';

interface TextEntrySheetProps {
    visible: boolean;
    /** The label being edited, or empty for a new one. */
    initialText: string;
    editing: boolean;
    /** The ink the label will be written in, shown on the field so the result is no surprise. */
    color: string;
    /**
     * The ways the label may be set off from what is under it, offered as a row of samples. The
     * drawing page leaves this out: on paper a label is plain ink.
     */
    labelStyles?: PhotoTextStyle[];
    labelStyle?: PhotoTextStyle;
    onLabelStyleChange?: (style: PhotoTextStyle) => void;
    onSubmit: (text: string) => void;
    onClose: () => void;
}

/** A sheet over the keyboard for writing or changing one label on the page. */
export function TextEntrySheet({
    visible,
    initialText,
    editing,
    color,
    labelStyles,
    labelStyle,
    onLabelStyleChange,
    onSubmit,
    onClose,
}: TextEntrySheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [draft, setDraft] = useState(initialText);

    useEffect(() => {
        if (visible) setDraft(initialText);
    }, [visible, initialText]);

    const submit = () => onSubmit(draft.trim());
    // White ink would vanish on the light field and samples; it is shown in the text colour.
    const readableInk = color === '#ffffff' ? colors.textPrimary : color;
    // The field writes in the label's ink. `TextField` keeps its own look otherwise.
    const inkStyle: TextStyle = { color: readableInk };

    const styleName = (style: PhotoTextStyle) => {
        switch (style) {
            case 'classic': return l('Kenarlı', 'Outlined');
            case 'badge': return l('Etiket', 'Tag');
            default: return l('Düz', 'Plain');
        }
    };

    // The samples show the label as it will be drawn on the photo, so they keep the photo's colours.
    const styleSample = (style: PhotoTextStyle) => {
        if (style === 'badge') {
            const plate = photoTextColors({ id: 'sample', type: 'text', text: 'Aa', point: { x: 0.5, y: 0.5 }, fontSize: 16, bgStyle: 'badge', color, width: 1, opacity: 1 });
            return (
                <View style={[styles.samplePlate, { backgroundColor: plate.background }]}>
                    <Text style={[styles.sampleText, { color: plate.text }]}>Aa</Text>
                </View>
            );
        }
        if (style === 'classic') {
            const halo = color === '#ffffff' ? '#111827' : '#ffffff';
            return (
                <View style={[styles.samplePlate, { backgroundColor: colors.textMuted }]}>
                    <Text style={[styles.sampleText, { color, textShadowColor: halo, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } }]}>Aa</Text>
                </View>
            );
        }
        return <Text style={[styles.sampleText, { color: readableInk }]}>Aa</Text>;
    };

    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={editing ? l('Metni düzenle', 'Edit Text') : l('Metin ekle', 'Add Text')}
            avoidKeyboard
            backdropLabel={l('Metin yazmayı kapat', 'Close text entry')}
        >
            <View style={styles.body}>
                <TextField
                    value={draft}
                    onChangeText={setDraft}
                    autoFocus
                    multiline
                    placeholder={l('Yazın…', 'Type…')}
                    style={[styles.input, inkStyle]}
                    accessibilityLabel={l('Sayfaya eklenecek metin', 'Text to add to the page')}
                />
                {/* Samples of the result, which a segmented control cannot draw: the tiles stay. */}
                {labelStyles && labelStyles.length > 1 ? (
                    <View style={styles.styleRow} accessibilityRole="radiogroup" accessibilityLabel={l('Metin stili', 'Text style')}>
                        {labelStyles.map((style) => {
                            const selected = style === labelStyle;
                            return (
                                <TouchableOpacity
                                    key={style}
                                    style={[styles.styleTile, selected && styles.styleTileActive]}
                                    onPress={() => onLabelStyleChange?.(style)}
                                    accessibilityRole="radio"
                                    accessibilityLabel={styleName(style)}
                                    accessibilityState={{ selected }}
                                    aria-checked={selected}
                                >
                                    {styleSample(style)}
                                    <Text style={[styles.styleLabel, selected && styles.styleLabelActive]}>{styleName(style)}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : null}
                <View style={styles.actions}>
                    <Button label={l('Vazgeç', 'Cancel')} variant="plain" onPress={onClose} />
                    <Button
                        label={editing ? l('Kaydet', 'Save') : l('Ekle', 'Add')}
                        onPress={submit}
                        disabled={!draft.trim() && !editing}
                        accessibilityLabel={editing ? l('Metni kaydet', 'Save text') : l('Metni sayfaya ekle', 'Add text to the page')}
                    />
                </View>
            </View>
        </AppSheet>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        body: { gap: Spacing.md },
        input: { minHeight: 72, maxHeight: 180 },
        styleRow: { flexDirection: 'row', gap: Spacing.sm },
        styleTile: {
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Spacing.xs,
            paddingHorizontal: Spacing.xs,
            borderRadius: Radius.inset,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        styleTileActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        styleLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        styleLabelActive: { color: colors.accent },
        samplePlate: { borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
        sampleText: { fontSize: FontSize.md, fontWeight: '800' },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.sm },
    });
}
