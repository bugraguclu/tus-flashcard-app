import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatCount } from '../../lib/i18n';
import { BKA_MANIFEST } from '../../lib/bkaManifest';
import CardsGlyph from '../CardsGlyph';
import PencilGlyph from '../PencilGlyph';
import DeckOverflowGlyph from '../DeckOverflowGlyph';
import { Button } from '../ui/Button';
import { ListRow } from '../ui/Rows';
import { Radius, Type } from '../ui/tokens';

// The launch screen's mark: the page opens on the image the splash just showed.
const APP_MARK = require('../../assets/app-mark.png');

/** Where the learner goes from the welcome page: a first screen, or straight to the deck list. */
export type WelcomeChoice = 'catalog' | 'editor' | 'import' | 'signIn' | 'decks';

/**
 * The one-time welcome page a new installation opens on (help.decks.firstRun.page): the app's
 * mark and one sentence on what it is, then the three ways to get cards and Skip at the foot.
 * Every way out leaves the page for good.
 */
export default function WelcomeScreen({ onChoose, offerSignIn }: {
    onChoose: (choice: WelcomeChoice) => void;
    /** Builds with accounts show a quiet sign-in link; an account is never needed to study. */
    offerSignIn: boolean;
}) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { l, locale } = useI18n();
    const cards = formatCount(BKA_MANIFEST.totals.cards, locale);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.bgPrimary }}
            contentContainerStyle={[
                styles.content,
                { paddingTop: insets.top + Spacing.lg, paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.xs },
            ]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.column}>
                {/* The opening sits in the middle of the space above the choices. */}
                <View style={styles.hero}>
                    <Image source={APP_MARK} style={styles.mark} accessibilityIgnoresInvertColors />
                    <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
                        {l('Hoş geldiniz', 'Welcome')}
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {l(
                            'TUS’a kartlarla çalışın. Her kart, tam unutmak üzereyken yeniden karşınıza çıkar.',
                            'Study for TUS with flashcards. Each card comes back just before you would forget it.',
                        )}
                    </Text>
                </View>

                <View style={styles.choices}>
                    <Text style={[Type.caption, styles.choicesLabel, { color: colors.textSecondary }]} accessibilityRole="header">
                        {l('Nasıl başlamak istersiniz?', 'How would you like to start?')}
                    </Text>
                    <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                        <ListRow
                            icon={<CardsGlyph color={colors.accent} size={22} />}
                            title={l('Hazır TUS kartları', 'Ready-made TUS cards')}
                            summary={l(`${cards} kart, ücretsiz`, `${cards} cards, free`)}
                            onPress={() => onChoose('catalog')}
                        />
                        <ListRow
                            icon={<PencilGlyph color={colors.accent} size={22} />}
                            title={l('Kendi kartımı yazayım', 'Write my own card')}
                            summary={l('Soru ve cevabı siz girin', 'Type in a question and its answer')}
                            onPress={() => onChoose('editor')}
                        />
                        <ListRow
                            icon={<DeckOverflowGlyph kind="import" color={colors.accent} size={22} />}
                            title={l('Anki’den deste getir', 'Bring a deck from Anki')}
                            summary={l('.apkg, .colpkg veya metin dosyası', '.apkg, .colpkg or text file')}
                            onPress={() => onChoose('import')}
                        />
                    </View>
                </View>

                <View style={styles.footer}>
                    <Button variant="plain" label={l('Şimdilik geç', 'Skip for now')} onPress={() => onChoose('decks')} />
                    {offerSignIn ? (
                        <Button
                            variant="plain"
                            size="compact"
                            label={l('Hesabınız var mı? Giriş yapın', 'Have an account? Sign in')}
                            onPress={() => onChoose('signIn')}
                        />
                    ) : null}
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { flexGrow: 1, paddingHorizontal: Spacing.xxl },
    column: { flexGrow: 1, width: '100%', maxWidth: 420, alignSelf: 'center' },
    hero: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: Spacing.xxl },
    mark: { width: 120, height: 120, marginBottom: Spacing.xxl },
    title: { fontSize: FontSize.title, lineHeight: 38, fontWeight: '700', textAlign: 'center' },
    subtitle: { fontSize: FontSize.lg, lineHeight: 23, textAlign: 'center', marginTop: Spacing.md, maxWidth: 320 },
    choices: { gap: Spacing.sm },
    choicesLabel: { fontWeight: '600' },
    group: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
    footer: { paddingTop: Spacing.xxl, gap: Spacing.xs, alignItems: 'center' },
});
