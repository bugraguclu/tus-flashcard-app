// ============================================================
// TUS Flashcard - Ana Çalışma Ekranı (Orijinal Tasarım)
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS, TUS_CARDS } from '../../lib/data';
import { getScheduler, getToday, addDaysLocalYMD, todayLocalYMD } from '../../lib/scheduler';
import {
    loadCardStates, saveCardStates, saveCardState, loadAllCardStates,
    loadCustomCards, loadSettings, loadSessionStats,
    saveSessionStats, DEFAULT_SETTINGS,
} from '../../lib/storage';
import { useApp } from './_layout';
import type { Card, CardState, AppSettings, SessionStats, UndoEntry, Grade } from '../../lib/types';

export default function StudyScreen() {
    const { selectedSubject, selectedTopic, cardStates, setCardStates, settings, refreshData } = useApp();

    const [customCards, setCustomCards] = useState<Card[]>([]);
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        reviewed: 0, correct: 0, wrong: 0, startTime: Date.now(), newCardsToday: 0,
    });
    const [queue, setQueue] = useState<Card[]>([]);
    const [currentCard, setCurrentCard] = useState<Card | null>(null);
    const [showingAnswer, setShowingAnswer] = useState(false);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCards, setTotalCards] = useState(0);
    const [nextLearningDue, setNextLearningDue] = useState<number | null>(null);
    const [countdown, setCountdown] = useState('');

    const getAllCards = useCallback(() => [...TUS_CARDS, ...customCards], [customCards]);

    const getCardState = useCallback((cardId: number): CardState => {
        if (cardStates[cardId]) return cardStates[cardId];
        const scheduler = getScheduler(settings.algorithm);
        return {
            interval: 0, repetition: 0, dueDate: todayLocalYMD(), dueTime: 0,
            status: 'new' as const, suspended: false, buried: false,
            easeFactor: settings.startingEase, learningStep: 0,
            relearningStep: -1, lastReviewedAtMs: 0,
            stability: 0, difficulty: 0, elapsedDays: 0, lapses: 0,
            ...scheduler.initCardState(settings),
        };
    }, [cardStates, settings]);

    const buildQueue = useCallback(() => {
        const today = todayLocalYMD();
        const now = Date.now();
        let cards = getAllCards();
        if (selectedSubject) cards = cards.filter(c => c.subject === selectedSubject);
        if (selectedTopic) cards = cards.filter(c => c.topic === selectedTopic);

        const learningCards: Card[] = [];
        const reviewWithDue: { card: Card; dueDate: string }[] = [];
        const newCards: Card[] = [];
        let earliestPendingDue: number | null = null;

        cards.forEach(card => {
            const cs = getCardState(card.id);
            if (cs.suspended || cs.buried) return;
            if (cs.status === 'new') {
                newCards.push(card);
            } else if (cs.status === 'learning') {
                if (!cs.dueTime || cs.dueTime <= now) {
                    learningCards.push(card);
                } else {
                    // Track earliest pending learning card for timer
                    if (!earliestPendingDue || cs.dueTime < earliestPendingDue) {
                        earliestPendingDue = cs.dueTime;
                    }
                }
            } else if (cs.status === 'review' && cs.dueDate <= today) {
                reviewWithDue.push({ card, dueDate: cs.dueDate });
            }
        });

        setNextLearningDue(earliestPendingDue);

        const newCardsToShow = newCards.slice(0, Math.max(0, settings.dailyNewLimit - (sessionStats.newCardsToday || 0)));
        // QW1: Precomputed dueDate — sort comparator'da getCardState() yok
        reviewWithDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const reviewCards = reviewWithDue.map(x => x.card);

        const q = [...learningCards, ...reviewCards, ...newCardsToShow];
        setQueue(q);
        setTotalCards(q.length);
        setCurrentCard(q.length > 0 ? q[0] : null);
        setShowingAnswer(false);
    }, [getAllCards, getCardState, selectedSubject, selectedTopic, settings, sessionStats]);

    useEffect(() => {
        async function load() {
            const [cc, ss] = await Promise.all([loadCustomCards(), loadSessionStats()]);
            setCustomCards(cc);
            setSessionStats(ss);
            setLoading(false);
        }
        load();
    }, []);

    useEffect(() => { if (!loading) buildQueue(); }, [loading, selectedSubject, selectedTopic, cardStates]);

    // Timer: Rebuild queue when next learning card becomes due
    useEffect(() => {
        if (!nextLearningDue) return;
        const delay = Math.max(500, nextLearningDue - Date.now() + 300);
        const timer = setTimeout(() => {
            buildQueue();
        }, delay);
        return () => clearTimeout(timer);
    }, [nextLearningDue]);

    // Countdown timer for waiting UI
    useEffect(() => {
        if (!nextLearningDue || currentCard) {
            setCountdown('');
            return;
        }
        const update = () => {
            const remaining = Math.max(0, nextLearningDue - Date.now());
            if (remaining <= 0) {
                buildQueue();
                return;
            }
            const totalSec = Math.ceil(remaining / 1000);
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            setCountdown(min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}sn`);
        };
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [nextLearningDue, currentCard]);

    // Cevap ver
    const answerCard = useCallback(async (grade: Grade) => {
        if (!currentCard) return;
        const cardId = currentCard.id;
        const cs = getCardState(cardId);

        setUndoStack(prev => [...prev.slice(-29), { cardId, previousState: { ...cs }, card: currentCard }]);

        const scheduler = getScheduler(settings.algorithm);
        const result = scheduler.schedule(cs, grade, settings);
        const updatedCs: CardState = { ...cs, ...result.stateUpdates };

        if (result.isLearning) {
            updatedCs.status = 'learning';
            updatedCs.dueTime = result.minutesUntilDue ? Date.now() + result.minutesUntilDue * 60000 : Date.now() + 60000;
            updatedCs.dueDate = todayLocalYMD();
        } else {
            updatedCs.status = 'review';
            // QW2: UTC bug fix — addDaysLocalYMD() yerel gün kullanır
            updatedCs.dueDate = addDaysLocalYMD(result.interval);
            updatedCs.dueTime = 0;
        }

        // QW5: Per-card save — sadece değişen kartı kaydet (O(1) yazma)
        const newStates = { ...cardStates, [cardId]: updatedCs };
        setCardStates(newStates);
        await saveCardState(cardId, updatedCs);

        const newStats = {
            ...sessionStats,
            reviewed: sessionStats.reviewed + 1,
            correct: grade >= 3 ? sessionStats.correct + 1 : sessionStats.correct,
            wrong: grade < 3 ? sessionStats.wrong + 1 : sessionStats.wrong,
            newCardsToday: cs.status === 'new' ? (sessionStats.newCardsToday || 0) + 1 : sessionStats.newCardsToday,
        };
        setSessionStats(newStats);
        await saveSessionStats(newStats);

        // Remove answered card from queue — DON'T push learning cards back.
        // Learning cards with future dueTime will be picked up by the timer
        // when their wait period expires (just like Anki does).
        const newQueue = queue.slice(1);
        setQueue(newQueue);
        setShowingAnswer(false);
        setCurrentCard(newQueue.length > 0 ? newQueue[0] : null);
    }, [currentCard, cardStates, queue, settings, sessionStats, getCardState]);

    // Geri al
    const undoLast = useCallback(async () => {
        if (undoStack.length === 0) return;
        const undo = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        const newStates = { ...cardStates, [undo.cardId]: undo.previousState };
        setCardStates(newStates);
        await saveCardState(undo.cardId, undo.previousState);
        const newStats = { ...sessionStats, reviewed: Math.max(0, sessionStats.reviewed - 1) };
        setSessionStats(newStats);
        await saveSessionStats(newStats);
        setQueue([undo.card, ...queue]);
        setCurrentCard(undo.card);
        setShowingAnswer(false);
    }, [undoStack, cardStates, queue, sessionStats]);

    // Askıya al (Suspend) - Kartı süresiz dondur
    const handleSuspend = useCallback(async () => {
        if (!currentCard) return;
        const cardId = currentCard.id;
        const cs = getCardState(cardId);

        const updatedCs: CardState = { ...cs, suspended: true };
        const newStates = { ...cardStates, [cardId]: updatedCs };

        setCardStates(newStates);
        await saveCardState(cardId, updatedCs);

        const newQueue = queue.slice(1);
        setQueue(newQueue);
        setShowingAnswer(false);
        setCurrentCard(newQueue.length > 0 ? newQueue[0] : null);
    }, [currentCard, cardStates, queue, getCardState]);

    // Ertele (Bury) - Kartı yarına kadar gizle
    const handleBury = useCallback(async () => {
        if (!currentCard) return;
        const cardId = currentCard.id;
        const cs = getCardState(cardId);

        const updatedCs: CardState = { ...cs, buried: true };
        const newStates = { ...cardStates, [cardId]: updatedCs };

        setCardStates(newStates);
        await saveCardState(cardId, updatedCs);

        const newQueue = queue.slice(1);
        setQueue(newQueue);
        setShowingAnswer(false);
        setCurrentCard(newQueue.length > 0 ? newQueue[0] : null);
    }, [currentCard, cardStates, queue, getCardState]);

    // İstatistikler
    // QW4: useMemo — sadece bağımlılıklar değiştiğinde yeniden hesapla
    const stats = useMemo(() => {
        const today = todayLocalYMD();
        let cards = getAllCards();
        if (selectedSubject) cards = cards.filter(c => c.subject === selectedSubject);
        if (selectedTopic) cards = cards.filter(c => c.topic === selectedTopic);
        let newCount = 0, learningCount = 0, reviewCount = 0;
        cards.forEach(card => {
            const cs = getCardState(card.id);
            if (cs.suspended || cs.buried) return;
            if (cs.status === 'new') newCount++;
            else if (cs.status === 'learning') learningCount++;
            else if (cs.status === 'review' && cs.dueDate <= today) reviewCount++;
        });
        return { newCount, learningCount, reviewCount };
    }, [getAllCards, getCardState, selectedSubject, selectedTopic, cardStates]);

    const getPreview = useCallback(() => {
        if (!currentCard) return null;
        const cs = getCardState(currentCard.id);
        const scheduler = getScheduler(settings.algorithm);
        return scheduler.previewIntervals(cs, settings);
    }, [currentCard, getCardState, settings]);

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingEmoji}>🧠</Text>
                    <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
            </View>
        );
    }

    // stats artık useMemo ile hesaplanıyor (yukarıda)
    const preview = getPreview();
    // QW1b: Render içindeki tekrarlı getCardState() → tek değişken
    const currentCardState = currentCard ? getCardState(currentCard.id) : null;
    const subject = currentCard ? TUS_SUBJECTS.find(s => s.id === currentCard.subject) : null;
    const progress = totalCards > 0 ? ((totalCards - queue.length) / totalCards) * 100 : 100;

    return (
        <View style={styles.container}>
            {/* Üst Bar - Orijinal Tasarım */}
            <View style={styles.topBar}>
                <Text style={styles.topBarTitle}>Bugünün Kartları</Text>
                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeNew }]}>{stats.newCount}</Text>
                        <Text style={styles.statLabel}>YENİ</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeLearn }]}>{stats.learningCount}</Text>
                        <Text style={styles.statLabel}>ÖĞRENİYOR</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeReview }]}>{stats.reviewCount}</Text>
                        <Text style={styles.statLabel}>TEKRAR</Text>
                    </View>
                </View>
            </View>

            {/* Kart Alanı */}
            <ScrollView contentContainerStyle={styles.cardArea}>
                {currentCard ? (
                    <View style={styles.cardContainer}>
                        {/* Kart Başlığı - Orijinal Stilde */}
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardSubject}>{subject ? `${subject.icon} ${subject.name}` : '📝'}</Text>
                            <Text style={styles.cardTopic}>{currentCard.topic}</Text>
                            <View style={[
                                styles.statusBadge,
                                {
                                    backgroundColor: currentCardState?.status === 'new' ? Colors.badgeNewBg
                                        : currentCardState?.status === 'learning' ? Colors.badgeLearnBg
                                            : Colors.badgeReviewBg,
                                },
                            ]}>
                                <Text style={[
                                    styles.statusText,
                                    {
                                        color: currentCardState?.status === 'new' ? Colors.badgeNew
                                            : currentCardState?.status === 'learning' ? Colors.badgeLearn
                                                : Colors.badgeReview,
                                    },
                                ]}>
                                    {currentCardState?.status === 'new' ? 'YENİ'
                                        : currentCardState?.status === 'learning' ? 'ÖĞRENİYOR'
                                            : 'TEKRAR'}
                                </Text>
                            </View>

                            {/* Undo, Bury, Suspend & Edit icons */}
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity style={styles.iconBtn} onPress={handleBury}>
                                <Text style={styles.iconBtnText}>💤</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.iconBtn} onPress={handleSuspend}>
                                <Text style={styles.iconBtnText}>⏸️</Text>
                            </TouchableOpacity>
                            {undoStack.length > 0 && (
                                <TouchableOpacity style={styles.iconBtn} onPress={undoLast}>
                                    <Text style={styles.iconBtnText}>↩️</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Kart Gövdesi */}
                        <View style={styles.cardBody}>
                            <Text style={styles.cardLabel}>SORU</Text>
                            <Text style={styles.questionText}>{currentCard.question}</Text>

                            {showingAnswer ? (
                                <View style={styles.answerSection}>
                                    <Text style={[styles.cardLabel, { color: Colors.accent }]}>CEVAP</Text>
                                    <Text style={styles.answerText}>{currentCard.answer}</Text>
                                </View>
                            ) : (
                                <TouchableOpacity
                                    style={styles.showAnswerBtn}
                                    onPress={() => setShowingAnswer(true)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.showAnswerText}>👁️ Cevabı Göster</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Cevap Butonları */}
                        {showingAnswer && preview && (
                            <View style={styles.answerButtons}>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: Colors.btnAgainBg, borderColor: '#e8c4c0' }]}
                                    onPress={() => answerCard(1)}
                                >
                                    <Text style={[styles.btnTime, { color: Colors.btnAgain }]}>{preview.again}</Text>
                                    <Text style={[styles.btnLabel, { color: Colors.btnAgain }]}>Tekrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: Colors.btnHardBg, borderColor: '#e8d8b5' }]}
                                    onPress={() => answerCard(2)}
                                >
                                    <Text style={[styles.btnTime, { color: Colors.btnHard }]}>{preview.hard}</Text>
                                    <Text style={[styles.btnLabel, { color: Colors.btnHard }]}>Zor</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: Colors.btnGoodBg, borderColor: '#b8dcc8' }]}
                                    onPress={() => answerCard(3)}
                                >
                                    <Text style={[styles.btnTime, { color: Colors.btnGood }]}>{preview.good}</Text>
                                    <Text style={[styles.btnLabel, { color: Colors.btnGood }]}>İyi</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.answerBtn, { backgroundColor: Colors.btnEasyBg, borderColor: '#b8cfe0' }]}
                                    onPress={() => answerCard(4)}
                                >
                                    <Text style={[styles.btnTime, { color: Colors.btnEasy }]}>{preview.easy}</Text>
                                    <Text style={[styles.btnLabel, { color: Colors.btnEasy }]}>Kolay</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Kuyruk info */}
                        <View style={styles.queueInfo}>
                            <Text style={styles.queueText}>
                                Kalan: <Text style={{ fontWeight: '700' }}>{queue.length}</Text> kart  ·  Bugün: <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> tekrar
                            </Text>
                        </View>
                    </View>
                ) : nextLearningDue ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⏳</Text>
                        <Text style={styles.emptyTitle}>Kart Bekleniyor</Text>
                        <Text style={styles.countdownText}>{countdown}</Text>
                        <Text style={styles.emptyDesc}>
                            Öğrenme kartları bekleme süresinde. Süre dolduğunda otomatik olarak gösterilecek.
                        </Text>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎉</Text>
                        <Text style={styles.emptyTitle}>Tebrikler!</Text>
                        <Text style={styles.emptyDesc}>
                            {selectedTopic
                                ? `"${selectedTopic}" konusu`
                                : selectedSubject
                                    ? `"${TUS_SUBJECTS.find(s => s.id === selectedSubject)?.name}" dersi`
                                    : 'Tüm dersler'} için bugünlük tüm kartlar tamamlandı.
                        </Text>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                )}
            </ScrollView>

            {/* Alt Kısayol Bar - Orijinal Gibi */}
            {currentCard && (
                <View style={styles.shortcutBar}>
                    <Text style={styles.shortcutText}>
                        <Text style={styles.shortcutKey}>Space</Text> Cevabı göster  ·
                        <Text style={styles.shortcutKey}>1</Text> Tekrar  ·
                        <Text style={styles.shortcutKey}>2</Text> Zor  ·
                        <Text style={styles.shortcutKey}>3</Text> İyi  ·
                        <Text style={styles.shortcutKey}>4</Text> Kolay  ·
                        <Text style={styles.shortcutKey}>Ctrl+Z</Text> Geri Al
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 48, marginBottom: 12 },
    loadingText: { fontSize: FontSize.lg, color: Colors.textMuted },

    // Top bar - orijinal tasarım
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xxl,
        paddingVertical: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
    },
    topBarTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
    statsRow: { flexDirection: 'row', gap: 20 },
    stat: { alignItems: 'center' },
    statCount: { fontSize: 24, fontWeight: '700' },
    statLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginTop: 2 },

    // Card area
    cardArea: { flexGrow: 1, padding: Spacing.xxl, alignItems: 'center', justifyContent: 'center' },
    cardContainer: { width: '100%', maxWidth: 680 },

    // Card header - orijinal stilde
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: Spacing.sm,
        flexWrap: 'wrap',
    },
    cardSubject: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },
    cardTopic: { fontSize: FontSize.sm, color: Colors.textMuted },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 4,
    },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    iconBtn: {
        width: 32, height: 32, borderRadius: 6,
        backgroundColor: Colors.bgInput,
        alignItems: 'center', justifyContent: 'center',
    },
    iconBtnText: { fontSize: 16 },

    // Card body
    cardBody: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 10,
        padding: 28,
        ...Shadows.md,
        minHeight: 180,
    },
    cardLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        marginBottom: Spacing.sm,
        color: Colors.textMuted,
    },
    questionText: { fontSize: 18, fontWeight: '500', lineHeight: 30, color: Colors.textPrimary },

    answerSection: {
        marginTop: Spacing.xl,
        paddingTop: Spacing.xl,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
    },
    answerText: { fontSize: FontSize.md, lineHeight: 26, color: Colors.textSecondary },

    showAnswerBtn: {
        marginTop: Spacing.xl,
        paddingVertical: Spacing.md,
        backgroundColor: Colors.bgInput,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 8,
        alignItems: 'center',
    },
    showAnswerText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },

    // Answer buttons
    answerButtons: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
    answerBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        gap: 2,
    },
    btnTime: { fontSize: FontSize.xs, fontWeight: '600' },
    btnLabel: { fontSize: 16, fontWeight: '700' },

    // Queue info
    queueInfo: { alignItems: 'center', marginTop: Spacing.lg },
    queueText: { fontSize: FontSize.sm, color: Colors.textMuted },

    // Shortcut bar - orijinal gibi
    shortcutBar: {
        paddingVertical: 8,
        paddingHorizontal: Spacing.lg,
        backgroundColor: Colors.bgSecondary,
        borderTopWidth: 1,
        borderTopColor: Colors.borderLight,
        alignItems: 'center',
    },
    shortcutText: { fontSize: 11, color: Colors.textMuted },
    shortcutKey: {
        fontWeight: '700',
        color: Colors.textSecondary,
        backgroundColor: Colors.bgInput,
        paddingHorizontal: 4,
    },

    // Empty state
    emptyState: { alignItems: 'center', padding: 40 },
    emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
    countdownText: { fontSize: 48, fontWeight: '700', color: Colors.accent, marginBottom: Spacing.md, fontVariant: ['tabular-nums'] as any },
    emptyTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.accent, marginBottom: Spacing.sm },
    emptyDesc: { fontSize: FontSize.lg, color: Colors.textSecondary, textAlign: 'center' },
    emptySub: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.sm },
});
