import { translateActive } from './i18n';

const MAX_USER_MESSAGE_LENGTH = 600;

/**
 * Runtime, database and bundler diagnostics belong in the developer console, never in the UI.
 * Keep the rules deliberately narrow enough to preserve short domain/validation messages.
 */
const TECHNICAL_ERROR_PATTERNS = [
    /<!doctype|<html\b|<head\b|<body\b|<style\b/i,
    /node_modules[\\/]|(?:^|[?&])platform=|transform\.engine|unstable_transformProfile/i,
    /failed to load (?:split )?bundle|error response|message:\s*file not found/i,
    /https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.|10\.)/i,
    /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Invariant Violation)\b/i,
    /\b(?:SQLITE|ERR)_[A-Z0-9_]+\b/,
    /\b(?:SQLite|IndexedDB|sql\.js|JSZip|Hermes|Metro|webpack)\b/i,
    /\b(?:Cannot find module|Native module|Network request failed|Failed to fetch|ENOENT|EACCES)\b/i,
    /(?:^|\n)\s*at\s+(?:async\s+)?[^\n]+:\d+:\d+/,
    /\b(?:stack trace|unhandled promise rejection)\b/i,
    /\b(?:Element type is invalid|Check the render method|mixed up default and named imports)\b/i,
    /\b(?:Minified React error|Rendered (?:more|fewer) hooks|Objects are not valid as a React child)\b/i,
    /\b(?:Maximum update depth exceeded|Cannot update a component while rendering)\b/i,
    /\b(?:expected a string \(for built-in components\)|for composite components)\b/i,
    /\b(?:undefined is not an object|null is not an object|is not a function|cannot read propert(?:y|ies))\b/i,
    /\b(?:React\.createElement|createNavigatorFactory|ExpoRouter)\b/i,
];

export function isTechnicalErrorMessage(message: string): boolean {
    const normalized = message.trim();
    if (!normalized) return true;
    if (normalized.length > MAX_USER_MESSAGE_LENGTH) return true;
    return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Return a concise user-safe message while callers keep the original error for console logs. */
export function userFacingErrorMessage(
    value: unknown,
    fallback: string = translateActive('common.genericError'),
): string {
    const raw = value instanceof Error
        ? value.message
        : typeof value === 'string'
            ? value
            : value && typeof value === 'object' && 'message' in value
                ? String(value.message)
                : '';
    const message = raw.trim();
    return isTechnicalErrorMessage(message) ? fallback : message;
}
