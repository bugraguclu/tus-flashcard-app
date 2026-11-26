import type { RehberArticle } from './types';

export const REHBER_PART_5: RehberArticle[] = [
  {
    slug: 'tus-sinav-gunu-ne-goturulur',
    order: 12,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Sınav ve Takvim',
    tone: 'Markasız',
    questionH1: 'TUS sınav günü yanına ne alırsın, ne alamazsın?',
    seoTitle: 'TUS sınav günü ne götürülür? Kimlik ve yasaklar | TusAnkiM',
    seoDescription:
      'TUS sınav günü yalnızca Sınava Giriş Belgesi, geçerli kimlik ve etiketsiz şeffaf su alınır. 10.00 ve 14.30 son giriş saatleri, kimlik ve yasak listesi.',
    directAnswer:
      'TUS sınav binasına yalnızca o oturumun Sınava Giriş Belgesi, geçerli fotoğraflı kimlik ve etiketi çıkarılmış şeffaf pet şişede su ile girebilirsin. 2026-TUS 2. dönem kılavuzuna göre çanta, telefon, her türlü saat, cüzdan, takı, kalem ve yiyecek yasaktır; ehliyet ve meslek kimliği geçmez.',
    whyMisconceived: [
      'Adaylar arasında sürücü belgesinin ya da hastane personel kimliğinin T.C. kimlik kartı yerine geçeceği düşüncesi hâlâ yaygındır. Sınav sabahı kapıda geri çevrilen pek çok kişi bu yüzden aylarca çalıştığı oturuma giremez.',
      'Bir başka sık yapılan hata iki oturum için tek Sınava Giriş Belgesi çıktısı almak ya da basit bir kol saatiyle içeri girilebileceğini sanmaktır. Oysa kılavuz her türlü saati ve alyans dışındaki takıları yasaklar. Su da yalnızca etiketi sökülmüş şeffaf şişede girer.',
      'Kimi adaylar da tuvalet ihtiyacı için kısa süreli salondan çıkıp geri dönebileceğini düşünür. Kılavuz gereği hangi gerekçeyle olursa olsun salondan çıkan aday tekrar içeri alınmaz.',
    ],
    truthParagraphs: [
      '[2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre TUS tek günde iki ayrı oturumda yapılır. Temel Tıp Bilimleri Testi saat 10.15’te, Klinik Tıp Bilimleri Testi saat 14.45’te başlar ve her oturumda 100 soru için 135 dakika verilir. Binalara son giriş saat 10.00 ve 14.30’dur; bu dakikadan sonra gelen aday içeri alınmaz. ÖSYM sınav saatinden en az 1 saat önce bina önünde bulunmanı ister.',
      'Sınava Giriş Belgesi sınavdan yaklaşık 10 gün önce ais.osym.gov.tr adresinden yayımlanır ve her oturum için ayrı çıktı alınır. Geçerli kimlik belgeleri fotoğraflı T.C. kimlik kartı, fotoğraflı nüfus cüzdanı ya da süresi geçerli pasaporttur. Ehliyet, öğrenci kimliği, meslek kimliği ve kimlik fotokopisi kesinlikle geçerli değildir. Eski tip nüfus cüzdanında soğuk damga ve seni kolayca tanıtan güncel bir fotoğraf olmalıdır.',
      'Sınav binasına çanta, cüzdan, cep telefonu, her türlü saat, alyans dışındaki takılar, elektronik cihazlar, kalem, silgi, kâğıt, yiyecek ve kutuda ilaç alınmaz. Kurşun kalem, silgi ve kalemtıraşı ÖSYM salon içinde verir. Yanında yalnızca etiketi tamamen sökülmüş şeffaf pet şişede su götürebilirsin. Kılavuza göre sınav binalarında hiçbir eşya emanete alınmaz. Yasaklı eşyaları binaya hiç getirme.',
      'Her oturumda sınavın ilk 100 dakikası ve son 15 dakikası boyunca salondan çıkış yasaktır. Tuvalet ihtiyacı dâhil herhangi bir sebeple salondan çıkan aday tekrar salona alınmaz. Sınav sonrası soru itirazları sınavdan sonraki 3 iş günü içinde, sonuç itirazları ise sonuç açıklamasından sonraki 10 gün içinde ÖSYM’ye iletilir. İki oturum arasındaki yaklaşık 2 saatlik arayı bina yakınında dinlenerek ve hafif beslenerek geçirmek öğleden sonraki dikkatini korur.',
    ],
    table: {
      caption: '2026-TUS 2. dönem kılavuzuna göre TUS sınav günü saatler, kimlik ve eşya kuralları',
      headers: ['Başlık', 'Kural', 'Açıklama'],
      rows: [
        ['Temel Tıp oturumu', '10.15 başlangıç · 10.00 son giriş', '100 soru · 135 dakika · en az 1 saat önce binada ol'],
        ['Klinik Tıp oturumu', '14.45 başlangıç · 14.30 son giriş', '100 soru · 135 dakika · ayrı Sınava Giriş Belgesi gerekir'],
        ['Geçerli kimlik', 'T.C. kimlik kartı / pasaport', 'Ehliyet, meslek ve öğrenci kimliği geçmez'],
        ['Serbest eşya', 'Etiketsiz şeffaf şişede su', 'Kalem, silgi ve kalemtıraşı ÖSYM verir'],
        ['Yasaklı eşya', 'Telefon, saat, çanta, takı, ilaç', 'Alyans hariç takı, cüzdan, kâğıt ve yiyecek alınmaz'],
        ['Salondan çıkış', 'İlk 100 dk ve son 15 dk yasak', 'Tuvalet dâhil çıkan aday geri alınmaz'],
      ],
    },
    actionSteps: [
      'Sınavdan yaklaşık 10 gün önce ais.osym.gov.tr üzerinden hem Temel hem Klinik oturumun Sınava Giriş Belgesini ayrı ayrı yazdır.',
      'T.C. kimlik kartının ya da süresi geçerli pasaportunun üzerindeki fotoğrafın güncel ve yıpranmamış olduğunu önceki hafta kontrol et.',
      'Önceki akşam yalnızca iki giriş belgesi, kimlik ve etiketi çıkarılmış şeffaf su şişesini hazırla; saat, takı ve cüzdanı evde bırak.',
      'Sınav sabahı trafiği hesaba katarak 10.00 ve 14.30 kapı kapanışından en az 1 saat önce bina önünde ol.',
      'İki oturum arasındaki molada önceki oturumun sorularını tartışmak yerine kısa yemek ve sessiz dinlenmeye odaklan.',
    ],
    faq: [
      {
        q: 'TUS’a ehliyetle girilir mi?',
        a: 'Hayır, sürücü belgesi, öğrenci kimliği ve meslek kimliği ÖSYM sınavlarında geçerli değildir. Fotoğraflı T.C. kimlik kartı, nüfus cüzdanı ya da süresi geçerli pasaport gerekir.',
      },
      {
        q: 'TUS binasına en geç saat kaçta girilir?',
        a: '2026-TUS 2. dönem kılavuzuna göre Temel oturum için son giriş 10.00, Klinik oturum için son giriş 14.30’dur.',
      },
      {
        q: 'Sınavda tuvalete çıkmak serbest mi?',
        a: 'Hayır, ilk 100 dakika ve son 15 dakika çıkış yasaktır; diğer dakikalarda da tuvalet dâhil salondan çıkan aday geri alınmaz.',
      },
      {
        q: 'TUS soru ve sonuç itiraz süresi kaç gündür?',
        a: '2026-TUS 2. dönem kılavuzuna göre soru itirazları sınavdan sonraki 3 iş günü, sonuç itirazları ise sonuç ilanından sonraki 10 gün içinde yapılır.',
      },
    ],
    boundaryNote:
      'Bu kontrol listesi 2026-TUS 2. dönem başvuru kılavuzuna dayanır. Sağlık nedeniyle cihaz veya ilaç istisnası olan adayların başvuru aşamasında ÖSYM’nin ilgili prosedürünü izlemesi ve her dönem güncel kılavuzu kontrol etmesi gerekir.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu md. 1.3, 3, 3.1, 3.2 (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM Aday İşlemleri Sistemi (AİS)',
        url: 'https://ais.osym.gov.tr',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS’ta 135 dakika nasıl yönetilir?', href: '/rehber/tus-sinavinda-sure-yonetimi/' },
      { label: 'Son hafta ve son 3 gün planı', href: '/rehber/tus-son-hafta-ve-son-3-gun/' },
      { label: '2027 TUS tarihleri', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: 'TUS başvurusu nasıl yapılır?', href: '/rehber/tus-basvurusu-nasil-yapilir/' },
    ],
    keywords: 'tus sınav günü ne götürülür kimlik ehliyet geçer mi son giriş saati yasak eşyalar sınav kuralları',
  },
  {
    slug: 'tus-hangi-dersten-kac-soru-cikar',
    order: 13,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Ders ve Soru Analizi',
    tone: 'Yumuşak',
    questionH1: 'TUS’ta hangi dersten kaç soru çıkar?',
    seoTitle: 'TUS’ta hangi dersten kaç soru çıkar? 200 soru | TusAnkiM',
    seoDescription:
      'TUS toplam 200 sorudur: 100 Temel ve 100 Klinik. 2026-TUS 2. dönem kılavuzu Tablo 1B ile son 6 sınavda sayılan 1.195 sorunun ders ders dağılımı.',
    directAnswer:
      'TUS iki oturumda toplam 200 sorudur: 100 Temel Tıp ve 100 Klinik Tıp sorusu. 2026-TUS 2. dönem kılavuzuna göre Temel testte Biyokimya, Mikrobiyoloji, Patoloji ve Farmakoloji 18’er soru; Klinik testte ise Dahiliye grubu 35, Cerrahi grubu 30 sorudur.',
    whyMisconceived: [
      'İnternette dolaşan dağılım tabloları çoğu zaman dönem ve kaynak vermez. Bir kısmı eski sınav düzenine, bir kısmı dershane tahminlerine dayanır. Bunlarla plan yapan aday zamanı yanlış böler.',
      'Bir diğer karışıklık ÖSYM kılavuzundaki grup adlarıyla çalışma dersleri arasındaki farktır. Kılavuz Klinik testi Dahiliye grubu ve Cerrahi grubu gibi birleşik gruplarla verir, adaylar ise 11 ayrı dersle çalışır. Bu ayrım anlaşılmadığında Küçük Stajların gerçek ağırlığı kolayca hafife alınır.',
      'Ayrıca iptal edilen sorular nedeniyle 6 sınavın toplam soru sayısının her zaman tam 1.200 olmadığını fark etmeyenler, dönemler arasındaki 1–2 soruluk kaymaları kural değişikliği sanır.',
    ],
    truthParagraphs: [
      '[2026-TUS 2. dönem başvuru kılavuzu](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) Tablo 1B her oturumu 100 soru olarak tanımlar. Temel Tıp Bilimleri Testinde Biyokimya, Mikrobiyoloji, Patoloji ve Farmakoloji 18’er sorudur. Anatomi 13, Histoloji-Embriyoloji 8 ve Fizyoloji 7 sorudur. Klinik testin yaklaşık %5’i güncel sağlık konularından gelir.',
      'Klinik Tıp Bilimleri Testinde kılavuz dört ana grup verir: Dahiliye grubu 35, Cerrahi grubu 30, Pediatri 25 ve Kadın Doğum 10 soru. Tabloda Küçük Stajlar için ayrı satır yoktur. Nöroloji, dermatoloji, göz, KBB ve psikiyatri gibi stajlar bu iki grubun toplamına girer. Bu yüzden kılavuz tablosunu çalışma programına çevirirken çıkmış soru sayımına da bakmalısın. Sayım, stajların iki grup içindeki gerçek payını ders ders gösterir.',
      'TusAnkiM’in [son 6 TUS (2024/1–2026/2) referans veri setinde](/referanslar/) iptal edilen sorular düşüldükten sonra toplam 1.195 soru 11 çalışma dersi altında sayıldı. Altı sınavda Anatomi 78 (sınav başı 13), Fizyoloji-Histoloji-Embriyoloji 90 (sınav başı 14–16), Biyokimya 109, Mikrobiyoloji 108, Patoloji 107 ve Farmakoloji 106 soru olarak kaydedildi. Klinik oturumda ise Pediatri 148, Dahiliye 143, Küçük Stajlar 126, Genel Cerrahi 120 ve Kadın Doğum 60 soru oluşturdu.',
      'İki tablo birlikte okunduğunda çalışma önceliği netleşir. Pediatri ve Dahiliye tek başına Klinik oturumun neredeyse yarısını oluşturur; Küçük Stajlar ve Genel Cerrahi yaklaşık 20–21’er soruyla onları izler. Temel oturumda 18’er soruluk dört ana ders toplam 72 soruya ulaşır. Derslere ayırdığın haftalık çalışma süresini bu gerçek soru paylarıyla dengelemen gerekir. Her branşın dönem dönem çıkmış soru sayısını [TUS Çıkmış Sorular ve Analiz](/tus-cikmis-sorular-ve-analiz/) sayfasında inceleyebilir, [Çalışma Planı](/calisma-plani/) aracıyla ders bazlı tekrar süresi çıkarabilirsin.',
    ],
    table: {
      caption: '2026-TUS 2. dönem kılavuzu Tablo 1B ile son 6 TUS (2024/1–2026/2, 1.195 soru) sayımının karşılaştırması',
      headers: ['Ders', 'Oturum', 'Sınav Başı Beklenen', 'Son 6 TUS Toplamı'],
      rows: [
        ['Anatomi', 'Temel', '13 soru', '78 soru'],
        ['Fizyoloji-Histoloji-Embriyoloji', 'Temel', '15 soru (7 + 8)', '90 soru'],
        ['Biyokimya / Mikrobiyoloji / Patoloji / Farmakoloji', 'Temel', 'Her biri 18 soru', '109 / 108 / 107 / 106 soru'],
        ['Dahiliye (ayrı ders)', 'Klinik (Dahiliye grubu 35)', '23–25 soru (~24)', '143 soru'],
        ['Pediatri', 'Klinik', '25 soru (24–25)', '148 soru'],
        ['Genel Cerrahi (ayrı ders)', 'Klinik (Cerrahi grubu 30)', '19–21 soru (~20)', '120 soru'],
        ['Küçük Stajlar (dahili + cerrahi)', 'Klinik', '20–22 soru (~21)', '126 soru'],
        ['Kadın Doğum', 'Klinik', '10 soru', '60 soru'],
      ],
    },
    actionSteps: [
      'Çalışma saatlerini kaynağı belirsiz tablolara göre değil, kılavuzdaki 100 Temel ve 100 Klinik soru dağılımına göre planla.',
      'Temel oturumda 18’er soruluk dört dersi (Biyokimya, Mikrobiyoloji, Patoloji, Farmakoloji) haftalık tekrar çekirdeğinde sabit tut.',
      'Klinik oturumda Pediatri (~25) ve Dahiliye (~24) yanında yaklaşık 21 soruluk Küçük Stajlar payını son aya bırakma.',
      'Son 6 sınavda hangi dersin nasıl dağıldığını 11 branş referans sayfalarından inceleyip zayıf dersine ek deneme saati ayır.',
      'Her tam deneme sonunda ders bazlı doğru ve yanlış sayını kaydederek en çok puan kaybettiren üç dersi haftalık programa taşı.',
    ],
    faq: [
      {
        q: 'TUS toplam kaç sorudur ve kaç oturum yapılır?',
        a: 'TUS 100 Temel ve 100 Klinik olmak üzere toplam 200 sorudur ve aynı gün iki oturumda yapılır.',
      },
      {
        q: 'Küçük Stajlardan TUS’ta yaklaşık kaç soru çıkar?',
        a: 'Kılavuz Küçük Stajlar için ayrı sayı vermez. Son 6 TUS (2024/1–2026/2) sayımında sınav başına ortalama 21 soru (toplam 126) çıktı.',
      },
      {
        q: 'Son 6 TUS toplamı neden 1.200 değil 1.195 soru?',
        a: 'Sınav dönemlerinde ÖSYM tarafından iptal edilen sorular düşüldüğü için 6 sınavın değerlendirilen toplamı 1.195 sorudur.',
      },
      {
        q: 'Güncel sağlık konularından kaç soru sorulur?',
        a: '2026-TUS 2. dönem kılavuzu Tablo 1B’ye göre Klinik testin yaklaşık %5’i güncel sağlık konularından gelir.',
      },
    ],
    boundaryNote:
      'ÖSYM sınavlarında iptal edilen sorular veya grup içi alt dal geçişleri nedeniyle 1–2 soruluk değişiklik görülebilir. Bu sayım 2024/1–2026/2 dönemlerine ve 2026-TUS 2. dönem kılavuzuna dayanır; ÖSYM her sınavın sorularının yalnızca %10’unu yayımlar.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu Tablo 1B (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM TUS Çıkmış Sorular Arşivi (1. Dönem)',
        url: 'https://www.osym.gov.tr/SinavGrubu/Menu/1889',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM TUS Çıkmış Sorular Arşivi (2. Dönem)',
        url: 'https://www.osym.gov.tr/SinavGrubu/Menu/1892',
        publisher: 'ÖSYM',
      },
      {
        label: 'TUS çıkmış sorular ve analiz (son 6 TUS, 1.195 soru)',
        url: '/tus-cikmis-sorular-ve-analiz/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'Hangi derste kart tekrarı ne kadar işe yarar?', href: '/rehber/tus-ders-ders-kart-destegi/' },
      { label: 'TUS Çıkmış Sorular ve Analiz', href: '/tus-cikmis-sorular-ve-analiz/' },
      { label: '11 Branş Referans Cetveli', href: '/referanslar/' },
      { label: 'TUS Puan Hesaplayıcı', href: '/puan-hesapla/' },
    ],
    keywords: 'tus hangi dersten kaç soru çıkar 200 soru dağılımı temel klinik küçük stajlar dahiliye pediatri',
  },
  {
    slug: 'tus-ders-ders-kart-destegi',
    order: 14,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Ders ve Soru Analizi',
    tone: 'Yumuşak',
    questionH1: 'Hangi TUS dersinde kart tekrarı ne kadar işe yarar?',
    seoTitle: 'TUS’ta ders ders kart desteği: 11 ders | TusAnkiM',
    seoDescription:
      'Son 6 TUS’taki 1.195 soruda kart desteği derse göre %28,2 ile %56,6 arasında değişir. Hangi derste kart, hangi derste vaka sorusu gerekir?',
    directAnswer:
      'Son 6 TUS’taki 1.195 sorunun dağılımı her ders için farklı çalışma dengesi ister. Biyokimya, Mikrobiyoloji, Farmakoloji ve Pediatride kart tekrarları %52–%56,6 çözüm desteğine ulaşırken, Anatomi (%28,2) ve Küçük Stajlar (%30,2) görsel atlas ve klinik vaka sorusuyla desteklenmelidir.',
    whyMisconceived: [
      'Adaylar çoğu zaman tüm 11 TUS dersini aynı yöntemle çalışır. Oysa mekanizma ve etken eşleştirmesi soran Farmakoloji ile üç boyutlu komşuluk soran Anatomi aynı tekrar biçimine aynı hızda karşılık vermez.',
      'Bir başka yaygın yanılgı da her ders için “konuyu bir kez bitirmek” ile “şıkkı eleyebilmek” arasındaki farkı görmemektir. Konuyu tanımak yüksek konu kapsamı verir; fakat sınavda net getiren şey ilk tetkik, ilk tedavi, kontrendikasyon ve ayırıcı tanı ayrımıdır.',
      'İnternetteki pek çok “konu dağılımı” listesi de dönem ve kaynak vermeden yuvarlak alt konu sayıları paylaşır. Doğrulanmamış tahmini listelere göre konu elemek sınavda beklenmedik boşluklar doğurur.',
    ],
    truthParagraphs: [
      'TusAnkiM’in [son 6 TUS (2024/1–2026/2, 1.195 soru) referans analizinde](/referanslar/) her soru üç ayrı sınıfta değerlendirildi. Doğrudan, kartın soruyu tek başına çözdürdüğünü gösterir. Dolaylı, kartın tek bir yorum adımıyla çözdürdüğünü gösterir. Konu Kapsamı ise konunun destede olduğunu ama o ayrıntının kartta olmadığını gösterir. Bu çalışma yapay zekâ destekli ön değerlendirmedir; bağımsız hekim editör onayı henüz tamamlanmadı. Genel toplamda çözüm desteği 521/1.195 (%43,6; 333 Doğrudan + 188 Dolaylı), konu kapsamı ise 1.108/1.195 (%92,7) düzeyindedir.',
      'Temel Bilimlerde (3.957 kart, 6 ders) kart tekrarının en yüksek karşılık verdiği dersler [Farmakoloji](/referanslar/farmakoloji/) (%56,6; 60/106), [Biyokimya](/referanslar/biyokimya/) (%56,0; 61/109) ve [Mikrobiyoloji](/referanslar/mikrobiyoloji/) (%55,6; 60/108) oldu. [Patoloji](/referanslar/patoloji/) %47,7 (51/107) ve [Fizyoloji-Histoloji-Embriyoloji](/referanslar/fizyoloji-histoloji-embriyoloji/) %38,9 (35/90) ile orta bantta kaldı. [Anatomi](/referanslar/anatomi/) ise %28,2 (22/78) ile görsel atlas ve periferik sinir-komşuluk tekrarlarına en çok ihtiyaç duyan Temel derstir.',
      'Klinik Bilimlerde (4.812 kart, 5 ders) en yüksek kart desteği [Pediatri](/referanslar/pediatri/) (%52,0; 77/148) ve [Dahiliye](/referanslar/dahiliye/) (%40,6; 58/143) derslerinde ölçüldü. [Kadın Doğum](/referanslar/kadin-dogum/) %35,0 (21/60), [Genel Cerrahi](/referanslar/genel-cerrahi/) %31,7 (38/120) ve [Küçük Stajlar](/referanslar/kucuk-stajlar/) %30,2 (38/126) oranında kaldı. Bu üç derste konu kapsamı %86,5–%96,7 bandında yüksek olsa da vaka yorumu ve tanı-tedavi adımları ek soru pratiği ister.',
      'ÖSYM alt konu bazında soru sayısı yayımlamaz. Bu yüzden alt konu tahmini yerine ders düzeyindeki boşluklara bak. Her dersin güçlü alt destelerini ve açık alanlarını ilgili ders sayfasında görebilirsin. [Çalışma planı aracıyla](/calisma-plani/) ders bazlı günlük kart dağılımını ayarlayabilirsin. Yüksek destekli dersleri kartla taze tut, düşük destekli derslere soru saati ayır.',
    ],
    table: {
      caption: 'Son 6 TUS (2024/1–2026/2, 1.195 soru) ön değerlendirmesine göre 11 branşın soru sayısı ve kart çözüm desteği',
      headers: ['Ders', 'Son 6 TUS soru', 'Çözüm desteği (Doğrudan + Dolaylı)', 'Ek çalışma ihtiyacı'],
      rows: [
        ['Farmakoloji / Biyokimya / Mikrobiyoloji', '106 / 109 / 108', '%56,6 / %56,0 / %55,6', 'Mekanizma, enzim, etken kart tekrarı + preanalitik kurallar'],
        ['Patoloji / FHE', '107 / 90', '%47,7 / %38,9', 'Genel patoloji mediyatörleri, Starling ve böbrek fizyolojisi'],
        ['Anatomi', '78', '%28,2 (22/78)', 'GİS komşulukları, periferik sinir ve görsel atlas desteği'],
        ['Pediatri / Dahiliye', '148 / 143', '%52,0 / %40,6', 'Yenidoğan, metabolizma, akut kardiyoloji ilk tetkik/tedavi'],
        ['Kadın Doğum', '60', '%35,0 (21/60)', 'Kontrasepsiyon kontrendikasyonları ve doğum komplikasyonları'],
        ['Genel Cerrahi / Küçük Stajlar', '120 / 126', '%31,7 / %30,2', 'Travma/kompartman, nöroloji-psikiyatri-dermatoloji vaka ayrımı'],
      ],
    },
    actionSteps: [
      'Farmakoloji, Biyokimya, Mikrobiyoloji ve Pediatride günlük aralıklı tekrar kartlarını aksatma; bu dört ders en hızlı kalıcılaşan çekirdektir.',
      'Anatomi çalışırken düz metin kartlarını mutlaka atlas görselleri ve Görsel Gizleme (Image Occlusion) ile eşleştir.',
      'Genel Cerrahi, Kadın Doğum ve Küçük Stajlarda konu okumasından sonra vaka temelli soru çözümüne daha fazla pay ayır.',
      'Ders referans sayfalarında yalnızca konu kapsamında kalan soruları kendi deneme yanlışlarınla karşılaştır ve eksikleri kısa karta çevir.',
      'Temel ve Klinik dersleri birbirinden ayırma; örneğin Farmakoloji ve Patoloji tekrarlarını ilgili Dahiliye ve Pediatri haftalarına paralel yerleştir.',
    ],
    faq: [
      {
        q: 'Kart tekrarıyla en yüksek verim alınan TUS dersleri hangileri?',
        a: 'Son 6 TUS ön değerlendirmesinde en yüksek çözüm desteği Farmakoloji (%56,6), Biyokimya (%56,0), Mikrobiyoloji (%55,6) ve Pediatri (%52,0) derslerinde ölçüldü.',
      },
      {
        q: 'Anatomi ve Küçük Stajlar neden daha düşük destek gösteriyor?',
        a: 'Anatomi üç boyutlu görsel komşuluk, Küçük Stajlar ise klinik tablodan hızlı ayırıcı tanı ister. Bu iki derste kartları atlas ve vaka sorusuyla desteklemek gerekir.',
      },
      {
        q: 'Konu kapsamı ile çözüm desteği arasındaki fark nedir?',
        a: 'Konu kapsamı (%92,7) ilgili konunun destede bulunmasını gösterir. Çözüm desteği (%43,6) ise kartın soruyu doğrudan ya da tek adımlık yorumla çözdürebilmesidir.',
      },
      {
        q: 'Her dersin analizini nerede görebilirim?',
        a: '11 dersin her biri için soru sayısı, kart sayısı ve öncelikli açık listesi [ders referansları](/referanslar/) sayfasındaki bağlantılardadır.',
      },
    ],
    boundaryNote:
      'Buradaki oranlar TusAnkiM’in son 6 TUS (2024/1–2026/2, 1.195 soru) yapay zekâ destekli ön sınıflamasına dayanır; bağımsız hekim editör onayı henüz tamamlanmadı. Alt konu bazlı resmî soru sayısı ÖSYM tarafından yayımlanmadığından tahmini alt konu rakamları verilmez.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu Tablo 1B (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM TUS Çıkmış Sorular Arşivi (2. Dönem)',
        url: 'https://www.osym.gov.tr/SinavGrubu/Menu/1892',
        publisher: 'ÖSYM',
      },
      {
        label: '11 dersin referans cetveli (2024/1–2026/2)',
        url: '/referanslar/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'Hangi dersten kaç soru çıkar?', href: '/rehber/tus-hangi-dersten-kac-soru-cikar/' },
      { label: 'TUS Çıkmış Sorular ve Analiz', href: '/tus-cikmis-sorular-ve-analiz/' },
      { label: '11 Branş Referans Cetveli', href: '/referanslar/' },
      { label: 'TUS Çalışma Planı Hesaplayıcı', href: '/calisma-plani/' },
    ],
    keywords: 'tus branş branş konu dağılımı 11 ders soru analizi farmakoloji pediatri anatomi küçük stajlar',
  },
  {
    slug: 'tus-ek-yerlestirme-nedir',
    order: 15,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Tercih ve Yerleştirme',
    tone: 'Markasız',
    questionH1: 'TUS ek yerleştirme nedir, kimler başvurabilir?',
    seoTitle: 'TUS ek yerleştirme nedir? Başvuru şartları | TusAnkiM',
    seoDescription:
      'TUS ek yerleştirme, ilk yerleştirmede boş kalan kadrolar için açılır. Şartlar: o dönem sınava girmek, yerleşmemiş olmak, 45 puan ve dil belgesi.',
    directAnswer:
      'TUS ek yerleştirme, ilk yerleştirmede boş kalan ya da adayların kayıt yaptırmadığı uzmanlık kontenjanları için ÖSYM tarafından açılan ikinci tercih sürecidir. 2026-TUS 2. dönem kılavuzuna göre o dönem sınava girmiş, hiçbir programa yerleşmemiş, ilgili puanı en az 45 olan ve yabancı dil şartını sağlayan adaylar başvurabilir.',
    whyMisconceived: [
      'Adaylar arasında ilk yerleştirmede bir programa yerleşip kayda gitmeyenlerin ek yerleştirmeye başvurabileceği sanılır. Oysa ilk yerleştirmede bir programa yerleşen aday, kayıt yaptırmasa bile ek yerleştirmeye başvuramaz. Eğitime başlamadığı için takip eden ilk sınavda puanı da %5 düşer.',
      'Bir diğer yanılgı ek yerleştirmede 45 puan barajının ya da yabancı dil şartının gevşediğini düşünmektir. ÖSYM ek yerleştirmede de başvuru kılavuzundaki ilke ve kuralları uygular.',
      'Bazı adaylar da ek yerleştirmede çok az kontenjan kaldığını varsayıp süreci takip etmez. Oysa 2026 verileri ilk yerleştirmeden sonra kayıt yaptırmayan adaylarla birlikte yüzlerce programda yeniden kadro açıldığını gösterir.',
    ],
    truthParagraphs: [
      '[2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre ek yerleştirmeye yalnızca o sınav dönemine girmiş ve ilk yerleştirmede hiçbir programa yerleşmemiş adaylar başvurabilir. Başvuru için programın istediği K ya da T puan türünde en az 45 puan gerekir. Ek yerleştirme için ayrıca tercih ücreti ödenir; ücreti yatırmayanın tercihleri geçersiz sayılır. [Uzmanlık Eğitimi Yönetmeliği](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) uyarınca geçerli yabancı dil şartı (en az 50 puan, son 5 yıl) ek yerleştirmede de aranır.',
      'Kılavuza göre ek kontenjan üç yoldan oluşur: hiç tercih edilmeyen kadrolar, atanmaya uygun çıkmayan adayların kadroları ve süresinde başvurmayanlardan boşalan kadrolar. [ÖSYM 2026-TUS 2. dönem yerleştirme verilerinde](https://dokuman.osym.gov.tr/web/2026/10/2026-tus-2donem-yerlestirme-sonuclarina-liskin-en-buyuk-ve-en-kucuk-puanlar-genel-yabanci-uyruklu-uzp3a0-16132230.pdf) 8.637 kontenjanın 7.625’i (%88,3) doldu ve 1.013 kadro boş kaldı. Ek tablo 20 Kasım 2026’da ilan edildi. ÖSYM 23 Kasım’da Koç Üniversitesinin yanlışlıkla bildirdiği 14 programı (26 kontenjan) tablodan çıkardı. Güncel tablo 774 programda 1.416 kontenjandır (1.261 Genel, 155 yabancı uyruklu).',
      'Bir önceki dönem olan [2026-TUS 1. dönem ek yerleştirme sonuçlarında](https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/EK/ek_minmax02072026.pdf) (2 Temmuz 2026) 901 programda 2.450 kontenjan açıldı ve 603 aday (%24,6) yerleşti. Ek yerleştirme de ana tercih gibi ais.osym.gov.tr üzerinden yapılır. ÖSYM duyurusuna göre başvuru kılavuzundaki kurallar geçerlidir; en fazla 30 tercih ve eşit puanda üst tercih önceliği burada da uygulanır.',
      'Takvim örneği olarak 2026-TUS 2. dönemde ana yerleştirme 16 Ekim 2026’da ilan edildi, ek yerleştirme tercihleri ise 20–26 Kasım 2026 tarihleri arasında alındı. Ek yerleştirme sonucu açıklandıktan bir iş günü sonra 10 iş günlük kayıt süresi başlar. Süre bitiminde kayıt yaptırmayan aday yerleştirme hakkını kaybeder. Ek yerleştirmede yerleşip başlamayanın puanı da [16 Mayıs 2024 Resmî Gazete değişikliği](https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm) gereği takip eden ilk sınavda %5 düşer. Bu yüzden ek tercih listesini de ana tercih kadar dikkatle kurmak gerekir.',
    ],
    table: {
      caption: '2026-TUS 1. ve 2. dönem ÖSYM verileri ile TUS ek yerleştirme koşulları özeti',
      headers: ['Başlık', 'Kural / Veri', 'Açıklama'],
      rows: [
        ['Kimler başvurur?', 'O dönem sınava girip yerleşmemişler', 'İlk yerleştirmede yerleşip kayda gitmeyen başvuramaz'],
        ['Puan ve dil şartı', 'En az 45 puan + 50 yabancı dil', 'Ana yerleştirmeyle aynı baraj ve dil kuralı geçerli'],
        ['2026/1 ek yerleştirme', '2.450 kontenjan · 603 yerleşen', '901 programda %24,6 doluluk (2 Temmuz 2026)'],
        ['2026/2 ek yerleştirme', '1.416 kontenjan · 774 program', '1.261 Genel + 155 YU (23 Kasım düzeltmesi); tercih 20–26 Kasım'],
        ['Kayıt ve kesinti', '10 iş günü kayıt · %5 kesinti', 'Yerleşip başlamayanın puanı takip eden ilk sınavda düşer'],
      ],
    },
    actionSteps: [
      'İlk yerleştirmede yerleşemediysen osym.gov.tr duyurularını düzenli izle. 2026-TUS 2. dönemde ek tercih, yerleştirmeden 5 hafta sonra açıldı.',
      'Ek tablo yayımlandığında düzeltme duyurularını da oku. Yalnızca gerçekten başlayacağın şehir ve dalları seç, tercih ücretini süresinde yatır.',
      'Tercih öncesi AİS profilinde yabancı dil belgenin geçerli olduğunu ve hedeflediğin dalın K veya T puanında 45 barajını geçtiğini doğrula.',
      'Önceki dönem taban puanlarını ve doluluğu [taban puanları sayfasında](/tus-taban-puanlari-ve-kontenjan/) karşılaştır.',
      'Ek yerleştirme sonuçlandığında 10 iş günlük kayıt süresini kaçırma. Yerleşip başlamamak takip eden ilk sınavda %5 kesinti getirir.',
    ],
    faq: [
      {
        q: 'İlk yerleştirmede yerleşip kayıt yaptırmazsam ek yerleştirmeye başvurabilir miyim?',
        a: 'Hayır, ek yerleştirmeye yalnızca o dönem hiçbir programa yerleşmemiş adaylar başvurabilir.',
      },
      {
        q: 'İlk yerleştirmede hiç tercih yapmayan aday ek yerleştirmeye başvurabilir mi?',
        a: 'Evet, o dönem sınava girmiş, hiçbir programa yerleşmemiş, 45 barajını geçmiş ve yabancı dil şartını taşıyan adaylar başvurabilir.',
      },
      {
        q: 'Ek yerleştirmede yerleşip başlamazsam %5 kesinti olur mu?',
        a: 'Evet. Yerleşip eğitime başlamayanın puanı, ÖSYM’nin yaptığı takip eden ilk sınavda %5 düşer.',
      },
      {
        q: 'Ek yerleştirme kayıt süresi kaç gündür?',
        a: 'Sonuçların ilanından bir iş günü sonra başlayan 10 iş günü içinde kayıt yaptırmak gerekir.',
      },
    ],
    boundaryNote:
      'Bu sayfa 2026-TUS 2. dönem başvuru kılavuzu ile 2026/1 ve 2026/2 ÖSYM yerleştirme verilerine dayanır. Her dönem açılacak ek kontenjan sayısı ve başvuru tarihleri ilgili dönemin ÖSYM ek yerleştirme kılavuzunda ilan edilir.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: '2026-TUS 2. Dönem Yerleştirme En Büyük ve En Küçük Puanlar (16 Ekim 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/10/2026-tus-2donem-yerlestirme-sonuclarina-liskin-en-buyuk-ve-en-kucuk-puanlar-genel-yabanci-uyruklu-uzp3a0-16132230.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: '2026-TUS 1. Dönem Ek Yerleştirme Sonuçları (2 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/EK/ek_minmax02072026.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Yönetmelik Değişikliği: %5 Puan Kesintisi (16 Mayıs 2024, Sayı 32548)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm',
        publisher: 'Resmî Gazete',
      },
    ],
    relatedLinks: [
      { label: 'TUS tercihi nasıl yapılır?', href: '/rehber/tus-tercihi-nasil-yapilir/' },
      { label: 'TUS’ta %5 puan kesintisi', href: '/rehber/tus-yuzde-5-puan-kesintisi/' },
      { label: 'TUS Taban Puanları ve Kontenjan', href: '/tus-taban-puanlari-ve-kontenjan/' },
      { label: 'TUS yabancı dil şartı', href: '/rehber/tus-yabanci-dil-sarti/' },
    ],
    keywords: 'tus ek yerleştirme nedir kimler başvurabilir ek tercih şartları 2026 ek kontenjan',
  },
];
