import { RICH_TEXT_EDITOR_SCRIPT_HASH } from './richTextEditorScript';

/**
 * Content-Security-Policy for the web app's own page (`app/+html.tsx`).
 *
 * Inline script is allowed only by hash, and exactly two inline scripts exist: Expo Router's
 * hydration flag, and the rich text field script. The field runs in a blank iframe, which
 * inherits this policy, so its hash has to be named here as well as in the field's own policy.
 */

/** Expo Router emits one fixed inline script: `globalThis.__EXPO_ROUTER_HYDRATE__=true;`. */
const EXPO_ROUTER_HYDRATION_HASH = "'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='";

const PRODUCTION_SCRIPT_SRC = [
    "script-src 'self' 'wasm-unsafe-eval'",
    EXPO_ROUTER_HYDRATION_HASH,
    RICH_TEXT_EDITOR_SCRIPT_HASH,
].join(' ');

export const WEB_APP_PRODUCTION_CSP = [
    "default-src 'self'",
    PRODUCTION_SCRIPT_SRC,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    // Picked files, recordings and camera shots reach the app as blob: or data: URLs, and every
    // reader (import, media attach, audio save) fetches them. Neither scheme leaves the device.
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

// Expo's local development server uses WebSockets, loopback HTTP and inline/eval'd module code.
// A hash in script-src would switch 'unsafe-inline' off, so development lists none.
export const WEB_APP_DEVELOPMENT_CSP = WEB_APP_PRODUCTION_CSP
    .replace("connect-src 'self' blob: data:", "connect-src 'self' blob: data: http: https: ws: wss:")
    .replace(PRODUCTION_SCRIPT_SRC, "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'");
