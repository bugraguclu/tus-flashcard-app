import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const PRODUCTION_CSP = [
    "default-src 'self'",
    // Expo Router emits this one fixed hydration flag. Hashing it avoids granting every
    // injected inline script permission to run.
    "script-src 'self' 'wasm-unsafe-eval' 'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

// Expo's local development server uses WebSockets and loopback HTTP.
const DEVELOPMENT_CSP = PRODUCTION_CSP.replace(
    "connect-src 'self'",
    "connect-src 'self' http: https: ws: wss:",
).replace(
    "script-src 'self' 'wasm-unsafe-eval' 'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
);

export default function Root({ children }: { children: React.ReactNode }) {
    const csp = process.env.NODE_ENV === 'production' ? PRODUCTION_CSP : DEVELOPMENT_CSP;
    return (
        <html lang="tr">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="Content-Security-Policy" content={csp} />
                <meta name="referrer" content="no-referrer" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <ScrollViewStyleReset />
            </head>
            <body>{children}</body>
        </html>
    );
}
