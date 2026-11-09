import { useMemo, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { getAllNoteTypes } from '../lib/noteManager';
import { isLegacyTusNoteType, type NoteType } from '../lib/models';
import { noteCountsByType } from '../lib/noteTypeManage';
import { useI18n } from '../hooks/useI18n';
import { localizeNoteTypeName } from '../lib/i18n';
import AddNoteTypeSheet from '../components/note-types/AddNoteTypeSheet';

export default function NoteTypesScreen() {
    const { l, locale } = useI18n();
    const router = useRouter();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const noteTypes = useMemo(() => getAllNoteTypes().filter((noteType) => !isLegacyTusNoteType(noteType)), [dataVersion]);
    const noteCounts = useMemo(() => noteCountsByType(), [dataVersion]);
    const [adding, setAdding] = useState(false);

    // Anki's Add: the learner picks what to start from and names it first (AddNoteTypeSheet).
    const handleCreated = (noteType: NoteType) => {
        setAdding(false);
        // A note type without notes has no cards, so a study session keeps its queue.
        bumpDataVersion({ keepsStudyQueue: true });
        router.push(`/note-type?id=${noteType.id}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>{l('Not türlerini, alanlarını ve kart şablonlarını düzenleyin.', 'Edit note types, fields, and card templates.')}</Text>

                {noteTypes.map((nt) => {
                    const notes = noteCounts.get(nt.id) ?? 0;
                    const summary = [
                        l(`${notes} not`, `${notes} ${notes === 1 ? 'note' : 'notes'}`),
                        l(`${nt.fields.length} alan`, `${nt.fields.length} fields`),
                        l(`${nt.templates.length} şablon`, `${nt.templates.length} templates`),
                        nt.kind === 'cloze' ? l('boşluk doldurma', 'cloze') : l('standart', 'standard'),
                    ].join(' · ');
                    return (
                        <TouchableOpacity
                            key={nt.id}
                            style={styles.row}
                            onPress={() => router.push(`/note-type?id=${nt.id}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`${localizeNoteTypeName(locale, nt.name)}, ${summary}`}
                        >
                            <View style={styles.rowText}>
                                <Text style={styles.rowTitle}>{localizeNoteTypeName(locale, nt.name)}</Text>
                                <Text style={styles.rowSub}>{summary}</Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                    );
                })}

                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => setAdding(true)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Yeni not türü ekle', 'Add a note type')}
                >
                    <Text style={styles.addBtnText}>+ {l('Yeni not türü', 'New Note Type')}</Text>
                </TouchableOpacity>
            </ScrollView>
            <AddNoteTypeSheet visible={adding} onClose={() => setAdding(false)} onCreated={handleCreated} />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.sm },
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
