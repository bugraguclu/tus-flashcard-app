import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ListRow } from '../components/ui/Rows';
import { PlusIcon } from '../components/ui/icons';
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
                <Text style={styles.help}>{l('Not türlerini, alanlarını ve kart şablonlarını düzenleyin. Yeni not türü hazır bir türle başlar ya da kendi türlerinizden birinin kopyasıdır.', 'Edit note types, their fields and card templates. A new note type starts from a stock type or as a copy of one of yours.')}</Text>

                <Card divided>
                    {noteTypes.map((nt) => {
                        const notes = noteCounts.get(nt.id) ?? 0;
                        // A plain string, so the row speaks it after the name.
                        const summary = [
                            l(`${notes} not`, `${notes} ${notes === 1 ? 'note' : 'notes'}`),
                            l(`${nt.fields.length} alan`, `${nt.fields.length} fields`),
                            l(`${nt.templates.length} şablon`, `${nt.templates.length} templates`),
                            nt.kind === 'cloze' ? l('boşluk doldurma', 'cloze') : l('standart', 'standard'),
                        ].join(' · ');
                        return (
                            <ListRow
                                key={nt.id}
                                title={localizeNoteTypeName(locale, nt.name)}
                                summary={summary}
                                onPress={() => router.push(`/note-type?id=${nt.id}`)}
                            />
                        );
                    })}
                </Card>

                <Button
                    variant="secondary"
                    icon={<PlusIcon color={colors.textPrimary} size={18} />}
                    label={l('Yeni not türü', 'New Note Type')}
                    accessibilityLabel={l('Yeni not türü ekle', 'Add a note type')}
                    onPress={() => setAdding(true)}
                    style={styles.addButton}
                />
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
    addButton: { marginTop: Spacing.sm },
    });
}
