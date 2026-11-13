import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { Button, IconButton } from '../components/ui/Button';
import { Card, SectionLabel } from '../components/ui/Card';
import { Chip } from '../components/ui/Choice';
import { EmptyState } from '../components/ui/Feedback';
import { TextField } from '../components/ui/Fields';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PlusIcon } from '../components/ui/icons';
import { confirm, alert } from '../lib/confirm';
import { goBackOr } from '../lib/backNavigation';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { getNoteType, saveNoteType } from '../lib/noteManager';
import {
    renameNoteType,
    commitFieldRename,
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
import { FieldNameInput } from '../components/note-type/FieldNameInput';
import { fieldNameSyntaxMessage, noteTypeProblemMessage } from '../components/note-type/noteTypeProblemText';
import { validateNoteType } from '../lib/noteTypeValidation';
import { useI18n } from '../hooks/useI18n';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { hasSnapshotChanged, stableSnapshot } from '../lib/dirtyState';

function makePreview(nt: NoteType, exampleSuffix: string, ord: number): { note: Note; card: AnkiCard } {
    const note: Note = {
        id: 0,
        guid: 'preview',
        noteTypeId: nt.id,
        mod: 0,
        usn: -1,
        tags: [],
        fields: nt.fields.map((f, i) => (nt.kind === 'cloze' && i === 0
            ? `{{c${ord + 1}::${f.name}}} ${exampleSuffix}`
            : `${f.name} ${exampleSuffix}`)),
        sfld: '',
        csum: 0,
        flags: 0,
    };
    return { note, card: { id: 0, noteId: 0, deckId: 1, ord } as unknown as AnkiCard };
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
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    // Which card template the editor shows; Anki's Cards screen lists every one (SAB-9).
    const [templateIndex, setTemplateIndex] = useState(0);

    useEffect(() => {
        const loaded = getNoteType(id);
        setNt(loaded);
        setSavedSnapshot(loaded ? stableSnapshot(loaded) : null);
    }, [id]);

    // Field names are typed as drafts and renamed on blur; a pending draft is unsaved work too.
    const [pendingFieldNames, setPendingFieldNames] = useState(0);
    const handleFieldNamePending = useCallback((pending: boolean) => {
        setPendingFieldNames((count) => Math.max(0, count + (pending ? 1 : -1)));
    }, []);

    const isDirty = hasSnapshotChanged(savedSnapshot, nt) || pendingFieldNames > 0;
    useUnsavedChangesGuard(isDirty, {
        title: l('Değişiklikler atılsın mı?', 'Discard Changes?'),
        message: l('Kaydetmeden not türü düzenleme ekranından çıkılsın mı?', 'Leave the note type editor without saving?'),
    });

    const shownTemplateIndex = nt && templateIndex < nt.templates.length ? templateIndex : 0;
    const preview = useMemo(
        () => (nt ? makePreview(nt, l('örneği', 'example'), nt.kind === 'cloze' ? 0 : nt.templates[shownTemplateIndex]?.ord ?? 0) : null),
        [nt, l, shownTemplateIndex],
    );

    if (!nt || !preview) {
        return (
            <SafeAreaView style={styles.container}>
                <EmptyState title={l('Not türü bulunamadı.', 'Note type not found.')} />
            </SafeAreaView>
        );
    }

    const template = nt.templates[shownTemplateIndex];
    // Cloze cards are generated from the {{c1::…}} markers in the cloze field, so reordering or
    // removing fields would desync the generated cards. Only cosmetic edits are allowed for them.
    const isCloze = nt.kind === 'cloze';

    // Structural field changes migrate every note, so they persist immediately.
    const applyStructural = (edit: FieldEdit) => {
        if (edit.noteType === nt) return; // no-op edit
        try {
            applyFieldEdit(nt.id, edit);
            setNt(edit.noteType);
            setSavedSnapshot(stableSnapshot(edit.noteType));
            // Fields and notes change, no card does: a study session keeps its queue, as in Anki.
            bumpDataVersion({ keepsStudyQueue: true });
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

    const handleCommitFieldName = (ord: number, draft: string) => {
        const outcome = commitFieldRename(nt, ord, draft);
        if (outcome.status === 'duplicate') {
            const current = nt.fields.find((field) => field.ord === ord)?.name ?? '';
            const taken = outcome.conflict.name;
            alert(
                l('Alan adı kullanılıyor', 'Field Name Already Used'),
                l(`“${taken}” adı başka bir alanda kullanılıyor. Alan “${current}” adını korudu.`, `Another field is already named “${taken}”. The field keeps the name “${current}”.`),
            );
            return;
        }
        if (outcome.status === 'invalid') {
            alert(l('Geçersiz alan adı', 'Invalid Field Name'), fieldNameSyntaxMessage(outcome.reason, l));
            return;
        }
        if (outcome.status === 'renamed') setNt(outcome.noteType);
    };

    const handleSave = () => {
        const problems = validateNoteType(nt);
        if (problems.length) {
            alert(
                l('Not türü kaydedilemedi', 'Cannot Save Note Type'),
                problems.slice(0, 6).map((problem) => `• ${noteTypeProblemMessage(problem, l)}`).join('\n'),
            );
            return;
        }
        try {
            saveNoteType(nt);
            setSavedSnapshot(stableSnapshot(nt));
            // Templates and styling only: the card on screen is redrawn, the queue keeps its order.
            bumpDataVersion({ keepsStudyQueue: true });
            alert(t('common.saved'), l('Not türü güncellendi.', 'Note type updated.'), () => goBackOr(router, '/note-types'));
        } catch (e) {
            console.warn('[NoteType] save failed:', e);
            alert(t('common.error'), l('Not türü kaydedilemedi.', 'Could not save the note type.'));
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <SectionLabel style={styles.label}>{l('AD', 'NAME')}</SectionLabel>
                <TextField
                    value={nt.name}
                    onChangeText={(text) => setNt(renameNoteType(nt, text))}
                    placeholder={l('Not türü adı', 'Note type name')}
                />

                <SectionLabel style={styles.label}>{l('ALANLAR', 'FIELDS')}</SectionLabel>
                {nt.fields.map((field, i) => (
                    <View key={field.ord} style={styles.fieldRow}>
                        <FieldNameInput
                            style={styles.fieldName}
                            name={field.name}
                            onCommit={(draft) => handleCommitFieldName(field.ord, draft)}
                            onPendingChange={handleFieldNamePending}
                            accessibilityLabel={l(`Alan adı: ${field.name}`, `Field name: ${field.name}`)}
                        />
                        <IconButton
                            accessibilityLabel={l(`${field.name} yukarı taşı`, `Move ${field.name} up`)}
                            disabled={i === 0 || isCloze}
                            onPress={() => applyStructural(moveField(nt, i, i - 1))}
                        >
                            <ArrowUpIcon color={colors.textSecondary} />
                        </IconButton>
                        <IconButton
                            accessibilityLabel={l(`${field.name} aşağı taşı`, `Move ${field.name} down`)}
                            disabled={i === nt.fields.length - 1 || isCloze}
                            onPress={() => applyStructural(moveField(nt, i, i + 1))}
                        >
                            <ArrowDownIcon color={colors.textSecondary} />
                        </IconButton>
                        <IconButton
                            accessibilityLabel={l(`${field.name} alanını sil`, `Delete the ${field.name} field`)}
                            disabled={isCloze}
                            onPress={() => handleRemoveField(field.ord)}
                        >
                            <CloseIcon color={colors.danger} />
                        </IconButton>
                    </View>
                ))}
                {isCloze ? (
                    <Text style={styles.help}>{l('Kapama (Cloze) türünde alanlar yeniden düzenlenemez.', 'Fields cannot be reordered in a Cloze note type.')}</Text>
                ) : (
                    <Button
                        variant="secondary"
                        size="compact"
                        icon={<PlusIcon color={colors.textPrimary} size={18} />}
                        label={l('Alan ekle', 'Add Field')}
                        onPress={() => applyStructural(addField(nt, l('Yeni alan', 'New Field')))}
                    />
                )}

                {nt.templates.length > 1 && (
                    <>
                        <SectionLabel style={styles.label}>{l('KART TÜRLERİ', 'CARD TYPES')}</SectionLabel>
                        <View style={styles.templateTabs} accessibilityRole="tablist">
                            {nt.templates.map((entry, index) => (
                                <Chip
                                    key={entry.ord}
                                    label={`${index + 1}: ${entry.name}`}
                                    selected={index === shownTemplateIndex}
                                    onPress={() => setTemplateIndex(index)}
                                />
                            ))}
                        </View>
                    </>
                )}
                {template && (
                    <>
                        <SectionLabel style={styles.label}>{l('ÖN YÜZ (SORU)', 'FRONT TEMPLATE')}</SectionLabel>
                        <TextField
                            monospace
                            value={template.qfmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { qfmt: text }))}
                            multiline
                            autoCapitalize="none"
                        />

                        <SectionLabel style={styles.label}>{l('ARKA YÜZ (CEVAP)', 'BACK TEMPLATE')}</SectionLabel>
                        <TextField
                            monospace
                            value={template.afmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { afmt: text }))}
                            multiline
                            autoCapitalize="none"
                        />
                    </>
                )}

                <SectionLabel style={styles.label}>{l('STİL (CSS)', 'STYLING (CSS)')}</SectionLabel>
                <TextField
                    monospace
                    value={nt.css}
                    onChangeText={(text) => setNt(setCss(nt, text))}
                    multiline
                    autoCapitalize="none"
                />

                <SectionLabel style={styles.label}>{l('ÖNİZLEME', 'PREVIEW')}</SectionLabel>
                <Card padded>
                    <SectionLabel>{l('Soru', 'Question')}</SectionLabel>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="question" scrollMode="intrinsic" />
                    <SectionLabel>{l('Cevap', 'Answer')}</SectionLabel>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="answer" scrollMode="intrinsic" />
                </Card>

                <Button label={t('common.save')} onPress={handleSave} style={styles.saveButton} />
                <Button variant="plain" tone="muted" label={t('common.close')} onPress={() => goBackOr(router, '/note-types')} />
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.md, color: colors.textMuted, padding: Spacing.lg },
    label: { marginTop: Spacing.sm },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    fieldName: { flex: 1 },
    templateTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm - 2 },
    saveButton: { marginTop: Spacing.md },
    });
}
