// Shared website identity and publication settings.

/** PUBLIC=false emits noindex on every page until custom domain go-live. */
export const PUBLIC = true;

/** Show the 3-segment pricing cards (website/src/data/offer.json). */
export const SHOW_PRICING_PROMO = true;

/** Active pricing mode: 'three-segment' (₺0 ara ara reklam, ₺1.000 tüm kartlar, ₺50 reklam kaldırma) | 'free-beta' */
export const PRICING_MODE: 'three-segment' | 'free-beta' = 'three-segment';

/** Current access and future pricing are deliberately separate. */
export const ACCESS = {
  betaDescription: 'Güncel beta sürümünde TUS paketi ücretsiz açılır. Ödeme veya kart bilgisi gerekmez.',
  plannedLaunchDescription: 'Erişim modeli: ücretsiz kullanım (ara ara reklam), tüm 9.575 karta erişim ₺1.000, reklamları kaldırma ₺50. Ücretli seçenekler ve reklamlar henüz devrede değil.',
} as const;

/** Publish /gizlilik/, /kullanim-kosullari/, /destek/ routes and footer links. */
export const LEGAL_PAGES = true;

const webAppUrl = 'https://tusankim.vercel.app/uygulama/';

export const SITE = {
  name: 'TusAnkiM',
  titleSuffix: 'TusAnkiM — TUS Aralıklı Tekrar ve Kart Sistemi',
  domain: 'tusankim.com',
  tagline: 'TUS için günlük kart tekrarı.',
  description:
    'TUS için 9.575 hazır kart, FSRS-6 aralıklı tekrar ve çalışma takibi. iPhone için geliştirilen TusAnkiM’i tarayıcıda ücretsiz dene.',
  disclaimer:
    'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir.',
  webAppUrl,
  githubIssuesUrl: 'https://github.com/bugraguclu/tus-flashcard-app/issues',
  // Replace with live App Store link once published; currently directs to iPhone/Web onboarding anchor.
  appStoreUrl: webAppUrl,
  email: 'destek@tusankim.com',
} as const;

export const SOCIAL = [
  {
    icon: 'instagram',
    name: 'Instagram',
    handle: '@tusankim',
    url: 'https://www.instagram.com/tusankim/',
  },
  {
    icon: 'youtube',
    name: 'YouTube',
    handle: '@tusankim',
    url: 'https://www.youtube.com/@tusankim',
  },
] as const;
