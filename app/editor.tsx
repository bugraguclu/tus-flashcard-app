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
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { getAllSubjects, getSubjectsForDeck, resolveSubjectDeckId } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { confirm, alert } from '../lib/confirm';
import { useApp } from '../contexts/AppContext';
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
import { getAllDecks, getDeck, getDeckByName } from '../lib/deckManager';
import { BUILTIN_NOTE_TYPES, type AnkiCard, type Note } from '../lib/models';
import CardWebView from '../components/CardWebView';
import MediaAttachButton, { FIELD_MEDIA_RE } from '../components/MediaAttachButton';
import { dbDeleteFtsCard, dbIndexAllCards, dbUpsertFtsCard } from '../lib/db';
import { useI18n } from '../hooks/useI18n';

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


const CARD_TYPE_CHOICES: { id: number; icon: string }[] = [
    { id: 4, icon: '📄' },
    { id: 5, icon: '⌨️' },
    { id: 6, icon: '🔁' },
];

export default function EditorScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion, dataVersion, activeDeckName } = useApp();
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

    // Anki's add dialog: an explicit target deck (null = follow the selected course's deck),
    // and an eye-button preview of the card before it is saved.
    const [targetDeckId, setTargetDeckId] = useState<number | null>(null);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    // Courses are deck-specific: the DERS row lists only the target deck's own courses
    // (explicit deck pick wins, otherwise the deck currently being studied).
    const courseScopeDeckName = useMemo(() => {
        if (targetDeckId) return getDeck(targetDeckId)?.name ?? null;
        return activeDeckName;
    }, [targetDeckId, activeDeckName, dataVersion]);

    const subjects = useMemo(
        () => getSubjectsForDeck(courseScopeDeckName),
        [dataVersion, courseScopeDeckName],
    );

    const [subject, setSubject] = useState((params.subject as string) || subjects[0]?.id || '');
    const [topic, setTopic] = useState((params.topic as string) || '');
    const [question, setQuestion] = useState((params.question as string) || '');
    const [answer, setAnswer] = useState((params.answer as string) || '');
    const [cardTypeId, setCardTypeId] = useState(4);
    const [reverseAnswer, setReverseAnswer] = useState('');
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));
    const [showNewCourse, setShowNewCourse] = useState(false);
    const [newCourseName, setNewCourseName] = useState('');

    const targetDeck = useMemo(() => {
        if (targetDeckId) return getDeck(targetDeckId);
        // "Otomatik": the selected course's own deck; before any course exists in this
        // scope, stay inside the deck being studied instead of jumping to the root deck.
        const bySubject = subject ? resolveSubjectDeckId(subject) : 1;
        if (bySubject !== 1) return getDeck(bySubject);
        if (activeDeckName) return getDeckByName(activeDeckName) ?? getDeck(bySubject);
        return getDeck(bySubject);
    }, [targetDeckId, subject, activeDeckName, dataVersion]);

    const previewPayload = useMemo(() => {
        if (!showPreview) return null;
        const noteType = getNoteType(cardTypeId) || BUILTIN_NOTE_TYPES.find((entry) => entry.id === cardTypeId)!;
        const fields = cardTypeId === 6
            ? [question || l('(boş soru)', '(empty question)'), answer || l('(boş cevap)', '(empty answer)'), topic.trim() || 'General', reverseAnswer.trim()]
            : [question || l('(boş soru)', '(empty question)'), answer || l('(boş cevap)', '(empty answer)'), topic.trim() || 'General'];
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
    }, [showPreview, subject, topic, question, answer, targetDeck?.id, cardTypeId, reverseAnswer, l]);

    useEffect(() => {
        if (!routeCardId) return;

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        // Parse against the full registry — the deck-scoped list may not include this
        // card's course when the editor was opened from another deck's context.
        const allSubjects = getAllSubjects();
        const parsedSubject = note.tags.find((tag) => allSubjects.some((entry) => entry.id === tag));
        const parsedTopic = note.fields[2] || note.tags.find((tag) => tag !== parsedSubject) || 'General';

        // Editing follows the card's own deck (course list, DESTE display).
        setTargetDeckId(card.deckId);
        setSubject(parsedSubject || subject);
        setTopic(parsedTopic);
        setQuestion(note.fields[0] || note.sfld || '');
        setAnswer(note.fields[1] || '');
        setCardTypeId([4, 5, 6].includes(note.noteTypeId) ? note.noteTypeId : 4);
        setReverseAnswer(note.noteTypeId === 6 ? (note.fields[3] || '') : '');
        setIsEditing(true);
    }, [routeCardId]);

    // Re-scoping the course list (deck pick, deck change while editing) can strand the
    // selected course outside the list; snap to the scope's first course then.
    useEffect(() => {
        if (subjects.length === 0) return;
        if (!subjects.some((entry) => entry.id === subject)) {
            setSubject(subjects[0].id);
        }
    }, [subjects, subject]);

    const selectedSubject = subjects.find((entry) => entry.id === subject);

    const handleCreateCourse = () => {
        try {
            const result = createCourse(newCourseName, { parentDeckName: courseScopeDeckName ?? undefined });
            if (!result.created) {
                if (result.error === 'Bu isimde bir ders zaten var.') {
                    // Same name already exists: just select it instead of complaining.
                    setSubject(result.subject.id);
                    setShowNewCourse(false);
                    setNewCourseName('');
                    return;
                }
                alert(t('common.error'), result.error ?? l('Ders oluşturulamadı.', 'Could not create the subject.'));
                return;
            }

            bumpDataVersion();
            setSubject(result.subject.id);
            setShowNewCourse(false);
            setNewCourseName('');
        } catch (e) {
            console.warn('[Editor] course creation failed:', e);
            alert(t('common.error'), l('Ders oluşturulamadı.', 'Could not create the subject.'));
        }
    };

    const rebuildSearchIndex = () => {
        const cards = getSearchIndexCards();
        dbIndexAllCards(cards);
    };

    const handleSave = () => {
        if (!question.trim() || !answer.trim()) {
            alert(t('common.error'), l('Soru ve cevap alanları boş bırakılamaz.', 'Question and answer fields cannot be empty.'));
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
                    alert(t('common.error'), l('Kart güncellenemedi.', 'Could not update the card.'));
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
                alert(t('common.completed'), l('Kart güncellendi.', 'Card updated.'), () => router.back());
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
                alert(t('common.completed'), l('Kart kaydedildi.', 'Card saved.'), () => router.back());
            }
        } catch (e) {
            console.warn('[Editor] save failed:', e);
            alert(t('common.error'), l('Kart kaydedilemedi.', 'Could not save the card.'));
        }
    };

    const handleDelete = () => {
        if (!routeCardId) return;

        confirm(l('Kartı Sil', 'Delete Card'), l('Bu kartı silmek istediğinizden emin misiniz?', 'Are you sure you want to delete this card?'), () => {
            try {
                deleteTusCardByCardId(routeCardId);
                dbDeleteFtsCard(routeCardId);
                rebuildSearchIndex();
                bumpDataVersion();
                alert(l('Silindi', 'Deleted'), l('Kart silindi.', 'Card deleted.'), () => router.back());
            } catch (e) {
                console.warn('[Editor] delete failed:', e);
                alert(t('common.error'), l('Kart silinemedi.', 'Could not delete the card.'));
            }
        }, { destructive: true });
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ title: isEditing ? t('root.editCard') : l('Yeni Kart', 'New Card') }} />
            <KeyboardAvoidingView
                style={styles.keyboardArea}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            >
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
            >
                <View style={styles.topRow}>
                    {!isEditing ? (
                        <TouchableOpacity
                            style={styles.deckSelector}
                            onPress={() => setShowDeckPicker(true)}
                            accessibilityRole="button"
                            accessibilityLabel={l('Hedef desteyi seç', 'Select target deck')}
                        >
                            <Text style={styles.deckSelectorLabel}>{t('common.deck').toLocaleUpperCase()}</Text>
                            <Text style={styles.deckSelectorText} numberOfLines={1}>
                                🗃️ {targetDeck?.name ?? '—'} ▾
                            </Text>
                        </TouchableOpacity>
                    ) : <View style={{ flex: 1 }} />}
                    <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => setShowPreview(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kartı kaydetmeden önizle', 'Preview card before saving')}
                    >
                        <Text style={styles.previewBtnIcon}>👁️</Text>
                        <Text style={styles.previewBtnText}>{l('Önizle', 'Preview')}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>{l('KART TÜRÜ', 'NOTE TYPE')}</Text>
                <View style={styles.cardTypeRow}>
                    {CARD_TYPE_CHOICES.map((choice) => {
                        const label = choice.id === 4
                            ? l('Temel', 'Basic')
                            : choice.id === 5
                                ? l('Yazarak Yanıtla', 'Basic (type in the answer)')
                                : l('Çift Taraflı', 'Basic (and reversed card)');
                        return (
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
                            accessibilityLabel={l(`Not türü: ${label}`, `Note type: ${label}`)}
                        >
                            <Text style={[styles.subjectChipText, cardTypeId === choice.id && styles.subjectChipTextActive]}>
                                {choice.icon} {label}
                            </Text>
                        </TouchableOpacity>
                    );})}
                </View>
                {isEditing && (
                    <Text style={styles.help}>{l('Mevcut bir kartın not türü değiştirilemez.', 'The note type of an existing card cannot be changed.')}</Text>
                )}

                <Text style={styles.label}>{l('DERS', 'SUBJECT')}</Text>
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
                        accessibilityLabel={l('Yeni ders oluştur', 'Create new subject')}
                    >
                        <Text style={[styles.subjectChipText, showNewCourse && styles.subjectChipTextActive]}>
                            ＋ {l('Yeni Ders', 'New Subject')}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>

                {showNewCourse && (
                    <View style={styles.newCourseBox}>
                        <TextInput
                            style={styles.input}
                            value={newCourseName}
                            onChangeText={setNewCourseName}
                            placeholder={l('Yeni ders adı (örn. Dahiliye)', 'New subject name (e.g. Internal Medicine)')}
                            placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity
                            style={[styles.createCourseBtn, !newCourseName.trim() && styles.createCourseBtnDisabled]}
                            onPress={handleCreateCourse}
                            disabled={!newCourseName.trim()}
                        >
                            <Text style={styles.createCourseBtnText}>{l('Dersi Oluştur', 'Create Subject')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={styles.label}>{l('KONU', 'TOPIC')}</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder={selectedSubject?.topics[0] || l('Konu adı', 'Topic name')}
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
                    <Text style={styles.label}>{l('SORU', 'QUESTION')}</Text>
                    <MediaAttachButton
                        hasMedia={FIELD_MEDIA_RE.test(question)}
                        onInsert={(snippet) => setQuestion((prev) => appendSnippet(prev, snippet))}
                    />
                </View>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder={l('Soruyu yazın…', 'Enter the question…')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

                <View style={styles.fieldLabelRow}>
                    <Text style={styles.label}>{l('CEVAP', 'ANSWER')}</Text>
                    <MediaAttachButton
                        hasMedia={FIELD_MEDIA_RE.test(answer)}
                        onInsert={(snippet) => setAnswer((prev) => appendSnippet(prev, snippet))}
                    />
                </View>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={answer}
                    onChangeText={setAnswer}
                    placeholder={l('Cevabı yazın…', 'Enter the answer…')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

                {cardTypeId === 6 && (
                    <>
                        <Text style={styles.label}>{l('TERS KARTIN CEVABI (İSTEĞE BAĞLI)', 'BACK TEMPLATE ANSWER (OPTIONAL)')}</Text>
                        <TextInput
                            style={[styles.input, styles.textArea, styles.faintInput]}
                            value={reverseAnswer}
                            onChangeText={setReverseAnswer}
                            placeholder={l('Boş bırakılırsa ters kartın cevabı otomatik olarak “Soru” olur.', 'If left blank, the reversed card answer defaults to the Question field.')}
                            placeholderTextColor={colors.textMuted}
                            multiline
                            textAlignVertical="top"
                        />
                    </>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 {isEditing ? l('Değişiklikleri Kaydet', 'Save Changes') : l('Kartı Kaydet', 'Save Card')}</Text>
                </TouchableOpacity>

                {isEditing && routeCardId && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                        <Text style={styles.deleteBtnText}>🗑️ {l('Kartı Sil', 'Delete Card')}</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
            </ScrollView>
            </KeyboardAvoidingView>

            <Modal visible={showDeckPicker} transparent animationType="fade" onRequestClose={() => setShowDeckPicker(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>{l('Hedef Deste', 'Target Deck')}</Text>
                        <ScrollView style={styles.deckList}>
                            <TouchableOpacity
                                style={styles.deckOption}
                                onPress={() => { setTargetDeckId(null); setShowDeckPicker(false); }}
                            >
                                <Text style={[styles.deckOptionText, targetDeckId === null && styles.deckOptionActive]}>
                                    ✨ {l('Otomatik — seçilen dersin destesi', 'Automatic — deck for the selected subject')}
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
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, styles.previewCard]}>
                        <Text style={styles.modalTitle}>👁️ {l('Önizleme', 'Preview')}</Text>
                        <ScrollView style={styles.previewScroll}>
                            <Text style={styles.previewMeta} numberOfLines={1}>
                                🗃️ {targetDeck?.name ?? '—'} · {topic.trim() || 'General'}
                            </Text>
                            <Text style={styles.label}>{l('SORU', 'QUESTION')}</Text>
                            {previewPayload && (
                                <CardWebView
                                    noteType={previewPayload.noteType}
                                    note={previewPayload.note}
                                    card={previewPayload.card}
                                    deck={targetDeck}
                                    side="question"
                                />
                            )}
                            <Text style={styles.label}>{l('CEVAP', 'ANSWER')}</Text>
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
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
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
    keyboardArea: { flex: 1 },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md, paddingBottom: 48 },
    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },
    deckSelector: {
        flex: 1,
        minHeight: 52,
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
        minWidth: 72,
        minHeight: 52,
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
        minHeight: 48,
        justifyContent: 'center',
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    deckOptionText: { fontSize: FontSize.md, color: colors.textPrimary },
    deckOptionActive: { color: colors.accent, fontWeight: '700' },
    modalClose: { minHeight: 48, marginTop: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
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
        minHeight: 44,
        justifyContent: 'center',
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
        minHeight: 44,
        justifyContent: 'center',
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
    createCourseBtn: {
        minHeight: 48,
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    createCourseBtnDisabled: { opacity: 0.5 },
    createCourseBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.white },
    topicScroll: { marginTop: -4 },
    topicChip: {
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 6,
    },
    input: {
        minHeight: 48,
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
