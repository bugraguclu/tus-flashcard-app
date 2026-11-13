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
            'Deste ve zaman aralığı üstten seçilir; bir deste seçince alt desteleri de dahil olur. Bugün, çalışma serisi, kart sayıları ve deste satırları dönemden etkilenmez. Çalışma serisi her zaman tüm koleksiyonu gösterir.',
            'Choose a deck and period at the top; a deck includes its subdecks. Today, the study streak, card counts and the deck rows do not depend on the period. The study streak always covers the whole collection.',
        )],
        [l('Gelecek vadeler', 'Future Due'), l(
            'Yeni kart öğrenmediğiniz ve kart unutmadığınız varsayımıyla beklenen tekrarlar; seçilen dönem kadar ileriye bakar. Gecikenlerle vadesi geçmiş kartları da gösterir. Genç kartların aralığı 21 günden kısadır, olgunlarınki 21 gün veya daha uzundur. Günlük yük, her gün ortalama kaç tekrar geleceğinin tahminidir.',
            'Expected reviews assuming no new cards are learned and none are forgotten; looks as far ahead as the selected period. With backlog also shows overdue cards. Young cards have intervals under 21 days, mature cards 21 days or more. Daily load estimates how many reviews come up per day.',
        )],
        [l('Tekrarlar', 'Reviews'), l(
            'Verdiğiniz cevapları veya cevaplara harcadığınız süreyi kart türüne göre gösterir; her sütun bir gün, hafta, ay veya yıldır. Filtreli, filtrelenmiş destelerde ve özel çalışmada vadesinden önce tekrarlanan ya da önizlenen kartların cevaplarıdır. Günlük ortalama bütün günlere, Çalışılan günlerde yalnızca çalıştığınız günlere bölünür.',
            'Shows the answers you gave, or the time spent on them, by card type, one bar per day, week, month or year. Filtered means answers in filtered decks and Custom Study to cards that were not yet due or were previewed. Daily average divides by every day; On days studied by the days you studied only.',
        )],
        [l('Saatlik dağılım', 'Hourly Breakdown'), l(
            'Saate göre cevap sayısı ve Tekrar dışındaki cevapların oranı. Oran çizgisi %0’dan değil, en düşük saatin biraz altından başlar. En başarılı saat için o saatte en az 10 cevap ve bütün cevapların en az %3’ü gerekir. Filtreli cevaplar sayılmaz.',
            'Answers by hour and the share that were not Again. The rate line starts just below the lowest hour, not at 0%. An hour needs at least 10 answers, and at least 3% of all answers, to be the strongest hour. Filtered answers are left out.',
        )],
        [l('Tekrar aralıkları', 'Review Intervals'), l(
            'Tekrar kartlarınızın şu anki aralıkları. Grafik seçilen dönemden uzun aralıkları göstermez, onların sayısını altına yazar; Ortalama aralık ve En uzun aralık ise bütün tekrar kartlarını sayar.',
            'The current intervals of your review cards. The chart leaves out intervals longer than the period and gives their count beneath it; Average interval and Longest interval count every review card.',
        )],
        [l('Grafikleri kullanma', 'Using charts'), l(
            'Ayrıntı için sütuna dokunun; kapatmak için yeniden dokunun. Parmağınızı yana kaydırarak sütundan sütuna geçebilirsiniz. Eklenenler’de bir sütuna dokunmak o günlerde eklenen kartları Kartlarım’da açar; ayrıntısını görmek için üzerinde kaydırın.',
            'Tap a bar for details and again to dismiss, or slide sideways to move from bar to bar. On Added, tapping a bar opens the cards added then in the Card Browser; slide across it for details.',
        )],
    ];
    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={l('İstatistikler hakkında', 'About statistics')}
            closeButton
            closeLabel={l('Bilgiyi kapat', 'Close information')}
        >
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
