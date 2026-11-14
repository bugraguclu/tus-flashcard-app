import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { returnToDeckList } from '../lib/backNavigation';

/**
 * Shown for an address no screen answers: a mistyped or outdated web link, or an unknown deep link.
 *
 * It replaces Expo Router's built-in page, which is English-only, ignores the app theme and links
 * to the developer route map. The only way on is the deck list the app already has: this page is
 * closed (or, opened on its own, swapped for the deck list), so the browser's Back button does not
 * return to the bad address.
 */
export default function NotFoundScreen() {
    const { l } = useI18n();
    const router = useRouter();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <EmptyState
                    title={l('Sayfa bulunamadı', 'Page not found')}
                    body={l(
                        'Bu adreste bir sayfa yok. Kartlarınız ve çalışma geçmişiniz etkilenmedi.',
                        'There is no page at this address. Your cards and review history are unaffected.',
                    )}
                    action={<Button label={l('Destelere dön', 'Back to Decks')} onPress={() => returnToDeckList(router)} />}
                    style={styles.message}
                />
            </View>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        message: { maxWidth: 520 },
    });
}
