import { AccountRequestError } from './accountApi';
import { appleWebServiceId } from './accountConfig';
import type { AppleCredential } from './accountContract';

/*
 * The web preview signs in with Apple through Sign in with Apple JS in a popup, which hands back
 * the same identity token and authorization code as the iPhone sheet. It needs a Services ID
 * whose return URL is this page's origin. The script loads only when the button is pressed.
 */

const SCRIPT_URL = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

interface AppleSignInReply {
    authorization?: { code?: string; id_token?: string };
    user?: { name?: { firstName?: string; lastName?: string } };
}

interface AppleIdJs {
    auth: {
        init(options: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }): void;
        signIn(): Promise<AppleSignInReply>;
    };
}

let loading: Promise<AppleIdJs> | null = null;

function loadScript(): Promise<AppleIdJs> {
    const existing = (window as unknown as { AppleID?: AppleIdJs }).AppleID;
    if (existing?.auth) return Promise.resolve(existing);
    loading ??= new Promise<AppleIdJs>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => {
            const apple = (window as unknown as { AppleID?: AppleIdJs }).AppleID;
            if (apple?.auth) resolve(apple);
            else reject(new AccountRequestError('apple_failed'));
        };
        script.onerror = () => {
            loading = null;
            // The provider's script, not the account server, could not be reached.
            reject(new AccountRequestError('apple_failed'));
        };
        document.head.appendChild(script);
    });
    return loading;
}

export function appleSignInAvailable(): boolean {
    return appleWebServiceId() !== null;
}

/** Apple's credential, or null when the learner closed Apple's popup. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
    const clientId = appleWebServiceId();
    if (!clientId) throw new AccountRequestError('not_configured');
    const apple = await loadScript();
    apple.auth.init({ clientId, scope: 'name email', redirectURI: `${window.location.origin}/`, usePopup: true });
    let reply: AppleSignInReply;
    try {
        reply = await apple.auth.signIn();
    } catch (error) {
        const reason = (error as { error?: unknown } | null)?.error;
        if (reason === 'popup_closed_by_user' || reason === 'user_cancelled_authorize') return null;
        throw new AccountRequestError('apple_failed');
    }
    const identityToken = reply.authorization?.id_token;
    const authorizationCode = reply.authorization?.code;
    if (!identityToken || !authorizationCode) throw new AccountRequestError('apple_failed');
    const name = [reply.user?.name?.firstName, reply.user?.name?.lastName].filter(Boolean).join(' ');
    return { identityToken, authorizationCode, name };
}
