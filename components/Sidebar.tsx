import React, { useMemo } from 'react';
import {
    View,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
} from 'react-native';
import { Text } from './AppText';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize } from '../constants/theme';
import type { Subject } from '../lib/types';
import type { DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName } from '../lib/models';
import { localizeTopicName } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';
import CardsGlyph from './CardsGlyph';
import StatsGlyph from './StatsGlyph';
import GearGlyph from './GearGlyph';
import CalendarGlyph from './CalendarGlyph';
import DisclosureChevron from './DisclosureChevron';
import { DECORATIVE_SVG_PROPS } from './decorativeSvgProps';
import { StopwatchIcon } from './stopwatch/StopwatchIcons';
import { Button } from './ui/Button';
import { HIT_TARGET } from './ui/tokens';

export const SIDEBAR_WIDTH = 292;

type SidebarProps = {
    isWide: boolean;
    sidebarOpen: boolean;
    subjects: Subject[];
    selectedSubject: string | null;
    selectedTopic: string | null;
    expandedSubject: string | null;
    totalCards: number;
    getSubjectCount: (subjectId: string) => number;
    getTopicCount: (subjectId: string, topic: string) => number;
    getTopicsForSubject: (subjectId: string) => string[];
    /** When a deck is being studied, replace the course list with that deck's live subtree. */
    deckTree?: DeckTreeNode[];
    activeDeckName?: string | null;
    expandedDeckNames?: Set<string>;
    onDeckPress?: (deckName: string) => void;
    onToggleDeckExpand?: (deckName: string) => void;
    onAllPress: () => void;
    onSubjectPress: (subjectId: string) => void;
    onToggleExpand: (subjectId: string) => void;
    onTopicPress: (subjectId: string, topic: string) => void;
    navigate: (path: string) => void;
    /** Stats screen target; the layout points it at the active deck's stats when one is open. */
    statsPath?: string;
};

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

function DeckFolderIcon({ color, root = false }: { color: string; root?: boolean }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path
                d={root
                    ? 'M4 7.5h16v11H4zM7 4.5h7l2 3H7zM8 11h8M8 14.5h5'
                    : 'M3.5 7h6l2-2h9v13.5h-17z'}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/** The drawer's toggle (☰), for the layouts that open the sidebar from a header button. */
export function SidebarToggleIcon({ color, size = 24 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE_SVG_PROPS}>
            <Path d="M4.5 7h15M4.5 12h15M4.5 17h15" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
    );
}

