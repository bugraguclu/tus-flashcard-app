import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { getAllSubjects } from '../lib/subjects';
import { createCourse } from '../lib/courses';
import { confirm, alert } from '../lib/confirm';
import { useApp } from './(tabs)/app-context';
import {
    createTusCard,
    updateTusCardByCardId,
    deleteTusCardByCardId,
    getAnkiCard,
    getNote,
    getSearchIndexCards,
} from '../lib/noteManager';
import { dbDeleteFtsCard, dbIndexAllCards, dbUpsertFtsCard } from '../lib/db';

function parseCardId(raw: string | string[] | undefined): number | null {
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

const COURSE_ICON_CHOICES = ['📘', '📗', '📙', '🧪', '🧮', '🌍', '🎨', '⚖️', '🩺', '💡'];

export default function EditorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion, dataVersion } = useApp();

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
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));
    const [showNewCourse, setShowNewCourse] = useState(false);
    const [newCourseName, setNewCourseName] = useState('');
    const [newCourseIcon, setNewCourseIcon] = useState(COURSE_ICON_CHOICES[0]);

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
                });

                if (!updated) {
                    alert('Hata', 'Kart güncellenemedi.');
                    return;
                }

                dbUpsertFtsCard({
                    id: updated.card.id,
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                });

                bumpDataVersion();
                alert('Başarılı', 'Kart güncellendi.', () => router.back());
            } else {
                const created = createTusCard({
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                });

                dbUpsertFtsCard({
                    id: created.card.id,
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                });

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
                            placeholderTextColor={Colors.textMuted}
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
                    placeholderTextColor={Colors.textMuted}
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

                <Text style={styles.label}>SORU</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder="Soruyu yazın..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

                <Text style={styles.label}>CEVAP</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={answer}
                    onChangeText={setAnswer}
                    placeholder="Cevabı yazın..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                />

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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.md },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: Colors.textMuted,
        textTransform: 'uppercase',
    },
    subjectScroll: { marginBottom: 4 },
    subjectChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        marginRight: 6,
    },
    subjectChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
    subjectChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
    subjectChipTextActive: { color: Colors.accent, fontWeight: '600' },
    newCourseChip: { borderStyle: 'dashed' },
    newCourseBox: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
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
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.bgInput,
    },
    iconChoiceActive: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
    iconChoiceText: { fontSize: 18 },
    createCourseBtn: {
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    createCourseBtnDisabled: { opacity: 0.5 },
    createCourseBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.white },
    topicScroll: { marginTop: -4 },
    topicChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 4,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        marginRight: 6,
    },
    input: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        fontSize: FontSize.md,
        color: Colors.textPrimary,
    },
    textArea: { minHeight: 100, paddingTop: Spacing.md },
    saveBtn: {
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    saveBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
    deleteBtn: {
        backgroundColor: Colors.badgeNewBg,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.badgeNew,
    },
    deleteBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.badgeNew },
    cancelBtn: {
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    cancelBtnText: { fontSize: FontSize.md, color: Colors.textMuted },
});
