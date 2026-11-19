import { Platform } from 'react-native';
import {
    GoogleSignin,
    isCancelledResponse,
    isErrorWithCode,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import { AccountRequestError } from './accountApi';
import { googleClientIds } from './accountConfig';

/*
 * Google's own sign-in sheet on iPhone (the GoogleSignIn SDK in an ASWebAuthenticationSession),
 * reduced to one job: hand back an ID token for the account server to check. The app keeps no
 * Google session of its own, so each tap shows Google's account chooser.
 */

let configured = false;

export function googleSignInAvailable(): boolean {
    return Platform.OS === 'ios' && googleClientIds().ios !== null;
}

/** An ID token, or null when the learner closed Google's sheet. */
export async function requestGoogleIdToken(): Promise<string | null> {
    const ids = googleClientIds();
    if (Platform.OS !== 'ios' || !ids.ios) throw new AccountRequestError('not_configured');
    if (!configured) {
        GoogleSignin.configure({ iosClientId: ids.ios, webClientId: ids.web ?? undefined });
        configured = true;
    }
    try {
        const response = await GoogleSignin.signIn();
        if (isCancelledResponse(response)) return null;
        const token = response.data.idToken;
        void GoogleSignin.signOut().catch(() => undefined);
        if (!token) throw new AccountRequestError('google_failed');
        return token;
    } catch (error) {
        if (error instanceof AccountRequestError) throw error;
        if (isErrorWithCode(error) && (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)) {
            return null;
        }
        throw new AccountRequestError('google_failed');
    }
}
