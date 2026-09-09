import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { getAllNoteTypes, getNoteType, saveNoteType } from '../lib/noteManager';
import { uniqueId, BUILTIN_NOTE_TYPES, isLegacyTusNoteType } from '../lib/models';
import { useI18n } from '../hooks/useI18n';
import { localizeNoteTypeName } from '../lib/i18n';

export default function NoteTypesScreen() {
    const { l, locale } = useI18n();
    const router = useRouter();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const noteTypes = useMemo(() => getAllNoteTypes().filter((noteType) => !isLegacyTusNoteType(noteType)), [dataVersion]);

    const createNoteType = () => {
        const base = getNoteType(1) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!;
        const id = uniqueId();
        saveNoteType({ ...base, id, name: l('Yeni not türü', 'New Note Type'), mod: Math.floor(Date.now() / 1000) });
        bumpDataVersion();
        router.push(`/note-type?id=${id}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>{l('Not türlerini, alanlarını ve kart şablonlarını düzenleyin.', 'Edit note types, fields, and card templates.')}</Text>

                {noteTypes.map((nt) => (
                    <TouchableOpacity
                        key={nt.id}
                        style={styles.row}
                        onPress={() => router.push(`/note-type?id=${nt.id}`)}
                    >
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>{localizeNoteTypeName(locale, nt.name)}</Text>
                            <Text style={styles.rowSub}>
                                {l(`${nt.fields.length} alan`, `${nt.fields.length} fields`)} · {l(`${nt.templates.length} şablon`, `${nt.templates.length} templates`)} ·{' '}
                                {nt.kind === 'cloze' ? l('boşluk doldurma', 'cloze') : l('standart', 'standard')}
                            </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.addBtn} onPress={createNoteType}>
                    <Text style={styles.addBtnText}>+ {l('Yeni not türü', 'New Note Type')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
    },
    rowText: { flex: 1 },
    rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    rowSub: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
    chevron: { fontSize: 24, color: colors.textMuted },
    addBtn: {
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    addBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
    });
}
