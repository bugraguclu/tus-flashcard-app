import React, { useRef } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import PressableScale from '../PressableScale';
import { PopoverBackdrop, PopoverItem, PopoverModal, usePopoverProgress } from '../Popover';

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

/** A plus drawn on the button's centre, so it can turn into × about that centre. */
function PlusGlyph({ color }: { color: string }) {
    return (
        <Svg width={22} height={22} viewBox="0 0 22 22" {...DECORATIVE_SVG_PROPS}>
            <Path d="M11 2.5v17M2.5 11h17" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
    );
}

/** ＋ inside the open menu: it turns into × as the menu opens, and back as it closes. */
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
        >
            <Animated.View style={{ transform: [{ rotate: turn }] }}>
                <PlusGlyph color={glyphColor} />
            </Animated.View>
        </PressableScale>
    );
}

/**
 * The deck list's add actions as labelled buttons above ＋. They rise out of ＋ one after another
 * over a dimmed backdrop while ＋ turns into ×, and sink back into it when the menu closes.
 */
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
                <PlusGlyph color={colors.white} />
            </PressableScale>
            <PopoverModal
                visible={visible}
                onRequestClose={onClose}
                onDismiss={handleDismiss}
                itemCount={actions.length}
            >
                <View style={styles.overlay}>
                    <PopoverBackdrop
                        style={[StyleSheet.absoluteFill, styles.backdrop]}
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
                        {actions.map(({ label, glyph, onPress }, index) => (
                            // The action nearest ＋ comes out first.
                            <PopoverItem key={glyph} index={actions.length - 1 - index} origin="bottom right">
                                <TouchableOpacity
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
                            </PopoverItem>
                        ))}
                    </View>
                    <MenuFab
                        style={[styles.fab, { bottom }]}
                        accent={colors.accent}
                        open={colors.accentHover}
                        glyphColor={colors.white}
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
