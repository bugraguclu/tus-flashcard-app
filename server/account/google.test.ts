import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_POLICY_VERSION } from '../../lib/accountContract.ts';
import { GoogleKeys, GoogleTokenError, verifyGoogleIdToken } from './google.ts';
import type { GoogleKeySource, JsonWebKey } from './google.ts';
import { AccountError } from './service.ts';
import { createHarness, PASSWORD, registration } from './testing.ts';

const CLIENT_ID = 'test-ios.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256' } as JsonWebKey;
const keys: GoogleKeySource = { key: async (kid) => (kid === 'key-1' ? PUBLIC_JWK : null) };

function b64(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A token shaped like Google's, signed with the test key unless told otherwise. */
function googleToken(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, nowMs = Date.UTC(2026, 10, 8, 9, 0, 0)): string {
    const now = Math.floor(nowMs / 1000);
    const head = b64({ alg: 'RS256', kid: 'key-1', typ: 'JWT', ...header });
    const body = b64({
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        sub: 'google-123',
        email: 'ayse@example.com',
        email_verified: true,
        name: 'Ayşe Yılmaz',
        iat: now - 10,
        exp: now + 3600,
        ...claims,
    });
    const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
    return `${head}.${body}.${signature}`;
}

const NOW = Date.UTC(2026, 10, 8, 9, 0, 0);
const verify = (token: string, now = NOW) => verifyGoogleIdToken(token, { clientIds: [CLIENT_ID], keys, now });

async function refused(work: () => Promise<unknown>): Promise<string> {
    try {
        await work();
    } catch (error) {
        if (error instanceof GoogleTokenError) return error.message;
        throw error;
    }
    throw new Error('expected the token to be refused');
}

async function accountFailure(work: () => unknown): Promise<AccountError> {
    try {
        await work();
    } catch (error) {
        if (error instanceof AccountError) return error;
        throw error;
    }
    throw new Error('expected an AccountError');
}

describe('Google ID token check', () => {
    it('accepts a token Google signed for our client', async () => {
        await expect(verify(googleToken())).resolves.toEqual({
            subject: 'google-123',
            email: 'ayse@example.com',
            emailVerified: true,
            name: 'Ayşe Yılmaz',
        });
    });

    it('refuses forged, foreign, stale and malformed tokens', async () => {
        const genuine = googleToken();
        const [head, , signature] = genuine.split('.');
        expect(await refused(() => verify(`${head}.${b64({ sub: 'other' })}.${signature}`))).toBe('bad signature');
        expect(await refused(() => verify(googleToken({ aud: 'someone-else.apps.googleusercontent.com' })))).toBe('wrong audience');
        expect(await refused(() => verify(googleToken({ iss: 'https://evil.example' })))).toBe('wrong issuer');
        expect(await refused(() => verify(googleToken(), NOW + 2 * 3600_000))).toBe('expired');
        expect(await refused(() => verify(googleToken({}, { alg: 'none' })))).toBe('unexpected algorithm');
        expect(await refused(() => verify(googleToken({}, { kid: 'retired' })))).toBe('unknown signing key');
        expect(await refused(() => verify('not-a-token'))).toBe('malformed token');
    });

    it('caches Google keys for as long as Google allows', async () => {
        let fetches = 0;
        let now = NOW;
        const source = new GoogleKeys(async () => {
            fetches += 1;
            return {
                ok: true,
                headers: { get: () => 'public, max-age=600' },
                json: async () => ({ keys: [PUBLIC_JWK] }),
            };
        }, () => now);
        expect(await source.key('key-1')).toEqual(PUBLIC_JWK);
        expect(await source.key('key-1')).toEqual(PUBLIC_JWK);
        expect(fetches).toBe(1);
        now += 601_000;
        await source.key('key-1');
        expect(fetches).toBe(2);
        expect(await source.key('missing')).toBeNull();
    });
});

describe('Sign in with Google', () => {
    const harness = () => createHarness({ googleClientIds: [CLIENT_ID] }, { googleKeys: keys });

    it('is off, and says so, without client IDs', async () => {
        const { service, context } = createHarness({}, { googleKeys: keys });
        expect(service.publicConfig().googleSignIn).toBe(false);
        expect((await accountFailure(() => service.googleSignIn({ idToken: googleToken() }, context))).code).toBe('not_found');
    });

    it('creates a verified account without a password on first use, then signs in to it', async () => {
        const { service, context } = harness();
        expect(service.publicConfig().googleSignIn).toBe(true);
        expect((await accountFailure(() => service.googleSignIn({ idToken: googleToken() }, context))).details.fields)
            .toEqual({ consent: 'consent_required' });

        const first = await service.googleSignIn({ idToken: googleToken(), consent: true, policyVersion: ACCOUNT_POLICY_VERSION }, context);
        expect(first.created).toBe(true);
        expect(first.user).toMatchObject({ email: 'ayse@example.com', name: 'Ayşe Yılmaz', emailVerified: true, hasPassword: false, google: true });

        const again = await service.googleSignIn({ idToken: googleToken() }, context);
        expect(again.created).toBe(false);
        expect(again.user.id).toBe(first.user.id);

        // Without a password, the address cannot be used to sign in with one.
        expect((await accountFailure(() => service.login({ email: 'ayse@example.com', password: PASSWORD }, context))).code)
            .toBe('invalid_credentials');
    });

    it('links an existing account with the same address and marks it verified', async () => {
        const { service, context } = harness();
        const made = await service.register(registration(), context) as { user: { id: string; emailVerified: boolean } };
        expect(made.user.emailVerified).toBe(false);
        const grant = await service.googleSignIn({ idToken: googleToken() }, context);
        expect(grant.created).toBe(false);
        expect(grant.user).toMatchObject({ id: made.user.id, emailVerified: true, hasPassword: true, google: true });
        // The password still works too.
        await expect(service.login({ email: 'ayse@example.com', password: PASSWORD }, context)).resolves.toBeTruthy();
    });

    it('refuses addresses Google has not verified and tokens it did not sign', async () => {
        const { service, context } = harness();
        expect((await accountFailure(() => service.googleSignIn({ idToken: googleToken({ email_verified: false }), consent: true }, context))).code)
            .toBe('google_failed');
        expect((await accountFailure(() => service.googleSignIn({ idToken: 'forged', consent: true }, context))).code).toBe('google_failed');
    });

    it('deletes a password-less account only with a fresh token for the same Google account', async () => {
        const { service, context, store } = harness();
        const grant = await service.googleSignIn({ idToken: googleToken(), consent: true }, context);
        expect((await accountFailure(() => service.deleteAccount(grant.token, { password: 'anything' }))).code).toBe('wrong_password');
        expect((await accountFailure(() => service.deleteAccount(grant.token, { googleIdToken: googleToken({ sub: 'someone-else' }) }))).code)
            .toBe('google_failed');
        await service.deleteAccount(grant.token, { googleIdToken: googleToken() });
        expect(store.countUsers()).toBe(0);
    });
});
