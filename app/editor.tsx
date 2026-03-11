import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { TUS_SUBJECTS } from '../lib/data';
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

export default function EditorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const routeCardId = useMemo(() => {
        const explicitCardId = parseCardId(params.cardId);
        if (explicitCardId) return explicitCardId;

        // Legacy route param fallback.
        const legacyId = parseCardId(params.id);
        if (!legacyId) return null;
        return legacyId;
    }, [params.cardId, params.id]);

    const [subject, setSubject] = useState((params.subject as string) || TUS_SUBJECTS[0].id);
    const [topic, setTopic] = useState((params.topic as string) || '');
    const [question, setQuestion] = useState((params.question as string) || '');
    const [answer, setAnswer] = useState((params.answer as string) || '');
    const [isEditing, setIsEditing] = useState(Boolean(routeCardId));

    useEffect(() => {
        if (!routeCardId) return;

        const card = getAnkiCard(routeCardId);
        if (!card) return;
        const note = getNote(card.noteId);
        if (!note) return;

        const parsedSubject = note.tags.find((tag) => TUS_SUBJECTS.some((entry) => entry.id === tag));
        const parsedTopic = note.fields[2] || note.tags.find((tag) => tag !== parsedSubject) || 'General';

        setSubject(parsedSubject || subject);
        setTopic(parsedTopic);
        setQuestion(note.fields[0] || note.sfld || '');
        setAnswer(note.fields[1] || '');
        setIsEditing(true);
    }, [routeCardId]);

    const selectedSubject = TUS_SUBJECTS.find((entry) => entry.id === subject);

    const rebuildSearchIndex = () => {
        const cards = getSearchIndexCards();
        dbIndexAllCards(cards);
    };

    const handleSave = () => {
        if (!question.trim() || !answer.trim()) {
            Alert.alert('Hata', 'Soru ve cevap alanları boş olamaz.');
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
                    Alert.alert('Hata', 'Kart güncellenemedi.');
                    return;
                }

                dbUpsertFtsCard({
                    id: updated.card.id,
                    subject,
                    topic: topic.trim() || 'General',
                    question: question.trim(),
                    answer: answer.trim(),
                });

                Alert.alert('✅ Başarılı', 'Kart güncellendi.', [
                    { text: 'Tamam', onPress: () => router.back() },
                ]);
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

                Alert.alert('✅ Başarılı', 'Kart kaydedildi.', [
                    { text: 'Tamam', onPress: () => router.back() },
                ]);
            }
        } catch {
            Alert.alert('Hata', 'Kart kaydedilemedi.');
        }
    };

    const handleDelete = () => {
        if (!routeCardId) return;

        Alert.alert('Uyarı', 'Bu kartı silmek istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'Sil',
                style: 'destructive',
                onPress: () => {
                    try {
                        deleteTusCardByCardId(routeCardId);
                        dbDeleteFtsCard(routeCardId);
                        rebuildSearchIndex();
                        Alert.alert('🗑️ Silindi', 'Kart başarıyla silindi.', [
                            { text: 'Tamam', onPress: () => router.back() },
                        ]);
                    } catch {
                        Alert.alert('Hata', 'Kart silinemedi.');
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.label}>DERS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                    {TUS_SUBJECTS.map((entry) => (
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
                </ScrollView>

                <Text style={styles.label}>KONU</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder={selectedSubject?.topics[0] || 'Konu adı'}
                    placeholderTextColor={Colors.textMuted}
                />

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
