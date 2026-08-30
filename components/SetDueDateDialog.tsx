// Anki's "Set Due Date" dialog, matching qt/aqt/operations/scheduling.py: a prompt that pluralises
// on the number of cards, Anki's three-line syntax hint, and a field pre-filled with the value last
// used on this surface. One departure from upstream: OK stays disabled while the text is
// unparseable, instead of accepting the press and reporting an error afterwards.

import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { TouchableOpacity } from './Touchable';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { parseDueDateStr, type DueDateSpecifier } from '../lib/setDueDate';

interface SetDueDateDialogProps {
    visible: boolean;
    /** Drives Anki's singular/plural prompt. */
    cardCount: number;
    /** Remembered value for this surface; Anki opens the field with it selected. */
    initialValue: string;
    onCancel: () => void;
    onConfirm: (spec: DueDateSpecifier, raw: string) => void;
}

export function SetDueDateDialog({ visible, cardCount, initialValue, onCancel, onConfirm }: SetDueDateDialogProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (visible) setValue(initialValue);
    }, [visible, initialValue]);

    const spec = parseDueDateStr(value);
    const trimmed = value.trim();

    const submit = () => {
        if (!spec) return;
        onConfirm(spec, trimmed);
    };

    // Anki's scheduling-set-due-date-prompt, which has its own singular form.
    const prompt = cardCount === 1
        ? l('Kart kaç gün sonra gösterilsin?', 'Show card in how many days?')
        : l('Kartlar kaç gün sonra gösterilsin?', 'Show cards in how many days?');

    // Anki's scheduling-set-due-date-prompt-hint, line for line.
    const hintLines = [
        l('0 = bugün', '0 = today'),
        l('1! = yarın + aralığı 1 güne değiştir', '1! = tomorrow + change interval to 1'),
        l('3-7 = 3-7 gün arasından rastgele', '3-7 = random choice of 3-7 days'),
    ];

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onCancel}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kapat', 'Close')}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <Text scaleRole="title" style={styles.title}>{l('Son Tarihi Ayarla', 'Set Due Date')}</Text>
                    <Text style={styles.prompt}>{prompt}</Text>
                    <View style={styles.hint}>
                        {hintLines.map((line) => (
                            <Text key={line} style={styles.hintLine}>{line}</Text>
                        ))}
                    </View>
                    <TextInput
                        style={styles.input}
                        value={value}
                        onChangeText={setValue}
                        autoFocus
                        selectTextOnFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={prompt}
                    />
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.button} onPress={onCancel} accessibilityRole="button">
                            <Text style={styles.buttonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary, !spec && styles.buttonDisabled]}
                            onPress={submit}
                            disabled={!spec}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !spec }}
                        >
                            <Text style={styles.buttonPrimaryText}>{l('Tamam', 'OK')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.38)',
        },
        card: {
            width: '100%',
            maxWidth: 440,
            padding: Spacing.lg,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        title: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.md },
        prompt: { color: colors.textPrimary, fontSize: FontSize.md, marginBottom: Spacing.sm },
        hint: { marginBottom: Spacing.md, gap: 2 },
        hintLine: {
            color: colors.textMuted,
            fontSize: FontSize.sm,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        },
        input: {
            minHeight: 48,
            paddingHorizontal: Spacing.md,
            color: colors.textPrimary,
            fontSize: FontSize.md,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg },
        button: { minWidth: 96, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        buttonPrimary: { backgroundColor: colors.accent },
        buttonDisabled: { opacity: 0.4 },
        buttonText: { color: colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
        buttonPrimaryText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
    });
}
