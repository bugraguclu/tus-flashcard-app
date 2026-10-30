import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { Text } from '../AppText';
import { useI18n } from '../../hooks/useI18n';
import SwipeDismissSheet from '../SwipeDismissSheet';
import type { FilteredDeckOptionsStyles } from './filteredDeckOptionsStyles';

/** The filtered deck form's ? help, a bottom sheet over the form whose steps scroll. */
export default function FilteredDeckHelpSheet({ styles, bottomInset, onClose }: {
    styles: FilteredDeckOptionsStyles;
    bottomInset: number;
    onClose: () => void;
}) {
    const { l } = useI18n();
    return (
        <View style={styles.overlayLayer}>
            <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={onClose} />
            <SwipeDismissSheet
                style={[styles.helpCard, { paddingBottom: Math.max(bottomInset, Spacing.md) }]}
                onDismiss={onClose}
            >
                <View style={styles.helpHeader}>
                    <View style={styles.helpHeaderCopy}>
                        <Text style={styles.helpTitle}>{l('Filtrelenmiş deste nasıl çalışır?', 'How does a filtered deck work?')}</Text>
                        <Text style={styles.helpLead}>
                            {l(
                                'Filtrelenmiş deste, normal günlük sınırların dışında belirli kartlarla geçici bir çalışma oturumu oluşturur.',
                                'A filtered deck creates a temporary study session with specific cards outside the normal daily limits.',
                            )}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.iconButton} onPress={onClose}><Text style={styles.closeIcon}>×</Text></TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={styles.helpContent}>
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
                    <View style={styles.helpNotice}>
                        <Text style={styles.helpNoticeTitle}>{l('Bilmeniz gerekenler', 'Good to know')}</Text>
                        <Text style={styles.helpNoticeText}>
                            {l(
                                'Askıdaki, gömülü veya başka bir filtrelenmiş destede bulunan kartlar eklenemez. Kartlar silinmez; ana desteleriyle bağlantılarını korur. Aynı ayarlarla kartları yeniden toplamak için desteyi yeniden oluşturabilirsiniz.',
                                'Suspended, buried, or already-filtered cards cannot be gathered. Cards are never deleted and keep their home-deck link. Rebuild the deck to gather cards again with the same settings.',
                            )}
                        </Text>
                    </View>
                </ScrollView>
                <TouchableOpacity style={styles.saveButton} onPress={onClose}><Text style={styles.saveText}>{l('Anladım', 'Got it')}</Text></TouchableOpacity>
            </SwipeDismissSheet>
        </View>
    );
}

function HelpStep({ number, title, body, styles }: { number: string; title: string; body: string; styles: FilteredDeckOptionsStyles }) {
    return (
        <View style={styles.helpStep}>
            <View style={styles.helpNumber}><Text style={styles.helpNumberText}>{number}</Text></View>
            <View style={styles.helpStepCopy}>
                <Text style={styles.helpStepTitle}>{title}</Text>
                <Text style={styles.helpStepBody}>{body}</Text>
            </View>
        </View>
    );
}
