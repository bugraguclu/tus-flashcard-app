import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS } from '../../lib/data';
import { getScheduler } from '../../lib/scheduler';
import { loadSessionStats, saveSessionStats } from '../../lib/storage';
import { useApp } from './_layout';
import type { Grade, SessionStats } from '../../lib/types';
import type { AnkiCard } from '../../lib/models';
import {
    getAnkiCard,
    getNote,
    getNoteType,
} from '../../lib/noteManager';
import { getDeck } from '../../lib/deckManager';
import CardWebView from '../../components/CardWebView';
import {
    answerStudyCard,
    getAnkiCardSnapshot,
    getStudyQueue,
    setCardBuried,
    setCardSuspended,
    undoAnswer,
    type StudyCard,
} from '../../lib/studyRepository';

type QueueStats = { newCount: number; learningCount: number; reviewCount: number };

type UndoEntry = {
    cardId: number;
    reviewLogId: number;
    previousSnapshot: AnkiCard;
    previousStats: SessionStats;
};

export default function StudyScreen() {
    const { selectedSubject, selectedTopic, settings } = useApp();
    const params = useLocalSearchParams();
    const selectedDeckName = typeof params.deck === 'string' ? params.deck : null;

    const [sessionStats, setSessionStats] = useState<SessionStats>({
        reviewed: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now(),
        newCardsToday: 0,
    });
    const [queue, setQueue] = useState<StudyCard[]>([]);
    const [currentCard, setCurrentCard] = useState<StudyCard | null>(null);
    const [showingAnswer, setShowingAnswer] = useState(false);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCards, setTotalCards] = useState(0);
    const [nextLearningDue, setNextLearningDue] = useState<number | null>(null);
    const [countdown, setCountdown] = useState('');
    const [queueStats, setQueueStats] = useState<QueueStats>({ newCount: 0, learningCount: 0, reviewCount: 0 });
    const [answerStartedAt, setAnswerStartedAt] = useState<number>(Date.now());

    const buildQueue = useCallback(() => {
        const result = getStudyQueue({
            settings,
            selectedSubject,
            selectedTopic,
            selectedDeckName,
            newCardsStudiedToday: sessionStats.newCardsToday || 0,
        });

        setQueue(result.cards);
        setCurrentCard(result.cards.length > 0 ? result.cards[0] : null);
        setTotalCards(result.cards.length);
        setNextLearningDue(result.nextLearningDue);
        setQueueStats(result.stats);
        setShowingAnswer(false);
    }, [settings, selectedSubject, selectedTopic, selectedDeckName, sessionStats.newCardsToday]);

    useEffect(() => {
        async function load() {
            const stats = await loadSessionStats();
            setSessionStats(stats);
            setLoading(false);
        }
        load();
    }, []);

    useEffect(() => {
        if (!loading) {
            buildQueue();
        }
    }, [loading, buildQueue]);

    useEffect(() => {
        if (!currentCard) return;
        setAnswerStartedAt(Date.now());
    }, [currentCard?.cardId]);

    // Rebuild queue when the next learning card becomes due.
    useEffect(() => {
        if (!nextLearningDue) return;
        const delay = Math.max(500, nextLearningDue - Date.now() + 300);
        const timer = setTimeout(buildQueue, delay);
        return () => clearTimeout(timer);
    }, [nextLearningDue, buildQueue]);

    // Update countdown for waiting state.
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
    }, [nextLearningDue, currentCard, buildQueue]);

    const answerCard = useCallback(async (grade: Grade) => {
        if (!currentCard) return;

        const snapshot = getAnkiCardSnapshot(currentCard.cardId);
        if (!snapshot) return;

        const elapsed = Math.max(0, Date.now() - answerStartedAt);
        const result = answerStudyCard(currentCard.cardId, grade, settings, elapsed);

        const nextStats: SessionStats = {
            ...sessionStats,
            reviewed: sessionStats.reviewed + 1,
            correct: grade >= 3 ? sessionStats.correct + 1 : sessionStats.correct,
            wrong: grade < 3 ? sessionStats.wrong + 1 : sessionStats.wrong,
            newCardsToday: result.wasNewCard ? (sessionStats.newCardsToday || 0) + 1 : sessionStats.newCardsToday,
        };

        setUndoStack((prev) => [
            ...prev.slice(-29),
            {
                cardId: currentCard.cardId,
                reviewLogId: result.reviewLogId,
                previousSnapshot: snapshot,
                previousStats: sessionStats,
            },
        ]);

        setSessionStats(nextStats);
        await saveSessionStats(nextStats);
        buildQueue();
    }, [currentCard, answerStartedAt, settings, sessionStats, buildQueue]);

    const undoLast = useCallback(async () => {
        if (undoStack.length === 0) return;

        const undo = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));

        undoAnswer(undo.previousSnapshot, undo.reviewLogId);

        setSessionStats(undo.previousStats);
        await saveSessionStats(undo.previousStats);
        buildQueue();
    }, [undoStack, buildQueue]);

    const handleSuspend = useCallback(() => {
        if (!currentCard) return;
        setCardSuspended(currentCard.cardId, true);
        buildQueue();
    }, [currentCard, buildQueue]);

    const handleBury = useCallback(() => {
        if (!currentCard) return;
        setCardBuried(currentCard.cardId, true);
        buildQueue();
    }, [currentCard, buildQueue]);

    const getPreview = useCallback(() => {
        if (!currentCard) return null;
        const scheduler = getScheduler(settings.algorithm);
        return scheduler.previewIntervals(currentCard.state, settings);
    }, [currentCard, settings]);

    const renderPayload = useMemo(() => {
        if (!currentCard) return null;
        const card = getAnkiCard(currentCard.cardId);
        if (!card) return null;
        const note = getNote(card.noteId);
        if (!note) return null;
        const noteType = getNoteType(note.noteTypeId);
        if (!noteType) return null;
        const deck = getDeck(card.deckId);
        return { card, note, noteType, deck };
    }, [currentCard?.cardId]);

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

    const preview = getPreview();
    const currentCardState = currentCard?.state;
    const subject = currentCard ? TUS_SUBJECTS.find((item) => item.id === currentCard.subject) : null;

    return (
        <View style={styles.container}>
            <View style={styles.topBar}>
                <Text style={styles.topBarTitle}>Bugünün Kartları</Text>
                <View style={styles.statsRow}>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeNew }]}>{queueStats.newCount}</Text>
                        <Text style={styles.statLabel}>YENİ</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeLearn }]}>{queueStats.learningCount}</Text>
                        <Text style={styles.statLabel}>ÖĞRENİYOR</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statCount, { color: Colors.badgeReview }]}>{queueStats.reviewCount}</Text>
                        <Text style={styles.statLabel}>TEKRAR</Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.cardArea}>
                {currentCard ? (
                    <View style={styles.cardContainer}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardSubject}>{subject ? `${subject.icon} ${subject.name}` : '📝'}</Text>
                            <Text style={styles.cardTopic}>{currentCard.topic}</Text>
                            <View
                                style={[
                                    styles.statusBadge,
                                    {
                                        backgroundColor: currentCardState?.status === 'new'
                                            ? Colors.badgeNewBg
                                            : currentCardState?.status === 'learning'
                                                ? Colors.badgeLearnBg
                                                : Colors.badgeReviewBg,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.statusText,
                                        {
                                            color: currentCardState?.status === 'new'
                                                ? Colors.badgeNew
                                                : currentCardState?.status === 'learning'
                                                    ? Colors.badgeLearn
                                                    : Colors.badgeReview,
                                        },
                                    ]}
                                >
                                    {currentCardState?.status === 'new'
                                        ? 'YENİ'
                                        : currentCardState?.status === 'learning'
                                            ? 'ÖĞRENİYOR'
                                            : 'TEKRAR'}
                                </Text>
                            </View>

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

                        <View style={styles.cardBody}>
                            <Text style={styles.cardLabel}>SORU</Text>
                            {renderPayload ? (
                                <CardWebView
                                    noteType={renderPayload.noteType}
                                    note={renderPayload.note}
                                    card={renderPayload.card}
                                    deck={renderPayload.deck}
                                    side="question"
                                />
                            ) : (
                                <Text style={styles.questionText}>{currentCard.question}</Text>
                            )}

                            {showingAnswer ? (
                                <View style={styles.answerSection}>
                                    <Text style={[styles.cardLabel, { color: Colors.accent }]}>CEVAP</Text>
                                    {renderPayload ? (
                                        <CardWebView
                                            noteType={renderPayload.noteType}
                                            note={renderPayload.note}
                                            card={renderPayload.card}
                                            deck={renderPayload.deck}
                                            side="answer"
                                        />
                                    ) : (
                                        <Text style={styles.answerText}>{currentCard.answer}</Text>
                                    )}
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

                        <View style={styles.queueInfo}>
                            <Text style={styles.queueText}>
                                Kalan: <Text style={{ fontWeight: '700' }}>{queue.length}</Text> kart · Bugün: <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> tekrar
                            </Text>
                        </View>
                    </View>
                ) : nextLearningDue ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⏳</Text>
                        <Text style={styles.emptyTitle}>Kart Bekleniyor</Text>
                        <Text style={styles.countdownText}>{countdown}</Text>
                        <Text style={styles.emptyDesc}>
                            Öğrenme kartları bekleme süresinde. Süre dolduğunda otomatik gösterilecek.
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
                                    ? `"${TUS_SUBJECTS.find((item) => item.id === selectedSubject)?.name}" dersi`
                                    : 'Tüm dersler'} için bugünlük tüm kartlar tamamlandı.
                        </Text>
                        <Text style={styles.emptySub}>
                            Bugün <Text style={{ fontWeight: '700' }}>{sessionStats.reviewed}</Text> kart tekrar edildi.
                        </Text>
                    </View>
                )}
            </ScrollView>

            {currentCard && (
                <View style={styles.shortcutBar}>
                    <Text style={styles.shortcutText}>
                        <Text style={styles.shortcutKey}>Space</Text> Cevabı göster ·
                        <Text style={styles.shortcutKey}>1</Text> Tekrar ·
                        <Text style={styles.shortcutKey}>2</Text> Zor ·
                        <Text style={styles.shortcutKey}>3</Text> İyi ·
                        <Text style={styles.shortcutKey}>4</Text> Kolay ·
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

    cardArea: { flexGrow: 1, padding: Spacing.xxl, alignItems: 'center', justifyContent: 'center' },
    cardContainer: { width: '100%', maxWidth: 680 },

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: Spacing.sm,
        flexWrap: 'wrap',
    },
    cardSubject: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },
    cardTopic: { fontSize: FontSize.sm, color: Colors.textMuted },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
    statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: Colors.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBtnText: { fontSize: 16 },

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

    queueInfo: { alignItems: 'center', marginTop: Spacing.lg },
    queueText: { fontSize: FontSize.sm, color: Colors.textMuted },

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

    emptyState: { alignItems: 'center', padding: 40 },
    emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
    countdownText: {
        fontSize: 48,
        fontWeight: '700',
        color: Colors.accent,
        marginBottom: Spacing.md,
        fontVariant: ['tabular-nums'] as any,
    },
    emptyTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.accent, marginBottom: Spacing.sm },
    emptyDesc: { fontSize: FontSize.lg, color: Colors.textSecondary, textAlign: 'center' },
    emptySub: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.sm },
});
