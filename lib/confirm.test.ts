import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from 'react-native';
import { alert, confirm, confirmAsync, registerDialogHost, type DialogRequest } from './confirm';
import { setActiveLocale, translateActive } from './i18n';

/** The English Repair confirmation Settings wrote for a collection with one orphaned card. */
const LONG_APP_TEXT = [
    'Found:',
    'Orphaned cards: 1',
    'Notes without cards: 0',
    'Cards with a missing deck: 0',
    'Cards left with filtered-deck state: 0',
    'Cards with an invalid interval: 0',
    'New cards with an out-of-range position: 0',
    'Cards with an invalid due date: 0',
    'Cards with an invalid template ordinal: 0',
    'Cards keeping a stale pre-filter due: 0',
    'Cards with a wrong last review time: 0',
    'Unreadable notes: 0',
    '',
    'Orphaned cards will be deleted; notes without cards get their first card back, and cards whose deck is gone will be rescued. No note text is deleted.',
    '',
    'The database is then compacted and its indexes and search index refreshed. A safety backup will be created first.',
].join('\n');

describe('dialog text', () => {
    afterEach(() => setActiveLocale('tr'));

    it('shows a long message the app wrote in full: a confirmation and its result', async () => {
        Platform.OS = 'web';
        setActiveLocale('en');
        expect(LONG_APP_TEXT.length).toBeGreaterThan(600);
        const requests: DialogRequest[] = [];
        const unregister = registerDialogHost((next) => { requests.push(next); });
        try {
            const accepted = confirmAsync('Repair and Optimize Database', LONG_APP_TEXT, { destructive: true });
            requests[0].onAccept?.();
            await accepted;
            alert('Optimization Complete', `${LONG_APP_TEXT}\n\nRecovery copy: tus-backup-2026-11-08-120000000.json.`);
            confirm('Delete Empty Cards', LONG_APP_TEXT, () => {}, { destructive: true });

            expect(requests.map((request) => request.message)).toEqual([
                LONG_APP_TEXT,
                `${LONG_APP_TEXT}\n\nRecovery copy: tus-backup-2026-11-08-120000000.json.`,
                LONG_APP_TEXT,
            ]);
        } finally {
            unregister();
        }
    });

    it('still keeps raw diagnostics out of a dialog', () => {
        Platform.OS = 'web';
        setActiveLocale('en');
        const requests: DialogRequest[] = [];
        const unregister = registerDialogHost((next) => { requests.push(next); });
        try {
            alert('Error', 'TypeError: undefined is not an object (evaluating \'card.id\')');
            alert('Error', 'Error\n    at saveCard (/app/editor.tsx:12:4)');
            expect(requests.map((request) => request.message)).toEqual([
                translateActive('common.genericError'),
                translateActive('common.genericError'),
            ]);
        } finally {
            unregister();
        }
    });
});

const originalPlatform = Platform.OS;

afterEach(() => {
    Platform.OS = originalPlatform;
});

describe('confirmAsync', () => {
    it('resolves false when a destructive confirmation is cancelled', async () => {
        Platform.OS = 'web';
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });
        try {
            const result = confirmAsync('Replace', 'Everything changes', { destructive: true });
            expect(request).toMatchObject({ kind: 'confirm', destructive: true });
            request!.onCancel?.();
            await expect(result).resolves.toBe(false);
        } finally {
            unregister();
        }
    });

    it('resolves true only after explicit acceptance', async () => {
        Platform.OS = 'web';
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });
        try {
            const result = confirmAsync('Replace', 'Everything changes', { destructive: true });
            request!.onAccept?.();
            await expect(result).resolves.toBe(true);
        } finally {
            unregister();
        }
    });
});

describe('confirm', () => {
    it('hands the confirm button its own verb, and runs the action only on acceptance', () => {
        Platform.OS = 'web';
        let request: DialogRequest | null = null;
        let cleared = 0;
        const unregister = registerDialogHost((next) => { request = next; });
        try {
            confirm('Clear the page?', 'Everything on it goes.', () => { cleared += 1; }, { destructive: true, confirmLabel: 'Clear' });
            expect(request).toMatchObject({ kind: 'confirm', destructive: true, acceptLabel: 'Clear' });
            expect(cleared).toBe(0);
            request!.onAccept?.();
            expect(cleared).toBe(1);
        } finally {
            unregister();
        }
    });
});
