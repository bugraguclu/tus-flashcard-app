import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { findEmptyCards, planCardOnlyDeletion, type EmptyCardEntry } from '../lib/noteManager';
import { BackupNotRestorableError, displayBackupName } from '../lib/backup';
import { deleteEmptyCardsWithBackup, EmptyCardsWorkflowError, type EmptyCardsDeletionOutcome } from '../lib/emptyCardsWorkflow';
import { humanizeCardText } from '../lib/displayText';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';
import { Button, IconButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import { ListRow, SwitchRow } from '../components/ui/Rows';
import { CloseIcon, TrashIcon } from '../components/ui/icons';

const NO_CARDS: ReadonlySet<number> = new Set();

function emptyCardReason(reason: EmptyCardEntry['reason'], l: (tr: string, en: string) => string): string {
    if (reason.includes('Kapama')) return l('Kapama metinde yok', 'Cloze is missing from the text');
    if (reason.includes('Şablon')) return l('Şablon artık yok', 'Template no longer exists');
    return l('Ön yüz boş', 'Front is empty');
}

export default function EmptyCardsScreen() {
    const { t, l } = useI18n();
    const router = useRouter();
    const { collectionVersion: dataVersion, invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [entries, setEntries] = useState<EmptyCardEntry[] | null>(null);
    /** The listed cards Keep Notes leaves: the first card of each note whose every card is empty. */
    const [noteKeepers, setNoteKeepers] = useState<ReadonlySet<number>>(NO_CARDS);
    /** With Keep Notes off: the cards still left (a catalog note keeps its first) and the notes that go. */
    const [catalogKeepers, setCatalogKeepers] = useState<ReadonlySet<number>>(NO_CARDS);
    const [orphanNotes, setOrphanNotes] = useState<ReadonlySet<number>>(NO_CARDS);
    const [preserveNotes, setPreserveNotes] = useState(true);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [error, setError] = useState(false);

    const scan = () => {
        setEntries(null);
        setError(false);
        // findEmptyCards is synchronous SQLite work; defer one tick so the loading state paints.
        setTimeout(() => {
            try {
                const found = findEmptyCards();
                const cardIds = found.map((entry) => entry.cardId);
                setNoteKeepers(new Set(planCardOnlyDeletion(cardIds, { preserveNotes: true }).kept));
                const withoutKeepNotes = planCardOnlyDeletion(cardIds, { preserveNotes: false });
                setCatalogKeepers(new Set(withoutKeepNotes.kept));
                setOrphanNotes(new Set(withoutKeepNotes.deletedNotes));
                setEntries(found);
            } catch (e) {
                console.warn('[EmptyCards] scan failed:', e);
                setError(true);
                setNoteKeepers(NO_CARDS);
                setCatalogKeepers(NO_CARDS);
                setOrphanNotes(NO_CARDS);
                setEntries([]);
            }
        }, 0);
    };

    // Each change to the collection, a deletion here included, scans once.
    useEffect(() => { scan(); }, [dataVersion]);

    const kept = preserveNotes ? noteKeepers : catalogKeepers;
    /** With Keep Notes off, a note whose every card is listed is deleted with them, as in Anki. */
    const notesDeletedWithAll = preserveNotes ? 0 : orphanNotes.size;
    const deletable = (entries ?? []).filter((entry) => !kept.has(entry.cardId));
    const cardText = (entry: EmptyCardEntry) => humanizeCardText(entry.question) || l('(boş)', '(empty)');

    const describeOutcome = ({ backupFileName, deleted, kept: stayed, deletedNotes }: EmptyCardsDeletionOutcome) => [
        deleted.length > 0
            ? l(`${deleted.length} boş kart silindi.`, `Deleted ${deleted.length} empty cards.`)
            : l('Hiçbir kart silinmedi.', 'No card was deleted.'),
        deletedNotes.length > 0
            ? l(`Kartı kalmayan ${deletedNotes.length} not da silindi.`, `${deletedNotes.length} ${deletedNotes.length === 1 ? 'note' : 'notes'} left without cards ${deletedNotes.length === 1 ? 'was' : 'were'} deleted too.`)
            : '',
        stayed.length > 0 ? l(`${stayed.length} kart, notu kartsız kalmasın diye bırakıldı.`, `${stayed.length} were kept so their notes keep a card.`) : '',
        backupFileName
            ? l(`Geri almak için Yedekler’den ${displayBackupName(backupFileName)} yedeğini geri yükleyin.`, `To undo, restore ${displayBackupName(backupFileName)} from Backups.`)
            : '',
    ].filter(Boolean).join(' ');

    /** Back up, then delete. A backup that cannot be made deletes nothing and says so. */
    const runDeletion = async (cardIds: number[]) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            const outcome = await deleteEmptyCardsWithBackup(cardIds, { preserveNotes });
            if (outcome.deleted.length > 0) bumpDataVersion();
            alert(t('common.completed'), describeOutcome(outcome));
        } catch (e) {
            console.warn('[EmptyCards] delete failed:', e);
            if (e instanceof EmptyCardsWorkflowError && e.stage === 'backup' && e.cause instanceof BackupNotRestorableError) {
                alert(t('backup.notRestorableTitle'), t('backup.notRestorableMessage'));
            } else if (e instanceof EmptyCardsWorkflowError && e.stage === 'backup') {
                alert(t('common.error'), l(
                    'Güvenlik yedeği alınamadığı için hiçbir kart silinmedi. Yedekler ekranını kontrol edip tekrar deneyin.',
                    'No card was deleted because the safety backup could not be created. Check Backups and try again.',
                ));
            } else if (e instanceof EmptyCardsWorkflowError && e.backupFileName) {
                alert(t('common.error'), l(
                    `Kartlar silinemedi; hiçbir kart değişmedi. ${displayBackupName(e.backupFileName)} güvenlik yedeği korundu.`,
                    `The cards could not be deleted; nothing changed. Safety backup ${displayBackupName(e.backupFileName)} was kept.`,
                ));
            } else {
                alert(t('common.error'), l('Kartlar silinemedi; hiçbir kart değişmedi.', 'The cards could not be deleted; nothing changed.'));
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const deleteOne = (entry: EmptyCardEntry) => {
        if (busyRef.current) return;
        // With Keep Notes off, the last card of a note takes the note with it.
        const takesNote = planCardOnlyDeletion([entry.cardId], { preserveNotes }).deletedNotes.length > 0;
        confirm(
            l('Boş kartı sil', 'Delete Empty Card'),
            takesNote
                ? l(
                    'Boş kart ve başka kartı kalmayan notu silinir; tekrar geçmişi korunur. Silmeden önce geri yüklenebilir bir yedek alınır.',
                    'The empty card and its note, which has no other card, are deleted; review history is kept. A restorable backup is taken before deleting.',
                )
                : l(
                    'Boş kart silinir; notu, diğer kartları ve tekrar geçmişi korunur. Silmeden önce geri yüklenebilir bir yedek alınır.',
                    'The empty card is deleted; its note, other cards and review history are kept. A restorable backup is taken before deleting.',
                ),
            () => { void runDeletion([entry.cardId]); },
            { destructive: true },
        );
    };

    const deleteAll = () => {
        if (busyRef.current || !entries || deletable.length === 0) return;
        const cardIds = entries.map((entry) => entry.cardId);
        const keptCount = entries.length - deletable.length;
        confirm(
            l('Boş kartları sil', 'Delete Empty Cards'),
            [
                l(`${deletable.length} boş kart silinecek.`, `${deletable.length} empty cards will be deleted.`),
                notesDeletedWithAll > 0
                    ? l(`Başka kartı kalmayan ${notesDeletedWithAll} not da silinecek.`, `${notesDeletedWithAll} ${notesDeletedWithAll === 1 ? 'note' : 'notes'} with no other card will be deleted too.`)
                    : '',
                keptCount > 0 ? l(`${keptCount} kart, notu kartsız kalmasın diye kalacak.`, `${keptCount} stay so their notes keep a card.`) : '',
                l('Tekrar geçmişi korunur. Silmeden önce geri yüklenebilir bir yedek alınır.', 'Review history is kept. A restorable backup is taken before deleting.'),
            ].filter(Boolean).join(' '),
            () => { void runDeletion(cardIds); },
            { destructive: true },
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={l('Boş kartlar', 'Empty Cards')}
                onBack={() => router.canGoBack() ? router.back() : router.replace('/decks' as any)}
                backAccessibilityLabel={l('Destelere dön', 'Back to decks')}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    {l(
                        'Ön yüzü artık üretilemeyen kartlar burada görünür. Silmek kartı kaldırır; notu ve diğer kartları korur. “Notları koru” kapalıyken, bütün kartları boş olan not da silinir.',
                        'Cards whose front can no longer be generated appear here. Deleting one keeps its note and other cards. With “Keep notes” off, a note whose cards are all empty is deleted too.',
                    )}
                </Text>

                {entries === null ? (
                    <LoadingState label={l('Taranıyor…', 'Scanning…')} />
                ) : error ? (
                    <EmptyState
                        title={l('Kartlar taranamadı.', 'Cards could not be scanned.')}
                        action={(
                            <Button
                                variant="secondary"
                                label={t('common.retry')}
                                accessibilityLabel={l('Tekrar tara', 'Scan again')}
                                onPress={scan}
                            />
                        )}
                    />
                ) : entries.length === 0 ? (
                    <EmptyState title={l('Boş kart bulunamadı.', 'No empty cards found.')} />
                ) : (
                    <>
                        <Card>
                            <SwitchRow
                                title={l('Geçerli kartı olmayan notları koru', 'Keep notes with no valid cards')}
                                value={preserveNotes}
                                onValueChange={setPreserveNotes}
                                disabled={busy}
                            />
                        </Card>
                        <Button
                            variant="destructive"
                            icon={<TrashIcon color={colors.onAccent} size={18} />}
                            label={`${l('Tümünü sil', 'Delete All')} (${deletable.length})`}
                            onPress={deleteAll}
                            busy={busy}
                            disabled={deletable.length === 0}
                            accessibilityLabel={l(`Tümünü sil: ${deletable.length} boş kart`, `Delete all: ${deletable.length} empty cards`)}
                        />
                        {busy && <Text style={styles.help}>{l('Yedek alınıyor, ardından silinecek…', 'Backing up, then deleting…')}</Text>}

                        <Card divided>
                            {entries.map((entry) => {
                                const keptHere = kept.has(entry.cardId);
                                const reason = emptyCardReason(entry.reason, l);
                                const outcome = keptHere
                                    ? preserveNotes
                                        ? l('Notları koru: notu kartsız kalmasın diye bu kart kalır', 'Keep Notes: this card stays so its note keeps a card')
                                        : l('Katalog notu silinmez; bu kart kalır', 'A catalog note is never deleted; this card stays')
                                    : !preserveNotes && orphanNotes.has(entry.noteId)
                                        ? l('Notu da silinir: başka kartı kalmıyor', 'Its note is deleted too: it has no other card')
                                        : null;
                                return (
                                    <ListRow
                                        key={entry.cardId}
                                        title={cardText(entry)}
                                        summary={outcome ? `${reason}\n${outcome}` : reason}
                                        accessory={keptHere ? undefined : (
                                            <IconButton
                                                accessibilityLabel={l(`Boş kartı sil: ${cardText(entry)}`, `Delete empty card: ${cardText(entry)}`)}
                                                onPress={() => deleteOne(entry)}
                                                disabled={busy}
                                            >
                                                <CloseIcon color={colors.danger} size={20} />
                                            </IconButton>
                                        )}
                                    />
                                );
                            })}
                        </Card>
                    </>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.sm },
        help: { fontSize: FontSize.sm, color: colors.textMuted, lineHeight: 20 },
    });
}
