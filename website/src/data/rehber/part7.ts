import type { RehberArticle } from './types';

export const REHBER_PART_7: RehberArticle[] = [
  {
    slug: 'tus-basvurusu-nasil-yapilir',
    order: 19,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Sınav ve Takvim',
    tone: 'Markasız',
    questionH1: 'TUS başvurusu nasıl yapılır?',
    seoTitle: 'TUS başvurusu nasıl yapılır? AİS ve tarihler | TusAnkiM',
    seoDescription:
      'TUS başvurusu ais.osym.gov.tr üzerinden yapılır: 2027-TUS 1. dönem 2–10 Şubat, 2. dönem 5–13 Temmuz. Geç başvuru tek gün, ücret %50 fazla.',
    directAnswer:
      'TUS başvurusu, başvuru takvimi içinde ais.osym.gov.tr ya da ÖSYM AİS mobil uygulamasından oturum seçilip sınav ücretinin yatırılmasıyla yapılır. ÖSYM 2027 takvimine göre 1. dönem başvurusu 2–10 Şubat 2027’de, 2. dönem başvurusu 5–13 Temmuz 2027’de alınır; geç başvuruda ücret %50 artırımlı ödenir.',
    whyMisconceived: [
      'Adaylar arasında yalnızca AİS ekranında “başvuruyu kaydet” tuşuna basmanın yeterli olduğu düşünülür. Oysa sınav ücreti süresi içinde ödenmedikçe başvuru tamamlanmaz ve sistem kaydı iptal eder. Ödeme onayını kontrol etmeyen adaylar sınav gününden günler önce sınava kayıtlı olmadığını fark eder.',
      'Bir diğer yaygın yanılgı geç başvuru gününde normal başvuru ücretinin ödendiğini ya da geç başvurunun birkaç gün sürdüğünü sanmaktır. ÖSYM takviminde geç başvuru tek gündür ve ücret normal tutarın %50 fazlasıdır. Üstelik geç başvuruda ödeme de aynı gün tamamlanmak zorundadır.',
      'Kimi adaylar da yalnızca Klinik oturuma girmenin Klinik puanı için yeteceğini sanır. Oysa kılavuza göre K puanı 0,4 Temel ve 0,6 Klinik, T puanı 0,6 Temel ve 0,4 Klinik ağırlıkla iki testten hesaplanır.',
    ],
    truthParagraphs: [
      '[ÖSYM 2027 Yılı Sınav Takvimine](https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf) (28 Ekim 2026) göre 2027 yılında iki TUS başvuru dönemi bulunur. 2027-TUS 1. dönem başvurusu 2–10 Şubat 2027 arasında alınır; geç başvuru günü 17 Şubat 2027’dir. 2027-TUS 2. dönem başvurusu ise 5–13 Temmuz 2027 arasında yapılır; geç başvuru günü 22 Temmuz 2027’dir.',
      'Başvuru işlemi [ÖSYM AİS](https://ais.osym.gov.tr) ekranından e-Devlet şifresi ya da ÖSYM aday şifresiyle başlar. Aday önce kimlik, fotoğraf, eğitim bilgisi ve sınav merkezi tercihini kontrol eder. Kılavuza göre geçerli fotoğraf, T.C. kimlik kartı fotoğrafı ya da son 50 ayda başvuru merkezinde çekilmiş fotoğraftır. Eğitim bilgisinde ya da mezuniyet kaydında eksiklik görürsen başvuru süresi dolmadan ilgili kurum veya ÖSYM başvuru merkezi üzerinden düzeltme yapmalısın. Ardından gireceği oturumları seçer. İki puan türü de iki testten hesaplandığı için tıp mezunları iki oturumu birlikte seçer. Sağlık durumu nedeniyle özel cihaz veya ek süre talebi olan adayların da başvuru penceresi içinde kılavuzdaki evrak adımlarını tamamlaması gerekir.',
      '[2026-TUS 2. dönem başvuru kılavuzuna](https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf) göre referans sınav ücreti test başına 2.500 TL olarak uygulandı (iki oturum toplam 5.000 TL). Geç başvuru gününde ücret %50 artırımlı alınır ve aynı gün ödenmesi gerekir. Ücreti yatırmayanın başvurusu iptal edilir; geç başvuru gününde ücreti aynı gün yatırmayanın bilgileri silinir. Başvurunun tamamlandığını AİS’ten teyit et ve dökümünü sakla.',
      'Yabancı dil belgesi sınav başvurusu için şart değildir; dil yeterliliği tercih ve yerleştirme aşamasında aranır. Kılavuz başka bir şart arar: sınav tarihi itibarıyla diplomanın tescil edilmiş olması. Dil sonucunun 5 yıllık süresine ise TUS başvurusunun ilk gününe göre bakılır. 2027-TUS 1. dönem için bu tarih 2 Şubat 2027, 2. dönem için ise 5 Temmuz 2027’dir. Dil belgenin tarihini başvuru açılmadan önce kontrol etmek tercih haftasında sürpriz yaşamanı önler. Başvuru tamamlandıktan sonra iki oturumun ayrı Sınava Giriş Belgeleri sınavdan yaklaşık 10 gün önce yine AİS’te yayımlanır.',
    ],
    table: {
      caption: 'ÖSYM 2027 Sınav Takvimi ve 2026-TUS 2. dönem kılavuzu referansıyla TUS başvuru özeti',
      headers: ['Başlık', '2027-TUS 1. Dönem', '2027-TUS 2. Dönem'],
      rows: [
        ['Normal başvuru', '2–10 Şubat 2027', '5–13 Temmuz 2027'],
        ['Geç başvuru (tek gün)', '17 Şubat 2027 (+%50 ücret)', '22 Temmuz 2027 (+%50 ücret)'],
        ['Sınav günü', '27 Mart 2027', '22 Ağustos 2027'],
        ['Planlanan sonuç', '22 Nisan 2027', '16 Eylül 2027'],
        ['Referans ücret (2026/2)', 'Test başı 2.500 TL (iki test 5.000 TL)', 'Güncel tutar dönem kılavuzunda ilan edilir'],
      ],
    },
    actionSteps: [
      'Başvuru başlamadan 1 hafta önce ais.osym.gov.tr profilindeki fotoğraf geçerliliğini, iletişim bilgilerini ve mezuniyet kaydını kontrol et.',
      'Normal başvuru penceresinin son gününü bekleme; sistem yoğunluğu ve ödeme aksaklığına karşı ilk 3 gün içinde başvurunu tamamla.',
      'Hem Temel hem Klinik oturumu seçtiğinden emin ol. Sınav ücretini ÖSYM’nin belirttiği ödeme kanalından yatır.',
      'Ödemeden sonra başvurunun tamamlandığını AİS’ten teyit et ve başvuru dökümünü yazdırıp sakla.',
      'Geç başvuruya kalırsan ödemenin %50 artırımlı olduğunu ve tek gün içinde tamamlanması gerektiğini göz önünde bulundur.',
    ],
    faq: [
      {
        q: '2027 TUS başvuruları ne zaman başlıyor?',
        a: 'ÖSYM 2027 sınav takvimine göre 2027-TUS 1. dönem başvurusu 2–10 Şubat 2027, 2. dönem başvurusu 5–13 Temmuz 2027 tarihlerindedir.',
      },
      {
        q: 'TUS geç başvurusu kaç gün sürer ve ücreti ne kadardır?',
        a: 'Geç başvuru tek gündür (2027 1. dönem 17 Şubat, 2. dönem 22 Temmuz) ve sınav ücreti normal tutarın %50 fazlası olarak alınır.',
      },
      {
        q: 'TUS başvurusu için yabancı dil puanı şart mı?',
        a: 'Hayır, yabancı dil puanı olmadan başvuru yapıp sınava girebilirsin; dil şartı yerleştirme ve ek yerleştirme aşamasında aranır.',
      },
      {
        q: 'TUS sınav ücreti ne kadar?',
        a: '2026-TUS 2. dönem kılavuzunda ücret test başına 2.500 TL (iki oturum 5.000 TL) olarak belirlendi; her dönemin kesin ücreti ilgili kılavuzda yayımlanır.',
      },
    ],
    boundaryNote:
      'Takvim tarihleri ÖSYM 2027 Yılı Sınav Takvimine (28 Ekim 2026), başvuru prosedürü ve ücret referansı 2026-TUS 2. dönem kılavuzuna dayanır. Her dönem kesin başvuru ücreti ve ödeme kanalları ilgili dönemin ÖSYM kılavuzunda duyurulur.',
    sources: [
      {
        label: 'ÖSYM 2027 Yılı Sınav Takvimi (28 Ekim 2026)',
        url: 'https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf',
        publisher: 'ÖSYM',
      },
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026)',
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
      { label: '2027 TUS tarihleri ve kalan güne göre plan', href: '/rehber/2027-tus-tarihleri-ve-calisma-plani/' },
      { label: 'TUS sınav günü ne götürülür?', href: '/rehber/tus-sinav-gunu-ne-goturulur/' },
      { label: 'TUS yabancı dil şartı', href: '/rehber/tus-yabanci-dil-sarti/' },
      { label: 'TUS tercihi nasıl yapılır?', href: '/rehber/tus-tercihi-nasil-yapilir/' },
    ],
    keywords: 'tus başvurusu nasıl yapılır ais ösym 2027 tus başvuru tarihi geç başvuru ücreti',
  },
  {
    slug: 'tus-deneme-analizi-ve-hata-defteri',
    order: 20,
    published: '2026-11-26',
    updated: '2026-11-26',
    category: 'Çalışma Planı',
    tone: 'Yumuşak',
    questionH1: 'TUS deneme yanlışları nasıl kalıcı hâle getirilir?',
    seoTitle: 'TUS deneme analizi: yanlışları karta çevirme | TusAnkiM',
    seoDescription:
      'Deneme yanlışları pasif deftere yazmak yerine 3 hata tipine (bilgi eksiği, iki şık, dikkat) ayrılıp tek cümlelik tekrar kartına çevrildiğinde kalıcı olur.',
    directAnswer:
      'Deneme yanlışlarını kalın bir deftere uzun paragraflarla kopyalamak yerine bilgi eksiği, iki şıkta kalma ve dikkat hatası olarak üçe ayırmalısın. Yalnızca ilk iki gruptaki ayırt edici bilgiyi tek soruluk aktif tekrar kartına çevirdiğinde aynı yanlışı sonraki denemelerde tekrarlamazsın.',
    whyMisconceived: [
      'Adaylar çoğu zaman deneme biter bitmez yalnızca toplam netine bakar ve kitapçığı rafa kaldırır. Ya da tam tersi, yanlış yaptığı her sorunun tüm açıklamasını renkli kalemlerle bir deftere geçirir ama sınav gününe kadar o defteri bir daha açmaz. İki uç da bir sonraki denemede aynı hataları üretir.',
      'Pasif tutulan bir hata defterini haftalar sonra baştan sona okumak tanıdıklık hissi verir; ancak sınavda aynı çeldirici karşına çıktığında zihin yine aynı yanlış şıkka gider.',
      'Bir diğer yaygın yanılgı da her yanlışa aynı tepkiyi vermektir. Bilgi eksiğinden yapılan yanlışla soru kökündeki “değildir” ifadesini kaçırmaktan doğan dikkat hatası aynı yöntemle düzelmez.',
    ],
    truthParagraphs: [
      'Kendini sınayarak hatırlamak, aynı süreyi notu yeniden okumaya harcamaktan daha kalıcıdır ([Roediger ve Karpicke, 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x)). [Anki kılavuzu](https://docs.ankiweb.net/background.html) da aktif hatırlamayı bu yüzden temel alır. TUS’ta her oturumda 4 yanlış 1 doğruyu götürdüğü için aynı çeldiriciye ikinci kez düşmek hem bir doğruyu hem 0,25 neti kaybettirir. Bu yüzden deneme analizi denemeyi çözmek kadar değerlidir.',
      'Etkili analiz üç hata tipini ayırmakla başlar. Birinci tip **bilgi eksiğidir**: sorudaki mekanizmayı, ilk tetkiki ya da etkeni hiç bilmiyorsundur. Bunun çözümü tek bilgi ölçen kısa bir Cloze ya da soru-cevap kartı üretmektir. İkinci tip **iki şıkta kalmadır**: iki benzer kavramı karıştırıyorsundur; buraya uzun özet yerine “A ile B arasındaki tek ayırt edici fark” kartı eklenir.',
      'Üçüncü tip **dikkat ve süre hatasıdır**: bilgiyi aslında biliyorsundur ama soru kökünü hızlı okumuş ya da son dakikalarda acele etmişsindir. Bu sorular için bilgi kartı yazmak desteyi gereksiz şişirir; bunun yerine deneme günlüğüne yalnız tek satırlık uyarı (örneğin “olumsuz kökü altını çizerek oku”) düşmek yeterlidir. İki şık arasında atarak doğru tutturduğun soruları da ikinci gruba eklemek gizli açıkları kapatır.',
      'Deneme analizini aynı gün ya da en geç ertesi gün bitirmek gerekir; çünkü hangi şıkta neden tereddüt ettiğini yalnız o zaman net hatırlarsın. Hata kartlarını ayrı bir etiketle işaretleyip [FSRS-6 zamanlamasıyla](/rehber/tus-icin-fsrs-6-nedir/) takip ettiğinde algoritma zorlandığın kartı otomatik olarak daha sık karşına getirir. Bir denemeden genelde 15–30 kısa kart çıkar. Birkaç denemede biriken bu küçük hata destesi en sık kaybettiğin netleri korur. Ayrıca sınavdan önceki son 2 haftada yalnızca bu hata etiketinden kurduğun kısa tekrar oturumları zaman kazandırır. Kendi kartlarını [TusAnkiM Web uygulamasında](https://tusankim.vercel.app/uygulama) yazıp `.apkg` olarak dışa aktarabilirsin.',
    ],
    table: {
      caption: 'TUS deneme yanlışlarının 3 hata tipine göre ayrımı ve doğru düzeltme yöntemi',
      headers: ['Hata tipi', 'Belirtisi', 'Ne yapılır?', 'Kart yazılır mı?'],
      rows: [
        ['1. Bilgi eksiği', 'Kavramı veya ilk basamağı hiç bilmeme', 'Tek ayırt edici cümlelik soru-cevap veya Cloze kartı', 'Evet (1 bilgi = 1 kart)'],
        ['2. İki şıkta kalma', 'Benzer iki tanı/ilaç arasında çeldiriciye düşme', 'A vs B tek fark karşılaştırma kartı', 'Evet (karşılaştırma kartı)'],
        ['3. Dikkat ve süre', 'Bilinen soruyu yanlış okuma veya yetiştirememe', 'Tur hızını ve soru kökü okuma alışkanlığını düzelt', 'Hayır (desteyi şişirme)'],
      ],
    },
    actionSteps: [
      'Her tam denemeden sonra en geç 24 saat içinde yanlış ve boş bıraktığın soruları bilgi, iki şık ve dikkat diye üçe ayır.',
      'Uzun defter paragrafları yazma; yalnızca bilgi ve iki şık hataları için kart başına tek ayırt edici bilgi içeren kısa kart oluştur.',
      'Oluşturduğun hata kartlarına ders ve deneme etiketi ver; son 30 günde bu etiketten tek dokunuşla filtrelenmiş tekrar destesi kur.',
      'Son 3 denemede en çok hata verdiğin 2 dersi belirle ve gelecek haftanın ek soru saatini doğrudan o derslere kaydır.',
      'Dikkat hataları artıyorsa denemeyi 135 dakikalık gerçek sınav tur düzeniyle çözmeye geç.',
    ],
    faq: [
      {
        q: 'Bir TUS denemesinden en fazla kaç hata kartı çıkarılmalı?',
        a: 'Sabit bir sınır yoktur ama her yanlışı uzun paragrafa çevirmek yerine yalnız tekrarlanabilecek ayırt edici bilgileri seçmek gerekir; genelde 15–30 kısa kart yeterlidir.',
      },
      {
        q: 'Deneme analizi ne kadar sürmeli?',
        a: '200 soruluk bir denemenin analizi aynı gün ya da ertesi gün 2–3 saatlik odaklı bir blokta tamamlanmalıdır; haftalar sonraya ertelenen analiz verimini kaybeder.',
      },
      {
        q: 'Doğru yaptığım ama emin olmadığım soruları analiz etmeli miyim?',
        a: 'Evet, iki şık arasında atarak doğru tutturduğun sorular gerçekte bilgi açığıdır; bu soruları da iki şık karşılaştırma kartına dönüştür.',
      },
      {
        q: 'Hata defteri mi yoksa aralıklı tekrar kartı mı daha kalıcıdır?',
        a: 'Defter pasif okuma üretir; aktif geri çağırma ve FSRS-6 aralıklı tekrar ise yanlış yaptığın bilgiyi unutmak üzereyken yeniden sınadığı için daha kalıcıdır.',
      },
    ],
    boundaryNote:
      'Bu yöntem genel çalışma verimliliği ve aralıklı tekrar ilkelerine dayanır; belirli bir net artışı garanti etmez. Deneme sıklığını ve analiz süreni sınava kalan gününe ve nöbet düzenine göre uyarlamalısın.',
    sources: [
      {
        label: 'Roediger ve Karpicke (2006), Test-enhanced learning',
        url: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
        publisher: 'Psychological Science',
      },
      {
        label: 'Anki Manual — Background (aktif hatırlama ve aralıklı tekrar)',
        url: 'https://docs.ankiweb.net/background.html',
        publisher: 'Anki Manual',
      },
      {
        label: '2026-TUS 2. Dönem Başvuru Kılavuzu md. 4.2 (4 Yanlış 1 Doğru Kuralı)',
        url: 'https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf',
        publisher: 'ÖSYM',
      },
    ],
    relatedLinks: [
      { label: 'TUS’a 2 ay kala ne yapmalı?', href: '/rehber/tusa-2-ay-kala-ne-yapmali/' },
      { label: 'TUS’ta 135 dakika nasıl yönetilir?', href: '/rehber/tus-sinavinda-sure-yonetimi/' },
      { label: 'FSRS-6 nedir?', href: '/rehber/tus-icin-fsrs-6-nedir/' },
      { label: 'Filtrelenmiş Deste Kılavuzu', href: '/yardim/filtrelenmis-deste/' },
    ],
    keywords: 'tus deneme analizi hata defteri yanlış soruları karta çevirme iki şıkta kalma dikkat hatası',
  },
];
