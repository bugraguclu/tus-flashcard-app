import { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Switch,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useCollectionInvalidation } from '../contexts/AppContext';
import { findEmptyCards, planCardOnlyDeletion, type EmptyCardEntry } from '../lib/noteManager';
import { BackupNotRestorableError, displayBackupName } from '../lib/backup';
import { deleteEmptyCardsWithBackup, EmptyCardsWorkflowError, type EmptyCardsDeletionOutcome } from '../lib/emptyCardsWorkflow';
import { humanizeCardText } from '../lib/displayText';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';

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
                    <View style={styles.loadingBox}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.help}>{l('Taranıyor…', 'Scanning…')}</Text>
                    </View>
                ) : error ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>{l('Kartlar taranamadı.', 'Cards could not be scanned.')}</Text>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={scan} accessibilityRole="button" accessibilityLabel={l('Tekrar tara', 'Scan again')}>
                            <Text style={styles.secondaryBtnText}>{t('common.retry')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>{l('Boş kart bulunamadı.', 'No empty cards found.')}</Text>
                    </View>
                ) : (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.help}>{l('Geçerli kartı olmayan notları koru', 'Keep notes with no valid cards')}</Text>
                            <Switch value={preserveNotes} onValueChange={setPreserveNotes} disabled={busy} accessibilityLabel={l('Notları koru', 'Keep notes')} />
                        </View>
                        <TouchableOpacity
                            style={[styles.deleteAllBtn, (busy || deletable.length === 0) && styles.btnDisabled]}
                            onPress={deleteAll}
                            disabled={busy || deletable.length === 0}
                            accessibilityRole="button"
                            accessibilityLabel={l(`Tümünü sil: ${deletable.length} boş kart`, `Delete all: ${deletable.length} empty cards`)}
                            accessibilityState={{ disabled: busy || deletable.length === 0, busy }}
                        >
                            <Text style={styles.deleteAllText}>🗑️ {l('Tümünü sil', 'Delete All')} ({deletable.length})</Text>
                        </TouchableOpacity>
                        {busy && <Text style={styles.help}>{l('Yedek alınıyor, ardından silinecek…', 'Backing up, then deleting…')}</Text>}

                        {entries.map((entry) => (
                            <View key={entry.cardId} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.rowQuestion} numberOfLines={2}>
                                        {cardText(entry)}
                                    </Text>
                                    <Text style={styles.rowReason}>{emptyCardReason(entry.reason, l)}</Text>
                                    {kept.has(entry.cardId) && (
                                        <Text style={styles.rowKept}>{preserveNotes
                                            ? l('Notları koru: notu kartsız kalmasın diye bu kart kalır', 'Keep Notes: this card stays so its note keeps a card')
                                            : l('Katalog notu silinmez; bu kart kalır', 'A catalog note is never deleted; this card stays')}</Text>
                                    )}
                                    {!preserveNotes && orphanNotes.has(entry.noteId) && (
                                        <Text style={styles.rowKept}>{l('Notu da silinir: başka kartı kalmıyor', 'Its note is deleted too: it has no other card')}</Text>
                                    )}
                                </View>
                                {!kept.has(entry.cardId) && (
                                    <TouchableOpacity
                                        style={[styles.rowDeleteBtn, busy && styles.btnDisabled]}
                                        onPress={() => deleteOne(entry)}
                                        disabled={busy}
                                        accessibilityRole="button"
                                        accessibilityLabel={l(`Boş kartı sil: ${cardText(entry)}`, `Delete empty card: ${cardText(entry)}`)}
                                        accessibilityState={{ disabled: busy }}
                                    >
                                        <Text style={styles.rowDeleteText}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
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
        loadingBox: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
        emptyBox: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xxl },
        emptyText: { fontSize: FontSize.lg, color: colors.textSecondary },
        secondaryBtn: {
            marginTop: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        secondaryBtnText: { color: colors.accent, fontWeight: '600' },
        deleteAllBtn: {
            backgroundColor: colors.badgeNewBg,
            borderWidth: 1,
            borderColor: colors.badgeNew,
            borderRadius: BorderRadius.sm,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
        },
        btnDisabled: { opacity: 0.5 },
        deleteAllText: { color: colors.badgeNew, fontWeight: '700' },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            padding: Spacing.md,
        },
        rowQuestion: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '600' },
        rowReason: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
        rowKept: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
        rowDeleteBtn: {
            width: 32,
            height: 32,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgInput,
        },
        rowDeleteText: { color: colors.badgeNew, fontWeight: '700' },
    });
}
