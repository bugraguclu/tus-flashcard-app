import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { useStartupStatus } from '../contexts/AppContext';
import StartupIssueScreen from '../components/StartupIssueScreen';
import { externalAppUrlFromQuery, parseExternalAppUrl } from '../lib/externalLinking';
import { externalActionRoute, type ExternalActionRoute } from '../lib/externalActionRoute';
import { returnToDeckList } from '../lib/backNavigation';

/**
 * The web address of TusAnkiM's x-callback automation: `/x-callback-url?action=addnote&type=…`.
 *
 * An iPhone receives the same requests as `tusankim://x-callback-url/<action>?…`, handled in
 * `app/_layout.tsx`. A browser cannot own that scheme, so the site answers here instead; the query
 * is read by the same parser and opens the same screen. An unknown or incomplete request lands on
 * the deck list already beneath (or, opened on its own, a new one) rather than on an error.
 *
 * As there, the request waits until startup has succeeded: the root stack also mounts to show a
 * failed or timed-out start, and the editor must not open (and write) beside a migration that is
 * still running. Until then this address shows the same startup screen, with its way on.
 */
export default function ExternalActionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<Record<string, string | string[]>>();
    const colors = useThemeColors();
    const { isLoading, startupError } = useStartupStatus();
    const startupSucceeded = !isLoading && !startupError;
    const handled = useRef(false);

    useEffect(() => {
        if (!startupSucceeded || handled.current) return;
        handled.current = true;
        const url = externalAppUrlFromQuery(params);
        const action = url ? parseExternalAppUrl(url) : null;
        let route: ExternalActionRoute | null = null;
        try {
            route = action ? externalActionRoute(action) : null;
        } catch (error) {
            console.warn('[Linking] x-callback request failed:', error);
        }
        if (route) router.replace(route as never);
        else returnToDeckList(router);
        // The request is read once, when the address is opened and the app has started.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startupSucceeded]);

    if (startupError) return <StartupIssueScreen />;
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
            <ActivityIndicator color={colors.accent} />
        </View>
    );
}
