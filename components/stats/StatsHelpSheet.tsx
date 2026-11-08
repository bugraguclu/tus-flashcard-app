import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { AppSheet } from '../ui/Sheet';

/** Keep chart definitions available without repeating paragraphs throughout the page. */
export default function StatsHelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const sections = [
        [l('Deste ve dönem', 'Deck and period'), l(
            'Deste ve zaman aralığı üstten seçilir. Bugün ve çalışma serisi bu dönemden bağımsızdır.',
            'Choose a deck and period at the top. Today and the study streak are independent of that period.',
        )],
        [l('Gelecek vadeler', 'Future Due'), l(
            'Yeni kart öğrenmediğiniz ve kart unutmadığınız varsayımıyla beklenen tekrarlar. Gecikenlerle seçeneği vadesi geçmiş kartları da içerir.',
            'Expected reviews assuming no new cards are learned and none are forgotten. With backlog includes overdue cards.',
        )],
        [l('Tekrarlar ve cevaplar', 'Reviews and answers'), l(
            'Tekrarlar, kart türüne göre cevap sayısını veya çalışma süresini gösterir. Doğruluk, Tekrar dışındaki cevapların oranıdır.',
            'Reviews shows answer counts or study time by card type. Accuracy is the share of answers other than Again.',
        )],
        [l('Saatlik dağılım', 'Hourly Breakdown'), l(
            'Saatlere göre cevap sayısı ve doğru cevap oranı.',
            'Answer counts and accuracy by hour of day.',
        )],
        [l('Aralıklar ve kart sayıları', 'Intervals and card counts'), l(
            'İkisi de güncel kart durumunu gösterir. Seçilen dönem, tekrar aralıklarının yalnızca üst sınırını belirler (daha uzun aralıktaki kartlar grafiğin altında sayılır); kart sayılarını değiştirmez.',
            'Both show current card state. The period only caps the review intervals drawn (cards with longer intervals are counted under the chart); it does not change card counts.',
        )],
        [l('Grafikleri kullanma', 'Using charts'), l(
            'Ayrıntı için sütuna dokunun; kapatmak için yeniden dokunun. Grafiğin üzerinde parmağınızı yana kaydırarak değerleri gezebilirsiniz. Eklenenler sütununa dokunmak o kartları açar.',
            'Tap a bar for details and again to dismiss. Slide across a chart to inspect values. Tap an Added bar to open its cards.',
        )],
    ];
    return (
        <AppSheet visible={visible} onClose={onClose} title={l('İstatistikler hakkında', 'About statistics')} closeButton>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                {sections.map(([title, body]) => (
                    <View key={title} style={styles.section}>
                        <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
                        <Text style={[styles.body, { color: colors.textPrimary }]}>{body}</Text>
                    </View>
                ))}
            </ScrollView>
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    scroll: { flexShrink: 1 },
    content: { paddingTop: Spacing.xs, paddingBottom: Spacing.lg, gap: Spacing.xl },
    section: { gap: 6 },
    heading: { fontSize: 15, fontWeight: '700' },
    body: { fontSize: 15, lineHeight: 22 },
});
