import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import BottomSheetModal from '../BottomSheetModal';
import { SheetScrollView } from '../SwipeDismissSheet';

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
        [l('Gerçek Hatırlama', 'True Retention'), l(
            'Bellek sınamalarının kaçının geçtiğini gösterir: Tekrar kaldı, Zor/İyi/Kolay geçti sayılır. Genç, cevaplandığı andaki aralığı 21 günden kısa; Olgun ise 21 gün ve üzeri kartlardır. Yeni kartların ilk öğrenme adımları ve elle ertelemeler sayılmaz. Çalışma günü sınırına göre bugün, dün, son 7, 30 ve 365 gün hesaplanır; seçilen dönemden bağımsızdır. Boş hücre — gösterir.',
            'Shows how many memory tests passed: Again counts as failed, Hard/Good/Easy as passed. Young cards had an interval under 21 days when answered; Mature cards 21 days or more. First learning steps of new cards and manual rescheduling are not counted. Today, yesterday and the last 7, 30 and 365 days follow the study-day rollover and ignore the period above. An empty cell shows —.',
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
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            sheetStyle={[styles.sheet, { backgroundColor: colors.bgCard }]}
            title={l('İstatistikler hakkında', 'About statistics')}
        >
            <SafeAreaView edges={['bottom']} style={styles.sheetContent}>
                <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                    {sections.map(([title, body]) => (
                        <View key={title} style={styles.section}>
                            <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
                            <Text style={[styles.body, { color: colors.textPrimary }]}>{body}</Text>
                        </View>
                    ))}
                </SheetScrollView>
            </SafeAreaView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    sheet: { width: '100%', maxWidth: 680, height: '88%', alignSelf: 'center', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sheetContent: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, gap: 20 },
    section: { gap: 6 },
    heading: { fontSize: 15, fontWeight: '700' },
    body: { fontSize: 15, lineHeight: 22 },
});
