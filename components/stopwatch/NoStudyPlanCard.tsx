import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { ClockIcon } from './StopwatchIcons';
import { timelineStyles } from './timelineStyles';

interface NoStudyPlanCardProps {
    /** Whether the learner has plans for other days; then today only has none. */
    hasPlans: boolean;
    /** Opens the "Çalışma Planlama" wizard, or the plans when there are some. */
    onPress: () => void;
}

/**
 * Today's timeline entry while no plan falls on today, as TUSBuddy shows it: a red clock on the
 * line and a card that says so, with a button that creates a plan — or, when the learner has
 * plans for other days, opens them.
 */
function NoStudyPlanCard({ hasPlans, onPress }: NoStudyPlanCardProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);

    return (
        <View style={styles.row}>
            <View style={styles.gutter}>
                <View style={styles.line} />
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, styles.nodeMissed]}>
                        <ClockIcon color={colors.white} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View style={[styles.card, local.card]}>
                    <View style={local.titleRow}>
                        <Text style={[local.title, { color: colors.textPrimary }]} accessibilityRole="header">
                            {hasPlans ? l('Bugün için planınız yok!', 'Nothing planned for today!') : l('Çalışma planınız yok!', 'You have no study plan!')}
                        </Text>
                        <TouchableOpacity
                            style={[local.button, { backgroundColor: colors.accent }]}
                            onPress={onPress}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={hasPlans ? l('Çalışma planlarını aç', 'Open the study plans') : l('Çalışma planı oluştur', 'Create a study plan')}
                        >
                            <Text style={[local.buttonText, { color: colors.white }]}>{hasPlans ? l('Planlar', 'Plans') : l('Oluştur', 'Create')}</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[local.hint, { color: colors.textSecondary }]}>
                        {hasPlans
                            ? l('Planlarınıza bugün için bir çalışma ekleyebilirsiniz.', 'You can add a session for today to your plans.')
                            : l(
                                'Çalışma planı oluşturun; hangi gün ne çalışacağınız burada görünsün.',
                                'Create a study plan to see what to study each day right here.',
                            )}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    card: { flexDirection: 'column', gap: Spacing.xs },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { flex: 1, fontSize: FontSize.md, fontWeight: '700' },
    button: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    buttonText: { fontSize: FontSize.sm, fontWeight: '700' },
    hint: { fontSize: FontSize.sm, lineHeight: 18 },
});

export default React.memo(NoStudyPlanCard);
