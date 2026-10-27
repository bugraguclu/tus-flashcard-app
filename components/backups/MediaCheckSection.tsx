import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
        <View style={styles.section}>
            <Text style={styles.label} accessibilityRole="header">{l('MEDYA', 'MEDIA')}</Text>
            <TouchableOpacity style={[styles.button, locked && styles.disabled]} onPress={handleCheck} disabled={locked} accessibilityRole="button">
                <Text style={styles.buttonText}>{l('Medyayı denetle', 'Check Media')}</Text>
            </TouchableOpacity>
            {working && <ActivityIndicator color={colors.accent} />}
            {result && (
                <View style={styles.card}>
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
                        <TouchableOpacity style={[styles.button, locked && styles.disabled]} onPress={handleTrash} disabled={locked} accessibilityRole="button">
                            <Text style={[styles.buttonText, styles.danger]}>{l(`Kullanılmayanları çöpe taşı (${result.unused.length})`, `Move Unused to Trash (${result.unused.length})`)}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
            {canTrashMedia() && (
                <TouchableOpacity style={[styles.secondary, locked && styles.disabled]} onPress={handleRestoreTrash} disabled={locked} accessibilityRole="button">
                    <Text style={styles.secondaryText}>{l('Çöptekileri geri getir', 'Restore Trash')}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        section: { gap: Spacing.sm, marginTop: Spacing.lg },
        label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, color: colors.textMuted },
        button: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, borderRadius: BorderRadius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
        buttonText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
        danger: { color: colors.btnAgain },
        disabled: { opacity: 0.5 },
        card: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, padding: Spacing.md, gap: Spacing.sm },
        summary: { fontSize: FontSize.md, color: colors.textPrimary },
        heading: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary },
        names: { fontSize: FontSize.sm, color: colors.textMuted },
        secondary: { alignSelf: 'center', paddingVertical: Spacing.sm },
        secondaryText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
    });
}
