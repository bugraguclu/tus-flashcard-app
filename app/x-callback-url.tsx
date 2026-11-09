import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { useStartupStatus } from '../contexts/AppContext';
import StartupIssueScreen from '../components/StartupIssueScreen';
import { externalAppUrlFromQuery, readExternalAppUrl, type ExternalLinkRejection } from '../lib/externalLinking';
import { externalActionRoute, type ExternalActionRoute } from '../lib/externalActionRoute';
import { externalLinkRejectionText } from '../lib/externalLinkRejection';
import { returnToDeckList } from '../lib/backNavigation';
import { alert } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';

/**
 * The web address of TusAnkiM's x-callback automation: `/x-callback-url?action=addnote&type=…`.
 *
 * An iPhone receives the same requests as `tusankim://x-callback-url/<action>?…`, handled in
 * `app/_layout.tsx`. A browser cannot own that scheme, so the site answers here instead; the query
 * is read by the same parser and opens the same screen. An unknown or incomplete request lands on
 * the deck list already beneath (or, opened on its own, a new one), with a notice saying why.
 *
 * As there, the request waits until startup has succeeded: the root stack also mounts to show a
 * failed or timed-out start, and the editor must not open (and write) beside a migration that is
 * still running. Until then this address shows the same startup screen, with its way on.
 */
export default function ExternalActionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<Record<string, string | string[]>>();
    const colors = useThemeColors();
    const { locale } = useI18n();
    const { isLoading, startupError } = useStartupStatus();
    const startupSucceeded = !isLoading && !startupError;
    const handled = useRef(false);

    useEffect(() => {
        if (!startupSucceeded || handled.current) return;
        handled.current = true;
        const url = externalAppUrlFromQuery(params);
        const reading = url ? readExternalAppUrl(url) : null;
        const rawAction = Array.isArray(params.action) ? params.action[0] : params.action;
        let rejection: ExternalLinkRejection | null = reading
            ? ('rejected' in reading ? reading.rejected : null)
            : { reason: 'unknownAction', action: (rawAction ?? '').slice(0, 60) };
        let route: ExternalActionRoute | null = null;
        if (reading && 'action' in reading) {
            try {
                const result = externalActionRoute(reading.action);
                if ('rejected' in result) rejection = result.rejected;
                else route = result;
            } catch (error) {
                console.warn('[Linking] x-callback request failed:', error);
            }
        }
        if (route) {
            router.replace(route as never);
            return;
        }
        returnToDeckList(router);
        if (rejection) {
            const { title, message } = externalLinkRejectionText(locale, rejection);
            // On a page opened at this address, the app's dialog host registers in the same
            // commit as this effect, after it; a tick later the notice is the app's own dialog
            // rather than the browser's alert.
            setTimeout(() => alert(title, message), 0);
        }
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
