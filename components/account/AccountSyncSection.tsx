import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useSync } from '../../contexts/SyncContext';
import { useI18n } from '../../hooks/useI18n';
import { isAccountRequestError } from '../../lib/accountApi';
import { accountErrorMessage } from '../../lib/accountMessages';
import { confirm } from '../../lib/confirm';
import type { SyncDeviceInfo } from '../../lib/syncContract';
import type { SyncStatus } from '../../lib/sync/syncEngine';
import { Button } from '../ui/Button';
import { Section } from '../ui/Card';
import { Notice } from '../ui/Feedback';
import { ListRow } from '../ui/Rows';

type Localize = (turkish: string, english: string) => string;

/** `az önce`, `3 sn önce`, `12 dk önce`, `2 sa önce`, then the date. */
export function syncedAgo(at: number, now: number, l: Localize): string {
    const seconds = Math.max(0, Math.round((now - at) / 1000));
    if (seconds < 5) return l('az önce', 'just now');
    if (seconds < 60) return l(`${seconds} sn önce`, `${seconds} s ago`);
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return l(`${minutes} dk önce`, `${minutes} min ago`);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return l(`${hours} sa önce`, `${hours} h ago`);
    return new Date(at).toLocaleDateString();
}

/** The status line (§13, phase 2): "Eşitlendi · 3 sn önce" or "12 değişiklik bekliyor". */
export function syncStatusLine(status: SyncStatus, now: number, l: Localize): string {
    if (status.phase === 'syncing') return l('Eşitleniyor…', 'Syncing…');
    if (status.phase === 'offline') {
        return status.pending > 0
            ? l(`Çevrimdışı · ${status.pending} değişiklik bekliyor`, `Offline · ${status.pending} changes waiting`)
            : l('Çevrimdışı · bağlantı gelince eşitlenecek', 'Offline · will sync when connected');
    }
    if (status.phase === 'error') return l('Eşitlenemedi · yeniden denenecek', 'Couldn’t sync · will try again');
    if (status.pending > 0) return l(`${status.pending} değişiklik bekliyor`, `${status.pending} changes waiting`);
    if (status.lastSyncedAt) return l(`Eşitlendi · ${syncedAgo(status.lastSyncedAt, now, l)}`, `Synced · ${syncedAgo(status.lastSyncedAt, now, l)}`);
    return l('Henüz eşitlenmedi', 'Not synced yet');
}

/**
 * The account page's sync section: turning sync on (the first link, which says what it will
 * merge), its status, a manual round, turning it off, and the devices on the account.
 */
