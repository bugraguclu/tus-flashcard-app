import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

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

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={[styles.card, { backgroundColor: colors.bgCard }]} onPress={() => undefined} accessibilityViewIsModal>
                    <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>{title}</Text>
                    {items.map((item) => (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.item, { borderTopColor: colors.borderLight }]}
                            onPress={item.onPress}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.itemText, { color: item.destructive ? colors.btnAgain : colors.textPrimary }]}>
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
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    card: {
        width: '100%',
        maxWidth: 380,
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.sm,
        ...Shadows.md,
    },
    title: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    item: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 2,
    },
    itemText: { fontSize: FontSize.lg, fontWeight: '600' },
    itemHint: { fontSize: FontSize.sm },
    cancel: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
    },
    cancelText: { fontSize: FontSize.lg, fontWeight: '700' },
});
