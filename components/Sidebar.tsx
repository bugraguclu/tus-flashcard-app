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
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize } from '../constants/theme';
import type { Subject } from '../lib/types';
import { useI18n } from '../hooks/useI18n';

export const SIDEBAR_WIDTH = 260;

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
};

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

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
    } = props;

    return (
        <View style={[styles.sidebar, !isWide && !sidebarOpen && styles.sidebarHidden]}>
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
                <TouchableOpacity
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
                })}
            </ScrollView>

            <View style={styles.sidebarActions}>
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => navigate(selectedSubject ? `/editor?subject=${encodeURIComponent(selectedSubject)}` : '/editor')}
                        {...webTitle(t('sidebar.addCard'))}
                    >
                        <Text style={styles.actionIcon}>+</Text>
                        <Text style={styles.actionText}>{t('sidebar.addCard')}</Text>
                    </TouchableOpacity>
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

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/import')} {...webTitle(t('root.import'))}>
                    <Text style={styles.settingsBtnText}>📥 {t('sidebar.import')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/note-types')} {...webTitle(t('root.noteTypes'))}>
                    <Text style={styles.settingsBtnText}>🧩 {t('sidebar.noteTypes')}</Text>
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
    sidebarTitle: { fontSize: FontSize.xl, fontWeight: '700', color: colors.accent },
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
