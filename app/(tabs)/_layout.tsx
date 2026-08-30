import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    View,
    StyleSheet,
    Dimensions,
    Keyboard,
    Pressable,
} from 'react-native';
import { Text } from '../../components/Typography';
import { TouchableOpacity } from '../../components/Touchable';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ColorScheme, Spacing, FontSize } from '../../constants/theme';
import { getSearchIndexCards } from '../../lib/noteManager';
import { getAllSubjects, getSubjectsForDeck } from '../../lib/subjects';
import { useApp } from '../../contexts/AppContext';
import { Sidebar, SIDEBAR_WIDTH } from '../../components/Sidebar';
import { useDrawerProgress } from '../../hooks/useDrawerAnimation';
import { useI18n } from '../../hooks/useI18n';

export { useApp } from '../../contexts/AppContext';

export default function TabLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
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
    // One progress value drives both the drawer slide and the overlay fade, so they cannot
    // drift apart. On wide layouts the drawer is permanently open.
    const drawerProgress = useDrawerProgress(isWide || sidebarOpen);

    useEffect(() => {
        if (!isWide) setSidebarOpen(false);
    }, [pathname, isWide]);

    // While studying, the sidebar mirrors the card on screen (Anki-style): the shown card's
    // course opens and its topic is highlighted, moving along as the queue advances.
    useEffect(() => {
        if (studyPosition?.subject) {
            setExpandedSubject(studyPosition.subject);
        }
    }, [studyPosition?.subject]);

    const highlightSubject = studyPosition?.subject ?? selectedSubject;
    const highlightTopic = studyPosition?.topic ?? selectedTopic;

    // Root-stack modals also change usePathname() while the tabs remain mounted underneath.
    // Remember the actual tab route so opening Import/Export cannot momentarily add this
    // layout's mobile header and push the deck list down during the transition.
    const lastTabPath = useRef('/decks');
    if (pathname === '/' || pathname === '/decks') {
        lastTabPath.current = pathname;
    }
    const isDeckScreen = lastTabPath.current === '/decks';

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setWindowWidth(window.width);
        });
        return () => sub?.remove();
    }, []);

    const searchableCards = useMemo(() => {
        if (isLoading) return [];
        try {
            return getSearchIndexCards();
        } catch (e) {
            console.warn('[Layout] getSearchIndexCards failed:', e);
            return [];
        }
    }, [dataVersion, isLoading]);

    // Courses are deck-specific: the sidebar lists only the active deck's own courses
    // (an empty deck lists none). Without a deck context the full list stays visible.
    const subjects = useMemo(() => {
        if (isLoading) return [];
        try {
            return activeDeckName ? getSubjectsForDeck(activeDeckName) : getAllSubjects();
        } catch (e) {
            console.warn('[Layout] subject list failed:', e);
            return [];
        }
    }, [dataVersion, activeDeckName, isLoading]);

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

    // Stable identities: the sidebar's rows are memoized on their props, so a handler that
    // changed every render would re-render the whole course list on any layout state change.
    const handleSubjectPress = useCallback((subjectId: string) => {
        setSelectedSubject(subjectId);
        setSelectedTopic(null);
        navigate('/');
    }, [navigate, setSelectedSubject, setSelectedTopic]);

    const handleToggleExpand = useCallback((subjectId: string) => {
        setExpandedSubject((prev) => (prev === subjectId ? null : subjectId));
    }, []);

    const handleTopicPress = useCallback((subjectId: string, topic: string) => {
        setSelectedSubject(subjectId);
        setSelectedTopic(topic);
        navigate('/');
    }, [navigate, setSelectedSubject, setSelectedTopic]);

    const handleAllPress = useCallback(() => {
        setSelectedSubject(null);
        setSelectedTopic(null);
        setExpandedSubject(null);
        // Inside a deck, "Tüm Dersler" means that whole deck — not the whole collection.
        navigate(activeDeckName ? `/?deck=${encodeURIComponent(activeDeckName)}` : '/');
    }, [activeDeckName, navigate, setSelectedSubject, setSelectedTopic]);

    // No loading branch here: the root CatalogGate holds the native splash until startup
    // finishes, so this layout only ever mounts with a ready collection.
    return (
        <View style={styles.container}>
            {!isWide && !isDeckScreen && (
                <View style={[styles.mobileHeader, { paddingTop: insets.top + Spacing.sm }]}>
                    <TouchableOpacity
                        style={styles.hamburger}
                        onPress={() => {
                            if (!sidebarOpen) Keyboard.dismiss();
                            setSidebarOpen((prev) => !prev);
                        }}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={sidebarOpen ? t('tabs.closeMenu') : t('tabs.openMenu')}
                        accessibilityState={{ expanded: sidebarOpen }}
                    >
                        <Text style={styles.hamburgerText}>☰</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <View style={{ width: 48 }} />
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
                        drawerProgress={drawerProgress}
                        // Anki scopes the stats screen to the current deck by default.
                        statsPath={activeDeckName ? `/stats?deck=${encodeURIComponent(activeDeckName)}` : '/stats'}
                    />
                )}

                {!isWide && !isDeckScreen ? (
                    // Kept mounted while closed so it can fade out with the drawer; taps pass
                    // straight through to the screen underneath until it is open.
                    <Animated.View
                        pointerEvents={sidebarOpen ? 'auto' : 'none'}
                        style={[styles.overlay, { opacity: drawerProgress }]}
                    >
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setSidebarOpen(false)}
                            accessibilityRole="button"
                            accessibilityLabel={t('tabs.closeMenu')}
                        />
                    </Animated.View>
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
    appLayout: { flex: 1, flexDirection: 'row' },

    mobileHeader: {
        position: 'relative',
        zIndex: 200,
        elevation: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: colors.bgSidebar,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    hamburger: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
    hamburgerText: { fontSize: 22, color: colors.textPrimary },
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
