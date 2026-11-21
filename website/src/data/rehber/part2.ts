import type { RehberArticle } from './types';

export const REHBER_PART_2: RehberArticle[] = [
  {
    slug: 'tus-puani-nasil-hesaplanir',
    order: 4,
    tone: 'Markasız',
    questionH1: 'TUS puanı nasıl hesaplanır? %5 puan kesintisi, 45 barajı ve Temel/Klinik ağırlıkları',
    seoTitle: 'TUS Puanı Nasıl Hesaplanır? %5 Kesinti Kuralı | TusAnkiM',
    seoDescription:
      'ÖSYM TUS puan hesaplama mantığı: 4 yanlış 1 doğru kuralı, Temel (%70/%30) ve Klinik (%50/%50) ağırlıkları, 45 puan barajı ve %5 kesinti yönetmeliği.',
    directAnswer:
      'TUS’ta her biri 100 soruluk Temel ve Klinik oturumlarda 4 yanlış 1 doğruyu götürür; Temel Tıp Puanı %70 Temel + %30 Klinik, Klinik Tıp Puanı ise %50 Temel + %50 Klinik standart puan ağırlıklarıyla hesaplanır. Yerleştirme için 45 puan barajı, yabancı dil yeterliliği ve yönetmelik kapsamındaki durumlarda %5 kesinti uygulanır.',
    whyMisconceived: [
      'Adaylar sıkça yalnızca Klinik Bilimler netinin Klinik TUS puanını belirlediğini düşünür; oysa Temel Bilimler standart puanının yarısı (%50) doğrudan Klinik Puanı içine girer ve yüksek puan bandında asıl farkı yaratır.',
      'Bir başka eski alışkanlık da uzmanlık eğitimine devam edenler, istifa edenler veya yerleşip süresi içinde başlamayanlar için kesinti oranını eski mevzuattaki gibi %2 sanmaktır; yürürlükteki yönetmelikte ilk sınavda kesinti %5 olarak uygulanır.',
      'Ayrıca deneme sınavı sonrası internetteki hesaplayıcılardan çıkan tahmini puanların kesin resmî puan olduğu yanılgısı yaygındır; oysa gerçek yerleştirme puanı her dönemin Türkiye ortalaması, standart sapması ve iptal edilen sorulara göre ÖSYM tarafından belirlenir.',
    ],
    truthParagraphs: [
      '[ÖSYM TUS genel bilgi ve kılavuzlarına](https://www.osym.gov.tr/TR,14991/tipta-uzmanlik-egitimi-giris-sinavi.html) göre sınav iki ayrı oturumdan oluşur: Temel Tıp Bilimleri Testi (100 soru: Anatomi, Fizyoloji-Histoloji-Embriyoloji, Biyokimya, Mikrobiyoloji, Patoloji, Farmakoloji) ve Klinik Tıp Bilimleri Testi (100 soru: Dahiliye, Pediatri, Genel Cerrahi, Kadın Doğum, Küçük Stajlar). Her iki testte de doğru sayısından yanlış sayısının dörtte biri çıkarılarak ham net elde edilir; soru dağılımı örnekleri [ÖSYM TUS çıkmış sorular arşivinde](https://www.osym.gov.tr/TR,15070/tus-cikmis-sorular.html) incelenebilir.',
      'Ham netler sınava giren adayların ortalaması ve standart sapması kullanılarak ayrı ayrı standart puana dönüştürülür. Ağırlıklı Mesleki Bilgi Puanı hesaplanırken Temel Tıp Puanı için Temel standart puanına 0,7 ve Klinik standart puanına 0,3 katsayısı; Klinik Tıp Puanı için ise her iki alana eşit 0,5 + 0,5 katsayısı verilir. Örneğin Temel’de 65 doğru 20 yanlış (60,00 net) ve Klinik’te 68 doğru 18 yanlış (63,50 net) çıkaran toplam 123,50 netlik bir aday, son dönem katsayılarıyla yaklaşık 63,1 Klinik ve 62,7 Temel puan bandında yer alır ve her iki puan türünde 45,000 tercih barajını aşar.',
      '[Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) uyarınca bir uzmanlık programında eğitim görürken sınava girenlerin, eğitimden istifa edenlerin veya ÖSYM tarafından yerleştirilip süresi içinde görevine başlamayanların takip eden ilk sınavında mesleki bilgi puanında %5 kesinti (× 0,95) uygulanır. Örneğin ham klinik puanı 65,0 hesaplanan bir adayda kesinti sonrası puan 61,75 düzeyine iner; bu nedenle 65 net puan hedefleyen bir adayın kesinti etkinken yaklaşık 68,4 ham puana (yaklaşık 143 toplam net bandına) çıkması gerekir.',
      'Tercih sürecinde yalnızca puan değil, sıralama bandı ve kontenjan dağılımı da belirleyicidir; son 5 yıl içinde YDS, e-YDS, TIPDİL veya ÖSYM eşdeğeri bir sınavdan en az 50 yabancı dil puanı almak tercih yapmanın ön koşuludur. 30 tercihin başına ideal programları, ortasına sıralamanla örtüşen gerçekçi seçenekleri ve sonuna güvenli tercihleri yerleştirerek puan avantajını koruyabilirsin.',
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
  {
    slug: '2027-tus-tarihleri-ve-calisma-plani',
    order: 5,
    tone: 'Markasız',
    questionH1: '2027 TUS tarihleri ve başvuru takvimi neler, kalan güne göre çalışma planı nasıl kurulur?',
    seoTitle: '2027 TUS Tarihleri & Kalan Gün Çalışma Planı | TusAnkiM',
    seoDescription:
      '2027-TUS 1. Dönem (27 Mart 2027) ve 2. Dönem (22 Ağustos 2027) başvuru, sınav ve sonuç tarihleri ile 120–365 günlük gerçekçi kart/tekrar planı.',
    directAnswer:
      'ÖSYM 2027 takvimine göre 2027-TUS 1. Dönem 27 Mart 2027’de (başvuru 2–10 Şubat 2027), 2027-TUS 2. Dönem ise 22 Ağustos 2027’de (başvuru 5–13 Temmuz 2027) yapılacaktır. Kalan güne göre günde 40–80 yeni kart temposu seçilerek sınav öncesi son 30–60 gün deneme tekrarlarına ayrılabilir.',
    whyMisconceived: [
      'Adaylar çalışma planını çoğu zaman “tüm ders kitaplarını 3 kez baştan sona okumak” üzerinden kurar; ancak başvuru ayı geldiğinde hangi konunun gerçekten kalıcı olduğunu ölçemedikleri için son aylarda plansız panik yaşar.',
      'Bir diğer yaygın hata ise sınava 4 ay (120 gün) kaldığında da 12 aylık (365 gün) bir hazırlık temposuyla aynı miktarda yeni kaynak, kalın kitap ve dev kart destesi açmaya çalışmaktır.',
      'Oysa kalan süre kısaldıkça günlük yeni içerik ile günlük pekiştirme tekrarının dengesi kökten değişir; ölçülebilir bir günlük kota ve tekrar yükü sınırı konmadığında son ay yığılması kaçınılmaz olur.',
    ],
    truthParagraphs: [
      '[ÖSYM resmî sınav takvimine](https://www.osym.gov.tr/) göre 2027 yılında iki TUS dönemi yer alır: 2027-TUS 1. Dönem sınavı 27 Mart 2027 (başvuru 2–10 Şubat 2027, sonuç 22 Nisan 2027), 2027-TUS 2. Dönem sınavı ise 22 Ağustos 2027 (başvuru 5–13 Temmuz 2027, sonuç 16 Eylül 2027) tarihlerindedir. Tercih ve başvuru kuralları için [ÖSYM TUS kılavuzları](https://www.osym.gov.tr/TR,14991/tipta-uzmanlik-egitimi-giris-sinavi.html) takip edilmeli ve yabancı dil şartı (en az 50 YDS/TIPDİL) sonuç döneminden önce hazır tutulmalıdır.',
      'Kalan gün sayısını [FSRS-6 algoritma şartnamesi](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) tabanlı %90 hatırlama simülasyonuyla eşleştirdiğimizde somut zaman eşikleri çıkar: 9.575 kartlık çekirdek havuzda günde 40 yeni kart açan bir aday tüm kartları 240 günde tamamlar; 270 günlük pencerede ortalama günlük yük 298 kart (93 dk) olur. Günde 60 yeni kart temposunda yeni kartlar 160 günde biter ve 180 gün ortalaması 388 kart (124 dk/gün), 270 gün ortalaması ise 331 karttır (102 dk/gün; 270. günde 50 dk/gün).',
      'Sınavına 120 gün kalan bir aday tüm 9.575 kartlık havuzu günde 80 yeni kartla 120. günde bitirebilir (120 gün ortalaması 473 kart / 157 dk/gün, tepe 206 dk); ancak deneme çözmek için zaman bırakmak adına tek gruba odaklanmak çoğu zaman daha gerçekçidir: Temel Bilimler (3.957 kart) günde 40 yeni ile 99 günde (120 gün ort. 71 dk, tepe 98 dk), günde 60 yeni ile 66 günde (ort. 75 dk, tepe 132 dk) biter; Klinik Bilimler (4.812 kart) ise günde 60 yeni ile 81 günde tamamlanır (120 gün ort. 89 dk, tepe 138 dk). Tek bir derse odaklanan yaklaşık 800 kartlık çalışma ise günde 40 yeni kartla 20 günde tamamlanır (120 gün ort. 52 kart / 16 dk/gün).',
    ],
    table: {
      caption: '2027 ÖSYM TUS sınav takvimi ve hazırlık süresine göre önerilen çalışma temposu',
      headers: ['Dönem / Ufuk', 'Resmî Tarih / Tempo', 'Önerilen Kapsam', 'Tahmini Günlük Yük (FSRS-6)'],
      rows: [
        ['2027-TUS 1. Dönem', '27 Mart 2027 (Başvuru: 2–10 Şubat)', 'Sonuç: 22 Nisan 2027', 'ÖSYM resmî takvimi'],
        ['2027-TUS 2. Dönem', '22 Ağustos 2027 (Başvuru: 5–13 Temmuz)', 'Sonuç: 16 Eylül 2027', 'ÖSYM resmî takvimi'],
        ['120 Gün (4 Ay)', '80 yeni/gün veya tek grup (40–60/gün)', 'Öncelikli zayıf branşlar + çıkmış sorular', 'Tek grup ort. 71–89 dk/gün (tepe 98–138 dk); tüm havuz 80/gün ort. 157 dk/gün'],
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
];
