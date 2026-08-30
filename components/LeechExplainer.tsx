import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { BorderRadius, FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';

type LeechExplainerProps = {
    context: 'settings' | 'card';
};

/**
 * User-facing explanation for Anki's technical "leech" concept.
 * The stored `leech` tag is intentionally unchanged for Anki/APKG compatibility.
 */
export default function LeechExplainer({ context }: LeechExplainerProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const reasons = [
        l('Kart çok fazla çalışma zamanı tüketiyor.', 'The card is taking too much study time.'),
        l('Soru veya cevap yeterince açık olmayabilir.', 'The question or answer may not be clear enough.'),
        l(
            'Kart çok uzun, belirsiz veya aynı anda birden fazla bilgi soruyor olabilir.',
            'The card may be too long, ambiguous, or testing multiple facts at once.',
        ),
        l('Konu henüz yeterince öğrenilmemiş olabilir.', 'You may not have learned the underlying topic well enough yet.'),
    ];

    return (
        <View style={styles.container} accessibilityRole="summary">
            <View style={styles.titleRow}>
                <Text style={styles.icon}>💡</Text>
                <Text style={styles.title}>{l('Sürekli Unutulan Kart nedir?', 'What is a Leech?')}</Text>
            </View>
            <Text style={styles.body}>
                {context === 'card'
                    ? l(
                        'Bu kart sık sık unutulduğu için “Sürekli Unutulan Kart” olarak işaretlendi.',
                        'This card was marked as a Leech because it has been forgotten repeatedly.',
                    )
                    : l(
                        'Bir kart, belirlediğiniz unutma sayısına ulaştığında “Sürekli Unutulan Kart” olarak işaretlenir.',
                        'A card is marked as a Leech when it reaches the number of lapses you set.',
                    )}
            </Text>
            <Text style={styles.lead}>{l('Bu işaret genellikle şunlardan birini gösterir:', 'This usually indicates one of the following:')}</Text>
            <View style={styles.list}>
                {reasons.map((reason) => (
                    <View key={reason} style={styles.listRow}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.reason}>{reason}</Text>
                    </View>
                ))}
            </View>
            <View style={styles.recommendation}>
                <Text style={styles.recommendationText}>
                    {l(
                        'Öneri: Soruyu ve cevabı kısaltın, kartı tek bir bilgiye bölün veya konuyu yeniden çalışın. Düzeltene kadar kartı askıya alabilirsiniz.',
                        'Suggestion: Shorten the question and answer, split the card into one fact per card, or revisit the topic. You can suspend the card until it is improved.',
                    )}
                </Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            marginTop: Spacing.sm,
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.btnHard,
            backgroundColor: colors.btnHardBg,
            gap: Spacing.sm,
        },
        titleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
        },
        icon: { fontSize: FontSize.md },
        title: {
            flex: 1,
            fontSize: FontSize.md,
            lineHeight: 21,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        body: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textSecondary,
        },
        lead: {
            fontSize: FontSize.sm,
            lineHeight: 19,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        list: { gap: 4 },
        listRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: Spacing.xs,
        },
        bullet: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textSecondary,
        },
        reason: {
            flex: 1,
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textSecondary,
        },
        recommendation: {
            marginTop: 2,
            paddingTop: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.btnHard,
        },
        recommendationText: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            fontWeight: '600',
            color: colors.textPrimary,
        },
    });
}
