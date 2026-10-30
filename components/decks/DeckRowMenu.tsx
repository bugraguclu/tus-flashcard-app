import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { deckRowMenuLabel, type DeckRowMenuAction } from '../../lib/deckRowMenu';

/** A deck's ••• menu card: the deck path as its title and one row per action. */
export default function DeckRowMenu({ deckName, actions, onSelect }: {
    deckName: string;
    actions: DeckRowMenuAction[];
    onSelect: (action: DeckRowMenuAction) => void;
}) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const scrollRef = useRef<ScrollView>(null);
    const heights = useRef({ viewport: 0, content: 0, flashed: false });

    // On a short phone the last rows sit below the fold. Flashing the indicator once says the list
    // goes on; a row cut off at the card's edge alone left "Delete deck" looking absent.
    const flashWhenScrollable = () => {
        const { viewport, content, flashed } = heights.current;
        if (flashed || viewport === 0 || content <= viewport + 1) return;
        heights.current.flashed = true;
        scrollRef.current?.flashScrollIndicators();
    };

    return (
        <View style={styles.card} accessibilityViewIsModal>
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
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
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
            fontSize: 20,
            lineHeight: 27,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        scroll: { flexGrow: 0 },
        content: { paddingHorizontal: 30, paddingBottom: Spacing.xl },
        // Twelve rows fit a 6.1" iPhone at the designed text size, and every row stays a full touch
        // target; a larger text size grows the rows and the list scrolls.
        item: { minHeight: 54, justifyContent: 'center' },
        itemText: { fontSize: 17, lineHeight: 23, fontWeight: '400', color: colors.textPrimary },
    });
}
