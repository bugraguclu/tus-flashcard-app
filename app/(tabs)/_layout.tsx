import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Keyboard,
    Pressable,
    BackHandler,
    PanResponder,
    Platform,
    ToastAndroid,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, type ColorScheme, Spacing, FontSize } from '../../constants/theme';
import { getNavigationCardCounts } from '../../lib/noteManager';
import { getAllSubjects, getSubjectsForDeck } from '../../lib/subjects';
import { buildDeckTree, getAllDecks, getCardCountsByDeck } from '../../lib/deckManager';
import { getDeckPathNames, getRootDeckName, getScopedBrowserPath } from '../../lib/deckNavigation';
import {
    useAppSettings,
    useCollectionInvalidation,
    useStartupStatus,
    useStudyPosition,
    useStudyScope,
} from '../../contexts/AppContext';
import { Sidebar, SIDEBAR_WIDTH } from '../../components/Sidebar';
import { useI18n } from '../../hooks/useI18n';
import { consumeSchedulingRevision } from '../../lib/deferredInvalidation';

export default function TabLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const { t, l, localeTag } = useI18n();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { settings } = useAppSettings();
    const { collectionVersion, getSchedulingRevision } = useCollectionInvalidation();
    const { startupError, isLoading } = useStartupStatus();
    const studyPosition = useStudyPosition();
    const {
        selectedSubject,
        setSelectedSubject,
        selectedTopic,
        setSelectedTopic,
        activeDeckName,
        setActiveDeckName,
    } = useStudyScope();

    const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
    const [expandedDeckNames, setExpandedDeckNames] = useState<Set<string>>(new Set());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
    const [visibleSchedulingRevision, setVisibleSchedulingRevision] = useState(getSchedulingRevision);
    const lastAndroidBackPressRef = useRef(0);

    const isWide = windowWidth >= 768;

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
    const isStudyScreen = lastTabPath.current === '/';

    // Card answers only mark the scheduler revision. Consume it at a navigation boundary (or
    // when the drawer is explicitly opened) instead of querying counts on every answer.
    const refreshVisibleSchedulingData = useCallback(() => {
        const next = getSchedulingRevision();
        setVisibleSchedulingRevision((previous) => (
            consumeSchedulingRevision(previous, next, () => { })
        ));
    }, [getSchedulingRevision]);

    useEffect(() => {
        refreshVisibleSchedulingData();
    }, [pathname, refreshVisibleSchedulingData]);

    useEffect(() => {
        if (Platform.OS !== 'android' || !settings.doubleBackToExit) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (sidebarOpen) {
                setSidebarOpen(false);
                return true;
            }
            if (pathname !== '/' && pathname !== '/decks') return false;
            const now = Date.now();
            if (now - lastAndroidBackPressRef.current <= 2_000) {
                lastAndroidBackPressRef.current = 0;
                if (pathname === '/') router.replace('/decks' as any);
                else BackHandler.exitApp();
                return true;
            }
            lastAndroidBackPressRef.current = now;
            ToastAndroid.show(
                pathname === '/'
                    ? l('Çalışmadan çıkmak için tekrar geri basın', 'Press back again to leave study')
                    : l('Uygulamadan çıkmak için tekrar geri basın', 'Press back again to exit'),
                ToastAndroid.SHORT,
            );
            return true;
        });
        return () => subscription.remove();
    }, [l, pathname, router, settings.doubleBackToExit, sidebarOpen]);

    const fullScreenDrawerPanResponder = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) => Boolean(
            Platform.OS === 'android'
            && settings.fullScreenNavigationDrawer
            && !isWide
            && !isDeckScreen
            && !sidebarOpen
            && gesture.dx > 18
            && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5
        ),
        onPanResponderRelease: (_event, gesture) => {
            if (gesture.dx < 54) return;
            Keyboard.dismiss();
            setSidebarOpen(true);
        },
    }), [isDeckScreen, isWide, settings.fullScreenNavigationDrawer, sidebarOpen]);

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setWindowWidth(window.width);
        });
        return () => sub?.remove();
    }, []);

    const navigationCounts = useMemo(() => {
        if (isLoading) return [];
        try {
            return getNavigationCardCounts();
        } catch (e) {
            console.warn('[Layout] navigation counts failed:', e);
            return [];
        }
    }, [collectionVersion, visibleSchedulingRevision, isLoading]);

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
    }, [collectionVersion, activeDeckName, isLoading]);

    // The reviewer menu is a deck navigator while a deck is active. A selected subdeck is a
    // highlight inside its top-level tree, not a new tree root: otherwise opening the hamburger
    // from `Parent::Child` would make every parent and sibling disappear.
    const sidebarDeckTree = useMemo(() => {
        if (isLoading || !activeDeckName) return [];
        try {
            const rootDeckName = getRootDeckName(activeDeckName);
            if (!rootDeckName) return [];
            const decks = getAllDecks().filter((deck) => (
                deck.name === rootDeckName || deck.name.startsWith(`${rootDeckName}::`)
            ));
            if (decks.length === 0) return [];
            const counts = getCardCountsByDeck(
                Date.now(),
                settings.dayRolloverHour,
                settings.learnAheadMinutes,
            );
            return buildDeckTree(decks, counts, settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Layout] sidebar deck tree failed:', e);
            return [];
        }
    }, [activeDeckName, collectionVersion, visibleSchedulingRevision, isLoading, settings.dayRolloverHour, settings.learnAheadMinutes]);

    // Reveal only the selected deck's ancestor chain. Opening every parent in a large catalog
    // would flood the drawer with unrelated branches; manual expansion of siblings is preserved.
    useEffect(() => {
        setExpandedDeckNames((previous) => {
            const next = new Set(previous);
            for (const name of getDeckPathNames(activeDeckName)) next.add(name);
            return next;
        });
    }, [activeDeckName, sidebarDeckTree]);

    const { subjectCounts, topicCounts } = useMemo(() => {
        const nextSubjectCounts = new Map<string, number>();
        const nextTopicCounts = new Map<string, Map<string, number>>();

        for (const row of navigationCounts) {
            nextSubjectCounts.set(row.subject, (nextSubjectCounts.get(row.subject) ?? 0) + row.count);

            let perTopic = nextTopicCounts.get(row.subject);
            if (!perTopic) {
                perTopic = new Map<string, number>();
                nextTopicCounts.set(row.subject, perTopic);
            }
            perTopic.set(row.topic, (perTopic.get(row.topic) ?? 0) + row.count);
        }

        return {
            subjectCounts: nextSubjectCounts,
            topicCounts: nextTopicCounts,
        };
    }, [navigationCounts]);

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
        // The drawer belongs to the active study scope. Opening Kartlarım from a root deck or a
        // deeply nested subdeck must browse that exact branch, never the whole collection.
        const target = path === '/browser' ? getScopedBrowserPath(activeDeckName) : path;
        router.push(target as any);
        if (!isWide) setSidebarOpen(false);
    }, [activeDeckName, isWide, router]);

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

    const handleDeckPress = (deckName: string) => {
        setSelectedSubject(null);
        setSelectedTopic(null);
        setActiveDeckName(deckName);
        navigate(`/?deck=${encodeURIComponent(deckName)}`);
    };

    const handleToggleDeckExpand = (deckName: string) => {
        setExpandedDeckNames((previous) => {
            const next = new Set(previous);
            if (next.has(deckName)) next.delete(deckName);
            else next.add(deckName);
            return next;
        });
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
        <View style={styles.container} {...fullScreenDrawerPanResponder.panHandlers}>
            {!isWide && !isDeckScreen && !isStudyScreen && (
                <View style={[styles.mobileHeader, { paddingTop: insets.top + Spacing.sm }]}>
                    <TouchableOpacity
                        style={styles.hamburger}
                        onPress={() => {
                            if (!sidebarOpen) Keyboard.dismiss();
                            if (!sidebarOpen) refreshVisibleSchedulingData();
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
                        deckTree={sidebarDeckTree}
                        activeDeckName={activeDeckName}
                        expandedDeckNames={expandedDeckNames}
                        onDeckPress={handleDeckPress}
                        onToggleDeckExpand={handleToggleDeckExpand}
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
                            <Text style={styles.startupErrorTitle}>{t('root.errorTitle')}</Text>
                            <Text style={styles.startupErrorText}>
                                {t('root.startupErrorMessage')}
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
