import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { confirm, alert } from '../lib/confirm';
import { useApp } from './(tabs)/app-context';
import {
    createTusCard,
    updateTusCardByCardId,
    deleteTusCardByCardId,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    getSearchIndexCards,
} from '../lib/noteManager';
import { getAllDecks, getDeck } from '../lib/deckManager';
import { BUILTIN_NOTE_TYPES, type AnkiCard, type Note } from '../lib/models';
import CardWebView from '../components/CardWebView';
import MediaAttachButton from '../components/MediaAttachButton';
import { dbDeleteFtsCard, dbIndexAllCards, dbUpsertFtsCard } from '../lib/db';

function parseCardId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function appendSnippet(fieldText: string, snippet: string): string {
    if (!fieldText.trim()) return snippet;
    return `${fieldText}\n${snippet}`;
}

const COURSE_ICON_CHOICES = ['📘', '📗', '📙', '🧪', '🧮', '🌍', '🎨', '⚖️', '🩺', '💡'];

const CARD_TYPE_CHOICES: { id: number; label: string; icon: string }[] = [
    { id: 4, label: 'Temel', icon: '📄' },
    { id: 5, label: 'Yazarak Cevapla', icon: '⌨️' },
    { id: 6, label: 'Çift Taraflı', icon: '🔁' },
];

