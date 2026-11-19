import React, { useEffect } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { alert } from '../../lib/confirm';
import { accountFieldMessage } from '../../lib/accountMessages';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legalLinks';
import { CODE_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, normalizeCode, type AccountFieldName } from '../../lib/accountContract';
import { Button, CloseButton, IconButton } from '../ui/Button';
import { PasswordField, TextField } from '../ui/Fields';
import { Notice } from '../ui/Feedback';
import { BackIcon } from '../ui/icons';
import { Divider } from '../ui/Card';
import { Type } from '../ui/tokens';
import GoogleGlyph from '../GoogleGlyph';
import { googleSignInAvailable } from '../../lib/googleSignIn';
import { useSignInFlow, type SignInMode } from './useSignInFlow';

interface SignInScreenProps {
    /** 'welcome' is the one-time first-run screen; 'modal' is opened from Settings. */
    variant: 'welcome' | 'modal';
    initialMode?: SignInMode;
    sendCodeOnOpen?: boolean;
    /** "Continue without an account" on the welcome screen, the close button otherwise. */
    onClose: () => void;
    /** Signed in, registered or verified. */
    onFinished: () => void;
}

/**
 * Sign in, create an account, recover a password and verify an address: one plain form whose steps
 * are local state. Kept to what a sign-in needs (sources in docs/HESAP_GIRIS.md): e-mail and
 * password on one page, a password asked once with a show button, one code field iOS can fill
 * from Mail, specific button labels, and on first run a full-width way past it that needs no
 * network. When the build and the server both allow it, "Continue with Google" comes first: one
 * tap, no password, and it signs in or creates the account alike.
 */
