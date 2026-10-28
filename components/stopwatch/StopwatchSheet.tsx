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
import { CloseIcon } from './StopwatchIcons';

interface StopwatchSheetProps {
    visible: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    /**
     * The form header TUSBuddy's study forms use: the title in the accent colour, a close button
     * beside it and a rule under both.
     */
    formHeader?: boolean;
    /**
     * A picker drawn over the whole sheet on a dimmed backdrop (the course grid, the type list).
     * The sheet under it is hidden from VoiceOver while it is up.
     */
    overlay?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * The Kronometre's bottom sheet: a dimmed backdrop that closes it, and a sheet whose grabber can
 * be tapped or pulled down (`SwipeDismissSheet`), lifted above the keyboard when a field has focus.
 * While it slides away it takes no more touches, so a second tap cannot repeat what closed it.
 */
export default function StopwatchSheet({
    visible,
    title,
    subtitle,
    onClose,
    formHeader = false,
    overlay,
    children,
}: StopwatchSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const covered = Boolean(overlay);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={[styles.overlay, { pointerEvents: visible ? 'auto' : 'none' }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={[StyleSheet.absoluteFill, styles.backdrop]}
                    activeOpacity={1}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Paneli kapat', 'Close sheet')}
                    importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
                    accessibilityElementsHidden={covered}
                />
                <SwipeDismissSheet
                    active={visible}
                    enabled={!covered}
                    accessibilityViewIsModal={!covered}
                    onDismiss={onClose}
                    style={[
                        styles.sheet,
                        formHeader && styles.sheetForm,
                        { backgroundColor: colors.bgPrimary, paddingBottom: Math.max(insets.bottom, Spacing.md) },
                    ]}
                >
                    <View
                        style={styles.content}
                        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
                        accessibilityElementsHidden={covered}
                    >
                        {formHeader ? (
                            <View style={[styles.formHeader, { borderBottomColor: colors.border }]}>
                                <Text style={[styles.formTitle, { color: colors.accent }]} accessibilityRole="header" numberOfLines={2}>
                                    {title}
                                </Text>
                                <TouchableOpacity
                                    onPress={onClose}
                                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Kapat', 'Close')}
                                >
                                    <CloseIcon color={colors.accent} size={24} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.header}>
                                <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
                                {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
                            </View>
                        )}
                        {children}
                    </View>
                </SwipeDismissSheet>
                {overlay ? (
                    // Its own keyboard avoidance: an absolutely placed layer ignores the padding the
                    // sheet's container takes for the keyboard, so a picker's field would sit under it.
                    <KeyboardAvoidingView
                        style={[StyleSheet.absoluteFill, styles.pickerLayer]}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        accessibilityViewIsModal
                    >
                        {overlay}
                    </KeyboardAvoidingView>
                ) : null}
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
    sheetForm: { maxHeight: '92%' },
    content: { flexShrink: 1 },
    header: { marginBottom: Spacing.md, gap: 2 },
    title: { fontSize: FontSize.xl, fontWeight: '800' },
    subtitle: { fontSize: FontSize.md },
    formHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingBottom: Spacing.md,
        marginBottom: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    formTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '700' },
    pickerLayer: { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
