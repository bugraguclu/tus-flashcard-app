import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    Platform,
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
    countNotesOfType,
    isClozeSourceField,
    structuralEditOverDraft,
    type FieldEdit,
} from '../lib/noteTypeEditor';
import { isCatalogNoteType } from '../lib/catalogProtection';
import { isImageOcclusionNoteType } from '../lib/imageOcclusionNoteType';
import { canDeleteNoteType, deleteNoteTypeWithBackup, NoteTypeDeletionError, noteTypeDeletionImpact } from '../lib/noteTypeDeletion';
import { BackupNotRestorableError, displayBackupName } from '../lib/backup';
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
    const [deleting, setDeleting] = useState(false);

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
    // A cloze type's cards come from the clozes in the field its template reads through the cloze
    // filter, by name, so its fields are added, removed and moved as Anki allows; removing that
    // field empties the cards, and the confirmation says so. Image Occlusion keeps its fields: its
    // editor and its cards rely on them.
    const isImageOcclusion = isImageOcclusionNoteType(nt);
    // A catalog update writes the pack's own note type back over the notes' positional fields, so
    // a field added, removed or moved here would put every catalog note's values in the wrong
    // field at the next update.
    const catalogOwned = isCatalogNoteType(nt);
    const fieldsLocked = isImageOcclusion || catalogOwned;
    // Anki's Delete; the stock, legacy and catalog types stay.
    const deletable = canDeleteNoteType(nt);

    /**
     * Structural field changes migrate every note, so they persist at once. They are built on the
     * saved note type: a name, template or styling still being edited is neither saved with them
     * unchecked nor marked as saved. The same change is applied to the draft on screen.
     */
    const applyStructural = (makeEdit: (base: NoteType) => FieldEdit) => {
        const saved = getNoteType(nt.id);
        const edit = saved ? structuralEditOverDraft(saved, nt, makeEdit) : null;
        if (!edit) return; // no-op edit
        try {
            applyFieldEdit(nt.id, edit.persist);
            setNt(edit.draft);
            setSavedSnapshot(stableSnapshot(edit.persist.noteType));
            // Fields and notes change, no card does: a study session keeps its queue, as in Anki.
            bumpDataVersion({ keepsStudyQueue: true });
        } catch (e) {
            console.warn('[NoteType] field edit failed:', e);
            alert(t('common.error'), l('Alan güncellenemedi.', 'Could not update the field.'));
        }
    };

    const handleRemoveField = (ord: number) => {
        if (fieldsLocked) return;
        if (nt.fields.length <= 1) {
            alert(l('Uyarı', 'Warning'), l('Bir not türünde en az bir alan bulunmalıdır.', 'A note type must have at least one field.'));
            return;
        }
        const name = nt.fields[ord].name;
        const notes = countNotesOfType(nt.id);
        const clozeSource = isClozeSourceField(nt, name);
        confirm(
            l('Alanı sil', 'Delete Field'),
            l(`“${name}” alanı ve ${notes} nottaki değeri silinecek. Bu işlem geri alınamaz.`, `The “${name}” field and its value in ${notes} ${notes === 1 ? 'note' : 'notes'} will be deleted. This cannot be undone.`)
                + (clozeSource
                    ? l(
                        ' Bu türün kartları bu alandaki boşluklardan oluşuyor: alan silinirse kartlar boş kalır ve Boş kartlar’da görünür.',
                        ' This type’s cards come from the clozes in this field: without it they are empty and show up in Empty Cards.',
                    )
                    : ''),
            () => applyStructural((base) => removeField(base, ord)),
            { destructive: true },
        );
    };

    /** Back up, then delete the type with its notes and cards, and leave the screen. */
    const runDelete = async () => {
        setDeleting(true);
        try {
            const outcome = await deleteNoteTypeWithBackup(getNoteType(nt.id) ?? nt);
            // Cards left the collection, so a study session rebuilds its queue.
            bumpDataVersion();
            // Nothing is left to save: leaving asks nothing.
            setSavedSnapshot(null);
            setPendingFieldNames(0);
            alert(
                t('common.completed'),
                l(
                    `Not türü ${outcome.notes} not ve ${outcome.cards} kartla birlikte silindi. Geri almak için Yedekler’den ${displayBackupName(outcome.backupFileName)} yedeğini geri yükleyin.`,
                    `The note type was deleted with ${outcome.notes} ${outcome.notes === 1 ? 'note' : 'notes'} and ${outcome.cards} ${outcome.cards === 1 ? 'card' : 'cards'}. To undo, restore ${displayBackupName(outcome.backupFileName)} from Backups.`,
                ),
                () => goBackOr(router, '/note-types'),
            );
        } catch (e) {
            console.warn('[NoteType] delete failed:', e);
            if (e instanceof NoteTypeDeletionError && e.stage === 'backup' && e.cause instanceof BackupNotRestorableError) {
                alert(t('backup.notRestorableTitle'), t('backup.notRestorableMessage'));
            } else if (e instanceof NoteTypeDeletionError && e.stage === 'backup') {
                alert(t('common.error'), l(
                    'Güvenlik yedeği alınamadığı için hiçbir şey silinmedi. Yedekler ekranını kontrol edip tekrar deneyin.',
                    'Nothing was deleted because the safety backup could not be created. Check Backups and try again.',
                ));
            } else {
                alert(t('common.error'), l('Not türü silinemedi; hiçbir şey değişmedi.', 'The note type could not be deleted; nothing changed.'));
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleDelete = () => {
        if (deleting || !deletable) return;
        const { notes, cards } = noteTypeDeletionImpact(nt.id);
        const name = getNoteType(nt.id)?.name ?? nt.name;
        confirm(
            l('Not türünü sil', 'Delete Note Type'),
            notes > 0
                ? l(
                    `“${name}” not türü ${notes} notu ve ${cards} kartıyla birlikte silinecek. Tekrar geçmişi korunur. Silmeden önce geri yüklenebilir bir yedek alınır.`,
                    `The note type “${name}” will be deleted with its ${notes} ${notes === 1 ? 'note' : 'notes'} and ${cards} ${cards === 1 ? 'card' : 'cards'}. Review history is kept. A restorable backup is taken before deleting.`,
                )
                : l(
                    `“${name}” not türü silinecek; bu türde not yok. Silmeden önce geri yüklenebilir bir yedek alınır.`,
                    `The note type “${name}” will be deleted; it has no notes. A restorable backup is taken before deleting.`,
                ),
            () => { void runDelete(); },
            { destructive: true, confirmLabel: l('Sil', 'Delete') },
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
        // The name is kept as typed, spaces included, and trimmed only here.
        const name = nt.name.trim();
        if (!name) {
            alert(l('Ad gerekli', 'Name Required'), l('Not türüne bir ad verin.', 'Give the note type a name.'));
            return;
        }
        const next = renameNoteType(nt, name);
        const problems = validateNoteType(next);
        if (problems.length) {
            alert(
                l('Not türü kaydedilemedi', 'Cannot Save Note Type'),
                problems.slice(0, 6).map((problem) => `• ${noteTypeProblemMessage(problem, l)}`).join('\n'),
            );
            return;
        }
        try {
            saveNoteType(next);
            setNt(next);
            setSavedSnapshot(stableSnapshot(next));
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
            <ScrollView
                contentContainerStyle={styles.content}
                // Without the keyboard's inset the back template and the styling sit under the
                // keyboard, caret included, as the multiline fields grow.
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                keyboardShouldPersistTaps="handled"
            >
                <SectionLabel style={styles.label}>{l('Ad', 'Name')}</SectionLabel>
                <TextField
                    value={nt.name}
                    onChangeText={(text) => setNt((current) => (current ? { ...current, name: text } : current))}
                    placeholder={l('Not türü adı', 'Note type name')}
                    accessibilityLabel={l('Not türü adı', 'Note type name')}
                />

                <SectionLabel style={styles.label}>{l('Alanlar', 'Fields')}</SectionLabel>
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
                            accessibilityLabel={l(`“${field.name}” alanını yukarı taşı`, `Move “${field.name}” up`)}
                            disabled={i === 0 || fieldsLocked}
                            onPress={() => applyStructural((base) => moveField(base, i, i - 1))}
                        >
                            <ArrowUpIcon color={colors.textSecondary} />
                        </IconButton>
                        <IconButton
                            accessibilityLabel={l(`“${field.name}” alanını aşağı taşı`, `Move “${field.name}” down`)}
                            disabled={i === nt.fields.length - 1 || fieldsLocked}
                            onPress={() => applyStructural((base) => moveField(base, i, i + 1))}
                        >
                            <ArrowDownIcon color={colors.textSecondary} />
                        </IconButton>
                        <IconButton
                            disabled={fieldsLocked}
                            onPress={() => handleRemoveField(field.ord)}
                            accessibilityLabel={l(`“${field.name}” alanını sil`, `Delete “${field.name}”`)}
                        >
                            <CloseIcon color={colors.danger} />
                        </IconButton>
                    </View>
                ))}
                {catalogOwned ? (
                    <Text style={styles.help}>{l('Bu not türü TUS Kartları paketine ait ve paket güncellenince yenilenir; alan eklenemez, silinemez veya taşınamaz.', 'This note type belongs to the TUS card pack and is refreshed when the pack updates; fields cannot be added, removed or moved.')}</Text>
                ) : isImageOcclusion ? (
                    <Text style={styles.help}>{l('Görüntü Örtme düzenleyicisi ve kartları bu alanlara dayanır; alan eklenemez, silinemez veya taşınamaz.', 'The Image Occlusion editor and its cards rely on these fields, so they cannot be added, removed or moved.')}</Text>
                ) : (
                    <Button
                        variant="secondary"
                        size="compact"
                        icon={<PlusIcon color={colors.textPrimary} size={18} />}
                        label={l('Alan ekle', 'Add Field')}
                        onPress={() => applyStructural((base) => addField(base, l('Yeni alan', 'New Field')))}
                    />
                )}

                {nt.templates.length > 1 && (
                    <>
                        <SectionLabel style={styles.label}>{l('Kart türleri', 'Card types')}</SectionLabel>
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
                            autoCorrect={false}
                            spellCheck={false}
                            accessibilityLabel={l(`${template.name}: ön yüz şablonu`, `${template.name}: front template`)}
                        />

                        <SectionLabel style={styles.label}>{l('ARKA YÜZ (CEVAP)', 'BACK TEMPLATE')}</SectionLabel>
                        <TextField
                            monospace
                            value={template.afmt}
                            onChangeText={(text) => setNt(updateTemplate(nt, template.ord, { afmt: text }))}
                            multiline
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            accessibilityLabel={l(`${template.name}: arka yüz şablonu`, `${template.name}: back template`)}
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
                    autoCorrect={false}
                    spellCheck={false}
                    accessibilityLabel={l('Stil (CSS)', 'Styling (CSS)')}
                />

                <SectionLabel style={styles.label}>{l('Önizleme', 'Preview')}</SectionLabel>
                <Card padded>
                    <SectionLabel>{l('Soru', 'Question')}</SectionLabel>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="question" scrollMode="intrinsic" />
                    <SectionLabel>{l('Cevap', 'Answer')}</SectionLabel>
                    <CardWebView noteType={nt} note={preview.note} card={preview.card} side="answer" scrollMode="intrinsic" />
                </Card>

                <Button label={t('common.save')} onPress={handleSave} style={styles.saveButton} />
                <Button variant="plain" tone="muted" label={t('common.close')} onPress={() => goBackOr(router, '/note-types')} />
                {deletable ? (
                    <Button
                        variant="plain"
                        tone="danger"
                        label={deleting ? l('Yedek alınıyor, ardından silinecek…', 'Backing up, then deleting…') : l('Not türünü sil', 'Delete Note Type')}
                        accessibilityLabel={l(`“${nt.name}” not türünü sil`, `Delete the note type “${nt.name}”`)}
                        onPress={handleDelete}
                        disabled={deleting}
                        busy={deleting}
                    />
                ) : null}
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
