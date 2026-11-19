import { IdTokenError, JwksKeys, verifyIdToken } from './idToken.ts';
import type { FetchLike, IdTokenIdentity, KeySource } from './idToken.ts';

export type { JsonWebKey } from './idToken.ts';

/*
 * "Sign in with Google": the app gets an ID token from Google's own sign-in sheet and sends it
 * here; the server checks it the way Google documents for back ends
 * (https://developers.google.com/identity/sign-in/ios/backend-auth). The check itself is in
 * idToken.ts, shared with Sign in with Apple.
 */

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS: ReadonlySet<string> = new Set(['accounts.google.com', 'https://accounts.google.com']);

export type GoogleIdentity = IdTokenIdentity;
export type GoogleKeySource = KeySource;
export { IdTokenError as GoogleTokenError };

/** Google's key list. */
export class GoogleKeys extends JwksKeys {
    constructor(fetchImpl?: FetchLike, now?: () => number, url: string = GOOGLE_CERTS_URL) {
        super(url, fetchImpl, now);
    }
}

/** Checks a Google ID token and returns who it names; throws GoogleTokenError otherwise. */
export function verifyGoogleIdToken(
    token: string,
    options: { clientIds: readonly string[]; keys: KeySource; now: number },
): Promise<GoogleIdentity> {
    return verifyIdToken(token, { ...options, issuers: ISSUERS });
}
