/**
 * Security boundary for HTML imported with cards.
 *
 * Imported templates are display content, not trusted application code. The
 * reviewer therefore denies network, script, form and nested-frame access by
 * default. Local media and inline styles remain available for Anki package
 * compatibility.
 */
export const CARD_CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' file: data: blob:",
    "media-src 'self' file: data: blob:",
    "font-src 'self' file: data: blob:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
].join('; ');

export const CARD_CONTENT_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CARD_CONTENT_SECURITY_POLICY}">`;

/** The rich editor needs one trusted bridge script; imported/user HTML gets no script nonce. */
export function editorContentSecurityPolicy(nonce: string): string {
    return [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline'",
        "img-src 'self' file: data: blob:",
        "media-src 'self' file: data: blob:",
        "font-src 'self' file: data: blob:",
        "connect-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].join('; ');
}

/** Only deliberate HTTPS links may leave a card, and never with embedded credentials. */
export function safeExternalCardUrl(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const candidate = raw.trim();
    if (!candidate || candidate.length > 2048 || /[\u0000-\u001f\u007f]/.test(candidate)) return null;

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
        return parsed.href;
    } catch {
        return null;
    }
}
