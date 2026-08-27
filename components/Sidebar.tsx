import React, { useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize } from '../constants/theme';
import type { Subject } from '../lib/types';
import type { DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName } from '../lib/models';
import { useI18n } from '../hooks/useI18n';

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
        <Svg width={18} height={18} viewBox="0 0 24 24">
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

function DeckChevron({ color, expanded }: { color: string; expanded: boolean }) {
    return (
        <Svg
            width={14}
            height={14}
            viewBox="0 0 14 14"
            style={expanded ? stylesForIcon.chevronExpanded : undefined}
        >
            <Path
                d="M5 3.5 9 7l-4 3.5"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

const stylesForIcon = StyleSheet.create({
    chevronExpanded: { transform: [{ rotate: '90deg' }] },
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
                            accessibilityRole="button"
                            accessibilityLabel={isExpanded ? t('sidebar.hideTopics') : t('sidebar.showTopics')}
                            accessibilityState={{ expanded: isExpanded }}
                        >
                            <DeckChevron
                                color={isExpanded || isSelected ? colors.accent : colors.textMuted}
                                expanded={isExpanded}
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
                                color={isSelected ? colors.white : colors.accent}
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
            pointerEvents={isWide || sidebarOpen ? 'auto' : 'none'}
            style={[styles.sidebar, !isWide && !sidebarOpen && styles.sidebarHidden]}
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
                                    {...webTitle(isExpanded ? t('sidebar.hideTopics') : t('sidebar.showTopics'))}
                                >
                                    <Text style={[styles.expandArrow, isExpanded && styles.expandArrowOpen]}>
                                        {isExpanded ? '▾' : '▸'}
                                    </Text>
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
                                            {topic}
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
                        <Text style={styles.actionIcon}>🗂️</Text>
                        <Text style={styles.actionText}>{t('sidebar.myCards')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate(statsPath)} {...webTitle(t('common.statistics'))}>
                        <Text style={styles.actionIcon}>📊</Text>
                        <Text style={styles.actionText}>{t('tabs.statistics')}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/decks')} {...webTitle(t('common.decks'))}>
                    <Text style={styles.settingsBtnText}>🗃️ {t('tabs.decks')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/settings')} {...webTitle(t('common.settings'))}>
                    <Text style={styles.settingsBtnText}>⚙️ {t('tabs.settings')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.creditContainer}
                    onPress={() => Linking.openURL('https://www.instagram.com/kursatguclu1/')}
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
            ? { transform: [{ translateX: -SIDEBAR_WIDTH }] as any }
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
        paddingVertical: 9,
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
    deckCountTextActive: { color: colors.white },
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