export default function AccountSyncSection() {
    const sync = useSync();
    const { l } = useI18n();
    const colors = useThemeColors();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [devicesOpen, setDevicesOpen] = useState(false);
    const [devices, setDevices] = useState<SyncDeviceInfo[] | null>(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!sync.status.enabled) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 5_000);
        return () => clearInterval(timer);
    }, [sync.status.enabled]);

    const loadDevices = useCallback(async () => {
        try {
            setDevices(await sync.devices());
        } catch {
            setDevices([]);
        }
    }, [sync]);

    useEffect(() => {
        if (devicesOpen) void loadDevices();
    }, [devicesOpen, loadDevices]);

    if (!sync.available) return null;

    const turnOn = () => {
        const preview = sync.preview();
        const body = l(
            `Bu cihazdaki ${preview.studiedCards} kart ilerlemesi, ${preview.reviews} cevap ve ${preview.notes} not hesabınızla birleştirilecek. Diğer cihazlarınızdaki değişiklikler de buraya gelecek. Hiçbir şey silinmez; çevrimdışıyken çalışmaya devam edebilirsiniz.`,
            `This device’s progress on ${preview.studiedCards} cards, ${preview.reviews} reviews and ${preview.notes} notes will be merged with your account. Changes from your other devices will arrive here too. Nothing is deleted; you can keep studying offline.`,
        );
        confirm(l('iPhone ve web eşitlensin mi?', 'Sync iPhone and web?'), body, () => {
            setBusy(true);
            setError(null);
            sync.enable()
                .catch((caught: unknown) => {
                    setError(isAccountRequestError(caught)
                        ? accountErrorMessage(caught.code, l, caught.retryAfter)
                        : l('Eşitleme açılamadı. Biraz sonra yeniden deneyin.', 'Sync couldn’t be turned on. Try again in a little while.'));
                })
                .finally(() => setBusy(false));
        }, { confirmLabel: l('Eşitlemeyi aç', 'Turn on sync') });
    };

    const turnOff = () => confirm(
        l('Eşitleme kapatılsın mı?', 'Turn off sync?'),
        l(
            'Bu cihazdaki kartlarınız olduğu gibi kalır; yaptığınız değişiklikler diğer cihazlarınıza gitmez. Yeniden açtığınızda kaldığı yerden devam eder.',
            'Your cards on this device stay as they are; changes you make won’t reach your other devices. Turning it on again picks up where it left off.',
        ),
        () => sync.disable(),
        { confirmLabel: l('Kapat', 'Turn off'), destructive: true },
    );

    const removeDevice = (device: SyncDeviceInfo) => confirm(
        l(`“${device.name}” kaldırılsın mı?`, `Remove “${device.name}”?`),
        l('Cihazdaki kartlar silinmez; o cihaz yeniden eşitlenirken kendini tekrar ekler.', 'Cards on that device aren’t deleted; it adds itself again the next time it syncs.'),
        () => { void sync.removeDevice(device.dev).then(loadDevices); },
        { confirmLabel: l('Kaldır', 'Remove'), destructive: true },
    );

    const statusError = sync.status.phase === 'error' && sync.status.errorCode
        ? accountErrorMessage(sync.status.errorCode as never, l)
        : null;

    return (
        <View style={styles.stack}>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {sync.status.backupBeforeDeletion ? (
                <Notice
                    tone="warning"
                    action={<Button variant="plain" size="compact" label={l('Tamam', 'OK')} onPress={sync.dismissDeletionBackup} />}
                >
                    {l(
                        'Hesabınızda büyük bir silme ya da geri yükleme yapıldı; uygulamadan önce bu cihazın önceki hâli yedeklendi (Ayarlar › Yedekler).',
                        'A large deletion or restore was made on your account; this device’s previous state was backed up first (Settings › Backups).',
                    )}
                </Notice>
            ) : null}
            {statusError ? <Notice tone="warning">{statusError}</Notice> : null}
            <Section
                label={l('iPhone ve web eşitleme', 'iPhone and web sync')}
                footnote={sync.status.enabled
                    ? l(
                        'Kartlarınız, çalışma geçmişiniz, desteleriniz, öğrenme ayarlarınız ve Kronometre’niz hesabınızda saklanır ve cihazlarınız arasında kendiliğinden eşitlenir. Görünüm, hareket ve bildirim ayarları her cihazda ayrı kalır. Katalog içeriği hesaba gönderilmez; yalnızca ilerlemeniz eşitlenir.',
                        'Your cards, study history, decks, learning settings and Kronometre are kept in your account and sync between your devices on their own. Display, gesture and notification settings stay separate on each device. Catalog content is never sent; only your progress syncs.',
                    )
                    : l(
                        'Açarsanız aynı hesapla giriş yaptığınız iPhone ve tarayıcı aynı kartları, ilerlemeyi ve Kronometre’yi gösterir. Kapalıyken kartlarınız yalnızca bu cihazda kalır.',
                        'Turned on, the iPhone and browsers signed in to this account show the same cards, progress and Kronometre. Turned off, your cards stay only on this device.',
                    )}
            >
                {sync.status.enabled ? (
                    <>
                        <ListRow
                            title={l('Durum', 'Status')}
                            value={syncStatusLine(sync.status, now, l)}
                            chevron={false}
                            accessory={sync.status.phase === 'syncing' ? <ActivityIndicator size="small" color={colors.textSecondary} /> : undefined}
                        />
                        <ListRow title={l('Şimdi eşitle', 'Sync now')} onPress={() => { void sync.syncNow(); }} chevron={false} disabled={sync.status.phase === 'syncing'} />
                        <ListRow title={l('Cihazlarım', 'My devices')} onPress={() => setDevicesOpen((open) => !open)} expanded={devicesOpen} />
                        {devicesOpen ? (devices ?? []).map((device) => (
                            <ListRow
                                key={device.dev}
                                title={device.current ? l(`${device.name} (bu cihaz)`, `${device.name} (this device)`) : device.name}
                                summary={l(`Son görülme: ${syncedAgo(Date.parse(device.lastSeenAt), now, l)}`, `Last seen: ${syncedAgo(Date.parse(device.lastSeenAt), now, l)}`)}
                                onPress={device.current ? undefined : () => removeDevice(device)}
                                chevron={false}
                            />
                        )) : null}
                        <ListRow title={l('Eşitlemeyi kapat', 'Turn off sync')} onPress={turnOff} chevron={false} destructive />
                    </>
                ) : (
                    <ListRow
                        title={l('Eşitlemeyi aç', 'Turn on sync')}
                        onPress={busy ? undefined : turnOn}
                        disabled={busy}
                        accessory={busy ? <ActivityIndicator size="small" color={colors.textSecondary} /> : undefined}
                    />
                )}
            </Section>
        </View>
    );
}

const styles = StyleSheet.create({
    stack: { gap: Spacing.md },
});
