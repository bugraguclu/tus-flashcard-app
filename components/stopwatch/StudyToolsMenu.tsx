import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Path, Rect } from 'react-native-svg';
import { FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import PressableScale from '../PressableScale';
import StatsGlyph from '../StatsGlyph';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import { TrashGlyph } from '../UiGlyphs';
import { PopoverBackdrop, PopoverItem, PopoverModal } from '../Popover';
import { AnalyticsIcon, TimelineListIcon } from './StopwatchIcons';

export const STUDY_TOOLS_FAB_SIZE = 56;

type StudyTool = 'calendar' | 'analysis' | 'planning' | 'clear';

const ROUTES: Record<Exclude<StudyTool, 'calendar'>, string> = {
    analysis: '/study-analysis',
    planning: '/study-plans',
    clear: '/study-clear',
};

const TOOL_GLYPH_SIZE = 32;

/** A clipboard with two ticked rows: plan your study. */
function PlanGlyph({ color, size }: { color: string; size: number }) {
    const line = outline(color, iconStroke(size));
    return (
        <IconFrame size={size}>
            <Rect x={4.75} y={4.5} width={14.5} height={16.5} rx={2.75} {...line} />
            <Path d="M9 4.5v-.25c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25v.25M8.25 10.25l1.4 1.4 2.35-2.4M14 10.75h2M8.25 15.25l1.4 1.4 2.35-2.4M14 15.75h2" {...line} />
        </IconFrame>
    );
}

function ToolGlyph({ tool, color }: { tool: StudyTool; color: string }) {
    if (tool === 'calendar') return <TimelineListIcon color={color} size={TOOL_GLYPH_SIZE} />;
    if (tool === 'analysis') return <StatsGlyph color={color} size={TOOL_GLYPH_SIZE} filled />;
    if (tool === 'planning') return <PlanGlyph color={color} size={TOOL_GLYPH_SIZE} />;
    return <TrashGlyph color={color} size={TOOL_GLYPH_SIZE} />;
}

interface StudyToolsMenuProps {
    /** Distance of the button from the screen's bottom edge, above the home indicator. */
    bottom: number;
    /**
     * Opens the Study Calendar. Given on the Kronometre, whose menu lists "Çalışma Takvimi" first
     * as TUSBuddy's stopwatch does; the calendar's own menu leaves it out.
     */
    onOpenCalendar?: () => void;
}

/**
 * The study tools button: a round orange button that opens the study tools as orange cards —
 * "Çalışma Takvimi" (on the Kronometre), "Çalışma Analiziniz", "Çalışma Planlama" and "Çalışmaları
 * Temizle" — over a dimmed screen, as TUSBuddy does. Tapping outside the cards or the button again
 * closes them.
 */
export default function StudyToolsMenu({ bottom, onOpenCalendar }: StudyToolsMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const tint = colors.studyTool;

    const tools: { tool: StudyTool; title: string; subtitle: string }[] = [
        ...(onOpenCalendar ? [{
            tool: 'calendar' as const,
            title: l('Çalışma Takvimi', 'Study Calendar'),
            subtitle: l('Aylık ve haftalık çalışma takviminizi görüntüleyin.', 'See your monthly and weekly study calendar.'),
        }] : []),
        {
            tool: 'analysis',
            title: l('Çalışma Analiziniz', 'Your Study Analysis'),
            subtitle: l(
                'Çalışmalarınızın derslere göre aylık ve haftalık analizlerini inceleyin',
                'Review your study by course, month and week',
            ),
        },
        {
            tool: 'planning',
            title: l('Çalışma Planlama', 'Study Planning'),
            subtitle: l(
                'İhtiyaçlarınıza göre özelleştirilebilir çalışma planı ile çok daha verimli ve motive çalışın',
                'Study more efficiently with a plan shaped to your needs',
            ),
        },
        {
            tool: 'clear',
            title: l('Çalışmaları Temizle', 'Clear Sessions'),
            subtitle: l(
                'Dilediğiniz zaman aralığındaki çalışmalarınızı toplu olarak temizleyin.',
                'Clear your sessions in any date range at once.',
            ),
        },
    ];

    const button = (onPress: () => void, label: string) => (
        <PressableScale
            style={[styles.fab, { bottom, backgroundColor: tint }]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <AnalyticsIcon color={colors.white} size={26} />
        </PressableScale>
    );

    return (
        <>
            {button(() => setOpen(true), l('Çalışma araçları', 'Study tools'))}
            {/* The cards rise out of the button one after another and sink back into it. */}
            <PopoverModal visible={open} onRequestClose={() => setOpen(false)} itemCount={tools.length}>
                <View style={styles.overlay}>
                    <PopoverBackdrop
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimStrong }]}
                        onPress={() => setOpen(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    />
                    {/* The prop, not the style: react-native-web drops a 'box-none' style. */}
                    <View
                        style={[styles.cards, {
                            paddingBottom: bottom + STUDY_TOOLS_FAB_SIZE + Spacing.lg,
                            paddingLeft: Spacing.lg + insets.left,
                            paddingRight: Spacing.lg + insets.right,
                        }]}
                        pointerEvents="box-none"
                    >
                        {tools.map(({ tool, title, subtitle }, index) => (
                            <PopoverItem key={tool} index={tools.length - 1 - index} origin="bottom right">
                                <TouchableOpacity
                                    style={[styles.card, { backgroundColor: tint }]}
                                    onPress={() => {
                                        setOpen(false);
                                        if (tool === 'calendar') onOpenCalendar?.();
                                        else router.push(ROUTES[tool] as any);
                                    }}
                                    activeOpacity={0.85}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${title}. ${subtitle}`}
                                >
                                    <View style={styles.glyph}><ToolGlyph tool={tool} color={colors.white} /></View>
                                    <View style={styles.copy}>
                                        <Text style={[styles.title, { color: colors.white }]}>{title}</Text>
                                        <Text style={[styles.subtitle, { color: colors.white }]}>{subtitle}</Text>
                                    </View>
                                </TouchableOpacity>
                            </PopoverItem>
                        ))}
                    </View>
                    {button(() => setOpen(false), l('Çalışma araçlarını kapat', 'Close study tools'))}
                </View>
            </PopoverModal>
        </>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: Spacing.lg,
        width: STUDY_TOOLS_FAB_SIZE,
        height: STUDY_TOOLS_FAB_SIZE,
        borderRadius: STUDY_TOOLS_FAB_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    cards: { gap: Spacing.md },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        minHeight: 76,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: 12,
        ...Shadows.md,
    },
    glyph: { width: 36, alignItems: 'center' },
    copy: { flex: 1, gap: 3 },
    title: { fontSize: FontSize.lg, fontWeight: '800' },
    subtitle: { fontSize: FontSize.sm, lineHeight: 18 },
});
