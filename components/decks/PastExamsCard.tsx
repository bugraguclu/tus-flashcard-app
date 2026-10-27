import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { alert, confirm } from '../../lib/confirm';
import { readOnlyTabMessage } from '../../lib/db';
import { formatCount } from '../../lib/i18n';
import { PAST_EXAM_ROOT_DECK, installPastExams, type PastExamManifest } from '../../lib/pastExams';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

/** A clipboard with ticked lines: TUSBuddy's mark for its past-exam list. */
function ExamGlyph({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Rect x={4.5} y={4} width={15} height={17} rx={2.5} fill="none" stroke={color} strokeWidth={1.9} />
            <Path d="M9 4V3h6v1" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M8 10l1.2 1.2L11.5 9M13.5 10.2H16M8 15l1.2 1.2 2.3-2.2M13.5 15.2H16" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

interface PastExamsCardProps {
    /** Counts of the pack this build carries. */
    manifest: PastExamManifest;
    /** Called once the exams are in the collection, so the deck list can show them. */
    onInstalled: () => void;
}

/**
 * Offers the bundled past TUS exams in the deck list, where they will appear once added. It
 * stands in the list until the exams are installed; deleting their decks brings it back.
 */
export default function PastExamsCard({ manifest, onInstalled }: PastExamsCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { l, locale } = useI18n();
    const [installing, setInstalling] = useState(false);
    const exams = manifest.exams.length;
    const questions = formatCount(manifest.questions, locale);
    const years = `${manifest.firstYear}–${manifest.lastYear}`;

    const install = async () => {
        setInstalling(true);
        try {
            const result = await installPastExams();
            onInstalled();
            alert(
                l('Çıkmış TUS Denemeleri eklendi', 'Past TUS exams added'),
                l(
                    `${formatCount(result.added, 'tr')} soru, “${result.rootDeckName}” destesinde ${exams} sınav olarak hazır. Bir sınavı açıp seçeneğe dokunarak çözmeye başlayabilirsiniz.`,
                    `${formatCount(result.added, 'en')} questions are ready as ${exams} exams in “${result.rootDeckName}”. Open an exam and tap an option to answer.`,
                ),
            );
        } catch (error) {
            console.warn('[PastExams] install failed:', error);
            alert(
                l('Sorular eklenemedi', 'Questions could not be added'),
                l(
                    `Destelerinizde bir değişiklik yapılmadı. ${userFacingErrorMessage(error instanceof Error ? error.message : String(error))}`,
                    `Your decks were not changed. ${userFacingErrorMessage(error instanceof Error ? error.message : String(error))}`,
                ),
            );
        } finally {
            setInstalling(false);
        }
    };

    const ask = () => {
        if (installing) return;
        const readOnly = readOnlyTabMessage();
        if (readOnly) {
            alert(l('Sorular eklenemedi', 'Questions could not be added'), readOnly);
            return;
        }
        confirm(
            l('Çıkmış TUS Denemeleri eklensin mi?', 'Add the past TUS exams?'),
            l(
                `${years} arasındaki ${exams} TUS sınavının ${questions} sorusu “${PAST_EXAM_ROOT_DECK}” altında, her sınav ayrı bir deste olarak eklenir. Kendi destelerinize dokunulmaz.`,
                `The ${questions} questions of ${exams} TUS exams (${years}) are added under “${PAST_EXAM_ROOT_DECK}”, one deck per exam. Your own decks are not touched.`,
            ),
            () => { void install(); },
        );
    };

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={ask}
            disabled={installing}
            accessibilityRole="button"
            accessibilityState={{ busy: installing }}
            accessibilityLabel={installing
                ? l('Çıkmış TUS Denemeleri ekleniyor', 'Adding past TUS exams')
                : l(
                    `${PAST_EXAM_ROOT_DECK}, ${exams} sınav, ${questions} soru, eklemek için dokunun`,
                    `${PAST_EXAM_ROOT_DECK}, ${exams} exams, ${questions} questions, tap to add`,
                )}
        >
            <View style={styles.icon}>
                {installing
                    ? <ActivityIndicator size="small" color={colors.streak} />
                    : <ExamGlyph color={colors.streak} size={22} />}
            </View>
            <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>{PAST_EXAM_ROOT_DECK}</Text>
                <Text style={styles.meta} numberOfLines={2}>
                    {installing
                        ? l('Sorular ekleniyor…', 'Adding questions…')
                        : l(`${exams} sınav · ${questions} soru · ${years}`, `${exams} exams · ${questions} questions · ${years}`)}
                </Text>
            </View>
            {!installing && (
                <View style={styles.pill}>
                    <Text style={styles.pillText}>{l('Ekle', 'Add')}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        card: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: Spacing.sm,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.streak,
            borderStyle: 'dashed',
            borderRadius: BorderRadius.md,
            minHeight: 72,
            ...Shadows.sm,
        },
        icon: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.streakBg,
        },
        copy: { flex: 1, marginHorizontal: Spacing.md },
        name: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        meta: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
        pill: {
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.streak,
        },
        pillText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
    });
}
