// ============================================================
// TUS Flashcard - Kart Düzenleme Ekranı (Modal)
// ============================================================

import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { TUS_SUBJECTS } from '../lib/data';
import { loadCustomCards, saveCustomCards } from '../lib/storage';
import type { Card } from '../lib/types';

export default function EditorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const [subject, setSubject] = useState(params.subject as string || TUS_SUBJECTS[0].id);
    const [topic, setTopic] = useState(params.topic as string || '');
    const [question, setQuestion] = useState(params.question as string || '');
    const [answer, setAnswer] = useState(params.answer as string || '');

    const selectedSubject = TUS_SUBJECTS.find(s => s.id === subject);

    const [isEditing, setIsEditing] = useState(!!params.id);

    const handleSave = async () => {
        if (!question.trim() || !answer.trim()) {
            Alert.alert('Hata', 'Soru ve cevap alanları boş olamaz.');
            return;
        }
        try {
            const existing = await loadCustomCards();

            if (isEditing) {
                const cardId = Number(params.id);
                const updatedCards = existing.map(c =>
                    c.id === cardId
                        ? { ...c, subject, topic: topic.trim() || 'Genel', question: question.trim(), answer: answer.trim() }
                        : c
                );
                await saveCustomCards(updatedCards);
                Alert.alert('✅ Başarılı', 'Kart güncellendi!', [
                    { text: 'Tamam', onPress: () => router.back() },
                ]);
            } else {
                const newCard: Card = {
                    id: Date.now(),
                    subject,
                    topic: topic.trim() || 'Genel',
                    question: question.trim(),
                    answer: answer.trim(),
                };
                await saveCustomCards([...existing, newCard]);
                Alert.alert('✅ Başarılı', 'Kart kaydedildi!', [
                    { text: 'Tamam', onPress: () => router.back() },
                ]);
            }
        } catch (e) {
            Alert.alert('Hata', 'Kart kaydedilemedi.');
        }
    };

    const handleDelete = () => {
        Alert.alert('Uyarı', 'Bu kartı silmek istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'Sil',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const existing = await loadCustomCards();
                        const cardId = Number(params.id);
                        const filtered = existing.filter(c => c.id !== cardId);
                        await saveCustomCards(filtered);
                        Alert.alert('🗑️ Silindi', 'Kart başarıyla silindi.', [
                            { text: 'Tamam', onPress: () => router.back() },
                        ]);
                    } catch (e) {
                        Alert.alert('Hata', 'Kart silinemedi.');
                    }
                }
            }
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                {/* Ders Seçimi */}
                <Text style={styles.label}>DERS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                    {TUS_SUBJECTS.map(s => (
                        <TouchableOpacity
                            key={s.id}
                            style={[styles.subjectChip, subject === s.id && styles.subjectChipActive]}
                            onPress={() => setSubject(s.id)}
                        >
                            <Text style={[styles.subjectChipText, subject === s.id && styles.subjectChipTextActive]}>
                                {s.icon} {s.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Konu */}
                <Text style={styles.label}>KONU</Text>
                <TextInput
                    style={styles.input}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder={selectedSubject?.topics[0] || 'Konu adı'}
                    placeholderTextColor={Colors.textMuted}
                />

                {/* Soru */}
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

                {/* Cevap */}
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

                {/* Butonlar */}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 {isEditing ? 'Değişiklikleri Kaydet' : 'Kartı Kaydet'}</Text>
                </TouchableOpacity>

                {isEditing && (
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
        backgroundColor: Colors.badgeNewBg, // Red tinted background
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
