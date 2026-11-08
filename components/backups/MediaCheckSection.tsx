import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { Button } from '../ui/Button';
import { Section } from '../ui/Card';
import { LoadingState } from '../ui/Feedback';
import { Type } from '../ui/tokens';
import { alert, confirm } from '../../lib/confirm';
import { createBackupNow } from '../../lib/backup';
import { canTrashMedia, checkMedia, moveUnusedMediaToTrash, restoreMediaTrash, type MediaCheckResult } from '../../lib/mediaCheck';
import { useI18n } from '../../hooks/useI18n';

const LISTED_NAMES = 20;

/**
 * Check Media on the Backups screen: report unused and missing files, and move unused ones to the
 * media trash after a confirmation and a collection backup. The trash can be put back.
 */
export default function MediaCheckSection({ disabled }: { disabled: boolean }) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [result, setResult] = useState<MediaCheckResult | null>(null);
    const [working, setWorking] = useState(false);
    const locked = disabled || working;

    const run = async (work: () => Promise<void>) => {
        if (locked) return;
        setWorking(true);
        try { await work(); } finally { setWorking(false); }
    };

    const handleCheck = () => run(async () => {
        try {
            setResult(await checkMedia());
        } catch (error) {
            console.warn('[Media] check failed:', error);
            alert(t('common.error'), l('Medya denetlenemedi.', 'Media could not be checked.'));
        }
    });

    const handleTrash = () => {
        if (!result || result.unused.length === 0) return;
        const names = result.unused;
        confirm(
            l('Kullanılmayan medya', 'Unused Media'),
            l(
                `${names.length} dosya medya çöp kutusuna taşınacak. Önce koleksiyonun bir yedeği alınır; dosyalar "Çöptekileri geri getir" ile geri konabilir.`,
                `${names.length} files will move to the media trash. A collection backup is taken first; "Restore trash" puts the files back.`,
            ),
            () => void run(async () => {
                try {
                    await createBackupNow();
                    const { moved } = await moveUnusedMediaToTrash(names);
                    setResult(await checkMedia());
                    alert(t('common.completed'), l(`${moved} dosya çöp kutusuna taşındı.`, `${moved} files moved to the trash.`));
                } catch (error) {
                    console.warn('[Media] trash failed:', error);
                    alert(t('common.error'), l('Kullanılmayan medya taşınamadı. Hiçbir dosya silinmedi.', 'Unused media could not be moved. No file was deleted.'));
                }
            }),
            { destructive: true },
        );
    };

    const handleRestoreTrash = () => run(async () => {
        try {
            const { restored, skipped } = await restoreMediaTrash();
            if (result) setResult(await checkMedia());
            alert(t('common.completed'), skipped
                ? l(`${restored} dosya geri kondu; aynı adlı ${skipped} dosya olduğu gibi bırakıldı.`, `${restored} files restored; ${skipped} with a name already in use were left in the trash.`)
                : l(`${restored} dosya geri kondu.`, `${restored} files restored.`));
        } catch (error) {
            console.warn('[Media] trash restore failed:', error);
            alert(t('common.error'), l('Çöpteki medya geri konamadı.', 'The media trash could not be restored.'));
        }
    });

    const listed = (names: string[]) => names.slice(0, LISTED_NAMES).join('\n') + (names.length > LISTED_NAMES ? `\n… +${names.length - LISTED_NAMES}` : '');

    return (
        <Section label={l('MEDYA', 'MEDIA')} padded>
            <Button label={l('Medyayı denetle', 'Check Media')} variant="secondary" onPress={handleCheck} disabled={locked} />
            {working && <LoadingState />}
            {result && (
                <View style={styles.result}>
                    <Text style={styles.summary}>
                        {l(
                            `${result.storedCount} dosya kayıtlı · ${result.unused.length} kullanılmıyor · ${result.missing.length} eksik`,
                            `${result.storedCount} files stored · ${result.unused.length} unused · ${result.missing.length} missing`,
                        )}
                    </Text>
                    {result.unused.length > 0 && (
                        <>
                            <Text style={styles.heading}>{l('Kullanılmayan', 'Unused')}</Text>
                            <Text style={styles.names} selectable>{listed(result.unused)}</Text>
                        </>
                    )}
                    {result.missing.length > 0 && (
                        <>
                            <Text style={styles.heading}>{l('Eksik (notlar başvuruyor, dosya yok)', 'Missing (referenced, not stored)')}</Text>
                            <Text style={styles.names} selectable>{listed(result.missing)}</Text>
                        </>
                    )}
                    {result.unused.length > 0 && canTrashMedia() && (
                        <Button
                            label={l(`Kullanılmayanları çöpe taşı (${result.unused.length})`, `Move Unused to Trash (${result.unused.length})`)}
                            variant="destructive"
                            onPress={handleTrash}
                            disabled={locked}
                        />
                    )}
                </View>
            )}
            {canTrashMedia() && (
                <Button label={l('Çöptekileri geri getir', 'Restore Trash')} variant="plain" tone="muted" size="compact" onPress={handleRestoreTrash} disabled={locked} />
            )}
        </Section>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        result: { gap: Spacing.sm },
        summary: { ...Type.body, color: colors.textPrimary },
        heading: { ...Type.caption, fontWeight: '700', color: colors.textSecondary },
        names: { ...Type.caption, color: colors.textMuted },
    });
}
