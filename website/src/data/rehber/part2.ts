import type { RehberArticle } from './types';

export const REHBER_PART_2: RehberArticle[] = [
  {
    slug: 'tus-puani-nasil-hesaplanir',
    order: 4,
    tone: 'Markasız',
    questionH1: 'TUS puanı nasıl hesaplanır? %5 kesinti ve 45 barajı',
    seoTitle: 'TUS puanı nasıl hesaplanır? %5 kesinti kuralı | TusAnkiM',
    seoDescription:
      'TUS puanı nasıl hesaplanır? 4 yanlış 1 doğruyu götürür. Klinik puanı %40 Temel + %60 Klinik, Temel puanı %60 + %40. 45 barajı ve %5 kesinti kuralı.',
    directAnswer:
      'TUS’ta Temel ve Klinik oturumların her biri 100 sorudur ve 4 yanlış 1 doğruyu götürür. Klinik Tıp Puanı %40 Temel + %60 Klinik, Temel Tıp Puanı %60 Temel + %40 Klinik standart puanla hesaplanır. Yerleşmek için 45 puan barajını ve yabancı dil şartını geçmen gerekir; yönetmelikteki durumlarda puanından %5 kesilir.',
    whyMisconceived: [
      'Adaylar sıkça Klinik TUS puanını yalnızca Klinik netin belirlediğini düşünür. Oysa Klinik puanın %40’ı Temel Bilimler standart puanından gelir. Yüksek puanlarda farkı çoğu zaman bu pay açar.',
      'İkinci yanılgı kesinti oranıdır. Uzmanlık eğitimine devam edenler, istifa edenler ve yerleşip süresi içinde başlamayanlar için oran hâlâ eski mevzuattaki gibi %2 sanılır. Yürürlükteki yönetmelikte ilk sınavda kesinti %5’tir.',
      'Üçüncüsü, deneme sonrası internetteki hesaplayıcılardan çıkan tahmini puanı kesin puan sanmaktır. Gerçek yerleştirme puanını ÖSYM belirler; her dönemin Türkiye ortalamasına, standart sapmasına ve iptal edilen sorulara bakar.',
    ],
    truthParagraphs: [
      '[ÖSYM’nin 2026-TUS 2. Dönem Başvuru Kılavuzu’na](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre sınav iki oturumdur. Temel Tıp Bilimleri Testi 100 sorudur: Anatomi, Fizyoloji-Histoloji-Embriyoloji, Biyokimya, Mikrobiyoloji, Patoloji ve Farmakoloji. Klinik Tıp Bilimleri Testi de 100 sorudur: Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum ve Küçük Stajlar. İki testte de ham netin, doğru sayından yanlış sayının dörtte biri çıkarılarak bulunur. Soru dağılımı örneklerine [ÖSYM’nin yayımladığı çıkmış sorulardan](/tus-cikmis-sorular-ve-analiz/) bakabilirsin.',
      'Ham netler her test için ayrı ayrı, ortalaması 50 ve standart sapması 10 olan standart puana çevrilir. Kılavuza göre Klinik Tıp Puanı için Temel standart puanı 0,4, Klinik standart puanı 0,6 ile çarpılır. Temel Tıp Puanı için tersi geçerlidir: Temel 0,6, Klinik 0,4. Çıkan ağırlıklı puanlar, en yükseği 85 olacak şekilde K ve T puanına dönüştürülür. Bir örnek verelim. Temel’de 65 doğru 20 yanlış (60,00 net), Klinik’te 68 doğru 18 yanlış (63,50 net) yapan adayın toplam neti 123,50’dir. Hesaplayıcımızın tahminiyle bu aday yaklaşık 63,3 Klinik ve 62,9 Temel puan alır. İki puan türünde de 45,000 tercih barajını geçer.',
      'Kesinti kuralı [Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği’nde](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) yazar; oranı %2’den %5’e [16 Mayıs 2024 tarihli değişiklik](https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm) çıkardı. Kesinti üç durumda uygulanır: bir uzmanlık programında okurken sınava girersen, eğitimden istifa edersen ya da ÖSYM seni yerleştirdiği hâlde süresi içinde göreve başlamazsan. Takip eden ilk sınavında mesleki bilgi puanından %5 kesilir (× 0,95). Örneğin 65,0 hesaplanan ham klinik puan kesintiden sonra 61,75’e iner. Kesinti varken 65 net puan hedefliyorsan yaklaşık 68,4 ham puana, yani yaklaşık 143 toplam nete çıkman gerekir.',
      'Tercihte yalnızca puanın belirleyici olmaz; sıralaman ve kontenjan dağılımı da sonucu etkiler. Tercih yapabilmek için son 5 yıl içinde YDS, e-YDS, TIPDİL veya ÖSYM’nin eşdeğer saydığı bir sınavdan en az 50 yabancı dil puanı almış olman gerekir. 30 tercihin başına en çok istediğin programları, ortasına sıralamana uyan gerçekçi seçenekleri, sonuna güvenli tercihleri yaz.',
    ],
    table: {
      caption: 'TUS oturum ağırlıkları, baraj ve kesinti kurallarının özeti',
      headers: ['Bileşen', 'Kural / oran', 'Dayanağı ve etkisi'],
      rows: [
        ['Ham net hesabı', 'Doğru − (Yanlış / 4)', '100 Temel + 100 Klinik, toplam 200 soru üzerinden hesaplanır'],
        ['Temel Tıp Puanı (T)', '%60 Temel + %40 Klinik', 'Temel bilimler uzmanlık alanlarının tercihinde kullanılır'],
        ['Klinik Tıp Puanı (K)', '%40 Temel + %60 Klinik', 'Klinik branşlarda puanın %40’ını Temel netin belirler'],
        ['Tercih barajı', '45,000 puan', 'İlgili puan türünde 45’in altı tercih hakkı vermez'],
        ['Puan kesintisi', '%5 kesinti (× 0,95)', 'Uzmanlığa devam, istifa veya yerleşip başlamama sonrası ilk sınavda'],
        ['Yabancı dil şartı', 'En az 50 puan (son 5 yıl)', 'YDS / TIPDİL / ÖSYM eşdeğer belgesi olmadan tercih yapılmaz'],
      ],
    },
    actionSteps: [
      'Klinik branş hedefliyorsan Temel Bilimleri ihmal etme. Klinik puanının %40’ı Temel netinden gelir.',
      'Deneme netlerini TUS Puan Hesaplayıcıya girerken, daha önce yerleştiysen veya istifa ettiysen %5 kesinti seçeneğini işaretle.',
      'Sonuç açıklanınca 30 tercihlik listeni yalnızca ham puana göre yapma. O dönemin kontenjan dağılımına ve kendi sıralamana bak.',
      'Yabancı dil belgenin 5 yıllık geçerlilik süresini başvuru takviminden önce ÖSYM sisteminden kontrol et.',
    ],
    boundaryNote:
      'Buradaki formül ve katsayılar genel bilgidir. Dönemin ortalaması, standart sapması ve iptal edilen sorular resmî sonucu değiştirebilir. Kesin kurallar için her dönem yayımlanan güncel ÖSYM TUS Kılavuzu’na ve Resmî Gazete’deki mevzuata bak.',
    sources: [
      {
        label: 'ÖSYM — 2026-TUS 2. Dönem Başvuru Kılavuzu (4. Değerlendirme İşlemleri)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (Resmî Gazete, Sayı 31942)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'Uzmanlık Eğitimi Yönetmeliğinde Değişiklik: %2 → %5 kesinti (Resmî Gazete, 16 Mayıs 2024, Sayı 32548)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'TusAnkiM — TUS çıkmış soru analizi (son 6 sınav, 1.195 soru)',
        url: 'https://tusankim.com/tus-cikmis-sorular-ve-analiz/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'TUS puan hesaplayıcı', href: '/puan-hesapla/' },
      { label: '2027 TUS tarihleri ve çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: '11 ÖSYM TUS branşının referansları', href: '/referanslar/' },
    ],
    keywords: 'tus puanı nasıl hesaplanır %5 kesinti 45 barajı temel klinik ağırlık',
  },
  {
    slug: '2027-tus-tarihleri-ve-calisma-plani',
    order: 5,
    tone: 'Markasız',
    questionH1: '2027 TUS tarihleri neler, kalan güne göre nasıl çalışılır?',
    seoTitle: '2027 TUS tarihleri ve kalan güne göre plan | TusAnkiM',
    seoDescription:
      '2027 TUS tarihleri: 1. Dönem 27 Mart 2027, 2. Dönem 22 Ağustos 2027. Başvuru ve sonuç günleri ile 120–365 gün kalan aday için günlük kart ve tekrar planı.',
    directAnswer:
      'ÖSYM takvimine göre 2027-TUS 1. Dönem 27 Mart 2027’de (başvuru 2–10 Şubat 2027), 2027-TUS 2. Dönem 22 Ağustos 2027’de (başvuru 5–13 Temmuz 2027) yapılacak. Kalan gününe göre günde 40–80 yeni kart seç ve sınavdan önceki son 30–60 günü deneme tekrarına ayır.',
    whyMisconceived: [
      'Çoğu aday planını “bütün kitapları 3 kez baştan sona okumak” üzerine kurar. Hangi konunun aklında kaldığını ise ölçmez. Başvuru ayı geldiğinde bunu bilemediği için son aylarda paniğe kapılır.',
      'İkinci hata, sınava 4 ay (120 gün) kala 12 aylık (365 gün) hazırlık temposuyla devam etmektir. Aynı miktarda yeni kaynak, kalın kitap ve dev kart destesi açılır.',
      'Oysa süre kısaldıkça yeni içerik ile tekrar arasındaki denge değişir. Günlük yeni kart sayına ve tekrar süresine ölçülebilir bir sınır koymazsan son ayda tekrarlar yığılır.',
    ],
    truthParagraphs: [
      '[ÖSYM resmî sınav takviminde](https://www.osym.gov.tr/) 2027 için iki TUS dönemi var. 2027-TUS 1. Dönem sınavı 27 Mart 2027’de; başvuru 2–10 Şubat 2027, sonuç 22 Nisan 2027. 2027-TUS 2. Dönem sınavı 22 Ağustos 2027’de; başvuru 5–13 Temmuz 2027, sonuç 16 Eylül 2027. Tercih ve başvuru kuralları için [ÖSYM TUS kılavuzlarını](https://www.osym.gov.tr/SinavGrubu/Menu/1889) izle. Yabancı dil şartını (en az 50 YDS/TIPDİL) sonuç döneminden önce hazır et.',
      'Kalan gün sayını [FSRS-6 algoritma şartnamesine](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) dayanan %90 hatırlama simülasyonuyla eşleştirdik. 9.575 kartta günde 40 yeni kart açarsan bütün kartlar 240 günde biter; 270 günlük dönemde günlük ortalaman 298 kart (93 dk) olur. Günde 60 yeni kartla yeni kartlar 160 günde biter. Bu tempoda 180 günlük ortalama 388 kart (124 dk/gün), 270 günlük ortalama 331 karttır (102 dk/gün). 270. günde günlük süre 50 dakikaya iner.',
      'Sınavına 120 gün kaldıysa 9.575 kartın tamamını günde 80 yeni kartla 120. günde bitirebilirsin. Bu yolda 120 günlük ortalama 473 kart (157 dk/gün), en yoğun gün 206 dakikadır. Denemeye zaman bırakmak için tek gruba odaklanmak çoğu zaman daha gerçekçidir. Temel Bilimler (3.957 kart) günde 40 yeni kartla 99 günde biter; 120 günlük ortalama 71 dk, en yoğun gün 98 dk. Günde 60 yeni kartla 66 günde biter; ortalama 75 dk, en yoğun gün 132 dk. Klinik Bilimler (4.812 kart) günde 60 yeni kartla 81 günde biter; 120 günlük ortalama 89 dk, en yoğun gün 138 dk. Tek bir derse odaklanan yaklaşık 800 kartlık çalışma günde 40 yeni kartla 20 günde biter; 120 günlük ortalaması 52 karttır (16 dk/gün).',
    ],
    table: {
      caption: '2027 ÖSYM TUS sınav takvimi ve kalan süreye göre önerilen tempo',
      headers: ['Dönem / kalan süre', 'Resmî tarih / tempo', 'Önerilen kapsam', 'Tahmini günlük yük (FSRS-6)'],
      rows: [
        ['2027-TUS 1. Dönem', '27 Mart 2027 (başvuru: 2–10 Şubat)', 'Sonuç: 22 Nisan 2027', 'ÖSYM resmî takvimi'],
        ['2027-TUS 2. Dönem', '22 Ağustos 2027 (başvuru: 5–13 Temmuz)', 'Sonuç: 16 Eylül 2027', 'ÖSYM resmî takvimi'],
        ['120 gün (4 ay)', '80 yeni/gün veya tek grup (40–60/gün)', 'Önce zayıf branşlar ve çıkmış sorular', 'Tek grup ort. 71–89 dk/gün (en yoğun gün 98–138 dk); tüm kartlar 80/gün ort. 157 dk/gün'],
        ['180 gün (6 ay)', '60 yeni kart / gün', '9.575 kart 160. günde biter', 'Ort. 388 kart (~124 dk/gün)'],
        ['270 gün (9 ay)', '40–60 yeni kart / gün', '9.575 kartın tamamı ve 2. tur deneme tekrarları', 'Ort. 298–331 kart (~93–102 dk/gün)'],
        ['365 gün (12 ay)', '40 yeni kart / gün', '240. günde biter; son 4 ay denemeye kalır', 'Ort. 266 kart (~81 dk/gün)'],
      ],
    },
    actionSteps: [
      'ÖSYM’nin duyuru sayfasından güncel 2027 sınav ve TIPDİL/YDS tarihlerini takvimine işaretle. Tarih değişikliklerini resmî siteden izle.',
      'Sınava kaç gün kaldığını hesapla. Sonra günde ne kadar süre ayırabileceğini belirle (ör. 90–120 dk kart, kalan süre soru ve konu).',
      'Kronometre ve Çalışma Planı ile kart tekrarını, deneme çözmeyi ve konu okumayı aynı haftalık hedefe bağla.',
      'Sınavdan 30 gün önce yeni kart açmayı azalt. Yalnızca vadesi gelen tekrarlara ve yanlış soru analizine geç.',
    ],
    boundaryNote:
      '2027 sınav, başvuru ve sonuç tarihleri ÖSYM takvimine göre verildi. ÖSYM olağanüstü durumlarda tarihleri değiştirebilir. Güncel duyurular için her zaman osym.gov.tr adresine bak.',
    sources: [
      {
        label: 'ÖSYM Resmî Portal ve Sınav Takvimi',
        url: 'https://www.osym.gov.tr/',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM — Tıpta Uzmanlık Eğitimi Giriş Sınavı (TUS) sayfası',
        url: 'https://www.osym.gov.tr/SinavGrubu/Menu/1889',
        publisher: 'ÖSYM',
      },
      {
        label: 'FSRS-6 Algoritma Şartnamesi',
        url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
        publisher: 'Open Spaced Repetition',
      },
    ],
    relatedLinks: [
      { label: 'TUS puan ve hedef net hesaplayıcı', href: '/puan-hesapla/' },
      { label: 'TUS’ta kaç kart çalışılmalı?', href: '/rehber/tusta-kac-kart-calisilmali/' },
      { label: 'Kronometre ve çalışma takvimi rehberi', href: '/yardim/kronometre/' },
    ],
    keywords: '2027 tus tarihleri başvuru takvimi mart ağustos çalışma planı',
  },
];
