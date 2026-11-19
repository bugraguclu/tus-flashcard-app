/*
 * app.json plus what depends on the build's environment. "Sign in with Google" needs Google's iOS
 * URL scheme (the iOS client ID reversed); a build without EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID gets
 * no scheme and no Google button. See server/account/README.md, "Google ile giriş".
 */
module.exports = ({ config }) => {
    const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) return config;
    const iosUrlScheme = iosClientId.split('.').reverse().join('.');
    return {
        ...config,
        plugins: [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
    };
};
