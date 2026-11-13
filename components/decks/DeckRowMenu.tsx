import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { deckRowMenuLabel, type DeckRowMenuAction } from '../../lib/deckRowMenu';
import { usePopoverItemStyle } from '../Popover';
import { Type } from '../ui/tokens';

interface DeckRowMenuProps {
    visible: boolean;
    deckName: string;
    actions: DeckRowMenuAction[];
    onSelect: (action: DeckRowMenuAction) => void;
    onClose: () => void;
    /**
     * Runs once the menu has been dismissed. iOS cannot present the route, dialog or sheet chosen
     * in it until then, so the deck list holds the chosen action back until this is called.
     */
    onDismissed: () => void;
    backdropLabel?: string;
}

/**
 * A deck's ••• menu: a card centred over the dimmed deck list, with the deck path as its title and
 * one row per action. Its text follows the app's type roles.
 */
export default function DeckRowMenu({ visible, deckName, actions, onSelect, onClose, onDismissed, backdropLabel }: DeckRowMenuProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={backdropLabel}
                />
                <DeckRowMenuCard deckName={deckName} actions={actions} onSelect={onSelect} styles={styles} />
                <DismissedSignal onDismissed={onDismissed} />
            </View>
        </Modal>
    );
}

/**
 * Reports its own unmount. The modal's content stays mounted until the modal is gone (on iOS
 * React Native keeps a closing modal's content until UIKit has dismissed it), so this is the
 * moment the menu has left, on every platform.
 */
function DismissedSignal({ onDismissed }: { onDismissed: () => void }) {
    const latest = useRef(onDismissed);
    latest.current = onDismissed;
    useEffect(() => () => latest.current(), []);
    return null;
}

/**
 * The card itself, mounted afresh each time the menu opens: it grows in from 95% while the Modal
 * fades it in, and the scroll hint below is shown once per opening.
 */
function DeckRowMenuCard({ deckName, actions, onSelect, styles }: {
    deckName: string;
    actions: DeckRowMenuAction[];
    onSelect: (action: DeckRowMenuAction) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    const { l } = useI18n();
    const scrollRef = useRef<ScrollView>(null);
    const heights = useRef({ viewport: 0, content: 0, flashed: false });
    const growIn = usePopoverItemStyle();

    // On a short phone the last rows sit below the fold. Flashing the indicator once says the list
    // goes on; a row cut off at the card's edge alone left "Delete deck" looking absent.
    const flashWhenScrollable = () => {
        const { viewport, content, flashed } = heights.current;
        if (flashed || viewport === 0 || content <= viewport + 1) return;
        heights.current.flashed = true;
        scrollRef.current?.flashScrollIndicators();
    };

    return (
        <Animated.View style={[styles.card, growIn]} accessibilityViewIsModal>
            <Text style={styles.title}>{deckName.replaceAll('::', ' › ')}</Text>
            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.content}
                onLayout={(event) => {
                    heights.current.viewport = event.nativeEvent.layout.height;
                    flashWhenScrollable();
                }}
                onContentSizeChange={(_, height) => {
                    heights.current.content = height;
                    flashWhenScrollable();
                }}
            >
                {actions.map((action) => {
                    const label = deckRowMenuLabel(action, l);
                    return (
                        <TouchableOpacity
                            key={action}
                            style={styles.item}
                            onPress={() => onSelect(action)}
                            accessibilityRole="button"
                            accessibilityLabel={label}
                        >
                            <Text style={styles.itemText}>{label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </Animated.View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: colors.scrim,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        card: {
            width: '100%',
            maxWidth: 520,
            maxHeight: '88%',
            zIndex: 1,
            overflow: 'hidden',
            backgroundColor: colors.badgeNewBg,
            borderRadius: 28,
            paddingTop: Spacing.xl,
            ...Shadows.lg,
        },
        title: {
            paddingHorizontal: 30,
            paddingBottom: Spacing.sm,
            ...Type.title,
            lineHeight: 24,
            color: colors.textPrimary,
        },
        scroll: { flexGrow: 0 },
        content: { paddingHorizontal: 30, paddingBottom: Spacing.xl },
        // Every row stays a full touch target; a larger text size grows the rows and the list scrolls.
        item: { minHeight: 48, justifyContent: 'center' },
        itemText: { fontSize: FontSize.md, lineHeight: 20, fontWeight: '500', color: colors.textPrimary },
    });
}
