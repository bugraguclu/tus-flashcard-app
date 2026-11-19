import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useIsDarkTheme, useThemeColors } from '../../constants/theme';
import { useAccount } from '../../contexts/AccountContext';
import { useWebKeyboardNavigation } from '../../hooks/useWebKeyboardNavigation';
import SignInScreen from './SignInScreen';

/** The web build's focus ring and keyboard handling, which `WebAppIntegrations` gives the navigator. */
function WebKeyboardSupport() {
    const colors = useThemeColors();
    useWebKeyboardNavigation({ ringColor: colors.textPrimary, haloColor: colors.bgCard });
    return null;
}

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
            {Platform.OS === 'web' ? <WebKeyboardSupport /> : null}
            <SignInScreen variant="welcome" onClose={resolveFirstRunPrompt} onFinished={resolveFirstRunPrompt} />
        </>
    );
}
