# Agentic AI kullanıcı senaryoları

**Tarih:** 22 Ekim 2026
**Amaç:** Bir AI ajanına (tarayıcıyı ya da iPhone simülatörünü süren test ajanı) gerçek bir
kullanıcının en sık soracağı ve isteyeceği şeyleri vermek. Ajan her maddede ya soruyu cevaplar ya
da isteği TusAnkiM'de yerine getirir. Sonuç, Anki'nin resmi belgelerde anlatılan davranışıyla ve
TusAnkiM'in bilinen farklarıyla karşılaştırılır.

**Kaynaklar**

- Anki kılavuzu: <https://docs.ankiweb.net/manual/intro>. Site Mintlify'a taşındı; eski
  `…/intro.html` adresleri buraya yönleniyor. Kaynak deposu `ankitects/anki-manual`, commit
  `91f7485` (6 Ekim 2026).
- Anki FAQ: <https://docs.ankiweb.net/faqs/> (eski `faqs.ankiweb.net`).
- AnkiMobile kılavuzu: yalnızca masaüstü kılavuzunun sessiz kaldığı iPhone etkileşimleri için.
- TusAnkiM yolları ve etiketleri kaynak koddan çıkarıldı (commit `04f55a0`). Uygulamada henüz
  koşturulmadı; bu dosyanın ilk koşusu aynı zamanda etiketlerin doğrulamasıdır.
- FSRS'e özgü maddeler (bölüm 18) `docs/AUDIT_FSRS_ANKI_PARITY.md` beşinci geçişine dayanıyor.

Bağlantılar 22 Ekim 2026'da canlı sitede tek tek açıldı. Bütün sayfalar ve başlık bağlantıları
çalışıyordu.

## Nasıl kullanılır

Her madde aynı alanları taşır:

