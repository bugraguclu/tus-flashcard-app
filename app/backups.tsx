import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    Platform,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { confirm, alert } from '../lib/confirm';
import { downloadTextFileWeb } from '../lib/files';
import { useApp } from './(tabs)/app-context';
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

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(epochMs: number): string {
    if (!epochMs) return '';
    return new Date(epochMs).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function BackupsScreen() {
    const { refreshData, bumpDataVersion } = useApp();
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
                alert('Hata', 'Yedek oluşturulamadı.');
            }
        });

    const handleRestore = (name: string) => {
        confirm(
            'Yedeği Geri Yükle',
            'Mevcut koleksiyonun yerine bu yedek yüklenecek. Geri yüklemeden önce mevcut durumun otomatik bir kopyası alınır.',
            () =>
                void withBusy(async () => {
                    try {
                        const result = await restoreBackup(name);
                        await reload();
                        refreshData();
                        bumpDataVersion();
                        if (result.ok) {
                            alert('Tamamlandı', 'Yedek geri yüklendi.');
                        } else {
                            alert('Hata', 'Yedek geri yüklenemedi. Mevcut veriler değişmedi.');
                        }
                    } catch (e) {
                        console.warn('[Backups] restore failed:', e);
                        alert('Hata', 'Yedek geri yüklenemedi.');
                    }
                }),
            { destructive: true },
        );
    };

    const handleDelete = (name: string) => {
        confirm('Yedeği Sil', `${name} kalıcı olarak silinecek.`, () =>
            void withBusy(async () => {
                try {
                    await deleteBackup(name);
                    await reload();
                } catch (e) {
                    console.warn('[Backups] delete failed:', e);
                    alert('Hata', 'Yedek silinemedi.');
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
                    alert('Bilgi', 'Paylaşım bu cihazda kullanılamıyor.');
                    return;
                }
                await Sharing.shareAsync(`${getNativeBackupDir()}${name}`, {
                    mimeType: 'application/json',
                    dialogTitle: name,
                });
            } catch (e) {
                console.warn('[Backups] share failed:', e);
                alert('Hata', 'Yedek paylaşılamadı.');
            }
        });

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>
                    Uygulama her gün otomatik yedek alır ve en yeni 7 günlük yedeği saklar. Geri
                    yükleme öncesi anlık kopyalar da burada listelenir.
                </Text>

                <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={handleBackupNow}
                    disabled={busy}
                >
                    <Text style={styles.primaryBtnText}>💾 Şimdi Yedekle</Text>
                </TouchableOpacity>

                {loading && <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.accent} />}

                {!loading && backups.length === 0 && (
                    <Text style={styles.empty}>Henüz yedek yok.</Text>
                )}

                {backups.map((backup) => (
                    <View key={backup.name} style={styles.row}>
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>
                                {isPreRestoreBackup(backup.name)
                                    ? '↩️ Geri yükleme öncesi kopya'
                                    : '📦 Günlük yedek'}
                            </Text>
                            <Text style={styles.rowSub}>
                                {formatDate(backup.createdAt)} · {formatSize(backup.size)}
                            </Text>
                        </View>
                        <View style={styles.rowActions}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleRestore(backup.name)}
                                disabled={busy}
                            >
                                <Text style={styles.actionText}>Geri Yükle</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleShare(backup.name)}
                                disabled={busy}
                            >
                                <Text style={styles.actionText}>Paylaş</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleDelete(backup.name)}
                                disabled={busy}
                            >
                                <Text style={[styles.actionText, styles.dangerText]}>Sil</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 20 },
    primaryBtn: {
        borderWidth: 1,
        borderColor: Colors.accent,
        backgroundColor: Colors.accentLight,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
    },
    primaryBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },
    btnDisabled: { opacity: 0.5 },
    empty: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg },
    row: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        gap: Spacing.sm,
    },
    rowText: {},
    rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    rowSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
    rowActions: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: Colors.bgSecondary,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
    },
    actionText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
    dangerText: { color: Colors.btnAgain },
});
