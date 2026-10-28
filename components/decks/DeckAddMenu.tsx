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

/** The deck list's add actions, using the stopwatch tools' fade and dimmed-card presentation. */
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
                        style={[styles.cards, {
                            paddingBottom: bottom + FAB_SIZE + Spacing.lg,
                            paddingLeft: Spacing.lg + insets.left,
                            paddingRight: Spacing.lg + insets.right,
                        }]}
                        pointerEvents="box-none"
                    >
                        {actions.map(({ label, glyph, onPress }) => (
                            <TouchableOpacity
                                key={glyph}
                                style={[styles.card, { backgroundColor: colors.accent }]}
                                onPress={() => selectAction(onPress)}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={label}
                            >
                                <Text style={[styles.glyph, { color: colors.white }]}>{glyph}</Text>
                                <Text style={[styles.title, { color: colors.white }]}>{label}</Text>
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
    cards: { gap: Spacing.md },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        minHeight: 76,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: 12,
        ...Shadows.md,
    },
    glyph: { width: 36, textAlign: 'center', fontSize: 30 },
    title: { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
});
