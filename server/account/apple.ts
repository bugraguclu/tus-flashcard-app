import { createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { JwksKeys, verifyIdToken } from './idToken.ts';
import type { FetchLike, IdTokenIdentity, KeySource } from './idToken.ts';

/*
 * "Sign in with Apple". The app gets an identity token from Apple's own sheet and sends it here;
 * the server checks it like a Google token (idToken.ts), against Apple's key list
 * (https://developer.apple.com/documentation/signinwithapple/verifying-a-user).
 *
 * Apple also asks apps to revoke their access when an account is deleted
 * (https://developer.apple.com/documentation/signinwithapple/revoke-tokens). That takes a refresh
 * token, which the server gets once, at sign-in, by trading the authorization code the app sends
 * along; both calls authenticate with a short-lived JWT signed by the developer account's
 * Sign in with Apple key. Without that key the server still signs people in and only logs that it
 * could not revoke.
 */

export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const ISSUERS: ReadonlySet<string> = new Set([APPLE_ISSUER]);
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const REQUEST_TIMEOUT_MS = 8_000;
/** Apple accepts client secrets for up to six months; ours live five minutes. */
const CLIENT_SECRET_LIFETIME_S = 300;

export class AppleKeys extends JwksKeys {
    constructor(fetchImpl?: FetchLike, now?: () => number, url: string = APPLE_KEYS_URL) {
        super(url, fetchImpl, now);
    }
}

export function verifyAppleIdToken(
    token: string,
    options: { clientIds: readonly string[]; keys: KeySource; now: number },
): Promise<IdTokenIdentity> {
    return verifyIdToken(token, { ...options, issuers: ISSUERS });
}

/** The developer account's Sign in with Apple key (Certificates, Identifiers & Profiles → Keys). */
export interface AppleKeyConfig {
    teamId: string;
    keyId: string;
    /** The .p8 file's PEM text. */
    privateKey: string;
}

/** Trades an authorization code for a refresh token, and revokes one. */
export interface AppleTokenService {
    /** The refresh token for this code, or null when Apple refused it. */
    exchange(code: string, clientId: string): Promise<string | null>;
    /** Throws when Apple did not confirm the revocation. */
    revoke(refreshToken: string, clientId: string): Promise<void>;
}

type PostLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class AppleTokens implements AppleTokenService {
    private readonly config: AppleKeyConfig;
    private readonly key: KeyObject;
    private readonly post: PostLike;
    private readonly now: () => number;

    constructor(config: AppleKeyConfig, post: PostLike = fetch as unknown as PostLike, now: () => number = Date.now) {
        this.config = config;
        this.key = createPrivateKey(config.privateKey);
        this.post = post;
        this.now = now;
    }

    /** An ES256 JWT that says "this request comes from our team, for this client ID". */
    clientSecret(clientId: string): string {
        const issuedAt = Math.floor(this.now() / 1000);
        const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const unsigned = `${part({ alg: 'ES256', kid: this.config.keyId })}.${part({
            iss: this.config.teamId,
            iat: issuedAt,
            exp: issuedAt + CLIENT_SECRET_LIFETIME_S,
            aud: APPLE_ISSUER,
            sub: clientId,
        })}`;
        const signature = sign('sha256', Buffer.from(unsigned), { key: this.key, dsaEncoding: 'ieee-p1363' });
        return `${unsigned}.${signature.toString('base64url')}`;
    }

    async exchange(code: string, clientId: string): Promise<string | null> {
        const response = await this.form(APPLE_TOKEN_URL, {
            client_id: clientId,
            client_secret: this.clientSecret(clientId),
            code,
            grant_type: 'authorization_code',
        });
        if (!response.ok) return null;
        const body = await response.json() as { refresh_token?: unknown };
        return typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null;
    }

    async revoke(refreshToken: string, clientId: string): Promise<void> {
        const response = await this.form(APPLE_REVOKE_URL, {
            client_id: clientId,
            client_secret: this.clientSecret(clientId),
            token: refreshToken,
            token_type_hint: 'refresh_token',
        });
        if (!response.ok) throw new Error(`Apple answered ${response.status}`);
    }

    private form(url: string, fields: Record<string, string>) {
        return this.post(url, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields).toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    }
}
