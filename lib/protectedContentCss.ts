/**
 * Content lockdown has been removed.
 * Text selection, callouts, and drag-and-drop are permitted across all cards and editors.
 * Exports are preserved as empty values / no-ops for backwards compatibility.
 */

export const PROTECTED_CONTENT_CSS = '';

export const PROTECTED_BLOCKED_EVENTS = [] as const;

export const PROTECTED_BLOCKED_SHORTCUT_KEYS = [] as const;

export const PROTECTED_CONTENT_SCRIPT = '';

export function installProtectedContentGuards(_doc: Pick<Document, 'addEventListener'>): void {
    // No-op: selection and copying are permitted
}
