import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useIsDarkTheme } from '../../constants/theme';
import { useAccount } from '../../contexts/AccountContext';
import SignInScreen from './SignInScreen';

/**
 * On a new installation, the welcome sign-in screen comes before the deck list, once. It stands in
 * for the whole navigator rather than sliding over it, so the deck list never flashes first and
 * VoiceOver cannot wander behind it. "Continue without an account" needs no network.
 */
export default function AccountFirstRunGate({ children }: { children: React.ReactNode }) {
    const { firstRunPrompt, resolveFirstRunPrompt } = useAccount();
    const isDark = useIsDarkTheme();

    if (!firstRunPrompt) return children;
    return (
        <>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <SignInScreen variant="welcome" onClose={resolveFirstRunPrompt} onFinished={resolveFirstRunPrompt} />
        </>
    );
}
