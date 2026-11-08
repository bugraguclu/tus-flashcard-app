import { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import DeckOverflowGlyph from '../DeckOverflowGlyph';
import PencilGlyph from '../PencilGlyph';
import { PlusIcon } from '../ui/icons';

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

/** The deck list's add actions as labelled buttons above ＋, fading in over the speed-dial's strong dimming. */
export default function DeckAddMenu({
    bottom, visible, onOpen, onClose, onCreateFilteredDeck, onCreateDeck, onAddCard,
}: DeckAddMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const pendingAction = useRef<(() => void) | null>(null);
    const actions = [
        {
            key: 'filtered-deck',
            label: l('Filtrelenmiş deste oluştur', 'Create filtered deck'),
            icon: <DeckOverflowGlyph kind="filteredDeck" color={colors.onAccent} size={22} />,
            onPress: onCreateFilteredDeck,
        },
        {
            key: 'deck',
            label: l('Deste oluştur', 'Create deck'),
            icon: <DeckOverflowGlyph kind="deck" color={colors.onAccent} size={22} />,
            onPress: onCreateDeck,
        },
        {
            key: 'note',
            label: l('Kart ekle', 'Add note'),
            icon: <PencilGlyph color={colors.onAccent} size={22} />,
            onPress: onAddCard,
        },
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
            <PlusIcon color={colors.onAccent} size={28} />
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
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimStrong }]}
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
                        {actions.map(({ key, label, icon, onPress }) => (
                            <TouchableOpacity
                                key={key}
                                style={styles.actionRow}
                                onPress={() => selectAction(onPress)}
                                accessibilityRole="button"
                                accessibilityLabel={label}
                            >
                                {/* The labels sit directly on the strong dimming, as a speed dial's do. */}
                                <View style={styles.actionLabel}>
                                    <Text style={[styles.actionLabelText, { color: colors.onAccent }]}>{label}</Text>
                                </View>
                                <View style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                                    {icon}
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
    overlay: { flex: 1, justifyContent: 'flex-end' },
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
});
