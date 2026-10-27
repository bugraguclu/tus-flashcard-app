import { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

interface TextEntrySheetProps {
    visible: boolean;
    /** The label being edited, or empty for a new one. */
    initialText: string;
    editing: boolean;
    /** The ink the label will be written in, shown on the field so the result is no surprise. */
    color: string;
    onSubmit: (text: string) => void;
    onClose: () => void;
}

/** A small card over the keyboard for writing or changing one label on the page. */
export function TextEntrySheet({ visible, initialText, editing, color, onSubmit, onClose }: TextEntrySheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [draft, setDraft] = useState(initialText);

    useEffect(() => {
        if (visible) setDraft(initialText);
    }, [visible, initialText]);

    const submit = () => onSubmit(draft.trim());

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
                        style={[styles.input, { color: color === '#ffffff' ? colors.textPrimary : color }]}
                        accessibilityLabel={l('Sayfaya eklenecek metin', 'Text to add to the page')}
                    />
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
