import React, { memo, useCallback, useMemo } from 'react';
import {
    Animated,
    View,
    FlatList,
    StyleSheet,
    Linking,
    Platform,
    type ListRenderItemInfo,
} from 'react-native';
import { Text } from './Typography';
import { AppPressable } from './AppPressable';

// Drawer rows sit flush against each other, so none of them take the default hit slop: an 8pt
// halo would cross into the neighbouring row and hand its edge taps to the wrong target. They
// are already at least 40pt tall. Full-width rows also keep the dim but skip the inward scale,
// which UIKit table rows never do.
const ROW_PRESS = { hitSlop: 0, scaleOnPress: false } as const;
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize } from '../constants/theme';
import type { Subject } from '../lib/types';
import { buildSidebarRows, type SidebarRow } from '../lib/sidebarRows';
import { useI18n } from '../hooks/useI18n';

export const SIDEBAR_WIDTH = 260;

type SidebarStyles = ReturnType<typeof createStyles>;

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
    onAllPress: () => void;
    onSubjectPress: (subjectId: string) => void;
    onToggleExpand: (subjectId: string) => void;
    onTopicPress: (subjectId: string, topic: string) => void;
    navigate: (path: string) => void;
    /** Stats screen target; the layout points it at the active deck's stats when one is open. */
    statsPath?: string;
    /** 0 = off-screen, 1 = fully open. Owned by the layout so the overlay fades in step. */
    drawerProgress: Animated.Value;
};

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

/**
 * Rows take primitive props only, so a memoized row re-renders when its own count, selection
 * or disclosure changes. Opening a course therefore touches that row and its new topic rows
 * instead of the whole catalogue.
 */
const AllCoursesRow = memo(function AllCoursesRow(props: {
    styles: SidebarStyles;
    label: string;
    count: number;
    selected: boolean;
    onPress: () => void;
}) {
    const { styles, label, count, selected, onPress } = props;
    return (
        <AppPressable
            {...ROW_PRESS}
            style={[styles.subjectItem, selected && styles.subjectItemActive]}
            onPress={onPress}
        >
            <Text style={styles.subjectIcon}>📚</Text>
            <Text style={[styles.subjectName, selected && styles.subjectNameActive]}>{label}</Text>
            <View style={[styles.subjectCount, selected && styles.subjectCountActive]}>
                <Text scaleRole="badge" style={[styles.subjectCountText, selected && styles.subjectCountTextActive]}>
                    {count}
                </Text>
            </View>
        </AppPressable>
    );
});

const SubjectRow = memo(function SubjectRow(props: {
    styles: SidebarStyles;
    subjectId: string;
    name: string;
    icon: string;
    count: number;
    expanded: boolean;
    selected: boolean;
    studyLabel: string;
    showTopicsLabel: string;
    hideTopicsLabel: string;
    onPress: (subjectId: string) => void;
    onToggleExpand: (subjectId: string) => void;
}) {
    const {
        styles, subjectId, name, icon, count, expanded, selected,
        studyLabel, showTopicsLabel, hideTopicsLabel, onPress, onToggleExpand,
    } = props;
    const expandLabel = expanded ? hideTopicsLabel : showTopicsLabel;
    return (
        <View style={[styles.subjectRow, selected && styles.subjectItemActive]}>
            <AppPressable
                {...ROW_PRESS}
                style={styles.subjectItem}
                onPress={() => onPress(subjectId)}
                {...webTitle(`${name} — ${studyLabel}`)}
            >
                <Text style={styles.subjectIcon}>{icon}</Text>
                <Text style={[styles.subjectName, selected && styles.subjectNameActive]}>{name}</Text>
                <View style={[styles.subjectCount, selected && styles.subjectCountActive]}>
                    <Text scaleRole="badge" style={[styles.subjectCountText, selected && styles.subjectCountTextActive]}>
                        {count}
                    </Text>
                </View>
            </AppPressable>
            <AppPressable
                hitSlop={0}
                style={styles.expandBtn}
                onPress={() => onToggleExpand(subjectId)}
                accessibilityLabel={expandLabel}
                {...webTitle(expandLabel)}
            >
                <Text style={[styles.expandArrow, expanded && styles.expandArrowOpen]}>
                    {expanded ? '▾' : '▸'}
                </Text>
            </AppPressable>
        </View>
    );
});

