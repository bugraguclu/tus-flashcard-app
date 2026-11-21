import type { RehberArticle } from './types';

export const REHBER_PART_1: RehberArticle[] = [
  {
    slug: 'tusta-kac-kart-calisilmali',
    order: 1,
    tone: 'Markalı',
    questionH1: "TUS'ta kaç kart çalışılmalı? 9.575 kart mı, 30.000 kartlık mega deste mi?",
    seoTitle: "TUS'ta Kaç Kart Çalışılmalı? 9.575 vs Mega Deste | TusAnkiM",
    seoDescription:
      'FSRS-6 simülasyonuyla 9.575 kartlık odaklanmış TUS destesi ile 27.341+ kartlık mega destelerin günlük tekrar yükü ve bitirme süresi karşılaştırması.',
    directAnswer:
      'Çoğu TUS adayı için bitirilebilir ve sürdürülebilir çekirdek hacim yaklaşık 9.500–10.000 kart bandıdır. Günde 60 yeni kart temposunda 9.575 kartlık BKA TUS destesi 160 günde biterken, 27.341 kartlık bir mega deste 270 günde bile tamamlanmaz ve son aylarda günlük 3 saati aşan tekrar yükü biriktirir.',
    whyMisconceived: [
      'TUS adayları arasında “ne kadar çok kart o kadar yüksek TUS puanı” düşüncesi oldukça yaygındır. Konu kitaplarındaki her cümleyi ve dipnotu ayrı karta bölen 25.000–35.000 kartlık mega desteler, kağıt üzerinde hiçbir detayı atlamadığı için ilk bakışta daha güvenli görünür.',
      'Ancak aralıklı tekrarın gerçek maliyeti bir kartı ilk kez gördüğün gün değil, sonraki haftalarda ve aylarda biriken günlük tekrar (review) kuyruğudur. Yeni kart sayısı arttıkça yalnızca ilk öğrenme süresi değil, 1., 3., 7., 21. ve 60. gün tekrarları üst üste biner ve deneme çözmek için gereken zamanı tüketir.',
      'ÖSYM sınav pratiğinde belirleyici olan da pasif bilgi yığını ezberlemek değildir; 11 ÖSYM TUS branşında şıkları birbirinden ayıran tanısal ipuçlarını, ilk tetkik ve tedavi basamaklarını ve mekanizma ayrımlarını sınav sabahı hızlıca geri çağırabilmektir.',
    ],
    truthParagraphs: [
      'TusAnkiM’in [FSRS-6 algoritma şartnamesi](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) ile uyumlu açık simülasyon motoru (%90 hedef hatırlama varsayımıyla) 9.575 kartlık BKA TUS koleksiyonu ile 27.341 kartlık bir mega desteyi aynı tempoda doğrudan kıyaslar. Günde 60 yeni kart açıldığında 9.575 kart 160 günde biter; 180 gün sonunda hafızada 9.044 kart (%94,5) kalıcılaşır, 270 günlük pencerede ortalama günlük yük 331 kartta (102 dk) kalır ve 270. güne gelindiğinde günlük tekrar süresi 50 dakikaya (187 kart) kadar iner.',
      'Aynı 60 yeni kart/gün temposunda 27.341 kartlık bir mega deste ise 270 günde hâlâ tamamlanamaz; 270. günde yalnızca 16.200 kart tanıtılmış (%55,9 bellek kapsamı) ve günlük yük 656 karta (198 dk) çıkmıştır. 365 günde dahi bitmez. Mega desteyi bitirebilmek için günde 80–140 yeni karta çıkıldığında tepe günlük süre 286–411 dakikaya tırmanır; bu durum [ACM KDD ’22 FSRS çalışmasında](https://dl.acm.org/doi/10.1145/3534678.3539081) incelenen unutma dinamiğinin aşırı yeni-kart yığılmasıyla nasıl bir tekrar borcu ürettiğini gösterir.',
      'Katalog ve referans sayıları arasındaki fark da çalışma kapsamını doğru okumak için kritiktir: BKA TUS kataloğu 12 ders (3.957 kartlık 6 Temel Bilimler dersi, 4.812 kartlık 5 Klinik Bilimler dersi ve karma pekiştirme için 806 kartlık Deneme ve Soru destesi; katalogda Fizyoloji-Histoloji-Embriyoloji kısaca FHE adıyla yer alır) altında toplam 9.575 kart, 7.721 not ve 106 konu alt destesi sunar. [ÖSYM TUS çıkmış sorular arşivi](https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html) esas alınarak yapılan ön sınıflamada ise Deneme ve Soru hariç 11 resmî TUS branşındaki 1.195 soruda %92,7 konu kapsamı (1.108/1.195) ve %43,6 çözüm desteği (521/1.195) raporlanır.',
    ],
    table: {
      caption: 'FSRS-6 simülasyonuna göre (%90 hatırlama hedefi) 9.575 kartlık çekirdek deste ve 27.341 kartlık mega deste karşılaştırması',
      headers: ['Deste Hacmi', 'Günlük Yeni Kart', 'Tamamlanma Süresi', '270 Günde Günlük Ort.', 'Tepe Günlük Süre'],
      rows: [
        ['9.575 kart (BKA TUS)', '40 yeni / gün', '240 gün', '298 kart (93 dk)', '133 dk'],
        ['9.575 kart (BKA TUS)', '60 yeni / gün', '160 gün', '331 kart (102 dk)', '173 dk'],
        ['9.575 kart (BKA TUS)', '80 yeni / gün', '120 gün', '345 kart (105 dk)', '206 dk'],
        ['27.341 kart (Mega Deste)', '60 yeni / gün', '365 günde bitmez', '474 kart (149 dk)', '221+ dk (270. gün 198 dk)'],
        ['27.341 kart (Mega Deste)', '80 yeni / gün', '342 gün', '627 kart (197 dk)', '286 dk (944 kart)'],
      ],
    },
    actionSteps: [
      'Önce sınava kalan gününü netleştir: 6–9 aylık bir hazırlıkta günde 40–60 yeni kart bandı hem konu okumayı hem deneme çözmeyi korur.',
      'Kopya cümlelerle şişmiş dev paketler yerine, her kartta tek bir ayırt edici bilgi ölçen (Cloze + klinik not) çekirdek bir koleksiyonla başla.',
      'Son 6 TUS referans cetvelinde Anatomi (%28,2 destek) veya Genel Cerrahi (%31,7 destek) gibi daha zorlu branşlarda eksik hissettiğin konulara kendi hedefli kartlarını ekle.',
      'Günlük tekrar süren 120 dakikanın üzerine kalıcı biçimde çıkıyorsa yeni kart açmayı duraklatıp yalnızca mevcut tekrarları ve deneme yanlışlarını temizle.',
    ],
    boundaryNote:
      'Süre ve kart yükü tahminleri TusAnkiM FSRS-6 simülasyon varsayımlarına dayanır; gerçek çalışma süresi okuma hızı, zorluk oranı ve kişisel tekrar düzenine göre değişir. Bu rehber eğitim planlaması amaçlıdır, resmî sınav kılavuzu yerine geçmez.',
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
        label: 'ÖSYM TUS Çıkmış Sınav Soruları Arşivi',
        url: 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'FSRS-6 nedir rehberi', href: '/rehber/tus-icin-fsrs-6-nedir/' },
      { label: 'Son 6 TUS 11 Branş Referansları', href: '/referanslar/' },
      { label: 'TUS Kartları Kılavuzu', href: '/yardim/tus-kartlari/' },
      { label: '2027 TUS Çalışma Planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
    ],
    keywords: 'tus kaç kart çalışılmalı 9575 30000 mega deste fsrs günlük yük',
  },
  {
    slug: 'tus-icin-fsrs-6-nedir',
    order: 2,
    tone: 'Yumuşak',
    questionH1: 'TUS için FSRS-6 nedir? Klasik tekrarlara göre neden %20–30 daha az kart çözdürür?',
    seoTitle: 'TUS İçin FSRS-6 Nedir? SM-2 İle Farkı | TusAnkiM',
    seoDescription:
      'FSRS-6 (Free Spaced Repetition Scheduler v6) algoritmasının bellek kararlılığı, güç unutma eğrisi ve TUS hazırlığında %20–30 daha az tekrar yükü sağlaması.',
    directAnswer:
      'FSRS-6, her bilgi kartının bellek kararlılığını (stability) ve zorluğunu (difficulty) ayrı modelleyerek seni tam unutmak üzere olduğun günde tekrar ettiren modern bir aralıklı tekrar algoritmasıdır. Aynı %90 hatırlama oranına ulaşmak için klasik SM-2 tabanlı zamanlayıcılara kıyasla ortalama %20–30 daha az günlük tekrar gerektirir.',
    whyMisconceived: [
      'Birçok TUS adayı aralıklı tekrar uygulamalarının tamamını “1–3–7–21 gün” gibi sabit takvim kurallarıyla veya 1980’lerde geliştirilmiş klasik SM-2 kolaylık çarpanlarıyla aynı sanır; bu yüzden kart tekrarlarını kişiselleşemeyen katı bir liste olarak görür.',
      'Sabit katsayılı SM-2 düzeninde kolay kartlar gereğinden sık, zor klinik ayrımlar ise düzensiz aralıklarla karşına çıkar. “Tekrar” butonuna birkaç kez basıldığında kolaylık çarpanı kalıcı düşer (“ease hell” / kolaylık tuzağı) ve aylar içinde günlük tekrar kuyruğu içinden çıkılmaz biçimde şişer.',
      'Bazı kullanıcılar da FSRS-6’nın daha az günlük kart göstermesinin sınav günü hatırlama oranını düşüreceğinden çekinir; oysa FSRS-6 hedef hatırlama olasılığını (ör. %90) rastgele azaltmak yerine doğrudan matematiksel bir hedef değişken olarak korur.',
    ],
    truthParagraphs: [
      'Ye ve arkadaşlarının [ACM KDD ’22 bildirisinde](https://dl.acm.org/doi/10.1145/3534678.3539081) temeli atılan ve açık kaynak [awesome-fsrs algoritma şartnamesinde](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) detaylandırılan FSRS (Free Spaced Repetition Scheduler), bellek dinamiğini DSR modeliyle izler: Geri Çağrılabilirlik (Retrievability — o an hatırlama olasılığı), Kararlılık (Stability — hatırlamanın %100’den %90’a inmesi için gereken gün sayısı) ve Zorluk (Difficulty — bilginin 1–10 arası doğal karmaşıklığı).',
      'FSRS-6 sürümü güç yasası (power forgetting curve) tabanlı 21 parametre kullanır ve 17 veya 19 parametreli eski FSRS kayıtlarıyla da geriye dönük uyumlu çalışır; referans kodu [fsrs-rs açık deposunda](https://github.com/open-spaced-repetition/fsrs-rs) yayımlanır ve [Anki Deste Seçenekleri kılavuzunda](https://docs.ankiweb.net/deck-options.html) anlatıldığı biçimde geçmiş tekrar günlüklerinden (revlog) kişiselleştirilebilir. Bir kartı zorlanmadan “İyi” veya “Kolay” yanıtladıkça kararlılık sıçraması kartın geçmişine göre dinamik büyür; unuttuğunda (“Tekrar”) ise aralık körü körüne sıfırlanmak yerine önceki kararlılıktan pay alır.',
      'TusAnkiM FSRS-6 simülatörünün %90 hedef hatırlama varsayımıyla ürettiği uzun dönem eğrilerde fark net biçimde görülür: tüm 9.575 kartlık pakette günde 60 yeni kart açan bir aday 160 günde tüm yeni kartları bitirir; 180 gün ortalaması 388 kart (124 dk/gün), 270 gün ortalaması 331 kart (102 dk/gün) ve 365 gün ortalaması 285 kart (86 dk/gün) düzeyindedir. Üstelik 365. güne gelindiğinde günlük tekrar yükü yalnızca 130 karta (34 dk/gün) kadar düşer. Aynı 180 günlük pencerede günde 40 yeni kartla ortalama yük 275 kartta (88 dk/gün) kalırken, günde 80 yeni kartta tüm havuz 120. günde biter ve 180. günde günlük yük 61 dakikaya (228 kart) iner.',
      'Grup bazında plan yapıldığında yük daha da yönetilebilir olur: Temel Bilimler (3.957 kart, 6 ders) günde 60 yeni kartla 66 günde tamamlanır ve 180 gün sonunda ortalama 166 tekrar/gün (59 dk) gerektirir. Klinik Bilimlerde (4.812 kart, 5 ders) aynı tempo 81 günde biter ve 270 gün ortalaması 160 tekrar/gün (54 dk) düzeyinde kalır. Hedef hatırlamayı %90 yerine %95’e çekmek ise aralıkları daraltarak toplam tekrar yükünü gereksiz yere katlar.',
    ],
    table: {
      caption: 'FSRS-6 ile klasik SM-2 zamanlayıcı yaklaşımının TUS çalışma pratiğindeki temel farkları',
      headers: ['Özellik', 'Klasik SM-2 Yaklaşımı', 'FSRS-6 (Güç Unutma Eğrisi)'],
      rows: [
        ['Hatırlama hedefi', 'Dolaylı sabit kolaylık çarpanı (%250 başlangıç)', 'Açık hedef olasılık (ör. %90 Desired Retention)'],
        ['Zor kart davranışı', 'Tekrar düşüşüyle aşırı sık tekrar (ease hell)', 'Kararlılık ve zorluk bağımsız güncellenir'],
        ['Günlük tekrar hacmi', 'Aynı hatırlama için daha yüksek tekrar yükü', 'Aynı hatırlama için ortalama %20–30 daha az tekrar'],
        ['Kişiselleştirme', 'Manuel aralık ve kolaylık ayarı gerektirir', 'Kendi tekrar geçmişinle (revlog) parametre optimize edilir'],
        ['Sınava göre tempo', 'Sabit çarpan nedeniyle esnekliği sınırlı', 'Hedef hatırlamayı %88–%92 arası ayarlama imkânı'],
      ],
    },
    actionSteps: [
      'FSRS-6’yı etkinleştir ve başlangıçta varsayılan %90 hedef hatırlama oranıyla (Desired Retention = 0.90) başla; %95’e çekmek tekrar yükünü katlar.',
      'Yanıt butonlarını dürüst kullan: hatırlayamadığında mutlaka “Tekrar”, zorlanarak hatırladığında “Zor”, normal hatırlamada “İyi” ver; algoritmayı bozan yapay kolay işaretlemelerden kaçın.',
      'İlk 1.000 tekrarını biriktirdikten sonra kendi çalışma geçmişine göre FSRS parametre optimizasyonunu çalıştır.',
      'Yüksek hacimli dönemlerde günlük yeni kart sayısını 40–60 aralığında tutarak FSRS-6’nın kararlılık eğrisinin yükü eritmesine izin ver.',
    ],
    boundaryNote:
      '%20–30 tekrar azalması açık FSRS karşılaştırmalarındaki ortalama değerdir; bireysel kazanç kart kalitesine, önceki bilgi düzeyine ve yanıt tutarlılığına göre değişir. Eğitim amaçlı bilgidir.',
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
      { label: 'TusAnkiM FSRS Kılavuzu', href: '/yardim/fsrs/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'Anki uyumlu sistem nasıl kullanılır?', href: '/rehber/tus-icin-anki-uyumlu-sistem/' },
    ],
    keywords: 'fsrs-6 nedir tus aralıklı tekrar sm2 farkı stability difficulty',
  },
  {
    slug: 'tus-icin-anki-uyumlu-sistem',
    order: 3,
    tone: 'Yumuşak',
    questionH1: 'TUS için Anki uyumlu sistem nasıl kullanılır? (.apkg, .colpkg ve FSRS-6 kurulumu)',
    seoTitle: 'TUS İçin Anki Uyumlu Sistem: .apkg & FSRS-6 | TusAnkiM',
    seoDescription:
      'TUS hazırlığında .apkg ve .colpkg Anki paket biçimleri, medya/etiket aktarımı, FSRS-6 ayarları ve yerel öncelikli çalışma akışı rehberi.',
    directAnswer:
      'Anki uyumlu bir TUS çalışma düzeninde kartların, HTML şablonların, görsellerin ve tekrar geçmişin açık .apkg (deste) veya .colpkg (koleksiyon) paketleriyle cihazlar arasında taşınır. TusAnkiM bağımsız ve yerel öncelikli bir uygulama olarak .apkg/.colpkg dosyalarını ve FSRS-6 zamanlayıcısını doğrudan Türkçe arayüzle destekler.',
    whyMisconceived: [
      'Birçok hekim adayı aralıklı tekrar sistemine başlamak istediğinde karmaşık İngilizce ayar ekranları, HTML/CSS şablon kodları ve masaüstü eklenti (add-on) gereksinimleri yüzünden daha ilk haftada sistemi kurmaktan vazgeçer.',
      'Bir diğer yaygın yanılgı ise cihaz veya uygulama değiştirildiğinde önceki tüm tekrar geçmişinin (revlog), etiket hiyerarşisinin ve anatomi/histoloji görsellerinin kaybolacağı endişesidir; oysa standart paket yapısı bu verileri doğrudan içinde taşır.',
      'Ayrıca birçok kullanıcı dışa aktarma formatlarının ne zaman .apkg ve ne zaman .colpkg olması gerektiğini karıştırdığı için tam koleksiyon yedeği yerine yalnızca tek deste alır ya da tam tersine, tek bir yeni ders eklemek isterken koleksiyonun üzerine yazar.',
    ],
    truthParagraphs: [
      'Açık paket standardında bir .apkg dosyası yalnızca seçili bir veya birkaç desteyi (notlar, kartlar, şablonlar, ses/görsel medya ve isteğe bağlı zamanlama geçmişiyle birlikte) mevcut koleksiyonuna ekler. Buna karşılık [Anki Resmî Dışa Aktarma Kılavuzu’nda](https://docs.ankiweb.net/exporting.html#collection-colpkg) açıkça belirtildiği üzere .colpkg dosyası bütün koleksiyonu (tüm desteler, ayar ön ayarları ve veritabanı durumu) kapsar ve içe aktarıldığında mevcut koleksiyonun yerini alır; bu yüzden .colpkg açmadan önce mutlaka otomatik veya elle yedek alınmalıdır.',
      'TusAnkiM bağımsız bir projedir; Anki, [AnkiMobile](https://docs.ankimobile.net/) veya Ankitects ile resmî bir bağlantısı ya da ortaklığı yoktur. Ancak [Anki Giriş ve Temel Kavramlar kılavuzundaki](https://docs.ankiweb.net/intro.html) açık veri modeline uygun biçimde `.apkg` ve `.colpkg` dosyalarını, Cloze (boşluk doldurma) ve Image Occlusion (görsel gizleme) kart şablonlarını, medya eklerini, etiketleri ve FSRS-6 zamanlayıcısını tamamen çevrimdışı çalışan yerel SQLite veritabanı üzerinde destekler.',
      'Pratik TUS çalışma akışında kendi dershane notlarından, CSV/TSV tablolarından veya deneme yanlışlarından ürettiğin `.apkg` destelerini iPhone veya Web tarayıcı üzerinden koleksiyonuna ekleyebilir, istersen 12 katalog dersini (11 ÖSYM TUS branşı + karma pekiştirme için 806 kartlık Deneme ve Soru destesi; katalogdaki FHE dersi ÖSYM sınıflamasında Fizyoloji-Histoloji-Embriyoloji adını taşır) kapsayan 9.575 kartlık BKA TUS koleksiyonuyla aynı ekranda çalışabilirsin.',
      'Tarayıcı ekranında `deck:`, `tag:`, `flag:` veya `is:due` gibi arama filtreleriyle yalnızca zorlandığın branşları seçip geçici bir Filtrelenmiş Deste (Özel Çalışma) kurabilir, Kronometre ve Çalışma Takvimi ile günlük süreni tek çizelgede takip edebilirsin. Kişisel notlarını tablo biçiminde hazırladıysan CSV/TSV içe aktarma ile sütunları doğrudan not alanlarına eşleyebilirsin.',
      'Veri taşınabilirliği iki yönlü korunur: önceki çalışma düzeninden getirdiğin kişisel desteler, not türleri (Temel, ters kartlı, Boşluk Doldurma / Cloze ve Görsel Gizleme), kart şablonları, medya ekleri ve tekrar geçmişin cihazındaki yerel SQLite veritabanında çevrimdışı saklanır. Uygulama otomatik yedeklerin yanı sıra tek dokunuşla `.colpkg` veya `.apkg` dışa aktarımına da izin verir; böylece kişisel notların hiçbir biçimde tek bir uygulamaya kilitlenmez ve yedek dosyasından kolayca geri yüklenebilir. Hazır BKA TUS paketi ise katalog koruması nedeniyle yalnızca uygulama içinde güvenle çalışır.',
    ],
    table: {
      caption: 'TUS hazırlığında Anki uyumlu paket biçimleri ve kullanım amaçları',
      headers: ['Dosya / Özellik', 'Ne Zaman Kullanılır?', 'Mevcut Koleksiyona Etkisi'],
      rows: [
        ['.apkg (Deste Paketi)', 'Tek branş veya konu destesi ekleme / paylaşma', 'Mevcut destelere eklenir; tekrar geçmişi seçeneğe bağlıdır'],
        ['.colpkg (Koleksiyon)', 'Tam yedek alma veya cihaz değiştirme', 'Tüm koleksiyonu değiştirir; öncesinde yerel yedek alınmalıdır'],
        ['FSRS-6 Ön Ayarı', 'Günlük tekrar takvimi optimizasyonu', 'Eski SM-2 geçmişini koruyarak modern zamanlamaya geçer'],
        ['Cloze & Görsel Gizleme', 'Anatomi atlası, mekanizma tabloları, klinik ayrımlar', 'HTML/CSS şablonu ve medya eki paket içinde korunur'],
      ],
    },
    actionSteps: [
      'Önce mevcut destelerini dışa aktar: tek ders aktaracaksan .apkg (zamanlama dahil), tüm arşivi taşıyacaksan .colpkg seç.',
      'İçe aktarma sonrası Deste Seçenekleri bölümünden FSRS-6 zamanlayıcısını aç ve hedef hatırlama oranını %90 olarak bırak.',
      'Etiket ve tarayıcı filtreleriyle (ör. branş veya zorluk etiketi) sınav öncesi son 30 gün için özel tekrar destesi (Filtrelenmiş Deste) oluştur.',
      'Haftalık düzenli olarak yerel yedek alma alışkanlığı edin; .colpkg veya cihaz paylaşım menüsünü kullan.',
    ],
    boundaryNote:
      'TusAnkiM bağımsız bir yazılımdır; Anki, AnkiMobile veya Ankitects ile ortaklık/resmî bağ iddia etmez. Harici eklenti (add-on) masaüstü betikleri iOS/Web ortamında doğrudan çalışmaz; standart kart verisi ve şablonlar korunur.',
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
