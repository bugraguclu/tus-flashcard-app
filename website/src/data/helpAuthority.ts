export interface AuthoritySource {
  label: string;
  url: string;
  publisher: string;
}

export interface HelpAuthority {
  sources: AuthoritySource[];
  terminologyNote?: string;
}

const ANKI_INTRO: AuthoritySource = {
  label: 'Anki Resmî Kullanım Kılavuzu — Giriş ve Temel Kavramlar',
  url: 'https://docs.ankiweb.net/intro.html',
  publisher: 'Anki Manual',
};

const ANKIMOBILE_HOME: AuthoritySource = {
  label: 'AnkiMobile Resmî iOS / iPadOS Kılavuzu',
  url: 'https://docs.ankimobile.net/',
  publisher: 'AnkiMobile Manual',
};

const OSYM_TUS_HOME: AuthoritySource = {
  label: 'ÖSYM — Tıpta Uzmanlık Eğitimi Giriş Sınavı (TUS) Duyuru ve Kılavuzları',
  url: 'https://www.osym.gov.tr/TR,14991/tipta-uzmanlik-egitimi-giris-sinavi.html',
  publisher: 'ÖSYM',
};

const OSYM_TUS_ARCHIVE: AuthoritySource = {
  label: 'ÖSYM — TUS Çıkmış Sınav Soruları Arşivi',
  url: 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html',
  publisher: 'ÖSYM',
};

const TUS_YOM: AuthoritySource = {
  label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (Resmî Gazete, 3 Eylül 2022)',
  url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
  publisher: 'Resmî Gazete',
};

const FSRS_KDD_PAPER: AuthoritySource = {
  label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
  url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
  publisher: 'ACM Digital Library',
};

const FSRS_WIKI: AuthoritySource = {
  label: 'FSRS-6 Algoritma Şartnamesi ve Güç Unutma Eğrisi (awesome-fsrs)',
  url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
  publisher: 'Open Spaced Repetition',
};

const FSRS_RS: AuthoritySource = {
  label: 'fsrs-rs Referans Gerçekleştirimi ve Parametre Sınırları',
  url: 'https://github.com/open-spaced-repetition/fsrs-rs',
  publisher: 'Open Spaced Repetition',
};

const OWASP_MASVS: AuthoritySource = {
  label: 'OWASP MASVS — Mobil Uygulama Güvenlik Doğrulama Standardı',
  url: 'https://mas.owasp.org/MASVS/',
  publisher: 'OWASP Foundation',
};

