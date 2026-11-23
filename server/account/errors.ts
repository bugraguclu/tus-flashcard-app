import type { AccountErrorCode, AccountFieldIssues } from '../../lib/accountContract.ts';

/* The account service's errors: a code the app localizes, an HTTP status and optional details. */

/** Turkish defaults; the app shows its own localized text for each code. */
export const ERROR_MESSAGES: Record<AccountErrorCode, string> = {
    invalid_input: 'Bilgileri kontrol edip tekrar deneyin.',
    invalid_credentials: 'E-posta veya şifre hatalı.',
    email_taken: 'Bu e-posta adresiyle bir hesap zaten var. Giriş yapmayı veya şifrenizi yenilemeyi deneyin.',
    registration_closed: 'Yeni hesap oluşturma şu anda kapalı.',
    unverified: 'Önce e-posta adresinizi doğrulayın. Doğrulama kodunu e-postanıza gönderdik.',
    email_unavailable: 'E-posta şu anda gönderilemiyor. Biraz sonra tekrar deneyin.',
    code_invalid: 'Kod hatalı. Kontrol edip tekrar deneyin.',
    code_expired: 'Kodun süresi doldu veya çok fazla deneme yapıldı. Yeni bir kod isteyin.',
    wrong_password: 'Şifre hatalı.',
    unauthorized: 'Oturumunuz sona erdi. Tekrar giriş yapın.',
    rate_limited: 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.',
    not_found: 'İstenen işlem bulunamadı.',
    payload_too_large: 'İstek çok büyük.',
    server_error: 'Beklenmeyen bir sorun oluştu. Biraz sonra tekrar deneyin.',
    offline: 'Hesap sunucusuna ulaşılamıyor.',
    timeout: 'Hesap sunucusu zamanında yanıt vermedi.',
    not_configured: 'Hesap hizmeti yapılandırılmamış.',
    google_failed: 'Google ile giriş doğrulanamadı. Yeniden deneyin.',
    apple_failed: 'Apple ile giriş doğrulanamadı. Yeniden deneyin.',
    clock_ahead: 'Cihaz saati sunucunun saatinden çok ileride.',
    format_too_old: 'Eşitleme için uygulamayı güncelleyin.',
    device_unknown: 'Cihaz tanınmadı; yeniden kaydedilecek.',
    quota_exceeded: 'Hesabınızdaki eşitleme alanı doldu.',
    batch_expired: 'Gönderimin parçaları eksik; yeniden gönderilecek.',
};

export interface AccountErrorDetails {
    fields?: AccountFieldIssues;
    retryAfter?: number;
    email?: string;
}

export class AccountError extends Error {
    readonly code: AccountErrorCode;
    readonly status: number;
    readonly details: AccountErrorDetails;

    constructor(code: AccountErrorCode, status: number, message: string = ERROR_MESSAGES[code], details: AccountErrorDetails = {}) {
        super(message);
        this.name = 'AccountError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}
