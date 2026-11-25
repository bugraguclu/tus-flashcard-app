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
    seoTitle: 'TusAnkiM Ücretsiz Mi? Fiyat ve Erişim Modeli | TusAnkiM',
    seoDescription:
      'TusAnkiM güncel betada ücretsiz. Planlanan 3 segmentli model: ücretsiz kullanım (ara ara reklam), ₺2.000 tüm kartlar, ₺50 reklam kaldırma.',
    directAnswer:
      'Evet, TusAnkiM’i ücretsiz olarak kullanabilirsin. Erişim modeli üç segmentlidir: (1) ücretsiz kullanıcılar için ara ara reklam çıkacak (reklam sıklığı sonradan ayarlanacak), (2) tüm 9.575 karta erişim ₺2.000’dir ve (3) reklamları kaldırma ₺50’dir. Her üç segmentte de seçili demo sorularına doğrudan erişebilirsin. Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır.',
    whyMisconceived: [
      'Adaylar çoğu zaman “hazır kart paketi ücretliyse uygulamanın tamamı ödeme duvarının arkasındadır” veya “kendi oluşturduğum ya da Anki’den aktardığım desteleri çalışmak için de sürekli aylık abonelik gerekir” diye düşünür.',
      'Bir diğer yaygın karışıklık da iPhone uygulaması ile Web tarayıcı sürümünün birbirinden tamamen farklı özelliklere sahip olduğu ya da internet bağlantısı koptuğunda çalışma verilerine erişilemeyeceği yönündedir.',
      'Ayrıca tıp fakültesi öğrenci kulüplerinin ve dönem temsilcilerinin iş birliği için doğrudan yazabileceği çoğu zaman bilinmez.',
    ],
    truthParagraphs: [
      'TusAnkiM yerel öncelikli (local-first) bir mimariyle tasarlanmıştır: kartların, tekrar geçmişin, Kronometre oturumların ve otomatik yedeklerin yalnızca kendi cihazında saklanır; tanıtım web sitesi ise çerez, reklam ağı veya üçüncü taraf izleme pikseli içermez. iPhone uygulaması yayımlandığında dosyalar cihaz kilitliyken [Apple Complete File Protection (NSFileProtectionComplete)](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.default-data-protection) ile korunacak şekilde yapılandırılmıştır. iPhone uygulaması geliştiriliyor; bugün Web tarayıcıda (Mac, Windows, iPad ve iPhone Safari dahil mobil tarayıcılarda tusankim.vercel.app/uygulama üzerinden) çalışır; hatta web sitesindeki 11 canlı deneme kartıyla kurulum yapmadan önce kart düzenini test edebilirsin. Otomatik bulut eşitleme, yerel Android uygulaması ve TUS Tercih Simülasyonu ise geliştirme aşamasındadır (Yakında).',
      'Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır. Planlanan fiyatlandırma ve erişim üç net segmentten oluşur. Birinci segment olan **Ücretsiz Erişim (₺0)** katmanında seçili demo sorularına doğrudan erişir, sınırsız kendi deste ve notunu oluşturur, [Anki açık paket biçimleri](https://docs.ankiweb.net/exporting.html#collection-colpkg) (`.apkg` / `.colpkg`) ve CSV/TSV dosyalarıyla kişisel destelerini kayıpsız içe/dışa aktarır, FSRS-6 parametre optimizasyonu, Kronometre, Çalışma Takvimi, Çalışma Planlama, Fotoğraf Düzenleyici, Görsel Gizleme ve otomatik yerel yedeklemeyi kullanırsın; ücretli seçenekler devreye girdiğinde ücretsiz kullanıcılar için ara ara reklam çıkacak (reklam sıklığı yayın ayarlarına göre sonradan ayarlanacak). İkinci segment olan **Tüm Kartlara Erişim (₺2.000)** ile 9.575 kartlık BKA TUS koleksiyonunun (7.721 not, 12 ders — 3.957 Temel, 4.812 Klinik, 806 Deneme ve Soru; FHE = Fizyoloji-Histoloji-Embriyoloji — ve 106 konu alt destesi) tamamına ve seçili demo sorularına erişirsin. Üçüncü segment olan **Reklamları Kaldırma (₺50)** seçeneği ise uygulama içi reklamları kaldırarak seçili demo sorularına doğrudan erişimle kesintisiz çalışma sağlar.',
      'Bağımsız bir ürün olan TusAnkiM, Anki veya Ankitects ile bağlantılı değildir; açık standartları koruduğu için kişisel destelerini dilediğin zaman geri dışa aktarabilirsin. Hızlı başlangıçta doğrudan seçili demo sorularını çözebilir, kendi `.apkg` veya `.colpkg` desteni ekleyebilir ya da tüm 9.575 kartlık BKA TUS arşivine geçebilirsin. Tüm ekranların ayrıntılı anlatımı 21 Türkçe Yardım Rehberinde adım adım yer alır. Tıp fakültesi öğrenci toplulukları, çalışma grupları ve dönem temsilcileri iş birliği taleplerini destek@tusankim.com adresine iletebilir; ücretsiz erişim gibi koşullar birlikte netleştirilir. Teknik sorunlar ve kart düzeltme önerileri de aynı adresten kart kimliğiyle bildirilebilir.',
    ],
    table: {
      caption: 'TusAnkiM planlanan 3 segmentli fiyatlandırma, demo erişimi ve platform özeti (güncel beta: ücretli seçenekler ve reklamlar henüz devrede değil)',
      headers: ['Özellik / Segment', 'Ücretsiz Erişim (₺0)', 'Reklamları Kaldırma (₺50)', 'Tüm Kartlara Erişim (₺2.000)'],
      rows: [
        ['Seçili demo soruları', 'Doğrudan erişim', 'Doğrudan erişim', 'Doğrudan erişim'],
        ['Reklam durumu', 'Ara ara reklam çıkacak (sıklık sonra ayarlanır)', 'Reklamsız deneyim', 'Tüm kart arşivi erişimi'],
        ['BKA TUS 9.575 kart paketi', 'Seçili demo sorularıyla inceleme', 'Seçili demo sorularıyla inceleme', '9.575 kart · 12 ders · 106 alt deste'],
        ['Kişisel .apkg / .colpkg', 'Kayıpsız içe ve dışa aktarma', 'Kayıpsız içe ve dışa aktarma', 'Kayıpsız içe ve dışa aktarma'],
        ['FSRS-6, Kronometre, Takvim', 'Tam erişim (yerel & çevrimdışı)', 'Tam erişim (yerel & çevrimdışı)', 'Tam erişim (yerel & çevrimdışı)'],
        ['Platform durumu', 'Web aktif · iPhone geliştiriliyor · Bulut / Android Yakında', 'Web aktif · iPhone geliştiriliyor', 'Web aktif · iPhone geliştiriliyor'],
      ],
    },
    actionSteps: [
      'Hemen Web uygulamasını (tusankim.vercel.app/uygulama) tarayıcıda, iPhone’da da Safari ile açarak seçili demo sorularını doğrudan çözmeye başla.',
      'Elinde hazır .apkg veya .colpkg desten varsa İçe Aktar ekranından ekle ve FSRS-6 tekrar takvimini başlat.',
      'Güncel betada TUS paketini ücretsiz aç; ücretli seçenekler devreye girdiğinde 9.575 kartlık BKA TUS arşivi için Tüm Kartlara Erişim (₺2.000) veya reklamsız deneyim için Reklamları Kaldırma (₺50) seçilebilecek.',
      'Tıp fakültesi kulübü veya dönem temsilcisiysen iş birliği için destek@tusankim.com adresine kısa bir e-posta gönder.',
    ],
    boundaryNote:
      'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir. Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır. Reklamlar devreye girdiğinde sıklıkları uygulama ayarlarıyla düzenlenecek; Web tanıtım sitesinde takip çerezi veya analitik betiği çalıştırılmaz.',
    sources: [
      {
        label: 'Anki Manual — Açık Paket Biçimleri (.apkg / .colpkg)',
        url: 'https://docs.ankiweb.net/exporting.html#collection-colpkg',
        publisher: 'Anki Manual',
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
      { label: 'Hakkımızda', href: '/hakkimizda/' },
    ],
    keywords: 'tusankim ücretsiz mi fiyat 2000 tl 50 tl reklam kaldırma demo iphone web',
  },
  {
    slug: '5-sinif-intorn-son-1-ay-tus-programi',
    order: 8,
    tone: 'Markasız',
    questionH1: '5. sınıf, intörn ve son 1 ay için TUS çalışma programı nasıl kurulur?',
    seoTitle: '5. Sınıf, İntörn ve Son 1 Ay TUS Programı | TusAnkiM',
    seoDescription:
      '5. sınıf, intörn (nöbetli hekim) ve son 1 ay için FSRS-6 ve Kronometre temelli TUS çalışma programı: günlük yeni kart, tekrar süresi ve 9.575 kart temposu.',
    directAnswer:
      'Tek bir sabit TUS çalışma programı her döneme uymaz. 5. sınıfta günde 25–35 yeni kartla erken çekirdek kurulur; intörn ve nöbetli dönemde 40–50 yeni kartlık kısa mobil oturumlarla FSRS-6 kuyruğu korunur; son 1 ayda yeni kart kesilip yalnızca tekrarlar, deneme yanlışları ve zayıf branşlara odaklanılır.',
    whyMisconceived: [
      'Tıp fakültesi öğrencileri ve pratisyen hekimler çoğu zaman internetteki tek tip “günde 10 saat konu okuma” çizelgelerini kendi nöbet veya staj takvimine uydurmaya çalışır; iki nöbet üst üste gelince program bozulur ve çalışma tamamen kopar.',
      'Benzer biçimde 5. sınıfta henüz erken olduğu düşünülerek yalnızca pasif ders notu okunur, intörnlükte ise tüm Temel ve Klinik kitaplarını sıfırdan bitirme telaşı başlar. Son 1 ayda yeni kaynak veya yeni deste eklemek de unutma eğrisini kontrolsüzleştirir.',
    ],
    truthParagraphs: [
      'Aralıklı tekrar bilimi ([ACM KDD ’22 FSRS çalışması](https://dl.acm.org/doi/10.1145/3534678.3539081)), bilgi kalıcılığının sınav öncesi uzun maratonlardan çok her gün sürdürülen kısa geri çağırma oturumlarına bağlı olduğunu gösterir. 9.575 kartlık odaklanmış çekirdek deste, günde 60 yeni kart temposuyla 160 günde tamamlanır ve 270. günde günlük tekrar yükü 50 dakikaya (187 kart) iner; 27.341 kartlık mega desteler ise aynı hızda bir yılda bile bitmez.',
      '5. sınıf staj döneminde amaç tam hız değil, sürdürülebilir temel kurmaktır: yürüyen klinik stajla (Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum, Küçük Stajlar) paralel günde 25–35 yeni kart ve 45/10 dakikalık iki Kronometre bloğu yeterlidir. Böylece intörnlüğe geçerken 9.575 kartın yarısından fazlası uzun süreli hafızaya taşınmış olur.',
      'İntörn ve DHY/nöbetli hekim fazında en büyük engel kesintisiz masa başı saat bulamamaktır. Bu fazda [Anki aralıklı tekrar ilkelerine](https://docs.ankiweb.net/studying.html) uygun olarak FSRS-6 hedef hatırlama oranı %88–%90 bandında tutulur, telefon cebinden 10–15 dakikalık çevrimdışı oturumlarla günlük vadesi gelen tekrarlar bitirilir ve günde 40–50 yeni kart eklenir. Nöbet ertesi yorgun günlerde yeni kart sıfırlanır ama tekrar kuyruğu boşaltılır.',
      'Son 1 ay (sprint fazı) yeni bilgi yükleme değil, mevcut puanı kilitleme dönemidir. [ÖSYM TUS takvimi ve çıkmış soru arşivine](https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html) göre haftada 2–3 tam süreli (100+100 soru) deneme çözülür; yeni kart açmak tamamen durdurulur, yalnızca FSRS-6 vadesi gelen kartlar, sürekli unutulan (leech) notlar ve Anatomi/Küçük Stajlar gibi zayıf branşların filtrelenmiş desteleri çalışılır.',
    ],
    table: {
      caption: '5. sınıf, intörn/nöbetli hekim ve son 1 ay fazlarına göre günlük TUS çalışma temposu',
      headers: ['Aday Fazı', 'Günlük Yeni Kart', 'FSRS-6 Hedefi', 'Günlük Etüt (Kronometre)', 'Ana Odak'],
      rows: [
        ['5. Sınıf (Stajyer)', '25 – 35 kart/gün', '%90 hatırlama', '2 × 45/10 dk (~1,5–2 sa)', 'Stajla paralel çekirdek kurulumu'],
        ['İntörn / Nöbetli Hekim', '40 – 50 kart/gün', '%88 – %90', '2–3 × 50/10 dk + mobil tekrar', 'Kuyruğu kırmadan 9.575 kartı bitirme'],
        ['Mezun (Tam Zamanlı)', '60 kart/gün (160 gün)', '%90 hatırlama', '4–5 × 50/10 veya 90/15 dk', 'Temel + Klinik dengeli tarama + deneme'],
        ['Son 1 Ay (Sprint)', '0 yeni kart', '%90 (yalnız tekrar)', '3–4 × 90/15 dk blok', 'Deneme yanlışı, spot tekrar, zayıf branş'],
      ],
    },
    actionSteps: [
      'Önce kendi fazını seç (5. sınıf, intörn/nöbetli veya son 1 ay) ve günlük yeni kart üst sınırını sabit tut.',
      'Her oturumu TUS Kronometre ile 45/10, 50/10 veya 90/15 bloklar hâlinde kaydet; molayı ders süresinden ayrı tut.',
      'Nöbet veya yoğun staj günlerinde yeni kart açmayı durdur, yalnızca vadesi gelen FSRS-6 tekrarlarını tamamla.',
      'Son 30 günde haftalık deneme yanlışlarını kısa karşılaştırma kartına çevirip filtrelenmiş destede tara.',
    ],
    boundaryNote:
      'Tablodaki kart ve süre aralıkları 9.575 kartlık BKA TUS hacmi ve FSRS-6 simülasyonuna göre örnek planlamadır. Kişisel temel düzeyine, nöbet yoğunluğuna ve hedef puanına göre tempo uyarlanmalıdır.',
    sources: [
      {
        label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
        url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
        publisher: 'ACM Digital Library',
      },
      {
        label: 'Anki Manual — Studying & Review Discipline',
        url: 'https://docs.ankiweb.net/studying.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'ÖSYM — TUS Çıkmış Sınav Soruları Arşivi',
        url: 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS Kronometre ve Çalışma Takvimi Rehberi', href: '/yardim/kronometre/' },
      { label: '2027 TUS tarihleri ve çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'TUS Spot Bilgiler ve Demo Kartlar', href: '/tus-spot-bilgiler/' },
    ],
    keywords: '5 sınıf tus çalışma programı intörnken tus son 1 ay programı çalışma sırası nöbet fsrs kronometre',
  },
];
