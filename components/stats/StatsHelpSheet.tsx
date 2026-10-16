import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import SwipeDismissSheet from '../SwipeDismissSheet';

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
            'İkisi de güncel kart durumunu gösterir. Seçilen dönem, tekrar aralıklarının yalnızca üst sınırını belirler; kart sayılarını değiştirmez.',
            'Both show current card state. The period only limits the longest review interval shown; it does not change card counts.',
        )],
        [l('Grafikleri kullanma', 'Using charts'), l(
            'Ayrıntı için sütuna dokunun; kapatmak için yeniden dokunun. Tekrarlar ve Saatlik dağılım üzerinde yana kaydırarak değerleri gezebilirsiniz. Eklenenler sütununa dokunmak o kartları açar.',
            'Tap a bar for details and again to dismiss. Slide across Reviews and Hourly Breakdown to inspect values. Tap an Added bar to open its cards.',
        )],
    ];
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
                <SwipeDismissSheet active={visible} onDismiss={onClose} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
                    <SafeAreaView edges={['bottom']} style={styles.sheetContent}>
                        <View style={styles.header}>
                            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{l('İstatistikler hakkında', 'About statistics')}</Text>
                            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={l('Bilgiyi kapat', 'Close information')}>
                                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{l('Bitti', 'Done')}</Text>
                            </Pressable>
                        </View>
                        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                            {sections.map(([title, body]) => (
                                <View key={title} style={styles.section}>
                                    <Text style={[styles.heading, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
                                    <Text style={[styles.body, { color: colors.textPrimary }]}>{body}</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </SafeAreaView>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { width: '100%', maxWidth: 680, height: '88%', alignSelf: 'center', paddingTop: 40, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sheetContent: { flex: 1 },
    scroll: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8 },
    title: { flex: 1, fontSize: 18, fontWeight: '700' },
    close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, gap: 20 },
    section: { gap: 6 },
    heading: { fontSize: 15, fontWeight: '700' },
    body: { fontSize: 15, lineHeight: 22 },
});
