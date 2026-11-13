import { useMemo } from 'react';
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
        // A note type without notes has no cards, so a study session keeps its queue.
        bumpDataVersion({ keepsStudyQueue: true });
        router.push(`/note-type?id=${id}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>{l('Not türlerini, alanlarını ve kart şablonlarını düzenleyin. Yeni not türü Temel türün bir kopyası olarak başlar.', 'Edit note types, their fields and card templates. A new note type starts as a copy of Basic.')}</Text>

                <Card divided>
                    {noteTypes.map((nt) => (
                        <ListRow
                            key={nt.id}
                            title={localizeNoteTypeName(locale, nt.name)}
                            // A plain string, so the row speaks it after the name.
                            summary={`${l(`${nt.fields.length} alan`, `${nt.fields.length} fields`)} · ${l(`${nt.templates.length} şablon`, `${nt.templates.length} templates`)} · ${
                                nt.kind === 'cloze' ? l('boşluk doldurma', 'cloze') : l('standart', 'standard')}`}
                            onPress={() => router.push(`/note-type?id=${nt.id}`)}
                        />
                    ))}
                </Card>

                <Button
                    variant="secondary"
                    icon={<PlusIcon color={colors.textPrimary} size={18} />}
                    label={l('Yeni not türü', 'New Note Type')}
                    onPress={createNoteType}
                    style={styles.addButton}
                />
            </ScrollView>
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
