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
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useApp } from './(tabs)/app-context';
import { getNoteType, saveNoteType } from '../lib/noteManager';
import {
    renameNoteType,
    renameField,
    updateTemplate,
    setCss,
    addField,
    removeField,
    moveField,
    applyFieldEdit,
    type FieldEdit,
} from '../lib/noteTypeEditor';
import type { NoteType, Note, AnkiCard } from '../lib/models';
import CardWebView from '../components/CardWebView';

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function makePreview(nt: NoteType): { note: Note; card: AnkiCard } {
    const note: Note = {
        id: 0,
        guid: 'preview',
        noteTypeId: nt.id,
        mod: 0,
        usn: -1,
        tags: [],
        fields: nt.fields.map((f) => `${f.name} örneği`),
        sfld: '',
        csum: 0,
        flags: 0,
    };
    return { note, card: { id: 0, noteId: 0, deckId: 1, ord: 0 } as unknown as AnkiCard };
}

export default function NoteTypeScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { bumpDataVersion } = useApp();

    const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
    const [nt, setNt] = useState<NoteType | null>(null);

    useEffect(() => {
        setNt(getNoteType(id));
    }, [id]);

    const preview = useMemo(() => (nt ? makePreview(nt) : null), [nt]);

    if (!nt || !preview) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.help}>Not türü bulunamadı.</Text>
            </SafeAreaView>
        );
    }

    const template = nt.templates[0];
    // Cloze cards are generated from the {{c1::…}} markers in the cloze field, so reordering or
    // removing fields would desync the generated cards. Only cosmetic edits are allowed for them.
    const isCloze = nt.kind === 'cloze';

    // Structural field changes migrate every note, so they persist immediately.
    const applyStructural = (edit: FieldEdit) => {
        if (edit.noteType === nt) return; // no-op edit
        try {
            applyFieldEdit(nt.id, edit);
            setNt(edit.noteType);
            bumpDataVersion();
        } catch (e) {
            console.warn('[NoteType] field edit failed:', e);
            alert('Hata', 'Alan güncellenemedi.');
        }
    };

    const handleRemoveField = (ord: number) => {
        if (isCloze) {
            alert('Uyarı', 'Kapama (cloze) türünde alanlar yeniden düzenlenemez.');
            return;
        }
        if (nt.fields.length <= 1) {
            alert('Uyarı', 'Bir not türünde en az bir alan olmalıdır.');
            return;
        }
        confirm('Alanı sil', `"${nt.fields[ord].name}" alanı ve tüm notlardaki değeri silinecek.`, () =>
            applyStructural(removeField(nt, ord)),
            { destructive: true },
        );
    };

    const handleSave = () => {
        try {
            saveNoteType(nt);
            bumpDataVersion();
            alert('Kaydedildi', 'Not türü güncellendi.', () => router.back());
        } catch (e) {
            console.warn('[NoteType] save failed:', e);
            alert('Hata', 'Not türü kaydedilemedi.');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.label}>AD</Text>
                <TextInput
                    style={styles.input}
                    value={nt.name}
                    onChangeText={(text) => setNt(renameNoteType(nt, text))}
                    placeholder="Not türü adı"
                    placeholderTextColor={Colors.textMuted}
                />

                <Text style={styles.label}>ALANLAR</Text>
                {nt.fields.map((field, i) => (
                    <View key={field.ord} style={styles.fieldRow}>
                        <TextInput
                            style={[styles.input, styles.fieldName]}
                            value={field.name}
                            onChangeText={(text) => setNt(renameField(nt, field.ord, text))}
                        />
                        <TouchableOpacity
                            style={[styles.iconBtn, (i === 0 || isCloze) && styles.iconBtnDisabled]}
                            disabled={i === 0 || isCloze}
                            onPress={() => applyStructural(moveField(nt, i, i - 1))}
                        >
                            <Text style={styles.iconText}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.iconBtn, (i === nt.fields.length - 1 || isCloze) && styles.iconBtnDisabled]}
                            disabled={i === nt.fields.length - 1 || isCloze}
                            onPress={() => applyStructural(moveField(nt, i, i + 1))}
                        >
                            <Text style={styles.iconText}>↓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.iconBtn, isCloze && styles.iconBtnDisabled]}
                            disabled={isCloze}
                            onPress={() => handleRemoveField(field.ord)}
                        >
                            <Text style={[styles.iconText, styles.removeText]}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                {isCloze ? (
                    <Text style={styles.help}>Kapama (cloze) türünde alanlar yeniden düzenlenemez.</Text>
                ) : (
                    <TouchableOpacity style={styles.addFieldBtn} onPress={() => applyStructural(addField(nt, 'Yeni Alan'))}>
                        <Text style={styles.addFieldText}>+ Alan Ekle</Text>
                    </TouchableOpacity>
                )}

                {template && (
                    <>
                        <Text style={styles.label}>ÖN YÜZ (SORU)</Text>
                        <TextInput
                            style={[styles.input, styles.code]}
                            value={template.qfmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { qfmt: text }))}
                            multiline
                            textAlignVertical="top"
                            autoCapitalize="none"
                        />

                        <Text style={styles.label}>ARKA YÜZ (CEVAP)</Text>
                        <TextInput
                            style={[styles.input, styles.code]}
                            value={template.afmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { afmt: text }))}
                            multiline
                            textAlignVertical="top"
                            autoCapitalize="none"
                        />
                    </>
                )}

                <Text style={styles.label}>STİL (CSS)</Text>
                <TextInput
                    style={[styles.input, styles.code]}
                    value={nt.css}
                    onChangeText={(text) => setNt(setCss(nt, text))}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                />

                <Text style={styles.label}>ÖNİZLEME</Text>
                <View style={styles.previewBox}>
                    <Text style={styles.previewCaption}>Soru</Text>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="question" />
                    <Text style={styles.previewCaption}>Cevap</Text>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="answer" />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 Kaydet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>Kapat</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.md, color: Colors.textMuted, padding: Spacing.lg },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: Colors.textMuted,
        textTransform: 'uppercase',
        marginTop: Spacing.sm,
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
    code: { minHeight: 72, fontFamily: MONOSPACE, fontSize: FontSize.sm },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fieldName: { flex: 1 },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBtnDisabled: { opacity: 0.35 },
    iconText: { fontSize: 16, color: Colors.textSecondary },
    removeText: { color: Colors.badgeNew },
    addFieldBtn: {
        borderWidth: 1,
        borderColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    addFieldText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.accent },
    previewBox: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm,
        gap: 4,
    },
    previewCaption: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
        color: Colors.textMuted,
        textTransform: 'uppercase',
    },
    saveBtn: {
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    saveBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
    cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
    cancelBtnText: { fontSize: FontSize.md, color: Colors.textMuted },
});
