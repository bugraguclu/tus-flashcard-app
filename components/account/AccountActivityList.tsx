import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import type { AccountEvent, AccountEventType } from '../../lib/accountContract';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { ClockGlyph } from './AccountGlyphs';
import { useAccountPalette } from './accountPalette';

/** The account's latest sign-ins and changes, so a learner can spot one that was not theirs. */
export default function AccountActivityList() {
    const { l, localeTag } = useI18n();
    const palette = useAccountPalette();
    const { loadActivity } = useAccount();
    const [events, setEvents] = useState<AccountEvent[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        loadActivity()
            .then((loaded) => {
                if (active) setEvents(loaded.slice(0, 6));
            })
            .catch(() => {
                if (active) setFailed(true);
            });
        return () => {
            active = false;
        };
    }, [loadActivity]);

    const styles = useMemo(() => StyleSheet.create({
        list: { gap: 0 },
        row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
        divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider },
        label: { flex: 1, fontSize: 15, color: palette.ink },
        time: { fontSize: 13, color: palette.inkSecondary, textAlign: 'right' },
        message: { fontSize: 14, lineHeight: 20, color: palette.inkSecondary, paddingVertical: 8 },
    }), [palette]);

    const labels: Record<AccountEventType, string> = {
        account_created: l('Hesap oluşturuldu', 'Account created'),
        signed_in: l('Giriş yapıldı', 'Signed in'),
        signed_out: l('Oturum kapatıldı', 'Signed out'),
        email_verified: l('E-posta doğrulandı', 'Email verified'),
        password_reset: l('Şifre kodla yenilendi', 'Password reset with a code'),
        password_changed: l('Şifre değiştirildi', 'Password changed'),
        name_changed: l('Ad güncellendi', 'Name updated'),
    };
    const formatter = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    if (failed) {
        return <Text style={styles.message}>{l('Etkinlik şu anda yüklenemiyor.', 'Activity can’t be loaded right now.')}</Text>;
    }
    if (!events) return <ActivityIndicator color={palette.link} style={{ paddingVertical: 12 }} />;
    if (events.length === 0) {
        return <Text style={styles.message}>{l('Henüz bir etkinlik yok.', 'No activity yet.')}</Text>;
    }
    return (
        <View style={styles.list}>
            {events.map((event, index) => {
                const date = new Date(event.createdAt);
                const time = Number.isNaN(date.getTime()) ? '' : formatter.format(date);
                return (
                    <View
                        key={`${event.type}-${event.createdAt}-${index}`}
                        style={[styles.row, index > 0 && styles.divider]}
                        accessible
                        accessibilityLabel={`${labels[event.type]}, ${time}`}
                    >
                        <ClockGlyph color={palette.inkSecondary} />
                        <Text style={styles.label}>{labels[event.type]}</Text>
                        <Text style={styles.time}>{time}</Text>
                    </View>
                );
            })}
        </View>
    );
}
