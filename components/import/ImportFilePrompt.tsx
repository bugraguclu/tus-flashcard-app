import { Text, TouchableOpacity, View } from 'react-native';
import type { ImportStyles } from './importStyles';

/** What the import screen shows before a file is chosen: the formats it takes and the picker. */
export default function ImportFilePrompt({ styles, l, onPick }: {
    styles: ImportStyles;
    l: (tr: string, en: string) => string;
    onPick: () => void;
}) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{l('İçe aktarılacak dosyayı seçin', 'Choose a file to import')}</Text>
            <Text style={styles.emptyBody}>
                {l(
                    'Dosyanın türü uzantısından anlaşılır ve içe aktarma seçenekleri ona göre açılır.',
                    'The file type is taken from the extension, and the import options open to match it.',
                )}
            </Text>
            <View style={styles.formatList}>
                {([
                    ['.apkg', l('Anki deste paketi — deste ağacı, not türleri, medya ve isteğe bağlı çalışma geçmişi.', 'Anki deck package — deck tree, note types, media and optional review history.')],
                    ['.colpkg', l('Anki koleksiyon paketi — mevcut koleksiyonun yerine geçer.', 'Anki collection package — replaces the current collection.')],
                    ['.csv / .tsv / .txt', l('Metin dosyası — alan eşlemesi ve #başlık satırları desteklenir.', 'Text file — field mapping and #header lines are supported.')],
                ] as const).map(([name, description]) => (
                    <View key={name} style={styles.formatItem}>
                        <Text style={styles.formatName}>{name}</Text>
                        <Text style={styles.formatDescription}>{description}</Text>
                    </View>
                ))}
            </View>
            <TouchableOpacity
                style={styles.primaryButton}
                onPress={onPick}
                accessibilityRole="button"
                accessibilityLabel={l('Dosya seç', 'Choose file')}
            >
                <Text style={styles.primaryButtonText}>{l('Dosya seç', 'Choose File')}</Text>
            </TouchableOpacity>
        </View>
    );
}
