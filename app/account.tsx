import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text } from '../components/AppText';
import ScreenHeader from '../components/ScreenHeader';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import { useAccount } from '../contexts/AccountContext';
import { useI18n } from '../hooks/useI18n';
import { confirm } from '../lib/confirm';
import { Button } from '../components/ui/Button';
import { Card, Section } from '../components/ui/Card';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { ListRow } from '../components/ui/Rows';
import { Type } from '../components/ui/tokens';
import { ChangePasswordPanel, DeleteAccountPanel, EditNamePanel } from '../components/account/AccountPanels';
import AccountAvatar from '../components/account/AccountAvatar';
import AccountSyncSection from '../components/account/AccountSyncSection';
import { useSync } from '../contexts/SyncContext';

type OpenPanel = 'name' | 'password' | 'delete' | null;

/**
 * The signed-in learner's account, kept to what an account here is for: who it is, its name and
 * password, signing out and deleting it. Each change opens in place under its row.
 */
export default function AccountScreen() {
    const router = useRouter();
    const { l } = useI18n();
    const colors = useThemeColors();
    const account = useAccount();
    const sync = useSync();
    const [panel, setPanel] = useState<OpenPanel>(null);
    const [message, setMessage] = useState<string | null>(null);
    const user = account.user;

    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings' as never));
    const toggle = (next: Exclude<OpenPanel, null>) => {
        setMessage(null);
        setPanel((current) => (current === next ? null : next));
    };

    const signOut = () => confirm(
        l('Oturum kapatılsın mı?', 'Sign out?'),
        l('Kartlarınız bu cihazda kalır. İstediğiniz zaman yeniden giriş yapabilirsiniz.', 'Your cards stay on this device. You can sign in again at any time.'),
        () => {
            void account.signOut();
            goBack();
        },
        { confirmLabel: l('Oturumu kapat', 'Sign out') },
    );

    const header = (
        <ScreenHeader title={l('Hesap', 'Account')} onBack={goBack} backAccessibilityLabel={l('Ayarlara dön', 'Back to settings')} />
    );

    if (!user || account.status !== 'signedIn') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top', 'left', 'right']}>
                {header}
                <EmptyState
                    title={l('Oturum açık değil', 'You’re not signed in')}
                    body={l('Kartlarınız bu cihazda kalır.', 'Your cards stay on this device.')}
                    action={account.status !== 'disabled'
                        ? <Button label={l('Giriş yap', 'Sign in')} onPress={() => router.replace('/sign-in' as never)} style={styles.stretch} />
                        : undefined}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top', 'left', 'right']}>
            {header}
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets
            >
                <View style={styles.profile}>
                    <AccountAvatar user={user} size={72} />
                    <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">{user.name}</Text>
                    <Text style={[Type.body, { color: colors.textSecondary }]} selectable>
                        {[user.email, user.apple ? 'Apple' : null, user.google ? 'Google' : null].filter(Boolean).join(' · ')}
                    </Text>
                </View>

                {!user.emailVerified ? (
                    <Notice
                        tone="warning"
                        action={(
                            <Button
                                variant="plain"
                                size="compact"
                                label={l('Şimdi doğrula', 'Verify now')}
                                onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'verify' } } as never)}
                            />
                        )}
                    >
                        {l('E-postanız doğrulanmadı. Doğrularsanız şifrenizi unuttuğunuzda hesabınıza dönebilirsiniz.', 'Your email isn’t verified. Verifying it lets you get back in if you forget your password.')}
                    </Notice>
                ) : null}
                {message ? <Notice tone="success">{message}</Notice> : null}

                <AccountSyncSection />

                <Section footnote={sync.status.enabled
                    ? l('Hesabınız adınızı, e-postanızı ve eşitlenen çalışmanızı tutar. Oturumu kapatırsanız kartlarınız bu cihazda kalır.', 'Your account keeps your name, email and synced study. If you sign out, your cards stay on this device.')
                    : l('Kartlarınız ve çalışma geçmişiniz yalnızca bu cihazda saklanır; eşitlemeyi açmadıkça hesap onlara dokunmaz.', 'Your cards and study history are kept only on this device; the account never touches them unless you turn on sync.')}>
                    <ListRow title={l('Ad', 'Name')} value={user.name} onPress={() => toggle('name')} expanded={panel === 'name'} />
                    {panel === 'name' ? (
                        <View style={styles.panel}>
                            <EditNamePanel user={user} onDone={() => setPanel(null)} />
                        </View>
                    ) : null}
                    {user.hasPassword ? (
                        <ListRow title={l('Şifreyi değiştir', 'Change password')} onPress={() => toggle('password')} expanded={panel === 'password'} />
                    ) : null}
                    {user.hasPassword && panel === 'password' ? (
                        <View style={styles.panel}>
                            <ChangePasswordPanel
                                user={user}
                                onDone={(changed) => {
                                    setPanel(null);
                                    if (changed) setMessage(l('Şifreniz değiştirildi.', 'Your password was changed.'));
                                }}
                            />
                        </View>
                    ) : null}
                    <ListRow title={l('Oturumu kapat', 'Sign out')} onPress={signOut} chevron={false} />
                </Section>

                {panel === 'delete' ? (
                    <Card padded>
                        <DeleteAccountPanel user={user} onCancel={() => setPanel(null)} onDeleted={goBack} />
                    </Card>
                ) : (
                    <Button variant="plain" tone="danger" label={l('Hesabı sil', 'Delete account')} onPress={() => toggle('delete')} />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 48, gap: Spacing.xl },
    profile: { alignItems: 'center', gap: Spacing.xs, paddingTop: Spacing.lg },
    name: { fontSize: FontSize.xxl, fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm },
    panel: { padding: Spacing.lg },
    stretch: { alignSelf: 'stretch' },
});
