import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize } from '../../constants/theme';
import { TUS_SUBJECTS } from '../../lib/data';

export const SIDEBAR_WIDTH = 260;

type SidebarProps = {
    isWide: boolean;
    sidebarOpen: boolean;
    selectedSubject: string | null;
    selectedTopic: string | null;
    expandedSubject: string | null;
    totalCards: number;
    getSubjectCount: (subjectId: string) => number;
    getTopicCount: (subjectId: string, topic: string) => number;
    onAllPress: () => void;
    onSubjectPress: (subjectId: string) => void;
    onToggleExpand: (subjectId: string) => void;
    onTopicPress: (subjectId: string, topic: string) => void;
    navigate: (path: string) => void;
};

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

export function Sidebar(props: SidebarProps) {
    const {
        isWide,
        sidebarOpen,
        selectedSubject,
        selectedTopic,
        expandedSubject,
        totalCards,
        getSubjectCount,
        getTopicCount,
        onAllPress,
        onSubjectPress,
        onToggleExpand,
        onTopicPress,
        navigate,
    } = props;

    return (
        <View style={[styles.sidebar, !isWide && !sidebarOpen && styles.sidebarHidden]}>
            <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>🧠 TusAnkiM</Text>
                <Text style={styles.sidebarSubtitle}>Spaced Repetition</Text>
            </View>

            <ScrollView style={styles.subjectList} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                    style={[styles.subjectItem, !selectedSubject && !selectedTopic && styles.subjectItemActive]}
                    onPress={onAllPress}
                >
                    <Text style={styles.subjectIcon}>📚</Text>
                    <Text style={[styles.subjectName, !selectedSubject && !selectedTopic && styles.subjectNameActive]}>
                        Tüm Dersler
                    </Text>
                    <View style={[styles.subjectCount, !selectedSubject && !selectedTopic && styles.subjectCountActive]}>
                        <Text style={[styles.subjectCountText, !selectedSubject && !selectedTopic && styles.subjectCountTextActive]}>
                            {totalCards}
                        </Text>
                    </View>
                </TouchableOpacity>

                {TUS_SUBJECTS.map((subject) => {
                    const isExpanded = expandedSubject === subject.id;
                    const isSelected = selectedSubject === subject.id && !selectedTopic;

                    return (
                        <View key={subject.id}>
                            <View style={[styles.subjectRow, isSelected && styles.subjectItemActive]}>
                                <TouchableOpacity
                                    style={styles.subjectItem}
                                    onPress={() => onSubjectPress(subject.id)}
                                    {...webTitle(`${subject.name} dersini calis`)}
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
                                    {...webTitle(isExpanded ? 'Alt basliklari gizle' : 'Alt basliklari goster')}
                                >
                                    <Text style={[styles.expandArrow, isExpanded && styles.expandArrowOpen]}>
                                        {isExpanded ? '▾' : '▸'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {isExpanded && subject.topics.map((topic) => {
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
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/editor')} {...webTitle('Yeni kart ekle')}>
                        <Text style={styles.actionIcon}>+</Text>
                        <Text style={styles.actionText}>Kart Ekle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/browser')} {...webTitle('Kart tarayicisini ac')}>
                        <Text style={styles.actionIcon}>🗂️</Text>
                        <Text style={styles.actionText}>Tarayıcı</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/stats')} {...webTitle('Istatistikleri goruntule')}>
                        <Text style={styles.actionIcon}>📊</Text>
                        <Text style={styles.actionText}>İstatistik</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/settings')} {...webTitle('Uygulama ayarlari')}>
                    <Text style={styles.settingsBtnText}>⚙️ Ayarlar</Text>
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

const styles = StyleSheet.create({
    sidebar: {
        width: SIDEBAR_WIDTH,
        backgroundColor: Colors.bgSidebar,
        borderRightWidth: 1,
        borderRightColor: Colors.border,
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
        borderBottomColor: Colors.border,
    },
    sidebarTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.accent },
    sidebarSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, letterSpacing: 0.5, marginTop: 2 },
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
    subjectItemActive: { backgroundColor: Colors.accentLight },
    expandBtn: {
        paddingVertical: 9,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subjectIcon: { fontSize: 16, width: 26 },
    subjectName: { flex: 1, fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '500' },
    subjectNameActive: { color: Colors.accent, fontWeight: '700' },
    subjectCount: {
        backgroundColor: 'rgba(0,0,0,0.04)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 28,
        alignItems: 'center',
    },
    subjectCountActive: { backgroundColor: Colors.accent },
    subjectCountText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
    subjectCountTextActive: { color: Colors.white },
    expandArrow: {
        fontSize: 11,
        color: Colors.textMuted,
        marginLeft: 6,
        width: 14,
        textAlign: 'center',
    },
    expandArrowOpen: { color: Colors.accent },
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
    topicItemActive: { backgroundColor: Colors.accentLight },
    topicDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.border,
        marginRight: 8,
    },
    topicDotActive: { backgroundColor: Colors.accent },
    topicName: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
    topicNameActive: { color: Colors.accent, fontWeight: '600' },
    topicCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500' },
    topicCountActive: { color: Colors.accent, fontWeight: '700' },
    sidebarActions: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    actionRow: { flexDirection: 'row', gap: 6, marginBottom: Spacing.sm },
    actionBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        gap: 2,
    },
    actionIcon: { fontSize: 16 },
    actionText: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary },
    settingsBtn: {
        paddingVertical: 8,
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    settingsBtnText: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textSecondary },
    creditContainer: { alignItems: 'center', paddingVertical: 6 },
    creditText: { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.3 },
    creditName: { fontWeight: '700', color: Colors.accent },
});
