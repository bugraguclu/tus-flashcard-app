import type { RehberArticle } from './types';

export const REHBER_PART_1: RehberArticle[] = [
  {
    slug: 'tusta-kac-kart-calisilmali',
    order: 1,
    published: '2026-11-21',
    updated: '2026-11-26',
    category: 'FSRS-6 ve Uygulama',
    tone: 'Markalı',
    questionH1: 'TUS’ta kaç kart çalışılmalı? 9.575 mi, 30.000 mi?',
    seoTitle: 'TUS’ta kaç kart çalışılmalı? Mega deste kıyası | TusAnkiM',
    seoDescription:
      'TUS’ta kaç kart çalışılmalı? 9.575 kartlık deste günde 60 yeni kartla 160 günde biter. 27.341 kartlık mega deste aynı tempoda 365 günde bile bitmez.',
    directAnswer:
      'Çoğu TUS adayı için bitirilebilir kart sayısı 9.500–10.000 arasıdır. Günde 60 yeni kartla 9.575 kartlık BKA TUS destesi 160 günde biter. 27.341 kartlık bir mega deste 270 günde bile bitmez ve son aylarda günde 3 saati aşan tekrar biriktirir.',
    whyMisconceived: [
      '“Ne kadar çok kart, o kadar yüksek puan” düşüncesi adaylar arasında yaygın. 25.000–35.000 kartlık mega desteler konu kitaplarındaki her cümleyi ve dipnotu ayrı karta böler. Hiçbir ayrıntıyı atlamadığı için ilk bakışta daha güvenli görünür.',
      'Ama bir kartın asıl maliyeti onu ilk gördüğün gün çıkmaz. Maliyet, sonraki haftalarda ve aylarda biriken günlük tekrar kuyruğudur. Yeni kart sayısı arttıkça 1., 3., 7., 21. ve 60. gün tekrarları üst üste biner. Deneme çözmeye ayıracağın zaman buna gider.',
      'ÖSYM de ezberlenmiş bilgi yığınını ölçmez. 11 TUS branşında şıkları birbirinden ayıran ipucunu, ilk tetkiki, ilk tedavi basamağını ve mekanizma farkını sınav sabahı hızlıca hatırlaman gerekir.',
    ],
    truthParagraphs: [
      'İki desteyi aynı tempoda karşılaştırdık. Hesabı [FSRS-6 algoritma şartnamesi](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) ile uyumlu açık simülasyon motorumuz yaptı; hedef hatırlama oranını %90 aldık. Günde 60 yeni kartla 9.575 kartlık BKA TUS koleksiyonu 160 günde biter. 180 gün sonunda 9.044 kart (%94,5) hafızana yerleşmiş olur. 270 günlük dönemde günlük ortalama 331 karttır (102 dk). 270. günde günlük tekrar 187 karta (50 dk) iner.',
      'Aynı tempoda 27.341 kartlık mega deste 270 günde bitmez. 270. günde yalnızca 16.200 kartı görmüş olursun (%55,9 bellek kapsamı). O gün günlük yük 656 karttır (198 dk). Deste 365 günde de bitmez. Bitirmek için günde 80–140 yeni karta çıkarsan en yoğun günün 286–411 dakika sürer. [ACM KDD ’22 FSRS çalışmasında](https://dl.acm.org/doi/10.1145/3534678.3539081) incelenen unutma dinamiği bunun nedenini gösterir: çok fazla yeni kart açınca tekrar borcu birikir.',
      'Kart sayısı ile referans sayısı ayrı şeylerdir; ikisini karıştırma. BKA TUS kataloğunda 12 ders, 9.575 kart, 7.721 not ve 106 konu alt destesi var. 6 Temel Bilimler dersi 3.957 kart, 5 Klinik Bilimler dersi 4.812 kart tutar. Karışık pekiştirme için 806 kartlık Deneme ve Soru destesi de vardır. Katalogda Fizyoloji-Histoloji-Embriyoloji kısaca FHE diye geçer. Referans tarafında [ÖSYM’nin yayımladığı çıkmış soruları](/tus-cikmis-sorular-ve-analiz/) esas alan bir ön sınıflama yaptık. Deneme ve Soru hariç 11 resmî TUS branşındaki 1.195 soruda konu kapsamı %92,7 (1.108/1.195), çözüm desteği %43,6 (521/1.195) çıktı.',
    ],
    table: {
      caption: 'FSRS-6 simülasyonuna göre (%90 hatırlama hedefi) 9.575 kartlık deste ile 27.341 kartlık mega destenin karşılaştırması',
      headers: ['Deste', 'Günlük yeni kart', 'Bitiş süresi', '270 günde günlük ortalama', 'En yoğun gün'],
      rows: [
        ['9.575 kart (BKA TUS)', '40 yeni / gün', '240 gün', '298 kart (93 dk)', '133 dk'],
        ['9.575 kart (BKA TUS)', '60 yeni / gün', '160 gün', '331 kart (102 dk)', '173 dk'],
        ['9.575 kart (BKA TUS)', '80 yeni / gün', '120 gün', '345 kart (105 dk)', '206 dk'],
        ['27.341 kart (mega deste)', '60 yeni / gün', '365 günde bitmez', '474 kart (149 dk)', '221+ dk (270. gün 198 dk)'],
        ['27.341 kart (mega deste)', '80 yeni / gün', '342 gün', '627 kart (197 dk)', '286 dk (944 kart)'],
      ],
    },
    actionSteps: [
      'Önce sınava kaç gün kaldığını hesapla. 6–9 aylık hazırlıkta günde 40–60 yeni kart, konu okumaya ve deneme çözmeye de zaman bırakır.',
      'Kopya cümlelerle şişmiş dev paketlerle başlama. Her kartı tek bir ayırt edici bilgi soran bir koleksiyon seç (boşluk doldurma kartı ve klinik not).',
      'Son 6 TUS referans cetvelinde Anatomi (%28,2 destek) ve Genel Cerrahi (%31,7 destek) gibi branşlar daha zorlu. Buralarda eksik hissettiğin konulara kendi kartlarını ekle.',
      'Günlük tekrar süren kalıcı olarak 120 dakikayı geçiyorsa yeni kart açmayı durdur. Önce bekleyen tekrarları ve deneme yanlışlarını bitir.',
    ],
    boundaryNote:
      'Süre ve kart tahminleri TusAnkiM’in FSRS-6 simülasyonundaki varsayımlara dayanır. Gerçek süren okuma hızına, kartları ne kadar zor bulduğuna ve tekrar düzenine göre değişir. Bu yazı çalışma planı yapmana yardım eder; resmî sınav kılavuzunun yerini tutmaz.',
    sources: [
      {
        label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
        url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
        publisher: 'ACM Digital Library',
      },
      {
        label: 'FSRS-6 Algoritma Şartnamesi (awesome-fsrs)',
        url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
        publisher: 'Open Spaced Repetition',
      },
      {
        label: 'TusAnkiM — TUS çıkmış soru analizi (son 6 sınav, 1.195 soru)',
        url: '/tus-cikmis-sorular-ve-analiz/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'FSRS-6 nedir?', href: '/rehber/tus-icin-fsrs-6-nedir/' },
      { label: 'Son 6 TUS: 11 branşın referansları', href: '/referanslar/' },
      { label: 'TUS kartları kılavuzu', href: '/yardim/tus-kartlari/' },
      { label: '2027 TUS çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
    ],
    keywords: 'tus kaç kart çalışılmalı 9575 30000 mega deste fsrs günlük yük',
  },
  {
    slug: 'tus-icin-fsrs-6-nedir',
    order: 2,
    published: '2026-11-21',
    updated: '2026-11-25',
    category: 'FSRS-6 ve Uygulama',
    tone: 'Yumuşak',
    questionH1: 'TUS için FSRS-6 nedir, neden %20–30 daha az tekrar yaptırır?',
    seoTitle: 'TUS için FSRS-6 nedir? SM-2’den farkı | TusAnkiM',
    seoDescription:
      'FSRS-6 nedir? Bir kartı unutmak üzere olduğun gün karşına çıkaran tekrar algoritması. TUS hazırlığında aynı %90 hatırlama için %20–30 daha az tekrar ister.',
    directAnswer:
      'FSRS-6, bir kartı unutmak üzere olduğun günü tahmin edip o gün karşına çıkaran tekrar algoritmasıdır. Aynı %90 hatırlama oranı için klasik SM-2 tabanlı zamanlayıcılardan ortalama %20–30 daha az günlük tekrar ister.',
    whyMisconceived: [
      'Birçok aday bütün aralıklı tekrar uygulamalarını aynı sanır. Ya “1–3–7–21 gün” gibi sabit bir takvim düşünür ya da 1980’lerde geliştirilen SM-2’nin kolaylık çarpanlarını. Bu yüzden kart tekrarını kendine göre ayarlanmayan sabit bir liste gibi görür.',
      'SM-2’de katsayılar sabittir. Kolay kartlar gereğinden sık, zor klinik ayrımlar düzensiz aralıklarla karşına çıkar. “Tekrar” düğmesine birkaç kez basınca kartın kolaylık çarpanı kalıcı olarak düşer; buna kolaylık tuzağı (“ease hell”) denir. Aylar içinde günlük tekrar kuyruğu şişer.',
      'Bazı adaylar da FSRS-6 günde daha az kart gösterdiği için sınav günü daha az şey hatırlayacağından çekinir. FSRS-6 hatırlama oranını rastgele düşürmez. Seçtiğin hedefi (örneğin %90) hesabın içinde sabit tutar ve aralıkları ona göre ayarlar.',
    ],
    truthParagraphs: [
      'FSRS’nin (Free Spaced Repetition Scheduler) temeli Ye ve arkadaşlarının [ACM KDD ’22 bildirisine](https://dl.acm.org/doi/10.1145/3534678.3539081) dayanır; ayrıntıları açık kaynak [awesome-fsrs algoritma şartnamesinde](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) yazar. Algoritma her kart için üç şeyi izler. Birincisi geri çağrılabilirlik: kartı şu an hatırlama olasılığın. İkincisi kararlılık: hatırlama olasılığının %100’den %90’a inmesi için geçen gün sayısı. Üçüncüsü zorluk: bilginin 1–10 arası puanlanan doğal karmaşıklığı.',
      'FSRS-6, güç yasasına dayanan bir unutma eğrisi ve 21 parametre kullanır. 17 veya 19 parametreli eski FSRS kayıtlarıyla da çalışır. Referans kodu [fsrs-rs açık deposunda](https://github.com/open-spaced-repetition/fsrs-rs) yayımlanır. Parametreler, [Anki Deste Seçenekleri kılavuzunda](https://docs.ankiweb.net/deck-options.html) anlatıldığı gibi, geçmiş tekrar kayıtlarına bakılarak sana göre ayarlanabilir. Bir kartı zorlanmadan “İyi” veya “Kolay” diye yanıtladıkça kararlılığı kartın geçmişine göre büyür. Unuttuğunda (“Tekrar”) aralık körü körüne sıfırlanmaz; önceki kararlılığın bir kısmı korunur.',
      'Simülatörümüzün %90 hedef hatırlamayla ürettiği uzun dönem sayıları şöyle. 9.575 kartlık paketin tamamında günde 60 yeni kart açan aday yeni kartları 160 günde bitirir. Günlük ortalama 180 günde 388 kart (124 dk), 270 günde 331 kart (102 dk), 365 günde 285 karttır (86 dk). 365. günde günlük tekrar 130 karta (34 dk) düşer. Günde 40 yeni kartla 180 günlük ortalama 275 kartta (88 dk) kalır. Günde 80 yeni kartla bütün kartlar 120. günde biter ve 180. günde günlük yük 228 karta (61 dk) iner.',
      'Dersleri gruplara ayırırsan yük daha da azalır. Temel Bilimler (3.957 kart, 6 ders) günde 60 yeni kartla 66 günde biter; 180 gün sonunda günde ortalama 166 tekrar (59 dk) ister. Klinik Bilimler (4.812 kart, 5 ders) aynı tempoda 81 günde biter; 270 günlük ortalaması günde 160 tekrardır (54 dk). Hedef hatırlamayı %90 yerine %95 yaparsan aralıklar daralır ve toplam tekrar yükün gereksiz yere katlanır.',
    ],
    table: {
      caption: 'FSRS-6 ile klasik SM-2 zamanlayıcısının TUS çalışmasındaki temel farkları',
      headers: ['Özellik', 'Klasik SM-2', 'FSRS-6'],
      rows: [
        ['Hatırlama hedefi', 'Dolaylı: sabit kolaylık çarpanı (%250 başlangıç)', 'Açık hedef: seçtiğin hatırlama oranı (ör. %90)'],
        ['Zor kartlar', '“Tekrar” dedikçe çarpan düşer, kart aşırı sık gelir (ease hell)', 'Kararlılık ve zorluk ayrı ayrı güncellenir'],
        ['Günlük tekrar', 'Aynı hatırlama için daha fazla tekrar', 'Aynı hatırlama için ortalama %20–30 daha az tekrar'],
        ['Kişiye göre ayar', 'Aralığı ve kolaylığı elle ayarlarsın', 'Parametreler kendi tekrar geçmişinden hesaplanır'],
        ['Sınava göre tempo', 'Çarpan sabit olduğu için az esner', 'Hedef hatırlamayı %88–%92 arasında ayarlayabilirsin'],
      ],
    },
    actionSteps: [
      'FSRS-6’yı aç ve hedef hatırlama oranını varsayılan %90’da bırak. %95’e çekersen tekrar yükün katlanır.',
      'Yanıt düğmelerini dürüst kullan. Hatırlayamadıysan “Tekrar”, zorlanarak hatırladıysan “Zor”, normal hatırladıysan “İyi” de. Bilmediğin kartı kolay diye işaretlemek hesabı bozar.',
      'İlk 1.000 tekrarın birikince FSRS parametrelerini kendi çalışma geçmişine göre yeniden hesaplat.',
      'Yoğun dönemlerde günlük yeni kart sayını 40–60 arasında tut. Kartların kararlılığı arttıkça günlük yük kendiliğinden azalır.',
    ],
    boundaryNote:
      '%20–30 daha az tekrar, açık FSRS karşılaştırmalarındaki ortalama değerdir. Senin kazancın kartlarının kalitesine, ön bilgine ve yanıtlarını ne kadar tutarlı verdiğine göre değişir. Bu yazı bilgi vermek için hazırlandı.',
    sources: [
      {
        label: 'A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling (ACM KDD ’22)',
        url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
        publisher: 'ACM Digital Library',
      },
      {
        label: 'The Algorithm — FSRS-6 Formülleri ve Güç Unutma Eğrisi',
        url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
        publisher: 'Open Spaced Repetition',
      },
      {
        label: 'fsrs-rs Referans Gerçekleştirimi (BSD-3-Clause)',
        url: 'https://github.com/open-spaced-repetition/fsrs-rs',
        publisher: 'Open Spaced Repetition',
      },
      {
        label: 'Anki Deste Seçenekleri — FSRS Kullanımı',
        url: 'https://docs.ankiweb.net/deck-options.html',
        publisher: 'Anki Manual',
      },
    ],
    relatedLinks: [
      { label: 'TusAnkiM FSRS kılavuzu', href: '/yardim/fsrs/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'Anki uyumlu sistem nasıl kullanılır?', href: '/rehber/tus-icin-anki-uyumlu-sistem/' },
    ],
    keywords: 'fsrs-6 nedir tus aralıklı tekrar sm2 farkı stability difficulty',
  },
  {
    slug: 'tus-icin-anki-uyumlu-sistem',
    order: 3,
    published: '2026-11-21',
    updated: '2026-11-25',
    category: 'FSRS-6 ve Uygulama',
    tone: 'Yumuşak',
    questionH1: 'TUS için Anki uyumlu sistem nasıl kullanılır?',
    seoTitle: 'TUS için Anki uyumlu sistem nasıl kullanılır? | TusAnkiM',
    seoDescription:
      'TUS için Anki uyumlu sistem nasıl kullanılır? .apkg ile deste eklersin, .colpkg ile tüm koleksiyonu taşırsın. Görseller, etiketler ve FSRS-6 ayarları burada.',
    directAnswer:
      'Anki uyumlu bir düzende kartların, şablonların, görsellerin ve tekrar geçmişin .apkg (deste) veya .colpkg (koleksiyon) paketiyle cihazdan cihaza taşınır. TusAnkiM bağımsız bir uygulamadır; .apkg ve .colpkg dosyalarını açar, FSRS-6 ile zamanlar, arayüzü Türkçedir ve verilerin cihazında kalır.',
    whyMisconceived: [
      'Birçok hekim adayı aralıklı tekrara başlarken İngilizce ayar ekranlarına, HTML/CSS şablon kodlarına ve masaüstü eklentilerine takılır. Çoğu daha ilk haftada kurulumdan vazgeçer.',
      'İkinci korku veri kaybetmektir. Cihaz ya da uygulama değiştirince tekrar geçmişinin, etiketlerin ve anatomi/histoloji görsellerinin gideceği sanılır. Oysa standart paket bu verilerin hepsini içinde taşır.',
      'Üçüncü karışıklık dosya türüdür. .apkg ile .colpkg karıştırılınca tam yedek almak isteyen yalnızca tek deste alır. Tek bir ders eklemek isteyen de bütün koleksiyonunun üzerine yazar.',
    ],
    truthParagraphs: [
      'Bir .apkg dosyası yalnızca seçtiğin desteleri taşır ve bunları mevcut koleksiyonuna ekler. İçinde notlar, kartlar, şablonlar, ses ve görseller bulunur; istersen zamanlama geçmişi de girer. Bir .colpkg dosyası ise bütün koleksiyondur: tüm desteler, ayarlar ve veritabanının o anki durumu. [Anki Resmî Dışa Aktarma Kılavuzu’nda](https://docs.ankiweb.net/exporting.html#collection-colpkg) yazdığı gibi, içe aktarınca mevcut koleksiyonunun yerini alır. Bu yüzden .colpkg açmadan önce mutlaka yedek al (otomatik ya da elle).',
      'TusAnkiM bağımsız bir projedir; Anki, [AnkiMobile](https://docs.ankimobile.net/) veya Ankitects ile resmî bir bağlantısı ya da ortaklığı yoktur. Yine de [Anki Giriş ve Temel Kavramlar kılavuzundaki](https://docs.ankiweb.net/intro.html) açık veri modeline uyar. .apkg ve .colpkg dosyalarını, boşluk doldurma (Cloze) ve görsel gizleme (Image Occlusion) kartlarını, medya dosyalarını, etiketleri ve FSRS-6 zamanlayıcısını destekler. Hepsi cihazındaki veritabanında, internet olmadan çalışır.',
      'Pratikte şöyle çalışırsın. Dershane notlarından, CSV/TSV tablolarından veya deneme yanlışlarından hazırladığın .apkg destelerini iPhone veya web tarayıcısı üzerinden koleksiyonuna eklersin. İstersen 9.575 kartlık BKA TUS koleksiyonuyla aynı ekranda çalışırsın. Bu koleksiyon 12 katalog dersini kapsar: 11 ÖSYM TUS branşı ve karışık pekiştirme için 806 kartlık Deneme ve Soru destesi. Katalogdaki FHE dersi ÖSYM sınıflamasında Fizyoloji-Histoloji-Embriyoloji adını taşır.',
      'Uygulamanın Tarayıcı ekranında deck:, tag:, flag: veya is:due gibi arama filtreleriyle yalnızca zorlandığın branşları seçebilirsin. Seçtiklerinden geçici bir Filtrelenmiş Deste (Özel Çalışma) kurarsın. Kronometre ve Çalışma Takvimi günlük süreni tek çizelgede gösterir. Notlarını tablo olarak hazırladıysan CSV/TSV içe aktarmada sütunları not alanlarıyla eşlersin.',
      'Verilerin iki yönde de taşınır. Önceki düzeninden getirdiğin desteler, not türleri (Temel, ters kartlı, Boşluk Doldurma ve Görsel Gizleme), kart şablonları, medya dosyaları ve tekrar geçmişin cihazındaki veritabanında çevrimdışı durur. Uygulama otomatik yedek alır; tek dokunuşla .colpkg veya .apkg olarak dışa da aktarırsın. Kişisel notların tek bir uygulamaya kilitlenmez ve yedek dosyasından geri yüklenir. Hazır BKA TUS paketi ise katalog koruması nedeniyle yalnızca uygulama içinde çalışır.',
    ],
    table: {
      caption: 'TUS hazırlığında Anki uyumlu paket biçimleri ve ne işe yaradıkları',
      headers: ['Dosya / özellik', 'Ne zaman kullanılır?', 'Koleksiyonuna etkisi'],
      rows: [
        ['.apkg (deste paketi)', 'Tek branş veya konu destesi eklerken ya da paylaşırken', 'Mevcut destelerine eklenir; tekrar geçmişi seçeneğe bağlıdır'],
        ['.colpkg (koleksiyon)', 'Tam yedek alırken veya cihaz değiştirirken', 'Bütün koleksiyonu değiştirir; önce yerel yedek al'],
        ['FSRS-6 ön ayarı', 'Günlük tekrar takvimini ayarlarken', 'Eski SM-2 geçmişin korunur, zamanlama FSRS-6’ya geçer'],
        ['Boşluk doldurma ve görsel gizleme', 'Anatomi atlası, mekanizma tabloları, klinik ayrımlar', 'HTML/CSS şablonu ve medya dosyaları paketin içinde korunur'],
      ],
    },
    actionSteps: [
      'Önce mevcut destelerini dışa aktar. Tek ders taşıyacaksan .apkg (zamanlama dahil), bütün arşivi taşıyacaksan .colpkg seç.',
      'İçe aktardıktan sonra Deste Seçenekleri’nden FSRS-6’yı aç ve hedef hatırlama oranını %90’da bırak.',
      'Sınavdan önceki son 30 gün için etiket ve tarayıcı filtreleriyle (ör. branş veya zorluk etiketi) bir Filtrelenmiş Deste kur.',
      'Her hafta yerel yedek al. Bunun için .colpkg dışa aktarımını ya da cihazının paylaşım menüsünü kullan.',
    ],
    boundaryNote:
      'TusAnkiM bağımsız bir yazılımdır; Anki, AnkiMobile veya Ankitects ile ortaklığı ya da resmî bağı yoktur. Masaüstü eklentileri (add-on) iPhone’da ve web’de çalışmaz. Standart kart verin ve şablonların korunur.',
    sources: [
      {
        label: 'Anki Manual — Giriş ve Paket Kavramları',
        url: 'https://docs.ankiweb.net/intro.html',
        publisher: 'Anki Manual',
      },
      {
        label: 'Anki Manual — Koleksiyon Paketleri (.colpkg) ve Dışa Aktarma',
        url: 'https://docs.ankiweb.net/exporting.html#collection-colpkg',
        publisher: 'Anki Manual',
      },
      {
        label: 'AnkiMobile Resmî Kılavuzu',
        url: 'https://docs.ankimobile.net/',
        publisher: 'AnkiMobile Manual',
      },
    ],
    relatedLinks: [
      { label: 'Anki ile birlikte kullanma rehberi', href: '/yardim/anki-ile-kullanma/' },
      { label: 'İçe ve dışa aktarma kılavuzu', href: '/yardim/ice-disa-aktarma/' },
      { label: 'FSRS-6 nasıl çalışır?', href: '/rehber/tus-icin-fsrs-6-nedir/' },
    ],
    keywords: 'anki uyumlu tus sistemi apkg colpkg içe aktarma fsrs kurulum',
  },
];
