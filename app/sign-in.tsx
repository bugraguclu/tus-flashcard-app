import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SignInScreen from '../components/account/SignInScreen';
import type { SignInMode } from '../components/account/useSignInFlow';
import { useAccount } from '../contexts/AccountContext';

const ROUTE_MODES = new Set<SignInMode>(['login', 'register', 'forgot', 'verify']);

/** Sign in or create an account from Settings, or verify the address from the account page. */
export default function SignInRoute() {
    const router = useRouter();
    const params = useLocalSearchParams<{ mode?: string }>();
    const { status } = useAccount();
    const requested = ROUTE_MODES.has(params.mode as SignInMode) ? params.mode as SignInMode : 'login';
    const initialMode = requested === 'verify' && status !== 'signedIn' ? 'login' : requested;

    const close = React.useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/settings' as never);
    }, [router]);

    // Accounts are off in this build: there is nothing to sign in to.
    useEffect(() => {
        if (status === 'disabled') close();
    }, [close, status]);

    return (
        <SignInScreen
            variant="modal"
            initialMode={initialMode}
            sendCodeOnOpen={initialMode === 'verify'}
            onClose={close}
            onFinished={close}
        />
    );
}
