import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';

/**
 * Shown for an address no screen answers: a mistyped or outdated web link, or an unknown deep link.
 *
 * It replaces Expo Router's built-in page, which is English-only, ignores the app theme and links
 * to the developer route map. The only way on is the deck list, and it replaces the bad address so
 * the browser's Back button does not return to it.
 */
export default function NotFoundScreen() {
    const { l } = useI18n();
    const router = useRouter();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.icon} aria-hidden>🧭</Text>
                <Text style={styles.title} accessibilityRole="header">{l('Sayfa bulunamadı', 'Page not found')}</Text>
                <Text style={styles.description}>
                    {l(
                        'Bu adreste bir sayfa yok. Kartlarınız ve çalışma geçmişiniz etkilenmedi.',
                        'There is no page at this address. Your cards and review history are unaffected.',
                    )}
                </Text>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => router.replace('/decks')}
                    accessibilityRole="button"
                >
                    <Text style={styles.primaryButtonText}>{l('Destelere dön', 'Back to Decks')}</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
        icon: { fontSize: 56, marginBottom: Spacing.md },
        title: {
            fontSize: FontSize.xxl,
            fontWeight: '700',
            color: colors.accent,
            marginBottom: Spacing.sm,
            textAlign: 'center',
        },
        description: { fontSize: FontSize.lg, color: colors.textSecondary, textAlign: 'center', maxWidth: 520 },
        primaryButton: {
            marginTop: Spacing.xl,
            backgroundColor: colors.accent,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.xxl,
            borderRadius: 8,
        },
        primaryButtonText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    });
}
