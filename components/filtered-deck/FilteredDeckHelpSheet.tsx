import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { Text } from '../AppText';
import { useI18n } from '../../hooks/useI18n';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';
import { AppSheet } from '../ui/Sheet';
import { Radius, Type } from '../ui/tokens';

/** The filtered deck form's ? help, a bottom sheet over the form whose steps scroll. */
export default function FilteredDeckHelpSheet({ visible, onClose }: {
    visible: boolean;
    onClose: () => void;
}) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={l('Filtrelenmiş deste nasıl çalışır?', 'How does a filtered deck work?')}
            subtitle={l(
                'Filtrelenmiş deste, normal günlük sınırların dışında belirli kartlarla geçici bir çalışma oturumu oluşturur.',
                'A filtered deck creates a temporary study session with specific cards outside the normal daily limits.',
            )}
            closeButton
        >
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                <HelpStep
                    number="1"
                    title={l('Kartları belirleyin', 'Choose the cards')}
                    body={l(
                        'Arama alanı, Kartlarım ile aynı sorgu dilini kullanır. Deste, etiket ve kart durumunu birlikte yazabilirsiniz. Örnek: deck:"TUS Kartları" is:due -is:suspended',
                        'Search uses the same query language as Browse. You can combine deck, tag, and card-state terms. Example: deck:"TUS Kartları" is:due -is:suspended',
                    )}
                    styles={styles}
                />
                <HelpStep
                    number="2"
                    title={l('Limit ve sırayı ayarlayın', 'Set the limit and order')}
                    body={l(
                        'Limit, desteye alınacak en yüksek kart sayısıdır. Seçim sırası hem hangi kartların limite gireceğini hem de çalışma sırasını belirler.',
                        'The limit is the maximum number of cards gathered. The selected order controls both which cards fit the limit and their study order.',
                    )}
                    styles={styles}
                />
                <HelpStep
                    number="3"
                    title={l('İsterseniz ikinci filtre ekleyin', 'Optionally add a second filter')}
                    body={l(
                        'İki ayrı arama, limit ve sıralama grubunu tek destede birleştirir; örneğin vadesi gelmiş kartlarla az sayıda yeni kartı birlikte çalışabilirsiniz.',
                        'Combine two groups with separate searches, limits, and orders; for example, due cards plus a small number of new cards.',
                    )}
                    styles={styles}
                />
                <HelpStep
                    number="4"
                    title={l('Zamanlamayı seçin', 'Choose scheduling behavior')}
                    body={l(
                        'Yeniden zamanlama açıksa verdiğiniz yanıtlar kartın programını günceller. Kapalıysa deste önizleme modunda çalışır ve kartlar önceki zamanlamalarıyla ana destelerine döner.',
                        'With rescheduling on, your answers update each card’s schedule. With it off, the deck acts as a preview and cards return home with their prior schedule.',
                    )}
                    styles={styles}
                />
                <Notice tone="info" title={l('Bilmeniz gerekenler', 'Good to know')}>
                    {l(
                        'Askıdaki, gömülü veya başka bir filtrelenmiş destede bulunan kartlar eklenemez. Kartlar silinmez; ana desteleriyle bağlantılarını korur. Aynı ayarlarla kartları yeniden toplamak için desteyi yeniden oluşturabilirsiniz.',
                        'Suspended, buried, or already-filtered cards cannot be gathered. Cards are never deleted and keep their home-deck link. Rebuild the deck to gather cards again with the same settings.',
                    )}
                </Notice>
            </ScrollView>
            <Button label={l('Anladım', 'Got it')} onPress={onClose} />
        </AppSheet>
    );
}

type HelpStyles = ReturnType<typeof createStyles>;

function HelpStep({ number, title, body, styles }: { number: string; title: string; body: string; styles: HelpStyles }) {
    return (
        <View style={styles.step}>
            <View style={styles.number}><Text style={styles.numberText}>{number}</Text></View>
            <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepBody}>{body}</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        scroll: { flexShrink: 1 },
        content: { gap: Spacing.lg, paddingBottom: Spacing.lg },
        step: { flexDirection: 'row', gap: Spacing.md },
        number: {
            width: 28,
            height: 28,
            borderRadius: Radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
        },
        numberText: { color: colors.accent, fontWeight: '900' },
        stepCopy: { flex: 1, gap: 3 },
        stepTitle: { ...Type.caption, fontWeight: '800', color: colors.textPrimary },
        stepBody: { ...Type.caption, lineHeight: 20, color: colors.textSecondary },
    });
}
