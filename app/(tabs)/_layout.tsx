// ============================================================
// TUS Flashcard - Ana Layout
// Orijinal tasarıma uygun: Sol sidebar + Sağ ana içerik
// Web'de sidebar görünür, mobilde hamburger menü
// Dersler açılır - alt başlık (topic) seçilebilir
// ============================================================

import React, { useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Pressable, Linking,
    Platform,
} from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS } from '../../lib/data';
import {
    loadCardStates,
    loadCustomCards,
    loadSettings,
    saveCustomCards,
    DEFAULT_SETTINGS,
    clearLegacyCardStates,
} from '../../lib/storage';
import { initDB, dbIndexAllCards, getDB } from '../../lib/db';
import { runDailyMaintenance } from '../../lib/maintenance';
import { initAnkiData } from '../../lib/ankiInit';
import { getSearchIndexCards } from '../../lib/noteManager';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from '../../lib/legacyMigration';
import type { AppSettings } from '../../lib/types';

// -- Context: Sidebar seçimi ve veriyi paylaşmak için --
type AppContextType = {
    selectedSubject: string | null;
    setSelectedSubject: (s: string | null) => void;
    selectedTopic: string | null;
    setSelectedTopic: (t: string | null) => void;
    settings: AppSettings;
    refreshData: () => Promise<void>;
};
export const AppContext = createContext<AppContextType>({
    selectedSubject: null,
    setSelectedSubject: () => { },
    selectedTopic: null,
    setSelectedTopic: () => { },
    settings: DEFAULT_SETTINGS,
    refreshData: async () => { },
});
export const useApp = () => useContext(AppContext);

