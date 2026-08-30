import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import * as Sharing from 'expo-sharing';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { downloadTextFileWeb } from '../lib/files';
import { useApp } from '../contexts/AppContext';
import {
    createBackupNow,
    deleteBackup,
    getNativeBackupDir,
    isPreRestoreBackup,
    listBackups,
    readBackup,
    restoreBackup,
    type BackupInfo,
} from '../lib/backup';
import { useI18n } from '../hooks/useI18n';

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
    const { refreshData, bumpDataVersion } = useApp();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        try {
            setBackups(await listBackups());
        } catch (e) {
            console.warn('[Backups] list failed:', e);
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
                await createBackupNow();
                await reload();
            } catch (e) {
                console.warn('[Backups] manual backup failed:', e);
                alert(t('common.error'), l('Yedek oluşturulamadı.', 'Could not create a backup.'));
            }
        });

    const handleRestore = (name: string) => {
        confirm(
            l('Yedeği Geri Yükle', 'Restore Backup'),
            l('Bu yedek mevcut koleksiyonun yerini alacak. Geri yüklemeden önce mevcut durumun otomatik bir kopyası oluşturulur.', 'This backup will replace the current collection. A copy of the current state is created automatically before restoring.'),
            () =>
                void withBusy(async () => {
                    try {
                        const result = await restoreBackup(name);
                        await reload();
                        refreshData();
                        bumpDataVersion();
                        if (result.ok) {
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
        confirm(l('Yedeği Sil', 'Delete Backup'), l(`${name} kalıcı olarak silinecek.`, `${name} will be permanently deleted.`), () =>
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

    const handleShare = (name: string) =>
        withBusy(async () => {
            try {
                if (Platform.OS === 'web') {
                    downloadTextFileWeb(name, await readBackup(name));
                    return;
                }

                if (!(await Sharing.isAvailableAsync())) {
                    alert(l('Bilgi', 'Info'), l('Paylaşım bu cihazda kullanılamıyor.', 'Sharing is not available on this device.'));
                    return;
                }
                await Sharing.shareAsync(`${getNativeBackupDir()}${name}`, {
                    mimeType: 'application/json',
                    dialogTitle: name,
                });
            } catch (e) {
                console.warn('[Backups] share failed:', e);
                alert(t('common.error'), l('Yedek paylaşılamadı.', 'Could not share the backup.'));
            }
        });

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    {l('Uygulama haftada bir otomatik yedek oluşturur ve en yeni 7 koleksiyon yedeğini saklar. Geri yükleme öncesi oluşturulan güvenlik kopyaları ayrıca burada listelenir.', 'The app creates one automatic backup per week and keeps the latest 7 collection backups. Safety snapshots created before a restore also appear here.')}
                </Text>

                <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={handleBackupNow}
                    disabled={busy}
                >
                    <Text style={styles.primaryBtnText}>💾 {l('Şimdi Yedekle', 'Back Up Now')}</Text>
                </TouchableOpacity>

                {loading && <ActivityIndicator style={{ marginTop: Spacing.lg }} color={colors.accent} />}

                {!loading && backups.length === 0 && (
                    <Text style={styles.empty}>{l('Henüz yedek yok.', 'No backups yet.')}</Text>
                )}

                {backups.map((backup) => (
                    <View key={backup.name} style={styles.row}>
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>
                                {isPreRestoreBackup(backup.name)
                                    ? l('↩️ Geri yükleme öncesi kopya', '↩️ Pre-restore snapshot')
                                    : l('📦 Koleksiyon yedeği', '📦 Collection backup')}
                            </Text>
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
                                <Text style={styles.actionText}>{l('Geri Yükle', 'Restore')}</Text>
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
