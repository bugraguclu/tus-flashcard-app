import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Path, Rect } from 'react-native-svg';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { useCenteredInset } from '../../hooks/useCenteredInset';
import { useModalHandoff } from '../../hooks/useModalHandoff';
import StatsGlyph from '../StatsGlyph';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import { TrashGlyph } from '../UiGlyphs';
import { FAB_SIZE, SpeedDial, SpeedDialCard } from '../ui/Fab';
import { AnalyticsIcon, TimelineListIcon } from './StopwatchIcons';

export const STUDY_TOOLS_FAB_SIZE = FAB_SIZE;

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
 * The study tools button: the kit's speed dial as a round orange button that opens the study tools
 * as orange cards — "Çalışma Takvimi" (on the Kronometre), "Çalışma Analiziniz", "Çalışma Planlama"
 * and "Çalışmaları Temizle" — over a dimmed screen, as TUSBuddy does. Tapping outside the cards or
 * the button again closes them.
 */
export default function StudyToolsMenu({ bottom, onOpenCalendar }: StudyToolsMenuProps) {
    // Kept at the edge of the centred column its screens use in a wide window.
    const inset = useCenteredInset();
    const { l } = useI18n();
    const colors = useThemeColors();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    // A chosen tool's screen shows at once instead of after the cards sink back (useModalHandoff).
    const handoff = useModalHandoff(open);
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

    return (
        // The cards rise out of the button one after another and sink back into it.
        <SpeedDial
            visible={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            closeAtOnce={handoff.closeAtOnce}
            bottom={bottom}
            inset={inset}
            shape="round"
            color={tint}
            icon={<AnalyticsIcon color={colors.onAccent} size={26} />}
            openLabel={l('Çalışma araçları', 'Study tools')}
            closeLabel={l('Çalışma araçlarını kapat', 'Close study tools')}
            stretch
        >
            {tools.map(({ tool, title, subtitle }) => (
                <SpeedDialCard
                    key={tool}
                    title={title}
                    subtitle={subtitle}
                    color={tint}
                    icon={<ToolGlyph tool={tool} color={colors.onAccent} />}
                    onPress={() => handoff.handOff(() => {
                        setOpen(false);
                        if (tool === 'calendar') onOpenCalendar?.();
                        else router.push(ROUTES[tool] as any);
                    })}
                />
            ))}
        </SpeedDial>
    );
}
