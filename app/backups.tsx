import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { useAppSettings, useCatalogStatus, useCollectionInvalidation } from '../contexts/AppContext';
import {
    createBackupNow,
    BackupNameError,
    deleteBackup,
    displayBackupName,
    getDefaultBackupFileName,
    isPreRestoreBackup,
    listBackups,
    restoreBackup,
    type BackupInfo,
} from '../lib/backup';
import { useI18n } from '../hooks/useI18n';
import ScreenHeader from '../components/ScreenHeader';

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
                await createBackupNow({}, { name });
                await reload();
                const nextDefaultName = getDefaultBackupFileName();
                setDefaultBackupName(nextDefaultName);
                setBackupName(nextDefaultName);
                alert(t('common.completed'), l('Güncel veriler yerel bir yedek olarak kaydedildi.', 'Current data was saved as a local backup.'));
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

    const handleRestore = (name: string) => {
        confirm(
            l('Yedeği geri yükle', 'Restore Backup'),
            l('Bu yedek mevcut koleksiyonun yerini alacak. Geri yüklemeden önce mevcut durumun otomatik bir kopyası oluşturulur.', 'This backup will replace the current collection. A copy of the current state is created automatically before restoring.'),
            () =>
                void withBusy(async () => {
                    try {
                        const result = await restoreBackup(name);
                        // Backups leave the purchased pack out, so a restore has to put it back:
                        // this reinstalls it for an entitled learner and re-applies their progress.
                        await reload();
                        if (result.ok) {
                            await refreshCatalogAccess();
                            refreshData();
                            bumpDataVersion();
                            alert(t('common.completed'), l('Yedek geri yüklendi.', 'Backup restored.'));
                        } else {
                            alert(t('common.error'), l('Yedek geri yüklenemedi. Mevcut veriler değişmedi.', 'Could not restore the backup. Existing data was not changed.'));
                        }
                    } catch (e) {
                        console.warn('[Backups] restore failed:', e);
                        alert(t('common.error'), l('Yedek geri yüklenemedi.', 'Could not restore the backup.'));
                    }
                }),
            { destructive: true },
        );
    };

    const handleDelete = (name: string) => {
        confirm(l('Yedeği sil', 'Delete Backup'), l(`${name} kalıcı olarak silinecek.`, `${name} will be permanently deleted.`), () =>
            void withBusy(async () => {
                try {
                    await deleteBackup(name);
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
                <Text style={styles.help}>
                    {l('Yedekler cihazda yerel tutulur. Adı kaydetmeden önce değiştirebilirsiniz.', 'Backups stay on this device. You can change the name before saving.')}
                </Text>

                <Text style={styles.label}>{l('YEDEK ADI', 'BACKUP NAME')}</Text>
                <TextInput
                    style={styles.nameInput}
                    value={backupName}
                    onChangeText={setBackupName}
                    placeholder={defaultBackupName}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => { void handleBackupNow(); }}
                    accessibilityLabel={l('Yedek adı', 'Backup name')}
                    editable={!busy}
                />

                <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={handleBackupNow}
                    disabled={busy}
                >
                    <Text style={styles.primaryBtnText}>💾 {l('Şimdi yedekle', 'Back Up Now')}</Text>
                </TouchableOpacity>

                {loading && <ActivityIndicator style={{ marginTop: Spacing.lg }} color={colors.accent} />}

                {!loading && loadError && (
                    <View style={styles.emptyState}>
                        <Text style={styles.empty}>{l('Yedekler yüklenemedi.', 'Backups could not be loaded.')}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => { void reload(); }} accessibilityRole="button" accessibilityLabel={l('Yedekleri tekrar yükle', 'Reload backups')}>
                            <Text style={styles.retryText}>{t('common.retry')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!loading && !loadError && backups.length === 0 && (
                    <Text style={styles.empty}>{l('Henüz yedek yok.', 'No backups yet.')}</Text>
                )}

                {!loadError && backups.map((backup) => (
                    <View key={backup.name} style={styles.row}>
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>
                                {isPreRestoreBackup(backup.name)
                                    ? l('↩️ Geri yükleme öncesi kopya', '↩️ Pre-restore snapshot')
                                    : l('📦 Koleksiyon yedeği', '📦 Collection backup')}
                            </Text>
                            {!isPreRestoreBackup(backup.name) && (
                                <Text style={styles.rowName} numberOfLines={1}>{displayBackupName(backup.name)}</Text>
                            )}
                            <Text style={styles.rowSub}>
                                {formatDate(backup.createdAt, localeTag)} · {formatSize(backup.size)}
                            </Text>
                        </View>
                        <View style={styles.rowActions}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleRestore(backup.name)}
                                disabled={busy}
                            >
                                <Text style={styles.actionText}>{l('Geri yükle', 'Restore')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleShare(backup.name)}
                                disabled={busy}
                            >
                                <Text style={styles.actionText}>{l('Paylaş', 'Share')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleDelete(backup.name)}
                                disabled={busy}
                            >
                                <Text style={[styles.actionText, styles.dangerText]}>{t('common.delete')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 20 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, color: colors.textMuted, marginTop: Spacing.xs },
    nameInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        backgroundColor: colors.bgInput,
        color: colors.textPrimary,
        fontSize: FontSize.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    primaryBtn: {
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.accentLight,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    primaryBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
    btnDisabled: { opacity: 0.5 },
    empty: { fontSize: FontSize.md, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.lg },
    emptyState: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
    retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm },
    retryText: { color: colors.accent, fontWeight: '600' },
    row: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        gap: Spacing.sm,
    },
    rowText: {},
    rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    rowName: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 3 },
    rowSub: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
    rowActions: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
    },
    actionText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
    dangerText: { color: colors.btnAgain },
    });
}
