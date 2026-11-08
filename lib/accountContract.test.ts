import { describe, expect, it } from 'vitest';
import {
    PASSWORD_MAX_LENGTH,
    isValidEmail,
    normalizeCode,
    normalizeEmail,
    normalizeName,
    passwordIssue,
    passwordStrength,
    validateCode,
    validatePasswordChange,
    validatePasswordReset,
    validateRegistration,
    validateSignIn,
} from './accountContract';

describe('account normalisation', () => {
    it('folds the Turkish capital İ to a plain i, not i plus a combining dot', () => {
        expect(normalizeEmail('  AYŞE.İnce@Örnek.COM ')).toBe('ayşe.ince@örnek.com');
        expect(normalizeEmail('İ')).toHaveLength(1);
    });

    it('keeps one space between name parts', () => {
        expect(normalizeName('  Ayşe \n  Yılmaz ')).toBe('Ayşe Yılmaz');
    });

    it('reads a pasted code with spaces or dashes as six digits', () => {
        expect(normalizeCode('482 913')).toBe('482913');
        expect(normalizeCode('482-913-77')).toBe('482913');
    });

    it('accepts ordinary addresses and refuses broken ones', () => {
        expect(isValidEmail('ogrenci@tip.edu.tr')).toBe(true);
        expect(isValidEmail('a.b+tus@x.co')).toBe(true);
        for (const bad of ['', 'ogrenci', 'a@b', 'a@.com', 'a@b.', 'a b@c.com', `${'x'.repeat(250)}@a.com`]) {
            expect(isValidEmail(bad)).toBe(false);
        }
    });
});

describe('password rules', () => {
    it('asks for eight characters, counted as a person counts them', () => {
        expect(passwordIssue('')).toBe('required');
        expect(passwordIssue('kısa1')).toBe('password_too_short');
        // Four emoji are four characters even though they are eight UTF-16 units.
        expect(passwordIssue('🙂🙂🙂🙂')).toBe('password_too_short');
        expect(passwordIssue('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe('password_too_long');
    });

    it('refuses the guesses an attacker tries first, whatever the case or Turkish letters', () => {
        for (const common of ['12345678', 'Password1', 'ŞİFRE123', 'galatasaray', 'aaaaaaaa', 'abcdefgh', '98765432', 'ababab12'.slice(0, 6) + 'ab']) {
            expect(passwordIssue(common)).toBe('password_common');
        }
    });

    it('refuses a name or address with only a few characters around it', () => {
        expect(passwordIssue('ayseyilmaz', { email: 'ayseyilmaz@x.com' })).toBe('password_personal');
        expect(passwordIssue('Yilmaz2026', { name: 'Ayşe Yılmaz' })).toBe('password_personal');
        expect(passwordIssue('ayşe1990', { name: 'Ayşe Yılmaz' })).toBe('password_personal');
        // Containing a short local part inside a long password is fine.
        expect(passwordIssue('information-overload', { email: 'info@example.com' })).toBeNull();
    });

    it('rates strength only once the rules are met', () => {
        expect(passwordStrength('')).toBe(0);
        expect(passwordStrength('12345678')).toBe(1);
        expect(passwordStrength('kalpkapak')).toBe(2);
        expect(passwordStrength('kalpkapakçok')).toBe(3);
        expect(passwordStrength('Kalp-Kapak-9')).toBe(4);
    });
});

describe('form validation', () => {
    it('names every missing sign-in field', () => {
        expect(validateSignIn({ email: '', password: '' })).toEqual({ email: 'required', password: 'required' });
        expect(validateSignIn({ email: 'not-an-email', password: 'x' })).toEqual({ email: 'email_invalid' });
        expect(validateSignIn({ email: 'a@b.co', password: 'x' })).toEqual({});
    });

    it('checks the whole registration, consent included', () => {
        expect(validateRegistration({ name: ' ', email: 'a@b', password: '123', consent: false })).toEqual({
            name: 'required',
            email: 'email_invalid',
            password: 'password_too_short',
            consent: 'consent_required',
        });
        expect(validateRegistration({ name: 'x'.repeat(81), email: 'a@b.co', password: 'Kalp-Kapak-9', consent: true }))
            .toEqual({ name: 'too_long' });
        expect(validateRegistration({ name: 'Ayşe', email: 'a@b.co', password: 'Kalp-Kapak-9', consent: true })).toEqual({});
    });

    it('validates codes and new passwords for reset and change', () => {
        expect(validateCode({ code: '' })).toEqual({ code: 'required' });
        expect(validateCode({ code: '12345' })).toEqual({ code: 'code_invalid' });
        expect(validateCode({ code: '123 456' })).toEqual({});
        expect(validatePasswordReset({ email: 'a@b.co', code: '123456', password: 'qwertyui' })).toEqual({ password: 'password_common' });
        expect(validatePasswordChange({ currentPassword: '', password: 'Kalp-Kapak-9' })).toEqual({ currentPassword: 'required' });
    });
});
