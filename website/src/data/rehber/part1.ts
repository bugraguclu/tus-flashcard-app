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
      'Adaylar arasında “ne kadar çok kart o kadar yüksek TUS puanı” düşüncesi yaygındır. Konu kitaplarındaki her cümleyi ayrı karta bölen 25.000–35.000 kartlık mega desteler, kağıt üzerinde hiçbir detayı atlamadığı için güvenli görünür.',
      'Ancak aralıklı tekrarın gerçek maliyeti kartı ilk kez gördüğün gün değil, sonraki haftalarda biriken günlük tekrar (review) kuyruğudur. Yeni kart sayısı arttıkça yalnızca ilk öğrenme değil, 1., 3., 7. ve 30. gün tekrarları üst üste biner.',
      'ÖSYM sınav pratiğinde belirleyici olan ise pasif bilgi yığını değil; 11 ÖSYM TUS branşında şıkları birbirinden ayıran klinik ve temel ayrımları sınav sabahı hızlıca geri çağırabilmektir.',
    ],
    truthParagraphs: [
      'TusAnkiM’in açık FSRS-6 simülasyon motoru (hedef hatırlama %90) aynı çalışma temposu altında 9.575 kartlık BKA TUS koleksiyonu ile 27.341 kartlık bir mega desteyi doğrudan kıyaslar. Günde 60 yeni kart açıldığında 9.575 kart 160 günde biter; 270 günlük pencerede ortalama günlük yük 331 kartta (yaklaşık 102 dakika) kalır ve sınav yaklaştığında günlük tekrar süresi 50 dakikaya kadar düşer.',
      'Aynı 60 yeni kart/gün temposunda 27.341 kartlık bir mega deste 270 günde hâlâ tamamlanamaz (270. günde yalnızca %55,9 bellek kapsamı ve günde 656 kart / 198 dakika tekrar yükü); 365 günde dahi bitmez. Mega desteyi bitirebilmek için günde 80–140 yeni karta çıkıldığında ise tepe günlük süre 286–411 dakikaya tırmanarak soru bankası ve deneme çözümü için zaman bırakmaz.',
      'Katalog ve referans sayıları arasındaki fark da bu noktada önem taşır: BKA TUS kataloğu 12 ders (11 TUS branşı + karma pekiştirme için 806 kartlık Deneme ve Soru destesi; katalogda Fizyoloji-Histoloji-Embriyoloji kısaca FHE adıyla yer alır) altında toplam 9.575 kart ve 106 konu alt destesi sunar. ÖSYM referans analizi ise Deneme ve Soru hariç 11 resmî TUS branşında son 6 TUS’un 1.195 sorusunda %92,7 konu kapsamı ve %43,6 çözüm desteği gösterir.',
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
      'Kendi notlarınla şişmiş dev paketler yerine, her kartta tek bir ayırt edici bilgi ölçen (Cloze + klinik not) çekirdek bir koleksiyonla başla.',
      'Son 6 TUS referans cetvelinde Anatomi (%28,2 destek) veya Genel Cerrahi (%31,7 destek) gibi daha zorlu branşlarda eksik hissettiğin konulara kendi hedefli kartlarını ekle.',
      'Günlük tekrar süren 120 dakikanın üzerine kalıcı biçimde çıkıyorsa yeni kart açmayı duraklatıp yalnızca mevcut tekrarları ve deneme yanlışlarını temizle.',
    ],
    boundaryNote:
      'Süre ve kart yükü tahminleri TusAnkiM FSRS-6 simülasyon varsayımlarına dayanır; gerçek çalışma süresi okuma hızı, zorluk oranı ve kişisel tekrar düzenine göre değişir. Bu rehber eğitim planlaması amaçlıdır, resmî sınav kılavuzu yerine geçmez.',
    sources: [
      {
        label: 'FSRS — Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory (ACM KDD ’22)',
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
      'Birçok TUS adayı aralıklı tekrar uygulamalarının tamamını “1–3–7–21 gün” gibi sabit kurallar veya 1980’lerde geliştirilmiş klasik SM-2 kolaylık çarpanlarıyla aynı sanır.',
      'Sabit katsayılı SM-2 düzeninde kolay kartlar gereğinden sık, zor kartlar ise geç veya düzensiz çıkar; buna “ease hell” (kolaylık tuzağı) denir ve aylar içinde günlük tekrar kuyruğu şişer.',
      'Bazı kullanıcılar da FSRS-6’nın daha az kart göstermesinin hatırlama oranını düşüreceğinden çekinir; oysa FSRS-6 hedef hatırlama olasılığını (ör. %90) doğrudan matematiksel bir parametre olarak korur.',
    ],
    truthParagraphs: [
      'ACM KDD ’22 bildirisinde tanıtılan ve açık kaynak Open Spaced Repetition topluluğu tarafından geliştirilen FSRS (Free Spaced Repetition Scheduler), bellek dinamiğini üç temel değişkenle izler: Geri Çağrılabilirlik (Retrievability — o an hatırlama olasılığı), Kararlılık (Stability — hatırlamanın %100’den %90’a düşmesi için gereken gün sayısı) ve Zorluk (Difficulty — bilginin doğal karmaşıklığı).',
      'FSRS-6 sürümü güç yasası (power forgetting curve) tabanlı 21 parametre kullanır ve kısa dönem (gün içi) öğrenme adımlarından uzun vadeli tekrarlara kadar tek tutarlı eğri üretir. Bir kartı zorlanmadan “İyi” veya “Kolay” yanıtladıkça kararlılık sıçraması kartın geçmişine göre dinamik hesaplanır; unuttuğunda (“Tekrar”) ise ceza aralığı sıfıra çakılmak yerine önceki kararlılıktan pay alır.',
      'TusAnkiM FSRS-6 simülatörünün %90 hedef hatırlama varsayımıyla Temel Bilimler (3.957 kart) için ürettiği eğride günde 60 yeni kart açan bir aday 66 günde tüm yeni kartları bitirir; 180 gün sonunda ortalama tekrar yükü günde 166 tekrarda (59 dk) dengelenir. Klinik Bilimlerde (4.812 kart) aynı tempo 81 günde tamamlanır ve 270 gün ortalaması 160 tekrar/gün (54 dk) düzeyindedir.',
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
      'Birçok hekim adayı aralıklı tekrar sistemine başlamak istediğinde karmaşık İngilizce ayar ekranları, şablon kodları ve eklenti gereksinimleri yüzünden ilk haftada vazgeçer.',
      'Bir diğer yaygın yanılgı ise farklı bir uygulamaya geçildiğinde önceki tüm tekrar geçmişinin (revlog), etiketlerin ve görsellerin kaybolacağı korkusudur.',
      'Ayrıca bazı kullanıcılar dışa aktarma formatlarının ne zaman .apkg ve ne zaman .colpkg olması gerektiğini karıştırdığı için koleksiyon yedeği yerine yalnızca tek deste alır veya tersini yaparak mevcut destelerinin üzerine yazar.',
    ],
    truthParagraphs: [
      'Açık paket standardında .apkg bir veya birkaç seçili desteyi (notlar, kartlar, şablonlar, ses/görsel medya ve isteğe bağlı tekrar geçmişi ile) mevcut koleksiyonuna ekler. Buna karşılık .colpkg tüm koleksiyonu (bütün desteler, ayar ön ayarları ve veritabanı durumu) taşır; bu nedenle resmî Anki kılavuzunda belirtildiği üzere .colpkg içe aktarması mevcut koleksiyonun yerini alır.',
      'TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile resmî bir bağlantısı yoktur. Ancak açık .apkg ve .colpkg paket biçimlerini, Cloze (boşluk doldurma) ve Image Occlusion (görsel gizleme) kart şablonlarını, medya dosyalarını ve FSRS-6 zamanlayıcısını yerel SQLite veritabanı üzerinde destekler.',
      'Pratik TUS akışında kendi dershane notlarından ürettiğin .apkg destelerini içe aktarabilir, istersen 12 derslik (11 TUS branşı + Deneme ve Soru) 9.575 kartlık BKA TUS koleksiyonuyla aynı uygulamada birlikte çalışabilir ve istediğin an tüm kişisel destelerini yine .apkg veya .colpkg olarak dışa aktarabilirsin.',
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
  {
    slug: 'tus-puani-nasil-hesaplanir',
    order: 4,
    tone: 'Markasız',
    questionH1: 'TUS puanı nasıl hesaplanır? %5 puan kesintisi, 45 barajı ve Temel/Klinik ağırlıkları',
    seoTitle: 'TUS Puanı Nasıl Hesaplanır? %5 Kesinti & Ağırlıklar | TusAnkiM',
    seoDescription:
      'ÖSYM TUS puan hesaplama mantığı: 4 yanlış 1 doğru kuralı, Temel (%70/%30) ve Klinik (%50/%50) ağırlıkları, 45 puan barajı ve %5 kesinti yönetmeliği.',
    directAnswer:
      'TUS’ta her biri 100 soruluk Temel ve Klinik oturumlarda 4 yanlış 1 doğruyu götürür; Temel Tıp Puanı %70 Temel + %30 Klinik, Klinik Tıp Puanı ise %50 Temel + %50 Klinik standart puan ağırlıklarıyla hesaplanır. Yerleştirme için 45 puan barajı, yabancı dil yeterliliği ve yönetmelik kapsamındaki durumlarda %5 kesinti uygulanır.',
    whyMisconceived: [
      'Adaylar sıkça yalnızca Klinik Bilimler netinin Klinik TUS puanını belirlediğini düşünür; oysa Temel Bilimler puanının yarısı (%50) doğrudan Klinik Puanı içine girer.',
      'Bir başka eski alışkanlık da uzmanlık eğitimine devam edenler, istifa edenler veya yerleşip başlamayanlar için kesinti oranını eski yönetmelikteki gibi %2 sanmaktır; güncel yönetmelikte kesinti %5 olarak uygulanır.',
      'Ayrıca internetteki hesaplayıcıların verdiği puanların kesin resmî puan olduğu yanılgısı yaygındır; gerçek puan her dönemin Türkiye ortalaması ve standart sapmasına göre ÖSYM tarafından hesaplanır.',
    ],
    truthParagraphs: [
      'ÖSYM TUS kılavuzlarına göre sınav iki oturumdan oluşur: Temel Tıp Bilimleri Testi (100 soru: Anatomi, Fizyoloji-Histoloji-Embriyoloji, Biyokimya, Mikrobiyoloji, Patoloji, Farmakoloji) ve Klinik Tıp Bilimleri Testi (100 soru: Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum, Küçük Stajlar). Her iki testte de doğru sayısından yanlış sayısının dörtte biri çıkarılarak ham net elde edilir.',
      'Ham netler sınava giren adayların ortalaması ve standart sapması kullanılarak standart puana dönüştürülür. Ağırlıklı Mesleki Bilgi Puanı hesaplanırken Temel Tıp Puanı için Temel standart puanına 0,7 ve Klinik standart puanına 0,3 katsayısı; Klinik Tıp Puanı için ise her iki alana eşit 0,5 + 0,5 katsayısı verilir. İlgili puan türünde tercih yapabilmek için en az 45 puan almak gerekir.',
      'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği uyarınca bir uzmanlık programında eğitim görürken sınava girenlerin, eğitimden istifa edenlerin veya ÖSYM tarafından yerleştirilip süresi içinde başlamayanların ilk sınavında mesleki bilgi puanında %5 oranında kesinti yapılır. Ayrıca tercih yapabilmek için son 5 yıl içinde YDS, e-YDS, TIPDİL veya eşdeğeri bir sınavdan en az 50 yabancı dil puanı şartı aranır.',
    ],
    table: {
      caption: 'TUS oturum ağırlıkları, baraj ve kesinti kuralları özeti',
      headers: ['Bileşen', 'Kural / Oran', 'Resmî Dayanak ve Etkisi'],
      rows: [
        ['Ham Net Hesabı', 'Doğru − (Yanlış / 4)', '100 Temel + 100 Klinik toplam 200 soru üzerinde hesaplanır'],
        ['Temel Tıp Puanı (T)', '%70 Temel + %30 Klinik ağırlık', 'Temel bilimler uzmanlık alanları tercihinde esas alınır'],
        ['Klinik Tıp Puanı (K)', '%50 Temel + %50 Klinik ağırlık', 'Klinik branşlar için Temel neti de puanın yarısını belirler'],
        ['Tercih Barajı', '45,000 puan', 'İlgili puan türünde 45 altı tercih hakkı vermez'],
        ['Puan Kesintisi', '%5 kesinti (× 0,95)', 'Uzmanlığa devam, istifa veya yerleşip başlamama sonrası ilk sınavda'],
        ['Yabancı Dil Şartı', 'En az 50 puan (son 5 yıl)', 'YDS / TIPDİL / ÖSYM eşdeğer belgesi tercih ön koşuludur'],
      ],
    },
    actionSteps: [
      'Klinik branş hedefliyorsan Temel Bilimleri ihmal etme: Klinik puanının %50’si Temel netlerinden gelir.',
      'Deneme sonrası netlerini TUS Puan Hesaplayıcıya girerken önceki yerleştirme veya istifa durumun varsa %5 kesinti seçeneğini mutlaka işaretle.',
      'Sınav sonucunun ardından yalnızca ham puana değil, o dönemin kontenjan dağılımına ve kendi sıralama bandına göre 30 tercih listesi oluştur.',
      'Yabancı dil belgenin 5 yıllık geçerlilik süresini başvuru takviminden önce ÖSYM sisteminden kontrol et.',
    ],
    boundaryNote:
      'Buradaki formül ve katsayı açıklamaları genel bilgilendirme amaçlıdır; dönemlik ortalama, standart sapma ve iptal edilen sorular resmî sonucu değiştirebilir. Kesin kurallar için her dönem yayımlanan güncel ÖSYM TUS Kılavuzu ve Resmî Gazete mevzuatı esas alınmalıdır.',
    sources: [
      {
        label: 'ÖSYM — Tıpta Uzmanlık Eğitimi Giriş Sınavı (TUS) Genel Bilgiler ve Kılavuzlar',
        url: 'https://www.osym.gov.tr/TR,14991/tipta-uzmanlik-egitimi-giris-sinavi.html',
        publisher: 'ÖSYM',
      },
      {
        label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (Resmî Gazete, Sayı 31942)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'ÖSYM — TUS Çıkmış Sınav Soruları Arşivi',
        url: 'https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'İnteraktif TUS Puan Hesaplayıcı', href: '/puan-hesapla/' },
      { label: '2027 TUS tarihleri ve çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: '11 ÖSYM TUS Branş Referansı', href: '/referanslar/' },
    ],
    keywords: 'tus puanı nasıl hesaplanır %5 kesinti 45 barajı temel klinik ağırlık',
  },
];
