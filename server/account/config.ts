import { createPrivateKey, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Server settings, read once from the environment. The variable names for mail follow the diet
 * app's (Yemek Takibi) Django settings so one SMTP account can serve both services.
 */

export interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    /** Upgrade a clear connection with STARTTLS (usually port 587). */
    startTls: boolean;
    /** TLS from the first byte (usually port 465). */
    implicitTls: boolean;
    /** `TusAnkiM <no-reply@example.com>` or a bare address. */
    from: string;
    /** Name this server gives itself in EHLO. */
    clientName: string;
}

export interface ServerConfig {
    port: number;
    host: string;
    databasePath: string;
    /** HMAC key for e-mailed codes. */
    secret: string;
    production: boolean;
    /** ACCOUNT_DEV=1: local development (generated secret, console outbox, localhost CORS). */
    dev: boolean;
    /** Print codes to the console instead of sending mail. Never in production. */
    devOutbox: boolean;
    registrationOpen: boolean;
    emailVerificationRequired: boolean;
    operatorName: string;
    contactEmail: string;
    /** Exact origins (scheme://host[:port]) the web build may call from. */
    allowedOrigins: string[];
    /** Development also accepts any http(s)://localhost or 127.0.0.1 port, as Expo's web port moves. */
    allowLocalOrigins: boolean;
    /** Behind a reverse proxy: take the client address from X-Forwarded-For. */
    trustProxy: boolean;
    sessionDays: number;
    /** OAuth client IDs (iOS and web) whose Google ID tokens are accepted; empty turns Google off. */
    googleClientIds: string[];
    /** The app's bundle ID and the web Services ID whose Apple identity tokens are accepted; empty turns Apple off. */
    appleClientIds: string[];
    /** The Sign in with Apple key that lets the server revoke a deleted account's access, or null. */
    appleKey: { teamId: string; keyId: string; privateKey: string } | null;
    smtp: SmtpConfig | null;
    /** Things worth saying once at startup. */
    warnings: string[];
}

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

type Environment = Record<string, string | undefined>;

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

/** `server/account/.data/accounts.sqlite`, wherever the server is started from. */
export const DEFAULT_DATABASE_PATH = resolve(MODULE_DIRECTORY, '.data', 'accounts.sqlite');

const MINIMUM_SECRET_LENGTH = 32;

function text(env: Environment, name: string): string {
    return (env[name] ?? '').trim();
}

function flag(env: Environment, name: string, fallback: boolean): boolean {
    const value = text(env, name).toLowerCase();
    if (!value) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    throw new ConfigError(`${name} must be 1 or 0 (got "${env[name]}")`);
}

function integer(env: Environment, name: string, fallback: number, min: number, max: number): number {
    const value = text(env, name);
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new ConfigError(`${name} must be a whole number from ${min} to ${max} (got "${value}")`);
    }
    return parsed;
}

function origins(env: Environment): string[] {
    return text(env, 'ACCOUNT_ALLOWED_ORIGINS')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            let url: URL;
            try {
                url = new URL(entry);
            } catch {
                throw new ConfigError(`ACCOUNT_ALLOWED_ORIGINS has an invalid origin: "${entry}"`);
            }
            const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
            if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !bare) {
                throw new ConfigError(`ACCOUNT_ALLOWED_ORIGINS entries must be bare origins like https://app.example.com (got "${entry}")`);
            }
            return url.origin;
        });
}

function smtp(env: Environment): SmtpConfig | null {
    const host = text(env, 'EMAIL_HOST');
    if (!host) return null;
    const implicitTls = flag(env, 'EMAIL_USE_SSL', false);
    // A mail relay is reached over TLS unless someone deliberately turns it off.
    const startTls = flag(env, 'EMAIL_USE_TLS', !implicitTls);
    if (implicitTls && startTls) {
        throw new ConfigError('EMAIL_USE_TLS and EMAIL_USE_SSL are mutually exclusive; set only one of them to 1');
    }
    const user = text(env, 'EMAIL_HOST_USER');
    const fromSetting = text(env, 'DEFAULT_FROM_EMAIL');
    const from = fromSetting || (user.includes('@') ? `TusAnkiM <${user}>` : '');
    if (!from) throw new ConfigError('DEFAULT_FROM_EMAIL is required when EMAIL_HOST is set');
    if (/[\r\n]/.test(from)) throw new ConfigError('DEFAULT_FROM_EMAIL must be a single line');
    return {
        host,
        port: integer(env, 'EMAIL_PORT', implicitTls ? 465 : 587, 1, 65535),
        user,
        password: env.EMAIL_HOST_PASSWORD ?? '',
        startTls,
        implicitTls,
        from,
        clientName: text(env, 'EMAIL_EHLO_NAME') || hostname() || 'tusankim-account',
    };
}

