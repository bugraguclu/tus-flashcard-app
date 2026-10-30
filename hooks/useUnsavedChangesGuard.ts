import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { confirmAsync } from '../lib/confirm';
import { isWriterTakeoverReloading } from '../lib/db';
import { addPopStateGuard } from '../lib/webPopStateGuard';

type UnsavedChangesGuardOptions = {
    title: string;
    message: string;
};

/**
 * Protect a routed editor from every navigation action, including native back and swipe-back.
 * The caller owns the draft snapshot; this hook only turns a dirty result into one guarded
 * beforeRemove flow and allows the original navigation action after explicit confirmation.
 *
 * `usePreventRemove` rather than a bare `beforeRemove` listener: it also tells the native stack,
 * which then puts the screen back after an iOS back swipe and asks over it. A bare
 * listener only hears about the swipe once iOS has already taken the screen away, so the question
 * appeared over the previous screen and Cancel had nothing left to return to.
 */
export function useUnsavedChangesGuard(
    isDirty: boolean,
    { title, message }: UnsavedChangesGuardOptions,
): void {
    const navigation = useNavigation();
    const dirtyRef = useRef(isDirty);
    const allowNavigationRef = useRef(false);
    const confirmationOpenRef = useRef(false);

    dirtyRef.current = isDirty;

    usePreventRemove(isDirty, ({ data }) => {
        if (allowNavigationRef.current) {
            navigation.dispatch(data.action);
            return;
        }
        if (confirmationOpenRef.current) return;
        confirmationOpenRef.current = true;

        void confirmAsync(title, message, { destructive: true })
            .then((confirmed) => {
                if (!confirmed) return;
                allowNavigationRef.current = true;
                navigation.dispatch(data.action);
            })
            .finally(() => {
                confirmationOpenRef.current = false;
            });
    });

    // The browser's own Back (a button, a trackpad swipe, Alt+Left) reaches Expo Router as a
    // `popstate`, which it follows without any `beforeRemove`. This guard hears it first (see
    // lib/webPopStateGuard.ts): it keeps the router from following, returns to this screen's
    // history entry, and asks the same question the in-app back button does. It only acts while
    // this screen is the one shown, so going back from a screen pushed on top of it is left alone.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
        let restoringEntry = false;
        return addPopStateGuard(() => {
            if (restoringEntry) {
                restoringEntry = false;
                return true;
            }
            if (!dirtyRef.current || allowNavigationRef.current || !navigation.isFocused()) return false;

            restoringEntry = true;
            window.history.go(1);
            if (!confirmationOpenRef.current) {
                confirmationOpenRef.current = true;
                void confirmAsync(title, message, { destructive: true })
                    .then((confirmed) => {
                        if (!confirmed) return;
                        allowNavigationRef.current = true;
                        window.history.back();
                    })
                    .finally(() => {
                        confirmationOpenRef.current = false;
                    });
            }
            return true;
        });
    }, [message, navigation, title]);

    // A browser tab can also be closed or reloaded, which no navigation listener sees. The browser
    // only offers its own generic prompt there, but that still stops the draft vanishing silently.
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirtyRef.current || allowNavigationRef.current || isWriterTakeoverReloading()) return;
            event.preventDefault();
            // Chromium still requires returnValue to be set before it shows the prompt.
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);
}

