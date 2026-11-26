import type { RehberArticle } from './types';

export const REHBER_PART_4: RehberArticle[] = [
  {
    slug: 'tus-tercihi-nasil-yapilir',
    order: 9,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Tercih ve Yerleştirme',
    tone: 'Markasız',
    questionH1: 'TUS tercihi nasıl yapılır?',
    seoTitle: 'TUS tercihi nasıl yapılır? 30 tercih kuralı | TusAnkiM',
    seoDescription:
      'TUS tercihi ais.osym.gov.tr üzerinden en fazla 30 programla yapılır. 45 puan barajı, yabancı dil, eşit puan, 10 iş günü kayıt ve %5 kesinti kuralları.',
    directAnswer:
      'TUS tercihi, ilgili puan türünde en az 45 puanı ve geçerli yabancı dil belgesi olan adayların ais.osym.gov.tr adresinden en fazla 30 program seçmesiyle yapılır. 2026-TUS 2. dönem kılavuzuna göre liste süre bitene kadar değişir. Yerleşip eğitime başlamazsan ÖSYM’nin yaptığı ilk sınavda puanın %5 düşer.',
    whyMisconceived: [
      'Forumlarda sık dolaşan bir inanca göre ÖSYM yerleştirmede yalnızca puana bakar ve programın kaçıncı sırada yazıldığı sonucu değiştirmez. Bu yüzden pek çok aday 30 satırın tamamını doldurmak için gitmeyeceği hastaneleri listenin altına ekler.',
      'Bir diğer yaygın karışıklık puan türü ve barajla ilgilidir. Kimi adaylar 45 puanı herhangi bir puan türünde geçmenin tüm dallara kapı açtığını sanır. Yabancı dil şartının da sınav başvurusunda değil, tercih ve yerleştirme aşamasında kontrol edildiği çoğu zaman gözden kaçar.',
      'Eski tartışmalarda yerleşip gitmemenin ya da eğitimden istifa etmenin bedeli hâlâ %2 kesinti olarak anılır. Güncel yönetmelikteki oranı bilmeden yapılan bir tercih, sonraki sınavda beklenenden ağır bir puan kaybına yol açar.',
    ],
    truthParagraphs: [
      '[2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre tercihler ais.osym.gov.tr üzerinden alınır ve en fazla 30 program yazılabilir. Tercih hakkı için programın istediği puan türünde en az 45 puan gerekir. Her uzmanlık dalının Klinik Tıp Puanı (K) mı yoksa Temel Tıp Puanı (T) mı istediği o dönemin kontenjan tablosunda yazar. Tercih süresi dolana kadar listeyi istediğin zaman güncelleyebilirsin.',
      'Kılavuzda kontenjanlar üniversite, Sağlık Bakanlığı eğitim ve araştırma hastanesi, Sağlık Bakanlığı adına üniversite ve Adli Tıp Kurumu olarak ayrılır. Bunun yanında yabancı uyruklu, KKTC, misafir askerî personel ve tıp dışı meslek mensupları kontenjanları bulunur. Yerleştirmede puanı eşit olan adaylar arasında programı daha üst sıraya yazan öncelik alır. [Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) gereği yabancı dil şartı (en az 50 puan) tercihte kontrol edilir. Şartı taşımayan aday yerleştirilse bile ataması yapılmaz.',
      'Yerleştirme sonucu ilan edildikten bir iş günü sonra 10 iş günlük kayıt süresi başlar. Bu sürede kaydını yaptırmayan aday hakkını kaybeder. [16 Mayıs 2024 tarihli Resmî Gazete](https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm) değişikliğiyle kesinti oranı %2’den %5’e çıktı. Yerleşip eğitime başlamayanın ve istifa edenin puanı, ÖSYM’nin yaptığı takip eden ilk sınavda %5 düşer. Eğitime devam ederken girilen her TUS’ta da aynı kesinti uygulanır. Bu yüzden listeye yalnızca gerçekten başlayacağın programları yaz.',
      'İlk yerleştirmede boş kalan kadrolar için ek yerleştirme açılır. O dönem sınava girmiş, hiçbir programa yerleşmemiş ve ilgili puanı 45 ve üzeri olan adaylar ek yerleştirmeye başvurabilir. Örnek takvim olarak [ÖSYM duyurularında](https://www.osym.gov.tr) 2026-TUS 2. dönem sınavı 23 Ağustos 2026’da yapıldı ve sonuçlar 17 Eylül’de açıklandı. Tercihler 30 Eylül–7 Ekim’de alındı, yerleştirme 16 Ekim’de ilan edildi, ek yerleştirme tercihi ise 20–26 Kasım 2026’da açıldı.',
    ],
    table: {
      caption: '2026-TUS 2. dönem kılavuzu ve Resmî Gazete yönetmeliğine göre TUS tercih kuralları',
      headers: ['Kural', 'Ölçü veya Süre', 'Uygulama'],
      rows: [
        ['Tercih sayısı', 'En fazla 30 program', 'ais.osym.gov.tr üzerinden süre bitene kadar değişir'],
        ['Puan barajı', '45 puan ve üzeri', 'Programın istediği K veya T puan türünde aranır'],
        ['Yabancı dil', 'En az 50 puan (5 yıl)', 'Tercihte kontrol edilir; şart yoksa atama yapılmaz'],
        ['Eşit puan', 'Üst tercih önceliği', 'Aynı puanda programı daha yukarı yazan yerleşir'],
        ['Kayıt süresi', '10 iş günü', 'Sonuç ilanından bir iş günü sonra başlar'],
        ['Puan kesintisi', '%5', 'Yerleşip başlamama ve istifada takip eden ilk sınavda; eğitim sürerken her sınavda'],
        ['Ek yerleştirme', '45 puan + yerleşmemiş', 'O dönem sınava girip boşta kalan adaylar başvurur'],
      ],
    },
    actionSteps: [
      'Tercih ekranı açılmadan önce AİS üzerinden ilgili K veya T puanını ve yabancı dil belgenin geçerliliğini kontrol et.',
      'Kontenjan tablosundan hedeflediğin dalların K puanıyla mı T puanıyla mı aldığını ve kontenjan türünü tek tek doğrula.',
      'Gitmeyeceğin bir programı 30 satırı doldurmak için listeye yazma. Yerleşip başlamamak takip eden ilk sınavda %5 kesinti getirir.',
      'Programları gerçekten gitmek istediğin sırayla yukarıdan aşağıya diz; eşit puanda üst tercih önceliklidir.',
      'Yerleştirme sonuçlandığında 10 iş günlük kayıt takvimini hemen işaretle; yerleşemediysen ek yerleştirme duyurusunu osym.gov.tr adresinden izle.',
    ],
    faq: [
      {
        q: 'TUS’ta 30 tercihin tamamını doldurmak zorunlu mu?',
        a: 'Hayır, 30 program üst sınırdır. Yalnızca gerçekten başlayacağın programları yaz. İstemediğin bir programa yerleşip başlamazsan ÖSYM’nin yaptığı ilk sınavda puanın %5 düşer.',
      },
      {
        q: 'Tercih listesi onaylandıktan sonra değiştirilebilir mi?',
        a: 'Evet, 2026-TUS 2. dönem kılavuzuna göre tercih süresi bitene kadar ais.osym.gov.tr üzerinden listeni değiştirebilirsin.',
      },
      {
        q: 'Aynı puana sahip iki adaydan hangisi yerleşir?',
        a: 'Eşit puanda ilgili programı tercih listesinde daha üst sıraya yazan aday öncelik alır.',
      },
      {
        q: 'Yerleştikten sonra kaç gün içinde kayıt yaptırmak gerekir?',
        a: 'Kayıt süresi yerleştirme sonucunun ilanından bir iş günü sonra başlar ve 10 iş günü sürer.',
      },
    ],
    boundaryNote:
      'Bu bilgiler 2026-TUS 2. dönem başvuru kılavuzu ve yürürlükteki Resmî Gazete yönetmeliğine dayanır. Kesin tercih takvimi, kontenjan dağılımı ve dal bazlı K/T tablosu için ilgili dönemin resmî ÖSYM kılavuzu esas alınmalıdır.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (Sayı 31942)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'Yönetmelik Değişikliği: %2’den %5’e Puan Kesintisi (16 Mayıs 2024, Sayı 32548)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'ÖSYM Resmî Duyurular Portalı',
        url: 'https://www.osym.gov.tr',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS Taban Puanları ve Kontenjan', href: '/tus-taban-puanlari-ve-kontenjan/' },
      { label: 'TUS ek yerleştirme nedir?', href: '/rehber/tus-ek-yerlestirme-nedir/' },
      { label: 'TUS’ta %5 puan kesintisi', href: '/rehber/tus-yuzde-5-puan-kesintisi/' },
      { label: 'TUS yabancı dil şartı', href: '/rehber/tus-yabanci-dil-sarti/' },
    ],
    keywords: 'tus tercihi nasıl yapılır 30 tercih 45 barajı eşit puan kayıt süresi yüzde 5 kesinti ek yerleştirme',
  },
  {
    slug: 'tus-yabanci-dil-sarti',
    order: 10,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Tercih ve Yerleştirme',
    tone: 'Markasız',
    questionH1: 'TUS’a yabancı dil puanı olmadan girilir mi?',
    seoTitle: 'TUS yabancı dil şartı: 50 puan ve 5 yıl kuralı | TusAnkiM',
    seoDescription:
      'Evet, yabancı dil puanı olmadan TUS’a girilir; ancak yerleştirme için son 5 yılda en az 50 puan şarttır. 2026-TUS 2. dönem dil kuralları ve belge süresi.',
    directAnswer:
      'Evet, yabancı dil puanın olmadan TUS’a girebilirsin; ancak dil yeterliliği yerleştirme ve ek yerleştirme için zorunludur. 2026-TUS 2. dönem kılavuzuna göre tercih yapabilmek için İngilizce, Fransızca ya da Almancadan son 5 yılda en az 50 puan almış olman gerekir.',
    whyMisconceived: [
      'Adaylar arasında yabancı dil puanı olmadan TUS başvurusu yapılamayacağı inancı sık tekrarlanır. Bu yüzden dil sınavına henüz girmemiş pek çok yeni mezun hekim, kendini denemek için bile başvurmaz ve bir dönemi boş geçirir.',
      'Diğer uçta ise dil şartının yalnızca hastaneye kesin kayıt gününde sorulacağını sananlar vardır. Tercih ekranında puanını gören aday, dil belgesi eksikse yerleştirme sonrası atama aşamasında hak kaybı yaşayacağını geç fark eder.',
      'Beş yıllık geçerlilik süresinin hangi güne göre hesaplandığı da forumlarda sık karışır. Çoğu aday hesabı sınav günü ya da tercih günü üzerinden yapar. Oysa kılavuz süre hesabında başka bir başlangıç gününü esas alır.',
    ],
    truthParagraphs: [
      '[Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği](https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm) madde 12/4 ve [2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre yabancı dil yeterliliği İngilizce, Fransızca ya da Almancadan belgelenir. ÖSYM’nin YDS’sinde ya da Sağlık Bakanlığı veya YÖK’ün yaptığı ya da yaptırdığı bir dil sınavında 100 üzerinden en az 50 gerekir. Kılavuz Bakanlık sınavı olarak TÖMER TIPDİL’i anar. ÖSYM’nin denk saydığı uluslararası belgeler de kabul edilir. Güncel eşdeğerlik tablosu [ÖSYM Yabancı Dil Eşdeğerlikleri](https://www.osym.gov.tr/esdegerlikler) sayfasında yayımlanır.',
      'Kılavuz yabancı dil şartını sınava girmek için aramaz. Dil belgesi olmayan aday başvurusunu yapar, sınava girer ve hem Temel hem Klinik puanını görür. Buna karşılık yerleştirme ve ek yerleştirme için dil yeterliliği zorunludur ve tercih aşamasında kontrol edilir. Şartı taşımayan aday bir programa yerleştirilse bile ataması yapılmaz. Sınav ile tercih arasındaki haftalar kısıtlı olduğu için (örneğin 2026-TUS 2. dönemde sınav 23 Ağustos, tercih 30 Eylül–7 Ekim’deydi) dil sınavını sınav sonrasına bırakmak risklidir.',
      'Dil sınavı sonucu, girdiğin dil sınavının tarihinden itibaren 5 yıl geçerlidir. 2026-TUS 2. dönem kılavuzuna göre sürenin dolup dolmadığına TUS sınav günü ya da tercih günü değil, ilgili TUS başvurusunun ilk günü bakılır. [ÖSYM 2027 sınav takvimine](https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf) göre 2027-TUS 1. dönem başvurusu 2 Şubat 2027’de, 2. dönem başvurusu 5 Temmuz 2027’de başlar. Belgenin 5 yılı doldurup doldurmadığını bu başvuru başlangıç günlerine göre kontrol etmen gerekir.',
      'ÖSYM sisteminde otomatik görünmeyen uluslararası bir dil belgesi kullanıyorsan belgeyi dilekçeyle ÖSYM’ye ulaştırmalısın. 2026-TUS 2. dönem kılavuzuna göre bu belgenin tercihin son günü saat 12.00’ye kadar ÖSYM’ye ulaşmış olması şarttır. TIPDİL gibi Bakanlık sınavıyla şartı sağlıyorsan sonucun tercihten önce kurum tarafından ÖSYM’ye bildirilmiş olmalı. İki sınavda kullandığın T.C. kimlik numarası da aynı olmalı. Bu yüzden belge işlerini tercih açılmadan haftalar önce bitir.',
    ],
    table: {
      caption: '2026-TUS 2. dönem kılavuzu ve Yönetmelik md. 12/4 uyarınca TUS yabancı dil şartı özeti',
      headers: ['Başlık', 'Kural', 'Dikkat Edilecek Nokta'],
      rows: [
        ['Geçerli diller', 'İngilizce, Fransızca, Almanca', 'Üç dilden birinde yeterlilik gerekir'],
        ['Taban puan', '100 üzerinden en az 50', 'YDS, Bakanlık ya da YÖK sınavı veya denk uluslararası belge'],
        ['Geçerlilik süresi', '5 yıl', 'Bitişe TUS başvurusunun ilk gününe göre bakılır'],
        ['Kontrol aşaması', 'Yerleştirme ve ek yerleştirme', 'Sınava girmek için aranmaz; şart yoksa atama olmaz'],
        ['2027 başvuru başı', '2 Şubat ve 5 Temmuz 2027', '5 yıllık hesap bu başlangıç günlerine göre yapılır'],
        ['Uluslararası belge', 'Tercihin son günü 12.00', 'Dilekçeyle ÖSYM’ye ulaşmış olması gerekir'],
      ],
    },
    actionSteps: [
      'Mevcut dil sınavı sonuç belgenin tarihini çıkar ve hedeflediğin TUS başvurusunun ilk gününe göre 5 yıllık geçerliliği hesapla.',
      'Henüz 50 puanın yoksa dil sınavını tercih dönemine bırakma. TUS hazırlığı sürerken en yakın YDS oturumuna gir.',
      'Uluslararası bir belge kullanacaksan güncel denkliği osym.gov.tr/esdegerlikler adresinden doğrula ve dilekçeni tercihin son günü 12.00’ye kalmadan gönder.',
      'YDS sonucunun AİS profilinde doğru göründüğünü, TIPDİL sonucunun ÖSYM’ye bildirildiğini tercih başlamadan kontrol et.',
      'Dil belgen hazır olmasa da sınav pratiği için TUS’a girebileceğini bil; ancak tercih yapmadan önce şartın tamamlanmış olması gerektiğini planına yaz.',
    ],
    faq: [
      {
        q: 'TUS yabancı dil puanı kaç yıl geçerlidir?',
        a: 'Dil sınavı sonucu 5 yıl geçerlidir. Sürenin dolup dolmadığına ilgili TUS başvurusunun ilk gününe göre bakılır.',
      },
      {
        q: 'Dil puanım 50’nin altındaysa TUS’a girebilir miyim?',
        a: 'Evet, dil şartı sınava girmek için aranmaz. Ancak tercih, yerleştirme ve ek yerleştirme aşamalarında en az 50 puan zorunludur.',
      },
      {
        q: 'Hangi yabancı diller TUS için geçerlidir?',
        a: 'Yönetmelik madde 12/4 ve 2026-TUS 2. dönem kılavuzuna göre İngilizce, Fransızca ya da Almancadan birinden yeterlilik belgelenebilir.',
      },
      {
        q: 'Uluslararası dil belgesi ÖSYM’ye ne zaman teslim edilir?',
        a: '2026-TUS 2. dönem kılavuzuna göre belgenin tercihin son günü saat 12.00’ye kadar dilekçeyle ÖSYM’ye ulaşmış olması gerekir.',
      },
    ],
    boundaryNote:
      'Bu bilgiler 2026-TUS 2. dönem başvuru kılavuzu ve Yönetmelik madde 12/4’e dayanır. Uluslararası sınavların güncel puan karşılıkları ve dönemlik teslim kuralları için ÖSYM eşdeğerlik tablosu ve ilgili dönemin başvuru kılavuzu esas alınmalıdır.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği md. 12/4 (Sayı 31942)',
        url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
        publisher: 'Resmî Gazete',
      },
      {
        label: 'ÖSYM Yabancı Dil Sınavları Eşdeğerlikleri',
        url: 'https://www.osym.gov.tr/esdegerlikler',
        publisher: 'ÖSYM',
      },
      {
        label: 'ÖSYM 2027 Yılı Sınav Takvimi (28 Ekim 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS tercihi nasıl yapılır?', href: '/rehber/tus-tercihi-nasil-yapilir/' },
      { label: 'TUS başvurusu nasıl yapılır?', href: '/rehber/tus-basvurusu-nasil-yapilir/' },
      { label: '2027 TUS tarihleri ve çalışma planı', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: 'TUS Taban Puanları ve Kontenjan', href: '/tus-taban-puanlari-ve-kontenjan/' },
    ],
    keywords: 'tus yabancı dil şartı yds yökdil 50 puan 5 yıl geçerlilik tus dil puanı olmadan girilir mi',
  },
  {
    slug: 'tusa-2-ay-kala-ne-yapmali',
    order: 11,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Çalışma Planı',
    tone: 'Yumuşak',
    questionH1: 'TUS’a 2 ay kala yeni kaynak açılır mı, nasıl çalışılır?',
    seoTitle: 'TUS’a 2 ay kala ne yapmalı? 8 haftalık plan | TusAnkiM',
    seoDescription:
      'TUS’a 2 ay kala yeni kaynak açma. İlk 4 haftada yalnız 1–2 zayıf derste günde en fazla 40 yeni kart, son 4 haftada yalnız tekrar ve deneme analizi.',
    directAnswer:
      'Hayır, TUS’a 2 ay kala sıfırdan yeni kitap ya da 9.575 kartlık tam bir deste açmak yerine mevcut bilgiyi pekiştirmeye geçmelisin. İlk 4 haftada yalnız seçili eksik derslerde sınırlı yeni kart açılır; son 4 haftada yeni kart kesilip tekrar ve deneme yanlışlarına odaklanılır.',
    whyMisconceived: [
      'Sınava 60 gün kaldığında pek çok aday eksik hissettiği için elindeki notu bırakıp yeni bir özet kitap ya da yeni bir soru bankası alır. Forumlarda “son 2 ayda tüm dersleri baştan hızlıca tara” öğüdü sık döner; ancak hızlı okuma yalnız yüzeysel tanıdıklık yaratır.',
      'Bir diğer yaygın hata çalışan hekim ya da intörn ile tam zamanlı mezun adaya aynı günlük saat hedefini vermektir. Nöbetli bir düzende günde 8–10 saatlik çizelge ilk haftada aksar ve aday hem tekrarı hem denemeyi bırakır.',
      'Adaylar ayrıca son güne kadar yeni kart eklemenin daha fazla bilgi kazandıracağını sanır. Oysa son haftalarda açılan her yeni kart eski tekrar kuyruğunu büyütür ve deneme analizine kalan süreyi tüketir.',
    ],
    truthParagraphs: [
      'Aralıklı tekrar araştırmaları, aynı çalışma süresinin tek seferde yığılmak yerine günlere yayıldığında daha kalıcı olduğunu gösterir ([Cepeda ve ark., 2006](https://doi.org/10.1037/0033-2909.132.3.354)). TusAnkiM’in %90 hatırlama hedefli FSRS-6 simülasyonunda 9.575 kartlık tam paket günde 60 yeni kartla 160 günde biter. Günde 80 yeni kartta bile ilk tur 120 gün sürer. 60 günlük pencerede tüm paketi sıfırdan bitirmeye çalışmak yetişmez ve biriken tekrar kuyruğu deneme zamanını kapatır.',
      'Bu yüzden son 8 hafta iki ayrı faza bölünür. İlk 4 haftada yalnızca öncelikli 1–2 zayıf dersten sınırlı yeni kart eklenir. Örneğin 800 kartlık bir ders günde 40 yeni kartla 20 günde biter. Katalogda Anatomi 477, Biyokimya 602, Mikrobiyoloji 730 ve Farmakoloji 827 karttır. Son 4 haftaya girildiğinde yeni kart sıfırlanır; yalnızca vadesi gelen FSRS-6 tekrarları ve haftalık tam denemeler yürütülür.',
      '[2026-TUS 2. dönem kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre TUS tek günde iki oturumda yapılır. Temel Tıp 10.15’te, Klinik Tıp 14.45’te başlar; her oturumda 100 soru için 135 dakika verilir. Son 2 ayda çalışan hekim ya da intörn için günde yaklaşık 2–3 saat (60–90 dakika kart tekrarı, kalan süre deneme yanlışı) sürdürülebilir sınırdır. Tam zamanlı mezun aday ise günde 5–6 saatlik bloklarla haftada 2 tam deneme çözüp ertesi gün yanlışlarını ayıklayabilir.',
      'TusAnkiM’in son 6 TUS (2024/1–2026/2, 1.195 soru) ön değerlendirmesinde Doğrudan ve Dolaylı toplam çözüm desteği derslere göre değişir. Bu oran Farmakolojide %56,6 ve Biyokimyada %56,0 iken Anatomide %28,2 ve Küçük Stajlarda %30,2 düzeyindedir. Bu değerlendirme yapay zekâ destekli ön sınıflamadır; bağımsız hekim editör onayı henüz tamamlanmadı. Kalan güne göre günlük kart yükünü [çalışma planı aracında](/calisma-plani/) hesaplayabilirsin.',
    ],
    table: {
      caption: 'TUS’a 2 ay (8 hafta) kala hafta hafta çalışma planı ve günlük süre dağılımı',
      headers: ['Dönem', 'Yeni Kart', 'Deneme ve Tekrar', 'Günlük Süre (Çalışan / Mezun)'],
      rows: [
        ['1–2. hafta (Gün 60–46)', 'Seçili 1–2 derste 30–40/gün', 'Vadesi gelen tekrar + haftada 1 tam deneme', '2–3 saat / 5–6 saat'],
        ['3–4. hafta (Gün 45–31)', 'Seçili derste 20–30/gün', 'Deneme yanlışlarını kısa karta çevirme', '2–3 saat / 5–6 saat'],
        ['5–6. hafta (Gün 30–16)', '0 yeni kart (yalnız hata kartı)', 'Haftada 2 tam süreli (135+135 dk) deneme', '2–3 saat / 5–6 saat'],
        ['7–8. hafta (Gün 15–1)', '0 yeni kart', 'Yalnız FSRS-6 tekrarları ve son hata listesi', '2 saat / 4–5 saat'],
      ],
    },
    actionSteps: [
      'Bugün yeni kitap ya da yeni dershane notu almayı durdur; elindeki ana kaynağa ve mevcut tekrar kuyruğuna sadık kal.',
      'İlk 4 haftada yalnızca en çok hata yaptığın 1–2 dersi seç ve günlük yeni kart sınırını 40’ın altında tut.',
      'Sınava 30 gün kala yeni kart açmayı tamamen kapat; vadesi gelen tekrarları her gün bitirmeden denemeye geçme.',
      'Tam denemeleri gerçek sınav saatine (10.15 Temel, 14.45 Klinik, 135’er dakika) uygun çöz ve her yanlışı tek cümlelik karşılaştırma kartına çevir.',
      'Nöbet ertesi yorgun günlerde yeni konu açma; yalnızca telefonundan vadesi gelen tekrar kuyruğunu eriterek düzeni koru.',
    ],
    faq: [
      {
        q: 'TUS’a 2 ay kala 9.575 kartlık deste sıfırdan biter mi?',
        a: 'Hayır, FSRS-6 simülasyonunda günde 80 yeni kart temposu bile 120 gün sürer. Son 60 günde yalnızca zayıf 1–2 derse odaklanmak gerekir.',
      },
      {
        q: 'Son 2 ayda yeni kart açmayı ne zaman kesmelisin?',
        a: 'Sınava 30 gün kala yeni konu kartlarını durdurup yalnızca vadesi gelen tekrarlara ve deneme yanlışlarından ürettiğin kartlara geçmek gerekir.',
      },
      {
        q: 'Çalışan hekim ya da intörn son 2 ayda günde kaç saat çalışmalı?',
        a: 'Nöbetli düzende günde yaklaşık 2–3 saat (60–90 dakika tekrar, kalan süre soru ve hata analizi) kopmadan sürdürülebilen sınırdır.',
      },
      {
        q: 'Son 2 ayda haftada kaç tam deneme çözülmeli?',
        a: 'İlk 4 haftada haftada 1, 5. ve 6. haftalarda tam zamanlı hazırlanıyorsan haftada 2 tam süreli (135+135 dakika) deneme yeterlidir. Son 2 haftada yalnız tekrar yap.',
      },
    ],
    boundaryNote:
      'Bu plan belirli bir net artışı vaat etmez; kart yükü tahminleri FSRS-6 simülasyonuna, oturum saatleri ise 2026-TUS 2. dönem kılavuzuna dayanır. Kişisel programını nöbet düzenine, temel düzeyine ve güncel ÖSYM sınav kılavuzuna göre uyarlamalısın.',
    sources: [
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: 'Cepeda ve ark. (2006), Distributed practice in verbal recall tasks',
        url: 'https://doi.org/10.1037/0033-2909.132.3.354',
        publisher: 'Psychological Bulletin',
      },
      {
        label: 'Son 6 TUS (2024/1–2026/2) ders referansları',
        url: '/referanslar/',
        publisher: 'TusAnkiM',
      },
    ],
    relatedLinks: [
      { label: 'TUS Çalışma Planı ve Tempo Hesaplayıcı', href: '/calisma-plani/' },
      { label: 'Son hafta ve son 3 gün planı', href: '/rehber/tus-son-hafta-ve-son-3-gun/' },
      { label: 'Deneme analizi ve hata defteri', href: '/rehber/tus-deneme-analizi-ve-hata-defteri/' },
      { label: '11 Branş Referans Analizi', href: '/referanslar/' },
    ],
    keywords: 'tusa 2 ay kala ne yapmalı son 60 gün tus programı deneme tekrar planı intörn mezun',
  },
];
