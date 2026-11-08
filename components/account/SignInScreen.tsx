import React, { useEffect, useMemo } from 'react';
import {
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { alert } from '../../lib/confirm';
import { accountFieldMessage } from '../../lib/accountMessages';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legalLinks';
import type { AccountFieldName } from '../../lib/accountContract';
import { AuthTextField, CodeField, PasswordField } from './AuthFields';
import { AuthButton, AuthNotice, BrandMark, ConsentRow, ModeSwitch, TextLink } from './AuthControls';
import { ChevronLeftGlyph, CloseGlyph, ShieldGlyph } from './AccountGlyphs';
import SignInBrandPanel from './SignInBrandPanel';
import { useAccountPalette, type AccountPalette } from './accountPalette';
import { useSignInFlow, type SignInMode } from './useSignInFlow';

interface SignInScreenProps {
    /** 'welcome' is the one-time first-run screen; 'modal' is opened from Settings. */
    variant: 'welcome' | 'modal';
    initialMode?: SignInMode;
    sendCodeOnOpen?: boolean;
    /** The header's way out: "continue without an account" or the close button. */
    onClose: () => void;
    /** Signed in, registered or verified. */
    onFinished: () => void;
}

/**
 * Sign in, create an account, recover a password and verify an address — one screen whose steps
 * are local state. Taken from the Yemek Takibi account page and reworked for iPhone: e-mailed
 * codes instead of links, Keychain-backed autofill, and a way past it that never needs a network.
 */
export default function SignInScreen({ variant, initialMode, sendCodeOnOpen, onClose, onFinished }: SignInScreenProps) {
    const { l } = useI18n();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const palette = useAccountPalette();
    const styles = useMemo(() => createStyles(palette), [palette]);
    const account = useAccount();
    const flow = useSignInFlow({
        initialMode: initialMode ?? (variant === 'welcome' ? 'register' : 'login'),
        sendCodeOnOpen,
        onFinished,
    });
    const { mode, values, fields, busy, refs } = flow;
    const wide = Platform.OS === 'web' && width >= 960;
    const signedIn = account.status === 'signedIn';
    const registrationClosed = mode === 'register' && account.config?.registrationOpen === false;
    const emailClosed = mode === 'forgot' && account.config?.emailReady === false;

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
    const titles: Record<SignInMode, string> = {
        login: l('Tekrar hoş geldiniz.', 'Welcome back.'),
        register: variant === 'welcome' ? l('TusAnkiM’e hoş geldiniz.', 'Welcome to TusAnkiM.') : l('Hesabınızı oluşturun.', 'Create your account.'),
        forgot: l('Şifrenizi mi unuttunuz?', 'Forgot your password?'),
        reset: l('Yeni şifrenizi belirleyin.', 'Set a new password.'),
        verify: l('E-postanızı doğrulayın.', 'Verify your email.'),
    };
    const subtitle = (() => {
        switch (mode) {
            case 'login':
                return l(
                    'Hesabınıza giriş yapın. Kartlarınız ve çalışma geçmişiniz bu cihazda kalmaya devam eder.',
                    'Sign in to your account. Your cards and study history stay on this device.',
                );
            case 'register':
                return variant === 'welcome'
                    ? l(
                        'Hesabınızı oluşturun ya da giriş yapın. İsterseniz hesapsız da başlayabilirsiniz.',
                        'Create your account or sign in. You can also start without one.',
                    )
                    : l(
                        'Bir dakikadan kısa sürer. Kartlarınız ve çalışma geçmişiniz yine bu cihazda saklanır.',
                        'It takes less than a minute. Your cards and study history are still kept on this device.',
                    );
            case 'forgot':
                return l(
                    'E-posta adresinizi yazın; şifrenizi yenilemeniz için size 6 haneli bir kod gönderelim.',
                    'Enter your email and we’ll send you a 6-digit code to reset your password.',
                );
            case 'reset':
                return (
                    <>
                        {l('Kodu ve yeni şifrenizi girin. Kodu şu adrese gönderdik: ', 'Enter the code and your new password. We sent the code to ')}
                        <Text style={styles.subtitleStrong}>{email}</Text>
                    </>
                );
            case 'verify':
                return (
                    <>
                        {l('6 haneli kodu şu adrese gönderdik: ', 'We sent a 6-digit code to ')}
                        <Text style={styles.subtitleStrong}>{email}</Text>
                    </>
                );
            default:
                return null;
        }
    })();
    const primaryLabel: Record<SignInMode, string> = {
        login: l('Giriş yap', 'Sign in'),
        register: l('Hesabımı oluştur', 'Create my account'),
        forgot: l('Kod gönder', 'Send code'),
        reset: l('Şifreyi yenile ve giriş yap', 'Reset password and sign in'),
        verify: l('Doğrula', 'Verify'),
    };
    const backTarget: SignInMode | null = mode === 'forgot' || mode === 'reset' || (mode === 'verify' && !signedIn)
        ? 'login'
        : null;

    const form = (
        <View style={styles.column}>
            <View style={styles.topBar}>
                {wide ? <View /> : (
                    <View style={styles.brand}>
                        <BrandMark size={34} />
                        <Text style={styles.brandName}>TusAnkiM</Text>
                    </View>
                )}
                {variant === 'welcome' && signedIn ? (
                    // A new account is already signed in at its code step; "Verify later" leaves.
                    <View />
                ) : variant === 'welcome' ? (
                    <TextLink
                        label={l('Hesapsız devam et', 'Continue without an account')}
                        onPress={onClose}
                        disabled={busy}
                        accessibilityHint={l(
                            'Uygulamayı hesap olmadan açar. Hesabınızı daha sonra Ayarlar’dan oluşturabilirsiniz.',
                            'Opens the app without an account. You can create one later in Settings.',
                        )}
                    />
                ) : (
                    <TouchableOpacity
                        style={styles.close}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                        <CloseGlyph color={palette.inkSecondary} />
                    </TouchableOpacity>
                )}
            </View>

            {backTarget ? (
                <View style={styles.backRow}>
                    <TextLink
                        label={l('Girişe dön', 'Back to sign in')}
                        onPress={() => flow.switchMode(backTarget)}
                        disabled={busy}
                        leading={<ChevronLeftGlyph color={palette.link} />}
                    />
                </View>
            ) : null}

            <View style={styles.heading}>
                <Text style={styles.title} accessibilityRole="header">{titles[mode]}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {mode === 'login' || mode === 'register' ? (
                <ModeSwitch
                    value={mode}
                    onChange={flow.switchMode}
                    disabled={busy}
                    options={[
                        { value: 'register', label: l('Hesap oluştur', 'Create account') },
                        { value: 'login', label: l('Giriş yap', 'Sign in') },
                    ]}
                />
            ) : null}

            {flow.notice ? <AuthNotice tone={flow.notice.tone} text={flow.notice.text} /> : null}
            {registrationClosed ? (
                <AuthNotice
                    tone="warn"
                    text={l(
                        'Yeni hesap oluşturma şu anda kapalı. Mevcut hesabınızla giriş yapabilirsiniz.',
                        'New accounts are closed right now. You can still sign in with an existing account.',
                    )}
                />
            ) : null}
            {emailClosed ? (
                <AuthNotice
                    tone="warn"
                    text={l(
                        'E-posta gönderimi henüz açılmadı; şifre yenileme şu anda yapılamıyor.',
                        'Email isn’t set up yet, so passwords can’t be reset right now.',
                    )}
                />
            ) : null}

            <View style={styles.form}>
                {mode === 'register' ? (
                    <AuthTextField
                        label={l('Ad soyad', 'Full name')}
                        value={values.name}
                        onChangeText={(text) => flow.update('name', text)}
                        error={fieldError('name')}
                        inputRef={refs.nameRef}
                        placeholder={l('Adınız ve soyadınız', 'Your first and last name')}
                        autoCapitalize="words"
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => refs.emailRef.current?.focus()}
                        editable={!busy}
                        maxLength={120}
                    />
                ) : null}
                {mode === 'login' || mode === 'register' || mode === 'forgot' ? (
                    <AuthTextField
                        label={l('E-posta', 'Email')}
                        value={values.email}
                        onChangeText={(text) => flow.update('email', text)}
                        error={fieldError('email')}
                        inputRef={refs.emailRef}
                        placeholder="ornek@eposta.com"
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
                    <CodeField
                        label={l('Doğrulama kodu', 'Verification code')}
                        value={values.code}
                        onChangeText={(text) => flow.update('code', text)}
                        error={fieldError('code')}
                        inputRef={refs.codeRef}
                        autoFocus
                        editable={!busy}
                        onComplete={(code) => {
                            if (mode === 'verify') flow.submit({ code });
                            else refs.passwordRef.current?.focus();
                        }}
                    />
                ) : null}
                {mode === 'login' || mode === 'register' || mode === 'reset' ? (
                    <PasswordField
                        label={mode === 'reset' ? l('Yeni şifre', 'New password') : l('Şifre', 'Password')}
                        value={values.password}
                        onChangeText={(text) => flow.update('password', text)}
                        error={fieldError('password')}
                        isNew={mode !== 'login'}
                        strengthContext={{ email: values.email, name: values.name }}
                        placeholder={mode === 'login' ? l('Şifreniz', 'Your password') : l('Bir şifre belirleyin', 'Choose a password')}
                        inputRef={refs.passwordRef}
                        returnKeyType={mode === 'register' ? 'done' : 'go'}
                        onSubmitEditing={mode === 'register' ? undefined : () => flow.submit()}
                        editable={!busy}
                    />
                ) : null}
                {mode === 'login' ? (
                    <View style={styles.forgotRow}>
                        <TextLink
                            label={l('Şifremi unuttum', 'Forgot password?')}
                            onPress={() => flow.switchMode('forgot')}
                            disabled={busy}
                        />
                    </View>
                ) : null}
                {mode === 'register' ? (
                    <ConsentRow
                        checked={values.consent}
                        onToggle={() => flow.update('consent', !values.consent)}
                        error={fieldError('consent')}
                        onOpenTerms={() => openPage(TERMS_URL)}
                        onOpenPrivacy={() => openPage(PRIVACY_URL)}
                    />
                ) : null}
            </View>

            <AuthButton
                label={primaryLabel[mode]}
                onPress={() => flow.submit()}
                busy={busy}
                disabled={registrationClosed || emailClosed}
                arrow
            />

            {mode === 'reset' || mode === 'verify' ? (
                <View style={styles.secondaryActions}>
                    <TextLink
                        label={flow.resendIn > 0
                            ? l(`Kodu yeniden gönder (${flow.resendIn} sn)`, `Resend code (${flow.resendIn} s)`)
                            : l('Kodu yeniden gönder', 'Resend code')}
                        onPress={flow.resend}
                        disabled={busy || flow.resendIn > 0}
                    />
                    {mode === 'reset' ? (
                        <TextLink
                            label={l('Farklı bir e-posta kullan', 'Use a different email')}
                            onPress={() => flow.switchMode('forgot')}
                            disabled={busy}
                            tone="muted"
                        />
                    ) : null}
                    {mode === 'verify' && signedIn ? (
                        <TextLink
                            label={l('Daha sonra doğrula', 'Verify later')}
                            onPress={onFinished}
                            disabled={busy}
                            tone="muted"
                        />
                    ) : null}
                </View>
            ) : null}

            <View style={styles.spacer} />

            {mode === 'login' || mode === 'register' ? (
                <View style={styles.trust}>
                    <View style={styles.trustIcon}>
                        <ShieldGlyph color={palette.inkSecondary} />
                    </View>
                    <Text style={styles.trustText}>
                        {l('Kartlarınız ve çalışma geçmişiniz yalnızca bu cihazda saklanır.', 'Your cards and study history are kept only on this device.')}
                    </Text>
                </View>
            ) : null}
            <View style={styles.footer}>
                <TextLink label={l('Gizlilik politikası', 'Privacy policy')} onPress={() => openPage(PRIVACY_URL)} tone="muted" />
                <Text style={styles.footerDot} accessible={false}>·</Text>
                <TextLink label={l('Kullanım koşulları', 'Terms of use')} onPress={() => openPage(TERMS_URL)} tone="muted" />
            </View>
        </View>
    );

    return (
        <View style={[styles.root, wide && styles.rootWide]}>
            {wide ? <SignInBrandPanel /> : null}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) + 8 },
                    wide && styles.scrollContentWide,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets
                showsVerticalScrollIndicator={false}
            >
                {form}
            </ScrollView>
        </View>
    );
}

