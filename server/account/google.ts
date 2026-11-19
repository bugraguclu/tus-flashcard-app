import { createPublicKey, verify as verifySignature } from 'node:crypto';

/** One RSA key from Google's list, as JSON Web Key fields. */
export interface JsonWebKey {
    kty?: string;
    kid?: string;
    n?: string;
    e?: string;
    alg?: string;
    use?: string;
}

/*
 * "Sign in with Google": the app gets an ID token from Google's own sign-in sheet and sends it
 * here; the server checks it itself, the way Google documents for back ends
 * (https://developers.google.com/identity/sign-in/ios/backend-auth): an RS256 signature by one of
 * Google's published keys, Google as issuer, one of our client IDs as audience, and a lifetime
 * that has not run out. No Google library and no call to Google per sign-in beyond the key list.
 */

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Clocks on phones and servers drift; Google's own libraries allow five minutes. */
const CLOCK_SKEW_MS = 5 * 60_000;
const KEY_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_KEY_LIFETIME_MS = 60 * 60_000;

export interface GoogleIdentity {
    /** Google's stable account ID (`sub`); an address can change, this cannot. */
    subject: string;
    email: string;
    emailVerified: boolean;
    name: string;
}

export interface GoogleKeySource {
    /** The public key Google signed with, or null when it is not (or no longer) published. */
    key(kid: string): Promise<JsonWebKey | null>;
}

export class GoogleTokenError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = 'GoogleTokenError';
    }
}

type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

/** Google's key list, kept for as long as its Cache-Control allows and fetched again on a miss. */
export class GoogleKeys implements GoogleKeySource {
    private keys = new Map<string, JsonWebKey>();
    private expiresAt = 0;
    private loading: Promise<void> | null = null;
    // Plain fields, not constructor parameter properties: Node runs this file by stripping types.
    private readonly fetchImpl: FetchLike;
    private readonly now: () => number;
    private readonly url: string;

    constructor(fetchImpl: FetchLike = fetch as unknown as FetchLike, now: () => number = Date.now, url: string = GOOGLE_CERTS_URL) {
        this.fetchImpl = fetchImpl;
        this.now = now;
        this.url = url;
    }

    async key(kid: string): Promise<JsonWebKey | null> {
        if (this.now() >= this.expiresAt || !this.keys.has(kid)) await this.refresh();
        return this.keys.get(kid) ?? null;
    }

    private refresh(): Promise<void> {
        this.loading ??= this.load().finally(() => {
            this.loading = null;
        });
        return this.loading;
    }

    private async load(): Promise<void> {
        const response = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(KEY_FETCH_TIMEOUT_MS) });
        if (!response.ok) throw new GoogleTokenError('Google keys could not be loaded');
        const body = await response.json() as { keys?: unknown };
        const next = new Map<string, JsonWebKey>();
        for (const entry of Array.isArray(body.keys) ? body.keys : []) {
            const jwk = entry as JsonWebKey;
            if (typeof jwk.kid === 'string' && jwk.kty === 'RSA') next.set(jwk.kid, jwk);
        }
        const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
        this.keys = next;
        this.expiresAt = this.now() + (maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_KEY_LIFETIME_MS);
    }
}

function decodeJson(part: string): Record<string, unknown> {
    try {
        const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
        // Falls through to the error below.
    }
    throw new GoogleTokenError('malformed token');
}

/** Checks a Google ID token and returns who it names; throws GoogleTokenError otherwise. */
export async function verifyGoogleIdToken(
    token: string,
    options: { clientIds: readonly string[]; keys: GoogleKeySource; now: number },
): Promise<GoogleIdentity> {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 8192) throw new GoogleTokenError('malformed token');
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new GoogleTokenError('unexpected algorithm');

    const jwk = await options.keys.key(header.kid);
    if (!jwk) throw new GoogleTokenError('unknown signing key');
    const signed = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${headerPart}.${payloadPart}`),
        createPublicKey({ key: { kty: 'RSA', n: jwk.n ?? '', e: jwk.e ?? '' }, format: 'jwk' }),
        Buffer.from(signaturePart, 'base64url'),
    );
    if (!signed) throw new GoogleTokenError('bad signature');

    const claims = decodeJson(payloadPart);
    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) throw new GoogleTokenError('wrong issuer');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((audience) => typeof audience === 'string' && options.clientIds.includes(audience))) {
        throw new GoogleTokenError('wrong audience');
    }
    const expires = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
    const issued = typeof claims.iat === 'number' ? claims.iat * 1000 : Number.POSITIVE_INFINITY;
    if (expires + CLOCK_SKEW_MS <= options.now) throw new GoogleTokenError('expired');
    if (issued - CLOCK_SKEW_MS > options.now) throw new GoogleTokenError('issued in the future');
    if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email) {
        throw new GoogleTokenError('missing account');
    }
    return {
        subject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
        name: typeof claims.name === 'string' ? claims.name : '',
    };
}
