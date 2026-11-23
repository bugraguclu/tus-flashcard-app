import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
    ACCOUNT_POLICY_VERSION,
    normalizeCode,
    normalizeEmail,
    normalizeName,
    type AccountCodeSent,
    type AccountDeleteProof,
    type AccountEvent,
    type AccountLocale,
    type AccountServiceConfig,
    type AccountSessionGrant,
    type AccountUser,
    type AppleCredential,
} from '../lib/accountContract';
import { AccountRequestError, createAccountClient, isAccountRequestError } from '../lib/accountApi';
import { accountApiUrl } from '../lib/accountConfig';
import { shouldOfferFirstRunPrompt, type StoredAccountSession } from '../lib/accountSession';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../lib/accountVault';
import {
    collectionHasNotes,
    isAccountPromptResolved,
    isFirstLaunchSinceInstall,
    markAccountPromptResolved,
    markInstallSeen,
} from '../lib/accountLocalState';
import { useStartupStatus } from './AppContext';
import { useI18n } from '../hooks/useI18n';

/*
 * The learner's TusAnkiM account. Everything here is optional: with no server configured the
 * status is 'disabled' and nothing in the app changes, and with one configured but unreachable the
 * app keeps the last known state. Studying never waits on this provider.
 */

export type AccountStatus = 'disabled' | 'loading' | 'signedOut' | 'signedIn';

export type RegisterOutcome =
    | { verification: 'none' | 'sent' }
    | { verification: 'required'; email: string };

interface AccountContextValue {
    status: AccountStatus;
    /** The stored session has been read; startup may hand the splash over. */
    ready: boolean;
    user: AccountUser | null;
    /** The last configuration the server reported, or null before it has answered once. */
    config: AccountServiceConfig | null;
    /** The one-time welcome sign-in screen for a new installation. */
    firstRunPrompt: boolean;
    resolveFirstRunPrompt: () => void;
    refresh: () => Promise<void>;
    signIn: (input: { email: string; password: string }) => Promise<void>;
    register: (input: { name: string; email: string; password: string }) => Promise<RegisterOutcome>;
    requestVerification: (email?: string) => Promise<AccountCodeSent>;
    confirmVerification: (code: string, email?: string) => Promise<void>;
    requestPasswordReset: (email: string) => Promise<AccountCodeSent>;
    confirmPasswordReset: (input: { email: string; code: string; password: string }) => Promise<void>;
    changePassword: (input: { currentPassword: string; password: string }) => Promise<void>;
    updateName: (name: string) => Promise<void>;
    /** Signs in with an ID token from Google, making the account on first use. */
    signInWithGoogle: (idToken: string) => Promise<{ created: boolean }>;
    /** `name` is what Apple's sheet returned, empty after the first sign-in. */
    signInWithApple: (credential: AppleCredential) => Promise<{ created: boolean }>;
    /** Confirmed with the password, or with a fresh Google token for an account without one. */
    deleteAccount: (proof: AccountDeleteProof) => Promise<void>;
    signOut: () => Promise<void>;
    loadActivity: () => Promise<AccountEvent[]>;
    /** The account server's address, or null in a build without accounts. */
    baseUrl: string | null;
    /** The signed-in session's token for the sync endpoints (lib/sync/syncApi.ts), or null. */
    getToken: () => string | null;
}

const notConfigured = () => Promise.reject(new AccountRequestError('not_configured'));

const AccountContext = createContext<AccountContextValue>({
    status: 'disabled',
    ready: true,
    user: null,
    config: null,
    firstRunPrompt: false,
    resolveFirstRunPrompt: () => { },
    refresh: async () => { },
    signIn: notConfigured,
    register: notConfigured,
    signInWithGoogle: notConfigured,
    signInWithApple: notConfigured,
    requestVerification: notConfigured,
    confirmVerification: notConfigured,
    requestPasswordReset: notConfigured,
    confirmPasswordReset: notConfigured,
    changePassword: notConfigured,
    updateName: notConfigured,
    deleteAccount: notConfigured,
    signOut: async () => { },
    loadActivity: notConfigured,
    baseUrl: null,
    getToken: () => null,
});

