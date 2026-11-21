import type { RehberArticle } from './types';

export const REHBER_PART_3: RehberArticle[] = [
  {
    slug: 'tus-calisirken-dogru-bilinen-7-yanlis',
    order: 6,
    tone: 'Markasız',
    questionH1: 'TUS çalışırken doğru bilinen 7 yanlış nelerdir (pasif tekrar, mega deste tuzağı, son ay tekrar yükü)?',
    seoTitle: 'TUS Çalışırken Doğru Bilinen 7 Yanlış | TusAnkiM',
    seoDescription:
      'Pasif okuma, mega deste biriktirme, konu kapsamını çözüm desteği sanma ve son ay tekrar yığılması gibi TUS hazırlığında sık yapılan 7 hatanın doğruları.',
    directAnswer:
      'TUS’ta puan kaybının en sık nedeni az çalışmak değil; pasif tekrar okuma, bitmeyecek kadar büyük mega desteler seçme, “konu kartı var” ölçüsünü “soru çözdürür” sanma ve son aya kontrolsüz tekrar yükü biriktirmektir. Bu 7 yaygın yanlışı aktif hatırlama ve ölçülü tempo ile düzeltebilirsin.',
    whyMisconceived: [
      'Tıp fakültesi kurul sınavlarında son hafta kalın ders notlarını birkaç kez hızlıca okuyup geçmek çoğu zaman kısa vadede işe yarar; ancak 11 branşın tamamını tek günde ölçen TUS’ta bu kısa süreli tanıma stratejisi aylar içinde hızla söner.',
      'Ayrıca çalışma gruplarında ve forum söylemlerinde sıkça “%97 referans” veya “30.000 kart” gibi mutlak büyüklükler tek başına başarı ölçütü gibi sunulur; oysa aralıklı tekrar araştırmaları ve çıkmış soru analizleri nicelikten çok geri çağırma kalitesinin belirleyici olduğunu gösterir.',
      'Birçok aday da yoğun tekrar kuyruğundan korktuğu için günlük tekrarlarını erteleyip yalnızca yeni konu okumaya devam eder; oysa ertelenen her gün unutma eğrisinin dikleşmesine yol açar.',
    ],
    truthParagraphs: [
      'İlk büyük yanılgı pasif tekrar okumaktır: altını çizdiğin sayfayı tekrar okumak “tanıdıklık yanılsaması” yaratır, oysa [Anki çalışma ilkelerinde](https://docs.ankiweb.net/intro.html) vurgulanan aktif geri çağırma (active recall) sınavdaki gibi ipuçsuz hatırlamayı test eder. İkinci yanılgı mega deste tuzağıdır: 27.341 kartlık bir deste günde 60 yeni kart temposuyla 270 günde yalnızca %55,9 tamamlanır (270. gün 198 dk/gün yük) ve 365 günde bile bitmez; 9.575 kartlık çekirdek ise aynı hızda 160 günde biter ve 270. günde 50 dk/güne iner.',
      'Üçüncü yanılgı “konu kapsamı” ile “soru çözdürme desteğini” karıştırmaktır. [ÖSYM TUS çıkmış sorular arşivindeki](https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html) son 6 sınavın 1.195 sorusunda yapılan ön analizde konuyla ilgili kart bulunma oranı %92,7 (1.108/1.195; 2026/2’de 192/200 = %96,0) iken, şıkları doğrudan veya tek adımla ayıran çözüm desteği %43,6’dır (521/1.195 = 333 Doğrudan + 188 Dolaylı; 2026/2’de güncel 82/200 ve sınavdan 2 gün önceki a78ae1f sürümünde 76/200). Ayrıca 2026/2 sonrasında güncellenen 6 soru (`T018`, `K039`, `K043`, `K050`, `K057`, `K078`) sınav öncesi orana katılmadan şeffaf biçimde ayrı işaretlenir. Yani konuyu bilmek yetmez; ilk tetkik, ilk tedavi, kontrendikasyon ve ayırıcı tanı ayrımı çalışılmalıdır.',
      'Dördüncü yanılgı yalnızca Klinik çalışıp Temel’i sonraya bırakmaktır; oysa Klinik TUS puanının %50’si Temel Bilimlerden gelir. Beşinci yanılgı tekrarları erteleyip son ayda günde 1.000+ kart biriktirmektir. Altıncı yanılgı Farmakoloji (%56,6), Biyokimya (%56,0), Mikrobiyoloji (%55,6) ve Pediatri (%52,0) gibi desteği yüksek derslerde kalıp Anatomi (%28,2 destek), Küçük Stajlar (%30,2) ve Genel Cerrahi (%31,7) gibi boşlukları ihmal etmektir. Yedinci yanılgı ise [ACM KDD ’22 FSRS çalışmasının](https://dl.acm.org/doi/10.1145/3534678.3539081) gösterdiği bellek dinamiğine aykırı biçimde hedef hatırlamayı %95–98’e zorlayıp günlük tekrar yükünü gereksiz yere üç katına çıkarmaktır; oysa %88–%90 bandı hız ve kalıcılık dengesini korur.',
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
        label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
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
      'Adaylar çoğu zaman “hazır kart paketi ücretliyse uygulamanın tamamı ödeme duvarının arkasındadır” veya “kendi oluşturduğum ya da Anki’den aktardığım desteleri çalışmak için de abonelik gerekir” diye düşünür.',
      'Bir diğer yaygın karışıklık da iPhone uygulaması ile Web tarayıcı sürümünün birbirinden tamamen farklı özelliklere sahip olduğu ya da internet bağlantısı koptuğunda çalışma verilerine erişilemeyeceği yönündedir.',
      'Ayrıca tıp fakültesi öğrenci kulüpleri ve dönem temsilcileri için sunulan ücretsiz tam erişim programından haberdar olunmadığı için topluluk başvuruları gereksiz yere ertelenir.',
    ],
    truthParagraphs: [
      'TusAnkiM yerel öncelikli (local-first) bir mimariyle tasarlanmıştır: kartların, tekrar geçmişin, Kronometre oturumların ve otomatik yedeklerin yalnızca kendi cihazında saklanır; reklam SDK’sı veya davranışsal izleme çerezi içermez. Güvenlik modeli [OWASP MASVS standardı](https://mas.owasp.org/MASVS/) ilkeleriyle uyumludur ve iOS’ta cihaz kilitliyken dosyalar [Apple Complete File Protection (NSFileProtectionComplete)](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.default-data-protection) ile korunur. Bugün hem iPhone uygulamasında hem de Web tarayıcıda (Mac, Windows, iPad ve mobil tarayıcılarda tusankim.vercel.app üzerinden) aktif olarak çalışır; hatta web sitesindeki 11 canlı deneme kartıyla kurulum yapmadan önce kart düzenini test edebilirsin. Otomatik bulut eşitleme, yerel Android uygulaması ve TUS Tercih Simülasyonu ise geliştirme aşamasındadır (Yakında).',
      'Fiyatlandırma iki net katmandan oluşur: Ücretsiz planda (₺0, süresiz ücretsiz) günde 200 karta kadar çalışma, sınırsız kendi deste/not oluşturma, [Anki açık paket biçimleri](https://docs.ankiweb.net/exporting.html#collection-colpkg) (`.apkg` / `.colpkg`) ve CSV/TSV dosyalarıyla kayıpsız içe/dışa aktarma, FSRS-6 parametre optimizasyonu, Kronometre, Çalışma Takvimi, Çalışma Planlama, Fotoğraf Düzenleyici, Görsel Gizleme ve otomatik yerel yedekleme ücretsizdir. BKA TUS 9.575 kart paketi (7.721 not, 12 ders — 3.957 Temel, 4.812 Klinik, 806 Deneme ve Soru; FHE = Fizyoloji-Histoloji-Embriyoloji — ve 106 konu alt destesi) ise açık önizleme/beta döneminde ödeme alınmadan yerel açılabilir; ücretli lansman planlarında aylık ₺50 (liste fiyatı ₺199) ve 7 gün koşulsuz iade garantisi geçerlidir.',
      'Bağımsız bir ürün olan TusAnkiM, Anki veya Ankitects ile bağlantılı değildir; ancak açık standartları koruduğu için kişisel destelerini dilediğin zaman geri dışa aktarabilirsin. Hızlı başlangıçta ister BKA TUS paketini tek adımda yerel olarak kurabilir ister kendi `.apkg` veya `.colpkg` desteni ekleyip Çalışma Planlama ve Kronometre ile günlük hedefini yönetebilirsin; ücretsiz yerel katman açık önizleme sonrası da günde 200 kart hakkıyla süresiz açık kalır. Tüm ekranların ayrıntılı anlatımı 21 Türkçe Yardım Rehberinde adım adım yer alır. Tıp fakültesi öğrenci toplulukları, çalışma grupları ve dönem temsilcileri ise destek@tusankim.com üzerinden başvurarak ücretsiz tam erişim hesabı alabilir; teknik sorunlar ve kart düzeltme önerileri kurucu hekim inceleme sürecine doğrudan iletilir.',
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
