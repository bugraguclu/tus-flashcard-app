import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { helpRouteHref } from '../lib/helpSearch';
import type { HelpLinkTarget } from '../lib/helpTypes';

/** The next screen opens after the modal has actually dismissed on iPhone. */
export function useHelpHandoff(visible: boolean, close: () => void, target: HelpLinkTarget, onNavigate?: (href: string) => void) {
    const router = useRouter(); const pending = useRef(false);
    const destination = useRef({ target, onNavigate, router });
    destination.current = { target, onNavigate, router };
    const onDismiss = useCallback(() => {
        if (!pending.current) return;
        pending.current = false;
        const { target: next, onNavigate: navigate, router: currentRouter } = destination.current;
        const href = helpRouteHref(next);
        if (navigate) navigate(href); else currentRouter.push(href as any);
    }, []);
    useEffect(() => { if (Platform.OS !== 'ios' && !visible) onDismiss(); }, [visible, onDismiss]);
    return { open: () => { pending.current = true; close(); }, onDismiss };
}
