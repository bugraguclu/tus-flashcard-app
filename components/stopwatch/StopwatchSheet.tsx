import React from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SwipeDismissSheet from '../SwipeDismissSheet';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

interface StopwatchSheetProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * The Kronometre's bottom sheet: a dimmed backdrop that closes it, and a sheet whose grabber can
 * be tapped or pulled down (`SwipeDismissSheet`), lifted above the keyboard when a field has focus.
 */
export default function StopwatchSheet({ visible, title, subtitle, onClose, children }: StopwatchSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={[StyleSheet.absoluteFill, styles.backdrop]}
                    activeOpacity={1}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Paneli kapat', 'Close sheet')}
                />
                <SwipeDismissSheet
                    active={visible}
                    accessibilityViewIsModal
                    onDismiss={onClose}
                    style={[
                        styles.sheet,
                        { backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
                    ]}
                >
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
                        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
                    </View>
                    {children}
                </SwipeDismissSheet>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.42)' },
    sheet: {
        maxHeight: '88%',
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        paddingHorizontal: Spacing.lg,
        paddingTop: 44,
        ...Shadows.lg,
    },
    header: { marginBottom: Spacing.md, gap: 2 },
    title: { fontSize: FontSize.xl, fontWeight: '800' },
    subtitle: { fontSize: FontSize.md },
});
