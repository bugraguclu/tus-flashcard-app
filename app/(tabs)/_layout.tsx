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
import { loadSettings, DEFAULT_SETTINGS } from '../../lib/storage';
import type { AppSettings } from '../../lib/types';
import { getSearchIndexCards } from '../../lib/noteManager';
import { AppContext } from './app-context';
import { Sidebar, SIDEBAR_WIDTH } from './sidebar';
import { useAppStartup } from './use-app-startup';

export { useApp } from './app-context';

export default function TabLayout() {
    const router = useRouter();

    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
    const [dataVersion, setDataVersion] = useState(0);

    const isWide = windowWidth >= 768;

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setWindowWidth(window.width);
        });
        return () => sub?.remove();
    }, []);

    const refreshData = useCallback(() => {
        setSettings(loadSettings());
    }, []);

    const bumpDataVersion = useCallback(() => {
        setDataVersion((prev) => prev + 1);
    }, []);

    const { startupError, isLoading } = useAppStartup(refreshData, bumpDataVersion);

    const searchableCards = useMemo(() => {
        try {
            return getSearchIndexCards();
        } catch (e) {
            console.warn('[Layout] getSearchIndexCards failed:', e);
            return [];
        }
    }, [dataVersion]);

    const getSubjectCount = useCallback(
        (subjectId: string) => searchableCards.filter((card) => card.subject === subjectId).length,
        [searchableCards],
    );

    const getTopicCount = useCallback(
        (subjectId: string, topic: string) => (
            searchableCards.filter((card) => card.subject === subjectId && card.topic === topic).length
        ),
        [searchableCards],
    );

    const totalCards = searchableCards.length;

    const navigate = useCallback((path: string) => {
        router.push(path as any);
        if (!isWide) setSidebarOpen(false);
    }, [isWide, router]);

    const handleSubjectPress = (subjectId: string) => {
        if (expandedSubject === subjectId) {
            setSelectedSubject(subjectId);
            setSelectedTopic(null);
            navigate('/');
            return;
        }

        setExpandedSubject(subjectId);
        setSelectedSubject(subjectId);
        setSelectedTopic(null);
        navigate('/');
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
        <AppContext.Provider
            value={{
                selectedSubject,
                setSelectedSubject,
                selectedTopic,
                setSelectedTopic,
                settings,
                refreshData,
                dataVersion,
                bumpDataVersion,
                startupError,
            }}
        >
            <View style={styles.container}>
                {!isWide && (
                    <View style={styles.mobileHeader}>
                        <TouchableOpacity style={styles.hamburger} onPress={() => setSidebarOpen((prev) => !prev)}>
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
                        onTopicPress={handleTopicPress}
                        navigate={navigate}
                    />

                    {!isWide && sidebarOpen ? (
                        <Pressable style={styles.overlay} onPress={() => setSidebarOpen(false)} />
                    ) : null}

                    <View style={[styles.mainContent, isWide && styles.mainContentWithSidebar]}>
                        {startupError ? (
                            <View style={styles.startupErrorBanner}>
                                <Text style={styles.startupErrorTitle}>⚠️ Başlangıç Hatası</Text>
                                <Text style={styles.startupErrorText}>{startupError}</Text>
                            </View>
                        ) : null}
                        <Slot />
                    </View>
                </View>
            </View>
        </AppContext.Provider>
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

    startupErrorBanner: {
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        padding: Spacing.md,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#efc5c0',
        backgroundColor: '#fff2f0',
    },
    startupErrorTitle: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        color: '#b42318',
        marginBottom: 4,
    },
    startupErrorText: {
        fontSize: FontSize.sm,
        color: '#b42318',
    },
});
