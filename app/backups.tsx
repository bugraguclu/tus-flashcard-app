import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui/Button';
import { Section } from '../components/ui/Card';
import { EmptyState, LoadingState, Notice } from '../components/ui/Feedback';
import { TextField } from '../components/ui/Fields';
import { Type } from '../components/ui/tokens';
import { Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { readOnlyTabMessage } from '../lib/db';
import { useAppSettings, useCatalogStatus, useCollectionInvalidation } from '../contexts/AppContext';
import {
    createBackupNow,
    BackupNameError,
    deleteBackup,
    displayBackupName,
    getDefaultBackupFileName,
    importBackupContents,
    isPreRestoreBackup,
    listBackups,
    readBackup,
    validateBackupContents,
    type BackupInfo,
} from '../lib/backup';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';
import MediaCheckSection from '../components/backups/MediaCheckSection';

/** A size in the language's own separators: 12,3 MB in Turkish, 12.3 MB in English. */
function formatSize(bytes: number, localeTag: string): string {
    if (bytes >= 1024 * 1024) {
        return `${new Intl.NumberFormat(localeTag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
    }
    return `${new Intl.NumberFormat(localeTag).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

function formatDate(epochMs: number, localeTag: string): string {
    if (!epochMs) return '';
    return new Date(epochMs).toLocaleString(localeTag, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function BackupsScreen() {
    const { t, l, localeTag } = useI18n();
    const router = useRouter();
    const { refreshSettings: refreshData } = useAppSettings();
    const { invalidateCollection: bumpDataVersion } = useCollectionInvalidation();
    const { refreshCatalogAccess } = useCatalogStatus();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [defaultBackupName, setDefaultBackupName] = useState(() => getDefaultBackupFileName());
    const [backupName, setBackupName] = useState(defaultBackupName);

    const reload = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            setBackups(await listBackups());
        } catch (e) {
            console.warn('[Backups] list failed:', e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const withBusy = async (work: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try {
            await work();
        } finally {
            setBusy(false);
        }
    };

    const handleBackupNow = () =>
        withBusy(async () => {
            try {
                // Leaving the suggested name untouched keeps the existing timestamp-based
                // automatic naming behavior. A changed value is normalized and namespaced by
                // the backup layer before it reaches the filesystem.
                const name = backupName.trim() === defaultBackupName ? undefined : backupName;
                const { restorable } = await createBackupNow({}, { name });
                await reload();
                const nextDefaultName = getDefaultBackupFileName();
                setDefaultBackupName(nextDefaultName);
                setBackupName(nextDefaultName);
                // A damaged row makes the snapshot a recovery copy, which is never offered as restorable.
                alert(
                    restorable ? t('common.completed') : t('backup.notRestorableTitle'),
                    restorable
                        ? l('Güncel veriler yerel bir yedek olarak kaydedildi.', 'Current data was saved as a local backup.')
                        : t('backup.recoveryCopySaved'),
                );
            } catch (e) {
                console.warn('[Backups] manual backup failed:', e);
                const message = e instanceof BackupNameError && e.code === 'duplicate'
                    ? l('Bu adla bir yedek zaten var. Başka bir ad seçin.', 'A backup with this name already exists. Choose another name.')
                    : e instanceof BackupNameError && e.code === 'empty'
                        ? l('Bir yedek adı girin.', 'Enter a backup name.')
                        : e instanceof BackupNameError && e.code === 'invalid-extension'
                            ? l('Yedek adı .json uzantılı olmalı.', 'Backup names must use the .json extension.')
                            : e instanceof BackupNameError && e.code === 'too-long'
                                ? l('Yedek adı çok uzun.', 'Backup name is too long.')
                                : e instanceof BackupNameError
                                    ? l('Yedek adı geçersiz karakterler içeriyor.', 'Backup name contains unsupported characters.')
                                    : l('Yedek oluşturulamadı.', 'Could not create a backup.');
                alert(t('common.error'), message);
            }
        });

    const recoveryCopyMessage = () => l('Bu kurtarma kopyası hasarlı satırlar içerir. Paylaş ile ham dosyayı dışa aktarın; doğrudan geri yüklenemez.', 'This recovery copy contains damaged rows. Use Share to export its raw file; it cannot be restored directly.');

    const handleRestore = (name: string) => {
        const readOnly = readOnlyTabMessage();
        if (readOnly) {
            alert(t('common.error'), readOnly);
            return;
        }
        // Read and check the file before offering to replace the collection with it, so a recovery
        // copy is never presented as a restore point.
        void withBusy(async () => {
            let contents: string;
            try {
                contents = await readBackup(name);
            } catch (e) {
                console.warn('[Backups] read failed:', e);
                alert(t('common.error'), l('Yedek geri yüklenemedi.', 'Could not restore the backup.'));
                return;
            }
            const validation = validateBackupContents(contents);
            if (!validation.valid) {
                alert(t('common.error'), validation.reason === 'recovery-only' ? recoveryCopyMessage() : l('Yedek geri yüklenemedi.', 'Could not restore the backup.'));
                return;
            }
            confirmRestore(contents);
        });
    };

    const confirmRestore = (contents: string) => {
        confirm(
            l('Yedeği geri yükle', 'Restore Backup'),
            l(
                'Bu yedek mevcut koleksiyonun ve uygulama ayarlarının yerini alacak. Medya dosyalarına dokunulmaz. Geri yüklemeden önce mevcut durumun bir kopyası “Geri yükleme öncesi kopya” olarak saklanır.',
                'This backup will replace the current collection and app settings. Media files are not touched. A copy of the current state is kept as a “Pre-restore snapshot” first.',
            ),
            () =>
                void withBusy(async () => {
                    try {
                        const result = await importBackupContents(contents);
                        // Backups leave the purchased pack out, so a restore has to put it back:
                        // this reinstalls it for an entitled learner, and the installation puts
                        // their tags and card data back on (lib/bkaCatalog.ts).
                        await reload();
                        if (result.ok) {
                            await refreshCatalogAccess();
                            refreshData();
                            bumpDataVersion();
                            alert(t('common.completed'), l('Yedek geri yüklendi.', 'Backup restored.'));
                        } else {
                            alert(t('common.error'), l('Yedek geri yüklenemedi. İşlem öncesi güvenlik kopyası korundu.', 'Could not restore the backup. The safety copy from before the operation was retained.'));
                        }
                    } catch (e) {
                        console.warn('[Backups] restore failed:', e);
                        alert(t('common.error'), e instanceof Error && e.message.includes('recovery-only') ? recoveryCopyMessage() : l('Yedek geri yüklenemedi.', 'Could not restore the backup.'));
                    }
                }),
            { destructive: true },
        );
    };

    /** A backup as its row shows it: its name (or kind) and date, never the private file name. */
    const backupTitle = (backup: BackupInfo) => isPreRestoreBackup(backup.name)
        ? l('Geri yükleme öncesi kopya', 'Pre-restore snapshot')
        : `“${displayBackupName(backup.name)}”`;
    const backupLabel = (backup: BackupInfo) => [backupTitle(backup), formatDate(backup.createdAt, localeTag)].filter(Boolean).join(', ');

    const handleDelete = (backup: BackupInfo) => {
        const date = formatDate(backup.createdAt, localeTag);
        const shown = date ? `${backupTitle(backup)} (${date})` : backupTitle(backup);
        confirm(l('Yedeği sil', 'Delete Backup'), l(`${shown} kalıcı olarak silinecek.`, `${shown} will be permanently deleted.`), () =>
            void withBusy(async () => {
                try {
                    await deleteBackup(backup.name);
                    await reload();
                } catch (e) {
                    console.warn('[Backups] delete failed:', e);
                    alert(t('common.error'), l('Yedek silinemedi.', 'Could not delete the backup.'));
                }
            }),
            { destructive: true },
        );
    };

    const handleShare = (name: string) => {
        // Backups is an iOS form sheet. Replacing that route keeps the canonical
        // full-screen export workflow visible instead of pushing it behind the sheet.
        router.replace({ pathname: '/export', params: { backup: name } } as any);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScreenHeader
                title={l('Yedekler', 'Backups')}
                onBack={() => router.canGoBack() ? router.back() : router.replace('/decks' as any)}
                backAccessibilityLabel={l('Destelere dön', 'Back to decks')}
            />
            <ScrollView contentContainerStyle={styles.content}>
                <Section label={l('Yedek adı', 'Backup name')} padded>
                    <TextField
                        value={backupName}
                        onChangeText={setBackupName}
                        placeholder={defaultBackupName}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => { void handleBackupNow(); }}
                        accessibilityLabel={l('Yedek adı', 'Backup name')}
                        editable={!busy}
                    />
                    <Button label={l('Şimdi yedekle', 'Back Up Now')} onPress={handleBackupNow} disabled={busy} />
                </Section>

                {loading && <LoadingState />}

                {!loading && loadError && (
                    <Notice
                        tone="danger"
                        action={(
                            <Button
                                label={t('common.retry')}
                                variant="secondary"
                                size="compact"
                                onPress={() => { void reload(); }}
                                accessibilityLabel={l('Yedekleri tekrar yükle', 'Reload backups')}
                            />
                        )}
                    >
                        {l('Yedekler yüklenemedi.', 'Backups could not be loaded.')}
                    </Notice>
                )}

                {!loading && !loadError && backups.length === 0 && (
                    <EmptyState title={l('Henüz yedek yok.', 'No backups yet.')} />
                )}

                {!loadError && backups.length > 0 ? (
                    <Section>
                        {backups.map((backup) => (
                            <View key={backup.name} style={styles.row}>
                                <View>
                                    <Text style={styles.rowTitle}>
                                        {isPreRestoreBackup(backup.name)
                                            ? l('Geri yükleme öncesi kopya', 'Pre-restore snapshot')
                                            : l('Koleksiyon yedeği', 'Collection backup')}
                                    </Text>
                                    {!isPreRestoreBackup(backup.name) && (
                                        <Text style={styles.rowName} numberOfLines={1}>{displayBackupName(backup.name)}</Text>
                                    )}
                                    <Text style={styles.rowSub}>
                                        {formatDate(backup.createdAt, localeTag)} · {formatSize(backup.size, localeTag)}
                                    </Text>
                                </View>
                                <View style={styles.rowActions}>
                                    <Button
                                        label={l('Geri yükle', 'Restore')}
                                        variant="secondary"
                                        size="compact"
                                        onPress={() => handleRestore(backup.name)}
                                        disabled={busy}
                                        accessibilityLabel={l(`Geri yükle: ${backupLabel(backup)}`, `Restore: ${backupLabel(backup)}`)}
                                    />
                                    <Button
                                        label={l('Paylaş', 'Share')}
                                        variant="secondary"
                                        size="compact"
                                        onPress={() => handleShare(backup.name)}
                                        disabled={busy}
                                        accessibilityLabel={l(`Paylaş: ${backupLabel(backup)}`, `Share: ${backupLabel(backup)}`)}
                                    />
                                    <Button
                                        label={t('common.delete')}
                                        variant="plain"
                                        tone="danger"
                                        size="compact"
                                        onPress={() => handleDelete(backup)}
                                        disabled={busy}
                                        accessibilityLabel={l(`Sil: ${backupLabel(backup)}`, `Delete: ${backupLabel(backup)}`)}
                                    />
                                </View>
                            </View>
                        ))}
                    </Section>
                ) : null}

                <MediaCheckSection disabled={busy} />
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.lg },
        row: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
        rowTitle: { ...Type.rowTitle, color: colors.textPrimary },
        rowName: { ...Type.caption, color: colors.textSecondary, marginTop: 3 },
        rowSub: { ...Type.caption, color: colors.textMuted, marginTop: 2 },
        rowActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
    });
}