export function Sidebar(props: SidebarProps) {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const {
        isWide,
        sidebarOpen,
        subjects,
        selectedSubject,
        selectedTopic,
        expandedSubject,
        totalCards,
        getSubjectCount,
        getTopicCount,
        getTopicsForSubject,
        deckTree = [],
        activeDeckName = null,
        expandedDeckNames = new Set<string>(),
        onDeckPress,
        onToggleDeckExpand,
        onAllPress,
        onSubjectPress,
        onToggleExpand,
        onTopicPress,
        navigate,
        statsPath = '/stats',
    } = props;
    // On narrow screens the closed drawer is only moved off-screen, so it must also leave the
    // Tab order and the screen-reader tree; otherwise focus lands on controls nobody can see.
    const hidden = !isWide && !sidebarOpen;

    const renderDeckNodes = (nodes: DeckTreeNode[], depth = 0): React.ReactNode => nodes.map((node) => {
        const { deck, children } = node;
        const hasChildren = children.length > 0;
        const isExpanded = expandedDeckNames.has(deck.name);
        const isSelected = activeDeckName === deck.name;

        return (
            <View key={deck.id}>
                <View
                    style={[
                        styles.deckRow,
                        depth === 0 && styles.deckRootRow,
                        isSelected && styles.deckRowActive,
                        { marginLeft: Math.min(depth, 4) * 14 },
                    ]}
                >
                    {hasChildren ? (
                        <TouchableOpacity
                            style={styles.deckExpandBtn}
                            onPress={() => onToggleDeckExpand?.(deck.name)}
                            // The row is 44 tall; the slop makes up the 32-wide column to a full target.
                            hitSlop={{ left: 6, right: 6, top: 1, bottom: 1 }}
                            accessibilityRole="button"
                            accessibilityLabel={isExpanded ? t('sidebar.hideTopics') : t('sidebar.showTopics')}
                            accessibilityState={{ expanded: isExpanded }}
                        >
                            <DisclosureChevron
                                color={isExpanded || isSelected ? colors.accent : colors.textMuted}
                                expanded={isExpanded}
                                size={16}
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.deckLeafMarker}>
                            <View style={[styles.deckLeafDot, isSelected && styles.deckLeafDotActive]} />
                        </View>
                    )}
                    <TouchableOpacity
                        style={styles.deckItem}
                        onPress={() => onDeckPress?.(deck.name)}
                        accessibilityRole="button"
                        accessibilityLabel={deck.name.replaceAll('::', ' › ')}
                    >
                        <View style={[
                            styles.deckIcon,
                            depth === 0 && styles.deckRootIcon,
                            isSelected && styles.deckIconActive,
                        ]}>
                            <DeckFolderIcon
                                color={isSelected ? colors.onAccent : colors.accent}
                                root={depth === 0}
                            />
                        </View>
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.deckName,
                                depth === 0 && styles.deckRootName,
                                isSelected && styles.deckNameActive,
                            ]}
                        >
                            {getDeckDisplayName(deck.name)}
                        </Text>
                        <View style={[styles.deckCount, isSelected && styles.deckCountActive]}>
                            <Text style={[styles.deckCountText, isSelected && styles.deckCountTextActive]}>
                                {node.totalCards}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
                {hasChildren && isExpanded ? renderDeckNodes(children, depth + 1) : null}
            </View>
        );
    });

    return (
        <View
            style={[styles.sidebar, hidden && styles.sidebarHidden, { pointerEvents: hidden ? 'none' : 'auto' }]}
            aria-hidden={hidden}
        >
            <TouchableOpacity
                style={styles.sidebarHeader}
                onPress={() => navigate('/decks')}
                accessibilityRole="button"
                accessibilityLabel={t('tabs.backToDecks')}
                {...webTitle(t('tabs.backToDecks'))}
            >
                <Text style={styles.sidebarTitle}>🧠 TusAnkiM</Text>
                <Text style={styles.sidebarSubtitle}>{t('sidebar.spacedRepetition')}</Text>
            </TouchableOpacity>

            <ScrollView style={styles.subjectList} showsVerticalScrollIndicator={false}>
                {deckTree.length > 0 ? renderDeckNodes(deckTree) : <><TouchableOpacity
                    style={[styles.subjectItem, !selectedSubject && !selectedTopic && styles.subjectItemActive]}
                    onPress={onAllPress}
                >
                    <Text style={styles.subjectIcon}>📚</Text>
                    <Text style={[styles.subjectName, !selectedSubject && !selectedTopic && styles.subjectNameActive]}>
                        {t('sidebar.allCourses')}
                    </Text>
                    <View style={[styles.subjectCount, !selectedSubject && !selectedTopic && styles.subjectCountActive]}>
                        <Text style={[styles.subjectCountText, !selectedSubject && !selectedTopic && styles.subjectCountTextActive]}>
                            {totalCards}
                        </Text>
                    </View>
                </TouchableOpacity>

                {subjects.map((subject) => {
                    const isExpanded = expandedSubject === subject.id;
                    const isSelected = selectedSubject === subject.id && !selectedTopic;

                    return (
                        <View key={subject.id}>
                            <View style={[styles.subjectRow, isSelected && styles.subjectItemActive]}>
                                <TouchableOpacity
                                    style={styles.subjectItem}
                                    onPress={() => onSubjectPress(subject.id)}
                                    {...webTitle(`${subject.name} — ${t('common.study')}`)}
                                >
                                    <Text style={styles.subjectIcon}>{subject.icon}</Text>
                                    <Text style={[styles.subjectName, isSelected && styles.subjectNameActive]}>
                                        {subject.name}
                                    </Text>
                                    <View style={[styles.subjectCount, isSelected && styles.subjectCountActive]}>
                                        <Text style={[styles.subjectCountText, isSelected && styles.subjectCountTextActive]}>
                                            {getSubjectCount(subject.id)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.expandBtn}
                                    onPress={() => onToggleExpand(subject.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={isExpanded ? t('sidebar.hideTopics') : t('sidebar.showTopics')}
                                    accessibilityState={{ expanded: isExpanded }}
                                    {...webTitle(isExpanded ? t('sidebar.hideTopics') : t('sidebar.showTopics'))}
                                >
                                    <DisclosureChevron
                                        color={isExpanded ? colors.accent : colors.textMuted}
                                        expanded={isExpanded}
                                        size={16}
                                    />
                                </TouchableOpacity>
                            </View>

                            {isExpanded && getTopicsForSubject(subject.id).map((topic) => {
                                const isTopicSelected = selectedSubject === subject.id && selectedTopic === topic;
                                return (
                                    <TouchableOpacity
                                        key={topic}
                                        style={[styles.topicItem, isTopicSelected && styles.topicItemActive]}
                                        onPress={() => onTopicPress(subject.id, topic)}
                                    >
                                        <View style={[styles.topicDot, isTopicSelected && styles.topicDotActive]} />
                                        <Text style={[styles.topicName, isTopicSelected && styles.topicNameActive]}>
                                            {localizeTopicName(locale, topic)}
                                        </Text>
                                        <Text style={[styles.topicCount, isTopicSelected && styles.topicCountActive]}>
                                            {getTopicCount(subject.id, topic)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    );
                })}</>}
            </ScrollView>

            <View style={styles.sidebarActions}>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/browser')} {...webTitle(t('sidebar.myCards'))}>
                        <CardsGlyph color={colors.textSecondary} size={18} />
                        <Text style={styles.actionText}>{t('sidebar.myCards')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate(statsPath)} {...webTitle(t('common.statistics'))}>
                        <StatsGlyph color={colors.textSecondary} size={18} />
                        <Text style={styles.actionText}>{t('tabs.statistics')}</Text>
                    </TouchableOpacity>
                </View>

                <Button
                    label={l('Kronometre', 'Stopwatch')}
                    variant="secondary"
                    size="compact"
                    icon={<StopwatchIcon color={colors.textSecondary} size={16} />}
                    onPress={() => navigate('/stopwatch')}
                    style={styles.settingsBtn}
                />

                <Button
                    label={l('Çalışma Takvimi', 'Study Calendar')}
                    variant="secondary"
                    size="compact"
                    icon={<CalendarGlyph color={colors.textSecondary} size={16} />}
                    onPress={() => navigate('/study-calendar')}
                    style={styles.settingsBtn}
                />

                <Button
                    label={t('tabs.decks')}
                    variant="secondary"
                    size="compact"
                    icon={<CardsGlyph color={colors.textSecondary} size={16} />}
                    onPress={() => navigate('/decks')}
                    style={styles.settingsBtn}
                />

                <Button
                    label={t('tabs.settings')}
                    variant="secondary"
                    size="compact"
                    icon={<GearGlyph color={colors.textSecondary} size={16} />}
                    onPress={() => navigate('/settings')}
                    style={styles.settingsBtn}
                />

                <TouchableOpacity
                    style={styles.creditContainer}
                    onPress={() => Linking.openURL('https://www.instagram.com/kursatguclu1/')}
                    hitSlop={{ top: 10, bottom: 10 }}
                >
                    <Text style={styles.creditText}>
                        Powered by <Text style={styles.creditName}>Kürşad Güçlü</Text>
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    sidebar: {
        width: SIDEBAR_WIDTH,
        backgroundColor: colors.bgSidebar,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        ...(Platform.OS === 'web'
            ? { position: 'fixed' as any, top: 0, left: 0, bottom: 0, zIndex: 100 }
            : { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 100 }),
    },
    sidebarHidden: {
        ...(Platform.OS === 'web'
            // Browsers skip visibility:hidden content when tabbing; aria-hidden alone would not.
            ? { transform: [{ translateX: -SIDEBAR_WIDTH }] as any, visibility: 'hidden' as any }
            : { transform: [{ translateX: -SIDEBAR_WIDTH }] }),
    },
    sidebarHeader: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    sidebarTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.accent },
    sidebarSubtitle: { fontSize: FontSize.xs, color: colors.textMuted, letterSpacing: 0.5, marginTop: 2 },
    subjectList: { flex: 1, paddingVertical: Spacing.sm },
    subjectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: BorderRadius.sm,
        marginHorizontal: Spacing.sm,
        marginVertical: 1,
    },
    subjectItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: HIT_TARGET,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.lg,
    },
    deckItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
        minHeight: 42,
        paddingVertical: 6,
        paddingRight: Spacing.sm,
    },
    deckRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.sm,
        marginVertical: 1,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
    },
    deckRootRow: {
        marginBottom: Spacing.xs,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    deckRowActive: { backgroundColor: colors.accentLight },
    deckExpandBtn: {
        width: 32,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deckLeafMarker: { width: 32, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
    deckLeafDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border },
    deckLeafDotActive: { backgroundColor: colors.accent },
    deckIcon: {
        width: 30,
        height: 30,
        marginRight: Spacing.sm,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentLight,
    },
    deckRootIcon: { backgroundColor: colors.bgCard },
    deckIconActive: { backgroundColor: colors.accent },
    deckName: {
        flex: 1,
        minWidth: 0,
        marginRight: Spacing.sm,
        fontSize: FontSize.md,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    deckRootName: { color: colors.textPrimary, fontWeight: '700' },
    deckNameActive: { color: colors.accent, fontWeight: '700' },
    deckCount: {
        minWidth: 38,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        backgroundColor: colors.bgInput,
    },
    deckCountActive: { backgroundColor: colors.accent },
    deckCountText: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '700' },
    deckCountTextActive: { color: colors.onAccent },
    subjectItemActive: { backgroundColor: colors.accentLight },
    expandBtn: {
        minWidth: HIT_TARGET,
        minHeight: HIT_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subjectIcon: { fontSize: 16, width: 26 },
    subjectName: { flex: 1, fontSize: FontSize.md, color: colors.textSecondary, fontWeight: '500' },
    subjectNameActive: { color: colors.accent, fontWeight: '700' },
    subjectCount: {
        backgroundColor: colors.bgInput,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 28,
        alignItems: 'center',
    },
    subjectCountActive: { backgroundColor: colors.accent },
    subjectCountText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
    subjectCountTextActive: { color: colors.onAccent },
    topicItem: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: HIT_TARGET,
        paddingVertical: Spacing.xs,
        paddingLeft: 52,
        paddingRight: Spacing.lg,
        marginHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
        marginVertical: 1,
    },
    topicItemActive: { backgroundColor: colors.accentLight },
    topicDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.border,
        marginRight: 8,
    },
    topicDotActive: { backgroundColor: colors.accent },
    topicName: { flex: 1, fontSize: FontSize.sm, color: colors.textMuted, fontWeight: '500' },
    topicNameActive: { color: colors.accent, fontWeight: '600' },
    topicCount: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '500' },
    topicCountActive: { color: colors.accent, fontWeight: '700' },
    sidebarActions: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    actionRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.sm },
    actionBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        gap: 2,
    },
    actionText: { fontSize: 9, fontWeight: '600', color: colors.textSecondary },
    settingsBtn: { marginBottom: Spacing.sm },
    creditContainer: { alignItems: 'center', paddingVertical: 6 },
    creditText: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.3 },
    creditName: { fontWeight: '700', color: colors.accent },
    });
}
