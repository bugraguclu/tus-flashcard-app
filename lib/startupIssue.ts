/**
 * Why startup has not reached the deck list: still running after its 30-second budget, or failed.
 * Owned here so the startup hook and the screen that explains it share one definition.
 */
export type StartupIssue = 'timeout' | 'failed';

/**
 * The one way on each state offers. A timed-out start is a migration still writing to the
 * collection, which opens the app by itself when it ends, so starting again would only race it:
 * its way on is to keep waiting. A failed start can be tried again. (A restore from backup is
 * deliberately not offered here.)
 */
export type StartupIssueAction = 'keepWaiting' | 'retry';

export interface StartupIssueView {
    title: string;
    message: string;
    action: StartupIssueAction;
    actionLabel: string;
}

type Localize = (turkish: string, english: string) => string;

/** The copy and the action for a startup issue (help.shell.startupError in the in-app guide). */
export function startupIssueView(issue: StartupIssue, l: Localize): StartupIssueView {
    if (issue === 'timeout') {
        return {
            title: l('Başlatma uzun sürüyor', 'Startup is taking longer than usual'),
            message: l(
                'Verileriniz hazırlanıyor. Büyük bir koleksiyonda bu birkaç dakika sürebilir; uygulamayı kapatmayın. Hazır olunca kendiliğinden açılır.',
                'Your data is being prepared. With a large collection this can take a few minutes; keep the app open. It opens by itself when ready.',
            ),
            action: 'keepWaiting',
            actionLabel: l('Beklemeye devam et', 'Keep waiting'),
        };
    }
    return {
        title: l('Beklenmeyen Bir Hata Oluştu', 'Something went wrong'),
        message: l(
            'Uygulama başlatılamadı. Verileriniz silinmedi. Tekrar deneyin; sorun sürerse uygulamayı kapatıp açın veya Ayarlar › Hakkında › Destek üzerinden bize yazın.',
            'The app could not start. Your data has not been deleted. Try again; if it keeps happening, close and reopen the app or write to us via Settings › About › Support.',
        ),
        action: 'retry',
        actionLabel: l('Tekrar dene', 'Try Again'),
    };
}