export default function EditorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion, dataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const routeCardId = useMemo(() => {
        const explicitCardId = parseCardId(params.cardId);
        if (explicitCardId) return explicitCardId;

        // Legacy route param fallback.
        const legacyId = parseCardId(params.id);
        if (!legacyId) return null;
        return legacyId;
    }, [params.cardId, params.id]);

    const subjects = useMemo(() => getAllSubjects(), [dataVersion]);

    const [subject, setSubject] = useState((params.subject as string) || subjects[0]?.id || '');
    const [topic, setTopic] = useState((params.topic as string) || '');
    const [question, setQuestion] = useState((params.question as string) || '');
    const [answer, setAnswer] = useState((params.answer as string) || '');
    const [cardTypeId, setCardTypeId] = useState(4);
    const [reverseAnswer, setReverseAnswer] = useState('');
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));
    const [showNewCourse, setShowNewCourse] = useState(false);
    const [newCourseName, setNewCourseName] = useState('');
    const [newCourseIcon, setNewCourseIcon] = useState(COURSE_ICON_CHOICES[0]);
    // Anki's add dialog: an explicit target deck (null = follow the selected course's deck),
    // and an eye-button preview of the card before it is saved.
    const [targetDeckId, setTargetDeckId] = useState<number | null>(null);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const targetDeck = useMemo(() => {
        const fallback = resolveSubjectDeckId(subject);
        return getDeck(targetDeckId ?? fallback);
    }, [targetDeckId, subject, dataVersion]);

    const previewPayload = useMemo(() => {
        if (!showPreview) return null;
        const noteType = getNoteType(cardTypeId) || BUILTIN_NOTE_TYPES.find((entry) => entry.id === cardTypeId)!;
        const fields = cardTypeId === 6
            ? [question || '(boş soru)', answer || '(boş cevap)', topic.trim() || 'General', reverseAnswer.trim()]
            : [question || '(boş soru)', answer || '(boş cevap)', topic.trim() || 'General'];
        const note: Note = {
            id: -1,
            guid: 'preview',
            noteTypeId: noteType.id,
            mod: 0,
            usn: -1,
            tags: [subject, (topic.trim() || 'General').replace(/\s+/g, '-')],
            fields,
            sfld: question,
            csum: 0,
            flags: 0,
        };
        const card: AnkiCard = {
            id: -1, noteId: -1, deckId: targetDeck?.id ?? 1, ord: 0, mod: 0, usn: -1,
            type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0,
            left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        };
        return { noteType, note, card };
    }, [showPreview, subject, topic, question, answer, targetDeck?.id, cardTypeId, reverseAnswer]);

    useEffect(() => {
        if (!routeCardId) return;

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        const parsedSubject = note.tags.find((tag) => subjects.some((entry) => entry.id === tag));
        const parsedTopic = note.fields[2] || note.tags.find((tag) => tag !== parsedSubject) || 'General';

        setSubject(parsedSubject || subject);
        setTopic(parsedTopic);
        setQuestion(note.fields[0] || note.sfld || '');
        setAnswer(note.fields[1] || '');
        setCardTypeId([4, 5, 6].includes(note.noteTypeId) ? note.noteTypeId : 4);
        setReverseAnswer(note.noteTypeId === 6 ? (note.fields[3] || '') : '');
        setIsEditing(true);
    }, [routeCardId]);

    const selectedSubject = subjects.find((entry) => entry.id === subject);

    const handleCreateCourse = () => {
        try {
            const result = createCourse(newCourseName, newCourseIcon);
            if (!result.created) {
                if (result.error === 'Bu isimde bir ders zaten var.') {
                    // Same name already exists: just select it instead of complaining.
                    setSubject(result.subject.id);
                    setShowNewCourse(false);
                    setNewCourseName('');
                    return;
                }
                alert('Hata', result.error ?? 'Ders oluşturulamadı.');
                return;
            }

            bumpDataVersion();
            setSubject(result.subject.id);
            setShowNewCourse(false);
            setNewCourseName('');
        } catch (e) {
            console.warn('[Editor] course creation failed:', e);
            alert('Hata', 'Ders oluşturulamadı.');
        }
    };

    const rebuildSearchIndex = () => {
        const cards = getSearchIndexCards();
        dbIndexAllCards(cards);
    };

    const handleSave = () => {
        if (!question.trim() || !answer.trim()) {
            alert('Hata', 'Soru ve cevap alanları boş olamaz.');
            return;
        }

        try {
            if (isEditing && routeCardId) {
                const updated = updateTusCardByCardId(routeCardId, {
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                    reverseAnswer: cardTypeId === 6 ? reverseAnswer : undefined,
                });

                if (!updated) {
                    alert('Hata', 'Kart güncellenemedi.');
                    return;
                }

                // A reversed note has two sibling cards sharing this content — keep both in the
                // search index, not just the one being edited.
                for (const sibling of getCardsForNote(updated.note.id)) {
                    dbUpsertFtsCard({
                        id: sibling.id,
                        subject,
                        topic: topic.trim() || 'General',
                        question: question.trim(),
                        answer: answer.trim(),
                    });
                }

                bumpDataVersion();
                alert('Başarılı', 'Kart güncellendi.', () => router.back());
            } else {
                const created = createTusCard({
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                    deckId: targetDeckId ?? undefined,
                    noteTypeId: cardTypeId,
                    reverseAnswer: cardTypeId === 6 ? reverseAnswer : undefined,
                });

                for (const generatedCard of created.cards) {
                    dbUpsertFtsCard({
                        id: generatedCard.id,
                        subject,
                        topic: topic.trim() || 'General',
                        question: question.trim(),
                        answer: answer.trim(),
                    });
                }

                bumpDataVersion();
                alert('Başarılı', 'Kart kaydedildi.', () => router.back());
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert('Hata', 'Kart kaydedilemedi.');
        }
    };

    const handleDelete = () => {
        if (!routeCardId) return;

        confirm('Uyarı', 'Bu kartı silmek istediğinize emin misiniz?', () => {
            try {
                deleteTusCardByCardId(routeCardId);
                dbDeleteFtsCard(routeCardId);
                rebuildSearchIndex();
                bumpDataVersion();
                alert('Silindi', 'Kart başarıyla silindi.', () => router.back());
            } catch (e) {
                console.warn('[Editor] delete failed:', e);
                alert('Hata', 'Kart silinemedi.');
            }
        }, { destructive: true });
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.topRow}>
                    {!isEditing ? (
                        <TouchableOpacity
                            style={styles.deckSelector}
                            onPress={() => setShowDeckPicker(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Hedef desteyi seç"
                        >
                            <Text style={styles.deckSelectorLabel}>DESTE</Text>
                            <Text style={styles.deckSelectorText} numberOfLines={1}>
                                🗃️ {targetDeck?.name ?? '—'} ▾
                            </Text>
                        </TouchableOpacity>
                    ) : <View style={{ flex: 1 }} />}
                    <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => setShowPreview(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Kartı kaydetmeden önizle"
                    >
                        <Text style={styles.previewBtnIcon}>👁️</Text>
                        <Text style={styles.previewBtnText}>Önizle</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>KART TÜRÜ</Text>
                <View style={styles.cardTypeRow}>
                    {CARD_TYPE_CHOICES.map((choice) => (
                        <TouchableOpacity
                            key={choice.id}
                            style={[
                                styles.cardTypeChip,
                                cardTypeId === choice.id && styles.subjectChipActive,
                                isEditing && styles.cardTypeChipLocked,
                            ]}
                            onPress={() => !isEditing && setCardTypeId(choice.id)}
                            disabled={isEditing}
                            accessibilityRole="button"
                            accessibilityLabel={`Kart türü: ${choice.label}`}
                        >
                            <Text style={[styles.subjectChipText, cardTypeId === choice.id && styles.subjectChipTextActive]}>
                                {choice.icon} {choice.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {isEditing && (
                    <Text style={styles.help}>Mevcut bir kartın türü değiştirilemez.</Text>
                )}

                <Text style={styles.label}>DERS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                    {subjects.map((entry) => (
                        <TouchableOpacity
                            key={entry.id}
                            style={[styles.subjectChip, subject === entry.id && styles.subjectChipActive]}
                            onPress={() => setSubject(entry.id)}
                        >
                            <Text style={[styles.subjectChipText, subject === entry.id && styles.subjectChipTextActive]}>
                                {entry.icon} {entry.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={[styles.subjectChip, styles.newCourseChip, showNewCourse && styles.subjectChipActive]}
                        onPress={() => setShowNewCourse((prev) => !prev)}
                        accessibilityRole="button"
                        accessibilityLabel="Yeni ders oluştur"
                    >
                        <Text style={[styles.subjectChipText, showNewCourse && styles.subjectChipTextActive]}>
                            ＋ Yeni Ders
                        </Text>
                    </TouchableOpacity>
                </ScrollView>

                {showNewCourse && (
                    <View style={styles.newCourseBox}>
                        <TextInput
                            style={styles.input}
                            value={newCourseName}
                            onChangeText={setNewCourseName}
                            placeholder="Yeni ders adı (örn. Dosya İşlemleri)"
                            placeholderTextColor={colors.textMuted}
                        />
                        <View style={styles.iconRow}>
                            {COURSE_ICON_CHOICES.map((icon) => (
                                <TouchableOpacity
                                    key={icon}
                                    style={[styles.iconChoice, newCourseIcon === icon && styles.iconChoiceActive]}
                                    onPress={() => setNewCourseIcon(icon)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Simge ${icon}`}
                                >
                                    <Text style={styles.iconChoiceText}>{icon}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={[styles.createCourseBtn, !newCourseName.trim() && styles.createCourseBtnDisabled]}
                            onPress={handleCreateCourse}
                            disabled={!newCourseName.trim()}
                        >
                            <Text style={styles.createCourseBtnText}>Dersi Oluştur</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={styles.label}>KONU</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder={selectedSubject?.topics[0] || 'Konu adı'}
                    placeholderTextColor={colors.textMuted}
                />
                {(selectedSubject?.topics.length ?? 0) > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topicScroll}>
                        {selectedSubject!.topics.map((entry) => (
                            <TouchableOpacity
                                key={entry}
                                style={[styles.topicChip, topic === entry && styles.subjectChipActive]}
                                onPress={() => setTopic(entry)}
                            >
                                <Text style={[styles.subjectChipText, topic === entry && styles.subjectChipTextActive]}>
                                    {entry}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.label}>SORU</Text>
                    <MediaAttachButton onInsert={(snippet) => setQuestion((prev) => appendSnippet(prev, snippet))} />
                </View>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="Soruyu yazın..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.label}>CEVAP</Text>
                    <MediaAttachButton onInsert={(snippet) => setAnswer((prev) => appendSnippet(prev, snippet))} />
                </View>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={answer}
                    onChangeText={setAnswer}
                    placeholder="Cevabı yazın..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

                {cardTypeId === 6 && (
                    <>
                        <Text style={styles.label}>TERS KARTIN CEVABI (İSTEĞE BAĞLI)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea, styles.faintInput]}
                            value={reverseAnswer}
                            onChangeText={setReverseAnswer}
                            placeholder="Boş bırakılırsa ters kartın cevabı otomatik olarak 'Soru' olur. Değiştirmek için yazın."
                            placeholderTextColor={colors.textMuted}
                            multiline
                            textAlignVertical="top"
                        />
                    </>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 {isEditing ? 'Değişiklikleri Kaydet' : 'Kartı Kaydet'}</Text>
                </TouchableOpacity>

                {isEditing && routeCardId && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                        <Text style={styles.deleteBtnText}>🗑️ Kartı Sil</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>İptal</Text>
                </TouchableOpacity>
            </ScrollView>

            <Modal visible={showDeckPicker} transparent animationType="fade" onRequestClose={() => setShowDeckPicker(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Hedef Deste</Text>
                        <ScrollView style={styles.deckList}>
                            <TouchableOpacity
                                style={styles.deckOption}
                                onPress={() => { setTargetDeckId(null); setShowDeckPicker(false); }}
                            >
                                <Text style={[styles.deckOptionText, targetDeckId === null && styles.deckOptionActive]}>
                                    ✨ Otomatik — seçilen dersin destesi
                                </Text>
                            </TouchableOpacity>
                            {getAllDecks().filter((deck) => !deck.isFiltered).map((deck) => (
                                <TouchableOpacity
                                    key={deck.id}
                                    style={styles.deckOption}
                                    onPress={() => { setTargetDeckId(deck.id); setShowDeckPicker(false); }}
                                >
                                    <Text
                                        style={[styles.deckOptionText, targetDeckId === deck.id && styles.deckOptionActive]}
                                        numberOfLines={1}
                                    >
                                        🗃️ {deck.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowDeckPicker(false)}>
                            <Text style={styles.modalCloseText}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, styles.previewCard]}>
                        <Text style={styles.modalTitle}>👁️ Önizleme</Text>
                        <ScrollView style={styles.previewScroll}>
                            <Text style={styles.previewMeta} numberOfLines={1}>
                                🗃️ {targetDeck?.name ?? '—'} · {topic.trim() || 'General'}
                            </Text>
                            <Text style={styles.label}>SORU</Text>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side="question"
                                />
                            )}
                            <Text style={styles.label}>CEVAP</Text>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side="answer"
                                    omitFrontSide
                                />
                            )}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowPreview(false)}>
                            <Text style={styles.modalCloseText}>Kapat</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
    deckSelector: {
        flex: 1,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
    },
    deckSelectorLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: colors.textMuted,
    },
    deckSelectorText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
    previewBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
    },
    previewBtnIcon: { fontSize: 18 },
    previewBtnText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 1 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    modalCard: {
        width: '100%',
        maxWidth: 440,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        ...Shadows.lg,
    },
    previewCard: { maxHeight: '85%' },
    modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.md },
    deckList: { maxHeight: 320 },
    deckOption: {
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
    deckOptionActive: { color: colors.accent, fontWeight: '700' },
    modalClose: { marginTop: Spacing.md, alignItems: 'center', paddingVertical: 6 },
    modalCloseText: { color: colors.textMuted, fontWeight: '600' },
    previewScroll: { flexGrow: 0 },
    previewMeta: { fontSize: FontSize.sm, color: colors.textMuted, marginBottom: Spacing.sm },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    cardTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cardTypeChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardTypeChipLocked: { opacity: 0.6 },
    help: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: -2 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    faintInput: { opacity: 0.7 },
    subjectScroll: { marginBottom: 4 },
    subjectChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 6,
    },
    subjectChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    subjectChipText: { fontSize: FontSize.sm, color: colors.textSecondary },
    subjectChipTextActive: { color: colors.accent, fontWeight: '600' },
    newCourseChip: { borderStyle: 'dashed' },
    newCourseBox: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        gap: Spacing.sm,
    },
    iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    iconChoice: {
        width: 36,
        height: 36,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bgInput,
    },
    iconChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    iconChoiceText: { fontSize: 18 },
    createCourseBtn: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    createCourseBtnDisabled: { opacity: 0.5 },
    createCourseBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.white },
    topicScroll: { marginTop: -4 },
    topicChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 6,
    },
    input: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },
    textArea: { minHeight: 100, paddingTop: Spacing.md },
    saveBtn: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    saveBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    deleteBtn: {
        backgroundColor: colors.badgeNewBg,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.badgeNew,
    },
    deleteBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.badgeNew },
    cancelBtn: {
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    cancelBtnText: { fontSize: FontSize.md, color: colors.textMuted },
    });
}
