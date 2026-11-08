/**
 * Where the account server lives (`server/account`). A build names it with
 * EXPO_PUBLIC_ACCOUNT_API_URL; a development build without one talks to
 * `npm run account-server:dev` on the same Mac. A release build without one has no account
 * features at all, so local study never waits on a server nobody configured.
 */

export const DEV_ACCOUNT_API_URL = 'http://localhost:8787';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The base URL with no trailing slash, or null when accounts are off. Plain HTTP is accepted only
 * for this machine: a password must never cross a network unencrypted. React Native's `URL` lacks
 * `hostname`, so the address is taken apart by hand.
 */
export function resolveAccountApiUrl(configured: string | undefined, development: boolean): string | null {
    const raw = configured?.trim() || (development ? DEV_ACCOUNT_API_URL : '');
    const match = /^(https?):\/\/(\[[^\]]+\]|[^/:?#@]+)(:\d{1,5})?(\/[^?#]*)?$/i.exec(raw);
    if (!match) return null;
    const scheme = match[1].toLowerCase();
    const host = match[2].toLowerCase();
    if (scheme !== 'https' && !LOOPBACK_HOSTS.has(host)) return null;
    const path = (match[4] ?? '').replace(/\/+$/, '');
    return `${scheme}://${host}${match[3] ?? ''}${path}`;
}

declare const __DEV__: boolean | undefined;

export function accountApiUrl(): string | null {
    const development = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);
    // Expo inlines EXPO_PUBLIC_ variables only when read with this exact member expression.
    return resolveAccountApiUrl(process.env.EXPO_PUBLIC_ACCOUNT_API_URL, development);
}
