import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { externalAppUrlFromQuery, parseExternalAppUrl } from '../lib/externalLinking';
import { externalActionRoute } from '../lib/externalActionRoute';

/**
 * The web address of TusAnkiM's x-callback automation: `/x-callback-url?action=addnote&type=…`.
 *
 * An iPhone receives the same requests as `tusankim://x-callback-url/<action>?…`, handled in
 * `app/_layout.tsx`. A browser cannot own that scheme, so the site answers here instead; the query
 * is read by the same parser and opens the same screen. An unknown or incomplete request lands on
 * the deck list rather than on an error.
 */
export default function ExternalActionScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<Record<string, string | string[]>>();
    const colors = useThemeColors();

    useEffect(() => {
        const url = externalAppUrlFromQuery(params);
        const action = url ? parseExternalAppUrl(url) : null;
        const route = action ? externalActionRoute(action) : null;
        router.replace((route ?? '/decks') as never);
        // The request is read once, when the address is opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
            <ActivityIndicator color={colors.accent} />
        </View>
    );
}
