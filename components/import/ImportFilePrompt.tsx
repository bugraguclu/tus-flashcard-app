import { Text, TouchableOpacity, View } from 'react-native';
import type { ImportStyles } from './importStyles';

/** What the import screen shows before a file is chosen: the files it takes and the picker. */
export default function ImportFilePrompt({ styles, l, onPick }: {
    styles: ImportStyles;
    l: (tr: string, en: string) => string;
    onPick: () => void;
}) {
    return (
        <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{l('İçe aktarılacak dosyayı seçin', 'Choose a file to import')}</Text>
            <Text style={styles.emptyBody}>.apkg · .colpkg · .csv · .tsv · .txt</Text>
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
