import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { localizeNoteTypeName } from '../../lib/i18n';
import type { NoteType } from '../../lib/models';
import {
    cloneableNoteTypes,
    createNoteTypeFrom,
    freeNoteTypeName,
    newNoteTypeNameProblem,
    stockNoteTypes,
} from '../../lib/noteTypeManage';
import { Button } from '../ui/Button';
import { Card, SectionLabel } from '../ui/Card';
import { TextField } from '../ui/Fields';
import { ListRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';

interface AddNoteTypeSheetProps {
    visible: boolean;
    onClose: () => void;
    /** The saved note type; the list opens it in the editor. */
    onCreated: (noteType: NoteType) => void;
}

type Start = { source: NoteType; clone: boolean };

/**
 * Anki's Add Note Type: pick a stock type ("Ekle: Temel") or one of the learner's own ("Kopyala:
 * …"), then name the new type. Nothing is saved until Create.
 */
export default function AddNoteTypeSheet({ visible, onClose, onCreated }: AddNoteTypeSheetProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [start, setStart] = useState<Start | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Read when the sheet opens, so a type made or renamed since shows up.
    const lists = useMemo(() => (visible ? { stock: stockNoteTypes(), clones: cloneableNoteTypes() } : { stock: [], clones: [] }), [visible]);
    // A name the list already shows, in either language, would make two rows look alike.
    const takenNames = useMemo(
        () => lists.clones.flatMap((type) => [type.name, localizeNoteTypeName(locale, type.name)]),
        [lists, locale],
    );

    useEffect(() => {
        if (visible) return;
        setStart(null);
        setName('');
        setError(null);
    }, [visible]);

    const choose = (source: NoteType, clone: boolean) => {
        const shown = localizeNoteTypeName(locale, source.name);
        setStart({ source, clone });
        setName(freeNoteTypeName(clone ? l(`${shown} kopyası`, `${shown} copy`) : shown, takenNames));
        setError(null);
    };

    const create = () => {
        if (!start) return;
        const problem = newNoteTypeNameProblem(name, takenNames);
        if (problem === 'empty') {
            setError(l('Not türüne bir ad verin.', 'Give the note type a name.'));
            return;
        }
        if (problem === 'duplicate') {
            setError(l('Bu adda bir not türü zaten var.', 'A note type with this name already exists.'));
            return;
        }
        try {
            onCreated(createNoteTypeFrom(start.source, name));
        } catch (e) {
            console.warn('[NoteTypes] create failed:', e);
            setError(l('Not türü oluşturulamadı.', 'Could not create the note type.'));
        }
    };

    const row = (source: NoteType, clone: boolean) => {
        const shown = localizeNoteTypeName(locale, source.name);
        const label = clone ? l(`Kopyala: ${shown}`, `Clone: ${shown}`) : l(`Ekle: ${shown}`, `Add: ${shown}`);
        return (
            <ListRow
                key={`${clone ? 'clone' : 'add'}-${source.id}`}
                title={label}
                chevron
                onPress={() => choose(source, clone)}
            />
        );
    };

    return (
        <AppSheet visible={visible} onClose={onClose} title={l('Yeni not türü', 'New Note Type')} avoidKeyboard>
            {start ? (
                <View style={styles.nameStep}>
                    <Text style={styles.help}>
                        {start.clone
                            ? l(`“${localizeNoteTypeName(locale, start.source.name)}” türünün alanları, şablonları ve stili kopyalanır.`, `The fields, templates and styling of “${localizeNoteTypeName(locale, start.source.name)}” are copied.`)
                            : l(`Hazır “${localizeNoteTypeName(locale, start.source.name)}” türüyle başlar.`, `Starts from the stock “${localizeNoteTypeName(locale, start.source.name)}” type.`)}
                    </Text>
                    <SectionLabel>{l('Ad', 'Name')}</SectionLabel>
                    <TextField
                        value={name}
                        onChangeText={(text) => { setName(text); setError(null); }}
                        invalid={Boolean(error)}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={create}
                        placeholder={l('Not türü adı', 'Note type name')}
                        accessibilityLabel={l('Yeni not türünün adı', 'Name of the new note type')}
                    />
                    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
                    <View style={styles.actions}>
                        <Button
                            variant="secondary"
                            label={l('Geri', 'Back')}
                            accessibilityLabel={l('Başka bir tür seç', 'Choose another type')}
                            onPress={() => setStart(null)}
                            style={styles.action}
                        />
                        <Button
                            label={l('Oluştur', 'Create')}
                            accessibilityLabel={l('Not türünü oluştur', 'Create the note type')}
                            onPress={create}
                            style={styles.action}
                        />
                    </View>
                </View>
            ) : (
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
                    <SectionLabel>{l('Hazır türler', 'Stock types')}</SectionLabel>
                    <Card divided>{lists.stock.map((source) => row(source, false))}</Card>
                    <SectionLabel style={styles.sectionGap}>{l('Kopyala', 'Clone')}</SectionLabel>
                    <Card divided>{lists.clones.map((source) => row(source, true))}</Card>
                </ScrollView>
            )}
        </AppSheet>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        list: { flexShrink: 1 },
        listContent: { gap: Spacing.xs, paddingBottom: Spacing.md },
        sectionGap: { marginTop: Spacing.md },
        nameStep: { gap: Spacing.sm },
        help: { fontSize: FontSize.sm, color: colors.textSecondary },
        error: { fontSize: FontSize.sm, color: colors.danger },
        actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
        action: { flex: 1 },
    });
}
