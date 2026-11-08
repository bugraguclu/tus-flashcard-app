import type { Mailer, MailerMode, OutgoingMail } from './mailer.ts';
import { PasswordHasher } from './passwords.ts';
import type { ScryptCost } from './passwords.ts';
import { RateLimiter } from './rateLimit.ts';
import { AccountService } from './service.ts';
import type { AccountServiceDeps, RequestContext } from './service.ts';
import { AccountStore } from './store.ts';
import type { CodePurpose } from './store.ts';

/* Test doubles shared by the account server's tests. Not part of the server (Docker skips it). */

/** Cheap enough for hundreds of hashes per test run; production uses DEFAULT_SCRYPT_COST. */
export const FAST_COST: ScryptCost = { N: 1024, r: 8, p: 1 };

export const PASSWORD = 'kirmizi-elma-42';
export const NEW_PASSWORD = 'yesil-armut-77';

export class FakeMailer implements Mailer {
    ready = true;
    mode: MailerMode = 'smtp';
    readonly sent: OutgoingMail[] = [];
    /** Sends to fail before the next one succeeds. */
    failures = 0;

    async send(mail: OutgoingMail): Promise<void> {
        if (this.failures > 0) {
            this.failures -= 1;
            throw new Error('relay unavailable');
        }
        this.sent.push(mail);
    }

    lastCode(purpose: CodePurpose): string {
        const mail = [...this.sent].reverse().find((entry) => entry.purpose === purpose);
        if (!mail) throw new Error(`no ${purpose} code was sent`);
        return mail.code;
    }
}

export function createClock(start = Date.UTC(2026, 10, 8, 9, 0, 0)): { now: () => number; advance: (ms: number) => void } {
    let current = start;
    return {
        now: () => current,
        advance: (ms) => {
            current += ms;
        },
    };
}

export type HarnessConfig = AccountServiceDeps['config'];

export function createHarness(config: Partial<HarnessConfig> = {}) {
    const clock = createClock();
    const store = new AccountStore(':memory:');
    const mailer = new FakeMailer();
    const settings: HarnessConfig = {
        secret: 'test-secret-that-is-long-enough-0123456789',
        registrationOpen: true,
        emailVerificationRequired: false,
        operatorName: 'TusAnkiM Test',
        contactEmail: 'help@example.com',
        sessionDays: 60,
        ...config,
    };
    const limiter = new RateLimiter(clock.now);
    const service = new AccountService({
        store,
        config: settings,
        mailer,
        limiter,
        now: clock.now,
        hasher: new PasswordHasher(FAST_COST),
    });
    const context: RequestContext = { ip: '203.0.113.7', client: 'TusAnkiM test' };
    return { clock, store, mailer, settings, limiter, service, context };
}

export function registration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        name: 'Ayşe Yılmaz',
        email: 'ayse@example.com',
        password: PASSWORD,
        consent: true,
        locale: 'tr',
        ...overrides,
    };
}
