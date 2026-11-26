import type { RehberArticle } from './types';

export const REHBER_PART_6: RehberArticle[] = [
  {
    slug: 'tus-yuzde-5-puan-kesintisi',
    order: 16,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Tercih ve Yerleştirme',
    tone: 'Markasız',
    questionH1: 'TUS’ta %5 puan kesintisi kimlere uygulanır?',
    seoTitle: 'TUS’ta %5 puan kesintisi kimlere uygulanır? | TusAnkiM',
    seoDescription:
      'TUS’ta %5 kesinti üç durumda uygulanır: eğitim sürerken sınava girmek, istifa etmek, yerleşip başlamamak. Hangisi her sınavda, hangisi bir kez?',
    directAnswer:
      'TUS’ta %5 puan kesintisi üç durumda uygulanır: uzmanlık eğitimi sürerken sınava girmek, eğitimden istifa etmek ve yerleşip eğitime başlamamak. Eğitim sürerken girdiğin her TUS’ta kesinti olur. İstifa ve başlamamada kesinti yalnızca ÖSYM’nin yaptığı takip eden ilk sınavdadır.',
    whyMisconceived: [
      'Adaylar arasında kesinti oranının hâlâ eski yönetmelikteki gibi %2 olduğu düşüncesi çok yaygındır. Eski blog yazıları ve dershane notları güncellenmediği için pek çok asistan ya da mezun, puan kaybını olduğundan küçük hesaplayarak tercih yapar. Bu hata özellikle sınır puandaki dallarda beklenmedik sıralama düşüşüne yol açar.',
      'Bir diğer yanılgı “takip eden ilk sınav” ifadesini adayın başvuracağı ilk sınav sanmaktır. Bir dönemi atlayınca kesintiden kurtulacağını düşünen aday yanılır. Kılavuz bu ifadeyi ÖSYM’nin yaptığı ilk sınav olarak tanımlar.',
      'Kimi adaylar da %5 kesintinin ham puandan 5 puan düşmek anlamına geldiğini düşünür. Aslında işlem puanın %5’inin azaltılmasıdır (× 0,95); örneğin 65,00 puanlık bir sonuçta kayıp 3,25 puandır.',
    ],
    truthParagraphs: [
      '[Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) mesleki bilgi puanında kesinti koşullarını tanımlar. [16 Mayıs 2024 tarihli ve 32548 sayılı Resmî Gazete](https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm) değişikliğiyle kesinti oranı %2’den %5’e çıkarıldı. [2026-TUS 2. dönem başvuru kılavuzu](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) madde 1.5 bu oranı üç durumda uygular.',
      'Birinci durum, uzmanlık eğitimine devam ederken TUS’a girmektir. Bu durumda girdiğin her sınavda puanın %5 düşer. İkinci durum istifadır; kesinti istifayı takip eden ilk sınavda uygulanır. Üçüncü durum, bir programa yerleştiğin hâlde eğitime başlamamaktır; kesinti yine takip eden ilk sınavdadır. Kılavuza göre “takip eden ilk sınav”, senin başvuracağın değil ÖSYM’nin yaptığı ilk sınavdır. Kural ek yerleştirmede yerleşip başlamayanlar için de geçerlidir. Uzmanlığını tamamlamış hekim bu üç durumun dışında kalır; başvuru formunda bunun için “Uzmanlık Eğitimimi Tamamladım” seçeneği vardır.',
      'Kesintinin sayısal etkisi hedef puan yükseldikçe büyür. Ham puanı 50,00 olan bir adayda %5 kesinti 2,50 puan düşüşle 47,50 puana iner. Ham puanı 65,00 olan bir adayda kayıp 3,25 puandır ve sonuç 61,75 puana geriler. Ham puanı 70,00 olan bir adayda ise 3,50 puan kayıpla 66,50 puan elde edilir. Kesinti altındayken 65,00 puana ulaşmak için yaklaşık 68,42 ham puan gerekir.',
      'Bu tablo tercih stratejisini doğrudan etkiler. Yalnızca “deneme olsun” diye gidilmeyecek bir hastaneyi tercih listesine yazmak, yerleşip başlamama durumunda sonraki sınavda 3 puanın üzerinde yük oluşturur. Kesintinin net hedefine etkisini görmek için [TUS Puan Hesaplayıcı](/puan-hesapla/) sayfasındaki %5 kesinti seçeneğini açabilirsin. Başvuru formunda durumunu doğru beyan et. Kılavuza göre yanlış beyan sonradan anlaşılırsa sınavdan kazandığın tüm haklar düşer. Başvuru süresi bittikten sonra önceki dönemin ek yerleştirmesiyle bir programa yerleşirsen, puanın beyanına bakılmadan %5 düşer.',
    ],
    table: {
      caption: '16 Mayıs 2024 Resmî Gazete değişikliği ve 2026-TUS 2. dönem kılavuzuna göre %5 puan kesintisi tablosu',
      headers: ['Durum / Puan', 'Uygulama Kuralı', 'Kesinti Sonrası Örnek'],
      rows: [
        ['Uzmanlık eğitimine devam', 'Girilen her sınavda %5 kesinti', 'Eğitim sürdükçe her TUS’ta uygulanır'],
        ['Eğitimden istifa', 'Takip eden ilk sınavda %5 kesinti', 'İstifadan sonra ÖSYM’nin yaptığı ilk TUS'],
        ['Yerleşip başlamama', 'Takip eden ilk sınavda %5 kesinti', 'Ana ya da ek yerleştirmede eğitime başlanmazsa'],
        ['50,00 ham puan örneği', '× 0,95 (−2,50 puan)', '47,50 puan'],
        ['65,00 ham puan örneği', '× 0,95 (−3,25 puan)', '61,75 puan'],
        ['70,00 ham puan örneği', '× 0,95 (−3,50 puan)', '66,50 puan'],
      ],
    },
    actionSteps: [
      'Tercih listene yalnızca gerçekten gidip başlayacağın programları yaz; 30 satırı doldurmak için istemediğin kadroları ekleme.',
      'Uzmanlık eğitimine devam ediyorsan ya da istifa ettiysen deneme hedeflerini %5 kesinti sonrası puana göre belirle.',
      'Kesinti sonrası 65 puan hedefliyorsan ham puan hedefini yaklaşık 68,4 bandına çekerek çalışma planını buna göre kur.',
      'Puan hesaplayıcıda %5 kesinti anahtarını açarak hedeflediğin dalın taban puanı için gereken ek net sayısını kontrol et.',
      'İstifa kararından önce takvime bak. Kesinti senin başvuracağın değil, ÖSYM’nin istifadan sonra yapacağı ilk sınava aittir.',
    ],
    faq: [
      {
        q: 'TUS %5 puan kesintisi kaç sınav boyunca uygulanır?',
        a: 'İstifa ve yerleşip başlamamada yalnızca ÖSYM’nin yaptığı takip eden ilk TUS’ta uygulanır. Uzmanlık eğitimi sürerken ise girdiğin her TUS’ta uygulanır.',
      },
      {
        q: 'Tercih yapıp hiçbir yere yerleşemezsem %5 kesinti olur mu?',
        a: 'Hayır. Hiçbir programa yerleşemediysen kesinti olmaz. Kesinti yalnızca yerleşip başlamayana, istifa edene ve eğitimi sürerken sınava girene uygulanır.',
      },
      {
        q: 'Puan kesintisi ne zaman %2’den %5’e çıktı?',
        a: 'Oran 16 Mayıs 2024 tarihli ve 32548 sayılı Resmî Gazete’de yayımlanan yönetmelik değişikliğiyle %2’den %5’e çıkarıldı.',
      },
      {
        q: '60 puan alan bir adayda %5 kesinti kaç puan düşürür?',
        a: '60,00 puanın %5’i 3,00 puandır; kesinti sonrası puan 57,00 olur.',
      },
    ],
    boundaryNote:
      'Bu özet 16 Mayıs 2024 tarihli Resmî Gazete değişikliği ve 2026-TUS 2. dönem başvuru kılavuzuna dayanır. Özel hukuki durumlar ve istisnalar için yürürlükteki yönetmelik metni ile ilgili dönemin ÖSYM kılavuzu esas alınmalıdır.',
    sources: [
      {
        label: 'Yönetmelik Değişikliği: %2’den %5’e Puan Kesintisi (16 Mayıs 2024, Sayı 32548)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (Sayı 31942)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS Puan Hesaplayıcı (%5 kesinti)', href: '/puan-hesapla/' },
      { label: 'TUS tercihi nasıl yapılır?', href: '/rehber/tus-tercihi-nasil-yapilir/' },
      { label: 'TUS ek yerleştirme nedir?', href: '/rehber/tus-ek-yerlestirme-nedir/' },
      { label: 'TUS Taban Puanları ve Kontenjan', href: '/tus-taban-puanlari-ve-kontenjan/' },
    ],
    keywords: 'tus yüzde 5 puan kesintisi kimlere uygulanır istifa yerleşip gitmeme puan düşmesi yönetmelik',
  },
  {
    slug: 'tus-sinavinda-sure-yonetimi',
    order: 17,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Sınav ve Takvim',
    tone: 'Markasız',
    questionH1: 'TUS’ta 135 dakika nasıl yönetilir?',
    seoTitle: 'TUS’ta 135 dakika nasıl yönetilir? Tur planı | TusAnkiM',
    seoDescription:
      'TUS’ta her oturum 100 soru ve 135 dakikadır (soru başına 81 saniye). İlk tur 95 dk, ikinci tur 25 dk, optik kontrol 15 dk ve 4 yanlış 1 doğru kuralı.',
    directAnswer:
      'TUS’ta her oturumda 100 soru için 135 dakika verilir; bu süre soru başına ortalama 81 saniyedir. En dengeli akış ilk 95 dakikada net soruları bitirip zor soruları işaretlemek, sonraki 25 dakikada işaretli sorulara dönmek ve son 15 dakikayı optik kontrolüne ayırmaktır.',
    whyMisconceived: [
      'Adaylar çoğu zaman ilk sorudan başlayıp her zor soruyu o anda çözmeden geçmemeye çalışır. Tek bir uzun vaka sorusunda 4–5 dakika kaybedildiğinde son 20 soruya panikle girilir ve aslında bilinen kolay sorular dikkat hatasıyla kaçar. Oysa tüm soruların oturum içindeki ham net değeri birbirine eşittir.',
      'Bir diğer yaygın hata optik kodlamayı sınavın son 10 dakikasına toplu bırakmaktır. Yorgun zihinle yapılan toplu kodlamada tek bir kaydırma tüm sütunu bozabilir. Ayrıca sınav sonuna kalan kodlama telaşı işaretli sorulara ayrılan ikinci tur süresini tüketir.',
      'Ayrıca ilk 100 dakika salondan çıkılamadığını bilmeyen bazı adaylar hızlanıp sınavı erken bitirmeye çalışır. Oysa erken bitirmek ek puan getirmez; kalan dakikaları sakin kontrole kullanmak çok daha verimlidir.',
    ],
    truthParagraphs: [
      '[2026-TUS 2. dönem başvuru kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre Temel Tıp saat 10.15’te, Klinik Tıp saat 14.45’te başlar. Her oturumda 100 soru için 135 dakika verilir ve her testte 4 yanlış 1 doğruyu götürür. Sınavın ilk 100 dakikasında ve son 15 dakikasında salondan çıkış yasaktır; bu kural zaman planını doğal olarak üç bloğa böler.',
      'Birinci blokta (ilk 95 dakika) soru başına yaklaşık 55–60 saniye hızla ilerlemek idealdir. İlk okuyuşta emin olduğun soruları çöz, iki şık arasında kaldığın ya da uzun işlem isteyen soruları kitapçıkta belirgin işaretle ve geç. Optik formu her sayfa bitince kodla. Bu hem kaydırma riskini azaltır hem gözüne kısa bir mola verir. Bu düzenle 50. soruya geldiğinde yaklaşık 45–50. dakikada olursun.',
      'İkinci blokta (95–120. dakikalar, 25 dakika) yalnızca boş bıraktığın ve işaretlediğin sorulara dön. 4 yanlış 1 doğruyu götürdüğü için hiçbir fikrin olmayan soruda rastgele işaretleme yapma. Üç şıkkı kesin elediysen kalan iki şık arasında işaretlemek beklenen değerde +0,375 net getirir. Hiç eleme yapamadığın soruda beklenen değer sıfırdır. Zorlandığın uzun Klinik vaka sorularını ikinci tura bırakmak ilk turdaki hızını korur.',
      'Üçüncü blok olan son 15 dakikada salondan çıkış zaten yasaktır. Bu süreyi cevapları şüpheyle değiştirmek için değil, optik formdaki boş satırları ve kitapçık eşleşmesini son kez kontrol etmek için kullan. İlk cevabı yalnızca kesin bir bilgi hatası ya da soru kökünde “değildir” gibi bir okuma yanlışı yakaladığında değiştir. Sınav öncesi denemelerini aynı 135 dakikalık blokla ve TusAnkiM’deki Kronometre düzeniyle çalışmak bu ritmi otomatikleştirir. Öğleden sonraki Klinik oturumda yorgunluk artar. Tur düzenini denemelerde önceden oturt. Her tam denemede 95, 25 ve 15 dakikalık üç bloğu aynı sırayla uygula.',
    ],
    table: {
      caption: '2026-TUS 2. dönem 100 soru / 135 dakika oturum yapısına göre 3 bloklu süre planı',
      headers: ['Zaman Bloğu', 'Süre', 'Hedef', 'Kontrol Noktası'],
      rows: [
        ['1. Tur (Dakika 0–95)', '95 dakika', 'Tüm 100 soruyu gör, net olanları çöz', '50. soruda ~45–50. dakikada ol'],
        ['Sayfa sonu kodlama', '1. tur içinde', 'Her sayfa bitince optiğe aktar', 'Kaydırma hatasını erken yakalar'],
        ['2. Tur (Dakika 95–120)', '25 dakika', 'İşaretli ve iki şıklı sorulara dön', 'Hiç fikrin olmayan soruyu boş bırak'],
        ['Son kontrol (Dakika 120–135)', '15 dakika', 'Optik eşleşme ve okuma kontrolü', 'Kesin hata yoksa ilk cevabı değiştirme'],
      ],
    },
    actionSteps: [
      'Sınavdan önceki son 4–6 haftada çözdüğün tüm tam denemeleri gerçek 135 dakikalık süre ve optik kodlamayla uygula.',
      'İlk turda herhangi bir soruya 90 saniyeden fazla takılma; net bir işaret koyup sonraki soruya geç.',
      '50. soruya geldiğinde saatini bir kez kontrol et; 45–50. dakika bandındaysan tempon dengelidir.',
      'Kodlamayı sınav sonuna bırakma. Her sayfa bitince o sayfanın cevaplarını optiğe geçir.',
      'İki oturum arasındaki öğle molasında Temel oturumdaki soruları arkadaşlarınla tartışma; Klinik oturum için zihinsel enerjini koru.',
    ],
    faq: [
      {
        q: 'TUS’ta soru başına kaç saniye düşer?',
        a: '100 soru için 135 dakika verildiğinden soru başına ortalama 81 saniye düşer.',
      },
      {
        q: 'TUS’ta iki şık arasında kalınca işaretlemek mantıklı mı?',
        a: 'Üç şıkkı kesin elediysen evet. 4 yanlış 1 doğruyu götürdüğü için iki şık arasında işaretlemenin beklenen değeri +0,375 nettir. Hiç fikrin yoksa beklenen değer sıfırdır, boş bırakmak riski azaltır.',
      },
      {
        q: 'TUS’ta ilk kaç dakika salondan çıkılmaz?',
        a: '2026-TUS 2. dönem kılavuzuna göre her oturumun ilk 100 dakikasında ve son 15 dakikasında salondan çıkış yasaktır.',
      },
      {
        q: 'Sınav sonunda cevap değiştirmek doğru mu?',
        a: 'Yalnızca soru kökünü yanlış okuduğunu (örneğin olumsuz eki kaçırdığını) ya da kesin bir bilgiyi sonradan hatırladığını fark edersen değiştir; belirsiz şüpheyle ilk cevabı bozma.',
      },
    ],
    boundaryNote:
      'Süre dağılımı 2026-TUS 2. dönem kılavuzundaki 100 soru / 135 dakika oturum yapısına göre örneklenmiştir. Okuma hızına ve deneme performansına göre tur dakikalarını sınav öncesinde test edip sabitlemelisin.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu md. 1.3, 3.2, 4.2 (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM TUS Çıkmış Sorular Arşivi (2. Dönem)',
        url: 'https://www.osym.gov.tr/SinavGrubu/Menu/1892',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS sınav günü ne götürülür?', href: '/rehber/tus-sinav-gunu-ne-goturulur/' },
      { label: 'TUS’ta hangi dersten kaç soru çıkar?', href: '/rehber/tus-hangi-dersten-kac-soru-cikar/' },
      { label: 'Deneme analizi ve hata defteri', href: '/rehber/tus-deneme-analizi-ve-hata-defteri/' },
      { label: 'Kronometre ve çalışma takvimi', href: '/yardim/kronometre/' },
    ],
    keywords: 'tus süre yönetimi 135 dakika 100 soru tur taktiği 4 yanlış 1 doğru optik kodlama',
  },
  {
    slug: 'tus-son-hafta-ve-son-3-gun',
    order: 18,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Çalışma Planı',
    tone: 'Yumuşak',
    questionH1: 'TUS’tan önceki son hafta ve son 3 gün ne yapılır?',
    seoTitle: 'TUS’tan önce son hafta ve son 3 gün planı | TusAnkiM',
    seoDescription:
      'TUS son haftasında yeni kaynak açılmaz; yalnız tekrar kartları ve hata notları taranır, uyku 10.15 oturumuna ayarlanır ve son 3 günde lojistik tamamlanır.',
    directAnswer:
      'TUS’tan önceki son haftada yeni konu ya da yeni kaynak açılmaz; yalnızca mevcut tekrar kartları, kısa hata notları ve yüksek getirili tablolar taranır. Son 3 günde tam deneme kesilir, uyku saati 10.15 Temel oturumuna ayarlanır ve sınav sabahının belgeleri önceden hazırlanır.',
    whyMisconceived: [
      'Sınav haftasına girildiğinde birçok aday eksik kalma kaygısıyla yeni kitaplar açar ya da son 2 güne kadar üst üste tam deneme çözer. Bu tempo belleğe yeni kalıcı bilgi eklemez; aksine zihinsel yorgunluğu sınav sabahına taşır. Ayrıca son günlerde alınan düşük bir deneme sonucu sınav motivasyonunu gereksiz yere kırar.',
      'Bir diğer yaygın hata gece geç saatlere kadar ders çalışıp sınav sabahı erken kalkmaya çalışmaktır. Gece 02.00’ye kadar çalışan bir zihin, saat 10.15’teki Temel ve 14.45’teki Klinik oturumlarda dikkat düşüşü yaşar.',
      'Kimi adaylar da Sınava Giriş Belgesini ve kimliğini son akşama bırakır. Yazıcı arızası, kimlikteki fotoğraf sorunu ya da bina yolunu bilmemek son gün gereksiz stres yaratır.',
    ],
    truthParagraphs: [
      'Bilgiyi kendini sınayarak hatırlamak, aynı süreyi yeniden okumaya harcamaktan daha kalıcıdır ([Roediger ve Karpicke, 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x)). Son haftada kitabı baştan okumak yerine vadesi gelen kartları hatırlamaya çalış. Son 7 günde yeni kart açma.',
      'Sınavdan 7, 6 ve 5 gün önce yalnızca vadesi gelen FSRS-6 tekrarlarını ve zorlandığın kartları tara. Son 1 ayın deneme yanlışlarından çıkardığın kısa notları da gözden geçir. Son bir tam deneme çözeceksen bunu en geç 4 gün önce çöz. Ertesi gün yalnızca yanlışlarını ayıkla.',
      '[2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre Temel oturum 10.15’te (son giriş 10.00), Klinik oturum 14.45’te (son giriş 14.30) başlar. Son hafta boyunca her sabah aynı saatte kalkıp 10.15–12.30 ve 14.45–17.00 aralıklarında aktif tekrar yapmak biyolojik ritmini sınav saatlerine oturtur. Son 3 günde yoğun çalışmayı günde 3–4 saatle sınırla. Uyku saatini sınav sabahına göre şimdiden sabitle; sınav günü 10.00’dan önce binada olmak için ne zaman kalkman gerektiğini hesapla. Ulaşım süresine en az 30 dakika pay ekle.',
      'Son gün (sınavdan 1 gün önce) ağır konu tekrarını bırak; yalnız 1–2 saatlik hafif göz gezdirme yap ve akşam erken uyu. İki oturumun ayrı Sınava Giriş Belgelerini, geçerli T.C. kimlik kartını ve etiketsiz şeffaf su şişeni önceki akşam hazır koy. Sınav haftasındaki tekrar kuyruğunu çevrimdışı sürdürmek istersen [TusAnkiM Web uygulamasını](https://tusankim.vercel.app/uygulama) kullanabilir, [Sınav Günü Kontrol Listesi](/rehber/tus-sinav-gunu-ne-goturulur/) ile belgelerini tek tek doğrulayabilirsin. Sabah kahvaltını ve ulaşım planını önceden netleştirmek iki oturum boyunca zihnini sakin tutar.',
    ],
    table: {
      caption: 'TUS’tan önceki son 7 gün için gün gün tekrar, uyku ve lojistik düzeni',
      headers: ['Gün', 'Çalışma Odağı', 'Günlük Süre', 'Lojistik / Ritim'],
      rows: [
        ['7–5. günler', 'Vadesi gelen FSRS-6 tekrarları + hata kartları', '4–5 saat', '10.15 ve 14.45 bloklarında çalışma'],
        ['4. gün', 'Son tam deneme (isteğe bağlı)', '4–5 saat', 'AİS’ten 2 ayrı Giriş Belgesini yazdır'],
        ['3. gün', 'Denemenin yanlışları, kısa tablolar ve zor kartlar', '3–4 saat', 'Sınav binası ulaşım süresini kontrol et'],
        ['2. gün', 'Zayıf branş hata notları ve hafif kart tekrarı', '2–3 saat', 'Kimlik, belge ve kıyafet kontrolü'],
        ['1. gün (önceki gün)', 'Çok hafif göz gezdirme, yeni bilgi yok', '1–2 saat', 'Akşam tüm eşyaları hazırla, erken uyu'],
      ],
    },
    actionSteps: [
      'Son 7 günde yeni konu kitabı, yeni soru bankası ve yeni kart açmayı tamamen durdur.',
      'Her sabah sınav saatine uygun uyan ve ana tekrar bloklarını 10.15 ve 14.45 saatlerine yerleştir.',
      'Son 3 günde tam süreli deneme çözmeyi bırak; yalnız vadesi gelen tekrarları ve son 1 ayın hata kartlarını gözden geçir.',
      'Sınava Giriş Belgelerini (Temel ve Klinik ayrı ayrı) ve kimlik kartını sınavdan en az 2 gün önce hazırla.',
      'Önceki gece geç saate kadar çalışmak yerine hafif yürüyüş ve düzenli uykuyla sınav sabahına zinde çık.',
    ],
    faq: [
      {
        q: 'TUS’tan 1 gün önce ders çalışılır mı?',
        a: 'Ağır konu tekrarı ve yeni bilgi yüklemesi önerilmez. En fazla 1–2 saatlik hafif kart ya da hata notu taraması yapıp akşamı dinlenmeye ayırmak daha verimlidir.',
      },
      {
        q: 'Son haftada yeni deneme çözmek doğru mu?',
        a: 'Çözeceksen son tam denemeyi en geç sınavdan 4 gün önce çöz. Son 3 günde yeni deneme yorgunluk ve gereksiz kaygı yaratır.',
      },
      {
        q: 'Son haftada tüm FSRS-6 tekrarları bitmezse ne yapılmalı?',
        a: 'Yeni kartı sıfırla ve yalnız vadesi gelen temel/klinik tekrarlarını ile sürekli unuttuğun hata kartlarını önceliklendir.',
      },
      {
        q: 'Sınava Giriş Belgesi ne zaman çıkar?',
        a: '2026-TUS 2. dönem kılavuzuna göre giriş belgeleri sınavdan yaklaşık 10 gün önce ais.osym.gov.tr adresinde yayımlanır.',
      },
    ],
    boundaryNote:
      'Bu düzen çalışma alışkanlığı ve uyku ritmi için genel bir rehberdir; tıbbi ya da psikolojik danışmanlık yerine geçmez. Oturum saatleri 2026-TUS 2. dönem kılavuzuna göre verilmiştir; kesin saatler için Sınava Giriş Belgeni kontrol et.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu md. 1.3, 3 (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Roediger ve Karpicke (2006), Test-enhanced learning',
        url: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
        publisher: 'Psychological Science',
      },
    ],
    relatedLinks: [
      { label: 'TUS sınav günü ne götürülür?', href: '/rehber/tus-sinav-gunu-ne-goturulur/' },
      { label: 'TUS’a 2 ay kala ne yapmalı?', href: '/rehber/tusa-2-ay-kala-ne-yapmali/' },
      { label: 'TUS’ta 135 dakika nasıl yönetilir?', href: '/rehber/tus-sinavinda-sure-yonetimi/' },
      { label: '5. sınıf, intörn ve son 1 ay programı', href: '/rehber/5-sinif-intorn-son-1-ay-tus-programi/' },
    ],
    keywords: 'tus son hafta ne yapılır tus son 3 gün sınav öncesi gün uyku düzeni tekrar planı',
  },
];
