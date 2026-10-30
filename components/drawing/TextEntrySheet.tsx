import { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text, TextInput } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { photoTextColors, type PhotoTextStyle } from '../../lib/photoEditor';

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

/** A small card over the keyboard for writing or changing one label on the page. */
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

    const styleName = (style: PhotoTextStyle) => {
        switch (style) {
            case 'classic': return l('Kenarlı', 'Outlined');
            case 'badge': return l('Etiket', 'Tag');
            default: return l('Düz', 'Plain');
        }
    };

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
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Metin yazmayı kapat', 'Close text entry')}
                />
                <View style={styles.card}>
                    <Text style={styles.title}>{editing ? l('Metni düzenle', 'Edit Text') : l('Metin ekle', 'Add Text')}</Text>
                    <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        autoFocus
                        multiline
                        placeholder={l('Yazın…', 'Type…')}
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: readableInk }]}
                        accessibilityLabel={l('Sayfaya eklenecek metin', 'Text to add to the page')}
                    />
                    {labelStyles && labelStyles.length > 1 ? (
                        <View style={styles.styleRow} accessibilityRole="radiogroup" accessibilityLabel={l('Metin stili', 'Text style')}>
                            {labelStyles.map((style) => {
                                const selected = style === labelStyle;
                                return (
                                    <TouchableOpacity
                                        key={style}
                                        style={[styles.styleChip, selected && styles.styleChipActive]}
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
                        <TouchableOpacity style={styles.secondary} onPress={onClose} accessibilityRole="button">
                            <Text style={styles.secondaryText}>{l('Vazgeç', 'Cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primary, !draft.trim() && !editing && styles.primaryDisabled]}
                            onPress={submit}
                            disabled={!draft.trim() && !editing}
                            accessibilityRole="button"
                            accessibilityLabel={editing ? l('Metni kaydet', 'Save text') : l('Metni sayfaya ekle', 'Add text to the page')}
                        >
                            <Text style={styles.primaryText}>{editing ? l('Kaydet', 'Save') : l('Ekle', 'Add')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end', padding: Spacing.md },
        card: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
            marginBottom: Spacing.md,
            ...Shadows.lg,
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        input: {
            minHeight: 72,
            maxHeight: 180,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            fontSize: FontSize.lg,
            fontWeight: '600',
            textAlignVertical: 'top',
        },
        styleRow: { flexDirection: 'row', gap: Spacing.sm },
        styleChip: {
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Spacing.xs,
            paddingHorizontal: Spacing.xs,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        styleChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        styleLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        styleLabelActive: { color: colors.accent },
        samplePlate: { borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
        sampleText: { fontSize: FontSize.md, fontWeight: '800' },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
        secondary: { minHeight: 44, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
        secondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
        primary: {
            minHeight: 44,
            paddingHorizontal: Spacing.xl,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.accent,
            justifyContent: 'center',
        },
        primaryDisabled: { opacity: 0.4 },
        primaryText: { color: colors.white, fontWeight: '700', fontSize: FontSize.md },
    });
}