function createStyles(palette: AccountPalette) {
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: palette.page },
        rootWide: { flexDirection: 'row' },
        scroll: { flex: 1 },
        scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
        scrollContentWide: { justifyContent: 'center', paddingHorizontal: 48 },
        column: { flexGrow: 1, width: '100%', maxWidth: 440, alignSelf: 'center', gap: 20 },
        topBar: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
        },
        brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
        brandName: { fontSize: 18, fontWeight: '700', color: palette.ink, letterSpacing: -0.2 },
        close: {
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.track,
        },
        backRow: { alignItems: 'flex-start', marginBottom: -12, marginLeft: -4 },
        heading: { gap: 8, marginTop: 8 },
        title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6, color: palette.ink },
        subtitle: { fontSize: 15, lineHeight: 22, color: palette.inkSecondary },
        subtitleStrong: { fontWeight: '600', color: palette.ink },
        form: { gap: 16 },
        forgotRow: { alignItems: 'flex-end', marginTop: -10, marginBottom: -8 },
        secondaryActions: { alignItems: 'center', gap: 0, marginTop: -8 },
        spacer: { flexGrow: 1, minHeight: 4 },
        trust: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            alignSelf: 'center',
            maxWidth: 340,
            gap: 8,
        },
        trustIcon: { paddingTop: 1 },
        trustText: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: palette.inkSecondary },
        footer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: -8,
            paddingTop: 4,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.divider,
        },
        footerDot: { fontSize: 15, color: palette.inkSecondary },
    });
}
