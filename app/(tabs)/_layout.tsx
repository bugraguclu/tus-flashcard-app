import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Pressable,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, FontSize } from '../../constants/theme';
import { getSearchIndexCards } from '../../lib/noteManager';
import { getAllSubjects, getSubjectsForDeck } from '../../lib/subjects';
import { useApp } from '../../contexts/AppContext';
import { Sidebar, SIDEBAR_WIDTH } from '../../components/Sidebar';
import { useI18n } from '../../hooks/useI18n';

export { useApp } from '../../contexts/AppContext';

export default function TabLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const colors = useThemeColors();
    const { t, localeTag } = useI18n();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const {
        selectedSubject,
        setSelectedSubject,
        selectedTopic,
        setSelectedTopic,
        studyPosition,
        activeDeckName,
        dataVersion,
        startupError,
        isLoading,
    } = useApp();

    const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);

    const isWide = windowWidth >= 768;

    // While studying, the sidebar mirrors the card on screen (Anki-style): the shown card's
    // course opens and its topic is highlighted, moving along as the queue advances.
    useEffect(() => {
        if (studyPosition?.subject) {
            setExpandedSubject(studyPosition.subject);
        }
    }, [studyPosition?.subject]);

    const highlightSubject = studyPosition?.subject ?? selectedSubject;
    const highlightTopic = studyPosition?.topic ?? selectedTopic;

    // The deck list is the landing screen and renders full-bleed like Anki's: no sidebar,
    // no mobile header. The usual layout returns as soon as a deck is opened for study.
    const isDeckScreen = pathname === '/decks';

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setWindowWidth(window.width);
        });
        return () => sub?.remove();
    }, []);

    const searchableCards = useMemo(() => {
        try {
            return getSearchIndexCards();
        } catch (e) {
            console.warn('[Layout] getSearchIndexCards failed:', e);
            return [];
        }
    }, [dataVersion]);

    // Courses are deck-specific: the sidebar lists only the active deck's own courses
    // (an empty deck lists none). Without a deck context the full list stays visible.
    const subjects = useMemo(() => {
        try {
            return activeDeckName ? getSubjectsForDeck(activeDeckName) : getAllSubjects();
        } catch (e) {
            console.warn('[Layout] subject list failed:', e);
            return [];
        }
    }, [dataVersion, activeDeckName]);

    const { subjectCounts, topicCounts } = useMemo(() => {
        const nextSubjectCounts = new Map<string, number>();
        const nextTopicCounts = new Map<string, Map<string, number>>();

        for (const card of searchableCards) {
            nextSubjectCounts.set(card.subject, (nextSubjectCounts.get(card.subject) ?? 0) + 1);

            let perTopic = nextTopicCounts.get(card.subject);
            if (!perTopic) {
                perTopic = new Map<string, number>();
                nextTopicCounts.set(card.subject, perTopic);
            }
            perTopic.set(card.topic, (perTopic.get(card.topic) ?? 0) + 1);
        }

        return {
            subjectCounts: nextSubjectCounts,
            topicCounts: nextTopicCounts,
        };
    }, [searchableCards]);

    const getSubjectCount = useCallback(
        (subjectId: string) => subjectCounts.get(subjectId) ?? 0,
        [subjectCounts],
    );

    const getTopicCount = useCallback(
        (subjectId: string, topic: string) => topicCounts.get(subjectId)?.get(topic) ?? 0,
        [topicCounts],
    );

    // Navigation must show every topic that actually has cards, not just the seeded list —
    // otherwise a card created with a fresh topic is unreachable from the sidebar.
    const getTopicsForSubject = useCallback(
        (subjectId: string) => {
            const staticTopics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];
            const discovered = [...(topicCounts.get(subjectId)?.keys() ?? [])]
                .filter((topic) => !staticTopics.includes(topic))
                .sort((a, b) => a.localeCompare(b, localeTag));
            return [...staticTopics, ...discovered];
        },
        [subjects, topicCounts, localeTag],
    );

    // "Tüm Dersler" counts only the listed (deck-scoped) courses' cards.
    const totalCards = useMemo(
        () => subjects.reduce((sum, entry) => sum + (subjectCounts.get(entry.id) ?? 0), 0),
        [subjects, subjectCounts],
    );

    const navigate = useCallback((path: string) => {
        router.push(path as any);
        if (!isWide) setSidebarOpen(false);
    }, [isWide, router]);

    const handleSubjectPress = (subjectId: string) => {
        setSelectedSubject(subjectId);
        setSelectedTopic(null);
        navigate('/');
    };

    const handleToggleExpand = (subjectId: string) => {
        setExpandedSubject((prev) => (prev === subjectId ? null : subjectId));
    };

    const handleTopicPress = (subjectId: string, topic: string) => {
        setSelectedSubject(subjectId);
        setSelectedTopic(topic);
        navigate('/');
    };

    const handleAllPress = () => {
        setSelectedSubject(null);
        setSelectedTopic(null);
        setExpandedSubject(null);
        // Inside a deck, "Tüm Dersler" means that whole deck — not the whole collection.
        navigate(activeDeckName ? `/?deck=${encodeURIComponent(activeDeckName)}` : '/');
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingEmoji}>🧠</Text>
                <Text style={styles.loadingText}>{t('tabs.loadingApp')}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {!isWide && !isDeckScreen && (
                <View style={styles.mobileHeader}>
                    <TouchableOpacity
                        style={styles.hamburger}
                        onPress={() => setSidebarOpen((prev) => !prev)}
                        accessibilityRole="button"
                        accessibilityLabel={sidebarOpen ? t('tabs.closeMenu') : t('tabs.openMenu')}
                    >
                        <Text style={styles.hamburgerText}>☰</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => router.push('/decks' as any)}
                        accessibilityRole="button"
                        accessibilityLabel={t('tabs.backToDecks')}
                    >
                        <Text style={styles.mobileTitle}>🧠 TusAnkiM</Text>
                    </TouchableOpacity>
                    <View style={{ width: 40 }} />
                </View>
            )}

            <View style={styles.appLayout}>
                {!isDeckScreen && (
                    <Sidebar
                        isWide={isWide}
                        sidebarOpen={sidebarOpen}
                        subjects={subjects}
                        selectedSubject={highlightSubject}
                        selectedTopic={highlightTopic}
                        expandedSubject={expandedSubject}
                        totalCards={totalCards}
                        getSubjectCount={getSubjectCount}
                        getTopicCount={getTopicCount}
                        getTopicsForSubject={getTopicsForSubject}
                        onAllPress={handleAllPress}
                        onSubjectPress={handleSubjectPress}
                        onToggleExpand={handleToggleExpand}
                        onTopicPress={handleTopicPress}
                        navigate={navigate}
                        // Anki scopes the stats screen to the current deck by default.
                        statsPath={activeDeckName ? `/stats?deck=${encodeURIComponent(activeDeckName)}` : '/stats'}
                    />
                )}

                {!isWide && sidebarOpen && !isDeckScreen ? (
                    <Pressable style={styles.overlay} onPress={() => setSidebarOpen(false)} />
                ) : null}

                <View style={[styles.mainContent, isWide && !isDeckScreen && styles.mainContentWithSidebar]}>
                    {startupError ? (
                        <View style={styles.startupErrorContainer}>
                            <Text style={styles.startupErrorIcon}>📱</Text>
                            <Text style={styles.startupErrorTitle}>{startupError}</Text>
                            <Text style={styles.startupErrorText}>
                                {t('tabs.nativeOnly')}
                            </Text>
                        </View>
                    ) : (
                        <Slot />
                    )}
                </View>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.bgPrimary,
    },
    loadingEmoji: { fontSize: 48, marginBottom: 12 },
    loadingText: { fontSize: FontSize.lg, color: colors.textMuted, fontWeight: '500' },
    appLayout: { flex: 1, flexDirection: 'row' },

    mobileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: colors.bgSidebar,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    hamburger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hamburgerText: { fontSize: 22, color: colors.textPrimary },
    mobileTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.accent },

    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 99,
    },

    mainContent: { flex: 1 },
    mainContentWithSidebar: { marginLeft: SIDEBAR_WIDTH },

    startupErrorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    startupErrorIcon: {
        fontSize: 48,
        marginBottom: Spacing.md,
    },
    startupErrorTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    startupErrorText: {
        fontSize: FontSize.md,
        color: colors.textMuted,
        textAlign: 'center',
    },
    });
}
