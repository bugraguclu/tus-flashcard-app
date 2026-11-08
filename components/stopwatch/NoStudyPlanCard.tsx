import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
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
                        <ClockIcon color={colors.onAccent} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <Card padded>
                    <View style={local.titleRow}>
                        <Text style={[local.title, { color: colors.textPrimary }]} accessibilityRole="header">
                            {hasPlans ? l('Bugün için planınız yok!', 'Nothing planned for today!') : l('Çalışma planınız yok!', 'You have no study plan!')}
                        </Text>
                        <Button
                            size="compact"
                            label={hasPlans ? l('Planlar', 'Plans') : l('Oluştur', 'Create')}
                            onPress={onPress}
                            accessibilityLabel={hasPlans ? l('Çalışma planlarını aç', 'Open the study plans') : l('Çalışma planı oluştur', 'Create a study plan')}
                        />
                    </View>
                    <Text style={[local.hint, { color: colors.textSecondary }]}>
                        {hasPlans
                            ? l('Planlarınıza bugün için bir çalışma ekleyebilirsiniz.', 'You can add a session for today to your plans.')
                            : l(
                                'Çalışma planı oluşturun; hangi gün ne çalışacağınız burada görünsün.',
                                'Create a study plan to see what to study each day right here.',
                            )}
                    </Text>
                </Card>
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    title: { flex: 1, fontSize: FontSize.md, fontWeight: '700' },
    hint: { fontSize: FontSize.sm, lineHeight: 18 },
});

export default React.memo(NoStudyPlanCard);
