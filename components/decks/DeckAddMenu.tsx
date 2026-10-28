import React, { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

const FAB_SIZE = 56;
export const DECK_ADD_MENU_LIST_INSET = FAB_SIZE + 2 * Spacing.md;

interface DeckAddMenuProps {
    bottom: number;
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    onCreateFilteredDeck: () => void;
    onCreateDeck: () => void;
    onAddCard: () => void;
}

/** The deck list's add actions as labelled buttons above ＋, fading in over the stopwatch tools' dimmed backdrop. */
export default function DeckAddMenu({
    bottom, visible, onOpen, onClose, onCreateFilteredDeck, onCreateDeck, onAddCard,
}: DeckAddMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const pendingAction = useRef<(() => void) | null>(null);
    const actions = [
        { label: l('Filtrelenmiş deste oluştur', 'Create filtered deck'), glyph: '⧉', onPress: onCreateFilteredDeck },
        { label: l('Deste oluştur', 'Create deck'), glyph: '▤', onPress: onCreateDeck },
        { label: l('Kart ekle', 'Add note'), glyph: '✎', onPress: onAddCard },
    ];

    const selectAction = (action: () => void) => {
        if (pendingAction.current) return;
        // UIKit must finish dismissing this menu before another modal or editor can open.
        if (Platform.OS === 'ios') {
            pendingAction.current = action;
            onClose();
        } else {
            onClose();
            action();
        }
    };

    const handleDismiss = () => {
        const action = pendingAction.current;
        pendingAction.current = null;
        action?.();
    };

    const button = (expanded: boolean) => (
        <TouchableOpacity
            style={[styles.fab, {
                bottom,
                backgroundColor: expanded ? colors.accentHover : colors.accent,
            }]}
            onPress={expanded ? onClose : onOpen}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={expanded ? l('Ekleme menüsünü kapat', 'Close add menu') : l('Ekle', 'Add')}
            accessibilityState={{ expanded }}
        >
            <Text style={[styles.fabIcon, { color: colors.white }]}>＋</Text>
        </TouchableOpacity>
    );

    return (
        <>
            {button(false)}
            <Modal
                visible={visible}
                transparent
                animationType="fade"
                onRequestClose={onClose}
                onDismiss={handleDismiss}
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={[StyleSheet.absoluteFill, styles.backdrop]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    />
                    <View
                        style={[styles.actions, {
                            paddingBottom: bottom + FAB_SIZE + Spacing.md,
                            paddingLeft: Spacing.lg + insets.left,
                        }]}
                        pointerEvents="box-none"
                    >
                        {actions.map(({ label, glyph, onPress }) => (
                            <TouchableOpacity
                                key={glyph}
                                style={styles.actionRow}
                                onPress={() => selectAction(onPress)}
                                accessibilityRole="button"
                                accessibilityLabel={label}
                            >
                                <View style={styles.actionLabel}>
                                    <Text style={[styles.actionLabelText, { color: colors.white }]}>{label}</Text>
                                </View>
                                <View style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                                    <Text style={[styles.actionIcon, { color: colors.white }]}>{glyph}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {button(true)}
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: Spacing.lg,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.lg,
    },
    fabIcon: { fontSize: 30, fontWeight: '400', lineHeight: 32 },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
    actions: {
        gap: Spacing.md,
        alignItems: 'flex-end',
        paddingRight: Spacing.lg,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: Spacing.md,
    },
    actionLabel: {
        maxWidth: 240,
        borderRadius: 4,
        backgroundColor: 'rgba(65, 65, 65, 0.82)',
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    actionLabelText: { fontSize: FontSize.sm, fontWeight: '600' },
    actionButton: {
        width: 46,
        height: 46,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
    actionIcon: { fontSize: 21, fontWeight: '700' },
});