export default function SignInScreen({ variant, initialMode, sendCodeOnOpen, onClose, onFinished }: SignInScreenProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const account = useAccount();
    const flow = useSignInFlow({
        initialMode: initialMode ?? (variant === 'welcome' ? 'register' : 'login'),
        sendCodeOnOpen,
        onFinished,
    });
    const { mode, values, fields, busy, refs } = flow;
    const signedIn = account.status === 'signedIn';
    const registrationClosed = mode === 'register' && account.config?.registrationOpen === false;
    const emailClosed = mode === 'forgot' && account.config?.emailReady === false;
    const welcome = variant === 'welcome';
    const google = (mode === 'login' || mode === 'register')
        && account.config?.googleSignIn === true
        && googleSignInAvailable();

    // What the server offers can change while the app is open; ask again for this screen.
    const { refresh } = account;
    useEffect(() => {
        void refresh();
    }, [refresh]);

    const fieldError = (field: AccountFieldName) => {
        const issue = fields[field];
        return issue ? accountFieldMessage(field, issue, l) : null;
    };

    const openPage = (url: string) => {
        Linking.openURL(url).catch(() => {
            alert(
                l('Sayfa açılamadı', 'Could Not Open Page'),
                l(`Bağlantı açılamadı. Tarayıcıda şu adresi açın: ${url}`, `The link could not be opened. Open this address in a browser: ${url}`),
            );
        });
    };

    const email = values.email.trim();
    const title: Record<SignInMode, string> = {
        login: l('Giriş yapın', 'Sign in'),
        register: welcome ? l('TusAnkiM’e hoş geldiniz', 'Welcome to TusAnkiM') : l('Hesap oluşturun', 'Create an account'),
        forgot: l('Şifrenizi yenileyin', 'Reset your password'),
        reset: l('Yeni şifre belirleyin', 'Choose a new password'),
        verify: l('E-postanızı doğrulayın', 'Verify your email'),
    };
    const subtitle: Record<SignInMode, string> = {
        login: l('Kartlarınız ve çalışma geçmişiniz bu cihazda kalır.', 'Your cards and study history stay on this device.'),
        register: welcome
            ? l(
                'Hesap isteğe bağlıdır. Kartlarınız ve çalışma geçmişiniz her durumda bu cihazda kalır.',
                'An account is optional. Your cards and study history stay on this device either way.',
            )
            : l('Kartlarınız ve çalışma geçmişiniz yine bu cihazda kalır.', 'Your cards and study history still stay on this device.'),
        forgot: l('E-postanıza 6 haneli bir kod gönderelim.', 'We’ll email you a 6-digit code.'),
        reset: l(`${email} adresine gönderdiğimiz kodu ve yeni şifrenizi girin.`, `Enter the code we sent to ${email} and your new password.`),
        verify: l(`${email} adresine 6 haneli bir kod gönderdik.`, `We sent a 6-digit code to ${email}.`),
    };
    const primaryLabel: Record<SignInMode, string> = {
        login: l('Giriş yap', 'Sign in'),
        register: l('Hesap oluştur', 'Create account'),
        forgot: l('Kod gönder', 'Send code'),
        reset: l('Şifreyi yenile', 'Reset password'),
        verify: l('Doğrula', 'Verify'),
    };
    const backTarget: SignInMode | null = mode === 'forgot' || mode === 'reset' || (mode === 'verify' && !signedIn)
        ? 'login'
        : null;
    const showPassword = l('Şifreyi göster', 'Show password');
    const hidePassword = l('Şifreyi gizle', 'Hide password');

    const linkStyle = [styles.link, { color: colors.accent }];
    const terms = (
        <Text style={linkStyle} onPress={() => openPage(TERMS_URL)} accessibilityRole="link">
            {l('kullanım koşullarını', 'Terms of Use')}
        </Text>
    );
    const privacy = (
        <Text style={linkStyle} onPress={() => openPage(PRIVACY_URL)} accessibilityRole="link">
            {l('gizlilik politikasını', 'Privacy Policy')}
        </Text>
    );

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.bgCard }}
            contentContainerStyle={[
                styles.content,
                { paddingTop: insets.top + Spacing.sm, paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.column}>
                <View style={styles.topBar}>
                    {backTarget ? (
                        <IconButton
                            accessibilityLabel={l('Girişe dön', 'Back to sign in')}
                            onPress={() => flow.switchMode(backTarget)}
                            disabled={busy}
                        >
                            <BackIcon color={colors.textPrimary} />
                        </IconButton>
                    ) : <View />}
                    {!welcome ? <CloseButton accessibilityLabel={l('Kapat', 'Close')} onPress={onClose} /> : null}
                </View>

                <View style={styles.heading}>
                    <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{title[mode]}</Text>
                    <Text style={[Type.body, styles.subtitle, { color: colors.textSecondary }]}>{subtitle[mode]}</Text>
                </View>

                {flow.notice ? (
                    <Notice tone={flow.notice.tone === 'error' ? 'danger' : flow.notice.tone === 'warn' ? 'warning' : 'info'}>
                        {flow.notice.text}
                    </Notice>
                ) : null}
                {registrationClosed ? (
                    <Notice tone="warning">
                        {l(
                            'Yeni hesap oluşturma şu anda kapalı. Mevcut hesabınızla giriş yapabilirsiniz.',
                            'New accounts are closed right now. You can still sign in with an existing account.',
                        )}
                    </Notice>
                ) : null}
                {emailClosed ? (
                    <Notice tone="warning">
                        {l(
                            'E-posta gönderimi henüz açılmadı; şifre yenileme şu anda yapılamıyor.',
                            'Email isn’t set up yet, so passwords can’t be reset right now.',
                        )}
                    </Notice>
                ) : null}

                {google ? (
                    <>
                        <Button
                            variant="secondary"
                            icon={<GoogleGlyph />}
                            label={l('Google ile devam et', 'Continue with Google')}
                            onPress={flow.continueWithGoogle}
                            disabled={busy}
                        />
                        <View style={styles.or} accessible={false}>
                            <Divider style={styles.orLine} />
                            <Text style={[Type.caption, { color: colors.textSecondary }]}>{l('veya e-postayla', 'or with email')}</Text>
                            <Divider style={styles.orLine} />
                        </View>
                    </>
                ) : null}

                <View style={styles.form}>
                    {mode === 'login' || mode === 'register' || mode === 'forgot' ? (
                        <TextField
                            ref={refs.emailRef}
                            label={l('E-posta', 'Email')}
                            value={values.email}
                            onChangeText={(text) => flow.update('email', text)}
                            error={fieldError('email')}
                            keyboardType="email-address"
                            inputMode="email"
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            autoComplete="email"
                            textContentType="username"
                            returnKeyType={mode === 'forgot' ? 'send' : 'next'}
                            submitBehavior={mode === 'forgot' ? 'blurAndSubmit' : 'submit'}
                            onSubmitEditing={() => (mode === 'forgot' ? flow.submit() : refs.passwordRef.current?.focus())}
                            editable={!busy}
                            maxLength={254}
                        />
                    ) : null}
                    {mode === 'reset' || mode === 'verify' ? (
                        <TextField
                            ref={refs.codeRef}
                            label={l('6 haneli kod', '6-digit code')}
                            value={values.code}
                            onChangeText={(text) => {
                                const code = normalizeCode(text);
                                flow.update('code', code);
                                if (code.length === CODE_LENGTH && code !== values.code) {
                                    if (mode === 'verify') flow.submit({ code });
                                    else refs.passwordRef.current?.focus();
                                }
                            }}
                            error={fieldError('code')}
                            monospace
                            keyboardType="number-pad"
                            inputMode="numeric"
                            textContentType="oneTimeCode"
                            autoComplete="one-time-code"
                            autoCorrect={false}
                            autoFocus
                            editable={!busy}
                        />
                    ) : null}
                    {mode === 'login' || mode === 'register' || mode === 'reset' ? (
                        <PasswordField
                            ref={refs.passwordRef}
                            label={mode === 'reset' ? l('Yeni şifre', 'New password') : l('Şifre', 'Password')}
                            value={values.password}
                            onChangeText={(text) => flow.update('password', text)}
                            error={fieldError('password')}
                            hint={mode === 'login' ? null : l(`En az ${PASSWORD_MIN_LENGTH} karakter`, `At least ${PASSWORD_MIN_LENGTH} characters`)}
                            isNew={mode !== 'login'}
                            passwordRules={mode === 'login' ? undefined : `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH};`}
                            showLabel={showPassword}
                            hideLabel={hidePassword}
                            returnKeyType="go"
                            submitBehavior="blurAndSubmit"
                            onSubmitEditing={() => flow.submit()}
                            editable={!busy}
                        />
                    ) : null}
                    {mode === 'login' ? (
                        <Button
                            variant="plain"
                            size="compact"
                            label={l('Şifremi unuttum', 'Forgot password?')}
                            onPress={() => flow.switchMode('forgot')}
                            disabled={busy}
                            style={styles.forgot}
                        />
                    ) : null}
                </View>

                <Button
                    label={primaryLabel[mode]}
                    onPress={() => flow.submit()}
                    busy={busy}
                    disabled={registrationClosed || emailClosed}
                />

                {mode === 'register' || google ? (
                    // Going on under this sentence is the agreement (Google can create an account
                    // from the sign-in step too); there is no checkbox.
                    <Text style={[Type.caption, styles.centred, { color: colors.textSecondary }]}>
                        {locale === 'tr' ? (
                            <>
                                {'Devam ederek '}{terms}{' ve '}{privacy}{' kabul etmiş olursunuz.'}
                            </>
                        ) : (
                            <>
                                {'By continuing you accept the '}{terms}{' and the '}{privacy}{'.'}
                            </>
                        )}
                    </Text>
                ) : null}

                {mode === 'login' || mode === 'register' ? (
                    <Button
                        variant="plain"
                        label={mode === 'login'
                            ? l('Hesabınız yok mu? Hesap oluşturun', 'No account? Create one')
                            : l('Hesabınız var mı? Giriş yapın', 'Have an account? Sign in')}
                        onPress={() => flow.switchMode(mode === 'login' ? 'register' : 'login')}
                        disabled={busy}
                    />
                ) : null}

                {mode === 'reset' || mode === 'verify' ? (
                    <View>
                        <Button
                            variant="plain"
                            label={flow.resendIn > 0
                                ? l(`Kodu yeniden gönder (${flow.resendIn} sn)`, `Resend code (${flow.resendIn} s)`)
                                : l('Kodu yeniden gönder', 'Resend code')}
                            onPress={flow.resend}
                            disabled={busy || flow.resendIn > 0}
                        />
                        {mode === 'reset' ? (
                            <Button
                                variant="plain"
                                tone="muted"
                                label={l('Farklı bir e-posta kullan', 'Use a different email')}
                                onPress={() => flow.switchMode('forgot')}
                                disabled={busy}
                            />
                        ) : null}
                        {mode === 'verify' && signedIn ? (
                            <Button
                                variant="plain"
                                tone="muted"
                                label={l('Daha sonra doğrula', 'Verify later')}
                                onPress={onFinished}
                                disabled={busy}
                            />
                        ) : null}
                    </View>
                ) : null}

                {welcome && !signedIn ? (
                    <View style={styles.skip}>
                        <Button
                            variant="secondary"
                            label={l('Hesapsız devam et', 'Continue without an account')}
                            onPress={onClose}
                            disabled={busy}
                        />
                        <Text style={[Type.caption, styles.centred, { color: colors.textSecondary }]}>
                            {l('Hesabı daha sonra Ayarlar’dan açabilirsiniz.', 'You can create one later in Settings.')}
                        </Text>
                    </View>
                ) : null}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { flexGrow: 1, paddingHorizontal: Spacing.xxl },
    column: { flexGrow: 1, width: '100%', maxWidth: 420, alignSelf: 'center', gap: Spacing.lg },
    topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heading: { gap: Spacing.sm, marginBottom: Spacing.sm },
    title: { fontSize: FontSize.xxxl, lineHeight: 34, fontWeight: '700' },
    subtitle: { fontSize: FontSize.lg, lineHeight: 22 },
    form: { gap: Spacing.lg },
    forgot: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
    centred: { textAlign: 'center' },
    or: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    // A divider stretches across its parent by default; here it is a short rule beside the word.
    orLine: { flex: 1, alignSelf: 'center' },
    link: { fontWeight: '600' },
    // The way past an account sits at the bottom, apart from the form, so it is never mistaken
    // for one of its steps.
    skip: { marginTop: 'auto', paddingTop: Spacing.xxl, gap: Spacing.sm },
});
