import React from 'react';
import { Modal, Pressable, ScrollView, type StyleProp, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { CheckIcon } from './icons';
import { DISABLED_OPACITY, Radius } from './tokens';

interface PopoverMenuProps {
    visible: boolean;
    onClose: () => void;
    /** Runs once the menu has gone, e.g. to open what was chosen without two modals at once. */
    onDismiss?: () => void;
    /**
     * Where the menu hangs: its top edge below the screen's top (safe area included) and its
     * distance from the right edge. By default it hangs under a 56-point header's right corner.
     */
    anchor?: { top?: number; right?: number };
    /** Names the menu for VoiceOver. */
    accessibilityLabel?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * The one ••• menu: a white card that hangs from the button that opened it, over a light dimming
 * that closes it. Rows are `MenuItem`s.
 */
export function PopoverMenu({ visible, onClose, onDismiss, anchor, accessibilityLabel, children, style }: PopoverMenuProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { l } = useI18n();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent>
            <View style={[styles.layer, { backgroundColor: colors.scrimLight }]}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={l('Menüyü kapat', 'Close menu')}
                />
                <View
                    style={[
                        styles.menu,
                        {
                            top: insets.top + (anchor?.top ?? 52),
                            right: anchor?.right ?? Spacing.sm,
                            maxHeight: '80%',
                            backgroundColor: colors.bgCard,
                            borderColor: colors.border,
                        },
                        style,
                    ]}
                    accessibilityViewIsModal
                    accessibilityLabel={accessibilityLabel}
                >
                    <ScrollView bounces={false} contentContainerStyle={styles.menuContent}>{children}</ScrollView>
                </View>
            </View>
        </Modal>
    );
}

interface MenuItemProps {
    label: string;
    onPress: () => void;
    /** A 22-point line icon in the muted text colour. */
    icon?: React.ReactNode;
    /** A one-line explanation under the label. */
    hint?: string;
    /** Draws a tick at the end: the item is an option that is on. */
    checked?: boolean;
    destructive?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
}

/** One action of a `PopoverMenu` or of an action sheet. */
export function MenuItem({ label, onPress, icon, hint, checked, destructive = false, disabled = false, accessibilityLabel }: MenuItemProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.item, disabled && styles.disabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole={checked === undefined ? 'menuitem' : 'checkbox'}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={checked === undefined ? { disabled } : { disabled, checked }}
        >
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <View style={styles.copy}>
                <Text style={[styles.label, { color: destructive ? colors.danger : colors.textPrimary }]}>{label}</Text>
                {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
            </View>
            {checked ? <CheckIcon color={colors.accent} size={18} /> : null}
        </TouchableOpacity>
    );
}

/** A hairline between groups of menu items. */
export function MenuSeparator() {
    const colors = useThemeColors();
    return <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />;
}

const styles = StyleSheet.create({
    layer: { flex: 1 },
    menu: {
        position: 'absolute',
        minWidth: 220,
        maxWidth: 320,
        borderRadius: Radius.inset,
        borderWidth: 1,
        ...Shadows.lg,
    },
    menuContent: { paddingVertical: Spacing.xs },
    item: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    disabled: { opacity: DISABLED_OPACITY },
    icon: { width: 22, alignItems: 'center' },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    label: { fontSize: FontSize.md, fontWeight: '500' },
    hint: { fontSize: FontSize.sm, lineHeight: 17 },
    separator: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
});
