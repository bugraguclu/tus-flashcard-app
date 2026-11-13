import { useRef } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import PressableScale from '../PressableScale';
import { PopoverBackdrop, PopoverItem, PopoverModal, usePopoverProgress } from '../Popover';
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

/** ＋ inside the open menu: it turns into × about its centre as the menu opens, and back as it closes. */
function MenuFab({ style, accent, open, glyphColor, onPress, label }: {
    style: StyleProp<ViewStyle>;
    accent: string;
    open: string;
    glyphColor: string;
    onPress: () => void;
    label: string;
}) {
    const progress = usePopoverProgress();
    const reduceMotion = useReduceMotion();
    const turn = progress && !reduceMotion
        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
        : '45deg';
    const backgroundColor = progress
        ? progress.interpolate({ inputRange: [0, 1], outputRange: [accent, open] })
        : open;
    return (
        <PressableScale
            style={[style, { backgroundColor }]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded: true }}
            aria-expanded
        >
            <Animated.View style={{ transform: [{ rotate: turn }] }}>
                <PlusIcon color={glyphColor} size={28} />
            </Animated.View>
        </PressableScale>
    );
}

/**
 * The deck list's add actions as labelled buttons above ＋. They rise out of ＋ one after another
 * over the speed dial's strong dimming while ＋ turns into ×, and sink back into it when the menu
 * closes. The labels sit directly on the dimming, as a speed dial's do.
 */
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

    return (
        <>
            <PressableScale
                style={[styles.fab, { bottom, backgroundColor: colors.accent }]}
                onPress={onOpen}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={l('Ekle', 'Add')}
                accessibilityState={{ expanded: false }}
            >
                <PlusIcon color={colors.onAccent} size={28} />
            </PressableScale>
            <PopoverModal
                visible={visible}
                onRequestClose={onClose}
                onDismiss={handleDismiss}
                itemCount={actions.length}
            >
                <View style={styles.overlay}>
                    <PopoverBackdrop
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimStrong }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    />
                    {/* The prop, not the style: react-native-web drops a 'box-none' style. */}
                    <View
                        style={[styles.actions, {
                            paddingBottom: bottom + FAB_SIZE + Spacing.md,
                            paddingLeft: Spacing.lg + insets.left,
                        }]}
                        pointerEvents="box-none"
                    >
                        {actions.map(({ key, label, icon, onPress }, index) => (
                            // The action nearest ＋ comes out first.
                            <PopoverItem key={key} index={actions.length - 1 - index} origin="bottom right">
                                <TouchableOpacity
                                    style={styles.actionRow}
                                    onPress={() => selectAction(onPress)}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                >
                                    <View style={styles.actionLabel}>
                                        <Text style={[styles.actionLabelText, { color: colors.onAccent }]}>{label}</Text>
                                    </View>
                                    <View style={[styles.actionButton, { backgroundColor: colors.accent }]}>
                                        {icon}
                                    </View>
                                </TouchableOpacity>
                            </PopoverItem>
                        ))}
                    </View>
                    <MenuFab
                        style={[styles.fab, { bottom }]}
                        accent={colors.accent}
                        open={colors.accentHover}
                        glyphColor={colors.onAccent}
                        onPress={onClose}
                        label={l('Ekleme menüsünü kapat', 'Close add menu')}
                    />
                </View>
            </PopoverModal>
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
