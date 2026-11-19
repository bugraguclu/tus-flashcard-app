import { describe, expect, it } from 'vitest';
import type { AccountErrorCode, AccountFieldIssue, AccountFieldName } from './accountContract';
import { accountErrorMessage, accountFieldMessage, formatWait } from './accountMessages';

const turkish = (tr: string) => tr;
const english = (_tr: string, en: string) => en;

const ERROR_CODES: AccountErrorCode[] = [
    'invalid_input', 'invalid_credentials', 'email_taken', 'registration_closed', 'unverified',
    'email_unavailable', 'code_invalid', 'code_expired', 'wrong_password', 'unauthorized',
    'rate_limited', 'not_found', 'payload_too_large', 'server_error', 'offline', 'timeout',
    'not_configured', 'google_failed',
];
const FIELD_ISSUES: AccountFieldIssue[] = [
    'required', 'too_long', 'email_invalid', 'password_too_short', 'password_too_long',
    'password_common', 'password_personal', 'password_wrong', 'code_invalid', 'consent_required',
];
const FIELDS: AccountFieldName[] = ['name', 'email', 'password', 'currentPassword', 'code', 'consent'];

describe('account wording', () => {
    it('words every error in both languages without leaking the code', () => {
        for (const code of ERROR_CODES) {
            for (const l of [turkish, english]) {
                const message = accountErrorMessage(code, l, 30);
                expect(message.length).toBeGreaterThan(8);
                expect(message).not.toContain(code);
            }
        }
    });

    it('gives each field problem a sentence', () => {
        for (const field of FIELDS) {
            for (const issue of FIELD_ISSUES) {
                expect(accountFieldMessage(field, issue, turkish)).toMatch(/\S/);
                expect(accountFieldMessage(field, issue, english)).toMatch(/\S/);
            }
        }
        expect(accountFieldMessage('currentPassword', 'password_wrong', turkish)).toBe('Mevcut şifre hatalı.');
    });

    it('states how long to wait', () => {
        expect(formatWait(45, turkish)).toBe('45 sn');
        expect(formatWait(65, english)).toBe('1 min 05 s');
        expect(accountErrorMessage('rate_limited', turkish, 65)).toContain('1 dk 05 sn');
    });
});
