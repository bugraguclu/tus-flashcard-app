import { createServer } from 'node:http';
import { clearInterval, setInterval, setTimeout } from 'node:timers';
import { ConfigError, loadConfig } from './config.ts';
import type { ServerConfig } from './config.ts';
import { createAccountHandler } from './http.ts';
import { createMailer } from './mailer.ts';
import type { Logger } from './mailer.ts';
import { PasswordHasher } from './passwords.ts';
import { RateLimiter } from './rateLimit.ts';
import { AccountService } from './service.ts';
import { AccountStore } from './store.ts';

/*
 * Entry point: `node server/account/main.ts` (Node 24 runs the TypeScript directly).
 * Settings come from the environment; see `.env.example`.
 */

const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

/** Lets the process exit while the timer is pending (the DOM typings in this repo hide `unref`). */
function unref(timer: unknown): void {
    (timer as { unref?: () => void }).unref?.();
}

const log: Logger = {
    info: (message) => console.log(message),
    warn: (message) => console.warn(message),
    error: (message, error) => console.error(message, error),
};

function readConfig(): ServerConfig {
    try {
        return loadConfig(process.env);
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(`[account] ${error.message}`);
            process.exit(1);
        }
        throw error;
    }
}

function main(): void {
    const config = readConfig();
    for (const warning of config.warnings) log.warn(`[account] ${warning}`);

    const store = new AccountStore(config.databasePath);
    store.purgeExpired(Date.now());
    const limiter = new RateLimiter();
    const mailer = createMailer(config, log);
    const service = new AccountService({ store, config, mailer, limiter, hasher: new PasswordHasher(), log });

    const server = createServer(createAccountHandler(service, config, log));
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;

    const maintenance = setInterval(() => {
        limiter.sweep();
        store.purgeExpired(Date.now());
    }, MAINTENANCE_INTERVAL_MS);
    unref(maintenance);

    server.listen(config.port, config.host, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : config.port;
        const mode = config.production ? 'production' : config.dev ? 'development' : 'local';
        log.info(`[account] listening on http://${config.host}:${port} · ${mode} · mail: ${mailer.mode}`);
    });

    let stopping = false;
    const stop = (signal: string) => {
        if (stopping) return;
        stopping = true;
        log.info(`[account] ${signal} received, stopping`);
        clearInterval(maintenance);
        server.close(() => {
            store.close();
            process.exit(0);
        });
        server.closeIdleConnections();
        // Requests still running after this are cut off rather than holding the process.
        unref(setTimeout(() => process.exit(0), 5_000));
    };
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
}

main();
