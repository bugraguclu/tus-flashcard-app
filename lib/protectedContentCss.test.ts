import { describe, expect, it } from 'vitest';
import {
    PROTECTED_BLOCKED_EVENTS,
    PROTECTED_CONTENT_CSS,
    PROTECTED_CONTENT_SCRIPT,
    installProtectedContentGuards,
} from './protectedContentCss';

describe('protected content lockdown (disabled)', () => {
    it('does not disable selection, callouts or dragging on any node', () => {
        expect(PROTECTED_CONTENT_CSS).toBe('');
        expect(PROTECTED_CONTENT_SCRIPT).toBe('');
        expect(PROTECTED_BLOCKED_EVENTS).toHaveLength(0);
    });

    it('does not register any blocking listeners on the document', () => {
        const listeners: string[] = [];
        const fakeDoc = {
            addEventListener(type: string) {
                listeners.push(type);
            },
        };
        installProtectedContentGuards(fakeDoc);
        expect(listeners).toHaveLength(0);
    });
});