/** A server check on returning to the app, at most this often. */
const FOREGROUND_REFRESH_MS = 10 * 60 * 1000;
/** A Keychain read that has not answered by then is treated as no session. */
const RESTORE_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(fallback), ms);
        work.then(
            (value) => { clearTimeout(timer); resolve(value); },
            () => { clearTimeout(timer); resolve(fallback); },
        );
    });
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
    const baseUrl = useMemo(() => accountApiUrl(), []);
    const enabled = baseUrl !== null;
    const client = useMemo(() => createAccountClient({
        baseUrl,
        clientLabel: Platform.OS === 'web' ? 'TusAnkiM web' : 'TusAnkiM iOS',
    }), [baseUrl]);
    const { isLoading: startupLoading, startupError } = useStartupStatus();
    const { locale } = useI18n();
    const localeRef = useRef<AccountLocale>('tr');
    localeRef.current = locale === 'en' ? 'en' : 'tr';

    const [status, setStatus] = useState<AccountStatus>(enabled ? 'loading' : 'disabled');
    const [user, setUser] = useState<AccountUser | null>(null);
    const [config, setConfig] = useState<AccountServiceConfig | null>(null);
    const [firstRunPrompt, setFirstRunPrompt] = useState(false);
    const sessionRef = useRef<Omit<StoredAccountSession, 'user'> | null>(null);
    const lastRefreshRef = useRef(0);

    const forgetSession = useCallback(async () => {
        sessionRef.current = null;
        setUser(null);
        setStatus('signedOut');
        await clearStoredSession();
    }, []);

    const adoptGrant = useCallback(async (grant: AccountSessionGrant) => {
        sessionRef.current = { token: grant.token, expiresAt: grant.expiresAt };
        setUser(grant.user);
        setStatus('signedIn');
        // Remembered now, so a relaunch never shows the welcome again; but the welcome screen
        // itself stays up until its flow ends (a new account still has its code step to show).
        markAccountPromptResolved();
        try {
            await writeStoredSession({ token: grant.token, user: grant.user, expiresAt: grant.expiresAt });
        } catch (error) {
            // Signed in for this launch all the same; the next launch asks again.
            console.warn('[Account] could not keep the session:', error);
        }
    }, []);

    const keepUser = useCallback(async (next: AccountUser) => {
        setUser(next);
        const session = sessionRef.current;
        if (!session) return;
        try {
            await writeStoredSession({ ...session, user: next });
        } catch (error) {
            console.warn('[Account] could not update the stored session:', error);
        }
    }, []);

    const requireToken = useCallback((): string => {
        const token = sessionRef.current?.token;
        if (!token) throw new AccountRequestError('unauthorized');
        return token;
    }, []);

    /** A call the server refuses for a dead session signs out here too, then reports as usual. */
    const guard = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
        const token = sessionRef.current?.token ?? null;
        try {
            return await work();
        } catch (error) {
            if (isAccountRequestError(error) && error.code === 'unauthorized' && token && sessionRef.current?.token === token) {
                await forgetSession();
            }
            throw error;
        }
    }, [forgetSession]);

    const refresh = useCallback(async () => {
        if (!enabled) return;
        lastRefreshRef.current = Date.now();
        const token = sessionRef.current?.token ?? null;
        try {
            const info = await client.session(token);
            setConfig(info.config);
            if (!token || sessionRef.current?.token !== token) return;
            if (info.user) await keepUser(info.user);
            else await forgetSession();
        } catch (error) {
            if (isAccountRequestError(error) && error.code === 'unauthorized' && token && sessionRef.current?.token === token) {
                await forgetSession();
            }
            // Offline or a server problem: keep what we know.
        }
    }, [client, enabled, forgetSession, keepUser]);

    // Restore once the collection database is open: the install marker and prompt flag live there.
    useEffect(() => {
        if (!enabled || startupLoading) return;
        let cancelled = false;
        void (async () => {
            if (startupError) {
                setStatus('signedOut');
                return;
            }
            let stored: StoredAccountSession | null = null;
            if (isFirstLaunchSinceInstall()) {
                await withTimeout(clearStoredSession(), RESTORE_TIMEOUT_MS, undefined);
                markInstallSeen();
            } else {
                stored = await withTimeout(readStoredSession(), RESTORE_TIMEOUT_MS, null);
            }
            if (cancelled) return;
            if (stored) {
                sessionRef.current = { token: stored.token, expiresAt: stored.expiresAt };
                setUser(stored.user);
            }
            setStatus(stored ? 'signedIn' : 'signedOut');
            setFirstRunPrompt(shouldOfferFirstRunPrompt({
                enabled: true,
                signedIn: Boolean(stored),
                promptResolved: isAccountPromptResolved(),
                collectionHasNotes: collectionHasNotes(),
            }));
            void refresh();
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, startupLoading, startupError, refresh]);

    // Pick up a session ended elsewhere (password changed on another device, account deleted).
    useEffect(() => {
        if (!enabled) return undefined;
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'active' && Date.now() - lastRefreshRef.current > FOREGROUND_REFRESH_MS) void refresh();
        });
        return () => subscription.remove();
    }, [enabled, refresh]);

    const resolveFirstRunPrompt = useCallback(() => {
        markAccountPromptResolved();
        setFirstRunPrompt(false);
    }, []);

    const signIn = useCallback(async (input: { email: string; password: string }) => {
        await adoptGrant(await client.login({
            email: normalizeEmail(input.email),
            password: input.password,
            locale: localeRef.current,
        }));
    }, [adoptGrant, client]);

    const signInWithGoogle = useCallback(async (idToken: string) => {
        const grant = await client.signInWithGoogle({
            idToken,
            consent: true,
            policyVersion: ACCOUNT_POLICY_VERSION,
            locale: localeRef.current,
        });
        await adoptGrant(grant);
        return { created: grant.created };
    }, [adoptGrant, client]);

    const signInWithApple = useCallback(async (credential: AppleCredential) => {
        const grant = await client.signInWithApple({
            identityToken: credential.identityToken,
            authorizationCode: credential.authorizationCode,
            name: normalizeName(credential.name),
            consent: true,
            policyVersion: ACCOUNT_POLICY_VERSION,
            locale: localeRef.current,
        });
        await adoptGrant(grant);
        return { created: grant.created };
    }, [adoptGrant, client]);

    const register = useCallback(async (input: { name: string; email: string; password: string }): Promise<RegisterOutcome> => {
        const result = await client.register({
            name: normalizeName(input.name),
            email: normalizeEmail(input.email),
            password: input.password,
            consent: true,
            policyVersion: ACCOUNT_POLICY_VERSION,
            locale: localeRef.current,
        });
        if ('verificationRequired' in result) return { verification: 'required', email: result.email };
        await adoptGrant(result);
        return { verification: result.verificationSent ? 'sent' : 'none' };
    }, [adoptGrant, client]);

    const requestVerification = useCallback((email?: string) => guard(() => {
        const token = sessionRef.current?.token ?? null;
        return client.requestVerification(
            { email: token ? undefined : normalizeEmail(email ?? ''), locale: localeRef.current },
            token,
        );
    }), [client, guard]);

    const confirmVerification = useCallback(async (code: string, email?: string) => {
        const token = sessionRef.current?.token ?? null;
        const result = await guard(() => client.confirmVerification(
            { code: normalizeCode(code), email: token ? undefined : normalizeEmail(email ?? '') },
            token,
        ));
        if (result.grant) await adoptGrant(result.grant);
        else await keepUser(result.user);
    }, [adoptGrant, client, guard, keepUser]);

    const requestPasswordReset = useCallback((email: string) => client.requestPasswordReset({
        email: normalizeEmail(email),
        locale: localeRef.current,
    }), [client]);

    const confirmPasswordReset = useCallback(async (input: { email: string; code: string; password: string }) => {
        await adoptGrant(await client.confirmPasswordReset({
            email: normalizeEmail(input.email),
            code: normalizeCode(input.code),
            password: input.password,
        }));
    }, [adoptGrant, client]);

    const changePassword = useCallback(async (input: { currentPassword: string; password: string }) => {
        await adoptGrant(await guard(() => client.changePassword(requireToken(), input)));
    }, [adoptGrant, client, guard, requireToken]);

    const updateName = useCallback(async (name: string) => {
        await keepUser(await guard(() => client.updateProfile(requireToken(), { name: normalizeName(name) })));
    }, [client, guard, keepUser, requireToken]);

    const deleteAccount = useCallback(async (proof: AccountDeleteProof) => {
        await guard(() => client.deleteAccount(requireToken(), proof));
        await forgetSession();
    }, [client, forgetSession, guard, requireToken]);

    const signOut = useCallback(async () => {
        const token = sessionRef.current?.token;
        // Local first, so signing out works offline; the server forgets the session when it can.
        await forgetSession();
        if (token) void client.logout(token).catch(() => undefined);
    }, [client, forgetSession]);

    const loadActivity = useCallback(
        () => guard(() => client.activity(requireToken())),
        [client, guard, requireToken],
    );

    const getToken = useCallback(() => sessionRef.current?.token ?? null, []);

    const value = useMemo<AccountContextValue>(() => ({
        baseUrl,
        getToken,
        status,
        ready: status !== 'loading',
        user,
        config,
        firstRunPrompt,
        resolveFirstRunPrompt,
        refresh,
        signIn,
        register,
        signInWithGoogle,
        signInWithApple,
        requestVerification,
        confirmVerification,
        requestPasswordReset,
        confirmPasswordReset,
        changePassword,
        updateName,
        deleteAccount,
        signOut,
        loadActivity,
    }), [
        status, user, config, firstRunPrompt, resolveFirstRunPrompt, refresh, signIn, register,
        requestVerification, confirmVerification, requestPasswordReset, confirmPasswordReset,
        changePassword, updateName, deleteAccount, signOut, loadActivity, signInWithGoogle, signInWithApple,
        baseUrl, getToken,
    ]);

    return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);
