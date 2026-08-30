// Anki's "Reset Card" dialog (qt/aqt/forms/forget.ui): a title and exactly two checkboxes, both
// off until the user turns them on and remembered per surface. Resetting sends the cards back to
// the new queue; without "restore position" they land at the end of it. Anki still calls the code
// path "forget", which is why the identifiers here do.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { TouchableOpacity } from './Touchable';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import type { ForgetOptions } from '../lib/setDueDate';

interface ForgetCardsDialogProps {
    visible: boolean;
    cardCount: number;
    /** Remembered options for this surface. */
    initialOptions: ForgetOptions;
    onCancel: () => void;
    onConfirm: (options: ForgetOptions) => void;
}

export function ForgetCardsDialog({ visible, cardCount, initialOptions, onCancel, onConfirm }: ForgetCardsDialogProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [restorePosition, setRestorePosition] = useState(initialOptions.restorePosition);
    const [resetCounts, setResetCounts] = useState(initialOptions.resetCounts);

    useEffect(() => {
        if (!visible) return;
        setRestorePosition(initialOptions.restorePosition);
        setResetCounts(initialOptions.resetCounts);
    }, [visible, initialOptions.restorePosition, initialOptions.resetCounts]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onCancel}
                    accessibilityRole="button"
                    accessibilityLabel={l('Kapat', 'Close')}
                />
                <View style={styles.card} accessibilityViewIsModal>
                    <Text scaleRole="title" style={styles.title}>{l('Kartı Sıfırla', 'Reset Card')}</Text>

                    <CheckboxRow
                        styles={styles}
                        checked={restorePosition}
                        onToggle={() => setRestorePosition((on) => !on)}
                        label={l('Mümkünse özgün konumu geri yükle', 'Restore original position where possible')}
                    />
                    <CheckboxRow
                        styles={styles}
                        checked={resetCounts}
                        onToggle={() => setResetCounts((on) => !on)}
                        label={l('Tekrar ve unutma sayaçlarını sıfırla', 'Reset repetition and lapse counts')}
                    />

                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.button} onPress={onCancel} accessibilityRole="button">
                            <Text style={styles.buttonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.buttonPrimary]}
                            onPress={() => onConfirm({ restorePosition, resetCounts })}
                            accessibilityRole="button"
                        >
                            <Text style={styles.buttonPrimaryText}>{l('Tamam', 'OK')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function CheckboxRow({ styles, checked, onToggle, label }: {
    styles: ReturnType<typeof createStyles>;
    checked: boolean;
    onToggle: () => void;
    label: string;
}) {
    return (
        <TouchableOpacity
            style={styles.checkboxRow}
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
        >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{label}</Text>
        </TouchableOpacity>
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
        checkboxRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
        checkbox: {
            width: 22,
            height: 22,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
        },
        checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
        checkboxTick: { color: colors.white, fontSize: 15, lineHeight: 17, fontWeight: '900' },
        checkboxLabel: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.lg },
        button: { minWidth: 96, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        buttonPrimary: { backgroundColor: colors.accent },
        buttonText: { color: colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
        buttonPrimaryText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
    });
}