export default function TabLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);

    const isWide = windowWidth >= 768;

    useEffect(() => {
        const sub = Dimensions.addEventListener('change', ({ window }) => {
            setWindowWidth(window.width);
        });
        return () => sub?.remove();
    }, []);

    const refreshData = useCallback(async () => {
        const s = await loadSettings();
        setSettings(s);
    }, []);

    // App başlangıcı: DB init + migration + FTS + maintenance
    useEffect(() => {
        async function startup() {
            try {
                // D1: SQLite DB init + migrations
                initDB();
                console.log('[App] SQLite DB initialized.');

                // Build base Anki entities (decks, notes, cards) on first launch.
                const ankiResult = initAnkiData();
                if (ankiResult.initialized) {
                    console.log(`[App] Anki data initialized: ${ankiResult.notesCreated} notes, ${ankiResult.cardsCreated} cards.`);
                }

                // One-shot migration from legacy AsyncStorage custom cards to canonical notes/anki_cards.
                const legacyCustomCards = await loadCustomCards();
                const customMigration = migrateLegacyCustomCardsToAnki(legacyCustomCards);
                if (!customMigration.alreadyMigrated) {
                    console.log(`[App] Legacy custom cards migration: ${customMigration.migratedCards} migrated.`);
                    await saveCustomCards([]);
                }

                // One-shot migration from legacy AsyncStorage card states to canonical anki_cards.
                const asyncStates = await loadCardStates();
                if (Object.keys(asyncStates).length > 0) {
                    const migrationResult = migrateLegacyCardStatesToAnki(asyncStates, await loadSettings());
                    if (!migrationResult.alreadyMigrated) {
                        console.log(`[App] Legacy card state migration: ${migrationResult.migratedCards} migrated, ${migrationResult.skippedCards} skipped.`);
                        await clearLegacyCardStates();
                    }
                }

                // Rebuild FTS index only if empty.
                const db = getDB();
                const ftsRow = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM cards_fts');
                if (!ftsRow?.cnt) {
                    const searchableCards = getSearchIndexCards();
                    dbIndexAllCards(searchableCards);
                    console.log(`[App] FTS indexed ${searchableCards.length} cards.`);
                }

                // D4: Daily maintenance (auto-unbury)
                const { unburiedCount, didRun } = runDailyMaintenance();
                if (didRun) {
                    console.log(`[App] Maintenance ran: ${unburiedCount} cards unburied.`);
                }
            } catch (e) {
                console.warn('[App] DB startup error (falling back to AsyncStorage):', e);
            }

            // Veriyi yükle
            await refreshData();
        }
        startup();
    }, []);

    const searchableCards = useMemo(() => {
        try {
            return getSearchIndexCards();
        } catch {
            return [];
        }
    }, [pathname, selectedSubject, selectedTopic]);

    // Sidebar counters from canonical cards.
    const getSubjectCount = (subjectId: string) =>
        searchableCards.filter((card) => card.subject === subjectId).length;

    const getTopicCount = (subjectId: string, topic: string) =>
        searchableCards.filter((card) => card.subject === subjectId && card.topic === topic).length;

    const totalCards = searchableCards.length;

    const navigate = (path: string) => {
        router.push(path as any);
        if (!isWide) setSidebarOpen(false);
    };

    // Ders tıklaması: açıp kapatma + seçim
    const handleSubjectPress = (subjectId: string) => {
        if (expandedSubject === subjectId) {
            // Aynı derse tekrar tıklanınca: sadece o dersi seç (topic yok)
            setSelectedSubject(subjectId);
            setSelectedTopic(null);
            navigate('/');
        } else {
            // Farklı derse tıklandığında açıyoruz
            setExpandedSubject(subjectId);
            setSelectedSubject(subjectId);
            setSelectedTopic(null);
            navigate('/');
        }
    };

    // Konu (topic) tıklaması
    const handleTopicPress = (subjectId: string, topic: string) => {
        setSelectedSubject(subjectId);
        setSelectedTopic(topic);
        navigate('/');
    };

    // Tüm Dersler tıklaması
    const handleAllPress = () => {
        setSelectedSubject(null);
        setSelectedTopic(null);
        setExpandedSubject(null);
        navigate('/');
    };

    // ---- SIDEBAR ----
    const renderSidebar = () => (
        <View style={[styles.sidebar, !isWide && !sidebarOpen && styles.sidebarHidden]}>
            {/* Header */}
            <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>🧠 TusAnkiM</Text>
                <Text style={styles.sidebarSubtitle}>Spaced Repetition</Text>
            </View>

            {/* Subject List */}
            <ScrollView style={styles.subjectList} showsVerticalScrollIndicator={false}>
                {/* Tüm Dersler */}
                <TouchableOpacity
                    style={[styles.subjectItem, !selectedSubject && !selectedTopic && styles.subjectItemActive]}
                    onPress={handleAllPress}
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

                {TUS_SUBJECTS.map(sub => {
                    const isExpanded = expandedSubject === sub.id;
                    const isSelected = selectedSubject === sub.id && !selectedTopic;

                    return (
                        <View key={sub.id}>
                            {/* Ders başlığı */}
                            <TouchableOpacity
                                style={[styles.subjectItem, isSelected && styles.subjectItemActive]}
                                onPress={() => handleSubjectPress(sub.id)}
                            >
                                <Text style={styles.subjectIcon}>{sub.icon}</Text>
                                <Text style={[styles.subjectName, isSelected && styles.subjectNameActive]}>
                                    {sub.name}
                                </Text>
                                <View style={[styles.subjectCount, isSelected && styles.subjectCountActive]}>
                                    <Text style={[styles.subjectCountText, isSelected && styles.subjectCountTextActive]}>
                                        {getSubjectCount(sub.id)}
                                    </Text>
                                </View>
                                {/* Açılır/kapanır ok */}
                                <Text style={[styles.expandArrow, isExpanded && styles.expandArrowOpen]}>
                                    {isExpanded ? '▾' : '▸'}
                                </Text>
                            </TouchableOpacity>

                            {/* Alt başlıklar (topics) */}
                            {isExpanded && sub.topics.map(topic => {
                                const isTopicSelected = selectedSubject === sub.id && selectedTopic === topic;
                                return (
                                    <TouchableOpacity
                                        key={topic}
                                        style={[styles.topicItem, isTopicSelected && styles.topicItemActive]}
                                        onPress={() => handleTopicPress(sub.id, topic)}
                                    >
                                        <View style={[styles.topicDot, isTopicSelected && styles.topicDotActive]} />
                                        <Text style={[styles.topicName, isTopicSelected && styles.topicNameActive]}>
                                            {topic}
                                        </Text>
                                        <Text style={[styles.topicCount, isTopicSelected && styles.topicCountActive]}>
                                            {getTopicCount(sub.id, topic)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    );
                })}
            </ScrollView>

            {/* Bottom Actions */}
            <View style={styles.sidebarActions}>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/editor')}>
                        <Text style={styles.actionIcon}>+</Text>
                        <Text style={styles.actionText}>Kart Ekle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/browser')}>
                        <Text style={styles.actionIcon}>🗂️</Text>
                        <Text style={styles.actionText}>Tarayıcı</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => navigate('/stats')}>
                        <Text style={styles.actionIcon}>📊</Text>
                        <Text style={styles.actionText}>İstatistik</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.settingsBtn} onPress={() => navigate('/settings')}>
                    <Text style={styles.settingsBtnText}>⚙️ Ayarlar</Text>
                </TouchableOpacity>

                {/* Powered by */}
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

    // ---- OVERLAY for mobile sidebar ----
    const renderOverlay = () => (
        !isWide && sidebarOpen ? (
            <Pressable style={styles.overlay} onPress={() => setSidebarOpen(false)} />
        ) : null
    );

    return (
        <AppContext.Provider value={{
            selectedSubject, setSelectedSubject,
            selectedTopic, setSelectedTopic,
            settings, refreshData,
        }}>
            <View style={styles.container}>
                {/* Mobile hamburger */}
                {!isWide && (
                    <View style={styles.mobileHeader}>
                        <TouchableOpacity style={styles.hamburger} onPress={() => setSidebarOpen(!sidebarOpen)}>
                            <Text style={styles.hamburgerText}>☰</Text>
                        </TouchableOpacity>
                        <Text style={styles.mobileTitle}>🧠 TusAnkiM</Text>
                        <View style={{ width: 40 }} />
                    </View>
                )}

                <View style={styles.appLayout}>
                    {renderSidebar()}
                    {renderOverlay()}

                    {/* Main Content */}
                    <View style={[styles.mainContent, isWide && styles.mainContentWithSidebar]}>
                        <Slot />
                    </View>
                </View>
            </View>
        </AppContext.Provider>
    );
}

const SIDEBAR_WIDTH = 260;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    appLayout: { flex: 1, flexDirection: 'row' },

    // Mobile header
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

    // Sidebar
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

    // Subject list
    subjectList: { flex: 1, paddingVertical: Spacing.sm },
    subjectItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: Spacing.lg,
        borderRadius: BorderRadius.sm,
        marginHorizontal: Spacing.sm,
        marginVertical: 1,
    },
    subjectItemActive: {
        backgroundColor: Colors.accentLight,
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

    // Expand arrow
    expandArrow: {
        fontSize: 11,
        color: Colors.textMuted,
        marginLeft: 6,
        width: 14,
        textAlign: 'center',
    },
    expandArrowOpen: {
        color: Colors.accent,
    },

    // Topic items (alt başlıklar)
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
    topicItemActive: {
        backgroundColor: Colors.accentLight,
    },
    topicDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.border,
        marginRight: 8,
    },
    topicDotActive: {
        backgroundColor: Colors.accent,
    },
    topicName: {
        flex: 1,
        fontSize: FontSize.sm,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    topicNameActive: {
        color: Colors.accent,
        fontWeight: '600',
    },
    topicCount: {
        fontSize: FontSize.xs,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    topicCountActive: {
        color: Colors.accent,
        fontWeight: '700',
    },

    // Sidebar actions
    sidebarActions: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: Spacing.sm,
    },
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

    // Overlay
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 99,
    },

    // Main content
    mainContent: { flex: 1 },
    mainContentWithSidebar: { marginLeft: SIDEBAR_WIDTH },
});
