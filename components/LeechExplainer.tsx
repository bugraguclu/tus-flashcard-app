import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './AppText';
import { FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';
import { Notice } from './ui/Feedback';

/** A light bulb, drawn like the kit's line icons: the notice explains rather than alarms. */
function TipIcon({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2v.5h5V16c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3ZM9.5 19h5M10.5 21.5h3"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

type LeechExplainerProps = {
    context: 'settings' | 'card';
};

/**
 * User-facing explanation for Anki's technical "leech" concept, as a warning notice.
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
        <Notice
            tone="warning"
            icon={<TipIcon color={colors.warning} />}
            title={l('Sürekli Unutulan Kart nedir?', 'What is a Leech?')}
            style={styles.notice}
        >
            <View style={styles.content}>
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
        </Notice>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        notice: { marginBottom: Spacing.md },
        content: { gap: Spacing.sm },
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
            borderTopColor: colors.warning,
        },
        recommendationText: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            fontWeight: '600',
            color: colors.textPrimary,
        },
    });
}