const TopicRow = memo(function TopicRow(props: {
    styles: SidebarStyles;
    subjectId: string;
    topic: string;
    count: number;
    selected: boolean;
    onPress: (subjectId: string, topic: string) => void;
}) {
    const { styles, subjectId, topic, count, selected, onPress } = props;
    return (
        <AppPressable
            {...ROW_PRESS}
            style={[styles.topicItem, selected && styles.topicItemActive]}
            onPress={() => onPress(subjectId, topic)}
        >
            <View style={[styles.topicDot, selected && styles.topicDotActive]} />
            <Text style={[styles.topicName, selected && styles.topicNameActive]}>{topic}</Text>
            <Text scaleRole="badge" style={[styles.topicCount, selected && styles.topicCountActive]}>{count}</Text>
        </AppPressable>
    );
});

export function Sidebar(props: SidebarProps) {
    const { t } = useI18n();
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
        onAllPress,
        onSubjectPress,
        onToggleExpand,
        onTopicPress,
        navigate,
        statsPath = '/stats',
        drawerProgress,
    } = props;

    const isOpen = isWide || sidebarOpen;
    const translateX = useMemo(
        () => drawerProgress.interpolate({ inputRange: [0, 1], outputRange: [-SIDEBAR_WIDTH, 0] }),
        [drawerProgress],
    );

    // The drawer is rebuilt every time it opens, so a recursive walk over every course and its
    // topics paid for rows nobody could see. The flat model lets the FlatList mount only the
    // visible slice, and a collapsed course costs exactly one row.
    const rows = useMemo(
        () => buildSidebarRows({
            subjects,
            expandedSubject,
            selectedSubject,
            selectedTopic,
            totalCards,
            getSubjectCount,
            getTopicCount,
            getTopicsForSubject,
        }),
        [
            subjects,
            expandedSubject,
            selectedSubject,
            selectedTopic,
            totalCards,
            getSubjectCount,
            getTopicCount,
            getTopicsForSubject,
        ],
    );

    const keyExtractor = useCallback((row: SidebarRow) => row.key, []);

    const allCoursesLabel = t('sidebar.allCourses');
    const studyLabel = t('common.study');
    const showTopicsLabel = t('sidebar.showTopics');
    const hideTopicsLabel = t('sidebar.hideTopics');

    const renderRow = useCallback(({ item }: ListRenderItemInfo<SidebarRow>) => {
        if (item.kind === 'all') {
            return (
                <AllCoursesRow
                    styles={styles}
                    label={allCoursesLabel}
                    count={item.count}
                    selected={item.selected}
                    onPress={onAllPress}
                />
            );
        }

        if (item.kind === 'subject') {
            return (
                <SubjectRow
                    styles={styles}
                    subjectId={item.subjectId}
                    name={item.name}
                    icon={item.icon}
                    count={item.count}
                    expanded={item.expanded}
                    selected={item.selected}
                    studyLabel={studyLabel}
                    showTopicsLabel={showTopicsLabel}
                    hideTopicsLabel={hideTopicsLabel}
                    onPress={onSubjectPress}
                    onToggleExpand={onToggleExpand}
                />
            );
        }

        return (
            <TopicRow
                styles={styles}
                subjectId={item.subjectId}
                topic={item.topic}
                count={item.count}
                selected={item.selected}
                onPress={onTopicPress}
            />
        );
    }, [
        styles,
        allCoursesLabel,
        studyLabel,
        showTopicsLabel,
        hideTopicsLabel,
        onAllPress,
        onSubjectPress,
        onToggleExpand,
        onTopicPress,
    ]);

    return (
        <Animated.View
            pointerEvents={isOpen ? 'auto' : 'none'}
            // The drawer stays mounted while closed so it can animate; hide it from assistive
            // tech too, otherwise VoiceOver still walks an off-screen menu.
            accessibilityElementsHidden={!isOpen}
            importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
            style={[styles.sidebar, { transform: [{ translateX }] }]}
        >
            <AppPressable
                {...ROW_PRESS}
                style={styles.sidebarHeader}
                onPress={() => navigate('/decks')}
                accessibilityLabel={t('tabs.backToDecks')}
                {...webTitle(t('tabs.backToDecks'))}
            >
                <Text scaleRole="title" style={styles.sidebarTitle}>🧠 TusAnkiM</Text>
                <Text style={styles.sidebarSubtitle}>{t('sidebar.spacedRepetition')}</Text>
            </AppPressable>

            <FlatList
                style={styles.subjectList}
                data={rows}
                renderItem={renderRow}
                keyExtractor={keyExtractor}
                keyboardShouldPersistTaps="handled"
                // The drawer is a scrollable surface with no other affordance, so the indicator
                // is the only cue that the course list continues below the fold.
                showsVerticalScrollIndicator
                initialNumToRender={14}
                windowSize={7}
                removeClippedSubviews={Platform.OS !== 'web'}
            />

            <View style={styles.sidebarActions}>
                <View style={styles.actionRow}>
                    <AppPressable hitSlop={0} style={styles.actionBtn} onPress={() => navigate('/browser')} {...webTitle(t('sidebar.myCards'))}>
                        <Text style={styles.actionIcon}>🗂️</Text>
                        <Text style={styles.actionText}>{t('sidebar.myCards')}</Text>
                    </AppPressable>
                    <AppPressable hitSlop={0} style={styles.actionBtn} onPress={() => navigate(statsPath)} {...webTitle(t('common.statistics'))}>
                        <Text style={styles.actionIcon}>📊</Text>
                        <Text style={styles.actionText}>{t('tabs.statistics')}</Text>
                    </AppPressable>
                </View>

                <AppPressable {...ROW_PRESS} style={styles.settingsBtn} onPress={() => navigate('/decks')} {...webTitle(t('common.decks'))}>
                    <Text style={styles.settingsBtnText}>🗃️ {t('tabs.decks')}</Text>
                </AppPressable>

                <AppPressable {...ROW_PRESS} style={styles.settingsBtn} onPress={() => navigate('/settings')} {...webTitle(t('common.settings'))}>
                    <Text style={styles.settingsBtnText}>⚙️ {t('tabs.settings')}</Text>
                </AppPressable>

                <AppPressable
                    scaleOnPress={false}
                    style={styles.creditContainer}
                    accessibilityLabel="Kürşad Güçlü"
                    onPress={() => Linking.openURL('https://www.instagram.com/kursatguclu1/')}
                >
                    <Text style={styles.creditText}>
                        Powered by <Text style={styles.creditName}>Kürşad Güçlü</Text>
                    </Text>
                </AppPressable>
            </View>
        </Animated.View>
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
        paddingVertical: 9,
        paddingHorizontal: Spacing.lg,
    },
    subjectItemActive: { backgroundColor: colors.accentLight },
    expandBtn: {
        paddingVertical: 9,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subjectIcon: { fontSize: 16, width: 26 },
    subjectName: { flex: 1, fontSize: FontSize.md, color: colors.textSecondary, fontWeight: '500' },
    subjectNameActive: { color: colors.accent, fontWeight: '700' },
    subjectCount: {
        backgroundColor: 'rgba(0,0,0,0.04)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 28,
        alignItems: 'center',
    },
    subjectCountActive: { backgroundColor: colors.accent },
    subjectCountText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
    subjectCountTextActive: { color: colors.white },
    expandArrow: {
        fontSize: 11,
        color: colors.textMuted,
        marginLeft: 6,
        width: 14,
        textAlign: 'center',
    },
    expandArrowOpen: { color: colors.accent },
    topicItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
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
    actionIcon: { fontSize: 16 },
    actionText: { fontSize: 9, fontWeight: '600', color: colors.textSecondary },
    settingsBtn: {
        paddingVertical: 8,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    settingsBtnText: { fontSize: FontSize.sm, fontWeight: '500', color: colors.textSecondary },
    creditContainer: { alignItems: 'center', paddingVertical: 6 },
    creditText: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.3 },
    creditName: { fontWeight: '700', color: colors.accent },
    });
}