export const HELP_AUTHORITY: Record<string, HelpAuthority> = {
  welcome: {
    sources: [ANKI_INTRO, ANKIMOBILE_HOME, OWASP_MASVS],
  },
  concepts: {
    sources: [ANKI_INTRO, FSRS_KDD_PAPER, FSRS_WIKI],
  },
  'quick-start': {
    sources: [OSYM_TUS_HOME, ANKI_INTRO, ANKIMOBILE_HOME],
  },
  decks: {
    sources: [
      {
        label: 'AnkiMobile Deste Listesi ve Davranış Semantiği',
        url: 'https://docs.ankimobile.net/deck-list.html',
        publisher: 'AnkiMobile Manual',
      },
      {
        label: 'Anki Deste Seçenekleri ve Ön Ayarlar',
        url: 'https://docs.ankiweb.net/deck-options.html',
        publisher: 'Anki Manual',
      },
    ],
  },
  studying: {
    sources: [
      {
        label: 'AnkiMobile Çalışma Ekranı Kılavuzu',
        url: 'https://docs.ankimobile.net/study-screen.html',
        publisher: 'AnkiMobile Manual',
      },
      {
        label: 'AnkiMobile Çalışma Araçları',
        url: 'https://docs.ankimobile.net/study-tools.html',
        publisher: 'AnkiMobile Manual',
      },
    ],
  },
  'deck-options': {
    sources: [
      {
        label: 'Anki Deste Seçenekleri ve Günlük Sınırlar',
        url: 'https://docs.ankiweb.net/deck-options.html',
        publisher: 'Anki Manual',
      },
      FSRS_WIKI,
    ],
  },
  fsrs: {
    sources: [
      FSRS_KDD_PAPER,
      FSRS_WIKI,
      FSRS_RS,
      {
        label: 'Anki Deste Seçenekleri — FSRS Bölümü',
        url: 'https://docs.ankiweb.net/deck-options.html',
        publisher: 'Anki Manual',
      },
    ],
  },
  editing: {
    sources: [
      {
        label: 'Anki Not Ekleme ve Düzenleme Kılavuzu',
        url: 'https://docs.ankiweb.net/editing.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'AnkiMobile Not Düzenleme Kılavuzu',
        url: 'https://docs.ankimobile.net/editing.html',
        publisher: 'AnkiMobile Manual',
      },
    ],
  },
  'note-types': {
    sources: [
      {
        label: 'Anki Kart Oluşturma ve Şablon Silme Kuralları',
        url: 'https://docs.ankiweb.net/templates/generation.html#card-generation--deletion',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki Not Türü Ekleme ve Düzenleme',
        url: 'https://docs.ankiweb.net/editing.html#adding-a-note-type',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki MathJax Desteği',
        url: 'https://docs.ankiweb.net/math.html#mathjax',
        publisher: 'Anki Manual',
      },
    ],
  },
  browser: {
    sources: [
      {
        label: 'Anki Kart Tarayıcısı — Tablo Kipleri ve Arama',
        url: 'https://docs.ankiweb.net/browsing.html#table-modes',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki Tarayıcıda Bul ve Değiştir',
        url: 'https://docs.ankiweb.net/browsing.html#find-and-replace',
        publisher: 'Anki Manual',
      },
    ],
  },
  'filtered-decks': {
    sources: [
      {
        label: 'Anki Filtrelenmiş Desteler ve Özel Çalışma',
        url: 'https://docs.ankiweb.net/filtered-decks.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki Deste Seçenekleri — Tekrar Planlama',
        url: 'https://docs.ankiweb.net/deck-options.html',
        publisher: 'Anki Manual',
      },
    ],
  },
  statistics: {
    sources: [
      {
        label: 'Anki İstatistikler ve Doğru Hatırlama Oranı (True Retention)',
        url: 'https://docs.ankiweb.net/manual/stats',
        publisher: 'Anki Manual',
      },
      FSRS_KDD_PAPER,
    ],
  },
  stopwatch: {
    sources: [
      OSYM_TUS_HOME,
      {
        label: 'Apple UserNotifications — Yerel Çalışma Hatırlatıcıları',
        url: 'https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app',
        publisher: 'Apple Developer',
      },
      TUS_YOM,
    ],
  },
  'import-export': {
    sources: [
      {
        label: 'Anki Metin Dosyası (.csv / .tsv) İçe Aktarma Biçimi',
        url: 'https://docs.ankiweb.net/importing/text-files.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki Paket Dışa Aktarma (.apkg ve .colpkg)',
        url: 'https://docs.ankiweb.net/exporting.html#collection-colpkg',
        publisher: 'Anki Manual',
      },
      {
        label: 'SQLite Veritabanı Dosya Biçimi Şartnamesi',
        url: 'https://www.sqlite.org/fileformat2.html#file_format_version_numbers',
        publisher: 'SQLite',
      },
    ],
  },
  backups: {
    sources: [
      {
        label: 'Anki Koleksiyon Bütünlük Denetimi ve Dosya Yönetimi',
        url: 'https://docs.ankiweb.net/files.html#checking-your-collection',
        publisher: 'Anki Manual',
      },
      {
        label: 'Apple NSFileProtectionComplete Veri Koruma Politikası',
        url: 'https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.default-data-protection',
        publisher: 'Apple Developer',
      },
      OWASP_MASVS,
    ],
  },
  settings: {
    sources: [
      {
        label: 'AnkiMobile Tercihler ve Dokunma Alanları',
        url: 'https://docs.ankimobile.net/preferences.html',
        publisher: 'AnkiMobile Manual',
      },
      {
        label: 'Anki Genel Tercihler (Timebox ve Öğrenme Sınırı)',
        url: 'https://docs.ankiweb.net/preferences.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'Apple iOS Sesli Konuşma Kalitesi (AVSpeechSynthesisVoiceQuality)',
        url: 'https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality',
        publisher: 'Apple Developer',
      },
    ],
  },
  'tus-cards': {
    sources: [OSYM_TUS_ARCHIVE, OSYM_TUS_HOME, TUS_YOM],
    terminologyNote:
      'Terminoloji notu: Katalog 12 dersten oluşur (11 TUS branş destesi + 806 karma kartlık Deneme ve Soru destesi); katalogda Fizyoloji-Histoloji-Embriyoloji dersi kısaca FHE adıyla listelenir. ÖSYM çıkmış soru referans analizleri ise Deneme ve Soru hariç 11 resmî TUS branşı üzerinden hesaplanır.',
  },
  automation: {
    sources: [
      {
        label: 'AnkiMobile URL Şemaları ve Kestirmeler (Shortcuts)',
        url: 'https://docs.ankimobile.net/url-schemes.html',
        publisher: 'AnkiMobile Manual',
      },
      {
        label: 'Apple Shortcuts — INUIAddVoiceShortcutViewController',
        url: 'https://developer.apple.com/documentation/intentsui/inuiaddvoiceshortcutviewcontroller',
        publisher: 'Apple Developer',
      },
    ],
  },
  anki: {
    sources: [
      ANKI_INTRO,
      {
        label: 'Anki Paket ve Koleksiyon Dışa Aktarma (.apkg / .colpkg)',
        url: 'https://docs.ankiweb.net/exporting.html#collection-colpkg',
        publisher: 'Anki Manual',
      },
      ANKIMOBILE_HOME,
    ],
  },
  faq: {
    sources: [
      ANKI_INTRO,
      OSYM_TUS_HOME,
      {
        label: 'OWASP İçerik Güvenlik Politikası (CSP) Rehberi',
        url: 'https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html',
        publisher: 'OWASP Foundation',
      },
    ],
  },
  glossary: {
    sources: [
      ANKI_INTRO,
      FSRS_WIKI,
      {
        label: 'W3C WAI-ARIA Erişilebilirlik Desenleri (APG)',
        url: 'https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/',
        publisher: 'W3C WAI',
      },
    ],
  },
};

export function getHelpAuthority(id: string): HelpAuthority {
  const entry = HELP_AUTHORITY[id];
  if (!entry) {
    throw new Error(`Missing helpAuthority entry for guide id "${id}"`);
  }
  return entry;
}
