// TusAnkiM website configuration switches — ported from belif boolean-switch architecture.

/** PUBLIC=false emits noindex on every page until custom domain go-live. */
export const PUBLIC = true;

/** Enable sponsor / partnership logos band once sponsorships are active. */
export const SHOW_SPONSORS = false;

/** Show launch-promo pricing cards & comparison highlight. */
export const SHOW_PRICING_PROMO = true;

/** Active pricing mode: 'launch-promo' (₺50/ay lansman teklifi + 200 kart/gün ücretsiz) | 'free-beta' */
export const PRICING_MODE: 'launch-promo' | 'free-beta' = 'launch-promo';

/** Publish /gizlilik/, /kullanim-kosullari/, /destek/ routes and footer links. */
export const LEGAL_PAGES = true;

export const SITE = {
  name: 'TusAnkiM',
  titleSuffix: 'TusAnkiM — TUS Aralıklı Tekrar ve Kart Sistemi',
  domain: 'tusankim.com',
  tagline: 'Sadece 9.575 kartla hayaline ulaş — biz yanındayız.',
  description:
    'TUS için yerel öncelikli, Anki uyumlu (.apkg/.colpkg) FSRS-6 aralıklı tekrar uygulaması. 9.575 doğrulanmış kart, son 6 TUS referans kanıtı, Kronometre ve puan hesaplayıcı.',
  disclaimer:
    'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir.',
  webAppUrl: 'https://tusankim.vercel.app/',
  githubIssuesUrl: 'https://github.com/bugraguclu/tus-flashcard-app/issues',
  // Replace with live App Store link once published; currently directs to iPhone/Web onboarding anchor.
  appStoreUrl: 'https://tusankim.vercel.app/',
  email: 'destek@tusankim.com',
} as const;

export const WHATSAPP = {
  enabled: true,
  // Replace phone number with live WhatsApp Business chatbot number before go-live.
  url: 'https://wa.me/905000000000?text=Merhaba%2C%20TusAnkiM%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.',
  displayHours: '7/24 Kesintisiz WhatsApp Chatbot + Ekip Desteği',
  clubApplicationUrl:
    'https://wa.me/905000000000?text=Merhaba%2C%20t%C4%B1p%20fak%C3%BCltesi%20kul%C3%BCb%C3%BC%20%2F%20sosyal%20medya%20%C3%BCcretsiz%20hesap%20program%C4%B1na%20ba%C5%9Fvurmak%20istiyorum.',
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
  {
    icon: 'whatsapp',
    name: 'WhatsApp 7/24',
    handle: '7/24 Destek Hattı',
    url: WHATSAPP.url,
  },
] as const;
