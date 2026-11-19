import {
    NAME_MAX_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    CODE_LENGTH,
    type AccountErrorCode,
    type AccountFieldIssue,
    type AccountFieldName,
} from './accountContract';

/*
 * Every account error and field problem in both app languages. The server sends codes, not
 * sentences, so the wording follows the learner's language setting rather than the server's.
 */

type Localize = (turkish: string, english: string) => string;

/** `1 dk 05 sn` / `45 sn`; a wait that is shown, not just stated. */
export function formatWait(seconds: number, l: Localize): string {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes === 0) return l(`${rest} sn`, `${rest} s`);
    return l(`${minutes} dk ${String(rest).padStart(2, '0')} sn`, `${minutes} min ${String(rest).padStart(2, '0')} s`);
}

export function accountErrorMessage(code: AccountErrorCode, l: Localize, retryAfter?: number | null): string {
    switch (code) {
        case 'invalid_input':
            return l('İşaretli alanları kontrol edin.', 'Check the highlighted fields.');
        case 'invalid_credentials':
            return l('E-posta veya şifre hatalı.', 'The email or password is incorrect.');
        case 'email_taken':
            return l(
                'Bu e-postayla zaten bir hesap var. Giriş yapmayı ya da şifrenizi yenilemeyi deneyin.',
                'An account already uses this email. Try signing in or resetting your password.',
            );
        case 'registration_closed':
            return l(
                'Yeni hesap oluşturma şu anda kapalı. Mevcut hesabınızla giriş yapabilirsiniz.',
                'New accounts are closed right now. You can still sign in with an existing account.',
            );
        case 'unverified':
            return l(
                'Devam etmek için e-postanıza gönderdiğimiz kodu girin.',
                'Enter the code we sent to your email to continue.',
            );
        case 'email_unavailable':
            return l(
                'E-posta şu anda gönderilemiyor. Biraz sonra yeniden deneyin.',
                'Email can’t be sent right now. Try again in a little while.',
            );
        case 'code_invalid':
            return l('Kod hatalı. Yeniden deneyin.', 'That code isn’t right. Try again.');
        case 'code_expired':
            return l(
                'Kodun süresi doldu ya da çok fazla deneme yapıldı. Yeni bir kod isteyin.',
                'The code has expired or had too many tries. Ask for a new one.',
            );
        case 'wrong_password':
            return l('Şifre hatalı.', 'The password is incorrect.');
        case 'google_failed':
            return l('Google ile giriş tamamlanamadı. Yeniden deneyin.', 'Signing in with Google didn’t finish. Try again.');
        case 'apple_failed':
            return l('Apple ile giriş tamamlanamadı. Yeniden deneyin.', 'Signing in with Apple didn’t finish. Try again.');
        case 'unauthorized':
            return l('Oturumunuzun süresi doldu. Yeniden giriş yapın.', 'Your session has ended. Sign in again.');
        case 'rate_limited':
            return retryAfter
                ? l(
                    `Çok fazla deneme yapıldı. ${formatWait(retryAfter, l)} sonra yeniden deneyin.`,
                    `Too many attempts. Try again in ${formatWait(retryAfter, l)}.`,
                )
                : l('Çok fazla deneme yapıldı. Biraz sonra yeniden deneyin.', 'Too many attempts. Try again in a little while.');
        case 'offline':
            return l(
                'Hesap sunucusuna ulaşılamadı. Bağlantınızı kontrol edin; kartlarınız ve çalışmanız bu cihazda kullanılmaya devam eder.',
                'Couldn’t reach the account server. Check your connection; your cards and study stay available on this device.',
            );
        case 'timeout':
            return l('Hesap sunucusu yanıt vermedi. Biraz sonra yeniden deneyin.', 'The account server didn’t respond. Try again in a little while.');
        case 'not_configured':
            return l('Hesaplar bu sürümde kullanılamıyor.', 'Accounts aren’t available in this version.');
        case 'not_found':
        case 'payload_too_large':
        case 'server_error':
        default:
            return l(
                'Hesap sunucusunda bir sorun oluştu. Biraz sonra yeniden deneyin.',
                'Something went wrong on the account server. Try again in a little while.',
            );
    }
}

export function accountFieldMessage(field: AccountFieldName, issue: AccountFieldIssue, l: Localize): string {
    switch (issue) {
        case 'required':
            if (field === 'name') return l('Adınızı yazın.', 'Enter your name.');
            if (field === 'email') return l('E-posta adresinizi yazın.', 'Enter your email address.');
            if (field === 'currentPassword') return l('Mevcut şifrenizi yazın.', 'Enter your current password.');
            if (field === 'password') return l('Şifrenizi yazın.', 'Enter your password.');
            if (field === 'code') return l(`${CODE_LENGTH} haneli kodu yazın.`, `Enter the ${CODE_LENGTH}-digit code.`);
            return l('Bu alanı doldurun.', 'Fill in this field.');
        case 'too_long':
            return l(`En fazla ${NAME_MAX_LENGTH} karakter kullanabilirsiniz.`, `Use at most ${NAME_MAX_LENGTH} characters.`);
        case 'email_invalid':
            return l('Geçerli bir e-posta adresi yazın.', 'Enter a valid email address.');
        case 'password_too_short':
            return l(`En az ${PASSWORD_MIN_LENGTH} karakter kullanın.`, `Use at least ${PASSWORD_MIN_LENGTH} characters.`);
        case 'password_too_long':
            return l(`En fazla ${PASSWORD_MAX_LENGTH} karakter kullanabilirsiniz.`, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);
        case 'password_common':
            return l('Bu şifre çok yaygın ve kolay tahmin edilir.', 'This password is too common and easy to guess.');
        case 'password_personal':
            return l('Şifreniz adınızı veya e-postanızı içermesin.', 'Keep your name and email out of your password.');
        case 'password_wrong':
            return field === 'currentPassword'
                ? l('Mevcut şifre hatalı.', 'The current password is incorrect.')
                : l('Şifre hatalı.', 'The password is incorrect.');
        case 'code_invalid':
            return l(`${CODE_LENGTH} haneli kodu doğru yazın.`, `Enter the ${CODE_LENGTH}-digit code correctly.`);
        case 'consent_required':
            return l(
                'Devam etmek için kullanım koşullarını ve gizlilik politikasını kabul edin.',
                'Accept the terms of use and privacy policy to continue.',
            );
        default:
            return l('Bu alanı kontrol edin.', 'Check this field.');
    }
}
