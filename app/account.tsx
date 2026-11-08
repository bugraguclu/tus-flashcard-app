import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '../components/AppText';
import ScreenHeader from '../components/ScreenHeader';
import { BorderRadius, Shadows, Spacing, useThemeColors } from '../constants/theme';
import { useAccount } from '../contexts/AccountContext';
import { useI18n } from '../hooks/useI18n';
import { confirm } from '../lib/confirm';
import { accountInitials } from '../lib/accountSession';
import { AuthButton, AuthNotice, TextLink } from '../components/account/AuthControls';
import { ChangePasswordPanel, DeleteAccountPanel, EditNamePanel } from '../components/account/AccountPanels';
import AccountActivityList from '../components/account/AccountActivityList';
import {
    CheckGlyph,
    ChevronRightGlyph,
    KeyGlyph,
    PersonGlyph,
    SignOutGlyph,
    TrashGlyph,
} from '../components/account/AccountGlyphs';
import { useAccountPalette } from '../components/account/accountPalette';

type OpenPanel = 'name' | 'password' | 'delete' | null;

/** The signed-in learner's account: who they are, their password, signing out, deleting it. */
export default function AccountScreen() {
    const router = useRouter();
    const { l } = useI18n();
    const colors = useThemeColors();
    const palette = useAccountPalette();
    const account = useAccount();
    const [panel, setPanel] = useState<OpenPanel>(null);
    const [message, setMessage] = useState<string | null>(null);
    // The activity list reloads whenever the page comes back into view (after verifying the
    // address, for instance) and after each change made here.
    const [activityVersion, setActivityVersion] = useState(0);
    useFocusEffect(React.useCallback(() => {
        setActivityVersion((version) => version + 1);
    }, []));
    const user = account.user;

    const styles = useMemo(() => StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 48, gap: Spacing.lg },
        card: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: Spacing.lg,
            ...Shadows.sm,
        },
        profile: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: 6 },
        avatar: {
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
        },
        avatarText: { fontSize: 26, fontWeight: '700', color: palette.link },
        name: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
        email: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: BorderRadius.full,
        },
        badgeText: { fontSize: 13, fontWeight: '600' },
        sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: -Spacing.sm, marginLeft: Spacing.xs },
        row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 },
        rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        rowLabel: { flex: 1, fontSize: 16, color: colors.textPrimary },
        rowValue: { fontSize: 15, color: colors.textSecondary, maxWidth: '55%' },
        danger: { color: colors.btnAgain },
        footnote: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingHorizontal: Spacing.xs },
        empty: { alignItems: 'center', gap: Spacing.lg, paddingVertical: 48, paddingHorizontal: Spacing.lg },
        emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
        emptyText: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
        emptyButton: { alignSelf: 'stretch' },
    }), [colors, palette.link]);

    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings' as never));
    const toggle = (next: Exclude<OpenPanel, null>) => {
        setMessage(null);
        setPanel((current) => (current === next ? null : next));
    };

    const signOut = () => confirm(
        l('Oturum kapatılsın mı?', 'Sign out?'),
        l(
            'Kartlarınız ve çalışma geçmişiniz bu cihazda kalır. İstediğiniz zaman yeniden giriş yapabilirsiniz.',
            'Your cards and study history stay on this device. You can sign in again at any time.',
        ),
        () => {
            void account.signOut();
            goBack();
        },
        { confirmLabel: l('Oturumu kapat', 'Sign out') },
    );

    if (!user || account.status !== 'signedIn') {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <ScreenHeader title={l('Hesap', 'Account')} onBack={goBack} backAccessibilityLabel={l('Ayarlara dön', 'Back to settings')} />
                <View style={styles.empty}>
                    <PersonGlyph color={palette.link} size={44} />
                    <Text style={styles.emptyTitle}>{l('Oturum açık değil', 'You’re not signed in')}</Text>
                    <Text style={styles.emptyText}>
                        {l(
                            'Hesabınızla giriş yapın ya da yeni bir hesap oluşturun. Kartlarınız ve çalışma geçmişiniz bu cihazda kalır.',
                            'Sign in or create an account. Your cards and study history stay on this device.',
                        )}
                    </Text>
                    {account.status !== 'disabled' ? (
                        <View style={styles.emptyButton}>
                            <AuthButton label={l('Giriş yap', 'Sign in')} onPress={() => router.replace('/sign-in' as never)} arrow />
                        </View>
                    ) : null}
                </View>
            </SafeAreaView>
        );
    }

    const verifiedColor = user.emailVerified ? colors.btnGood : palette.warn;
    const verifiedBackground = user.emailVerified ? colors.btnGoodBg : palette.warnSoft;

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader title={l('Hesap', 'Account')} onBack={goBack} backAccessibilityLabel={l('Ayarlara dön', 'Back to settings')} />
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets
            >
                <View style={[styles.card, styles.profile]}>
                    <View style={styles.avatar} accessible={false}>
                        <Text style={styles.avatarText} allowFontScaling={false}>{accountInitials(user)}</Text>
                    </View>
                    <Text style={styles.name} accessibilityRole="header">{user.name}</Text>
                    <Text style={styles.email} selectable>{user.email}</Text>
                    <View style={[styles.badge, { backgroundColor: verifiedBackground }]}>
                        {user.emailVerified ? <CheckGlyph color={verifiedColor} size={14} /> : null}
                        <Text style={[styles.badgeText, { color: verifiedColor }]}>
                            {user.emailVerified ? l('E-posta doğrulandı', 'Email verified') : l('E-posta doğrulanmadı', 'Email not verified')}
                        </Text>
                    </View>
                    {!user.emailVerified ? (
                        <TextLink
                            label={l('Şimdi doğrula', 'Verify now')}
                            onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'verify' } } as never)}
                            accessibilityHint={l('E-postanıza 6 haneli bir kod gönderir.', 'Sends a 6-digit code to your email.')}
                        />
                    ) : null}
                </View>

                {message ? <AuthNotice tone="info" text={message} /> : null}

                <Text style={styles.sectionTitle} accessibilityRole="header">{l('Hesap bilgileri', 'Account details')}</Text>
                <View style={styles.card}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => toggle('name')}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Ad soyad: ${user.name}. Düzenle`, `Full name: ${user.name}. Edit`)}
                        accessibilityState={{ expanded: panel === 'name' }}
                    >
                        <PersonGlyph color={palette.link} size={20} />
                        <Text style={styles.rowLabel}>{l('Ad soyad', 'Full name')}</Text>
                        <Text style={styles.rowValue} numberOfLines={1}>{user.name}</Text>
                        <ChevronRightGlyph color={colors.textMuted} />
                    </TouchableOpacity>
                    {panel === 'name' ? (
                        <EditNamePanel
                            user={user}
                            onDone={() => {
                                setPanel(null);
                                setActivityVersion((version) => version + 1);
                            }}
                        />
                    ) : null}
                    <TouchableOpacity
                        style={[styles.row, styles.rowDivider]}
                        onPress={() => toggle('password')}
                        accessibilityRole="button"
                        accessibilityLabel={l('Şifreyi değiştir', 'Change password')}
                        accessibilityState={{ expanded: panel === 'password' }}
                    >
                        <KeyGlyph color={palette.link} />
                        <Text style={styles.rowLabel}>{l('Şifreyi değiştir', 'Change password')}</Text>
                        <ChevronRightGlyph color={colors.textMuted} />
                    </TouchableOpacity>
                    {panel === 'password' ? (
                        <ChangePasswordPanel
                            user={user}
                            onDone={(changed) => {
                                setPanel(null);
                                if (changed) {
                                    setMessage(l('Şifreniz değiştirildi.', 'Your password was changed.'));
                                    setActivityVersion((version) => version + 1);
                                }
                            }}
                        />
                    ) : null}
                </View>

                <Text style={styles.sectionTitle} accessibilityRole="header">{l('Son etkinlik', 'Recent activity')}</Text>
                <View style={[styles.card, { paddingVertical: 4 }]}>
                    <AccountActivityList key={activityVersion} />
                </View>

                <View style={styles.card}>
                    <TouchableOpacity style={styles.row} onPress={signOut} accessibilityRole="button" accessibilityLabel={l('Oturumu kapat', 'Sign out')}>
                        <SignOutGlyph color={palette.link} />
                        <Text style={styles.rowLabel}>{l('Oturumu kapat', 'Sign out')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.row, styles.rowDivider]}
                        onPress={() => toggle('delete')}
                        accessibilityRole="button"
                        accessibilityLabel={l('Hesabı sil', 'Delete account')}
                        accessibilityState={{ expanded: panel === 'delete' }}
                    >
                        <TrashGlyph color={colors.btnAgain} />
                        <Text style={[styles.rowLabel, styles.danger]}>{l('Hesabı sil', 'Delete account')}</Text>
                    </TouchableOpacity>
                    {panel === 'delete' ? (
                        <DeleteAccountPanel onCancel={() => setPanel(null)} onDeleted={goBack} />
                    ) : null}
                </View>

                <Text style={styles.footnote}>
                    {l(
                        'Kartlarınız, desteleriniz ve çalışma geçmişiniz bu cihazda saklanır ve sunucuya gönderilmez. Oturumu kapatmak veya hesabı silmek onları etkilemez.',
                        'Your cards, decks and study history are kept on this device and never sent to the server. Signing out or deleting the account doesn’t affect them.',
                    )}
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}
