import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../AppText';
import BottomSheetModal from '../BottomSheetModal';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
    const insets = useSafeAreaInsets();
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
            <TouchableOpacity
                key={`${clone ? 'clone' : 'add'}-${source.id}`}
                style={styles.row}
                onPress={() => choose(source, clone)}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <Text style={styles.rowText} numberOfLines={2}>{label}</Text>
                <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
        );
    };

    return (
        <BottomSheetModal
            visible={visible}
            onClose={onClose}
            avoidKeyboard
            sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}
        >
            <Text style={styles.title} accessibilityRole="header">{l('Yeni not türü', 'New Note Type')}</Text>
            {start ? (
                <View style={styles.nameStep}>
                    <Text style={styles.help}>
                        {start.clone
                            ? l(`“${localizeNoteTypeName(locale, start.source.name)}” türünün alanları, şablonları ve stili kopyalanır.`, `The fields, templates and styling of “${localizeNoteTypeName(locale, start.source.name)}” are copied.`)
                            : l(`Hazır “${localizeNoteTypeName(locale, start.source.name)}” türüyle başlar.`, `Starts from the stock “${localizeNoteTypeName(locale, start.source.name)}” type.`)}
                    </Text>
                    <Text style={styles.label}>{l('AD', 'NAME')}</Text>
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={(text) => { setName(text); setError(null); }}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={create}
                        placeholder={l('Not türü adı', 'Note type name')}
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={l('Yeni not türünün adı', 'Name of the new note type')}
                    />
                    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.secondary} onPress={() => setStart(null)} accessibilityRole="button" accessibilityLabel={l('Başka bir tür seç', 'Choose another type')}>
                            <Text style={styles.secondaryText}>{l('Geri', 'Back')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.primary} onPress={create} accessibilityRole="button" accessibilityLabel={l('Not türünü oluştur', 'Create the note type')}>
                            <Text style={styles.primaryText}>{l('Oluştur', 'Create')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
                    <Text style={styles.label}>{l('HAZIR TÜRLER', 'STOCK TYPES')}</Text>
                    {lists.stock.map((source) => row(source, false))}
                    <Text style={[styles.label, styles.sectionGap]}>{l('KOPYALA', 'CLONE')}</Text>
                    {lists.clones.map((source) => row(source, true))}
                </ScrollView>
            )}
        </BottomSheetModal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        sheet: {
            maxHeight: '88%',
            backgroundColor: colors.bgPrimary,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            ...Shadows.lg,
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.md },
        list: { flexShrink: 1 },
        listContent: { gap: Spacing.xs, paddingBottom: Spacing.md },
        label: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginBottom: Spacing.xs },
        sectionGap: { marginTop: Spacing.md },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm + 2,
        },
        rowText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        chevron: { fontSize: 22, color: colors.textMuted },
        nameStep: { gap: Spacing.sm },
        help: { fontSize: FontSize.sm, color: colors.textSecondary },
        input: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgInput,
            color: colors.textPrimary,
            fontSize: FontSize.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
        },
        error: { fontSize: FontSize.sm, color: colors.btnAgain },
        actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
        secondary: {
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.md,
            alignItems: 'center',
        },
        secondaryText: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '600' },
        primary: { flex: 1, backgroundColor: colors.accent, borderRadius: BorderRadius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
        primaryText: { fontSize: FontSize.md, color: colors.white, fontWeight: '700' },
    });
}
