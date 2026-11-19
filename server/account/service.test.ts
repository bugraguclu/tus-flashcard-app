import { describe, expect, it } from 'vitest';
import { ACCOUNT_POLICY_VERSION, CODE_RESEND_SECONDS } from '../../lib/accountContract.ts';
import type { AccountSessionGrant } from '../../lib/accountContract.ts';
import { PasswordHasher } from './passwords.ts';
import { hashToken } from './secrets.ts';
import { AccountError, AccountService } from './service.ts';
import { createHarness, NEW_PASSWORD, PASSWORD, registration } from './testing.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function failure(work: () => unknown): Promise<AccountError> {
    try {
        await work();
    } catch (error) {
        if (error instanceof AccountError) return error;
        throw error;
    }
    throw new Error('expected an AccountError');
}

async function signedUp(harness = createHarness()) {
    const grant = await harness.service.register(registration(), harness.context) as AccountSessionGrant & { verificationSent: boolean };
    return { ...harness, grant };
}

/** A wrong code that differs from the real one. */
function wrongCode(code: string): string {
    return code === '000000' ? '111111' : '000000';
}

describe('registration', () => {
    it('creates the account, signs in and mails a verification code', async () => {
        const { grant, store, mailer } = await signedUp();

        expect(grant.user).toMatchObject({ name: 'Ayşe Yılmaz', email: 'ayse@example.com', emailVerified: false });
        expect(grant.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(Date.parse(grant.expiresAt) - Date.parse(grant.user.createdAt)).toBe(60 * DAY);
        expect(grant.verificationSent).toBe(true);
        expect(mailer.sent).toHaveLength(1);
        expect(mailer.sent[0]).toMatchObject({ to: 'ayse@example.com', purpose: 'verify' });
        expect(mailer.sent[0].subject).toContain(mailer.lastCode('verify'));
        expect(mailer.sent[0].subject).toContain('doğrulama');

        const user = store.findUserByEmail('ayse@example.com');
        expect(user?.passwordHash.startsWith('scrypt$1024$8$1$')).toBe(true);
        expect(user?.passwordHash).not.toContain(PASSWORD);
        expect(store.listConsents(grant.user.id)).toEqual([{ policyVersion: ACCOUNT_POLICY_VERSION, acceptedAt: expect.any(Number) }]);
        expect(store.listEvents(grant.user.id, 10).map((event) => event.type)).toEqual(['signed_in', 'account_created']);
    });

    it('normalizes the address, ignores unknown fields and writes mail in the chosen language', async () => {
        const harness = createHarness();
        const grant = await harness.service.register(
            registration({ name: '  Ayşe   Yılmaz ', email: '  AYSE@Example.COM ', locale: 'en', isAdmin: true, role: 'owner' }),
            harness.context,
        ) as AccountSessionGrant;
        expect(grant.user.email).toBe('ayse@example.com');
        expect(grant.user.name).toBe('Ayşe Yılmaz');
        expect(harness.mailer.sent[0].subject).toContain('verification code');
    });

    it('falls back to Turkish mail for an unknown locale', async () => {
        const harness = createHarness();
        await harness.service.register(registration({ locale: 'de' }), harness.context);
        expect(harness.mailer.sent[0].subject).toContain('doğrulama kodun');
    });

    it('records a well-formed policy version the app showed, and the current one otherwise', async () => {
        const harness = createHarness();
        const first = await harness.service.register(registration({ policyVersion: '2026-01-02' }), harness.context) as AccountSessionGrant;
        const second = await harness.service.register(
            registration({ email: 'mehmet@example.com', policyVersion: 'anything' }),
            { ...harness.context, ip: '203.0.113.8' },
        ) as AccountSessionGrant;
        expect(harness.store.listConsents(first.user.id)[0].policyVersion).toBe('2026-01-02');
        expect(harness.store.listConsents(second.user.id)[0].policyVersion).toBe(ACCOUNT_POLICY_VERSION);
    });

    it('refuses an address that already has an account, however it is typed', async () => {
        const harness = createHarness();
        await harness.service.register(registration({ email: 'idil@example.com' }), harness.context);
        const error = await failure(() => harness.service.register(registration({ email: 'İDİL@example.com' }), harness.context));
        expect(error.code).toBe('email_taken');
        expect(error.status).toBe(409);
        expect(harness.store.countUsers()).toBe(1);
    });

    it('reports every invalid field at once', async () => {
        const harness = createHarness();
        const error = await failure(() => harness.service.register(
            { name: '', email: 'not-an-address', password: 'password123', consent: false },
            harness.context,
        ));
        expect(error.code).toBe('invalid_input');
        expect(error.status).toBe(400);
        expect(error.details.fields).toEqual({
            name: 'required',
            email: 'email_invalid',
            password: 'password_common',
            consent: 'consent_required',
        });
        expect(harness.store.countUsers()).toBe(0);
    });

    it('refuses short and personal passwords', async () => {
        const harness = createHarness();
        const short = await failure(() => harness.service.register(registration({ password: 'abc12' }), harness.context));
        expect(short.details.fields).toEqual({ password: 'password_too_short' });
        const personal = await failure(() => harness.service.register(registration({ password: 'yilmaz2026' }), harness.context));
        expect(personal.details.fields).toEqual({ password: 'password_personal' });
    });

    it('stays closed when registration is turned off', async () => {
        const harness = createHarness({ registrationOpen: false });
        const error = await failure(() => harness.service.register(registration(), harness.context));
        expect(error.code).toBe('registration_closed');
        expect(error.status).toBe(403);
        expect(harness.service.publicConfig().registrationOpen).toBe(false);
    });

    it('is closed while verification is required but mail cannot be sent', async () => {
        const harness = createHarness({ emailVerificationRequired: true });
        harness.mailer.ready = false;
        expect(harness.service.publicConfig()).toMatchObject({ registrationOpen: false, emailReady: false });
        expect((await failure(() => harness.service.register(registration(), harness.context))).code).toBe('registration_closed');
    });

    it('asks for the code instead of signing in when verification is required', async () => {
        const harness = createHarness({ emailVerificationRequired: true });
        const result = await harness.service.register(registration(), harness.context);
        expect(result).toEqual({ verificationRequired: true, email: 'ayse@example.com' });
        expect(harness.mailer.lastCode('verify')).toMatch(/^\d{6}$/);
        expect(harness.store.countSessions(harness.store.findUserByEmail('ayse@example.com')!.id)).toBe(0);
    });

    it('takes the account back when its required code cannot be mailed', async () => {
        const harness = createHarness({ emailVerificationRequired: true });
        harness.mailer.failures = 1;
        const error = await failure(() => harness.service.register(registration(), harness.context));
        expect(error.code).toBe('email_unavailable');
        expect(error.status).toBe(503);
        expect(harness.store.countUsers()).toBe(0);
        expect(harness.store.countCodes('ayse@example.com')).toBe(0);
        // The refunded quota lets the learner try again at once.
        const retry = await harness.service.register(registration(), harness.context);
        expect(retry).toEqual({ verificationRequired: true, email: 'ayse@example.com' });
    });

    it('still signs in when the optional verification mail fails', async () => {
        const harness = createHarness();
        harness.mailer.failures = 1;
        const grant = await harness.service.register(registration(), harness.context) as AccountSessionGrant & { verificationSent: boolean };
        expect(grant.verificationSent).toBe(false);
        expect(grant.token).toBeTruthy();
        expect(harness.store.countCodes('ayse@example.com')).toBe(0);
    });

    it('limits sign-ups per address', async () => {
        const harness = createHarness();
        for (let index = 0; index < 10; index += 1) {
            await harness.service.register(registration({ email: `learner${index}@example.com` }), harness.context);
        }
        const error = await failure(() => harness.service.register(registration({ email: 'eleventh@example.com' }), harness.context));
        expect(error.code).toBe('rate_limited');
        expect(error.details.retryAfter).toBeGreaterThan(0);
    });
});

describe('sign-in and sessions', () => {
    it('signs in with the right password and records the event', async () => {
        const { service, context, store, grant } = await signedUp();
        const session = await service.login({ email: 'Ayse@Example.com', password: PASSWORD, locale: 'tr' }, context);
        expect(session.user.id).toBe(grant.user.id);
        expect(session.token).not.toBe(grant.token);
        expect(store.countSessions(grant.user.id)).toBe(2);
        expect(store.listEvents(grant.user.id, 1)[0]).toMatchObject({ type: 'signed_in', method: 'email' });
    });

    it('answers a wrong password and an unknown address the same way', async () => {
        const { service, context } = await signedUp();
        const wrong = await failure(() => service.login({ email: 'ayse@example.com', password: 'yanlis-sifre-99' }, context));
        const unknown = await failure(() => service.login({ email: 'kimse@example.com', password: PASSWORD }, context));
        for (const error of [wrong, unknown]) {
            expect(error.code).toBe('invalid_credentials');
            expect(error.status).toBe(401);
            expect(error.message).toBe(wrong.message);
        }
    });

    it('validates the form before checking credentials', async () => {
        const { service, context } = await signedUp();
        const error = await failure(() => service.login({ email: 'ayse', password: '' }, context));
        expect(error.details.fields).toEqual({ email: 'email_invalid', password: 'required' });
    });

    it('limits guesses against one address', async () => {
        const { service, context } = await signedUp();
        for (let index = 0; index < 10; index += 1) {
            const ip = `198.51.100.${index}`;
            await failure(() => service.login({ email: 'ayse@example.com', password: 'yanlis-sifre-99' }, { ...context, ip }));
        }
        const error = await failure(() => service.login({ email: 'ayse@example.com', password: PASSWORD }, { ...context, ip: '198.51.100.99' }));
        expect(error.code).toBe('rate_limited');
        expect(error.status).toBe(429);
        expect(error.details.retryAfter).toBeGreaterThan(0);
        expect(error.details.retryAfter).toBeLessThanOrEqual(15 * 60);
    });

    it('limits sign-in attempts from one address', async () => {
        const { service, context } = await signedUp();
        for (let index = 0; index < 30; index += 1) {
            await failure(() => service.login({ email: `learner${index}@example.com`, password: PASSWORD }, context));
        }
        expect((await failure(() => service.login({ email: 'ayse@example.com', password: PASSWORD }, context))).code).toBe('rate_limited');
    });

    it('refuses an unverified sign-in when verification is required, then lets the code sign in', async () => {
        const harness = createHarness({ emailVerificationRequired: true });
        await harness.service.register(registration(), harness.context);
        harness.clock.advance(2 * MINUTE);

        const refused = await failure(() => harness.service.login({ email: 'ayse@example.com', password: PASSWORD, locale: 'en' }, harness.context));
        expect(refused.code).toBe('unverified');
        expect(refused.status).toBe(403);
        expect(refused.details.email).toBe('ayse@example.com');
        expect(harness.mailer.sent).toHaveLength(2);
        expect(harness.mailer.sent[1].subject).toContain('verification code');

        // Within the resend window the code already sent stays the one to type.
        const again = await failure(() => harness.service.login({ email: 'ayse@example.com', password: PASSWORD }, harness.context));
        expect(again.code).toBe('unverified');
        expect(harness.mailer.sent).toHaveLength(2);

        const grant = await harness.service.confirmVerification(
            { email: 'ayse@example.com', code: harness.mailer.lastCode('verify') },
            null,
            harness.context,
        ) as AccountSessionGrant;
        expect(grant.token).toBeTruthy();
        expect(grant.user.emailVerified).toBe(true);
        const session = await harness.service.login({ email: 'ayse@example.com', password: PASSWORD }, harness.context);
        expect(session.user.emailVerified).toBe(true);
    });

    it('does not reveal an unverified account to a wrong password', async () => {
        const harness = createHarness({ emailVerificationRequired: true });
        await harness.service.register(registration(), harness.context);
        const error = await failure(() => harness.service.login({ email: 'ayse@example.com', password: 'yanlis-sifre-99' }, harness.context));
        expect(error.code).toBe('invalid_credentials');
    });

    it('describes the session behind a token', async () => {
        const { service, grant } = await signedUp();
        expect(service.sessionInfo(null).user).toBeNull();
        const info = service.sessionInfo(grant.token);
        expect(info.user?.email).toBe('ayse@example.com');
        expect(info.config).toEqual({
            registrationOpen: true,
            emailReady: true,
            emailVerificationRequired: false,
            googleSignIn: false,
            policyVersion: ACCOUNT_POLICY_VERSION,
            operatorName: 'TusAnkiM Test',
            contactEmail: 'help@example.com',
        });
    });

    it('refuses malformed and unknown tokens', async () => {
        const { service } = await signedUp();
        for (const token of ['', 'short', 'x'.repeat(43)]) {
            const error = await failure(() => service.sessionInfo(token));
            expect(error.code).toBe('unauthorized');
            expect(error.status).toBe(401);
        }
    });

    it('moves the expiry forward while the session is used, and ends it when it is not', async () => {
        const { service, store, clock, grant } = await signedUp();
        const first = store.findSession(hashToken(grant.token))!;

        clock.advance(30 * MINUTE);
        service.sessionInfo(grant.token);
        expect(store.findSession(hashToken(grant.token))!.expiresAt).toBe(first.expiresAt);

        clock.advance(2 * HOUR);
        service.sessionInfo(grant.token);
        const touched = store.findSession(hashToken(grant.token))!;
        expect(touched.expiresAt).toBe(clock.now() + 60 * DAY);
        expect(touched.lastUsedAt).toBe(clock.now());

        clock.advance(61 * DAY);
        expect((await failure(() => service.sessionInfo(grant.token))).code).toBe('unauthorized');
        expect(store.findSession(hashToken(grant.token))).toBeUndefined();
    });

    it('signs out only the session it was given, and twice is harmless', async () => {
        const { service, context, store, grant } = await signedUp();
        const other = await service.login({ email: 'ayse@example.com', password: PASSWORD }, context);
        expect(service.logout(grant.token)).toEqual({});
        expect(service.logout(grant.token)).toEqual({});
        expect(service.logout('not-a-token')).toEqual({});
        expect(service.logout(null)).toEqual({});
        expect((await failure(() => service.sessionInfo(grant.token))).code).toBe('unauthorized');
        expect(service.sessionInfo(other.token).user?.id).toBe(grant.user.id);
        expect(store.listEvents(grant.user.id, 1)[0].type).toBe('signed_out');
    });

    it('upgrades a hash made at an older cost on the next sign-in', async () => {
        const harness = await signedUp();
        const before = harness.store.findUserByEmail('ayse@example.com')!.passwordHash;
        const stronger = new AccountService({
            store: harness.store,
            config: harness.settings,
            mailer: harness.mailer,
            now: harness.clock.now,
            hasher: new PasswordHasher({ N: 2048, r: 8, p: 1 }),
        });
        await stronger.login({ email: 'ayse@example.com', password: PASSWORD }, harness.context);
        const after = harness.store.findUserByEmail('ayse@example.com')!.passwordHash;
        expect(before.startsWith('scrypt$1024$')).toBe(true);
        expect(after.startsWith('scrypt$2048$')).toBe(true);
        await stronger.login({ email: 'ayse@example.com', password: PASSWORD }, { ...harness.context, ip: '203.0.113.9' });
    });
});

describe('e-mail verification', () => {
    it('sends a signed-in learner a new code once a minute', async () => {
        const { service, context, clock, mailer, grant } = await signedUp();
        const early = await failure(() => service.requestVerification({}, grant.token, context));
        expect(early.code).toBe('rate_limited');
        expect(early.details.retryAfter).toBe(CODE_RESEND_SECONDS);

        clock.advance(CODE_RESEND_SECONDS * 1000 + 1);
        expect(await service.requestVerification({ locale: 'en' }, grant.token, context)).toEqual({ sent: true, retryAfter: CODE_RESEND_SECONDS });
        expect(mailer.sent).toHaveLength(2);
        expect(mailer.sent[1].subject).toContain('verification code');
    });

    it('confirms the address with the latest code', async () => {
        const { service, context, store, mailer, grant } = await signedUp();
        const result = await service.confirmVerification({ code: ` ${mailer.lastCode('verify').slice(0, 3)}-${mailer.lastCode('verify').slice(3)} ` }, grant.token, context);
        expect(result).toEqual({ user: expect.objectContaining({ emailVerified: true }) });
        expect('token' in result).toBe(false);
        expect(store.countCodes('ayse@example.com')).toBe(0);
        expect(store.listEvents(grant.user.id, 1)[0].type).toBe('email_verified');
        expect(await service.requestVerification({}, grant.token, context)).toEqual({ sent: false, retryAfter: 0 });
    });

    it('withdraws a code after five wrong guesses', async () => {
        const { service, context, mailer, grant } = await signedUp();
        const code = mailer.lastCode('verify');
        for (let attempt = 1; attempt < 5; attempt += 1) {
            const error = await failure(() => service.confirmVerification({ code: wrongCode(code) }, grant.token, context));
            expect(error.code).toBe('code_invalid');
            expect(error.details.fields).toEqual({ code: 'code_invalid' });
        }
        expect((await failure(() => service.confirmVerification({ code: wrongCode(code) }, grant.token, context))).code).toBe('code_expired');
        expect((await failure(() => service.confirmVerification({ code }, grant.token, context))).code).toBe('code_expired');
    });

    it('lets a code expire after fifteen minutes', async () => {
        const { service, context, clock, mailer, grant } = await signedUp();
        const code = mailer.lastCode('verify');
        clock.advance(15 * MINUTE);
        const error = await failure(() => service.confirmVerification({ code }, grant.token, context));
        expect(error.code).toBe('code_expired');
        expect(error.status).toBe(400);
    });

    it('accepts each code once', async () => {
        const { service, context, mailer, grant } = await signedUp();
        const code = mailer.lastCode('verify');
        await service.confirmVerification({ code }, grant.token, context);
        expect((await failure(() => service.confirmVerification({ code }, grant.token, context))).code).toBe('code_expired');
    });

    it('answers a signed-out request the same way for unknown and verified addresses', async () => {
        const { service, context, mailer } = await signedUp();
        const sentBefore = mailer.sent.length;
        expect(await service.requestVerification({ email: 'kimse@example.com' }, null, context)).toEqual({ sent: true, retryAfter: CODE_RESEND_SECONDS });
        expect(mailer.sent).toHaveLength(sentBefore);
    });

    it('checks the address and code before looking anything up', async () => {
        const { service, context } = await signedUp();
        const error = await failure(() => service.confirmVerification({ email: 'nope', code: '12' }, null, context));
        expect(error.details.fields).toEqual({ email: 'email_invalid', code: 'code_invalid' });
    });

    it('refuses with 503 when mail cannot be sent, and gives the minute back', async () => {
        const { service, context, clock, mailer, grant } = await signedUp();
        clock.advance(CODE_RESEND_SECONDS * 1000 + 1);
        mailer.failures = 1;
        const error = await failure(() => service.requestVerification({}, grant.token, context));
        expect(error.code).toBe('email_unavailable');
        expect(error.status).toBe(503);
        expect(await service.requestVerification({}, grant.token, context)).toMatchObject({ sent: true });
    });

    it('reports e-mail as unavailable when no mailer is configured', async () => {
        const { service, context, mailer, grant } = await signedUp();
        mailer.ready = false;
        expect((await failure(() => service.requestVerification({}, grant.token, context))).code).toBe('email_unavailable');
        expect(service.publicConfig().emailReady).toBe(false);
    });

    it('caps codes per address at five an hour', async () => {
        const { service, context, clock } = await signedUp();
        const ip = (index: number) => ({ ...context, ip: `192.0.2.${index}` });
        // The sign-up already sent one.
        for (let index = 0; index < 4; index += 1) {
            clock.advance(CODE_RESEND_SECONDS * 1000 + 1);
            await service.requestVerification({ email: 'ayse@example.com' }, null, ip(index));
        }
        clock.advance(CODE_RESEND_SECONDS * 1000 + 1);
        const error = await failure(() => service.requestVerification({ email: 'ayse@example.com' }, null, ip(9)));
        expect(error.code).toBe('rate_limited');
        expect(error.details.retryAfter).toBeGreaterThan(CODE_RESEND_SECONDS);
    });
});

describe('password reset', () => {
    it('says the same for an unknown address and sends nothing', async () => {
        const { service, context, mailer } = await signedUp();
        const before = mailer.sent.length;
        expect(await service.requestPasswordReset({ email: 'kimse@example.com' }, context)).toEqual({ sent: true, retryAfter: CODE_RESEND_SECONDS });
        expect(mailer.sent).toHaveLength(before);
    });

    it('sets the new password, signs every device out and opens one new session', async () => {
        const { service, context, store, mailer, grant } = await signedUp();
        const other = await service.login({ email: 'ayse@example.com', password: PASSWORD }, context);
        await service.requestPasswordReset({ email: 'AYSE@example.com', locale: 'en' }, context);
        expect(mailer.sent.at(-1)?.subject).toContain('password reset code');

        const session = await service.confirmPasswordReset(
            { email: 'ayse@example.com', code: mailer.lastCode('reset'), password: NEW_PASSWORD },
            context,
        );
        expect(session.user.emailVerified).toBe(true);
        for (const token of [grant.token, other.token]) {
            expect((await failure(() => service.sessionInfo(token))).code).toBe('unauthorized');
        }
        expect(service.sessionInfo(session.token).user?.id).toBe(grant.user.id);
        expect(store.countSessions(grant.user.id)).toBe(1);
        expect((await failure(() => service.login({ email: 'ayse@example.com', password: PASSWORD }, context))).code).toBe('invalid_credentials');
        await service.login({ email: 'ayse@example.com', password: NEW_PASSWORD }, { ...context, ip: '203.0.113.20' });
        expect(store.listEvents(grant.user.id, 5).map((event) => event.type)).toContain('password_reset');
    });

    it('rejects a weak new password without spending the code', async () => {
        const { service, context, mailer } = await signedUp();
        await service.requestPasswordReset({ email: 'ayse@example.com' }, context);
        const code = mailer.lastCode('reset');
        const weak = await failure(() => service.confirmPasswordReset({ email: 'ayse@example.com', code, password: '12345678' }, context));
        expect(weak.details.fields).toEqual({ password: 'password_common' });
        await service.confirmPasswordReset({ email: 'ayse@example.com', code, password: NEW_PASSWORD }, context);
    });

    it('does not judge the password against the account name before the code is checked', async () => {
        const { service, context } = await signedUp();
        // "yilmaz2026" is refused at sign-up as personal; here the name must not leak.
        const error = await failure(() => service.confirmPasswordReset({ email: 'ayse@example.com', code: '123456', password: 'yilmaz2026' }, context));
        expect(error.code).toBe('code_expired');
    });

    it('keeps reset and verification codes apart', async () => {
        const { service, context, mailer } = await signedUp();
        const verifyCode = mailer.lastCode('verify');
        await service.requestPasswordReset({ email: 'ayse@example.com' }, context);
        // One run in a million draws the same six digits twice; there is nothing to compare then.
        if (mailer.lastCode('reset') === verifyCode) return;
        const error = await failure(() => service.confirmPasswordReset({ email: 'ayse@example.com', code: verifyCode, password: NEW_PASSWORD }, context));
        expect(['code_invalid', 'code_expired']).toContain(error.code);
    });
});

describe('account management', () => {
    it('changes the password only with the current one, and signs other devices out', async () => {
        const { service, context, store, grant } = await signedUp();
        const other = await service.login({ email: 'ayse@example.com', password: PASSWORD }, context);

        const wrong = await failure(() => service.changePassword(grant.token, { currentPassword: 'yanlis-sifre-99', password: NEW_PASSWORD }, context));
        expect(wrong.code).toBe('wrong_password');
        expect(wrong.status).toBe(400);
        expect(wrong.details.fields).toEqual({ currentPassword: 'password_wrong' });

        const weak = await failure(() => service.changePassword(grant.token, { currentPassword: PASSWORD, password: 'ayse1234' }, context));
        expect(weak.details.fields).toEqual({ password: 'password_personal' });

        const rotated = await service.changePassword(grant.token, { currentPassword: PASSWORD, password: NEW_PASSWORD }, context);
        expect((await failure(() => service.sessionInfo(other.token))).code).toBe('unauthorized');
        expect((await failure(() => service.sessionInfo(grant.token))).code).toBe('unauthorized');
        expect(service.sessionInfo(rotated.token).user?.id).toBe(grant.user.id);
        expect(store.countSessions(grant.user.id)).toBe(1);
        expect(store.listEvents(grant.user.id, 1)[0].type).toBe('password_changed');
    });

    it('renames the account', async () => {
        const { service, store, grant } = await signedUp();
        expect(service.updateProfile(grant.token, { name: '  Ayşe  Nur Yılmaz ' }).user.name).toBe('Ayşe Nur Yılmaz');
        expect(store.findUserById(grant.user.id)?.name).toBe('Ayşe Nur Yılmaz');
        expect(store.listEvents(grant.user.id, 1)[0].type).toBe('name_changed');
        const error = await failure(() => service.updateProfile(grant.token, { name: '   ' }));
        expect(error.details.fields).toEqual({ name: 'required' });
    });

    it('deletes the account and everything kept with it, only with the password', async () => {
        const { service, context, store, mailer, grant } = await signedUp();
        await service.requestPasswordReset({ email: 'ayse@example.com' }, context);
        expect(store.countCodes('ayse@example.com')).toBeGreaterThan(0);

        const missing = await failure(() => service.deleteAccount(grant.token, {}));
        expect(missing.details.fields).toEqual({ password: 'required' });
        const wrong = await failure(() => service.deleteAccount(grant.token, { password: 'yanlis-sifre-99' }));
        expect(wrong.code).toBe('wrong_password');
        expect(wrong.details.fields).toEqual({ password: 'password_wrong' });

        expect(await service.deleteAccount(grant.token, { password: PASSWORD })).toEqual({});
        expect(store.findUserById(grant.user.id)).toBeUndefined();
        expect(store.countSessions(grant.user.id)).toBe(0);
        expect(store.listConsents(grant.user.id)).toEqual([]);
        expect(store.listEvents(grant.user.id, 10)).toEqual([]);
        expect(store.countCodes('ayse@example.com')).toBe(0);
        expect((await failure(() => service.sessionInfo(grant.token))).code).toBe('unauthorized');
        expect((await failure(() => service.login({ email: 'ayse@example.com', password: PASSWORD }, context))).code).toBe('invalid_credentials');

        // The address is free again.
        mailer.sent.length = 0;
        await service.register(registration(), { ...context, ip: '203.0.113.30' });
    });

    it('lists the newest twenty account events first', async () => {
        const { service, context, clock, grant } = await signedUp();
        for (let index = 0; index < 12; index += 1) {
            clock.advance(MINUTE);
            const session = await service.login({ email: 'ayse@example.com', password: PASSWORD }, { ...context, ip: `192.0.2.${index}` });
            service.logout(session.token);
            if (index === 4) clock.advance(16 * MINUTE);
        }
        const { events } = service.activity(grant.token);
        expect(events).toHaveLength(20);
        expect(events[0].type).toBe('signed_out');
        expect(Date.parse(events[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(events[19].createdAt));
        expect(Object.keys(events[0]).sort()).toEqual(['createdAt', 'type']);
    });

    it('needs a valid session for every management call', async () => {
        const { service, context } = await signedUp();
        const calls = [
            () => service.activity(null),
            () => service.updateProfile(null, { name: 'X Y' }),
            () => service.changePassword(null, { currentPassword: PASSWORD, password: NEW_PASSWORD }, context),
            () => service.deleteAccount(null, { password: PASSWORD }),
        ];
        for (const call of calls) expect((await failure(call)).status).toBe(401);
    });
});
