import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AccountRequestError } from './accountApi';
import type { AppleCredential } from './accountContract';

/*
 * Apple's own sign-in sheet on iPhone (AuthenticationServices), reduced to one job: hand back the
 * identity token and authorization code for the account server to check. iPhone is the only
 * native target, and every iOS version the app supports has the sheet.
 */

export function appleSignInAvailable(): boolean {
    return Platform.OS === 'ios';
}

/** Apple's credential, or null when the learner closed the sheet. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
    if (Platform.OS !== 'ios') throw new AccountRequestError('not_configured');
    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        if (!credential.identityToken || !credential.authorizationCode) throw new AccountRequestError('apple_failed');
        return {
            identityToken: credential.identityToken,
            authorizationCode: credential.authorizationCode,
            name: credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : '',
        };
    } catch (error) {
        if (error instanceof AccountRequestError) throw error;
        if ((error as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return null;
        throw new AccountRequestError('apple_failed');
    }
}
