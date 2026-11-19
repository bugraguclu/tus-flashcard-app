import { describe, expect, it } from 'vitest';
import {
    accountInitials,
    nameFromEmail,
    parseCodeSent,
    parseEvents,
    parseServiceConfig,
    parseStoredSession,
    shouldOfferFirstRunPrompt,
} from './accountSession';

const user = { id: 'u1', name: 'Ayşe Yılmaz', email: 'ayse@example.com', emailVerified: true, createdAt: '2026-11-08T10:00:00.000Z', hasPassword: true, google: false };

describe('stored session', () => {
    it('round-trips a session and drops anything malformed', () => {
        const stored = { token: 'abc', user, expiresAt: '2027-01-01T00:00:00.000Z' };
        expect(parseStoredSession(JSON.stringify(stored))).toEqual(stored);
        expect(parseStoredSession('{')).toBeNull();
        expect(parseStoredSession(JSON.stringify({ ...stored, token: '' }))).toBeNull();
        expect(parseStoredSession(JSON.stringify({ ...stored, user: { ...user, emailVerified: 'yes' } }))).toBeNull();
    });
});

describe('server replies', () => {
    it('reads the service configuration and fills optional text', () => {
        expect(parseServiceConfig({ registrationOpen: true, emailReady: false, emailVerificationRequired: false })).toEqual({
            registrationOpen: true,
            emailReady: false,
            emailVerificationRequired: false,
            googleSignIn: false,
            policyVersion: '',
            operatorName: '',
            contactEmail: '',
        });
        expect(parseServiceConfig({ registrationOpen: 'yes' })).toBeNull();
    });

    it('rounds the resend wait and refuses replies without a verdict', () => {
        expect(parseCodeSent({ sent: true, retryAfter: 59.4 })).toEqual({ sent: true, retryAfter: 59 });
        expect(parseCodeSent({ sent: true })).toEqual({ sent: true, retryAfter: 0 });
        expect(parseCodeSent({ retryAfter: 1 })).toBeNull();
    });

    it('keeps only known activity events', () => {
        expect(parseEvents({ events: [
            { type: 'signed_in', createdAt: '2026-11-08T10:00:00.000Z' },
            { type: 'hacked', createdAt: '2026-11-08T10:00:00.000Z' },
            'nonsense',
        ] })).toEqual([{ type: 'signed_in', createdAt: '2026-11-08T10:00:00.000Z' }]);
        expect(parseEvents(null)).toEqual([]);
    });
});

describe('avatar initials', () => {
    it('takes the first and last name, in Turkish capitals', () => {
        expect(accountInitials({ name: 'ayşe nur yılmaz', email: 'a@b.co' })).toBe('AY');
        expect(accountInitials({ name: 'ismail', email: 'a@b.co' })).toBe('İ');
        expect(accountInitials({ name: '', email: 'zeynep@b.co' })).toBe('ZE');
    });
});

describe('first-run welcome', () => {
    const base = { enabled: true, signedIn: false, promptResolved: false, collectionHasNotes: false };

    it('greets a new, empty installation once', () => {
        expect(shouldOfferFirstRunPrompt(base)).toBe(true);
        expect(shouldOfferFirstRunPrompt({ ...base, promptResolved: true })).toBe(false);
    });

    it('never stops someone who already studies here, is signed in, or has no server', () => {
        expect(shouldOfferFirstRunPrompt({ ...base, collectionHasNotes: true })).toBe(false);
        expect(shouldOfferFirstRunPrompt({ ...base, signedIn: true })).toBe(false);
        expect(shouldOfferFirstRunPrompt({ ...base, enabled: false })).toBe(false);
    });
});

describe('name from email', () => {
    it('turns the local part into words', () => {
        expect(nameFromEmail('ayse.yilmaz@example.com')).toBe('Ayse Yilmaz');
        expect(nameFromEmail('  mehmet_kaya+tus@example.com ')).toBe('Mehmet Kaya Tus');
        expect(nameFromEmail('ilker@example.com')).toBe('İlker');
    });

    it('never returns an empty or overlong name', () => {
        expect(nameFromEmail('..@example.com')).toBe('TusAnkiM');
        expect(nameFromEmail('')).toBe('TusAnkiM');
        expect(nameFromEmail(`${'a'.repeat(200)}@example.com`).length).toBeLessThanOrEqual(80);
    });
});
