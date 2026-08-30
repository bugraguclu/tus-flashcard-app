import { useEffect, useRef } from 'react';
import { useNavigation } from 'expo-router';
import { confirmAsync } from '../lib/confirm';

type UnsavedChangesGuardOptions = {
    title: string;
    message: string;
};

/**
 * Protect a routed editor from every navigation action, including native back and swipe-back.
 * The caller owns the draft snapshot; this hook only turns a dirty result into one guarded
 * beforeRemove flow and allows the original navigation action after explicit confirmation.
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

    useEffect(() => navigation.addListener('beforeRemove', (event: any) => {
        if (!dirtyRef.current || allowNavigationRef.current) return;

        event.preventDefault();
        if (confirmationOpenRef.current) return;
        confirmationOpenRef.current = true;

        void confirmAsync(title, message, { destructive: true })
            .then((confirmed) => {
                if (!confirmed) return;
                allowNavigationRef.current = true;
                navigation.dispatch(event.data.action);
            })
            .finally(() => {
                confirmationOpenRef.current = false;
            });
    }), [message, navigation, title]);
}

