import { AccountRequestError } from './accountApi';
import { googleClientIds } from './accountConfig';

/*
 * The web preview signs in with Google Identity Services (the native module has no free web
 * build): Google's own prompt hands back an ID token, the same thing the iPhone sheet returns.
 * The script loads only when the button is pressed.
 */

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface PromptMoment {
    isNotDisplayed?: () => boolean;
    isSkippedMoment?: () => boolean;
    isDismissedMoment?: () => boolean;
}

interface GoogleIdentityServices {
    accounts: {
        id: {
            initialize(options: { client_id: string; callback: (reply: { credential?: string }) => void; use_fedcm_for_prompt?: boolean }): void;
            prompt(listener?: (moment: PromptMoment) => void): void;
        };
    };
}

let loading: Promise<GoogleIdentityServices> | null = null;

function loadScript(): Promise<GoogleIdentityServices> {
    const existing = (window as unknown as { google?: GoogleIdentityServices }).google;
    if (existing?.accounts?.id) return Promise.resolve(existing);
    loading ??= new Promise<GoogleIdentityServices>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => {
            const google = (window as unknown as { google?: GoogleIdentityServices }).google;
            if (google?.accounts?.id) resolve(google);
            else reject(new AccountRequestError('google_failed'));
        };
        script.onerror = () => {
            loading = null;
            reject(new AccountRequestError('offline'));
        };
        document.head.appendChild(script);
    });
    return loading;
}

export function googleSignInAvailable(): boolean {
    return googleClientIds().web !== null;
}

/** An ID token, or null when Google's prompt was closed or not shown. */
export async function requestGoogleIdToken(): Promise<string | null> {
    const clientId = googleClientIds().web;
    if (!clientId) throw new AccountRequestError('not_configured');
    const google = await loadScript();
    return new Promise<string | null>((resolve) => {
        let settled = false;
        const finish = (token: string | null) => {
            if (settled) return;
            settled = true;
            resolve(token);
        };
        google.accounts.id.initialize({
            client_id: clientId,
            callback: (reply) => finish(reply.credential ?? null),
            use_fedcm_for_prompt: true,
        });
        google.accounts.id.prompt((moment) => {
            if (moment.isNotDisplayed?.() || moment.isSkippedMoment?.()) finish(null);
        });
    });
}
