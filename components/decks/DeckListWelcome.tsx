import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatCount } from '../../lib/i18n';
import CardsGlyph from '../CardsGlyph';
import PencilGlyph from '../PencilGlyph';
import DeckOverflowGlyph from '../DeckOverflowGlyph';
import { CloseIcon } from '../ui/icons';
import { ListRow } from '../ui/Rows';
import { Radius } from '../ui/tokens';

interface DeckListWelcomeProps {
    /** Offer the TUS pack: false once the full pack is installed. */
    showCatalog: boolean;
    catalogCardCount: number;
    onOpenCatalog: () => void;
    onAddCard: () => void;
    onImport: () => void;
    onDismiss: () => void;
}

/**
 * The deck list's first-run card (docs/user-guide/in-app/01-decks.md, help.decks.firstRun.card):
 * the three ways to get cards, shown until the learner has a card of their own or closes it.
 */
export default function DeckListWelcome({
    showCatalog,
    catalogCardCount,
    onOpenCatalog,
    onAddCard,
    onImport,
    onDismiss,
}: DeckListWelcomeProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { l, locale } = useI18n();
    const cards = formatCount(catalogCardCount, locale);

    const action = (key: string, glyph: ReactNode, title: string, subtitle: string, onPress: () => void) => (
        <ListRow key={key} icon={glyph} title={title} summary={subtitle} onPress={onPress} />
    );

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header">{l('Hoş geldiniz', 'Welcome')}</Text>
                <Pressable
                    style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
                    onPress={onDismiss}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={l('Hoş geldiniz kartını kapat', 'Close the welcome card')}
                >
                    <CloseIcon color={colors.textMuted} size={20} />
                </Pressable>
            </View>
            <Text style={styles.text}>
                {showCatalog
                    ? l(
                        'Çalışmaya başlamak için kart gerekir. Hazır TUS paketini ücretsiz açabilir, kendi kartınızı yazabilir veya Anki’den bir deste getirebilirsiniz.',
                        'You need cards to start studying. Unlock the ready-made TUS pack for free, write your own card, or bring in a deck from Anki.',
                    )
                    : l(
                        'TUS Kartları çalışmaya hazır: bir desteye dokunmanız yeterli. Kendi kartınızı da yazabilir veya Anki’den bir deste getirebilirsiniz.',
                        'TUS Kartları is ready to study: just tap a deck. You can also write your own card or bring in a deck from Anki.',
                    )}
            </Text>
            <View style={styles.actions}>
                {showCatalog ? action(
                    'catalog',
                    <CardsGlyph color={colors.accent} size={22} />,
                    l('TUS paketini aç', 'Unlock the TUS pack'),
                    l(`${cards} hazır kart, ücretsiz`, `${cards} ready-made cards, free`),
                    onOpenCatalog,
                ) : null}
                {action(
                    'add',
                    <PencilGlyph color={colors.accent} size={22} />,
                    l('Kart ekle', 'Add note'),
                    l('Kendi kartınızı yazın', 'Write your own card'),
                    onAddCard,
                )}
                {action(
                    'import',
                    <DeckOverflowGlyph kind="import" color={colors.accent} size={22} />,
                    l('İçe aktar', 'Import'),
                    l('.apkg, .colpkg veya metin dosyası', '.apkg, .colpkg or text file'),
                    onImport,
                )}
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // As wide as the locked TUS row above it, so the two read as one block of the list.
        card: {
            marginTop: Spacing.sm,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.xs,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.borderLight,
            borderRadius: Radius.inset,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.xs,
        },
        title: { flex: 1, paddingTop: Spacing.xs, fontSize: FontSize.lg, fontWeight: '600', color: colors.textPrimary },
        close: { width: 44, height: 44, marginTop: -Spacing.sm, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
        text: {
            paddingHorizontal: Spacing.lg,
            fontSize: FontSize.sm,
            lineHeight: 18,
            color: colors.textSecondary,
        },
        actions: {
            marginTop: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        closePressed: { backgroundColor: colors.accentLight },
    });
}
