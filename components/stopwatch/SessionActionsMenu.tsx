import { Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { Shadow, Radius } from '../ui/tokens';
import { useI18n } from '../../hooks/useI18n';
import { useModalHandoff } from '../../hooks/useModalHandoff';
import { AnimatedPressable, usePopoverItemStyle } from '../Popover';

export interface SessionMenuItem {
    key: string;
    label: string;
    hint?: string;
    destructive?: boolean;
    onPress: () => void;
}

interface SessionActionsMenuProps {
    visible: boolean;
    title: string;
    items: SessionMenuItem[];
    onClose: () => void;
}

/** The centred action list a session's ••• button opens, on the Kronometre and in the calendar. */
export default function SessionActionsMenu({ visible, title, items, onClose }: SessionActionsMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    // The card grows in from 95% while the Modal fades it in.
    const growIn = usePopoverItemStyle();
    // Every item closes the menu and opens something else (the editor sheet, an alert, a
    // screen), which then appears at once instead of after the menu's fade (see useModalHandoff).
    const handoff = useModalHandoff(visible);

    return (
        <Modal visible={visible} transparent animationType={handoff.animationType} onRequestClose={onClose}>
            {/* Neither layer is a Tab stop on the web: Escape closes the menu, and the card only
                keeps a tap on it from reaching the backdrop. */}
            <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={onClose} tabIndex={-1}>
                <AnimatedPressable
                    style={[styles.card, { backgroundColor: colors.bgCard }, growIn]}
                    onPress={() => undefined}
                    tabIndex={-1}
                    accessibilityViewIsModal
                    accessibilityRole="menu"
                >
                    <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
                    {items.map((item) => (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.item, { borderTopColor: colors.borderLight }]}
                            onPress={() => handoff.handOff(item.onPress)}
                            accessibilityRole="menuitem"
                        >
                            <Text style={[styles.itemText, { color: item.destructive ? colors.danger : colors.textPrimary }]}>
                                {item.label}
                            </Text>
                            {item.hint ? (
                                <Text style={[styles.itemHint, { color: colors.textMuted }]} numberOfLines={1}>{item.hint}</Text>
                            ) : null}
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={[styles.cancel, { borderTopColor: colors.borderLight }]}
                        onPress={onClose}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.cancelText, { color: colors.accent }]}>{l('Kapat', 'Close')}</Text>
                    </TouchableOpacity>
                </AnimatedPressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        borderRadius: Radius.card,
        paddingVertical: Spacing.sm,
        ...Shadow.floating,
    },
    title: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    item: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: Spacing.xxs,
    },
    itemText: { fontSize: FontSize.lg, fontWeight: '500' },
    itemHint: { fontSize: FontSize.sm },
    cancel: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
    },
    cancelText: { fontSize: FontSize.lg, fontWeight: '600' },
});
