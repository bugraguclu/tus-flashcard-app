import React, { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useIsDarkTheme } from '../../constants/theme';
import { useAccount } from '../../contexts/AccountContext';
import { collectionHasNotes } from '../../lib/accountLocalState';
import { DATA_IMPORT_ROUTE } from '../../lib/dataManagementRoutes';
import {
    dismissWelcome,
    isWelcomeDismissed,
    setPendingWelcomeRoute,
    shouldShowWelcomePage,
} from '../../lib/deckListFirstRun';
import { WebKeyboardSupport } from '../account/AccountFirstRunGate';
import WelcomeScreen, { type WelcomeChoice } from './WelcomeScreen';

const CHOICE_ROUTE: Record<Exclude<WelcomeChoice, 'decks'>, string> = {
    catalog: '/catalog',
    editor: '/editor',
    import: DATA_IMPORT_ROUTE,
    signIn: '/sign-in',
};

/**
 * On a new installation the welcome page comes before everything else, once. Like the account
 * gate below it, it stands in for the whole navigator rather than sliding over it, so the deck
 * list never flashes first and VoiceOver cannot wander behind it. The deck list opens the screen
 * the learner picks over itself, so Back returns there.
 *
 * It is the only welcome: leaving it also settles the account gate's one-time sign-in offer, so a
 * second welcome never follows. Where accounts exist, the page offers sign-in as a quiet link.
 */
export default function WelcomeGate({ children }: { children: React.ReactNode }) {
    const isDark = useIsDarkTheme();
    const { status: accountStatus, resolveFirstRunPrompt } = useAccount();
    const [visible, setVisible] = useState(() => shouldShowWelcomePage(collectionHasNotes(), isWelcomeDismissed()));

    const choose = useCallback((choice: WelcomeChoice) => {
        dismissWelcome();
        resolveFirstRunPrompt();
        setPendingWelcomeRoute(choice === 'decks' ? null : CHOICE_ROUTE[choice]);
        setVisible(false);
    }, [resolveFirstRunPrompt]);

    if (visible) {
        return (
            <>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                {Platform.OS === 'web' ? <WebKeyboardSupport /> : null}
                <WelcomeScreen onChoose={choose} offerSignIn={accountStatus !== 'disabled'} />
            </>
        );
    }
    return children;
}
