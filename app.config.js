/*
 * app.json plus what depends on the build's environment (see server/account/README.md):
 * - a build with an account server (EXPO_PUBLIC_ACCOUNT_API_URL) gets the Sign in with Apple
 *   entitlement, which App Review requires next to Google;
 * - "Sign in with Google" needs Google's iOS URL scheme (the iOS client ID reversed); a build
 *   without EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID gets no scheme and no Google button.
 */
module.exports = ({ config }) => {
    const plugins = [...(config.plugins ?? [])];
    if ((process.env.EXPO_PUBLIC_ACCOUNT_API_URL ?? '').trim()) plugins.push('expo-apple-authentication');
    const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
    if (/^[\w.-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) {
        const iosUrlScheme = iosClientId.split('.').reverse().join('.');
        plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
    }
    return plugins.length === (config.plugins ?? []).length ? config : { ...config, plugins };
};
