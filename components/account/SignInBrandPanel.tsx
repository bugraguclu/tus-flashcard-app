import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { useThemeColors, useIsDarkTheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { BrandMark } from './AuthControls';
import { CheckGlyph } from './AccountGlyphs';
import { useAccountPalette } from './accountPalette';

/**
 * The left half of the sign-in page in a wide browser window, after the diet app's split layout.
 * A phone never shows it: there the form is the whole screen.
 */
export default function SignInBrandPanel() {
    const { l } = useI18n();
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const palette = useAccountPalette();
    const styles = useMemo(() => StyleSheet.create({
        panel: {
            flex: 1,
            maxWidth: 620,
            paddingHorizontal: 56,
            paddingVertical: 44,
            backgroundColor: isDark ? colors.bgSidebar : colors.bgPrimary,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: colors.border,
            justifyContent: 'space-between',
        },
        brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        brandName: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
        copy: { gap: 20, maxWidth: 460 },
        headline: { fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1.4, color: colors.textPrimary },
        headlineAccent: { color: palette.link },
        lead: { fontSize: 17, lineHeight: 26, color: colors.textSecondary },
        features: { gap: 14, marginTop: 8 },
        feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        featureIcon: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isDark ? colors.accentLight : colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
        },
        featureText: { fontSize: 15, color: colors.textPrimary },
        footnote: { fontSize: 13, color: colors.textSecondary },
    }), [colors, isDark, palette.link]);

    const features = [
        l('Aralıklı tekrarla kalıcı öğrenme', 'Lasting recall with spaced repetition'),
        l('Kronometre, çalışma planı ve takvim', 'Stopwatch, study plans and calendar'),
        l('Anki paketlerini içe ve dışa aktarma', 'Import and export Anki packages'),
    ];

    return (
        <View style={styles.panel}>
            <View style={styles.brand}>
                <BrandMark size={44} />
                <Text style={styles.brandName}>TusAnkiM</Text>
            </View>
            <View style={styles.copy}>
                <Text style={styles.headline} accessibilityRole="header">
                    {l('Her gün biraz daha.', 'A little more every day.')}
                    {'\n'}
                    <Text style={styles.headlineAccent}>{l('TUS’a hazırlanın.', 'Get ready for TUS.')}</Text>
                </Text>
                <Text style={styles.lead}>
                    {l(
                        'Kartlarınızı çalışın, ilerlemenizi görün, planınızı kurun. Kartlarınız ve çalışma geçmişiniz her zaman cihazınızda kalır.',
                        'Study your cards, see your progress, plan your days. Your cards and study history always stay on your device.',
                    )}
                </Text>
                <View style={styles.features}>
                    {features.map((feature) => (
                        <View key={feature} style={styles.feature}>
                            <View style={styles.featureIcon}>
                                <CheckGlyph color={palette.link} size={15} />
                            </View>
                            <Text style={styles.featureText}>{feature}</Text>
                        </View>
                    ))}
                </View>
            </View>
            <Text style={styles.footnote}>
                {l('Anki veya Ankitects ile bağlantılı değildir.', 'Not affiliated with Anki or Ankitects.')}
            </Text>
        </View>
    );
}
