import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { AnalyticsIcon } from './StopwatchIcons';

export const STUDY_TOOLS_FAB_SIZE = 56;

type StudyTool = 'analysis' | 'planning' | 'clear';

const ROUTES: Record<StudyTool, string> = {
    analysis: '/study-analysis',
    planning: '/study-plans',
    clear: '/study-clear',
};

function ToolGlyph({ tool, color }: { tool: StudyTool; color: string }) {
    const stroke = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    return (
        <Svg width={32} height={32} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            {tool === 'analysis' ? (
                <>
                    <Rect x={3.5} y={14} width={3.6} height={7} rx={0.8} fill={color} />
                    <Rect x={10.2} y={11.5} width={3.6} height={9.5} rx={0.8} fill={color} />
                    <Rect x={16.9} y={13} width={3.6} height={8} rx={0.8} fill={color} />
                    <Path d="M5.3 8.4l6.7-3.2 6.7 3.4" {...stroke} />
                    <Circle cx={5.3} cy={8.4} r={1.5} fill={color} />
                    <Circle cx={12} cy={5.2} r={1.5} fill={color} />
                    <Circle cx={18.7} cy={8.6} r={1.5} fill={color} />
                </>
            ) : tool === 'planning' ? (
                <>
                    <Rect x={4} y={3} width={14} height={18} rx={2} {...stroke} />
                    <Path d="M7 8l1.2 1.2L10.5 7M7 13l1.2 1.2 2.3-2.2M12.5 8.2H15M12.5 13.2H14" {...stroke} />
                    <Circle cx={17.5} cy={17.5} r={3.6} fill={color} />
                    <Path d="M17.5 15.9v1.8l1.2.8" fill="none" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" />
                </>
            ) : (
                <>
                    <Path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 14h9l1-14" {...stroke} />
                    <Path d="M10 10v7.5M12 10v7.5M14 10v7.5" {...stroke} />
                </>
            )}
        </Svg>
    );
}

interface StudyToolsMenuProps {
    /** Distance of the button from the screen's bottom edge, above the home indicator. */
    bottom: number;
}

/**
 * The study tools button: a round orange button that opens three cards — "Çalışma Analiziniz",
 * "Çalışma Planlama" and "Çalışmaları Temizle" — over a dimmed screen, as TUSBuddy's calendar
 * does. Tapping outside the cards or the button again closes them.
 */
export default function StudyToolsMenu({ bottom }: StudyToolsMenuProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const tint = colors.studyTool;

    const tools: { tool: StudyTool; title: string; subtitle: string }[] = [
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
        <TouchableOpacity
            style={[styles.fab, { bottom, backgroundColor: tint }]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <AnalyticsIcon color={colors.white} size={26} />
        </TouchableOpacity>
    );

    return (
        <>
            {button(() => setOpen(true), l('Çalışma araçları', 'Study tools'))}
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <View style={styles.overlay}>
                    <Pressable
                        style={[StyleSheet.absoluteFill, styles.backdrop]}
                        onPress={() => setOpen(false)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    />
                    <View
                        style={[styles.cards, { paddingBottom: bottom + STUDY_TOOLS_FAB_SIZE + Spacing.lg, paddingLeft: Spacing.lg + insets.left, paddingRight: Spacing.lg + insets.right }]}
                        pointerEvents="box-none"
                    >
                        {tools.map(({ tool, title, subtitle }) => (
                            <TouchableOpacity
                                key={tool}
                                style={[styles.card, { backgroundColor: tint }]}
                                onPress={() => {
                                    setOpen(false);
                                    router.push(ROUTES[tool] as any);
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
                        ))}
                    </View>
                    {button(() => setOpen(false), l('Çalışma araçlarını kapat', 'Close study tools'))}
                </View>
            </Modal>
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
    backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
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
