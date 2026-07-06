import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Pressable,
} from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { getSearchIndexCards } from '../../lib/noteManager';
import { useApp } from './app-context';
import { Sidebar, SIDEBAR_WIDTH } from './sidebar';

export { useApp } from './app-context';

export default function TabLayout() {
    const router = useRouter();
    const {
        selectedSubject,
        setSelectedSubject,
        selectedTopic,
        setSelectedTopic,
        dataVersion,
        startupError,
        isLoading,
    } = useApp();

    const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);

    const isWide = windowWidth >= 768;

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

    const totalCards = searchableCards.length;

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
        navigate('/');
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingEmoji}>🧠</Text>
                <Text style={styles.loadingText}>TusAnkiM yükleniyor...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {!isWide && (
                <View style={styles.mobileHeader}>
                    <TouchableOpacity
                        style={styles.hamburger}
                        onPress={() => setSidebarOpen((prev) => !prev)}
                        accessibilityRole="button"
                        accessibilityLabel={sidebarOpen ? 'Menüyü kapat' : 'Menüyü aç'}
                    >
                        <Text style={styles.hamburgerText}>☰</Text>
                    </TouchableOpacity>
                    <Text style={styles.mobileTitle}>🧠 TusAnkiM</Text>
                    <View style={{ width: 40 }} />
                </View>
            )}

            <View style={styles.appLayout}>
                <Sidebar
                    isWide={isWide}
                    sidebarOpen={sidebarOpen}
                    selectedSubject={selectedSubject}
                    selectedTopic={selectedTopic}
                    expandedSubject={expandedSubject}
                    totalCards={totalCards}
                    getSubjectCount={getSubjectCount}
                    getTopicCount={getTopicCount}
                    onAllPress={handleAllPress}
                    onSubjectPress={handleSubjectPress}
                    onToggleExpand={handleToggleExpand}
                    onTopicPress={handleTopicPress}
                    navigate={navigate}
                />

                {!isWide && sidebarOpen ? (
                    <Pressable style={styles.overlay} onPress={() => setSidebarOpen(false)} />
                ) : null}

                <View style={[styles.mainContent, isWide && styles.mainContentWithSidebar]}>
                    {startupError ? (
                        <View style={styles.startupErrorContainer}>
                            <Text style={styles.startupErrorIcon}>📱</Text>
                            <Text style={styles.startupErrorTitle}>{startupError}</Text>
                            <Text style={styles.startupErrorText}>
                                Lütfen uygulamayı iOS veya Android cihazınızdan kullanın.
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.bgPrimary,
    },
    loadingEmoji: { fontSize: 48, marginBottom: 12 },
    loadingText: { fontSize: FontSize.lg, color: Colors.textMuted, fontWeight: '500' },
    appLayout: { flex: 1, flexDirection: 'row' },

    mobileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: Colors.bgSidebar,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    hamburger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    hamburgerText: { fontSize: 22, color: Colors.textPrimary },
    mobileTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.accent },

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
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    startupErrorText: {
        fontSize: FontSize.md,
        color: Colors.textMuted,
        textAlign: 'center',
    },
});