/** `GOOGLE_CLIENT_IDS`: comma-separated OAuth client IDs, each ending in .apps.googleusercontent.com. */
function googleClientIds(env: Environment): string[] {
    const ids = text(env, 'GOOGLE_CLIENT_IDS').split(',').map((id) => id.trim()).filter(Boolean);
    const invalid = ids.find((id) => !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id));
    if (invalid) throw new ConfigError(`GOOGLE_CLIENT_IDS has an entry that is not a Google OAuth client ID: ${invalid}`);
    return ids;
}

/** `APPLE_CLIENT_IDS`: comma-separated bundle and Services IDs (com.example.app). */
function appleClientIds(env: Environment): string[] {
    const ids = text(env, 'APPLE_CLIENT_IDS').split(',').map((id) => id.trim()).filter(Boolean);
    const invalid = ids.find((id) => !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(id));
    if (invalid) throw new ConfigError(`APPLE_CLIENT_IDS has an entry that is not a bundle or Services ID: ${invalid}`);
    return ids;
}

/** `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY_FILE` (the .p8 file): all three or none. */
function appleKey(env: Environment, warnings: string[], appleOn: boolean): ServerConfig['appleKey'] {
    const teamId = text(env, 'APPLE_TEAM_ID');
    const keyId = text(env, 'APPLE_KEY_ID');
    const file = text(env, 'APPLE_PRIVATE_KEY_FILE');
    if (!teamId && !keyId && !file) {
        if (appleOn) warnings.push('APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY_FILE are not set; deleting an account will not revoke its Sign in with Apple access.');
        return null;
    }
    if (!teamId || !keyId || !file) throw new ConfigError('APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY_FILE go together; set all three');
    let privateKey: string;
    try {
        privateKey = readFileSync(resolve(file), 'utf8');
        createPrivateKey(privateKey);
    } catch {
        throw new ConfigError(`APPLE_PRIVATE_KEY_FILE could not be read as a .p8 key: ${file}`);
    }
    return { teamId, keyId, privateKey };
}

export function loadConfig(env: Environment = process.env): ServerConfig {
    const production = text(env, 'NODE_ENV') === 'production';
    const dev = flag(env, 'ACCOUNT_DEV', false);
    if (production && dev) throw new ConfigError('ACCOUNT_DEV cannot be used with NODE_ENV=production');

    const warnings: string[] = [];
    let secret = env.ACCOUNT_SECRET ?? '';
    if (secret && secret.length < MINIMUM_SECRET_LENGTH) {
        throw new ConfigError(`ACCOUNT_SECRET must be at least ${MINIMUM_SECRET_LENGTH} characters`);
    }
    if (!secret) {
        if (production) throw new ConfigError('ACCOUNT_SECRET is required when NODE_ENV=production');
        secret = randomBytes(48).toString('base64url');
        warnings.push('ACCOUNT_SECRET is not set; using a random one, so codes sent before a restart stop working.');
    }

    const mail = smtp(env);
    const devOutbox = flag(env, 'ACCOUNT_DEV_OUTBOX', dev && !mail);
    if (production && devOutbox) throw new ConfigError('ACCOUNT_DEV_OUTBOX cannot be used with NODE_ENV=production');
    if (!mail && !devOutbox) {
        warnings.push('EMAIL_HOST is not set; verification and password-reset codes cannot be sent.');
    }

    const apple = appleClientIds(env);
    const databaseSetting = text(env, 'ACCOUNT_DATABASE');
    const databasePath = !databaseSetting
        ? DEFAULT_DATABASE_PATH
        : databaseSetting === ':memory:' ? ':memory:' : resolve(databaseSetting);

    return {
        port: integer(env, 'ACCOUNT_PORT', 8787, 0, 65535),
        host: text(env, 'ACCOUNT_HOST') || '127.0.0.1',
        databasePath,
        secret,
        production,
        dev,
        devOutbox,
        registrationOpen: flag(env, 'REGISTRATION_OPEN', true),
        emailVerificationRequired: flag(env, 'EMAIL_VERIFICATION_REQUIRED', false),
        operatorName: text(env, 'OPERATOR_NAME'),
        contactEmail: text(env, 'CONTACT_EMAIL'),
        allowedOrigins: origins(env),
        allowLocalOrigins: dev,
        trustProxy: flag(env, 'TRUST_PROXY', false),
        sessionDays: integer(env, 'ACCOUNT_SESSION_DAYS', 60, 1, 365),
        googleClientIds: googleClientIds(env),
        appleClientIds: apple,
        appleKey: appleKey(env, warnings, apple.length > 0),
        smtp: mail,
        warnings,
    };
}
