import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, type TextInput as NativeTextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
    CODE_RESEND_SECONDS,
    hasIssues,
    validateCode,
    validateEmailOnly,
    validatePasswordReset,
    validateRegistration,
    validateSignIn,
    type AccountFieldIssues,
    type AccountFieldName,
} from '../../lib/accountContract';
import { AccountRequestError, isAccountRequestError } from '../../lib/accountApi';
import { accountErrorMessage } from '../../lib/accountMessages';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';

/*
 * The sign-in screen's state machine, apart from its layout. Every step stays on one screen as
 * local state (no navigation per step), so the keyboard, the typed address and the back gesture
 * behave as one task.
 */

export type SignInMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export interface SignInValues {
    name: string;
    email: string;
    password: string;
    code: string;
    consent: boolean;
}

export interface SignInNotice {
    tone: 'error' | 'info' | 'warn';
    text: string;
}

const FIELD_ORDER: AccountFieldName[] = ['name', 'email', 'code', 'password', 'consent'];

/** Whole seconds left until `until`, ticking once a second while there are any. */
function useCountdown(until: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (until <= Date.now()) return undefined;
        setNow(Date.now());
        const timer = setInterval(() => {
            const current = Date.now();
            setNow(current);
            if (current >= until) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [until]);
    return Math.max(0, Math.ceil((until - now) / 1000));
}

function feedback(kind: 'success' | 'error'): void {
    if (Platform.OS !== 'ios') return;
    void Haptics.notificationAsync(
        kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => undefined);
}

export function useSignInFlow({
    initialMode,
    sendCodeOnOpen = false,
    onFinished,
}: {
    initialMode: SignInMode;
    /** Ask for a code as soon as the screen opens (verifying from the account page). */
    sendCodeOnOpen?: boolean;
    onFinished: () => void;
}) {
    const account = useAccount();
    const { l } = useI18n();
    const [mode, setMode] = useState<SignInMode>(initialMode);
    const [values, setValues] = useState<SignInValues>({
        name: '',
        email: account.user?.email ?? '',
        password: '',
        code: '',
        consent: false,
    });
    const [fields, setFields] = useState<AccountFieldIssues>({});
    const [notice, setNoticeState] = useState<SignInNotice | null>(null);
    const [busy, setBusy] = useState(false);
    const [resendUntil, setResendUntil] = useState(0);
    const resendIn = useCountdown(resendUntil);
    const busyRef = useRef(false);

    const nameRef = useRef<NativeTextInput | null>(null);
    const emailRef = useRef<NativeTextInput | null>(null);
    const passwordRef = useRef<NativeTextInput | null>(null);
    const codeRef = useRef<NativeTextInput | null>(null);

    const setNotice = useCallback((next: SignInNotice | null) => {
        setNoticeState(next);
        if (next) AccessibilityInfo.announceForAccessibility(next.text);
    }, []);

    const update = useCallback(<K extends keyof SignInValues>(key: K, value: SignInValues[K]) => {
        setValues((current) => ({ ...current, [key]: value }));
        setFields((current) => {
            if (!(key in current)) return current;
            const next = { ...current };
            delete next[key as AccountFieldName];
            return next;
        });
    }, []);

    const focusFirst = useCallback((issues: AccountFieldIssues) => {
        const first = FIELD_ORDER.find((field) => issues[field]);
        const target = first === 'name' ? nameRef
            : first === 'email' ? emailRef
                : first === 'password' ? passwordRef
                    : first === 'code' ? codeRef
                        : null;
        target?.current?.focus();
    }, []);

    const startCooldown = useCallback((seconds: number) => {
        setResendUntil(Date.now() + Math.max(1, seconds) * 1000);
    }, []);

    const switchMode = useCallback((next: SignInMode) => {
        if (busyRef.current) return;
        setMode(next);
        setFields({});
        setNotice(null);
        setValues((current) => ({ ...current, password: '', code: '' }));
    }, [setNotice]);

    const showError = useCallback((error: unknown) => {
        const failure = isAccountRequestError(error) ? error : new AccountRequestError('server_error');
        feedback('error');
        if (failure.code === 'unverified') {
            // The address has to be proven before this account may sign in; the server has sent a code.
            setValues((current) => ({ ...current, email: failure.email ?? current.email, password: '', code: '' }));
            setFields({});
            setMode('verify');
            startCooldown(CODE_RESEND_SECONDS);
            setNotice({ tone: 'info', text: accountErrorMessage('unverified', l) });
            return;
        }
        if (failure.code === 'rate_limited' && failure.retryAfter) startCooldown(failure.retryAfter);
        if (failure.code === 'code_expired') setValues((current) => ({ ...current, code: '' }));
        setFields(failure.fields);
        setNotice({ tone: 'error', text: accountErrorMessage(failure.code, l, failure.retryAfter) });
        focusFirst(failure.fields);
    }, [focusFirst, l, setNotice, startCooldown]);

    const run = useCallback(async (work: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            await work();
        } catch (error) {
            showError(error);
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [showError]);

    const finish = useCallback(() => {
        feedback('success');
        onFinished();
    }, [onFinished]);

    const validate = useCallback((current: SignInValues): AccountFieldIssues => {
        switch (mode) {
            case 'login': return validateSignIn(current);
            case 'register': return validateRegistration(current);
            case 'forgot': return validateEmailOnly(current);
            case 'reset': return validatePasswordReset(current);
            case 'verify': return validateCode(current);
            default: return {};
        }
    }, [mode]);

    const submit = useCallback((override?: Partial<SignInValues>) => {
        const current = { ...values, ...override };
        const issues = validate(current);
        if (hasIssues(issues)) {
            feedback('error');
            setFields(issues);
            setNotice(null);
            focusFirst(issues);
            return;
        }
        void run(async () => {
            setFields({});
            setNotice(null);
            switch (mode) {
                case 'login':
                    await account.signIn(current);
                    finish();
                    return;
                case 'register': {
                    const outcome = await account.register(current);
                    if (outcome.verification === 'none') {
                        finish();
                        return;
                    }
                    if (outcome.verification === 'required') update('email', outcome.email);
                    setValues((previous) => ({ ...previous, password: '', code: '' }));
                    setMode('verify');
                    startCooldown(CODE_RESEND_SECONDS);
                    feedback('success');
                    setNotice({
                        tone: 'info',
                        text: outcome.verification === 'sent'
                            ? l(
                                'Hesabınız hazır. E-postanızı doğrularsanız şifrenizi unuttuğunuzda hesabınızı kurtarabilirsiniz.',
                                'Your account is ready. Verifying your email lets you recover it if you forget your password.',
                            )
                            : l('Hesabınızı açmak için e-postanızı doğrulayın.', 'Verify your email to open your account.'),
                    });
                    return;
                }
                case 'forgot': {
                    const sent = await account.requestPasswordReset(current.email);
                    setValues((previous) => ({ ...previous, password: '', code: '' }));
                    setMode('reset');
                    startCooldown(sent.retryAfter || CODE_RESEND_SECONDS);
                    return;
                }
                case 'reset':
                    await account.confirmPasswordReset(current);
                    finish();
                    return;
                case 'verify':
                    await account.confirmVerification(current.code, current.email);
                    finish();
                    return;
                default:
                    return;
            }
        });
    }, [account, finish, focusFirst, l, mode, run, setNotice, startCooldown, update, validate, values]);

    const resend = useCallback(() => {
        if (resendIn > 0) return;
        void run(async () => {
            let sent;
            try {
                sent = mode === 'reset'
                    ? await account.requestPasswordReset(values.email)
                    : await account.requestVerification(values.email);
            } catch (error) {
                // Inside the one-minute window the code already sent is still the one to type:
                // say so, rather than calling it "too many attempts".
                if (isAccountRequestError(error) && error.code === 'rate_limited'
                    && error.retryAfter !== null && error.retryAfter <= CODE_RESEND_SECONDS) {
                    startCooldown(error.retryAfter);
                    setNotice({
                        tone: 'info',
                        text: l(
                            'Az önce bir kod gönderdik; e-postanızdaki son kod hâlâ geçerli. Yeni bir kod için biraz bekleyin.',
                            'We just sent a code; the latest one in your email still works. Wait a moment before asking for another.',
                        ),
                    });
                    codeRef.current?.focus();
                    return;
                }
                throw error;
            }
            startCooldown(sent.retryAfter || CODE_RESEND_SECONDS);
            setValues((current) => ({ ...current, code: '' }));
            setFields({});
            setNotice(sent.sent
                ? {
                    tone: 'info',
                    text: l(
                        'Yeni bir kod gönderdik. Gelen kutunuzu ve gereksiz klasörünüzü kontrol edin.',
                        'We sent a new code. Check your inbox and your junk folder.',
                    ),
                }
                : { tone: 'info', text: l('E-posta adresiniz zaten doğrulanmış.', 'Your email is already verified.') });
            codeRef.current?.focus();
        });
    }, [account, l, mode, resendIn, run, setNotice, startCooldown, values.email]);

    const sentOnOpen = useRef(false);
    useEffect(() => {
        if (!sendCodeOnOpen || sentOnOpen.current) return;
        sentOnOpen.current = true;
        resend();
    }, [resend, sendCodeOnOpen]);

    return {
        mode,
        values,
        fields,
        notice,
        busy,
        resendIn,
        refs: { nameRef, emailRef, passwordRef, codeRef },
        update,
        switchMode,
        submit,
        resend,
    };
}
