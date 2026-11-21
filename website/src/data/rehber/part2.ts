import type { RehberArticle } from './types';

export const REHBER_PART_2: RehberArticle[] = [
  {
    slug: '2027-tus-tarihleri-ve-calisma-plani',
    order: 5,
    tone: 'Markasız',
    questionH1: '2027 TUS tarihleri, başvuru takvimi ve kalan güne göre çalışma planı',
    seoTitle: '2027 TUS Tarihleri & Kalan Güne Göre Çalışma Planı | TusAnkiM',
    seoDescription:
      '2027-TUS 1. Dönem (27 Mart 2027) ve 2. Dönem (22 Ağustos 2027) başvuru, sınav ve sonuç tarihleri ile 120–365 günlük gerçekçi kart/tekrar planı.',
    directAnswer:
      'ÖSYM 2027 takvimine göre 2027-TUS 1. Dönem 27 Mart 2027’de (başvuru 2–10 Şubat 2027), 2027-TUS 2. Dönem ise 22 Ağustos 2027’de (başvuru 5–13 Temmuz 2027) yapılacaktır. Kalan güne göre günde 40–80 yeni kart temposu seçilerek sınav öncesi son 30–60 gün deneme tekrarlarına ayrılabilir.',
    whyMisconceived: [
      'Adaylar çalışma planını çoğu zaman “tüm kitapları 3 kez baştan sona okumak” üzerinden kurar ve başvuru ayı geldiğinde kaçıncı tekrarda olduklarını ölçemedikleri için panik yaşar.',
      'Bir diğer yaygın hata ise sınava 4 ay (120 gün) kaldığında da 12 aylık (365 gün) bir hazırlıkla aynı miktarda yeni kaynak ve kart açmaya çalışmaktır.',
      'Oysa kalan süre kısaldıkça günlük yeni içerik ile günlük pekiştirme tekrarının dengesi değişir; ölçülebilir bir günlük kota olmadan son ay yığılması kaçınılmaz olur.',
    ],
    truthParagraphs: [
      'Resmî ÖSYM takvimine göre 2027 yılında iki TUS dönemi bulunuyor: 1. Dönem sınavı 27 Mart 2027 (sonuç 22 Nisan 2027), 2. Dönem sınavı ise 22 Ağustos 2027 (sonuç 16 Eylül 2027). Yabancı dil şartı için TIPDİL veya YDS takvimini bu başvuru pencerelerinden önce tamamlamak gerekir.',
      'Kalan gün sayısını FSRS-6 simülasyon matrisiyle eşleştirdiğimizde somut eşikler ortaya çıkar: 9.575 kartlık çekirdek havuz için günde 40 yeni kart açan bir aday tüm kartları 240 günde tamamlar; 270 günlük pencerede ortalama günlük yük 298 kart (93 dk) olur. Günde 60 yeni kart temposunda ise yeni kartlar 160 günde biter; 180 günlük veya 270 günlük programda son aylar deneme eksiklerine kalır.',
      'Sınavına 120 gün kalan bir aday ise tüm havuzu sıfırdan açmak yerine günde 80 yeni kart temposuyla 120 günde tamamlayabilir (ortalama 157 dk/gün) ya da daha gerçekçi olarak yalnızca zayıf olduğu Temel/Klinik derslere (ör. Temel 3.957 kart = günde 40 yeni ile 99 gün; Klinik 4.812 kart = günde 60 yeni ile 81 gün) odaklanabilir.',
    ],
    table: {
      caption: '2027 ÖSYM TUS sınav takvimi ve hazırlık süresine göre önerilen çalışma temposu',
      headers: ['Dönem / Ufuk', 'Resmî Tarih / Tempo', 'Önerilen Kapsam', 'Tahmini Günlük Yük (FSRS-6)'],
      rows: [
        ['2027-TUS 1. Dönem', '27 Mart 2027 (Başvuru: 2–10 Şubat)', 'Sonuç: 22 Nisan 2027', 'ÖSYM resmî takvimi'],
        ['2027-TUS 2. Dönem', '22 Ağustos 2027 (Başvuru: 5–13 Temmuz)', 'Sonuç: 16 Eylül 2027', 'ÖSYM resmî takvimi'],
        ['120 Gün (4 Ay)', '80 yeni/gün veya tek grup (40–60/gün)', 'Öncelikli zayıf branşlar + çıkmış sorular', 'Tek grup ~110–140 dk/gün'],
        ['180 Gün (6 Ay)', '60 yeni kart / gün', '9.575 kart 160. günde biter', 'Ort. 388 kart (~124 dk/gün)'],
        ['270 Gün (9 Ay)', '40–60 yeni kart / gün', 'Tam çekirdek + 2. tur deneme tekrarları', 'Ort. 298–331 kart (~93–102 dk/gün)'],
        ['365 Gün (12 Ay)', '40 yeni kart / gün', '240. günde biter; son 4 ay deneme odaklı', 'Ort. 266 kart (~81 dk/gün)'],
      ],
    },
    actionSteps: [
      'ÖSYM’nin duyuru portalından güncel 2027 sınav ve TIPDİL/YDS tarihlerini takvimine işaretle; tarih güncellemelerini resmî siteden takip et.',
      'Sınav tarihine göre kalan gün sayısını hesapla ve günde ayırabileceğin net süreyi (ör. 90–120 dk kart + kalan süre soru/konu) belirle.',
      'Kronometre ve Çalışma Planı kullanarak yalnızca kart tekrarını değil, deneme çözme ve konu okuma saatlerini tek haftalık hedefe bağla.',
      'Sınavdan 30 gün önce yeni kart açılımını azaltıp yalnızca vadesi gelen tekrarlara ve yanlış soru analizine geç.',
    ],
    boundaryNote:
      '2027 sınav, başvuru ve sonuç tarihleri ÖSYM takvim esaslarına göre verilmiştir; ÖSYM olağanüstü durumlarda tarih değişikliği yapabilir. Güncel duyurular için daima osym.gov.tr kontrol edilmelidir.',
    sources: [
      {
        label: 'ÖSYM Resmî Portal ve Sınav Takvimi',
        url: 'https://www.osym.gov.tr/',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM — Tıpta Uzmanlık Eğitimi Giriş Sınavı (TUS) Duyuruları',
        url: 'https://www.osym.gov.tr/TR,14991/tipta-uzmanlik-egitimi-giris-sinavi.html',
        publisher: 'ÖSYM',
      },
      {
        label: 'FSRS-6 Algoritma Şartnamesi',
        url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
        publisher: 'Open Spaced Repetition',
      },
    ],
    relatedLinks: [
      { label: 'TUS Puan ve Hedef Net Hesaplayıcı', href: '/puan-hesapla/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'Kronometre ve çalışma takvimi rehberi', href: '/yardim/kronometre/' },
    ],
    keywords: '2027 tus tarihleri başvuru takvimi mart ağustos çalışma planı',
  },
  {
    slug: 'tus-calisirken-dogru-bilinen-7-yanlis',
    order: 6,
    tone: 'Markasız',
    questionH1: 'TUS çalışırken doğru bilinen 7 yanlış (pasif tekrar, mega deste tuzağı, son ay tekrar yükü)',
    seoTitle: 'TUS Çalışırken Doğru Bilinen 7 Yanlış | TusAnkiM',
    seoDescription:
      'Pasif okuma, mega deste biriktirme, konu kapsamını çözüm desteği sanma ve son ay tekrar yığılması gibi TUS hazırlığında sık yapılan 7 hatanın doğruları.',
    directAnswer:
      'TUS’ta puan kaybının en sık nedeni az çalışmak değil; pasif tekrar okuma, bitmeyecek kadar büyük mega desteler seçme, “konu kartı var” ölçüsünü “soru çözdürür” sanma ve son aya kontrolsüz tekrar yükü biriktirmektir. Bu 7 yaygın yanlışı aktif hatırlama ve ölçülü tempo ile düzeltebilirsin.',
    whyMisconceived: [
      'Tıp fakültesi sınavlarında son hafta kalın ders notlarını birkaç kez hızlıca okuyup geçmek çoğu zaman işe yarar; ancak 11 branşın tamamını tek günde ölçen TUS’ta bu kısa süreli bellek stratejisi çalışmaz.',
      'Ayrıca reklam ve forum söylemlerinde sıkça “%97 referans” veya “30.000 kart” gibi mutlak büyüklükler başarı ölçütü gibi sunulur; oysa bilişsel psikoloji araştırmaları ve sınav veri analizleri tersini gösterir.',
    ],
    truthParagraphs: [
      'İlk büyük yanılgı pasif tekrar okumaktır: altını çizdiğin sayfayı tekrar okumak “tanıdıklık yanılsaması” (illusion of competence) yaratır, aktif geri çağırma (active recall) ise sınavdaki gibi ipuçsuz hatırlamayı test eder. İkinci yanılgı mega deste tuzağıdır: 27.341 kartlık bir deste günde 60 yeni kartla 365 günde bile bitmez; 9.575 kartlık çekirdek ise 160 günde tamamlanır.',
      'Üçüncü yanılgı “konu kapsamı” ile “soru çözdürme desteğini” karıştırmaktır. Son 6 TUS’un 1.195 sorusunda konuyla ilgili kart bulunma oranı %92,7 (1.108/1.195) iken, şıkları doğrudan veya tek adımla ayıran çözüm desteği %43,6’dır (521/1.195). Konuyu bilmek yetmez; tanıdan sonraki ilk tetkik/tedavi adımı veya ayırıcı tanı ayrımı çalışılmalıdır.',
      'Dördüncü yanılgı yalnızca Klinik çalışıp Temel’i sonraya bırakmaktır; oysa Klinik TUS puanının %50’si Temel Bilimlerden gelir. Beşinci yanılgı tekrarları erteleyip son ayda günde 1.000+ kart biriktirmektir. Altıncı yanılgı sadece yüksek puanlı branşların sevilen konularını çalışıp Anatomi (%28,2 destek) veya Küçük Stajlar (%30,2 destek) gibi boşlukları ihmal etmektir. Yedinci yanılgı ise hedef hatırlamayı %95–98’e zorlayarak gereksiz yere 3 kat fazla tekrar çözmektir.',
    ],
    table: {
      caption: 'TUS hazırlığında doğru bilinen 7 yanlış ve veri temelli karşılıkları',
      headers: ['Yaygın Yanlış İnanış', 'Gerçek Etki', 'Doğru Uygulama'],
      rows: [
        ['1. Kitabı baştan sona pasif okumak', 'Tanıdıklık hissi verir, geri çağırmayı ölçmez', 'Aktif hatırlama (kart + soru) ile kendini sına'],
        ['2. En büyük (30.000+) desteyi seçmek', '60 kart/gün hızında 1 yılda bitmez', '9.500–10.000 odaklanmış çekirdek kartı tamamla'],
        ['3. Konu varlığını çözüm sanmak', 'Son 6 TUS’ta %92,7 konu vs %43,6 çözüm desteği', 'Ayırıcı tanı, ilk tetkik ve kontrendikasyon çalış'],
        ['4. Klinik için Temel’i boşlamak', 'Klinik puanın %50’si Temel netinden gelir', 'Temel ve Klinik tekrarlarını paralel yürüt'],
        ['5. Günlük tekrarları biriktirmek', 'Kuyruk büyüyünce motivasyon kırılır', 'Yeni kartı durdur, önce vadesi gelen tekrarı bitir'],
        ['6. Zor branş boşluklarını ertelemek', 'Anatomi ve Küçük Stajlar net farkı açar', 'Her deneme sonrası zayıf alt konulara kart ekle'],
        ['7. %95+ hedef hatırlama seçmek', 'Tekrar yükünü %90 hedefine göre katlar', 'FSRS-6’da %88–%90 hedef aralığında kal'],
      ],
    },
    actionSteps: [
      'Çalışma oturumlarının en az yarısını pasif okuma yerine aktif kart/soru çözümüne ayır.',
      'FSRS-6 hedef hatırlama oranını %90’da tut; yoğun rotasyon dönemlerinde %88’e çekmekten çekinme.',
      '11 ÖSYM branşı referans sayfalarından hangi branşta “yalnız konu” oranının yüksek olduğunu görerek hedefli soru çöz.',
      'Deneme sınavı yanlışlarını hemen kısa karşılaştırma kartına dönüştür.',
    ],
    boundaryNote:
      'Örnek oranlar TusAnkiM’in son 6 TUS (2024/1–2026/2) ön değerlendirme veri setine ve FSRS-6 simülasyonuna dayanır. Her adayın temel bilgi düzeyi farklıdır; rehber tıbbi veya resmî danışmanlık yerine geçmez.',
    sources: [
      {
        label: 'FSRS — Optimizing Spaced Repetition Schedule (ACM KDD ’22)',
        url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
        publisher: 'ACM Digital Library',
      },
      {
        label: 'ÖSYM — TUS Çıkmış Sınav Soruları Arşivi',
        url: 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html',
        publisher: 'ÖSYM',
      },
      {
        label: 'Anki Manual — Temel Çalışma İlkeleri',
        url: 'https://docs.ankiweb.net/intro.html',
        publisher: 'Anki Manual',
      },
    ],
    relatedLinks: [
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'TUS puanı nasıl hesaplanır?', href: '/rehber/tus-puani-nasil-hesaplanir/' },
      { label: '11 Branş Referans Analizi', href: '/referanslar/' },
    ],
    keywords: 'tus doğru bilinen yanlışlar pasif tekrar mega deste son ay yığılma',
  },
  {
    slug: 'tusankim-ucretsiz-mi-nasil-kullanilir',
    order: 7,
    tone: 'Markalı',
    questionH1: "TusAnkiM ücretsiz mi, iPhone ve Web'de nasıl kullanılır?",
    seoTitle: "TusAnkiM Ücretsiz Mi? iPhone & Web Kullanımı | TusAnkiM",
    seoDescription:
      'TusAnkiM ücretsiz yerel çalışma katmanı, günde 200 kart sınırı, ₺50/ay tam erişim & açık beta erişimi, iPhone/Web kullanımı ve .apkg/.colpkg desteği.',
    directAnswer:
      'Evet, TusAnkiM’in çekirdek uygulaması süresiz ücretsizdir: kendi destelerinle ve içe aktardığın .apkg/.colpkg paketleriyle günde 200 karta kadar ücretsiz çalışabilir, FSRS-6, Kronometre ve Fotoğraf Düzenleyiciyi kullanabilirsin. BKA TUS 9.575 kartlık tam paket açık beta döneminde yerel olarak ücretsiz açılır; ücretli planlarda aylık ₺50 ve 7 gün koşulsuz iade uygulanır.',
    whyMisconceived: [
      'Adaylar çoğu zaman “hazır kart paketi ücretliyse uygulamanın tamamı ödeme duvarının arkasındadır” veya “kendi Anki destelerimi açmak için de abonelik gerekir” diye düşünür.',
      'Bir diğer karışıklık da iPhone uygulaması ile Web sürümünün farklı özelliklere sahip olduğu veya internet olmadan çalışmayacağı yönündedir.',
      'Ayrıca tıp fakültesi öğrenci kulüpleri ve dönem temsilcileri için sunulan ücretsiz tam erişim programından haberdar olunmadığı için topluluk başvuruları gecikebilir.',
    ],
    truthParagraphs: [
      'TusAnkiM yerel öncelikli (local-first) bir uygulamadır: kartların, tekrar geçmişin, Kronometre oturumların ve yedeklerin cihazında saklanır; reklam SDK’sı veya izleme çerezi içermez. Hem iPhone uygulamasında hem de Web tarayıcıda (Mac, Windows, iPad ve mobil tarayıcılarda tusankim.vercel.app üzerinden) aktif olarak çalışır; otomatik bulut eşitleme ve yerel Android uygulaması ise geliştirme aşamasındadır (Yakında).',
      'Fiyatlandırma iki net katmandan oluşur: Ücretsiz planda günde 200 karta kadar çalışma, sınırsız kendi deste/not oluşturma, .apkg/.colpkg içe ve dışa aktarma, FSRS-6 parametre optimizasyonu, Kronometre, Çalışma Takvimi ve otomatik yerel yedekleme ücretsizdir. BKA TUS 9.575 kart paketi (12 ders — 11 TUS branşı + karma Deneme ve Soru — ve 106 konu alt destesi; FHE = Fizyoloji-Histoloji-Embriyoloji) ise açık önizleme döneminde ödeme alınmadan yerel açılabilir; lansman modelinde aylık ₺50 ve 7 gün koşulsuz iade garantisi geçerlidir.',
      'Tıp fakültesi öğrenci toplulukları, çalışma grupları ve dönem temsilcileri destek@tusankim.com üzerinden başvurarak ücretsiz tam erişim alabilir.',
    ],
    table: {
      caption: 'TusAnkiM ücretsiz katman, BKA TUS paketi ve platform erişim özeti',
      headers: ['Özellik / Katman', 'Ücretsiz Yerel Uygulama', 'BKA TUS Tam Erişim (Beta / Lansman)'],
      rows: [
        ['Günlük kart hakkı', 'Günde 200 karta kadar ücretsiz', 'Sınırsız günlük tekrar'],
        ['Hazır BKA TUS paketi', 'Önizleme / kendi .apkg/.colpkg destelerin', '9.575 kart · 12 ders · 106 konu alt destesi'],
        ['FSRS-6, Kronometre, Takvim', 'Tam erişim (ücretsiz)', 'Tam erişim'],
        ['Anki (.apkg / .colpkg) aktarım', 'Kayıpsız içe ve dışa aktarma', 'Kayıpsız içe ve dışa aktarma'],
        ['Fiyat ve iade', '₺0 süresiz ücretsiz', 'Açık betada yerel ücretsiz; lansman ₺50/ay + 7 gün iade'],
        ['Platform durumu', 'iPhone & Web aktif · Bulut / Android Yakında', 'iPhone & Web aktif · Çevrimdışı yerel depolama'],
      ],
    },
    actionSteps: [
      'Hemen Web uygulamasını (tusankim.vercel.app) tarayıcıda açarak veya iPhone üzerinden kurulum yapmadan ilk deneme oturumuna başla.',
      'Elinde hazır .apkg veya .colpkg desten varsa İçe Aktar ekranından ekle; yoksa uygulama içinden BKA TUS paketini kur.',
      'Çalışma ekranı, Kronometre ve FSRS-6 ayarları için 21 Türkçe Yardım Rehberinden ilgili adımları takip et.',
      'Tıp fakültesi kulübü veya dönem temsilcisiysen ücretsiz tam erişim için destek@tusankim.com adresine kısa bir e-posta gönder.',
    ],
    boundaryNote:
      'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir. Ücretli abonelik ve bulut eşitleme özellikleri devreye alındığında koşullar yayın öncesinde Kullanım Koşulları ve Gizlilik Politikası sayfalarında güncellenir.',
    sources: [
      {
        label: 'Anki Manual — Açık Paket Biçimleri (.apkg / .colpkg)',
        url: 'https://docs.ankiweb.net/exporting.html#collection-colpkg',
        publisher: 'Anki Manual',
      },
      {
        label: 'OWASP MASVS — Mobil Veri Güvenliği Standardı',
        url: 'https://mas.owasp.org/MASVS/',
        publisher: 'OWASP Foundation',
      },
      {
        label: 'Apple Complete File Protection (NSFileProtectionComplete)',
        url: 'https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.default-data-protection',
        publisher: 'Apple Developer',
      },
    ],
    relatedLinks: [
      { label: 'Hızlı başlangıç rehberi (21 kılavuz)', href: '/yardim/hizli-baslangic/' },
      { label: 'Destek ve İletişim', href: '/destek/' },
      { label: 'Sıkça Sorulan Sorular', href: '/sss/' },
      { label: 'Kurucumuz ve Editöryal Standart', href: '/kurucu/' },
    ],
    keywords: 'tusankim ücretsiz mi fiyat 50 tl iphone web nasıl kullanılır beta',
  },
];
