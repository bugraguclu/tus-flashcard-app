import { CODE_TTL_MINUTES } from '../../lib/accountContract.ts';
import type { AccountLocale } from '../../lib/accountContract.ts';
import type { ServerConfig } from './config.ts';
import { sendSmtp } from './smtp.ts';
import type { CodePurpose } from './store.ts';

/*
 * Code mail. SMTP in production; in development the code is printed to the console instead, so
 * the whole flow can be tried without a mail account. Without either, the server says e-mail is
 * not ready and the app hides what depends on it.
 */

export interface OutgoingMail {
    to: string;
    subject: string;
    text: string;
    html: string;
    /** Only the development outbox reads these, to print the code. */
    purpose: CodePurpose;
    code: string;
}

export type MailerMode = 'smtp' | 'dev-outbox' | 'disabled';

export interface Mailer {
    readonly ready: boolean;
    readonly mode: MailerMode;
    send(mail: OutgoingMail): Promise<void>;
}

export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: unknown): void;
}

export function createMailer(config: Pick<ServerConfig, 'smtp' | 'devOutbox'>, log: Logger): Mailer {
    const smtp = config.smtp;
    if (smtp) {
        return {
            ready: true,
            mode: 'smtp',
            send: (mail) => sendSmtp(
                {
                    host: smtp.host,
                    port: smtp.port,
                    user: smtp.user,
                    password: smtp.password,
                    startTls: smtp.startTls,
                    implicitTls: smtp.implicitTls,
                    clientName: smtp.clientName,
                },
                { from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html },
            ),
        };
    }
    if (config.devOutbox) {
        return {
            ready: true,
            mode: 'dev-outbox',
            send: async (mail) => {
                log.info(`[account dev outbox] to=${mail.to} purpose=${mail.purpose} code=${mail.code}`);
            },
        };
    }
    return {
        ready: false,
        mode: 'disabled',
        send: async () => {
            throw new Error('E-mail is not configured');
        },
    };
}

// --- Code mail ------------------------------------------------------------------------------

const COPY = {
    tr: {
        verify: {
            subject: (code: string) => `${code} · TusAnkiM doğrulama kodunuz`,
            heading: 'E-posta adresinizi doğrulayın',
            lead: 'TusAnkiM hesabınızı doğrulamak için bu kodu uygulamaya girin:',
            ignore: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; hesabınızda bir şey değişmez.',
        },
        reset: {
            subject: (code: string) => `${code} · TusAnkiM şifre yenileme kodunuz`,
            heading: 'Şifrenizi yenileyin',
            lead: 'TusAnkiM şifrenizi yenilemek için bu kodu uygulamaya girin:',
            ignore: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.',
        },
        greeting: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
        validity: `Kod ${CODE_TTL_MINUTES} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
        footer: 'Kartlarınız ve çalışma geçmişiniz cihazınızda kalır; bu e-posta yalnızca hesabınızla ilgilidir.',
    },
    en: {
        verify: {
            subject: (code: string) => `${code} · your TusAnkiM verification code`,
            heading: 'Verify your e-mail address',
            lead: 'Enter this code in the app to verify your TusAnkiM account:',
            ignore: 'If you did not ask for this, you can ignore this e-mail; nothing changes in your account.',
        },
        reset: {
            subject: (code: string) => `${code} · your TusAnkiM password reset code`,
            heading: 'Reset your password',
            lead: 'Enter this code in the app to reset your TusAnkiM password:',
            ignore: 'If you did not ask for this, you can ignore this e-mail; your password stays the same.',
        },
        greeting: (name: string) => (name ? `Hi ${name},` : 'Hi,'),
        validity: `The code is valid for ${CODE_TTL_MINUTES} minutes and works once.`,
        footer: 'Your cards and study history stay on your device; this e-mail is only about your account.',
    },
} as const;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** `482913` → `482 913`: easier to read off one screen and type into another. */
export function spacedCode(code: string): string {
    return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function codeMail(input: { purpose: CodePurpose; code: string; name: string; locale: AccountLocale }): {
    subject: string;
    text: string;
    html: string;
} {
    const copy = COPY[input.locale] ?? COPY.tr;
    const purpose = copy[input.purpose];
    const greeting = copy.greeting(input.name.trim());
    const code = spacedCode(input.code);
    const text = [
        greeting,
        '',
        purpose.lead,
        '',
        `    ${code}`,
        '',
        copy.validity,
        purpose.ignore,
        '',
        '— TusAnkiM',
    ].join('\n');
    const html = `<!doctype html>
<html lang="${input.locale}">
<body style="margin:0;padding:0;background:#eef6f2;">
<div style="padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2c3e36;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d8ebe4;border-radius:16px;padding:32px 28px;">
    <p style="margin:0 0 24px;font-size:15px;font-weight:700;letter-spacing:-0.2px;color:#2e8264;">TusAnkiM</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#2c3e36;">${escapeHtml(purpose.heading)}</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#556b62;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#556b62;">${escapeHtml(purpose.lead)}</p>
    <p style="margin:0 0 20px;padding:16px;border-radius:12px;background:#f0f7f4;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#2c3e36;">${escapeHtml(code)}</p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#556b62;">${escapeHtml(copy.validity)}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#556b62;">${escapeHtml(purpose.ignore)}</p>
  </div>
  <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#7f9a8f;text-align:center;">${escapeHtml(copy.footer)}</p>
</div>
</body>
</html>`;
    return { subject: purpose.subject(input.code), text, html };
}
