import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { CloseButton } from './Button';
import { Radius, Type, Shadow } from './tokens';

interface AppDialogProps {
    visible: boolean;
    /** Asked to close: the backdrop, the close button or the system back action. */
    onClose: () => void;
    title: string;
    /** A sentence under the title. */
    message?: string;
    /** Puts a close button beside the title (pickers and help without a Cancel action). */
    closeButton?: boolean;
    /** Controls beside the title, before the close button: a picker's add or select-all. */
    headerAccessory?: React.ReactNode;
    /** Whether a tap on the backdrop closes it; off while a form would lose typed text. */
    dismissOnBackdrop?: boolean;
    /** Buttons at the bottom, right-aligned: a plain Cancel, then the primary action. */
    actions?: React.ReactNode;
    /** Spoken for the close button and the backdrop, e.g. "Yardımı kapat"; "Kapat" by default. */
    closeLabel?: string;
    /** Extra style for the card, e.g. a wider limit for a table. */
    cardStyle?: StyleProp<ViewStyle>;
    /**
     * Leaves at once, without its exit animation, when `visible` turns false: set by
     * `useModalHandoff` while it hands the screen to another modal, which UIKit would
     * otherwise hold back until this one has gone.
     */
    closeAtOnce?: boolean;
    onDismiss?: () => void;
    children?: React.ReactNode;
}

/**
 * The one centred dialog for the app's own forms, pickers and explanations: a white card over the
 * dimmed screen. Confirmations go through `lib/confirm`, which uses the system alert on iPhone.
 */
export function AppDialog({
    visible,
    onClose,
    title,
    message,
    closeButton = false,
    headerAccessory,
    dismissOnBackdrop = true,
    actions,
    closeLabel,
    cardStyle,
    closeAtOnce = false,
    onDismiss,
    children,
}: AppDialogProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const spokenClose = closeLabel ?? l('Kapat', 'Close');
    return (
        <Modal
            visible={visible}
            transparent
            animationType={closeAtOnce && !visible ? 'none' : 'fade'}
            onRequestClose={onClose}
            onDismiss={onDismiss}
            statusBarTranslucent
        >
            <KeyboardAvoidingView
                style={[styles.layer, { backgroundColor: colors.scrim }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={dismissOnBackdrop ? onClose : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={spokenClose}
                    importantForAccessibility={dismissOnBackdrop ? 'auto' : 'no-hide-descendants'}
                    accessibilityElementsHidden={!dismissOnBackdrop}
                />
                <View style={[styles.card, { backgroundColor: colors.bgCard }, cardStyle]} accessibilityViewIsModal>
                    <View style={styles.header}>
                        <Text style={[Type.title, styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                            {title}
                        </Text>
                        {headerAccessory ? <View style={styles.accessory}>{headerAccessory}</View> : null}
                        {closeButton ? (
                            <View style={styles.close}><CloseButton accessibilityLabel={spokenClose} onPress={onClose} /></View>
                        ) : null}
                    </View>
                    {message ? <Text style={[Type.body, styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
                    {children}
                    {actions ? <View style={styles.actions}>{actions}</View> : null}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    layer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    card: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '86%',
        borderRadius: Radius.card,
        padding: Spacing.xl,
        gap: Spacing.md,
        ...Shadow.floating,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { flex: 1 },
    close: { marginVertical: -Spacing.sm, marginRight: -Spacing.sm },
    accessory: { flexDirection: 'row', alignItems: 'center', marginVertical: -Spacing.sm },
    message: { lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
});
