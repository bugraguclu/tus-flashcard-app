import type { RehberArticle } from './types';

export const REHBER_PART_3: RehberArticle[] = [
  {
    slug: 'tus-calisirken-dogru-bilinen-7-yanlis',
    order: 6,
    tone: 'Markasız',
    questionH1: 'TUS çalışırken doğru bilinen 7 yanlış nedir?',
    seoTitle: 'TUS çalışırken doğru bilinen 7 yanlış | TusAnkiM',
    seoDescription:
      'TUS çalışırken doğru bilinen 7 yanlış: pasif okuma, mega deste, konu kapsamını çözüm desteği sanmak, son aya tekrar biriktirmek. Her birinin doğrusu burada.',
    directAnswer:
      'TUS’ta puan kaybının en sık nedeni az çalışmak olmaz. Asıl nedenler pasif okumak, bitmeyecek kadar büyük mega deste seçmek, “konunun kartı var”ı “soruyu çözdürür” sanmak ve son aya tekrar biriktirmektir. Bu 7 yanlışı aktif hatırlama ve ölçülü tempoyla düzeltebilirsin.',
    whyMisconceived: [
      'Fakültede kurul sınavından önceki hafta kalın notları birkaç kez hızlıca okumak çoğu zaman işe yarar. TUS ise 11 branşın tamamını tek günde ölçer. Kısa süreli tanımaya dayanan bu yöntem aylar içinde söner.',
      'Çalışma gruplarında ve forumlarda “%97 referans” ya da “30.000 kart” gibi büyük sayılar tek başına başarı ölçüsü gibi anlatılır. Aralıklı tekrar araştırmaları ve çıkmış soru analizleri başka bir şey gösterir: sonucu kart sayısından çok, bilgiyi ne kadar iyi geri çağırdığın belirler.',
      'Birçok aday da kalabalık tekrar kuyruğundan korkar, tekrarlarını erteler ve yalnızca yeni konu okur. Ertelediğin her gün daha fazlasını unutursun.',
    ],
    truthParagraphs: [
      'Birinci yanlış pasif okumaktır. Altını çizdiğin sayfayı yeniden okumak “bunu biliyorum” hissi verir ama hatırlayıp hatırlamadığını ölçmez. [Anki çalışma ilkelerinde](https://docs.ankiweb.net/intro.html) anlatılan aktif geri çağırma ise seni sınavdaki gibi ipucu olmadan sınar. İkinci yanlış mega destedir. 27.341 kartlık bir deste günde 60 yeni kartla 270 günde yalnızca %55,9 oranında tamamlanır. 270. günde günlük yük 198 dakikadır ve deste 365 günde bile bitmez. 9.575 kartlık deste aynı hızda 160 günde biter; 270. günde günlük süre 50 dakikaya iner.',
      'Üçüncü yanlış, “konu kapsamı” ile “çözüm desteği”ni karıştırmaktır. [ÖSYM’nin yayımladığı](/tus-cikmis-sorular-ve-analiz/) son 6 sınavın 1.195 sorusu için bir ön analiz yaptık. Konusuyla ilgili kart bulunan soruların oranı %92,7 (1.108/1.195). 2026/2’de bu oran 192/200, yani %96,0. Şıkları doğrudan veya tek adımla ayıran çözüm desteği ise %43,6 (521/1.195 = 333 Doğrudan + 188 Dolaylı). 2026/2’de güncel sayı 82/200; sınavdan 2 gün önceki a78ae1f sürümünde 76/200 idi. 2026/2’den sonra güncellenen 6 soruyu (T018, K039, K043, K050, K057, K078) sınav öncesi orana katmıyor, ayrı işaretliyoruz. Kısacası konuyu bilmek yetmez. İlk tetkiki, ilk tedaviyi, kontrendikasyonu ve ayırıcı tanıyı da çalışman gerekir.',
      'Dördüncü yanlış yalnızca Klinik çalışıp Temel’i sonraya bırakmaktır; Klinik TUS puanının %50’si Temel Bilimlerden gelir. Beşinci yanlış tekrarları erteleyip son ayda günde 1.000+ kart biriktirmektir. Altıncı yanlış, desteği yüksek derslerde oyalanmaktır: Farmakoloji (%56,6), Biyokimya (%56,0), Mikrobiyoloji (%55,6) ve Pediatri (%52,0). Bu sırada Anatomi (%28,2 destek), Küçük Stajlar (%30,2) ve Genel Cerrahi (%31,7) gibi boşluklar ihmal edilir. Yedinci yanlış hedef hatırlamayı %95–98’e zorlamaktır. Bu, [ACM KDD ’22 FSRS çalışmasının](https://dl.acm.org/doi/10.1145/3534678.3539081) gösterdiği bellek dinamiğine ters düşer ve günlük tekrar yükünü gereksiz yere üç katına çıkarır. %88–%90 aralığı hız ile kalıcılığı dengede tutar.',
    ],
    table: {
      caption: 'TUS hazırlığında doğru bilinen 7 yanlış ve verideki karşılıkları',
      headers: ['Yaygın yanlış', 'Gerçekte ne olur?', 'Doğrusu'],
      rows: [
        ['1. Kitabı baştan sona pasif okumak', 'Tanıdıklık hissi verir, hatırlamayı ölçmez', 'Kart ve soruyla kendini sına'],
        ['2. En büyük (30.000+) desteyi seçmek', 'Günde 60 kartla 1 yılda bitmez', '9.500–10.000 kartlık bitirilebilir desteyi tamamla'],
        ['3. Konunun kartı olmasını çözüm sanmak', 'Son 6 TUS’ta konu kapsamı %92,7, çözüm desteği %43,6', 'Ayırıcı tanı, ilk tetkik ve kontrendikasyon çalış'],
        ['4. Klinik için Temel’i boşlamak', 'Klinik puanın %50’si Temel netinden gelir', 'Temel ve Klinik tekrarlarını birlikte yürüt'],
        ['5. Günlük tekrarları biriktirmek', 'Kuyruk büyüyünce çalışma isteğin kırılır', 'Yeni kartı durdur, önce vadesi gelen tekrarı bitir'],
        ['6. Zayıf branşları ertelemek', 'Anatomi ve Küçük Stajlar net farkını açar', 'Her denemeden sonra zayıf alt konulara kart ekle'],
        ['7. %95+ hedef hatırlama seçmek', 'Tekrar yükünü %90 hedefine göre katlar', 'FSRS-6’da %88–%90 aralığında kal'],
      ],
    },
    actionSteps: [
      'Çalışma oturumlarının en az yarısını okumaya değil, kart ve soru çözmeye ayır.',
      'FSRS-6 hedef hatırlama oranını %90’da tut. Yoğun rotasyon dönemlerinde %88’e çekmekten çekinme.',
      '11 ÖSYM branşının referans sayfalarına bak. Hangi branşta “yalnız konu” oranı yüksekse orada hedefli soru çöz.',
      'Deneme yanlışlarını bekletmeden kısa karşılaştırma kartlarına çevir.',
    ],
    boundaryNote:
      'Örnek oranlar TusAnkiM’in son 6 TUS (2024/1–2026/2) ön değerlendirme verisine ve FSRS-6 simülasyonuna dayanır. Her adayın ön bilgisi farklıdır. Bu yazı tıbbi veya resmî danışmanlığın yerini tutmaz.',
    sources: [
      {
        label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
        url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
        publisher: 'ACM Digital Library',
      },
      {
        label: 'TusAnkiM — TUS çıkmış soru analizi (son 6 sınav, 1.195 soru)',
        url: 'https://tusankim.com/tus-cikmis-sorular-ve-analiz/',
        publisher: 'TusAnkiM',
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
      { label: '11 branşın referans analizi', href: '/referanslar/' },
    ],
    keywords: 'tus doğru bilinen yanlışlar pasif tekrar mega deste son ay yığılma',
  },
  {
    slug: 'tusankim-ucretsiz-mi-nasil-kullanilir',
    order: 7,
    tone: 'Markalı',
    questionH1: 'TusAnkiM ücretsiz mi, iPhone’da ve web’de nasıl kullanılır?',
    seoTitle: 'TusAnkiM ücretsiz mi? Fiyatlar ve kullanım | TusAnkiM',
    seoDescription:
      'TusAnkiM ücretsiz mi? Betada evet; ücretli seçenekler ve reklamlar henüz devrede değil. Plan: ücretsiz (ara ara reklam), ₺2.000 tüm kartlar, ₺50 reklamsız.',
    directAnswer:
      'Evet, TusAnkiM’i ücretsiz kullanabilirsin. Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır. Planlanan üç seçenek var: ücretsiz kullanım (ara ara reklam çıkacak, sıklığı sonradan ayarlanacak), 9.575 kartın tamamı için ₺2.000 ve reklamları kaldırmak için ₺50. Üçünde de seçili demo sorularını çözebilirsin.',
    whyMisconceived: [
      'Adaylar çoğu zaman hazır kart paketi ücretliyse uygulamanın tamamının ücretli olduğunu düşünür. Kendi hazırladığı ya da Anki’den aktardığı desteleri çalışmak için de aylık abonelik gerektiğini sanar.',
      'İkinci karışıklık platformlarla ilgilidir. iPhone uygulaması ile web sürümünün bambaşka özellikleri olduğu, internet kesilince de çalışma verilerine ulaşılamayacağı sanılır.',
      'Tıp fakültesi öğrenci kulüplerinin ve dönem temsilcilerinin iş birliği için bize doğrudan yazabileceği de pek bilinmez.',
    ],
    truthParagraphs: [
      'TusAnkiM’de verilerin cihazında kalır. Kartların, tekrar geçmişin, Kronometre oturumların ve otomatik yedeklerin yalnızca kendi cihazında saklanır. Tanıtım sitesinde çerez, reklam ağı veya üçüncü taraf izleme pikseli yoktur. iPhone uygulaması geliştiriliyor. Yayımlandığında dosyaların cihaz kilitliyken [Apple Complete File Protection (NSFileProtectionComplete)](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.default-data-protection) ile korunacak; uygulama buna göre yapılandırıldı. Bugün uygulama web tarayıcısında çalışır: Mac, Windows, iPad ve iPhone Safari dahil mobil tarayıcılarda tusankim.vercel.app/uygulama adresinden açarsın. Kurmadan önce sitedeki 11 canlı deneme kartıyla kart düzenine bakabilirsin. Otomatik bulut eşitleme, Android uygulaması ve TUS Tercih Simülasyonu geliştirme aşamasında (Yakında).',
      'Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır. Planlanan fiyatlandırmada üç seçenek var. **Ücretsiz Erişim (₺0):** Seçili demo sorularını çözersin, sınırsız sayıda kendi desteni ve notunu oluşturursun. Kişisel destelerini [Anki açık paket biçimleri](https://docs.ankiweb.net/exporting.html#collection-colpkg) (.apkg / .colpkg) ve CSV/TSV dosyalarıyla kayıpsız içe ve dışa aktarırsın. FSRS-6 parametre optimizasyonu, Kronometre, Çalışma Takvimi, Çalışma Planlama, Fotoğraf Düzenleyici, Görsel Gizleme ve otomatik yerel yedekleme de açıktır. Ücretli seçenekler devreye girdiğinde ücretsiz kullanıcılara ara ara reklam çıkacak; sıklığı yayın ayarlarına göre sonradan belirlenecek. **Tüm Kartlara Erişim (₺2.000):** 9.575 kartlık BKA TUS koleksiyonunun tamamını ve seçili demo sorularını açar. Koleksiyonda 7.721 not, 106 konu alt destesi ve 12 ders var: 3.957 Temel, 4.812 Klinik, 806 Deneme ve Soru kartı (FHE = Fizyoloji-Histoloji-Embriyoloji). **Reklamları Kaldırma (₺50):** Uygulama içi reklamları kaldırır; seçili demo sorularıyla kesintisiz çalışırsın.',
      'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir. Açık paket biçimlerini kullandığı için kişisel destelerini istediğin zaman dışa aktarırsın. Başlarken üç yolun var: seçili demo sorularını çözmek, kendi .apkg veya .colpkg desteni eklemek ya da 9.575 kartlık BKA TUS arşivine geçmek. Ekranların hepsi 21 Türkçe Yardım Rehberinde adım adım anlatılır. Tıp fakültesi öğrenci toplulukları, çalışma grupları ve dönem temsilcileri iş birliği için destek@tusankim.com adresine yazabilir; ücretsiz erişim gibi koşulları birlikte netleştiririz. Teknik sorunları ve kart düzeltme önerilerini de aynı adrese, kart kimliğiyle bildir.',
    ],
    table: {
      caption: 'TusAnkiM’de planlanan üç seçenek, demo erişimi ve platform durumu (güncel beta: ücretli seçenekler ve reklamlar henüz devrede değil)',
      headers: ['Özellik', 'Ücretsiz Erişim (₺0)', 'Reklamları Kaldırma (₺50)', 'Tüm Kartlara Erişim (₺2.000)'],
      rows: [
        ['Seçili demo soruları', 'Açık', 'Açık', 'Açık'],
        ['Reklam durumu', 'Ara ara reklam çıkacak (sıklığı sonra ayarlanacak)', 'Reklamsız', 'Tüm kart arşivine erişim'],
        ['BKA TUS 9.575 kart paketi', 'Seçili demo sorularıyla incelersin', 'Seçili demo sorularıyla incelersin', '9.575 kart · 12 ders · 106 alt deste'],
        ['Kişisel .apkg / .colpkg', 'Kayıpsız içe ve dışa aktarma', 'Kayıpsız içe ve dışa aktarma', 'Kayıpsız içe ve dışa aktarma'],
        ['FSRS-6, Kronometre, Takvim', 'Hepsi açık (cihazında, çevrimdışı)', 'Hepsi açık (cihazında, çevrimdışı)', 'Hepsi açık (cihazında, çevrimdışı)'],
        ['Platform durumu', 'Web açık · iPhone geliştiriliyor · Bulut / Android yakında', 'Web açık · iPhone geliştiriliyor', 'Web açık · iPhone geliştiriliyor'],
      ],
    },
    actionSteps: [
      'Web uygulamasını (tusankim.vercel.app/uygulama) tarayıcında aç; iPhone’da Safari’yi kullan. Seçili demo sorularını hemen çözmeye başla.',
      'Elinde hazır .apkg veya .colpkg desten varsa İçe Aktar ekranından ekle ve FSRS-6 ile tekrara başla.',
      'Güncel betada TUS paketini ücretsiz aç. Ücretli seçenekler devreye girdiğinde 9.575 kartlık BKA TUS arşivi için Tüm Kartlara Erişim’i (₺2.000), reklamsız çalışmak için Reklamları Kaldırma’yı (₺50) seçebileceksin.',
      'Tıp fakültesi kulübündeysen veya dönem temsilcisiysen iş birliği için destek@tusankim.com adresine kısa bir e-posta yaz.',
    ],
    boundaryNote:
      'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir. Güncel beta sürümünde ücretli seçenekler ve reklamlar henüz devrede değil; TUS paketi ücretsiz açılır. Reklamlar devreye girdiğinde sıklıkları uygulama ayarlarıyla düzenlenecek. Tanıtım sitesinde takip çerezi veya analitik betiği çalışmaz.',
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
      { label: 'Destek ve iletişim', href: '/destek/' },
      { label: 'Sıkça sorulan sorular', href: '/sss/' },
      { label: 'Hakkımızda', href: '/hakkimizda/' },
    ],
    keywords: 'tusankim ücretsiz mi fiyat 2000 tl 50 tl reklam kaldırma demo iphone web',
  },
  {
    slug: '5-sinif-intorn-son-1-ay-tus-programi',
    order: 8,
    tone: 'Markasız',
    questionH1: '5. sınıf, intörn ve son 1 ay için TUS çalışma programı nasıl kurulur?',
    seoTitle: '5. sınıf, intörn ve son 1 ay TUS programı | TusAnkiM',
    seoDescription:
      '5. sınıf, intörn ve son 1 ay için TUS çalışma programı: günde kaç yeni kart açacağın, tekrara ne kadar süre ayıracağın ve 9.575 kartı hangi tempoda bitireceğin.',
    directAnswer:
      'Tek bir TUS çalışma programı her döneme uymaz. 5. sınıfta günde 25–35 yeni kartla erken başlarsın. İntörnlükte ve nöbetli dönemde günde 40–50 yeni kartı kısa telefon oturumlarıyla yürütür, FSRS-6 tekrarlarını aksatmazsın. Son 1 ayda yeni kartı kesip yalnızca tekrarlara, deneme yanlışlarına ve zayıf branşlara bakarsın.',
    whyMisconceived: [
      'Öğrenciler ve pratisyen hekimler çoğu zaman internetteki tek tip “günde 10 saat konu okuma” çizelgesini kendi nöbet ya da staj takvimine uydurmaya çalışır. İki nöbet üst üste gelince program bozulur ve çalışma tamamen kopar.',
      '5. sınıfta “daha erken” denir ve yalnızca ders notu okunur. İntörnlükte bütün Temel ve Klinik kitaplarını sıfırdan bitirme telaşı başlar. Son 1 ayda yeni kaynak ya da yeni deste eklemek de tekrarları kontrolden çıkarır.',
    ],
    truthParagraphs: [
      'Aralıklı tekrar araştırmalarına göre ([ACM KDD ’22 FSRS çalışması](https://dl.acm.org/doi/10.1145/3534678.3539081)) bilgiyi kalıcı yapan şey sınav öncesi uzun maratonlardan çok, her gün yapılan kısa hatırlama oturumlarıdır. 9.575 kartlık deste günde 60 yeni kartla 160 günde biter. 270. günde günlük tekrar 187 karta (50 dk) iner. 27.341 kartlık mega desteler aynı hızda bir yılda bile bitmez.',
      '5. sınıfta tam hız çalışmana gerek yok; amaç sürdürebileceğin bir temel kurmak. Klinik stajların (Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum, Küçük Stajlar) sürerken günde 25–35 yeni kart ve 45/10 dakikalık iki Kronometre bloğu yeter. İntörnlüğe geçtiğinde 9.575 kartın yarısından fazlası uzun süreli hafızana yerleşmiş olur.',
      'İntörnlükte ve nöbetli dönemde (DHY dahil) en büyük engel, masa başında kesintisiz saat bulamamaktır. Bu dönemde [Anki aralıklı tekrar ilkelerine](https://docs.ankiweb.net/studying.html) uygun olarak FSRS-6 hedef hatırlama oranını %88–%90 arasında tut. Günün vadesi gelen tekrarlarını telefonda, 10–15 dakikalık çevrimdışı oturumlarla bitir ve günde 40–50 yeni kart ekle. Nöbet ertesi yorgun günlerde yeni kart açma, ama tekrar kuyruğunu boşalt.',
      'Son 1 ayda yeni bilgi yüklemezsin; elindeki puanı korursun. [Çıkmış soru analizimize](/tus-cikmis-sorular-ve-analiz/) göre haftada 2–3 tam süreli (100+100 soru) deneme çöz. Yeni kart açmayı tamamen durdur. Yalnızca FSRS-6’da vadesi gelen kartları, sürekli unuttuğun (leech) notları ve Anatomi, Küçük Stajlar gibi zayıf branşların filtrelenmiş destelerini çalış.',
    ],
    table: {
      caption: '5. sınıf, intörn/nöbetli hekim ve son 1 ay için günlük TUS çalışma temposu',
      headers: ['Dönem', 'Günlük yeni kart', 'FSRS-6 hedefi', 'Günlük çalışma (Kronometre)', 'Ana odak'],
      rows: [
        ['5. sınıf (stajyer)', '25 – 35 kart/gün', '%90 hatırlama', '2 × 45/10 dk (~1,5–2 sa)', 'Stajla birlikte temeli kurmak'],
        ['İntörn / nöbetli hekim', '40 – 50 kart/gün', '%88 – %90', '2–3 × 50/10 dk + telefonda tekrar', 'Tekrarları aksatmadan 9.575 kartı bitirmek'],
        ['Mezun (tam zamanlı)', '60 kart/gün (160 gün)', '%90 hatırlama', '4–5 × 50/10 veya 90/15 dk', 'Temel ve Klinik dengeli tarama, deneme'],
        ['Son 1 ay', '0 yeni kart', '%90 (yalnız tekrar)', '3–4 × 90/15 dk blok', 'Deneme yanlışı, spot tekrar, zayıf branş'],
      ],
    },
    actionSteps: [
      'Önce hangi dönemde olduğunu seç (5. sınıf, intörn/nöbetli veya son 1 ay) ve günlük yeni kart üst sınırını sabit tut.',
      'Her oturumu TUS Kronometre ile 45/10, 50/10 veya 90/15 bloklar hâlinde kaydet. Molayı ders süresinden ayrı tut.',
      'Nöbet ya da yoğun staj günlerinde yeni kart açma; yalnızca vadesi gelen FSRS-6 tekrarlarını bitir.',
      'Son 30 günde her haftanın deneme yanlışlarını kısa karşılaştırma kartlarına çevir ve filtrelenmiş destede tara.',
    ],
    boundaryNote:
      'Tablodaki kart ve süre aralıkları 9.575 kartlık BKA TUS destesine ve FSRS-6 simülasyonuna göre hazırlanmış örnek bir plandır. Tempoyu kendi ön bilgine, nöbet yoğunluğuna ve hedef puanına göre ayarla.',
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
        label: 'TusAnkiM — TUS çıkmış soru analizi (son 6 sınav, 1.195 soru)',
        url: 'https://tusankim.com/tus-cikmis-sorular-ve-analiz/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'TUS kronometresi ve çalışma takvimi rehberi', href: '/yardim/kronometre/' },
      { label: '2027 TUS tarihleri ve çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'TUS spot bilgiler ve demo kartlar', href: '/tus-spot-bilgiler/' },
    ],
    keywords: '5 sınıf tus çalışma programı intörnken tus son 1 ay programı çalışma sırası nöbet fsrs kronometre',
  },
];
