import React, { useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, SafeAreaView, type ListRenderItemInfo } from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { useApp } from '../contexts/AppContext';
import { getAllNoteTypes, getNoteType, saveNoteType } from '../lib/noteManager';
import { uniqueId, BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type NoteType } from '../lib/models';
import { useI18n } from '../hooks/useI18n';
import { localizeNoteTypeName } from '../lib/i18n';

export default function NoteTypesScreen() {
    const { l, locale } = useI18n();
    const router = useRouter();
    const { dataVersion, bumpDataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const noteTypes = useMemo(() => getAllNoteTypes().filter((noteType) => !isLegacyTusNoteType(noteType)), [dataVersion]);

    const createNoteType = () => {
        const base = getNoteType(1) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!;
        const id = uniqueId();
        saveNoteType({ ...base, id, name: l('Yeni Not Türü', 'New Note Type'), mod: Math.floor(Date.now() / 1000) });
        bumpDataVersion();
        router.push(`/note-type?id=${id}`);
    };

    // An imported Anki collection can carry dozens of note types; the header/footer belong to the
    // list so only the rows on screen are ever mounted.
    const renderRow = useCallback(({ item }: ListRenderItemInfo<NoteType>) => (
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/note-type?id=${item.id}`)}>
            <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{localizeNoteTypeName(locale, item.name)}</Text>
                <Text style={styles.rowSub}>
                    {l(`${item.fields.length} alan`, `${item.fields.length} fields`)} · {l(`${item.templates.length} şablon`, `${item.templates.length} templates`)} ·{' '}
                    {item.kind === 'cloze' ? l('boşluk doldurma', 'cloze') : l('standart', 'standard')}
                </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
    ), [styles, router, locale, l]);

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={noteTypes}
                renderItem={renderRow}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator
                ListHeaderComponent={(
                    <Text style={styles.help}>{l('Not türlerini, alanlarını ve kart şablonlarını düzenleyin.', 'Edit note types, fields, and card templates.')}</Text>
                )}
                ListFooterComponent={(
                    <TouchableOpacity style={styles.addBtn} onPress={createNoteType}>
                        <Text style={styles.addBtnText}>+ {l('Yeni Not Türü', 'New Note Type')}</Text>
                    </TouchableOpacity>
                )}
            />
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
