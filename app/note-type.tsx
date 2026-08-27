import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation } from '../contexts/AppContext';
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
import { useI18n } from '../hooks/useI18n';

const MONOSPACE = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function makePreview(nt: NoteType, exampleSuffix: string): { note: Note; card: AnkiCard } {
    const note: Note = {
        id: 0,
        guid: 'preview',
        noteTypeId: nt.id,
        mod: 0,
        usn: -1,
        tags: [],
        fields: nt.fields.map((f) => `${f.name} ${exampleSuffix}`),
        sfld: '',
        csum: 0,
        flags: 0,
    };
    return { note, card: { id: 0, noteId: 0, deckId: 1, ord: 0 } as unknown as AnkiCard };
}

export default function NoteTypeScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const id = Number(Array.isArray(params.id) ? params.id[0] : params.id);
    const [nt, setNt] = useState<NoteType | null>(null);

    useEffect(() => {
        setNt(getNoteType(id));
    }, [id]);

    const preview = useMemo(() => (nt ? makePreview(nt, l('örneği', 'example')) : null), [nt, l]);

    if (!nt || !preview) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.help}>{l('Not türü bulunamadı.', 'Note type not found.')}</Text>
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
            alert(t('common.error'), l('Alan güncellenemedi.', 'Could not update the field.'));
        }
    };

    const handleRemoveField = (ord: number) => {
        if (isCloze) {
            alert(l('Uyarı', 'Warning'), l('Kapama (Cloze) türünde alanlar yeniden düzenlenemez.', 'Fields cannot be reordered in a Cloze note type.'));
            return;
        }
        if (nt.fields.length <= 1) {
            alert(l('Uyarı', 'Warning'), l('Bir not türünde en az bir alan bulunmalıdır.', 'A note type must have at least one field.'));
            return;
        }
        confirm(l('Alanı sil', 'Delete Field'), l(`“${nt.fields[ord].name}” alanı ve tüm notlardaki değeri silinecek.`, `The “${nt.fields[ord].name}” field and its value in every note will be deleted.`), () =>
            applyStructural(removeField(nt, ord)),
            { destructive: true },
        );
    };

    const handleSave = () => {
        try {
            saveNoteType(nt);
            bumpDataVersion();
            alert(t('common.saved'), l('Not türü güncellendi.', 'Note type updated.'), () => router.back());
        } catch (e) {
            console.warn('[NoteType] save failed:', e);
            alert(t('common.error'), l('Not türü kaydedilemedi.', 'Could not save the note type.'));
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.label}>{l('AD', 'NAME')}</Text>
                <TextInput
                    style={styles.input}
                    value={nt.name}
                    onChangeText={(text) => setNt(renameNoteType(nt, text))}
                    placeholder={l('Not türü adı', 'Note type name')}
                    placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.label}>{l('ALANLAR', 'FIELDS')}</Text>
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
                    <Text style={styles.help}>{l('Kapama (Cloze) türünde alanlar yeniden düzenlenemez.', 'Fields cannot be reordered in a Cloze note type.')}</Text>
                ) : (
                    <TouchableOpacity style={styles.addFieldBtn} onPress={() => applyStructural(addField(nt, l('Yeni alan', 'New Field')))}>
                        <Text style={styles.addFieldText}>+ {l('Alan ekle', 'Add Field')}</Text>
                    </TouchableOpacity>
                )}

                {template && (
                    <>
                        <Text style={styles.label}>{l('ÖN YÜZ (SORU)', 'FRONT TEMPLATE')}</Text>
                        <TextInput
                            style={[styles.input, styles.code]}
                            value={template.qfmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { qfmt: text }))}
                            multiline
                            textAlignVertical="top"
                            autoCapitalize="none"
                        />

                        <Text style={styles.label}>{l('ARKA YÜZ (CEVAP)', 'BACK TEMPLATE')}</Text>
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

                <Text style={styles.label}>{l('STİL (CSS)', 'STYLING (CSS)')}</Text>
                <TextInput
                    style={[styles.input, styles.code]}
                    value={nt.css}
                    onChangeText={(text) => setNt(setCss(nt, text))}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                />

                <Text style={styles.label}>{l('ÖNİZLEME', 'PREVIEW')}</Text>
                <View style={styles.previewBox}>
                    <Text style={styles.previewCaption}>{l('Soru', 'Question')}</Text>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="question" />
                    <Text style={styles.previewCaption}>{l('Cevap', 'Answer')}</Text>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="answer" />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>💾 {t('common.save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelBtnText}>{t('common.close')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.md, color: colors.textMuted, padding: Spacing.lg },
    label: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        color: colors.textMuted,
        textTransform: 'uppercase',
        marginTop: Spacing.sm,
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
    code: { minHeight: 72, fontFamily: MONOSPACE, fontSize: FontSize.sm },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fieldName: { flex: 1 },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBtnDisabled: { opacity: 0.35 },
    iconText: { fontSize: 16, color: colors.textSecondary },
    removeText: { color: colors.badgeNew },
    addFieldBtn: {
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
    },
    addFieldText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.accent },
    previewBox: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.sm,
        gap: 4,
    },
    previewCaption: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    saveBtn: {
        backgroundColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    saveBtnText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.white },
    cancelBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
    cancelBtnText: { fontSize: FontSize.md, color: colors.textMuted },
    });
}