- **Kullanıcı:** ajana aynen verilecek Türkçe cümle.
- **Anki:** kılavuza göre Anki'nin davranışı ve kaynak bağlantısı.
- **TusAnkiM:** uygulamadaki yol. Etiketler ekranda görünen metin ya da erişilebilirlik etiketidir
  (web'de `aria-label`).
- **Geçer:** testin geçmesi için gözlenmesi gereken sonuç.
- **Bilinen fark:** belgelenmiş bir ürün farkı ya da eksik özellik. Uygulama burada anlatıldığı
  gibi davranıyorsa sonuç "Bilinen fark" yazılır, "Kaldı" değil. Ajanın cevabı farkı açıkça
  söylemeli; Anki'de olup TusAnkiM'de olmayan bir özelliği varmış gibi anlatmamalı.

**Tür:** *Soru* maddesinde ajan cevap verir; cevap hem Anki için doğru olmalı hem de TusAnkiM'de
nereye dokunulacağını söylemeli. *İstek* maddesinde ajan işlemi uygulamada yapar.

**Öncelik:** P1 çok yaygın, günlük kullanım. P2 yaygın. P3 ara sıra ya da ileri düzey. İlk koşuda
P1'lerle başlayın.

**⚠️ Onay:** bu işaretli maddeler veri siler ya da geri dönüşü zor bir değişiklik yapar. Ajan
işlemi yapmadan önce kullanıcıdan açık onay istemeli. Onay sormadan uygularsa madde "Kaldı" sayılır.

**Sonuç kodları:** Geçti · Kaldı · Bilinen fark · Engellendi (kurulum ya da ortam yüzünden
denenemedi).

## Test ortamı

### Uygulamayı açmak

- Web: depo kökünde bir kez `npm ci`, sonra `npm run web` (Metro, varsayılan port 8081). Ya da
  `.claude/launch.json`'daki `web` yapılandırması (port 8090). Bu yapılandırma ana checkout'u
  çalıştırır, bir worktree'yi değil.
- iPhone: `docs/IOS_RELEASE_CHECKLIST.md`'deki yol. Bu dosyadaki web yolları iPhone'da aynı
  ekranlara karşılık gelir.
- Herkese açık önizleme (<https://tusankim.vercel.app>) `master`'ı gösterir. Bir dalı test
  etmek için kullanmayın.

### Ajanın uygulamayı sürmesi

- Öğeleri `aria-label` ya da görünen metinle bulun. Uygulamada `testID` yok.
- Web'de `el.click()` React Native Web'in `onPress`'ini tetikler. Editör alanları aynı kökenli
  iframe'lerdir; içlerindeki `#editor`'a `innerHTML` yazıp `input` olayı gönderin.
- Öğenin görünmesini değil, beklenen değerin gelmesini bekleyin. Kart iframe'i ve deste sayaçları
  biraz geç güncellenir.
- JS tıklamaları açık bir pencerenin arkasındaki öğeye de geçer. Tıklamadan önce
  `document.elementFromPoint` ile önde ne olduğunu kontrol edin.
- Her akışın sonunda açık kalan `role=dialog` ya da `role=alert` öğesi ve konsol hatası olup
  olmadığına bakın, sonra tek bir ekran görüntüsü alın.
- Sabit dokunma bölgeleri varsayılan olarak açık: cevap yüzünde kartın sol üçte biri "Tekrar",
  sağ üçte biri "İyi" demektir. Kartı okumak için kartın üstüne tıklamayın.
- "Tekrar" kelimesi hem Again düğmesi hem de tekrar kartı sayısı anlamında kullanılıyor.
- Ayarlar ekranındaki değişiklikler "Kaydet" (aria "Ayarları kaydet") basılana kadar taslaktır.
- Tek sekme kullanın. İkinci sekme salt okunur açılır.

### Kurulumlar

- **S0 — temiz kullanıcı.** Site verisi temizlenmiş bir profil. Aynı sunucuyu `localhost` yerine
  `127.0.0.1` ile açmak da temiz kullanıcı verir. Koleksiyonda yalnızca boş "Varsayılan" destesi
  ve hazır not türleri olur. "TUS Kartları" katalog satırı kilitli görünür.
- **S1 — örnek paket.** S0'a ek olarak `test/fixtures/anki-26.05-modern.apkg` içe aktarılır:
  Desteler ••• "Diğer seçenekler" → "İçe aktar" → "Dosya seç". "Çalışma ilerlemesini içe
  aktar" ve "Deste ayarlarını içe aktar" açık kalır, sonra "İçe aktar".
  - Desteler "TUS Örnek" ve "TUS Örnek::Kardiyoloji".
  - 5 not, 7 kart: bir tekrar kartı, iki öğrenme kartı, kardeşi gömülü ve turuncu bayraklı bir
    kart, bir askıdaki kart, bir elle gömülmüş kart.
  - Medya `kalp.png`, `şema.png`, `üfürüm.mp3`; 4 tekrar kaydı.
- **S2 — çalışma destesi.** S1'e ek olarak şu desteler ve notlar.
  - Desteler: "Dahiliye", altında "Kardiyoloji" (Dahiliye satırı ••• → "Alt deste oluştur"), ve
    "Farmakoloji".
  - Notlar editörle ya da web adresiyle eklenir. Adres editörü doldurur, kaydetmek için ✓ "Notu
    kaydet" gerekir. Örnek:
    `/x-callback-url?action=addnote&type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX%20inhibisyonu&tags=farmako`

    | Deste | Not türü | Alanlar | Etiketler |
    | --- | --- | --- | --- |
    | Farmakoloji | Basic | Aspirin / COX inhibisyonu | farmako |
    | Farmakoloji | Basic | Digoksin / Na/K-ATPaz inhibisyonu | farmako kardiyo |
    | Farmakoloji | Basic | Metformin / AMPK aktivasyonu | farmako |
    | Dahiliye::Kardiyoloji | Basic | Perikardit EKG / Yaygın ST yükselmesi | kardiyo |
    | Dahiliye::Kardiyoloji | Basic | Aort darlığı / Sistolik ejeksiyon üfürümü | kardiyo |
    | Dahiliye | Basic (and reversed card) | böbrek / kidney | — |
    | Dahiliye | Cloze | `{{c1::Na/K-ATPaz}} pompasını {{c2::digoksin}} inhibe eder.` | kardiyo |

- **FSRS açık.** Bir destenin "Deste seçenekleri" → "FSRS" → "FSRS zamanlayıcısını kullan" →
  "Kaydet". Anahtar bütün koleksiyon için geçerlidir. Varsayılan parametreler, hedef 0.90 ve
  öğrenme adımları `1m 10m` kalır.

## Bilinen farklar (özet)

Aşağıdakiler bilinçli ürün kararı ya da henüz olmayan özelliktir. İlgili maddede ayrıca yazıyor.

| Konu | TusAnkiM'de | Madde |
| --- | --- | --- |
| Günlük yeni kart sınırı | Yok (21 Ekim 2026 ürün kararı); "Yeni kartlar için günlük sınır yoktur." | OPT-02, OPT-04, OPT-05, FILTER-02, WHY-02, WHY-10 |
| Desteye dokunmak | Genel bakışı atlayıp doğrudan çalışmayı açar | STUDY-01 |
| Ad içinde `::` | "Deste oluştur" ve "Yeniden adlandır" `::`'yi " - " yapar, alt deste kurmaz | START-05, DECK-02 |
| Düz arama | Sözcük başına göre eşler (`dog` → "doggy"), Anki ise her yerde (`dog` → "underdog"); Türkçe harflerde de büyük/küçük harfe duyarsız | BROWSE-09, BROWSE-10 |
| Tarayıcı | Bul ve değiştir, kopya bulma, sütunlar, işaret düğmesi, `is:marked`, etiket yeniden adlandırma yok | BROWSE-17, 18, 21, 22, STUDY-11 |
| Not türleri | Silme, klonlama ve ikinci kart türü yok; şablon düzenleyici yalnızca ilk şablonu açar | NOTETYPE-01, 04 |
| Medya | MathJax ve LaTeX işlenmez; Medyayı kontrol et yok | MEDIA-02, MEDIA-03, MAINT-03 |
| İstatistik | True Retention ve FSRS grafikleri yok; ısı haritası yerine ayrı "Çalışma Takvimi" | STATS-04, 06, 07 |
| FSRS araçları | Değerlendir, sağlık kontrolü ve simülatör yok | OPT-19, OPT-21 |
| Yedek | Otomatik yedek haftada bir (Anki 30 dakikada bir); silinen not günlüğü yok | BACKUP-01, BACKUP-04 |
| Eşitleme, profiller, eklentiler | Yok | MISSING-01…04 |
| Image Occlusion | Renkler kısa bir paletten seçilir; Anki'nin hizalama araçları yok | MISSING-05 |
| Okuyucu | Sülük bildirimi yok; aralık etiketleri İngilizce arayüzde de Türkçe | WHY-05, PREFS-01 |
| Katalog desteleri | "TUS Kartları" korumalı: yeniden adlandırılamaz, silinemez, dışa aktarılamaz | START-08, DECK-03, DECK-04 |

---

## 1. Başlangıç temelleri (START)

#### START-01 · Soru · P1
- **Kullanıcı:** "Not ile kart arasındaki fark ne?"
- **Anki:** Kart bir soru-cevap çiftidir. Not ise bilginin alanlara bölünmüş hâlidir. Anki kartları
  nottan üretir, not düzenlenince kartları günceller.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#notes-&-fields)
- **TusAnkiM:** Aynı model. Editörde not türü "Tür:", alanlar ise "Ön" ve "Arka" olarak görünür.
  Kaydedince "Not kaydedildi; N kart oluşturuldu." yazar.
- **Geçer:** Cevap notun alanlardan oluştuğunu ve bir nottan bir ya da daha çok kart çıktığını
  anlatır. Örnek olarak "Temel" 1 kart, "Temel (ve ters kart)" 2 kart verir.

#### START-02 · Soru · P1
- **Kullanıcı:** "Bir nottan nasıl iki kart çıkıyor? Kart türü ne demek?"
- **Anki:** Kart türü, alanların ön ve arka yüzde nasıl gösterileceğini belirleyen şablondur. Her
  kart türü için bir kart oluşur. Notu bir kez düzeltmek bütün kartları günceller.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#card-types)
- **TusAnkiM:** "Temel (ve ters kart)" ile eklenen not "2 kart oluşturuldu" der. Şablonlar
  editördeki "Kartlar:" satırından (aria "Kart şablonlarını düzenle") açılır.
- **Geçer:** Ajan böyle bir not ekler. Kartlarım'da aynı notun iki kartı görünür.
- **Bilinen fark:** Not türü düzenleyicisi yalnızca ilk şablonu açar; yeni kart türü eklenemez.

#### START-03 · Soru · P1
- **Kullanıcı:** "Hangi hazır not tipleri var, hangisini seçeyim?"
- **Anki:** Basic, Basic (and reversed card), Basic (optional reversed card), Basic (type in the
  answer), Cloze ve Image Occlusion.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#note-types)
- **TusAnkiM:** Editörde "Tür:" → "Not türü" listesi: "Temel", "Temel (ve ters kart)", "Temel
  (seçimli ters kart)", "Temel (yanıtı yazarak)", "Boşluklu", "Görüntü Örtme".
- **Geçer:** Cevap bu altı türü doğru adlarıyla sayar ve ne işe yaradıklarını söyler.
- **Bilinen fark:** Yok.

#### START-04 · Soru · P1
- **Kullanıcı:** "Yeni, öğrenme, tekrar kart ne demek? 'Olgun kart' ne?"
- **Anki:** New hiç çalışılmamış, Learning öğreniliyor, Review öğrenmesi bitmiş, Relearn unutulup
  yeniden öğreniliyor. Aralığı 21 günden kısa tekrar kartı genç, 21 gün ve üstü olgundur.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#card-states)
- **TusAnkiM:** Deste listesinde "Yeni", "Öğrenme", "Tekrar" sayıları. Kart bilgisinde "Kart
  durumu". İstatistiklerde "Kart sayıları".
- **Geçer:** Tanımlar ve 21 günlük olgunluk eşiği doğru; uygulamadaki etiketler gösterilir.

#### START-05 · Soru · P1
- **Kullanıcı:** "Deste ve alt deste nasıl çalışıyor?"
- **Anki:** Alt deste adı `::` ile bölerek ya da sürükle-bırakla kurulur. Üst deste çalışılınca alt
  destelerin kartları da gelir. [Kılavuz](https://docs.ankiweb.net/manual/getting-started#decks)
- **TusAnkiM:** Satır ••• (aria "<ad> deste seçenekleri") → "Alt deste oluştur", ya da "⠿"
  tutamacını başka bir satırın ortasına bırakmak. Satırda "N alt deste" yazar.
- **Geçer:** Ajan "Dahiliye" altında "Kardiyoloji"yi kurar. Liste ok simgesiyle (aria "Alt
  desteleri gizle") hiyerarşiyi gösterir. "Dahiliye" çalışılınca Kardiyoloji kartları da gelir.
- **Bilinen fark:** "Deste oluştur"da yazılan `Dahiliye::Kardiyoloji` alt deste kurmaz, adı
  "Dahiliye - Kardiyoloji" olur.

#### START-06 · Soru · P3
- **Kullanıcı:** "'Varsayılan' diye bir deste var, ne işe yarıyor?"
- **Anki:** Anki "Default" desteyle başlar. Kopmuş kartlar oraya düşer. Boşsa ve başka deste
  varsa gizlenir. [Kılavuz](https://docs.ankiweb.net/manual/getting-started#decks)
- **TusAnkiM:** "Varsayılan" destesi her zaman listede.
- **Geçer:** Cevap amacını doğru anlatır.
- **Bilinen fark:** Boşken de görünür.

#### START-07 · Soru · P2
- **Kullanıcı:** "Her konu için ayrı küçük deste mi açayım, etiket mi kullanayım?"
- **Anki:** Desteler geniş kategoriler içindir. Çok sayıda küçük deste yerine etiket önerilir.
  Tek bir kartı işaretlemek için bayrak kullanılır.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#using-decks-appropriately) ·
  [Etiketler](https://docs.ankiweb.net/manual/editing#using-tags)
- **TusAnkiM:** Etiket editördeki "Etiketler:" satırından ya da okuyucu ⋮ → "Etiketleri
  düzenle"den verilir. Bayrak "Bayrakla işaretle" ile konur.
- **Geçer:** Öneri kılavuzla aynı ve uygulamadaki yollar doğru.

#### START-08 · İstek · P2
- **Kullanıcı:** "Hazır bir TUS destesi indirip kullanmak istiyorum."
- **Anki:** Get Shared ile paylaşılan deste indirilir, sonra içe aktarılır.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#shared-decks)
- **TusAnkiM:** AnkiWeb paylaşılan desteleri yok. Deste listesindeki "TUS Kartları" satırı →
  "Ücretsiz aç" → `/catalog` → "Kartları ücretsiz aç". Elde bir `.apkg` varsa "İçe aktar".
- **Geçer:** Ajan katalog yolunu ya da içe aktarmayı önerir, AnkiWeb'de gezinmeyi iddia etmez.
- **Bilinen fark:** Katalog yaklaşık 9 575 kart ve 106 alt deste kurar, ağırdır. Bu destelerde
  yeniden adlandırma, silme ve dışa aktarma kapalıdır.

---

## 2. Çalışma ekranı (STUDY)

#### STUDY-01 · İstek · P1 · S2
- **Kullanıcı:** "Kardiyoloji destesini çalışmaya başla."
- **Anki:** Desteye tıklamak genel bakışı açar, Study Now oturumu başlatır. Alt desteler de
  dahildir. [Kılavuz](https://docs.ankiweb.net/manual/studying#study-overview)
- **TusAnkiM:** Desteler'de deste adına dokunmak (aria "<ad> destesini çalış") çalışmayı
  doğrudan açar. Genel bakış satır ••• → "Genel bakış" → "Şimdi çalış · N kart".
- **Geçer:** Okuyucu "Cevabı göster" ile açılır, başlık Kardiyoloji'dir, altta "N + N + N" sayacı
  görünür.
- **Bilinen fark:** Genel bakış ekranı atlanır.

#### STUDY-02 · İstek · P1 · S2
- **Kullanıcı:** "Cevabı göster."
- **Anki:** Show Answer (Space ya da Enter) cevabı açar, soru varsayılan olarak üstte kalır.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#questions)
- **TusAnkiM:** "Cevabı göster" düğmesi, Space ya da Enter.
- **Geçer:** "Tekrar", "Zor", "İyi", "Kolay" düğmeleri aralıklarıyla birlikte görünür. Düğmelerin
  aria'sı "<etiket>, sonraki gösterim <süre>" biçimindedir.

#### STUDY-03 · Soru · P1
- **Kullanıcı:** "Tekrar, Zor, İyi, Kolay butonlarını ne zaman kullanmalıyım?"
- **Anki:** Again yanlış ya da hatırlanamadı. Hard doğru ama zorlanarak. Good biraz çabayla doğru,
  en çok kullanılan düğme. Easy hiç zorlanmadan. Yalnızca Again ve Good da kullanılabilir.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#answer-buttons) ·
  [FSRS FAQ](https://docs.ankiweb.net/faqs/frequently-asked-questions-about-fsrs)
- **TusAnkiM:** Aynı dört düğme, klavyede 1–4.
- **Geçer:** Kılavuzla aynı öneri. "Tekrar" düğmesinin Again olduğu açıkça söylenir.

#### STUDY-04 · Soru · P1 · S2
- **Kullanıcı:** "Yeni bir kartta Tekrar ya da İyi'ye basınca ne oluyor?"
- **Anki:** Öğrenme adımları (`1m 10m`): Again ilk adıma (1 dk), Good sonraki adıma (10 dk). Son
  adımda Good kartı mezun eder, mezuniyet aralığı 1 gündür. Hard ilk adımda ilk iki adımın
  ortalamasını verir. Easy kartı hemen mezun eder, kolay aralığı 4 gündür.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#learning-steps)
- **TusAnkiM:** Varsayılan ön ayar aynı: adımlar `1m 10m`, mezuniyet 1 gün, kolay 4 gün.
- **Geçer:** Yeni kartta düğmeler "1dk", "6dk", "10dk" ve 3–5 gün gösterir. Zor 5,5 dakikadır,
  yuvarlanmış gösterilir. Kolay'ın 4 günlük aralığına fuzz eklenir. Cevap bunu doğru açıklar.

#### STUDY-05 · Soru · P2
- **Kullanıcı:** "Tekrar kartında butonlar aralığı nasıl değiştiriyor?"
- **Anki:** SM-2'de Again yeniden öğrenmeye alır ve ease'i 20 puan düşürür. Hard aralığı 1.2 ile
  çarpar, ease'i 15 düşürür. Good aralığı ease ile çarpar. Easy ayrıca kolay bonusuyla çarpar ve
  ease'i 15 artırır. FSRS'te ise stabilite ve zorluk değişir.
  [FAQ](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm#review-cards)
- **TusAnkiM:** Deste seçenekleri → "Gelişmiş": "Başlangıç kolaylığı", "Kolay bonusu", "Zor aralık
  çarpanı", "Aralık düzenleyici", "Yeni aralık (%)". FSRS açıkken bunlar gizlidir.
- **Geçer:** Kurallar doğru, ayarların uygulamadaki adları doğru.

#### STUDY-06 · Soru · P2
- **Kullanıcı:** "Butonların üstündeki '10dk', '4 gün' yazıları ne?"
- **Anki:** Her düğme, basılırsa kartın ne zaman yeniden geleceğini gösterir. Tercihlerden
  gizlenebilir. [Kılavuz](https://docs.ankiweb.net/manual/studying#answer-buttons)
- **TusAnkiM:** Ayarlar → "Yeni çalışma ekranı" → "Yanıt düğmeleri" → "Sonraki inceleme süresini
  göster".
- **Geçer:** Cevap doğru. Ajan ayarı kapatınca süreler kaybolur, açınca geri gelir.
- **Bilinen fark:** Süre metinleri İngilizce arayüzde de Türkçedir ("1dk", "1 gün").

#### STUDY-07 · İstek · P1 · S2
- **Kullanıcı:** "Son cevabımı geri al, yanlış butona bastım."
- **Anki:** Undo son işlemi geri alır; işlemler sırayla geri alınabilir.
  [FAQ](https://docs.ankiweb.net/faqs/the-2021-scheduler#undo)
- **TusAnkiM:** Üst çubukta geri al simgesi (aria "Geri al: Kartı yanıtla"), klavyede z, u ya da
  Ctrl/Cmd+Z, ⋮ → "Geri al: …".
- **Geçer:** Önceki kart soru yüzüyle geri gelir, sayaçlar önceki değerine döner. Kart bilgisinde
  o cevabın kaydı kalmaz.

#### STUDY-08 · İstek · P1 · S2
- **Kullanıcı:** "Bu kartı yarına kadar gizle."
- **Anki:** Bury Card kartı ertesi güne kadar gizler, Bury Note notun bütün kartlarını. Erken geri
  getirmek için genel bakışta Unbury.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#editing-and-more)
- **TusAnkiM:** ⋮ (aria "Kart ve not seçenekleri") → "Kartı göm". Kardeş kart varsa "Göm ›" →
  "Kartı göm" ya da "Notu göm". Klavyede `-`.
- **Geçer:** Kart kuyruktan çıkar, sayaç azalır. Kart bilgisinde Sıra "Kullanıcı tarafından
  gömüldü" yazar. Genel bakıştaki "💤 N gömülü kartı şimdi aç" kartı geri getirir.

#### STUDY-09 · İstek · P1 · S2
- **Kullanıcı:** "Bu kartı bir süre hiç gösterme ama silme."
- **Anki:** Suspend Card, elle askıdan çıkarılana kadar kartı gizler. `is:suspended` ile bulunur.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#editing-and-more)
- **TusAnkiM:** ⋮ → "Kartı askıya al" (kardeşi varsa "Askıya al ›"), klavyede `@`.
- **Geçer:** Kart kuyruktan çıkar. Kartlarım'da `is:suspended` kartı bulur. Satırdaki "▶️ Askıdan
  Çıkar" kartı geri getirir.

#### STUDY-10 · İstek · P1 · S2
- **Kullanıcı:** "Bu karta kırmızı bayrak koy."
- **Anki:** Bayrak yalnızca o karta konur, kartta tek bayrak olur. Aramada `flag:1` kırmızıdır.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#using-flags)
- **TusAnkiM:** "Bayrakla işaretle" → "Kırmızı bayrak", klavyede Ctrl/Cmd+1.
- **Geçer:** Kartta "Kırmızı bayrak" göstergesi görünür. `flag:1` kartı bulur, kardeş kartı
  bulmaz.

#### STUDY-11 · İstek · P2 · S2
- **Kullanıcı:** "Bu notu işaretle."
- **Anki:** Mark Note nota "marked" etiketini ekler.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#the-%E2%80%9Cmarked%E2%80%9D-tag)
- **TusAnkiM:** ⋮ → "Notu işaretle", klavyede `*`.
- **Geçer:** Kartta "Not işaretli" göstergesi görünür. Not "marked" etiketini alır. Kartlarım'da
  `tag:marked` ya da ⋮ → "İşaretlileri filtrele" notu bulur.
- **Bilinen fark:** `is:marked` araması yok.

#### STUDY-12 · İstek · P1 · S2
- **Kullanıcı:** "Bu kartta yazım hatası var, düzeltelim."
- **Anki:** Edit notu düzenleyicide açar. Düzeltme notun bütün kartlarına yansır.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#editing-and-more)
- **TusAnkiM:** ⋮ → "Notu düzenle" → "Kartı düzenle" ekranı → ✓ (aria "Değişiklikleri kaydet").
- **Geçer:** "Kart güncellendi." görünür, okuyucuya dönülür. Kart düzeltilmiş metni gösterir.
  "böbrek / kidney" notunda iki kart da düzelir.

#### STUDY-13 · İstek · P2 · S1
- **Kullanıcı:** "Bu kartın geçmişini göster: ne zaman eklendi, kaç kez çalıştım?"
- **Anki:** Card Info sıra, aralık, ease ve tekrar geçmişini gösterir. Sıfırlama ve Set Due Date
  satırları "Manual" olarak listelenir.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#card-info)
- **TusAnkiM:** ⋮ → "Kart bilgisi". Bölümler "Genel bilgi", "Zamanlama", "FSRS hafıza durumu",
  "Çalışma geçmişi (N)".
- **Geçer:** Eklenme tarihi, tekrar ve unutma sayısı, aralık ve geçmiş tablosu doğru.
- **Bilinen fark:** Kart bilgisi yalnızca okuyucudan açılır. "Önceki kart bilgisi" yok.

#### STUDY-14 · İstek · P2 · S1
- **Kullanıcı:** "Sesi bir daha çal."
- **Anki:** Replay Audio sesi yeniden çalar (masaüstünde R).
  [Kılavuz](https://docs.ankiweb.net/manual/studying#editing-and-more)
- **TusAnkiM:** ⋮ → "Sesi yeniden oynat" (seslisi olmayan kartta pasif), klavyede `r`. Örnek
  paketteki `üfürüm.mp3`'lü kartta deneyin.
- **Geçer:** Ses yeniden başlar, hata çıkmaz.

#### STUDY-15 · Soru · P2
- **Kullanıcı:** "Cevabı yazınca doğru mu yanlış mı kontrol ediyor mu?"
- **Anki:** `{{type:Alan}}` bir kutu gösterir. Cevap açılınca doğru ve yanlış kısımlar işaretlenir.
  Puanı yine kullanıcı verir.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/fields#checking-your-answer)
- **TusAnkiM:** "Temel (yanıtı yazarak)" not türü. Kutu "Yanıtınızı yazın…" (aria "Yanıtınız"),
  Enter cevabı açar.
- **Geçer:** Yanlış yazılan cevapta fark gösterilir. Düğmeye kullanıcı basar.

#### STUDY-16 · Soru · P3
- **Kullanıcı:** "Kartın üstüne çizip not alabileceğim bir karalama tahtası var mı?"
- **Anki:** Masaüstü kılavuzu sessiz. AnkiMobile'da adı Scratchpad.
  [AnkiMobile](https://docs.ankiweb.net/ankimobile/study-tools#actions)
- **TusAnkiM:** ⋮ → "Yazı tahtasını etkinleştir". Araçlar "Kalem", "Silgi", "Geri al", "Yazı
  tahtasını temizle", "Çizimi bitir".
- **Geçer:** Cevap yolu doğru gösterir; çizim yapılabilir.

#### STUDY-17 · Soru · P2
- **Kullanıcı:** "'Tebrikler, bugünlük bitti' diyor ama daha çalışmak istiyorum."
- **Anki:** Tekrar limiti kartları tuttuysa limiti artırma önerilir. Öğrenme kartları önceden
  öğrenme sınırının ötesindeyse beklenir. Ek çalışma için Custom Study.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#custom-study)
- **TusAnkiM:** "Tebrikler!" ekranında "🎯 Özel çalışma", gerekirse "Tekrar limitini artır" ve
  "💤 N gömülü kartı şimdi aç". Bekleme ekranında "⚡ Beklemeden çalış".
- **Geçer:** Cevap bu yolları doğru sayar.

#### STUDY-18 · İstek · P3 · S2
- **Kullanıcı:** "Kartlar kendiliğinden ilerlesin."
- **Anki:** Deste seçeneklerinde soru ya da cevap süresi sıfırdan büyük yapılır, sonra çalışmada
  Auto Advance başlatılır. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#auto-advance)
- **TusAnkiM:** İki yer: Deste seçenekleri → "Otomatik ilerleme" ("Soruyu gösterme süresi",
  "Cevabı gösterme süresi", "Cevap süresi dolunca") ve Ayarlar → "Yeni çalışma ekranı" → "Yanıt
  düğmeleri" → "Otomatik ilerleme".
- **Geçer:** Süre dolunca cevap açılır ve seçilen eylem uygulanır.
- **Bilinen fark:** Deste seçeneklerindeki yardım metni çalışma ekranında olmayan bir anahtarı
  tarif ediyor (`components/deck-options/deckOptionsCopy.ts:193`). Muhtemel hata.

#### STUDY-19 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Bu kartı sıfırla, yeni kart gibi baştan öğreneyim."
- **Anki:** Reset kartı yeni kart kuyruğunun sonuna koyar. İsteğe bağlı olarak eski sırasına koyar
  ve sayaçları sıfırlar. Geçmiş silinmez.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#cards)
- **TusAnkiM:** ⋮ → "Yeniden zamanla ›" → "Kartı sıfırla…" → "Mümkünse ilk sırasına geri koy",
  "Tekrar ve unutma sayılarını sıfırla" → "Sıfırla".
- **Geçer:** Kart "Yeni" olur, geçmiş kalır, sayaçlar seçeneğe göre değişir. FSRS açıksa hafıza
  durumu silinir.

#### STUDY-20 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Bu kartı tamamen sil."
- **Anki:** Delete Note notu ve bütün kartlarını siler. Tek bir kart ayrıca silinemez.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#notes)
- **TusAnkiM:** ⋮ → "Notu sil" → "Bu not kalıcı olarak silinecek. Bu işlem geri alınamaz." →
  "Tamam". Katalog kartlarında bu seçenek yok.
- **Geçer:** Ajan önce kardeş kartların da gideceğini söyleyip onay ister. Sonra notun bütün
  kartları Kartlarım'dan kaybolur.
- **Bilinen fark:** Silinen notlar için günlük (`deleted.txt`) yok.

---

## 3. Not ekleme ve düzenleme (ADD)

#### ADD-01 · İstek · P1 · S2
- **Kullanıcı:** "Ön yüzü 'Aspirinin etki mekanizması', arka yüzü 'COX inhibisyonu' olan bir kart
  ekle."
- **Anki:** Basic not türünde Front ve Back doldurulur, deste seçilir, Add notu ekler.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#adding-cards-and-notes)
- **TusAnkiM:** ＋ (aria "Ekle") → "Kart ekle" → "Tür: Temel" → "Ön" ve "Arka" alanları →
  "Deste:" → ✓ (aria "Notu kaydet").
- **Geçer:** "Tamamlandı" penceresi "Not kaydedildi; 1 kart oluşturuldu." der. Kartlarım'da
  "Aspirinin" araması kartı doğru destede bulur.

#### ADD-02 · İstek · P1 · S2
- **Kullanıcı:** "İki yönlü kart yap: 'karaciğer' ↔ 'liver'."
- **Anki:** Basic (and reversed card) iki kart üretir. Optional reversed türünde ters kart yalnızca
  "Add Reverse" alanı doluysa oluşur.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/generation#reverse-cards)
- **TusAnkiM:** "Temel (ve ters kart)" ya da "Temel (seçimli ters kart)" ve "Tersini Ekle" alanı.
- **Geçer:** "2 kart oluşturuldu". Çalışmada biri "karaciğer", öteki "liver" sorar.

#### ADD-03 · İstek · P1 · S2
- **Kullanıcı:** "Bu cümleden boşluk doldurma kartı yap: 'Digoksin Na/K-ATPaz'ı inhibe eder.'"
- **Anki:** Cloze türünde metin seçilip [...] düğmesine basılır, metin `{{c1::…}}` olur. Soruda
  gizli kısım `[...]` görünür. [Kılavuz](https://docs.ankiweb.net/manual/editing#cloze-deletion)
- **TusAnkiM:** "Tür: Boşluklu" → metni seç → "[…]" (aria "Boşluk ekle"). Elle `{{c1::…}}` yazmak
  da olur.
- **Geçer:** Kart soruda "[...]", cevapta tam cümleyi gösterir.

#### ADD-04 · Soru · P2
- **Kullanıcı:** "Aynı cümlede iki boşluk yaptım; ayrı kart mı olur, tek kart mı?"
- **Anki:** `c1` ve `c2` ayrı kart, iki kez `c1` tek kart üretir.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#cloze-deletion)
- **TusAnkiM:** S2'deki Cloze notu `c1` ve `c2` taşır.
- **Geçer:** Cevap doğru. O not için Kartlarım'da iki kart görünür.

#### ADD-05 · İstek · P2 · S2
- **Kullanıcı:** "Boşluğa ipucu ekle, '[...]' yerine 'enzim' yazsın."
- **Anki:** `{{c1::Na/K-ATPaz::enzim}}` soruda `[enzim]` gösterir.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#cloze-deletion)
- **TusAnkiM:** Editörde metni `::enzim` ekleyerek değiştir, kaydet.
- **Geçer:** Soru yüzünde "[enzim]" görünür.

#### ADD-06 · İstek · P1 · S2
- **Kullanıcı:** "Bu nota 'kardiyo' ve 'farmako' etiketlerini ekle."
- **Anki:** Etiketler boşlukla ayrılır, not düzeyindedir, `::` ile hiyerarşi kurulabilir.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#using-tags)
- **TusAnkiM:** Editör "Etiketler:" (aria "Etiketleri düzenle") → "Yeni etiket adı…" → "Ekle" →
  "Onayla". Ya da okuyucu ⋮ → "Etiketleri düzenle" → "Kaydet".
- **Geçer:** `tag:kardiyo` ve `tag:farmako` notun bütün kartlarını bulur.

#### ADD-07 · İstek · P2 · S2
- **Kullanıcı:** "Bu kelimeyi kalın ve kırmızı yap, H2O'daki 2'yi alt simge yap."
- **Anki:** Düzenleyicide kalın, renk, alt ve üst simge düğmeleri var.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#editing-features)
- **TusAnkiM:** Araç çubuğu "Giriş" sekmesi: "Kalın", "Renk paleti", "Alt simge".
- **Geçer:** Alanın HTML'inde `<b>`, renk ve `<sub>` bulunur. Kartta da öyle görünür.

#### ADD-08 · İstek · P1 · S2
- **Kullanıcı:** "Bu karta EKG görüntüsü ekle."
- **Anki:** Ataş düğmesiyle dosya eklenir ya da görsel yapıştırılır. Dosya medya klasörüne kopyalanır.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#editing-features)
- **TusAnkiM:** Ataş (aria "Ek ekle") → "Galeriden fotoğraf seç" ya da "Dosya ekle" → "Olduğu gibi
  ekle".
- **Geçer:** Görsel alanda ve okuyucuda görünür, yeniden açınca durur.

#### ADD-09 · Soru · P2
- **Kullanıcı:** "Kaynak alanı her yeni kartta silinmesin, aynı kalsın."
- **Anki:** Alanın iğne simgesi alanı yapışkan yapar.
  [FAQ](https://docs.ankiweb.net/faqs/sticky-fields)
- **TusAnkiM:** Alanın yanındaki iğne (aria "<Alan> alanını sabitle").
- **Geçer:** Kaydedip "Yeni not ekle" deyince sabitlenmiş alanın içeriği kalır, diğeri boşalır.

#### ADD-10 · Soru · P2 · S2
- **Kullanıcı:** "Aynı kartı iki kez eklersem uyarır mı?"
- **Anki:** Yalnızca ilk alan ve yalnızca aynı not türü içinde denetlenir.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#duplicate-check)
- **TusAnkiM:** Ön alanı "Aspirin" olan ikinci bir Temel not yazılırken "Yinelenen ilk alan
  bulundu" uyarısı çıkar. Kaydetmek yine mümkündür.
- **Geçer:** Uyarı çıkar. Başka bir not türünde aynı ön alan uyarı vermez.
- **Bilinen fark:** Kopya bulma ("Find Duplicates") yok.

#### ADD-11 · İstek · P1 · S2
- **Kullanıcı:** "Eklerken desteyi 'Farmakoloji' yap."
- **Anki:** Ekleme penceresindeki deste düğmesi desteyi seçer, oradan yeni deste de eklenir.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#changing-deck-/-note-type)
- **TusAnkiM:** "Deste:" (aria "Hedef desteyi seç") → "Hedef deste" listesinde ara ya da "Yeni
  deste oluştur". Varsayılan Ayarlar → "Genel" → "Yeni kartların destesi".
- **Geçer:** Kaydedilen kart Farmakoloji'de çıkar.

---

## 4. Tarayıcı ve arama (BROWSE)

Kartlarım: alt çubuk "Kartlarım" (aria "Kartlarımı aç") → `/browser`. Arama kutusu aria'sı "Kart
ara veya deck:tag:is:…". "?" (aria "Arama sözdizimi yardımı") desteklenen terimleri gösterir.

#### BROWSE-01 · İstek · P2 · S2
- **Kullanıcı:** "Bütün kartlarımı listele; kart değil not olarak görmek istiyorum."
- **Anki:** Tarayıcıda kart ve not modu var.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#table-modes)
- **TusAnkiM:** ⋮ → "Seçenekler" → "Görünüm": "Kartlar" ya da "Notlar".
- **Geçer:** Sayaç "N kart" ile "N not" arasında değişir. Kardeş kartlar not modunda tek satır olur.

#### BROWSE-02 · İstek · P1 · S2
- **Kullanıcı:** "Farmakoloji destesindeki kartları göster."
- **Anki:** `deck:farmakoloji` alt desteleri de bulur. Alt desteleri dışlamak için
  `-deck:farmakoloji::*`.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#tags-decks-cards-and-notes)
- **TusAnkiM:** Arama `deck:farmakoloji` ya da kapsam seçici "Kart destesi:".
- **Geçer:** Tam olarak Farmakoloji kartları listelenir. `deck:dahiliye` Kardiyoloji'yi de içerir.

#### BROWSE-03 · İstek · P1 · S2
- **Kullanıcı:** "'kardiyo' etiketli kartları bul."
- **Anki:** `tag:kardiyo` alt etiketleri de bulur, `tag:none` etiketsizleri bulur.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#tags-decks-cards-and-notes)
- **TusAnkiM:** Arama `tag:kardiyo`, ya da ⋮ → "Etikete göre filtrele".
- **Geçer:** S2'deki dört kardiyo notunun kartları bulunur.

#### BROWSE-04 · İstek · P1 · S1
- **Kullanıcı:** "Bugün vadesi gelen kartları göster."
- **Anki:** `is:due` vadesi gelmiş tekrar ve öğrenme kartlarını bulur.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#card-state)
- **TusAnkiM:** Arama `is:due`.
- **Geçer:** Sonuç deste listesindeki öğrenme ve tekrar sayılarıyla tutarlı.

#### BROWSE-05 · İstek · P1 · S1
- **Kullanıcı:** "Askıya aldığım kartları göster ve hepsini geri aç."
- **Anki:** `is:suspended`, sonra Toggle Suspend.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#cards)
- **TusAnkiM:** Arama `is:suspended` ya da ⋮ → "Askıdakileri filtrele" → ⋮ → "Tümünü seç" → seçim
  çubuğu "Askı" ya da "Diğer" → "Askıya al / askıdan çıkar".
- **Geçer:** Aynı arama boş döner, kartlar çalışma sayılarına geri girer.

#### BROWSE-06 · İstek · P2 · S2
- **Kullanıcı:** "Son 7 günde 'Tekrar' dediğim kartları göster."
- **Anki:** `rated:7:1`. [Kılavuz](https://docs.ankiweb.net/manual/searching#answered)
- **TusAnkiM:** Arama `rated:7:1`.
- **Geçer:** Yalnızca son 7 günde Again verilen kartlar.

#### BROWSE-07 · İstek · P2 · S2
- **Kullanıcı:** "Bugün eklediğim kartları göster."
- **Anki:** `added:1`; not metni değişenler için `edited:1`.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#added)
- **TusAnkiM:** Arama `added:1`.
- **Geçer:** S2'de eklenen kartların hepsi, örnek paketin kartları hariç.

#### BROWSE-08 · İstek · P2 · S1
- **Kullanıcı:** "Aralığı 21 günden uzun olan ve 3'ten fazla unuttuğum kartları bul."
- **Anki:** `prop:ivl>=21 prop:lapses>3`. FSRS açıkken `prop:s`, `prop:d`, `prop:r` de çalışır.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#card-properties)
- **TusAnkiM:** Aynı sözdizimi.
- **Geçer:** Sonuç kart bilgisindeki aralık ve unutma sayılarıyla tutarlı.

#### BROWSE-09 · Soru · P2 · S2
- **Kullanıcı:** "Aramada 'veya', 'değil' ve joker karakter nasıl kullanılır?"
- **Anki:** Boşluk VE demektir. `or`, parantez ve başa `-` kullanılır. `*` ve `_` jokerdir.
  `dog` hem "doggy" hem "underdog" bulur; yalnızca sözcük için `w:dog`.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#simple-searches)
- **TusAnkiM:** Aynı işleçler desteklenir.
- **Geçer:** Cevap doğru. `aspirin or metformin` iki notu, `-tag:kardiyo` kardiyo dışını bulur.
  Ek kontrol: `kardit` aramasının "Perikardit" notunu bulması gerekir.
- **Bilinen fark:** TusAnkiM düz sözcüğü sözcük başına göre eşler, Anki her yerde eşler. Bu yüzden
  `kardit` "Perikardit"i bulamayabilir. Bulamazsa madde "Bilinen fark" olarak kaydedilir.

#### BROWSE-10 · Soru · P2 · S2
- **Kullanıcı:** "Aramada büyük/küçük harf ve ş, ğ, ü gibi harfler fark eder mi?"
- **Anki:** Standart arama yalnızca a–z harflerinde büyük/küçük harfe duyarsızdır. `nc:`
  aksanları yok sayar. [Kılavuz](https://docs.ankiweb.net/manual/searching#simple-searches)
- **TusAnkiM:** Düz arama hem büyük/küçük harfe hem aksana duyarsız çalışır.
- **Geçer:** Cevap iki davranışı ayırır. `ÜFÜRÜM` ve `ufurum` "üfürümü"nü bulur.
- **Bilinen fark:** TusAnkiM Türkçe harflerde de duyarsızdır; Anki bu harflerde duyarlıdır.

#### BROWSE-11 · İstek · P3 · S2
- **Kullanıcı:** "Sadece Ön alanında 'aspirin' geçen notları bul."
- **Anki:** Alan araması tam eşleşmedir: `front:aspirin`; içinde geçen için `front:*aspirin*`.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#limiting-to-a-field)
- **TusAnkiM:** Alanların gerçek adları İngilizcedir ("Front", "Back"); editör onları "Ön" ve
  "Arka" diye gösterir. Arama `front:aspirin`.
- **Geçer:** Yalnızca ön alanı tam "Aspirin" olan not bulunur. Ajan `ön:` yazmanın çalışmayacağını
  bilir.

#### BROWSE-12 · İstek · P1 · S2
- **Kullanıcı:** "Seçtiğim kartları 'Dahiliye' destesine taşı."
- **Anki:** Cards > Change Deck. [FAQ](https://docs.ankiweb.net/faqs/how-do-i-move-cards-between-decks)
- **TusAnkiM:** Uzun basarak seçim → seçim çubuğu "Deste" ya da "Diğer" → "Desteyi değiştir ›" →
  "Seçili Kartların Destesi".
- **Geçer:** Kartlar Dahiliye'de görünür. ⋮ → "Geri al: Deste güncelleme" geri alır.

#### BROWSE-13 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Bu notları 'Basic' not tipine çevir."
- **Anki:** Notes > Change Note Type; zamanlama korunur.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#notes)
- **TusAnkiM:** "Diğer" → "Not türünü değiştir ›". Alanlar adla eşlenir.
- **Geçer:** Notlar yeni türde, kartların aralıkları değişmemiş.
- **Bilinen fark:** Alan eşleme tablosu yok, eşleme yalnızca adla.

#### BROWSE-14 · İstek · P2 · S2
- **Kullanıcı:** "Seçili kartların tarihini 3-5 gün sonraya ayarla."
- **Anki:** Set Due Date `3-5` kartları 3–5 gün sonrasına dağıtır. Tekrar kartının aralığı yalnızca
  `!` ile değişir. [Kılavuz](https://docs.ankiweb.net/manual/browsing#cards)
- **TusAnkiM:** "Diğer" → "Vade tarihini ayarla" → `3-5` → "Uygula". Okuyucuda ⋮ → "Yeniden
  zamanla ›" → "Son tarihi ayarla…".
- **Geçer:** "Sonraki gösterim" 3–5 gün sonrası olur. Tekrar kartlarının aralığı `!` olmadan
  değişmez. FSRS açıkken bölüm 18'deki FSRS-03'e bakın.

#### BROWSE-15 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Bu destedeki ilerlememi sıfırla, kartlar yeni olsun."
- **Anki:** Cards > Reset. FAQ geride kalındığı için sıfırlamayı önermez, günlük tekrar limitini
  önerir. [FAQ](https://docs.ankiweb.net/faqs/resetting-progress-in-a-deck#resetting-cards-within-anki)
- **TusAnkiM:** `deck:farmakoloji` → "Tümünü seç" → "Diğer" → "Kartları sıfırla…" → "Sıfırla".
- **Geçer:** Ajan önce alternatifi söyler ve onay ister. Sonra kartlar "Yeni" olur, geçmiş kalır.
  Ayarlar'daki "İlerlemeyi sıfırla" bütün koleksiyonu sıfırlar ve kataloğu kaldırır; ajan bunu
  kullanmamalı.

#### BROWSE-16 · İstek · P3 · S2
- **Kullanıcı:** "Yeni kartların sırasını değiştir, şu kartlar önce gelsin."
- **Anki:** Reposition yeni kartlara artan sıra numarası verir, isteğe bağlı olarak diğerlerini
  kaydırır. [Kılavuz](https://docs.ankiweb.net/manual/browsing#cards)
- **TusAnkiM:** "Diğer" → "Yeniden konumlandır" → "Başlangıç konumu", "Adım", "Mevcut kartların
  konumunu kaydır" → "Uygula". Yalnızca yeni kartlar.
- **Geçer:** Seçilen kartlar çalışmada önce gelir.
- **Bilinen fark:** Rastgele sıralama seçeneği yok.

#### BROWSE-17 · İstek · P2
- **Kullanıcı:** "Bütün notlarda 'ASA' yazan yerleri 'aspirin' yap."
- **Anki:** Find and Replace. [Kılavuz](https://docs.ankiweb.net/manual/browsing#find-and-replace)
- **TusAnkiM:** Yok.
- **Geçer:** Ajan özelliğin olmadığını söyler, notları tek tek düzenlemeyi ya da metin olarak dışa
  aktar-düzenle-içe aktar yolunu önerir. Toplu değişikliği varmış gibi yapmaz.
- **Bilinen fark:** Bul ve değiştir yok.

#### BROWSE-18 · İstek · P2
- **Kullanıcı:** "Tekrarlanan (kopya) notları bul."
- **Anki:** Notes > Find Duplicates.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#finding-duplicates)
- **TusAnkiM:** Yok. Yalnızca eklerken ilk alan uyarısı var.
- **Geçer:** Ajan farkı söyler; arama ve sıralamayla elle bulmayı önerir.
- **Bilinen fark:** Kopya bulma yok.

#### BROWSE-19 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Seçtiğim notları sil."
- **Anki:** Notes > Delete notları ve bütün kartlarını siler.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#notes)
- **TusAnkiM:** Seçim → "Diğer" → "Notları sil" → onay.
- **Geçer:** Ajan onay ister. Sonra notlar ve kartları kaybolur.

#### BROWSE-20 · İstek · P2 · S2
- **Kullanıcı:** "Kartlara programı bozmadan sırayla bir göz atayım."
- **Anki:** Preview zamanlamayı ve geçmişi değiştirmez.
  [FAQ](https://docs.ankiweb.net/faqs/study-in-a-particular-order#reviews)
- **TusAnkiM:** Seçim → "Diğer" → "Önizle" → "Önizleme · i/N", "Soru"/"Cevap", "‹ Önceki" /
  "Sonraki ›".
- **Geçer:** Önizlemeden sonra kartların "Sonraki gösterim"i ve geçmiş satırları aynı kalır.

#### BROWSE-21 · İstek · P3 · S2
- **Kullanıcı:** "Listede 'Aralık' ve 'Vade' sütunlarını göster, vadeye göre sırala."
- **Anki:** Sütunlar başlıktan seçilir, başlığa tıklamak sıralar.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#columns)
- **TusAnkiM:** Sütun yok. ⋮ → "Görüntüleme sırasını değiştir" → "Vade" → "↑ Artan". Satıra
  dokununca "Aralık" ve "Sonraki gösterim" açılır.
- **Geçer:** Liste vadeye göre sıralanır; ajan sütun olmadığını söyler.
- **Bilinen fark:** Tablo sütunları yok.

#### BROWSE-22 · İstek · P2 · S2
- **Kullanıcı:** "Seçili notlara 'tekrar-et' etiketini ekle; eski 'kardio' etiketinin adını
  'kardiyo' yap."
- **Anki:** Add Tags ve Remove Tags; etiketler kenar çubuğundan yeniden adlandırılır.
  [Kılavuz](https://docs.ankiweb.net/manual/browsing#editing-items)
- **TusAnkiM:** Seçim → "Diğer" → "Etiketleri düzenle" → "Seçili notların etiketleri".
- **Geçer:** Etiket eklenir. Yeniden adlandırma için ajan farkı söyler.
- **Bilinen fark:** Etiketi yeniden adlandırma yok.

---

## 5. Deste seçenekleri (OPT)

Deste seçenekleri: satır ••• → "Deste seçenekleri", ya da okuyucuda "Deste ayarları". Her değişiklik
"Kaydet" ile yazılır. Kaydetmeden çıkınca "Kaydedilmemiş değişiklikler" sorulur.

#### OPT-01 · Soru · P1
- **Kullanıcı:** "Bu destenin ayarını değiştirirsem diğer desteler de değişir mi?"
- **Anki:** Ayarlar ön ayarlarda tutulur; aynı ön ayarı kullanan bütün desteler değişir. Ayrı ön
  ayar için Add Preset ya da Clone. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#presets)
- **TusAnkiM:** "Ayar grubu" satırı "N deste" der. ••• (aria "Ayar grubu işlemleri") → "Bu deste
  için ayrı ayar grubu oluştur", "Ayar grubu ekle", "Kaydet ve tüm alt destelere uygula".
- **Geçer:** Cevap doğru. Ajan ayrı ayar grubu kurunca diğer deste etkilenmez. Varsayılan ön
  ayarın adı "TUS Kartları"dır.

#### OPT-02 · İstek · P1
- **Kullanıcı:** "Günde 30 yeni kart görmek istiyorum."
- **Anki:** New cards/day günlük yeni kart sayısını sınırlar; varsayılan 20.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#new-cardsday)
- **TusAnkiM:** Böyle bir alan yok. "Günlük limitler" bölümünde "Yeni kartlar için günlük sınır
  yoktur." yazar.
- **Geçer:** Ajan ayarın olmadığını, yeni kartların sınırsız geldiğini söyler ve 30 kartta durmayı
  önerir. Var olmayan bir alanı değiştirmiş gibi yapmaz.
- **Bilinen fark:** Günlük yeni kart sınırı yok.

#### OPT-03 · İstek · P1 · S2
- **Kullanıcı:** "Günde en fazla 150 tekrar göreyim."
- **Anki:** Maximum reviews/day dolunca başka tekrar gösterilmez. Tebrik ekranı limiti artırmayı
  önerir. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#maximum-reviewsday)
- **TusAnkiM:** "Günlük limitler" → "Günlük en fazla tekrar" = 150 → "Kaydet".
- **Geçer:** Değer kaydedilir. Tekrar sayısı 150'yi geçmez. Limit kartları tuttuysa tebrik
  ekranında "Tekrar limitini artır" çıkar.

#### OPT-04 · İstek · P2 · S2
- **Kullanıcı:** "Sadece bugün için bu destede 10 yeni kart daha aç."
- **Anki:** Limitlerin "Preset", "This deck" ve "Today only" sekmeleri var. Ayrıca Custom Study >
  Increase today's new card limit.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#per-deck-daily-limits)
- **TusAnkiM:** "Ayar grubu", "Bu deste", "Yalnızca bugün" sekmeleri tekrar limiti için var.
- **Geçer:** Ajan yeni kartlarda sınır olmadığını, gerekirse tekrar limitinin "Yalnızca bugün"
  sekmesinden değiştirileceğini söyler.
- **Bilinen fark:** Yeni kart sınırı ve onu artırma seçeneği yok.

#### OPT-05 · Soru · P2
- **Kullanıcı:** "Tekrarım çok olunca yeni kart gelmiyor; yeni kartlar tekrar limitine
  takılmasın."
- **Anki:** Tekrar limiti varsayılan olarak yeni kartları da sınırlar. New cards ignore review limit
  bunu kapatır. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#new-cards-ignore-review-limit)
- **TusAnkiM:** Yeni kartlar günlük sınırsız gelir.
- **Geçer:** Cevap Anki'deki kuralı ve TusAnkiM'deki farkı doğru anlatır.
- **Bilinen fark:** Yeni kart sınırı yok, bu yüzden ilgili ayar da yok.

#### OPT-06 · Soru · P3
- **Kullanıcı:** "Üst destenin limiti alt desteleri de kapsasın."
- **Anki:** Varsayılan olarak alt deste seçilince üst destenin limiti uygulanmaz. Limits start from
  top açılınca uygulanır.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#limits-start-from-top)
- **TusAnkiM:** "Günlük limitler" → "Limitler en üst desteden başlasın".
- **Geçer:** Ajan anahtarı açar ve etkisini doğru anlatır.

#### OPT-07 · İstek · P1 · S2
- **Kullanıcı:** "Öğrenme adımlarını 10m 1h yap."
- **Anki:** Adımlar boşlukla ayrılır; Good sonraki adıma, Again ilk adıma götürür.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#learning-steps)
- **TusAnkiM:** "Yeni kartlar" → "Öğrenme adımları" = `10m 1h` → "Kaydet".
- **Geçer:** Yeni kartta Tekrar "10dk", İyi "1sa" gösterir.

#### OPT-08 · Soru · P2
- **Kullanıcı:** "Mezuniyet aralığı ve kolay aralığı ne demek?"
- **Anki:** Mezuniyet aralığı son adımda Good'un verdiği gün, kolay aralığı Easy'nin verdiği gündür.
  FSRS açıkken gizlenirler.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#graduating-interval)
- **TusAnkiM:** "Mezuniyet aralığı (gün)" ve "Kolay aralığı (gün)", FSRS açıkken gizli.
- **Geçer:** Cevap doğru; varsayılanlar 1 ve 4 gün.

#### OPT-09 · Soru · P3
- **Kullanıcı:** "Yeni kartlar eklediğim sırayla mı gelsin, karışık mı?"
- **Anki:** Insertion order Sequential ya da Random. Kılavuz Sequential bırakıp Display Order'ı
  kullanmayı önerir. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#insertion-order)
- **TusAnkiM:** "Ekleniş sırası": "Sıralı" ya da "Rastgele"; "Görüntüleme sırası" bölümü.
- **Geçer:** Cevap doğru, yollar doğru.

#### OPT-10 · İstek · P2 · S2
- **Kullanıcı:** "Unuttuğum kartlar 10 dakika sonra yeniden gelsin."
- **Anki:** Relearning steps. Boşsa yeniden öğrenme atlanır. Minimum interval varsayılan 1 gündür.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#relearning-steps)
- **TusAnkiM:** "Unutmalar" → "Yeniden öğrenme adımları" = `10m` → "Kaydet".
- **Geçer:** Tekrar kartında "Tekrar" düğmesi "10dk" gösterir.

#### OPT-11 · İstek · P2 · S2
- **Kullanıcı:** "Sülük eşiğini 5 yap; kartı askıya almasın, sadece etiketlesin."
- **Anki:** Eşikte not "leech" etiketi alır; askıya alma ayara bağlıdır. Uyarı sonra eşiğin yarısı
  aralıklarla, yukarı yuvarlanarak tekrarlanır. [Kılavuz](https://docs.ankiweb.net/manual/leeches)
- **TusAnkiM:** "Unutmalar" → "Sürekli unutulan kart eşiği" = 5 → "Eşiğe ulaşıldığında" = "Yalnızca
  etiketle" → "Kaydet".
- **Geçer:** Ayar kaydedilir. 5. unutmada not "leech" etiketini alır, kart askıya alınmaz. Eşik 5
  için sonraki uyarılar 8 ve 11'de.
- **Bilinen fark:** Okuyucuda sülük bildirimi çıkmaz; kart bilgisinde açıklama vardır.

#### OPT-12 · Soru · P2
- **Kullanıcı:** "Yeni kartlar alt destelerden hangi sırayla geliyor, karışık gelebilir mi?"
- **Anki:** New card gather order ve New card sort order.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#new-card-gather-order)
- **TusAnkiM:** "Görüntüleme sırası" → "Yeni kart toplama sırası", "Yeni kart sıralaması".
- **Geçer:** Seçenekler ve anlamları doğru eşleştirilir.

#### OPT-13 · İstek · P2 · S2
- **Kullanıcı:** "Yeni kartlar tekrarlardan sonra gelsin."
- **Anki:** New/review order. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#new/review-order)
- **TusAnkiM:** "Görüntüleme sırası" → "Yeni / tekrar sırası" → "…sonra göster" → "Kaydet".
- **Geçer:** Çalışmada önce tekrar kartları, sonra yeniler gelir.

#### OPT-14 · Soru · P2
- **Kullanıcı:** "Çok tekrar birikti; tekrarların sırasını değiştirebilir miyim?"
- **Anki:** Review sort order; birikimde Relative overdueness önerilir, FSRS'te Ascending
  retrievability. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#review-sort-order)
- **TusAnkiM:** "Görüntüleme sırası" → "Tekrar sıralaması".
- **Geçer:** Cevap doğru seçeneği önerir ve yolu gösterir.

#### OPT-15 · İstek · P2 · S2
- **Kullanıcı:** "Aynı notun ters kartı aynı gün gelmesin."
- **Anki:** Bury new siblings, Bury review siblings, Bury interday learning siblings.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#burying)
- **TusAnkiM:** "Gömme" → "Yeni kardeş kartları göm", "Tekrar kardeş kartları göm", "Gün aşan
  öğrenme kardeşlerini göm".
- **Geçer:** "böbrek / kidney" notunun biri çalışılınca öteki o gün gelmez.

#### OPT-16 · Soru · P3
- **Kullanıcı:** "Pazar günleri daha az kart görmek istiyorum."
- **Anki:** Easy Days seçilen günlerde yükü azaltır, geriye dönük değildir.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#easy-days)
- **TusAnkiM:** "Kolay günler" → "Paz" düğmesine dokunarak "Azaltılmış" ya da "Yok".
- **Geçer:** Cevap doğru, ayar kaydedilir.

#### OPT-17 · İstek · P2 · S2
- **Kullanıcı:** "FSRS'yi aç."
- **Anki:** FSRS bütün ön ayarlar için birlikte açılır. SM-2'ye özgü seçenekler gizlenir.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#fsrs)
- **TusAnkiM:** "FSRS" → "FSRS zamanlayıcısını kullan" → "Kaydet".
- **Geçer:** "Mezuniyet aralığı", "Başlangıç kolaylığı" gibi alanlar gizlenir. Başka bir destenin
  seçeneklerinde de FSRS açık görünür.

#### OPT-18 · İstek · P2 · S2
- **Kullanıcı:** "Hedef hatırlama oranını %85 yap."
- **Anki:** Desired retention varsayılan 0.90; yükseldikçe aralık kısalır.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#desired-retention)
- **TusAnkiM:** FSRS açıkken "Hedeflenen hatırlama oranı" = 0.85 (0.70–0.99) → "Kaydet". Sekmeler
  "Ayar grubu" ve "Bu deste".
- **Geçer:** Değer kaydedilir. Tekrar kartında İyi aralığı öncekinden uzun görünür.

#### OPT-19 · İstek · P3 · S2
- **Kullanıcı:** "FSRS parametrelerimi optimize et."
- **Anki:** Optimize tekrar geçmişinden parametre hesaplar. "Zaten uygun" mesajı normaldir. İsteğe
  bağlı sağlık kontrolü vardır.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#fsrs-parameters)
- **TusAnkiM:** "Parametreleri optimize et" → "Hesaplanıyor… %N (durdur)" → "Eğitilecek tekrar
  yok", "Parametreler zaten uygun" ya da "Parametreler güncellendi" → "Kaydet".
- **Geçer:** Az geçmişte "Eğitilecek tekrar yok" ya da "zaten uygun" çıkar, uygulama donmaz.
- **Bilinen fark:** Sağlık kontrolü ve Değerlendir yok. Eğitim Anki 26.05'in yolunu izliyor;
  güncel Anki farklı parametre üretebilir (FSRS denetimi madde 4).

#### OPT-20 · Soru · P3
- **Kullanıcı:** "FSRS'yi açınca mevcut kartlarımın tarihleri değişir mi?"
- **Anki:** Reschedule cards on change kapalıysa hayır. Açılırsa birçok kart birden vadeli olabilir;
  önce yedek önerilir.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#reschedule-cards-on-change)
- **TusAnkiM:** "Değişiklikte kartları yeniden zamanla", varsayılan kapalı.
- **Geçer:** Cevap doğru. Anahtar kapalıyken kaydetmek "Sonraki gösterim" tarihlerini değiştirmez.

#### OPT-21 · İstek · P3
- **Kullanıcı:** "Bana önerilen minimum retention'ı hesapla, iş yükümü simüle et."
- **Anki:** Compute minimum recommended retention 25.07'de kaldırıldı. Yerine Help Me Decide ve
  simülatör var. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#help-me-decide)
- **TusAnkiM:** Yok.
- **Geçer:** Ajan özelliğin olmadığını söyler, uydurma bir hesap vermez.
- **Bilinen fark:** Simülatör yok.

#### OPT-22 · Soru · P3
- **Kullanıcı:** "'Geçmiş hatırlama oranı' ve 'Şu tarihten önceki tekrarları yok say' ne işe yarar?"
- **Anki:** Geçmiş hatırlama, eksik geçmiş doldurulurken varsayılan hatırlama oranıdır. Tarihten
  önceki tekrarlar optimizasyonda yok sayılır.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#historical-retention)
- **TusAnkiM:** "Geçmiş hatırlama oranı" ve "Şu tarihten önceki tekrarları yok say" (YYYY-AA-GG).
- **Geçer:** Cevap doğru. Gelecek tarih için bölüm 18'deki FSRS-04'e bakın.

#### OPT-23 · İstek · P3 · S2
- **Kullanıcı:** "En uzun aralık 1 yıl olsun."
- **Anki:** Maximum interval varsayılan 100 yıldır.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#maximum-interval)
- **TusAnkiM:** "Gelişmiş" → "En fazla aralık (gün)" = 365 → "Kaydet".
- **Geçer:** Uzun aralıklı kartlarda düğmeler en fazla 1 yıl gösterir.

#### OPT-24 · Soru · P3
- **Kullanıcı:** "Başlangıç kolaylığı, kolay bonusu, zor aralık çarpanı, aralık düzenleyici ve yeni
  aralık ne işe yarar?"
- **Anki:** Varsayılanlar 2.50, 1.30, 1.20, 1.00 ve 0.00.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#starting-ease)
- **TusAnkiM:** "Gelişmiş" bölümünde aynı adlar; FSRS açıkken gizli.
- **Geçer:** Anlamlar ve varsayılanlar doğru.

---

## 6. Desteler (DECK)

#### DECK-01 · İstek · P1 · S0
- **Kullanıcı:** "'Dahiliye' adında yeni bir deste oluştur."
- **Anki:** Create Deck; yeni deste varsayılan ön ayarı kullanır.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#adding-cards-and-notes)
- **TusAnkiM:** ＋ (aria "Ekle") → "Deste oluştur" → "Deste adı" → "Oluştur".
- **Geçer:** "Dahiliye" listede görünür, sayıları 0.

#### DECK-02 · İstek · P1 · S2
- **Kullanıcı:** "'Farmakoloji' destesini 'Dahiliye'nin altına al."
- **Anki:** Yeniden adlandırma `Dahiliye::Farmakoloji` ya da sürükle-bırak.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#decks)
- **TusAnkiM:** "⠿" (aria "Farmakoloji destesini taşı") tutamacını Dahiliye satırının ortasına
  bırak.
- **Geçer:** Farmakoloji Dahiliye'nin altında görünür, kartları korunur.
- **Bilinen fark:** Yeniden adlandırmada `::` alt deste kurmaz, " - " olur. Ajan bu yolu denerse
  sonucu kontrol edip sürüklemeye geçmeli.

#### DECK-03 · İstek · P1 · S2
- **Kullanıcı:** "Bu destenin adını 'Kardiyo' yap."
- **Anki:** Dişli menüsünden Rename. [Kılavuz](https://docs.ankiweb.net/manual/studying#decks)
- **TusAnkiM:** Satır ••• → "Desteyi yeniden adlandır" → "Yeni ad" → "Yeniden adlandır".
- **Geçer:** Yeni ad listede ve okuyucu başlığında görünür.
- **Bilinen fark:** "TUS Kartları" desteleri yeniden adlandırılamaz ("Korumalı Deste").

#### DECK-04 · İstek · P1 · S2 · ⚠️ Onay
- **Kullanıcı:** "Bu desteyi sil."
- **Anki:** Dişli menüsünden silinir. İçinde kart varsa uyarır; silme kartları da kaldırır.
  [FAQ](https://docs.ankiweb.net/faqs/merging-or-combining-two-decks)
- **TusAnkiM:** Satır ••• → "Desteyi sil" → "…tüm alt desteleri ve içindeki kartlarla birlikte
  silinecek. Bu işlem geri alınamaz." → onay.
- **Geçer:** Ajan kartların da silineceğini söyleyip onay ister ya da önce taşımayı önerir. Sonra
  deste ve kartları yok olur.

#### DECK-05 · İstek · P2 · S2
- **Kullanıcı:** "Farmakoloji ile Dahiliye destelerini birleştir."
- **Anki:** Ayrı bir birleştirme yok: kartlar Change Deck ile taşınır, boş deste silinir.
  [FAQ](https://docs.ankiweb.net/faqs/merging-or-combining-two-decks)
- **TusAnkiM:** Kartlarım'da `deck:farmakoloji` → "Tümünü seç" → "Desteyi değiştir ›" → Dahiliye.
  Sonra boş desteyi sil.
- **Geçer:** Bütün kartlar hedef destede, kaynak deste ancak onayla silinir.

#### DECK-06 · Soru · P2
- **Kullanıcı:** "Desteler neden garip sıralanıyor, 'Ders 10' neden 'Ders 9'dan önce?"
- **Anki:** Liste alfabetiktir; çözüm "09" gibi başa sıfır koymaktır.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#decks)
- **TusAnkiM:** Desteler sürükleyerek de sıralanır ("Kenarlara bırakın: sırala").
- **Geçer:** Cevap iki yolu da anlatır.
- **Bilinen fark:** TusAnkiM elle sıralamaya izin verir, Anki vermez.

#### DECK-07 · İstek · P3 · S2
- **Kullanıcı:** "Şu an çalışmadığım desteleri daralt."
- **Anki:** Üst deste altında toplayıp daraltmak ya da dışa aktarıp silmek.
  [FAQ](https://docs.ankiweb.net/faqs/hiding-decks)
- **TusAnkiM:** Ok simgesi (aria "Alt desteleri gizle").
- **Geçer:** Daraltma uygulama yeniden açılınca da korunur.

#### DECK-08 · Soru · P3
- **Kullanıcı:** "Desteye açıklama yazabilir miyim?"
- **Anki:** Kılavuz sessiz.
- **TusAnkiM:** Satır ••• → "Açıklamayı düzenle" → "Kaydet"; genel bakışta "DESTE AÇIKLAMASI".
- **Geçer:** Açıklama genel bakışta görünür. Ajan bunun Anki kılavuzunda anlatılmadığını söylerse
  ek puan.

---

## 7. Filtreli desteler ve özel çalışma (FILTER)

Özel çalışma: satır ••• → "Özel çalışma", genel bakıştaki "Özel çalışma" ya da tebrik ekranındaki
"🎯 Özel çalışma". Sonuç "Özel Çalışma Oturumu" adlı filtreli destedir.

#### FILTER-01 · İstek · P1 · S2
- **Kullanıcı:** "Bugün unuttuğum kartları bir daha çalışmak istiyorum."
- **Anki:** Custom Study > Review forgotten cards. Eski oturum yenisinden önce boşaltılır.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#custom-study)
- **TusAnkiM:** "Unutulan kartları tekrarla" → gün sayısı → "Tamam".
- **Geçer:** "Özel Çalışma Oturumu" yalnızca bugün "Tekrar" denen kartları içerir.

#### FILTER-02 · İstek · P1
- **Kullanıcı:** "Bugün 20 yeni kart daha çalışayım."
- **Anki:** Increase today's new card limit.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#custom-study)
- **TusAnkiM:** Bu seçenek bilerek gizli; yeni kartlar zaten sınırsız.
- **Geçer:** Ajan yeni kartların zaten geldiğini söyler ve çalışmayı açar.
- **Bilinen fark:** Yeni kart sınırı yok.

#### FILTER-03 · İstek · P2 · S2
- **Kullanıcı:** "Limit yüzünden gösterilmeyen tekrarları da bugün bitireyim."
- **Anki:** Increase today's review card limit.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#custom-study)
- **TusAnkiM:** "Bugünkü tekrar kart limitini artır" (varsayılan seçenek), ya da tebrik ekranında
  "Tekrar limitini artır".
- **Geçer:** Tutulan tekrarlar aynı destede gelir.

#### FILTER-04 · İstek · P2 · S2
- **Kullanıcı:** "Tatilden önce önümüzdeki 3 günün kartlarını şimdi çalışayım."
- **Anki:** Review ahead; erken çalışmaya özel aralık hesabı.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#reviewing-ahead)
- **TusAnkiM:** "İleriye çalış" → 3 → "Tamam".
- **Geçer:** Önümüzdeki 3 gün içinde vadesi gelecek kartlar gelir.

#### FILTER-05 · İstek · P2 · S2
- **Kullanıcı:** "Yeni eklediğim kartlara programı bozmadan bir göz atayım."
- **Anki:** Preview new cards. [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#custom-study)
- **TusAnkiM:** "Yeni kartları önizle".
- **Geçer:** Kartlar "ÖNİZLEME" rozetiyle gelir. Bittikten sonra hâlâ "Yeni"dirler.

#### FILTER-06 · İstek · P1 · S2
- **Kullanıcı:** "Sınav öncesi 'kardiyo' etiketli bütün kartları çalışmak istiyorum."
- **Anki:** Study by card state or tag > Choose Tags.
  [FAQ](https://docs.ankiweb.net/faqs/settings-for-using-anki-to-prepare-for-a-large-exam#doing-extra-review)
- **TusAnkiM:** "Kart durumuna veya etikete göre çalış" → "Etiketleri seç" → "Şu etiketlerden en az
  biri gerekli:" kardiyo → "Geri" → "Tamam".
- **Geçer:** Oturumda yalnızca kardiyo etiketli kartlar var.

#### FILTER-07 · İstek · P2 · S2
- **Kullanıcı:** "'tag:kardiyo is:due' aramasıyla filtreli deste oluştur."
- **Anki:** Create Filtered Deck: arama, limit, sıralama, isteğe bağlı ikinci filtre, Build.
  Askıdaki ve gömülü kartlar alınmaz.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#creating-manually)
- **TusAnkiM:** ＋ → "Filtrelenmiş deste oluştur" → "Deste adı" → "1. Filtre" → "Ara" (aria
  "Birinci filtre araması") → "Kart limiti" → "Kartların seçilme sırası" → "Oluştur".
- **Geçer:** Genel bakış açılır, "KAYITLI ARAMA" doğru. Askıdaki kart desteye girmez.
- **Bilinen fark:** Filtreli deste aramasında daha az terim desteklenir. Yardım metnindeki
  `introduced:`, `rescheduled:` ve `note:` düz metin olarak aranır. Muhtemel hata.

#### FILTER-08 · Soru · P2 · S2
- **Kullanıcı:** "Filtreli desteyi boşaltınca ya da silince kartlarım silinir mi?"
- **Anki:** Hayır. Kartlar ana destelerine döner.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#home-decks)
- **TusAnkiM:** Satır ••• → "Desteyi boşalt" ("Kartlar silinmez; ait oldukları destelere döner.")
  ya da "Desteyi sil".
- **Geçer:** Kart sayısı değişmez. Ek kontrol: kart filtreli destedeyken ana destenin sayacında
  görünmemeli, boşaltınca geri gelmeli.

#### FILTER-09 · Soru · P2 · S2
- **Kullanıcı:** "Filtreli destede çalışmak kartlarımın programını etkiler mi?"
- **Anki:** Varsayılan olarak evet. Reschedule kapatılırsa önizleme modu: Again, Hard, Good
  gecikmeleri ayarlanır, Easy kartı çıkarır.
  [Kılavuz](https://docs.ankiweb.net/manual/filtered-decks#rescheduling)
- **TusAnkiM:** "Kartları yeniden zamanla" (varsayılan açık). Kapalıyken "Önizleme gecikmeleri
  (saniye)" `60 600 0`.
- **Geçer:** Kapalıyken çalışılan kartın "Sonraki gösterim"i değişmez.

---

## 8. İstatistikler ve kart bilgisi (STATS)

#### STATS-01 · İstek · P1 · S2
- **Kullanıcı:** "İstatistiklerimi göster; bütün koleksiyonun, son 1 yılın."
- **Anki:** Varsayılan seçili deste ve son 12 ay; Collection bütün koleksiyonu gösterir.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#deck)
- **TusAnkiM:** "İstatistik" (aria "İstatistikleri aç") → kapsam "Tüm koleksiyon" → aralık "Son 1
  yıl".
- **Geçer:** Grafikler dolu, kapsam ve aralık doğru.

#### STATS-02 · Soru · P1 · S2
- **Kullanıcı:** "Bugün kaç kart çalıştım, doğru oranım ne?"
- **Anki:** Today bölümü cevap sayısını, Again sayısını ve doğru yüzdesini verir.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#today)
- **TusAnkiM:** "Bugün": "Yanıtlanan", "Doğruluk", "Çalışma süresi", "Yeni kart".
- **Geçer:** Sayılar bugün verilen cevaplarla tutarlı.

#### STATS-03 · Soru · P2 · S2
- **Kullanıcı:** "Önümüzdeki günlerde kaç kartım olacak?"
- **Anki:** Future Due; gecikmiş kartlar ayrı gösterilir.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#future-due)
- **TusAnkiM:** "Gelecek vadeler", "Bugünden itibaren" / "Gecikenlerle".
- **Geçer:** Cevap grafiği doğru okur.

#### STATS-04 · Soru · P3
- **Kullanıcı:** "Hangi günler çalışmışım, günün hangi saatinde daha başarılıyım?"
- **Anki:** Calendar ve Hourly Breakdown. [Kılavuz](https://docs.ankiweb.net/manual/stats#calendar)
- **TusAnkiM:** "Saatlik dağılım" istatistiklerde. Günler için ayrı "Çalışma Takvimi"
  (`/study-calendar`, yalnızca 768 px ve üstündeki kenar çubuğunda).
- **Geçer:** Ajan iki ekranı da bulur.
- **Bilinen fark:** İstatistiklerde takvim ısı haritası yok.

#### STATS-05 · Soru · P2 · S2
- **Kullanıcı:** "Destemde kaç yeni, genç, olgun ve askıdaki kart var?"
- **Anki:** Card Counts. [Kılavuz](https://docs.ankiweb.net/manual/stats#card-counts)
- **TusAnkiM:** "Kart sayıları".
- **Geçer:** Sayılar Kartlarım aramalarıyla (`is:new`, `is:suspended`) tutarlı.

#### STATS-06 · Soru · P2
- **Kullanıcı:** "Gerçek hatırlama oranımı (retention) nereden görürüm?"
- **Anki:** Answer Buttons ve True Retention Table.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#true-retention-table)
- **TusAnkiM:** "Cevap düğmeleri" var, True Retention tablosu yok.
- **Geçer:** Ajan farkı söyler ve en yakın veriyi gösterir.
- **Bilinen fark:** True Retention yok.

#### STATS-07 · Soru · P3
- **Kullanıcı:** "Kolaylık, stabilite, zorluk ve hatırlanabilirlik grafikleri ne gösteriyor?"
- **Anki:** Card Ease; FSRS açıkken Stability, Difficulty, Retrievability grafikleri.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#card-stability)
- **TusAnkiM:** Bu grafikler yok. Tek kartın değerleri kart bilgisinde "FSRS hafıza durumu".
- **Geçer:** Kavramlar doğru anlatılır, eksiklik söylenir.
- **Bilinen fark:** FSRS grafikleri yok.

#### STATS-08 · Soru · P3
- **Kullanıcı:** "Günlük tekrar grafiği ve aralık dağılımı ne anlatıyor?"
- **Anki:** Reviews, Review Time, Review Intervals.
  [Kılavuz](https://docs.ankiweb.net/manual/stats#reviews)
- **TusAnkiM:** "Tekrarlar" ("Cevap" / "Süre") ve "Tekrar aralıkları".
- **Geçer:** Cevap doğru.

#### STATS-09 · Soru · P3
- **Kullanıcı:** "Günde kaç kart eklediğimi gösteren grafik var mı?"
- **Anki:** Kılavuz sessiz; `added:n` araması var.
  [Kılavuz](https://docs.ankiweb.net/manual/searching#added)
- **TusAnkiM:** "Eklenenler". Bir çubuğa dokununca Kartlarım o kartlarla açılır.
- **Geçer:** Çubuk Kartlarım'ı doğru `added:` aramasıyla açar.

---

## 9. Not türleri ve şablonlar (NOTETYPE)

Not türleri yalnızca editörden açılır: "Tür:" → "Not türlerini yönet…" ya da "Kartlar:" satırı.

#### NOTETYPE-01 · İstek · P2 · S0
- **Kullanıcı:** "'İlaç' adında kendi not tipimi oluştur: Ad, Etki mekanizması, Yan etki."
- **Anki:** Manage Note Types > Add ya da Clone, sonra Fields.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#adding-a-note-type)
- **TusAnkiM:** "+ Yeni not türü" (Temel'in kopyası hemen oluşur) → "AD" → "ALANLAR" → "+ Alan
  ekle" → "Kaydet".
- **Geçer:** Editörün "Not türü" listesinde "İlaç" üç alanla görünür.
- **Bilinen fark:** Not türü silinemez ve klonlanamaz. "+ Yeni not türü" türü hemen kaydeder.

#### NOTETYPE-02 · İstek · P1 · S2
- **Kullanıcı:** "Bu not tipine 'Kaynak' diye bir alan ekle, 'Back' alanının adını 'Cevap' yap."
- **Anki:** Fields penceresinde ekleme, silme, yeniden adlandırma ve sıralama.
  [Kılavuz](https://docs.ankiweb.net/manual/editing#customizing-fields)
- **TusAnkiM:** `/note-type` → "ALANLAR": alan adı kutusu, "↑", "↓", "✕"; "+ Alan ekle". Değişiklik
  hemen kaydedilir.
- **Geçer:** Mevcut notların içeriği korunur, şablon yeni alan adıyla çalışır.

#### NOTETYPE-03 · İstek · P2 · S2
- **Kullanıcı:** "Kartın önünde ilacın adı, arkasında etki mekanizması görünsün."
- **Anki:** Front template, Back template, Styling; alan adları büyük/küçük harfe duyarlı.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/intro#the-templates-screen)
- **TusAnkiM:** "ÖN YÜZ (SORU)", "ARKA YÜZ (CEVAP)", "STİL (CSS)", "ÖNİZLEME" → "Kaydet" ("Not türü
  güncellendi.").
- **Geçer:** Önizleme ve okuyucu yeni yerleşimi gösterir.

#### NOTETYPE-04 · İstek · P2
- **Kullanıcı:** "Bu not tipine ikinci bir kart türü ekle: arkadan öne sorsun."
- **Anki:** Cards ekranından kart türü eklenir.
  [Kılavuz](https://docs.ankiweb.net/manual/getting-started#card-types)
- **TusAnkiM:** Yok. Hazır "Temel (ve ters kart)" türü kullanılabilir.
- **Geçer:** Ajan farkı söyler ve hazır türü önerir.
- **Bilinen fark:** Kart türü eklenemez.

#### NOTETYPE-05 · İstek · P2 · S2
- **Kullanıcı:** "Kartların yazısını büyüt, arka planı açık sarı yap."
- **Anki:** Styling CSS'tir: `font-size`, `background-color`.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/styling#card-styling)
- **TusAnkiM:** "STİL (CSS)" → `.card { font-size: 28px; background-color: #fff8dc; }` → "Kaydet".
- **Geçer:** Açık temada kart büyük yazıyla, açık sarı zeminde görünür.

#### NOTETYPE-06 · İstek · P3 · S2
- **Kullanıcı:** "'Not' alanı boşsa o kısım kartta hiç görünmesin."
- **Anki:** `{{#Alan}}…{{/Alan}}`.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/generation#conditional-replacement)
- **TusAnkiM:** Şablona koşullu blok yazılır.
- **Geçer:** Alan boşken blok görünmez, doluyken görünür.

#### NOTETYPE-07 · İstek · P3 · S2
- **Kullanıcı:** "Kartta 'ipucunu göster' bağlantısı olsun."
- **Anki:** `{{hint:Alan}}`. [Kılavuz](https://docs.ankiweb.net/manual/templates/fields#hint-fields)
- **TusAnkiM:** Şablona `{{hint:Kaynak}}`.
- **Geçer:** Bağlantıya dokununca alan açılır.

#### NOTETYPE-08 · İstek · P2 · S2
- **Kullanıcı:** "Mevcut destemde cevabı yazarak çalışabileyim; aksan fark etmesin."
- **Anki:** `{{type:Alan}}`; `{{type:nc:Alan}}` aksanı yok sayar; canlı kılavuzda ayrıca
  `{{type:ci:Alan}}` büyük/küçük harfi yok sayar.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/fields#ignoring-diacritics)
- **TusAnkiM:** Ön şablona `{{type:nc:Back}}`.
- **Geçer:** Aksansız yazılan doğru cevap doğru sayılır.
- **Bilinen fark:** `type:ci` desteği kodda bulunamadı; sınayın.

#### NOTETYPE-09 · Soru · P2
- **Kullanıcı:** "Cloze not tipine yeni kart türü ekleyebilir miyim?"
- **Anki:** Hayır; Cloze'un tek kart türü vardır, klonlanarak özelleştirilir.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/generation#cloze-templates)
- **TusAnkiM:** "Boşluklu" türünün alanları kilitli.
- **Geçer:** Cevap doğru ve TusAnkiM'deki kilidi söyler.

#### NOTETYPE-10 · Soru · P2
- **Kullanıcı:** "'Kartın ön yüzü boş' hatası alıyorum, ne yapmalıyım?"
- **Anki:** Ön şablonda dolu bir alan yok demektir. Cloze'da en az bir `{{c1::…}}` gerekir.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/errors#front-of-card-is-blank)
- **TusAnkiM:** Boşluksuz bir Cloze notu kaydedince editör hata verir.
- **Geçer:** Ajan hatayı yeniden üretip doğru çözümü uygular.

---

## 10. Medya, MathJax/LaTeX, metin okuma (MEDIA)

#### MEDIA-01 · Soru · P2
- **Kullanıcı:** "Hangi ses ve video formatları çalışır?"
- **Anki:** Masaüstü birçok formatı çalar; en geniş destek MP3 ve MP4'tedir.
  [Kılavuz](https://docs.ankiweb.net/manual/media#supported-formats)
- **TusAnkiM:** Ataş → "Ses kaydet", "Ses klibi ekle", "Video klibi ekle".
- **Geçer:** Cevap MP3 ve MP4 önerir. Eklenen bir MP3 okuyucuda çalar.

#### MEDIA-02 · İstek · P2
- **Kullanıcı:** "Karta formül yaz: karekök x."
- **Anki:** MathJax `\(\sqrt{x}\)`. [Kılavuz](https://docs.ankiweb.net/manual/math#mathjax)
- **TusAnkiM:** "Ekle" sekmesi → "MathJax ekle" işaretlemeyi ekler ama kartta işlenmez.
- **Geçer:** Ajan formülün düz metin görüneceğini söyler, işlenmiş gibi göstermez.
- **Bilinen fark:** MathJax işlenmiyor.

#### MEDIA-03 · Soru · P3
- **Kullanıcı:** "LaTeX kullanabilir miyim?"
- **Anki:** Masaüstünde LaTeX kurulu olmalı; mobil yalnızca önceden üretilmiş görselleri gösterir.
  [Kılavuz](https://docs.ankiweb.net/manual/math#latex)
- **TusAnkiM:** Yok.
- **Geçer:** Ajan desteklenmediğini söyler.
- **Bilinen fark:** LaTeX yok.

#### MEDIA-04 · İstek · P2 · S2
- **Kullanıcı:** "Kartın ön yüzünü sesli okut."
- **Anki:** Şablona `{{tts tr_TR:Front}}`.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/fields#text-to-speech-for-individual-fields)
- **TusAnkiM:** Okuyucu ⋮ → "Metin okumayı aç", ya da şablona `{{tts tr_TR:Front}}`.
- **Geçer:** Kart Türkçe okunur. Kart değişince okuma durur.

#### MEDIA-05 · Soru · P3 · S1
- **Kullanıcı:** "Görseller ekrana sığacak kadar küçülüyor; asıl boyutunda gösterebilir miyim?"
- **Anki:** Stile `img { max-width: none; max-height: none; }` eklenir.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/styling#image-resizing)
- **TusAnkiM:** "STİL (CSS)" alanına aynı kural.
- **Geçer:** `kalp.png` asıl boyutunda görünür. Görünmüyorsa not edin: uygulama medyaya ekran
  yüksekliğinin %70'i kadar bir üst sınır uyguluyor (`components/CardWebView.tsx`).

---

## 11. İçe aktarma (IMPORT)

İçe aktarma: Desteler ••• → "İçe aktar", Ayarlar → "Veri yönetimi" → "Deste ve verileri içe
aktar", ya da dosyayı pencereye sürüklemek.

#### IMPORT-01 · İstek · P1 · S0
- **Kullanıcı:** "Arkadaşımın gönderdiği .apkg desteyi içe aktar."
- **Anki:** `.apkg` koleksiyona ekler, üzerine yazmaz.
  [Kılavuz](https://docs.ankiweb.net/manual/importing/packaged-decks#updating)
- **TusAnkiM:** "Dosya seç" → `test/fixtures/anki-26.05-modern.apkg` → "İçe aktar".
- **Geçer:** "İçe aktarma günlüğü" ve "Tamamlandı" görünür. S1'de sayılan desteler, kartlar ve
  medya gelir. Daha önce eklenen notlar korunur.

#### IMPORT-02 · Soru · P2 · S0
- **Kullanıcı:** "Paylaşılan destenin sahibinin ilerlemesini almak istemiyorum."
- **Anki:** Import any learning progress kapatılırsa zamanlama, "leech" ve "marked" etiketleri
  alınmaz. [Kılavuz](https://docs.ankiweb.net/manual/importing/packaged-decks#scheduling)
- **TusAnkiM:** "Çalışma ilerlemesini içe aktar" kapalı.
- **Geçer:** Bütün kartlar "Yeni" gelir, "marked" ve "leech" etiketleri yoktur.

#### IMPORT-03 · İstek · P1 · S0
- **Kullanıcı:** "Excel'deki soru-cevap listemi içe aktar."
- **Anki:** UTF-8 düz metin; ayırıcı tahmin edilir; sütunlar alanlarla eşlenir.
  [Kılavuz](https://docs.ankiweb.net/manual/importing/text-files)
- **TusAnkiM:** CSV dosyası → "Alanları ayıran" → "Not türü" → "Deste" → "ALAN EŞLEMESİ" →
  "İçe aktar". Örnek dosya: `soru;cevap` biçiminde üç satır, başlık satırı yok. Anki ilk
  satırı da not sayar.
- **Geçer:** Üç not doğru alanlarla eklenir. Türkçe karakterler bozulmaz.

#### IMPORT-04 · Soru · P2 · S0
- **Kullanıcı:** "Aynı CSV'yi tekrar içe aktarırsam kartlar çoğalır mı?"
- **Anki:** İlk alan aynıysa varsayılan olarak güncellenir; kopyaları atlamak ya da yeni not almak
  seçilebilir. [Kılavuz](https://docs.ankiweb.net/manual/importing/text-files#duplicates-and-updating)
- **TusAnkiM:** "Mevcut notlar": "Güncelle" (varsayılan), "Koru", "Kopyala"; "Eşleşme kapsamı".
- **Geçer:** "Güncelle" ile ikinci içe aktarma not sayısını artırmaz.

#### IMPORT-05 · İstek · P1 · S1 · ⚠️ Onay
- **Kullanıcı:** "Yedek .colpkg dosyamı içe aktar."
- **Anki:** `.colpkg` bütün koleksiyonu değiştirir, önce otomatik yedek alır.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#what-happens-on-import)
- **TusAnkiM:** `.colpkg` seçilince uyarı ve "Koleksiyon değiştirilsin mi?" onayı. Önce bir
  `.colpkg` dışa aktarın (EXPORT-03).
- **Geçer:** Ajan değiştirme uyarısını kullanıcıya söyleyip onay ister. Yedekler ekranında içe
  aktarma öncesi kopya görünür. Koleksiyon dosyadakiyle aynı olur.

#### IMPORT-06 · Soru · P3
- **Kullanıcı:** "İçe aktarırken 'not tipi değiştiği için bazı güncellemeler yok sayıldı' diyor."
- **Anki:** Not türünün alanları ve şablonları değiştiyse güncelleme yapılmaz.
  [FAQ](https://docs.ankiweb.net/faqs/some-updates-were-ignored-because-the-note-type-has-changed)
- **TusAnkiM:** "GÜNCELLEMELER": "Notları güncelle" ve "Not türlerini güncelle" ("Yeniyse", "Her
  zaman", "Asla").
- **Geçer:** Cevap nedeni ve seçenekleri doğru anlatır.
- **Bilinen fark:** "Not türlerini birleştir" yok; çakışan tür ayrı kopya olarak gelir.

---

## 12. Dışa aktarma (EXPORT)

Dışa aktarma dosyayı tarayıcıya indirir.

#### EXPORT-01 · İstek · P1 · S2
- **Kullanıcı:** "Bu desteyi arkadaşıma göndermek için dışa aktar, benim ilerlemem olmasın."
- **Anki:** `.apkg`; zamanlama kapalıysa geçmiş, "marked" ve "leech" çıkarılır.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#deck-apkg)
- **TusAnkiM:** Satır ••• → "Desteyi dışa aktar" → "Anki Deste Paketi (.apkg)" → "Çalışma
  programını dahil et" kapalı (varsayılan) → "Dışa aktar".
- **Geçer:** İnen paket yeni bir profile içe aktarılınca bütün kartlar "Yeni" gelir.
- **Bilinen fark:** Uygulama ön ayardaki hedef hatırlama ve geçmiş hatırlama değerlerini de
  siliyor; Anki yalnızca FSRS parametrelerini siler (FSRS denetimi madde 8).

#### EXPORT-02 · İstek · P2 · S2
- **Kullanıcı:** "Desteyi ilerlemem ve görselleriyle birlikte dışa aktar."
- **Anki:** Include scheduling information ve Include media açık.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#export-options-2)
- **TusAnkiM:** "Çalışma programını dahil et" ve "Medyayı dahil et" açık.
- **Geçer:** Yeni profile içe aktarınca aralıklar, geçmiş ve görseller gelir.

#### EXPORT-03 · İstek · P1 · S2
- **Kullanıcı:** "Bütün koleksiyonumu tek dosya olarak dışa aktar."
- **Anki:** `.colpkg` bütün koleksiyonu zamanlamasıyla verir.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#collection-colpkg)
- **TusAnkiM:** Desteler ••• → "Dışa aktar" → "Tümünü seç" → "Anki Koleksiyon Paketi (.colpkg)"
  (yalnızca bütün desteler seçiliyken görünür).
- **Geçer:** `.colpkg` iner. "TUS Kartları" katalog desteleri listede yoktur.

#### EXPORT-04 · İstek · P2 · S2
- **Kullanıcı:** "Notlarımı düz metin olarak dışa aktar."
- **Anki:** Notes in Plain Text, alanlar sekmeyle ayrılır.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#text-files)
- **TusAnkiM:** "Düz Metin Notları (.txt)"; "Etiketleri", "Deste adını", "Not türü adını",
  "Benzersiz kimliği dahil et".
- **Geçer:** Dosya her not için bir satır ve sekmeyle ayrılmış alanlar içerir.

#### EXPORT-05 · Soru · P3
- **Kullanıcı:** "Kartları soru-cevap olarak düz metne aktarabilir miyim?"
- **Anki:** Kılavuz yalnızca Notes in Plain Text'i anlatıyor.
- **TusAnkiM:** "Düz Metin Kartları (.txt)".
- **Geçer:** Dosya her kart için soru ve cevap içerir.

---

## 13. Yedekler (BACKUP)

#### BACKUP-01 · Soru · P1
- **Kullanıcı:** "Uygulama otomatik yedek alıyor mu?"
- **Anki:** Evet, varsayılan olarak 30 dakikada bir; medya dahil değil.
  [Kılavuz](https://docs.ankiweb.net/manual/backups#automatic-backups)
- **TusAnkiM:** Ayarlar → "Veri yönetimi" → "Otomatik yedekleme" ("Haftada bir") → "Yedekleri
  yönet".
- **Geçer:** Cevap TusAnkiM'in sıklığını doğru söyler.
- **Bilinen fark:** Haftada bir, Anki'deki gibi 30 dakikada bir değil.

#### BACKUP-02 · İstek · P1 · S2 · ⚠️ Onay
- **Kullanıcı:** "Dünkü yedeğe geri dön."
- **Anki:** Yedekten sonraki bütün değişiklikler kaybolur.
  [Kılavuz](https://docs.ankiweb.net/manual/backups#restoring)
- **TusAnkiM:** Desteler ••• → "Yedekten geri yükle" → satırdaki "Geri yükle" → "Yedeği geri
  yükle".
- **Geçer:** Ajan değişikliklerin kaybolacağını söyleyip onay ister. Listede "↩️ Geri yükleme
  öncesi kopya" oluşur. Yedekten sonra eklenen not kaybolur.

#### BACKUP-03 · İstek · P2 · S2
- **Kullanıcı:** "Şimdi elle yedek al, görseller de dahil olsun."
- **Anki:** Create Backup medya içermez; medya için `.colpkg` ve Include media.
  [Kılavuz](https://docs.ankiweb.net/manual/backups#creating-2)
- **TusAnkiM:** `/backups` → "YEDEK ADI" → "Şimdi yedekle". Paylaşmak için satırdaki "Paylaş" →
  "Yedeği dışa aktar" → "Medyayı dahil et".
- **Geçer:** Yeni yedek listede görünür. Paylaşılan dosya medyayı içerir.

#### BACKUP-04 · Soru · P3
- **Kullanıcı:** "Yanlışlıkla sildiğim notları geri getirebilir miyim?"
- **Anki:** Silinen notlar `deleted.txt`'ye yazılır; ya da yedeğe dönülür.
  [Kılavuz](https://docs.ankiweb.net/manual/backups#deletion-log)
- **TusAnkiM:** Yalnızca yedekten geri yükleme.
- **Geçer:** Ajan yedek yolunu söyler, var olmayan bir günlükten söz etmez.
- **Bilinen fark:** Silme günlüğü yok.

---

## 14. Tercihler (PREFS)

Ayarlar: alt çubuk "Ayarlar" (aria "Ayarları aç"). Değişiklikler "Kaydet" ile yazılır.

#### PREFS-01 · İstek · P2 · S0
- **Kullanıcı:** "Uygulamanın dilini İngilizce yap."
- **Anki:** Preferences > Language. [Kılavuz](https://docs.ankiweb.net/manual/preferences#general)
- **TusAnkiM:** "Genel" → "Dil" → "English" → "Kaydet".
- **Geçer:** Arayüz İngilizce olur ve sayfa yenilenince öyle kalır.
- **Bilinen fark:** Cevap düğmelerinin süreleri Türkçe kalır ("1dk", "1 gün").

#### PREFS-02 · İstek · P1 · S0
- **Kullanıcı:** "Karanlık moda geç."
- **Anki:** Theme ile gece modu. [Kılavuz](https://docs.ankiweb.net/manual/preferences#user-interface)
- **TusAnkiM:** "Genel" → "Tema" → "Koyu" → "Kaydet".
- **Geçer:** Arayüz ve kart koyu zeminde; metin okunaklı.

#### PREFS-03 · İstek · P1 · S0
- **Kullanıcı:** "Yeni gün sabah 6'da başlasın."
- **Anki:** Next day starts at, varsayılan 04:00.
  [Kılavuz](https://docs.ankiweb.net/manual/preferences#scheduler)
- **TusAnkiM:** "İnceleme" → "Sonraki günün başlangıcı" = 6 → "Kaydet".
- **Geçer:** Değer kaydedilir, yenileyince durur.

#### PREFS-04 · İstek · P2 · S2
- **Kullanıcı:** "Öğrenmedeki kartları beklemeden göster."
- **Anki:** Learn ahead limit, varsayılan 20 dakika.
  [Kılavuz](https://docs.ankiweb.net/manual/preferences#scheduler)
- **TusAnkiM:** "İnceleme" → "Önceden öğrenme sınırı"; bekleme ekranında "⚡ Beklemeden çalış".
- **Geçer:** Bekleme ekranındaki düğme kartı hemen getirir; ayar değişince bekleme süresi değişir.

#### PREFS-05 · İstek · P3 · S2
- **Kullanıcı:** "Her 20 dakikada bir kaç kart çalıştığımı göstersin."
- **Anki:** Timebox time limit. [Kılavuz](https://docs.ankiweb.net/manual/preferences#scheduler)
- **TusAnkiM:** "İnceleme" → "Zaman kutusu sınırı" = 20 → "Kaydet". Süre dolunca "Zaman kutusu"
  penceresi: "N dakikada M kart çalıştınız." → "Devam" / "Bitir".
- **Geçer:** Test için 1 dakika yapın. Pencere kart cevaplandıktan sonra çıkar.

#### PREFS-06 · İstek · P2 · S2
- **Kullanıcı:** "Alttaki kalan kart sayılarını gizle."
- **Anki:** Show remaining card count. [Kılavuz](https://docs.ankiweb.net/manual/preferences#review-2)
- **TusAnkiM:** "Yeni çalışma ekranı" → "Ekran" → "Kalan kart sayısını göster" kapalı → "Kaydet".
- **Geçer:** Okuyucuda "N + N + N" sayacı görünmez.

---

## 15. Bakım (MAINT)

#### MAINT-01 · İstek · P2 · S2
- **Kullanıcı:** "Veritabanını kontrol et."
- **Anki:** Check Database bozulmayı denetler, iç yapıları yeniden kurar, önce yedek alır.
  [Kılavuz](https://docs.ankiweb.net/manual/files#checking-your-collection)
- **TusAnkiM:** Ayarlar → "Veri yönetimi" → "Bakım" → "Veritabanını kontrol et". Sorun varsa "Onar ve
  optimize et" (önce güvenlik yedeği).
- **Geçer:** Sonuç penceresi açılır. Temiz koleksiyonda sorun bildirmez.
- **Bilinen fark:** Anki 26.08'den beri kartların son tekrar zamanını da onarıyor; uygulama
  onarmıyor (FSRS denetimi madde 6).

#### MAINT-02 · İstek · P2 · S2 · ⚠️ Onay
- **Kullanıcı:** "Boş kalan kartları temizle."
- **Anki:** Empty Cards boş kartları listeler ve silme sunar.
  [Kılavuz](https://docs.ankiweb.net/manual/templates/generation#card-generation-&-deletion)
- **TusAnkiM:** Desteler ••• → "Boş kartlar" → "🗑️ Tümünü sil (N)" ya da "Bu kartı sil".
- **Geçer:** Cloze notundan `c2` silinince bir boş kart listelenir. Silmek notu ve öteki kartı korur.

#### MAINT-03 · İstek · P2
- **Kullanıcı:** "Kullanılmayan görselleri temizle, eksik olanları bul."
- **Anki:** Check Media. [Kılavuz](https://docs.ankiweb.net/manual/media#checking-media)
- **TusAnkiM:** Yok.
- **Geçer:** Ajan özelliğin olmadığını söyler.
- **Bilinen fark:** Medyayı kontrol et yok.

---

## 16. TusAnkiM'de olmayan özellikler (MISSING)

Bu bölümde ajanın dürüstlüğü test edilir. Ajan özelliği varmış gibi davranmamalı ve en yakın gerçek
yolu söylemeli.

#### MISSING-01 · İstek · P1
- **Kullanıcı:** "Kartlarımı AnkiWeb ile eşitle."
- **Anki:** Eşitleme düğmesi, AnkiWeb hesabı. [Kılavuz](https://docs.ankiweb.net/manual/syncing#setup)
- **TusAnkiM:** Yok; uygulama yalnızca yerel çalışır.
- **Geçer:** Ajan eşitleme olmadığını söyler; `.apkg`/`.colpkg` ve yedekleri önerir.
- **Bilinen fark:** Eşitleme yok.

#### MISSING-02 · İstek · P1 · ⚠️ Onay
- **Kullanıcı:** "Bilgisayardaki Anki koleksiyonumu buraya taşı."
- **Anki:** Eşitlemeyle ya da `.colpkg` dışa ve içe aktararak.
  [Kılavuz](https://docs.ankiweb.net/manual/exporting#collection-colpkg)
- **TusAnkiM:** Anki masaüstünde `.colpkg` (Include media) dışa aktar, TusAnkiM'de "Deste içe
  aktar".
- **Geçer:** Ajan adımları doğru söyler ve TusAnkiM'deki koleksiyonun değişeceği uyarısını verir.

#### MISSING-03 · İstek · P2
- **Kullanıcı:** "Kardeşim için ayrı bir profil aç."
- **Anki:** File > Switch Profile. [Kılavuz](https://docs.ankiweb.net/manual/profiles)
- **TusAnkiM:** Yok.
- **Geçer:** Ajan profil olmadığını söyler.
- **Bilinen fark:** Profiller yok.

#### MISSING-04 · İstek · P2
- **Kullanıcı:** "Bir eklenti kur, mesela AnkiConnect."
- **Anki:** Tools > Add-ons. [Kılavuz](https://docs.ankiweb.net/manual/addons)
- **TusAnkiM:** Yok. Dış otomasyon için `tusankim://x-callback-url` (not ekleme ve arama).
- **Geçer:** Ajan eklenti olmadığını söyler, uygunsa x-callback'i anlatır.
- **Bilinen fark:** Eklentiler yok.

#### MISSING-05 · İstek · P1
- **Kullanıcı:** "Anatomi görselindeki yapıları kapatarak kart yap."
- **Anki:** Image Occlusion not türü. [Kılavuz](https://docs.ankiweb.net/manual/editing#image-occlusion)
- **TusAnkiM:** Not ekle → "Tür:" → "Görüntü Örtme" → "Galeriden görsel seç"; açılan maske
  düzenleyicide Dikdörtgen/Elips/Çokgen/Metin ile maske çizilir, "Çoklu" ile seçilenler "Grupla" ile
  tek soru olur, üstteki seçenek "Hepsini gizle, birini sor" ya da "Birini gizle, birini sor"dur;
  seçili maske üstündeki tutamaçla ya da ↺/↻ ile döner, "Renk" ile boyanır, çokgenin köşeleri
  sürüklenir, kenar ortasındaki noktayla köşe eklenir, "Köşeyi sil" ile çıkarılır;
  "Tamam" ve ✓ ile her maske (grup) bir kart olur.
- **Geçer:** Ajan bu yolu anlatır ve kartları oluşturur.
- **Bilinen fark:** Renkler kısa bir paletten seçilir; Anki'nin hizalama araçları yok.

---

## 17. "Bu neden oluyor?" soruları (WHY)

Bu sorularda iyi bir cevap Anki'nin kuralını söyler, TusAnkiM'in farkını da ekler.

#### WHY-01 · Soru · P1
- **Kullanıcı:** "Neden bütün kartlarımı göstermiyor, istediğim kadar çalışamıyorum?"
- **Anki:** Hangi kartın görüleceğine zamanlayıcı karar verir. Program dışı çalışma için özel
  çalışma, göz atmak için önizleme. [FAQ](https://docs.ankiweb.net/faqs/anki-is-not-showing-me-all-my-cards)
- **TusAnkiM:** "Özel çalışma", Kartlarım → "Önizle".
- **Geçer:** Cevap kuralı ve iki yolu söyler. "Yeni kartlar günde 20" demez; TusAnkiM'de sınır yok.

#### WHY-02 · Soru · P1
- **Kullanıcı:** "Bugün neden hiç yeni kart gelmiyor?"
- **Anki:** Günlük yeni kart limiti doldu, tekrar limiti yeni kartları da kesti, ya da kardeşler
  gömüldü. [Kılavuz](https://docs.ankiweb.net/manual/deck-options#new-cardsday)
- **TusAnkiM:** Sınır yok. Olası nedenler: destede yeni kart kalmadı, kartlar askıda ya da gömülü,
  "Yeni / tekrar sırası" yenileri tekrarlardan sonraya koyuyor.
- **Geçer:** Cevap TusAnkiM'deki gerçek nedenleri sayar.
- **Bilinen fark:** Yeni kart sınırı yok.

#### WHY-03 · Soru · P1
- **Kullanıcı:** "Bu kart neden bu kadar çabuk geri geldi?"
- **Anki:** Kart (yeniden) öğrenmede; Again ilk adıma döndürür. Önceden öğrenme sınırı 20 dakika.
  [Kılavuz](https://docs.ankiweb.net/manual/preferences#scheduler)
- **TusAnkiM:** Aynı; "Öğrenme adımları", "Yeniden öğrenme adımları", "Önceden öğrenme sınırı".
- **Geçer:** Cevap doğru ve ayarların yerini söyler.

#### WHY-04 · Soru · P1
- **Kullanıcı:** "Tekrarlarım neden bu kadar birikti?"
- **Anki:** Her yeni kart sonraki günlerde birçok tekrar getirir; yeni kartları azaltmak ve tekrar
  limiti koymak önerilir. [Kılavuz](https://docs.ankiweb.net/manual/studying#falling-behind)
- **TusAnkiM:** Yeni kart sınırı olmadığı için hızı kullanıcı belirler; "Günlük en fazla tekrar".
- **Geçer:** Cevap sıfırlamayı değil, yeni kartı azaltmayı önerir.

#### WHY-05 · Soru · P1
- **Kullanıcı:** "'Sülük' ne demek, kartım neden askıya alındı?"
- **Anki:** Sürekli unutulan kart; 8 unutmada not etiketlenir, askıya alma ayara bağlıdır.
  [Kılavuz](https://docs.ankiweb.net/manual/leeches)
- **TusAnkiM:** Varsayılan eşik 8, eylem "Yalnızca etiketle". Kart bilgisinde açıklama var.
- **Geçer:** Cevap kavramı ve TusAnkiM'deki varsayılanı doğru söyler.
- **Bilinen fark:** Okuyucuda sülük bildirimi yok.

#### WHY-06 · Soru · P1
- **Kullanıcı:** "Alttaki üç sayı ne anlama geliyor?"
- **Anki:** Soldan sağa yeni, öğrenme ve tekrar kartları.
  [AnkiMobile](https://docs.ankiweb.net/ankimobile/study-screen)
- **TusAnkiM:** "N + N + N" (aria "X yeni, Y öğrenme, Z tekrar kartı").
- **Geçer:** Cevap doğru.

#### WHY-07 · Soru · P2
- **Kullanıcı:** "Aralık neden beklediğimden farklı çıktı?"
- **Anki:** Fuzz, geç cevap, Easy Days ve en fazla aralık sonucu değiştirir.
  [Kılavuz](https://docs.ankiweb.net/manual/studying#fuzz-factor)
- **TusAnkiM:** Aynı etkenler; ek olarak yük dengeleyici.
- **Geçer:** Cevap etkenleri doğru sayar.

#### WHY-08 · Soru · P2
- **Kullanıcı:** "Zor neden İyi'den daha uzun aralık gösteriyor?"
- **Anki:** Öğrenme adımları mezuniyet aralığından uzunsa olabilir; FSRS'te 1 günden uzun adımlar
  da yol açar. [FAQ](https://docs.ankiweb.net/faqs/hard-good-interval-longer-than-good-easy)
- **TusAnkiM:** Aynı ayarlar.
- **Geçer:** Cevap doğru ve hangi ayara bakılacağını söyler.

#### WHY-09 · Soru · P2
- **Kullanıcı:** "Tatile gidiyorum, uygulamayı durdurabilir miyim? Döndüğümde ne yapayım?"
- **Anki:** Zamanlayıcı durdurulamaz; Set Due Date ölçülü kullanılır, dönüşte normal devam edilir.
  [FAQ](https://docs.ankiweb.net/faqs/i-am-going-on-vacation-can-i-pause-the-scheduler)
- **TusAnkiM:** "Vade tarihini ayarla", "İleriye çalış".
- **Geçer:** Cevap sıfırlamayı önermez.

#### WHY-10 · Soru · P2
- **Kullanıcı:** "TUS'a 120 gün var, günde kaç yeni kart çalışmalıyım?"
- **Anki:** Kart sayısı, pekiştirme için ayrılan günler çıkarılmış kalan güne bölünür; sonuç New
  cards/day'e yazılır. [FAQ](https://docs.ankiweb.net/faqs/settings-for-using-anki-to-prepare-for-a-large-exam#how-many-new-cards-per-day)
- **TusAnkiM:** Sınır alanı yok; sayıyı kullanıcı kendisi izler.
- **Geçer:** Ajan hesabı yapar ve TusAnkiM'de bunun bir ayar değil, takip edilecek bir hedef
  olduğunu söyler.
- **Bilinen fark:** Yeni kart sınırı yok.

#### WHY-11 · Soru · P2
- **Kullanıcı:** "Ayarı değiştirdim ama mevcut kartlarım değişmedi, neden?"
- **Anki:** Ayarlar geriye dönük değildir; FSRS'te yeniden zamanlama ayrı bir seçenektir.
  [Kılavuz](https://docs.ankiweb.net/manual/deck-options#reschedule-cards-on-change)
- **TusAnkiM:** "Değişiklikte kartları yeniden zamanla".
- **Geçer:** Cevap doğru.

---

## 18. FSRS'in güncel Anki ile karşılaştırılması (FSRS)

Bu maddeler `docs/AUDIT_FSRS_ANKI_PARITY.md` beşinci geçişindeki farkları uygulama üzerinden
gösterir. Beklenen değerler **Anki 26.09.3** içindir. Uygulamanın bugünkü kodunun bu maddelerde
kalması beklenir; fark düzeltildikçe "Geçti"ye dönmeli. Hepsinde FSRS açık, parametreler varsayılan,
hedef 0.90, öğrenme adımları `1m 10m`, yeniden öğrenme `10m`.

#### FSRS-01 · İstek · P1 · S0 + FSRS
- **Kullanıcı:** "Yeni bir kart ekle; İyi, sonra Zor, sonra İyi'ye basayım."
- **Anki 26.09.3:** Aynı gün verilen Zor stabiliteyi düşürmez. Kart 2 günde mezun olur, hafıza gücü
  2,31 gün kalır.
- **TusAnkiM:** Temel bir not ekle → çalış → "İyi" → bekleme ekranında "⚡ Beklemeden çalış" → "Zor"
  → "⚡ Beklemeden çalış" → "İyi" → ⋮ → "Kart bilgisi".
- **Geçer:** "Aralık" 1 gün değil 2 gün; "Hafıza gücü (stability)" yaklaşık 2,31 gün.
- **Bilinen fark:** Bugünkü kod 1 gün ve yaklaşık 1,37 gün verir (denetim madde 1).

#### FSRS-02 · İstek · P1 · S1 + FSRS
- **Kullanıcı:** "Tekrar kartımı unuttum; Tekrar de, sonra yeniden öğrenmede Zor ve İyi'ye bas."
- **Anki 26.09.3:** Yeniden öğrenmede aynı gün verilen Zor stabiliteyi düşürmez.
- **TusAnkiM:** Örnek paketteki tekrar kartı bugün vadeli değilse önce Kartlarım'da "Vade tarihini
  ayarla" → `0`. Çalışmada "Tekrar" → kart bilgisinde "Hafıza gücü"nü not al → "⚡ Beklemeden çalış"
  → "Zor" → kart bilgisine yeniden bak → "İyi".
- **Geçer:** Zor'dan sonraki hafıza gücü Zor'dan öncekinden düşük değil.
- **Bilinen fark:** Bugünkü kodda yaklaşık %43–74'üne düşer (denetim madde 1).

#### FSRS-03 · İstek · P2 · S2 + FSRS
- **Kullanıcı:** "Bu yeni kartın tarihini 3 gün sonraya ayarla."
- **Anki 26.09.3:** FSRS açıkken yeni kartın aralığı 0 kalır; kart ilk cevabında başlangıç
  parametrelerinden başlar.
- **TusAnkiM:** Kartlarım → bir yeni kart → "Diğer" → "Vade tarihini ayarla" → `3` → "Uygula" → kart
  bilgisi.
- **Geçer:** "Sonraki gösterim" 3 gün sonrası, "Aralık" "—".
- **Bilinen fark:** Bugünkü kod aralığı 3 gün yazar (denetim madde 3).

#### FSRS-04 · İstek · P2 · S2 + FSRS
- **Kullanıcı:** "'Şu tarihten önceki tekrarları yok say' alanına 2099-01-01 yaz ve kaydet."
- **Anki 26.09.3:** Gelecek tarih kaydedilirken bugüne çekilir.
- **TusAnkiM:** Deste seçenekleri → FSRS → "Şu tarihten önceki tekrarları yok say" → `2099-01-01` →
  "Kaydet" → ekranı yeniden aç.
- **Geçer:** Alan bugünün tarihini gösterir ya da form gelecek tarihi reddeder.
- **Bilinen fark:** Bugünkü kod 2099-01-01'i kaydeder (denetim madde 7).

#### FSRS-05 · Soru · P3 · S1 + FSRS
- **Kullanıcı:** "FSRS açıkken kart bilgisinde neden hâlâ 'Kolaylık' görünüyor?"
- **Anki 26.09.3:** Hafıza durumu olan kartta Kolaylık gösterilmez; yerine stabilite, zorluk ve
  hatırlanabilirlik (tam yüzde) gelir.
- **TusAnkiM:** Bir kez cevaplanmış kartın kart bilgisi.
- **Geçer:** Ajan Anki'nin davranışını doğru anlatır. Kart bilgisinde "Kolaylık" yok.
- **Bilinen fark:** Bugünkü kod Kolaylık'ı her zaman gösterir (denetim madde 9).

#### FSRS-06 · İstek · P3 · S2 (FSRS kapalı)
- **Kullanıcı:** "Kartları hatırlanabilirliğe göre seçen bir filtreli deste kur."
- **Anki 26.09.3:** FSRS kapalıyken "Retrievability ascending/descending" sıraları listede yoktur.
- **TusAnkiM:** ＋ → "Filtrelenmiş deste oluştur" → "Kartların seçilme sırası".
- **Geçer:** Ajan FSRS'in kapalı olduğunu ve bu sıranın anlamsız olduğunu söyler. Liste bu iki
  sırayı göstermez.
- **Bilinen fark:** Bugünkü kod 11 sıranın hepsini gösterir (denetim madde 10).

#### FSRS-07 · İstek · P3 · S1 + FSRS
- **Kullanıcı:** "Şu tekrar kartını 'Dahiliye' destesine taşı, sonra kart bilgisini göster."
- **Anki 26.09.3:** Taşıma hafıza durumunu hedef ön ayarla hemen yeniden hesaplar; kart bilgisi
  stabiliteyi gösterir.
- **TusAnkiM:** Kartlarım → kart → "Diğer" → "Desteyi değiştir ›" → Dahiliye. Sonra Kartlarım'da
  `deck:dahiliye prop:s>0` araması.
- **Geçer:** Arama taşınan kartı bulur; yani kartın hafıza durumu var.
- **Bilinen fark:** Bugünkü kod durumu siler ve kart bir sonraki kez cevaplanana kadar göstermez
  (denetim madde 5).

---

## Sonuç kaydı

Her koşu için bu tabloyu kopyalayın. "Gözlem" sütununa beklenenden farklı olanı ve ekran
görüntüsünün adını yazın.

| ID | Tarih | Platform (web / iPhone, sürüm) | Sonuç | Gözlem |
| --- | --- | --- | --- | --- |
| STUDY-01 | | | | |
