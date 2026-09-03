# TusAnkiM — Son 24 Saatteki Geliştirme Süreci, Implementation Planları ve Walkthrough Özeti

Bu doküman, son 24-48 saat içerisinde TusAnkiM projesinde gerçekleştirilen tüm geliştirme adımlarını, sizin verdiğiniz orijinal kullanıcı istemlerini (promptları), teknik analiz ve mimari planları (Bölüm 1) ile hayata geçirilen somut değişiklikleri ve doğrulama sonuçlarını (Bölüm 2) akıcı bir düzyazı anlatımıyla sunmaktadır.

---

# BÖLÜM 1: IMPLEMENTATION PLANLARI (UYGULAMA PLANLARI)

Bu bölümde, projedeki her bir geliştirme konusu için sizin ilettiğiniz kullanıcı istemleri doğrultusunda hazırlanan teknik analizler, mimari kararlar, hedefler ve uygulanacak değişiklik planları yer almaktadır.

---

### 1.1. Anki Parity Audit ve Zamanlama Eşitliği Planı

**Kullanıcı İstemi (Prompt):**
> `/Users/bugra/tus-flashcard-app/docs/AUDIT_ANKI_PARITY_FINDINGS_2026-09-01.md burdaki findigsleri doğrula anki manual ankitect/anki ankidroid ve projedeki dosyalarla- doğru olanları yap yapabildiğin kadarını, sonra bana detaylı döküm ver- planı hazırla onay al`

**Uygulama Planı:**
Bu çalışmanın temel amacı, Anki Parity Audit belgesinde listelenen bulguları resmi Anki dokümantasyonu, `ankitects/anki` ve `ankidroid/Anki-Android` kaynak kodları ile karşılaştırıp doğrulamak ve doğruluğu teyit edilen maddeler için güvenli bir uygulama planı oluşturmaktı.

Yapılan teknik incelemede dört kritik alan belirlendi. İlk olarak, filtrelenmiş destelerde kart toplama sırası (gather search order) enum yapısının Anki v3 standartlarında 0'dan 10'a kadar 11 farklı sıralama türü içerdiği, projemizde ise 10 numaralı "Göreceli Gecikme" (Relative Overdueness) seçeneğinin eksik olduğu tespit edildi. İkinci olarak, filtrelenmiş destelerde "Yeniden zamanla" (reschedule) seçeneği kapalıyken kartların kalıcı veritabanı kayıtlarının bozulmaması, bunun yerine Anki standartlarındaki `[10, 60, 600, 0]` gecikme saniyeleri vektörü üzerinden oturum içi geçici vade yönetimi yapılması gerektiği belirlendi. Üçüncü olarak, zengin metin düzenleyicide AnkiMobile standardı olan üstü çizili metin, alt ve üst simge, biçimlendirme temizleme, renk paletleri ve doğrudan HTML kaynağı düzenleme pencerelerinin eksik olduğu görüldü. Son olarak, kart oluşturma sırasında salt ön yüz doluluğu kontrolünün yetersiz kaldığı; "Temel ve Ters Çevrilmiş" gibi şablonlarda ön yüz boş bırakılsa dahi geçerli bir ters kart (Card 2) oluşabileceği için şablonun üreteceği kart sayısını (`countCardsForNote`) temel alan bir validasyon mimarisi planlandı.

Değişikliklerin `lib/models.ts`, `lib/filteredDeckOptions.ts`, `lib/deckManager.ts`, `components/FilteredDeckOptionsModal.tsx`, `app/(tabs)/index.tsx`, `components/RichTextEditor.tsx` ve `app/editor.tsx` dosyalarında yapılması, sürecin `lib/filteredDeckOptions.test.ts` ve `lib/templates.test.ts` birim testleriyle desteklenmesi hedeflendi.

---

### 1.2. Çalışma Ekranı Geri Tuşu ve Son Cevabı Geri Al (Undo) Mekanizması Planı

**Kullanıcı İstemi (Prompt):**
> `çalışma ekranı ankideki gibi geri tuşu ekleyelim. https://docs.ankiweb.net/intro.html Anki manuel- içeriğinde ankinin bütün fonksiyonlarının nasıl çalıştığı anlatılmaktadır. bu bağlamda ankiyi referans alarak yapalım`

**Uygulama Planı:**
Anki, AnkiMobile ve AnkiDroid çalışma ekranlarının etkileşim modeli incelendiğinde, kullanıcının çalışma anında deste listesine dönebilmesini sağlayan belirgin bir geri tuşuna ve yanlış verilen bir cevabı anında geri alabilmeyi sağlayan "Undo Review" işlevine ihtiyaç duyduğu belirlendi.

Plan kapsamında, çalışma ekranındaki klasik araç çubuğunda yer alan basit metin ok işareti yerine modern ve iOS standartlarına uygun `ReviewerBackIcon` SVG ikonunun getirilmesi kararlaştırıldı. Bunun yanına, saat yönünün tersi dairesel ok biçiminde `UndoReviewIcon` butonu tasarlanarak kart cevaplandıkça aktifleşen, işlem yokken Anki standardına uygun şekilde devre dışı (disabled) görünen bir durum yönetimi planlandı. Ayrıca kullanıcıların oturum bittiğinde son kartı geri alabilmelerini sağlamak amacıyla araç çubuğunun tebrikler ekranında da erişilebilir kalması, tamamlama kartına "‹ Destelere Dön" butonu eklenmesi, donanım klavyeleri için `z`, `u`, `Ctrl+Z` ve `Escape` kısayollarının tanımlanması ve kart seçenekleri menüsündeki geçmiş durumunun Anki standartlarına eşitlenmesi planlandı.

---

### 1.3. Filtrelenmiş Deste Seçimi ve Sıralama UI İyileştirme Planı

**Kullanıcı İstemi (Prompt):**
> `https://docs.ankiweb.net/intro.html Anki manuel- içeriğinde ankinin bütün fonksiyonlarının nasıl çalıştığı anlatılmaktadır. bu bağlamda ankiyi referans alarak yapalım. filtrelenmiş deste oluştururken deste seç kısmı not ekle kısmındaki gibi olsun, yani aynı deste seç arayüzü açılsın`
> `burayı da ui olarak düzeltelim- kartların seçilme sırası kısmı`

**Uygulama Planı:**
Filtrelenmiş deste oluşturma ve deste seçenekleri ekranlarında iki temel kullanıcı deneyimi eksikliği tespit edildi: Deste seçiminin Not Ekle ekranındaki modern ağaç yapılı `DeckPickerModal` ile uyumsuz olması ve "Kartların seçilme sırası" menüsünün ekranda kayan, taşmalara açık masaüstü tarzı bir kutu olarak açılması.

Bu doğrultuda, arama sorguları içindeki `deck:"..."` ifadelerini hatasız okuyan (`extractDeckNameFromSearch`) ve güncelleyen (`replaceDeckNameInSearch`) yardımcı algoritmalar tasarlanması planlandı. Filtrelenmiş deste formuna 1. ve 2. Filtre için `Deste:` satırı eklenerek tıklandığında hiyerarşik deste arama, genişletme ve yerinde yeni deste oluşturma imkanı sunan `DeckPickerModal`'ın açılması hedeflendi. Sıralama menüsünün ise `AGENTS.md` kurallarına tam uyumlu biçimde, iOS native form-sheet deneyimi sunan, tutamaçlı (grabber) ve aşağı kaydırılarak kapatılabilen `SwipeDismissSheet` alt sayfası (bottom sheet) haline getirilmesi planlandı.

---

### 1.4. Microsoft Word Tarzı Zengin Metin Düzenleyici Araç Çubuğu (`WordToolbar`) Planı

> **Durum: uygulanmadı.** Aşağıdaki plan hazırlandı fakat hayata geçirilmedi; `components/WordToolbar.tsx` hiç oluşturulmadı. Gerçekte var olan araç çubuğu için Bölüm 2.4'e bakın.

**Kullanıcı İstemi (Prompt):**
> `not ekle alttaki araç çubuğu tam profesyonel çalışmıyor- onu microsoft word ile davranış ve fonksiyon olarak aynı yapalım- çok profesyonel bir araç çubuğu yapalım`

**Uygulama Planı:**
Kart oluştururken ve düzenlerken mobil cihazların kısıtlı ekranlarında zengin metin biçimlendirmeyi masaüstü ofis yazılımları kalitesine taşımak amacıyla Microsoft Word'ün Ribbon mimarisi referans alındı.

Tek satıra sıkıştırılmış statik butonlar yerine 4 ana sekmeli modern bir `WordToolbar` bileşeni tasarlandı:
1. **Giriş Sekmesi:** Yazı boyutu seçimi (12-36px), temel biçim butonları (B, I, U, S, Alt/Üst simge, Biçimlendirmeyi Temizle), 9 renkli Word metin rengi paleti, 6 renkli vurgulama paleti, paragraf hizalama (sol, orta, sağ, yasla) ve girinti kontrolleri.
2. **Stiller Sekmesi:** Normal metin (\(p\)), Başlık 1, Başlık 2, Başlık 3, Alıntı ve Kod bloğu hızlı stilleri.
3. **Ekle Sekmesi:** 2x2 ve 3x3 tablo ekleme, köprü bağlantısı (URL ve metin), yatay ayırıcı çizgi, MathJax matematik ve kimya formülleri, renkli bilgi/çağrı kutuları.
4. **Özel Sekmesi:** Kullanıcıya özel şablonlar ve rozetler.

Bu araç çubuğunun `RichTextEditor` WebView köprüsü ile klavye odağını ve metin seçimini kaybetmeden çift yönlü haberleşmesi planlandı.

---

### 1.5. Not Ekle Ekranı Ataç Butonu Durum Düzeltmesi Planı

**Kullanıcı İstemi (Prompt):**
> `not ekle kısmında dosya ya ba dir şey ekilyorum ve ataç aynı kalıyor- sen git analiz et bu atacın takılı kalmasını her fonksiyonda çöz`

**Uygulama Planı:**
Not ekleme ekranında kullanıcı galeri, kamera, tuval çizimi veya ses kaydı gibi herhangi bir medya eklediğinde, ataç ikonunun yeşil dairesel bir arka planla sürekli aktif/seçili kalması sorunu incelendi.

Kök neden analizinde, alanda medya bulunduğunu tespit eden `FIELD_MEDIA_RE` regex deseninin doğru çalıştığı fakat `MediaAttachButton` bileşeninin bu duruma bağlı olarak `addBtnHasMedia` stiliyle kalıcı yeşil vurgu aldığı görüldü. Ataç butonu bir sabitleme (pin) anahtarı değil, medya menüsünü açan bir eylem tetikleyicisi olduğundan, medya eklense dahi nötr görünümünü koruması gerektiği belirlendi. `MediaAttachButton` içerisindeki yeşil arka plan mantığının kaldırılması, `app/editor.tsx` içerisindeki gereksiz `hasMedia` aktarımlarının temizlenmesi ve medya deseni algılamasının `lib/mediaAttachment.ts` altına taşınarak saf birim testlerine kavuşturulması planlandı.

---

### 1.6. Fotoğraf Editörü Instagram Stili Metin Düzenleme ve Görsel Kırpma Planı

**Kullanıcı İstemleri (Promptlar):**
> `foto seç ve düzenle- kart ekle yerinde- görseli tam seçemiyoruzç görseli olduğu gibi eklyebilmemiz lazım kırpma seçeneğini yine kulanıcıya soralım da tam eklenebilsin yani`
> `-photo editörü meitn yazma kısmını iyileştirelim. tam profesyonel. şimfi metni bir kere koydun mu hareket bilee ettiremiyorsun. instagramdaki gibi yap.`

**Uygulama Planı:**
Kartlara görsel ekleme sürecinde iki temel aksaklık saptandı: İlki, iOS sisteminin `allowsEditing: true` parametresi nedeniyle galeriden seçilen görselleri zorunlu 1:1 kare kırpmaya tabi tutması ve dikey/yatay tıp slaytlarının tam seçilememesi; ikincisi ise fotoğraf editörüne eklenen metinlerin sabit kalıp yeniden taşınamaması ve biçimlendirilememesiydi.

Çözüm olarak, `ImagePicker` çağrılarında `allowsEditing: false` yapılarak orijinal en/boy oranının korunması ve görsel editörüne esnek bir **✂️ Kırpma (Crop)** aracı entegre edilmesi planlandı (Serbest, 1:1, 4:3, 16:9, 3:4, 9:16 hazır oranları). Metin düzenleme tarafında ise Instagram Hikayeler modeli benimsenerek: eklenen metinlere dokunulduğunda 4 köşeli tutamaçlarla seçilip parmakla serbestçe sürüklenebilmesi, sürükleme sırasında altta beliren kırmızı alana bırakılarak çöpe atılabilmesi, Klasik/Dolu/Buzlu/Çerçeveli rozet stillerinin döngüsel seçilebilmesi ve sol kenara yerleştirilen dikey kaydırıcı ile 14-52px arası font boyutunun canlı ayarlanabilmesi planlandı.

---
---

# BÖLÜM 2: WALKTHROUGH'LAR (YAPILAN DEĞİŞİKLİKLER VE ÖZETLER)

Bu bölümde, yukarıda planlanan tüm hedeflerin koda dökülme süreci, hayata geçirilen mimari yenilikler, kullanıcı arayüzü çıktıları ve otomatik kalite kapısı sonuçları özetlenmektedir.

---

### 2.1. Anki Parity Audit ve Zamanlama Eşitliği Uygulama Özeti (Walkthrough)

**Hayata Geçirilen Geliştirmeler:**
- **11 Toplama Sıralaması Tamamlandı:** `lib/models.ts` ve `lib/filteredDeckOptions.ts` dosyalarında Anki v3'ün 11 sıralama düzeni eksiksiz tanımlandı. 10. indeks olan "Göreceli gecikme" (Relative overdueness) seçeneği hem Türkçe hem İngilizce etiketleriyle (`lib/i18n.ts`) arayüze kazandırıldı.
- **Yeniden Zamanlamasız Önizleme Gecikmeleri (Preview Delays):** `reschedule: false` durumunda çalışan geçici gecikme motoru kuruldu. `FilteredDeckOptionsModal` bileşenine `previewDelays` girdi alanı eklendi. Anki üç değer saklar — `preview_again_secs`, `preview_hard_secs`, `preview_good_secs` — ve varsayılanları `60 600 0`'dır; Easy'nin saklanan bir gecikmesi yoktur, `preview_filter.rs` onu sabit sıfırla karşılayıp kartı oturumdan çıkarır. Uygulama bu üçlü sözleşmeyi birebir izler, eski kayıtlardaki dördüncü değeri okuyup atar. Kart cevaplandığında `app/(tabs)/index.tsx` içerisindeki `previewPendingDueMapRef` haritası üzerinden geçici vade atanır; kart satırına ve `revlog`'a dokunulmaz.
- **AnkiMobile Araç Çubuğu Eşitliği:** `RichTextEditor.tsx` ve `editor.tsx` dosyalarına üstü çizili (`strikeThrough`), biçim temizleme (`removeFormat`), alt/üst simge (`subscript`/`superscript`), renk seçim penceresi ve güvenli ham HTML kaynağı düzenleme penceresi eklendi (ikisi de `app/editor.tsx` içinde satır içi `Modal` blokları olarak yaşar, ayrı bileşen dosyaları değildir).
- **Şablon Bazlı Not Validasyonu:** `app/editor.tsx` içindeki statik alan kontrolü kaldırılarak `countCardsForNote(selectedNoteType, mockNote) === 0` kuralı getirildi; böylece ön yüzü boş fakat arka yüzü dolu ters kartlar kaydedilebiliyor. **Bu bilinçli bir Anki farkıdır, parity düzeltmesi değildir:** Anki'nin `note_fields_check` fonksiyonu kart üretimine değil yalnızca ilk alanın boş olup olmadığına bakar ve notu her hâlükârda reddeder. Fark `docs/ANKI_COMPATIBILITY.md` içinde kayıt altına alındı.

---

### 2.2. Çalışma Ekranı Geri Tuşu ve Geri Al (Undo) Uygulama Özeti (Walkthrough)

**Hayata Geçirilen Geliştirmeler:**
- **Geri Butonu ve Navigasyon:** Klasik çalışma ekranı araç çubuğuna iOS standartlarına uygun `ReviewerBackIcon` SVG ikonu entegre edildi. Buton tıklandığında veya harici klavyeden `Escape` tuşuna basıldığında deste listesine güvenle dönüş sağlandı.
- **Son Cevabı Geri Al (Undo Review):** Hem klasik hem yeniden tasarlanan araç çubuğuna `UndoReviewIcon` butonu eklendi. Kart cevaplandığında buton aktifleşerek son verilen cevabın iptal edilip kartın kuyruğa geri dönmesini sağladı. Donanım klavyeleri için `z`, `u`, `Ctrl+Z` ve `Cmd+Z` kısayolları bağlandı.
- **Oturum Tamamlama Görünümü:** Günün kartları bittiğinde gösterilen tebrikler ekranında araç çubuğu butonlarının görünür kalması sağlandı; ayrıca kullanıcıyı doğrudan destelere döndüren şık bir **‹ Destelere Dön** eylem butonu yerleştirildi.
- **Menü Düzeltmesi:** `CardOptionsMenu.tsx` içerisinde işlem geçmişi boşken hatalı olarak görünen "Yinele" satırı, Anki standardı olan devre dışı **Geri al** olarak düzeltildi.

---

### 2.3. Filtrelenmiş Deste & Deste Seçimi UI Yenilemesi Uygulama Özeti (Walkthrough)

**Hayata Geçirilen Geliştirmeler:**
- **Standart Deste Seçici Entegrasyonu:** Filtrelenmiş deste oluşturma sayfasında (`app/(tabs)/decks.tsx`) ve ayar modalında (`components/FilteredDeckOptionsModal.tsx`) yer alan 1. ve 2. Filtre alanlarına standart `Deste: [Deste Adı ⌄]` satırı eklendi. (`app/deck-options.tsx` bu kapsamda değildir: oradaki `DeckPickerModal` "hangi desteyi düzenliyorum" seçicisidir, filtre satırı içermez.) Tıklandığında hiyerarşik ağaç yapılı, aramalı ve yerinde yeni deste açabilen `DeckPickerModal` açılması sağlandı.
- **Arama Sorgusu Senkronizasyonu:** `lib/filteredDeckOptions.ts` içerisine yazılan `extractDeckNameFromSearch` ve `replaceDeckNameInSearch` fonksiyonları sayesinde seçilen deste adı arama kutusundaki `deck:"..."` parametresiyle iki yönlü olarak senkronize edildi.
- **Modern iOS Sıralama Alt Sayfası:** Ekranın ortasında taşmalara neden olan eski açılır kutu kaldırılarak yerine iOS form-sheet standardında, tutamaçlı ve kaydırılarak kapatılabilen `SwipeDismissSheet` entegre edildi.

---

### 2.4. Not Editörü Araç Çubuğu — Gerçek Durum (Walkthrough)

**Düzeltme notu:** Bu bölümün önceki hâli `components/WordToolbar.tsx` adında 4 sekmeli bir ribbon bileşeni anlatıyordu. Böyle bir dosya **yok ve depo geçmişinde hiç var olmadı** (`git log --all -S"WordToolbar"` boş döner). Bölüm, gerçekte var olan araç çubuğunu anlatacak şekilde yeniden yazıldı.

**Gerçekte olan:** `app/editor.tsx` içinde satır içi kurulmuş, tek satırlık yatay kaydırmalı bir araç çubuğu (`formattingTools`, `renderFormattingToolbarItems`). `components/RichTextEditor.tsx` içindeki WebView `contenteditable` belgesini `document.execCommand` üzerinden sürer.

**Mevcut yetenekler:** Kalın, italik, altı çizili, üstü çizili, alt/üst simge, biçim temizleme, yazı boyutu (7 CSS anahtar kelimesi), h1–h5 başlıklar, madde ve numaralı liste, yatay çizgi, MathJax (satır içi, blok, `\ce{}`), metin rengi (5 renk + varsayılan), vurgu rengi (5 renk), cloze, ham HTML kaynak düzenleme ve kullanıcı tanımlı snippet'ler (`lib/customToolbar.ts`).

**Sonradan eklenenler:** Sekmeli ribbon, paragraf hizalama, girinti, tablo, köprü bağlantısı, alıntı ve kod bloğu ile bilgi kutuları 2 Eylül'de eklendi; ayrıntısı Bölüm 3.10'dadır.

**Asıl istenen davranış — seçim yokken biçimlendirme:** Kullanıcının şikâyeti "bold'a basıyorum ama sadece seçili metni değiştiriyor, Word'deki gibi sonraki yazımı kalın yapmıyor" idi. Bunun kök nedeni bulundu ve düzeltildi; ayrıntısı Bölüm 3'tedir.

---

### 2.5. Not Ekle Ekranı Ataç Butonu Durum Düzeltmesi (Walkthrough)

**Hayata Geçirilen Geliştirmeler:**
- **Yeşil Takılı Kalma Sorununun Giderilmesi:** `components/MediaAttachButton.tsx` dosyasındaki `hasMedia` koşullu yeşil arka plan (`backgroundColor: colors.accentLight`) ve yeşil çerçeve stilleri kaldırıldı.
- **Nötr Eylem Butonu Tasarımı:** Ataç butonu, diğer editör eylem butonları gibi temiz ve nötr (`stroke: colors.textMuted`, saydam zemin) görünüme kavuşturuldu.
- **Mimari Temizlik:** `lib/mediaAttachment.ts` modülü oluşturuldu; `app/editor.tsx` üzerindeki prop kirliliği temizlenerek medya doğrulaması bağımsız test kapsamına alındı.

---

### 2.6. Fotoğraf Editörü Instagram Stili Metin ve Görsel Düzenleme (Walkthrough)

**Hayata Geçirilen Geliştirmeler:**
- **Orijinal Görsel Seçimi:** `MediaAttachButton.tsx` içerisinde `allowsEditing: false` yapılarak galeriden seçilen dikey/yatay slaytların zorunlu kare kırpmaya uğramadan orijinal çözünürlük ve oranla açılması sağlandı.
- **İnteraktif Kırpma (Crop) Aracı:** `PhotoEditorModal.tsx` araç çubuğuna **✂️ Kırp** aracı eklendi. Kullanıcıya Serbest (Free), 1:1, 4:3, 16:9, 3:4 ve 9:16 oranlarında sürüklenip boyutlandırılabilir 8 tutamaçlı kırpma çerçevesi sunuldu.
- **Instant Touch-to-Drag:** Eklenen herhangi bir metne dokunulduğunda metin anında seçilip fotoğraf üzerinde parmakla serbestçe her yere sürüklenebilir hale getirildi.
- **Drag-to-Delete (Çöpe Sürükle-Sil):** Metin taşınırken alt kısımda açılan kırmızı çöp alanına bırakıldığında doğrudan silinme özelliği eklendi.
- **Instagram Rozet Stilleri:** Metin üzerinde beliren yüzen menüden Klasik (gölgeli), Dolu Rozet (opak renkli hap), Buzlu Rozet (%75 yarı saydam) ve Çerçeveli stiller arasında tek dokunuşla geçiş sağlandı.
- **Dikey Font Kaydırıcısı:** Modalın sol kenarına eklenen dikey kaydırıcı ile 14px – 52px aralığında canlı önizlemeli boyutlandırma hayata geçirildi.

---

### 2.7. Ek UI/UX İnce Ayarları ve Arayüz Temizlikleri (Walkthrough)

**Kullanıcı İstemleri ve Yapılan Düzeltmeler:**
- **Bugünün Özeti (`app/stats.tsx`):**
  - *İstem:* `bugünün özetinde sağ üstteki küçük emojileri kaldıralım.`
  - *Uygulama:* Dört istatistik kutusunun sağ üstündeki küçük glifler (`✓ ◎ ◷ ＋`) ve `todayIcon` stili kaldırıldı. Aynı commit'te zaman aralığı seçicisindeki gereksiz "İSTATİSTİKLER" üst başlığı da silindi.
- **Gelecek Vadeler (`app/stats.tsx`):**
  - *İstem:* `gelecek vadeler de başlığın mene altında 2 seçenek var ya bugünden itibaren ve gecikenlerde- ona basınca sayfa yenileniyor ve en üste atıyor- bu olamsın. buna benzer davranış ıuygulamada nerede varsa düzelt.`
  - *Uygulama:* `showBacklog` anahtarı snapshot cache anahtarından ve yükleyici bağımlılıklarından çıkarıldı; her iki seri (`futureDue`, `futureDueWithBacklog`) önceden hesaplanıp render sırasında seçiliyor. Anahtar değişmediği için yeniden yükleme olmuyor, alt ağaç unmount olmuyor ve kaydırma konumu yapısal olarak korunuyor. Ayrıca `hooks/useDeferredScreenSnapshot.ts` önbellekten tohumlanacak ve yeni anahtar yüklenirken `null` yerine önceki snapshot'ı döndürecek şekilde sertleştirildi; bu, aynı davranışı dört tüketici ekranın tamamında çözer.
- **Arama Çubuğu ve Buton Hizalamaları (`app/(tabs)/decks.tsx`):**
  - *İstem:* `filtrelenmiş deste sayfasında ikinci filtreyi etkinleştir yazısı butonun altında orayı ui olarak tam profesyonel yap`, `bu arama barını ui olarak düzeltelim yazı mause imlecinin altında`
  - *Uygulama:* Buton metin çakışmaları giderildi; arama çubuğu metinleri ve imleç dikeyde tam ortalandı.
- **Kart Arama & Etiket Filtresi:**
  - *İstem:* `kartlarım kart ara veya deck yazısı hafif altta- o tam ortada olsun ya`, `etikete göre filtrlemeden alttaki yeni ve süresi gelen kutucuğunu silelim.`
  - *Uygulama:* Kart arama yer tutucu metinleri dikeyde ortalandı; etiket filtreleme alanındaki gereksiz kutucuklar kaldırıldı.

---

### 2.8. Konsolide Test ve Kalite Kapısı Sonuçları

Gerçekleştirilen tüm geliştirmeler otomatikleştirilmiş test paketleri ve kalite kontrolleri ile doğrulanmıştır:

- **TypeScript Derleme Kontrolü (`tsc --noEmit`):** 0 hata ile başarıyla tamamlandı.
- **Birim ve Entegrasyon Testleri (`vitest run`):**
  - Toplam Test Dosyası: **111 passed (111)**
  - Toplam Test Adedi: **966 passed (966)** (%100 Başarı)
- **iOS Yapılandırma ve Anki Uyumluluk Kontrolü (`node scripts/verify-ios-readiness.mjs`):** Başarıyla doğrulandı.
- **Genel Kalite Kapısı (`npm run quality`):** Sıfır hata ile eksiksiz olarak geçti.

---
*Doküman Referansı: `docs/SON_24_SAAT_IMPLEMENTATION_PLANLARI_VE_OZETLERI.md`*

---
---

# BÖLÜM 3: DOĞRULAMA DENETİMİ VE DÜZELTMELER (2 Eylül 2026)

`docs/AUDIT_SON_24_SAAT_DOGRULAMA_2026-09-02.md` denetimi, yukarıdaki iddiaları kod, git geçmişi ve upstream Anki kaynaklarıyla karşılaştırdı. Bu bölüm, o denetimin bulduğu hataların nasıl kapatıldığını anlatır.

### 3.1. `.apkg` içe aktarımında önizleme gecikmesi alanları (P0)

`decks.proto` içindeki `Deck.Filtered` alan numaraları bilerek sıralı değildir: `preview_hard_secs = 5`, `preview_good_secs = 6`, `preview_again_secs = 7`. `lib/importApkg.ts` bunları 5=Again, 6=Hard, 7=Good olarak okuyordu; varsayılan ayarlı gerçek bir Anki destesi **again=600, hard=600, good=60** olarak içe aktarılıyordu. Alan eşlemesi ve alan başına varsayılanlar düzeltildi. Ayrıca v2 döneminden kalan tek değerli `preview_delay` (alan 4, dakika) okunup üç butona yayılıyor, hem modern protobuf hem schema-11 JSON yolları aynı sonucu veriyor. Aynı yanlış varsayımı kodlayan round-trip fixture'ı gerçek alan numaralarıyla yeniden yazıldı.

### 3.2. Fotoğraf editöründe çöpe sürükleyip silme (P0)

`PanResponder` `useRef` içinde bir kez kurulduğu için `trashHovered` state'ini okuyan kapanış sonsuza dek ilk render'ın `false` değerini görüyordu: kırmızı bölge vurgulanıyor, "Silmek için bırakın" yazıyor, fakat bırakınca silmiyordu. Dosyadaki diğer state'ler gibi bir ref aynası eklendi ve bırakma kararı `lib/photoEditor.ts` içinde saf bir yardımcıya taşınarak testle sabitlendi.

### 3.3. Arama sorgusunda deste adı değiştirme (P1)

`replaceDeckNameInSearch` regex tabanlıydı ve tokenizer tabanlı `extractDeckNameFromSearch` ile çelişiyordu: sekme/yeni satır ayracını yutuyor, deste adındaki tırnakları siliyor, parantezli `deck:` terimini hem çiftliyor hem temizleyemiyor ve Anki joker karakterlerini (`*`, `_`) kaçırmıyordu. Fonksiyon aynı tokenizer üzerine yeniden yazıldı; `lib/searchQuery.ts` içine Anki'nin kaçış kurallarını uygulayan `escapeSearchValue` ve tam tersi olan `unquoteSearchValue` çifti kondu.

### 3.4. Undo'nun eksik kalan tarafı

`answerStudyCard` yalnızca cevaplanan kartı değiştirmiyordu: kardeş kartları gömüyor ve leech durumunda kartı askıya alıp nota `leech` etiketi ekliyordu. `undoAnswer` bunların hiçbirini geri almıyordu. Artık cevap, Anki'nin tek "Undo Answer Card" işlemi gibi davranıyor: gömülen kardeşler ve bu cevabın eklediği leech etiketi/askısı aynı transaction içinde geri alınıyor. Daha önceki bir lapse'ten gelen etiket korunuyor.

### 3.5. Çalışma ekranı kısayolları ve çıkış

- `z` ve `u` artık kullanıcının kendi tuş atamalarından **sonra** geliyor: bury'yi `z`'ye taşıyan bir kullanıcı artık sessizce undo almıyor.
- Ctrl/Cmd+Z yalnızca web'de yakalanabiliyor (native yakalama `TextInput.onKeyPress`'tir ve modifier bildirmez), bu yüzden ipucu metni platforma göre üretiliyor; iPhone'da çalışmayan bir kısayol artık reklam edilmiyor.
- Klavye yakalama alanı tebrikler ekranında da duruyor; Escape ile çıkış artık son karttan sonra da çalışıyor.
- Geri butonunun etiketi davranışıyla eşitlendi ("Çalışmadan çık"), tebrikler ekranındaki "Destelere Dön" butonu ise gerçekten deste listesine gidiyor.

### 3.6. Filtrelenmiş deste toplama sırası

`rslib/src/storage/card/filtered.rs` referans alınarak: "ekleniş sırası" ve "son eklenen önce" artık kart id'sine değil **not id'si + şablon sırasına** göre sıralıyor (bir notun kartları dağılmıyor); "vade sırası" ise gün numarası saklayan tekrar kartlarıyla saat zamanı saklayan öğrenme kartlarını tek bir zaman çizgisine yansıtıyor. Hatırlanabilirlik (8/9) ve göreceli gecikme (10) hâlâ yaklaşık; bu fark `docs/ANKI_COMPATIBILITY.md` içinde bilinen fark olarak kayıtlı.

### 3.7. Seçim yokken biçimlendirme (kullanıcının asıl şikâyeti)

`restoreSelection()` her komutta koşulsuz `removeAllRanges()/addRange()` yapıyordu. WebKit, seçim yeniden atandığında bekleyen yazım stilini (pending typing style) düşürür; bu yüzden seçimsiz Bold sonra Italic zinciri bozuluyordu. `lib/richTextCommands.ts` içindeki köprü `components/RichTextEditor.tsx`'e bağlandı: canlı imleç varken seçim artık hiç yeniden atanmıyor, `execCommand` bir toggle'ı sessizce yutarsa imleç boş bir satır içi sarmalayıcının içine park edilerek sonraki karakterler biçimi devralıyor. Sarmalayıcıyı ayakta tutan sıfır genişlikli işaretler, alan saklanmadan önce temizleniyor.

`lib/richTextCommands.test.ts` bu kararları sahte bir DOM üzerinde sabitliyor. **Yine de bu, cihaz kanıtı değildir:** WKWebView'ın gerçek davranışı ancak iPhone'da doğrulanabilir. Doğrulama adımı: not ekle ekranında hiçbir şey seçmeden Bold → Italic → yaz; çıkan metnin hem kalın hem italik olması ve araç çubuğunun bunu göstermesi beklenir.

### 3.8. Dışa aktarımda sarkan deste referansı

`scopedData` filtrelenmiş desteleri hiç dışa aktarmıyor, fakat kartın `did`'i olduğu gibi yazılıyordu: filtrelenmiş bir destede duran kart, paket içinde tanımlı olmayan bir desteyi işaret ediyordu. Anki'nin kendi paket dışa aktarıcısı gibi kart artık `odid`'deki asıl destesine döndürülüyor, `odue` vadesi geri veriliyor.

### 3.9. Kalite kapısı

`npm run quality`: tip kontrolü temiz, **113 test dosyasında 1013 test** geçiyor, iOS/uyumluluk kaydı doğrulanıyor. Yayın öncesi App Store hukuki kimlik alanları hâlâ placeholder içeriyor (işlevsellikten bağımsız yayın engeli).

### 3.10. Sekmeli araç çubuğu (ribbon)

Tek satırlık kaydırmalı araç çubuğu, iPhone'da araçların çoğunu bir kaydırma hareketinin arkasında bırakıyordu. Araç çubuğu üç sekmeye ayrıldı:

- **Giriş:** Anki'nin kendi araç çubuğundaki satır içi biçimler (kalın, italik, altı çizili, üstü çizili, alt/üst simge, biçim temizleme, renk, yazı boyutu) + paragraf hizalama (sola, ortala, sağa, iki yana yasla) ve girinti artır/azalt.
- **Stiller:** Normal, H1, H2, H3 (metin etiketiyle, beş aynı ikon ayırt edilemeyeceği için), alıntı, kod bloğu, madde ve numaralı liste. Hepsi `formatBlock` ile çalışıyor; eskiden `<h1>…</h1>` sarmalayan ayrı başlık seçici kaldırıldı.
- **Ekle:** Tablo (2×2, 3×3, 3×2, 4×4), bağlantı, bilgi kutusu (4 ton), yatay çizgi, MathJax, HTML kaynağı; cloze ve kullanıcının kendi araç çubuğu düğmeleri de bu sekmede.

Bunlar AnkiMobile araç çubuğunda bulunmayan, bilinçli ürün eklemeleridir; ürettikleri şey her yerde açılan düz HTML'dir (`table`, `blockquote`, `pre`, `a`), Anki'ye özgü bir uzantı değildir.

**Güvenlik:** Alan sanitizasyonu bir denylist olduğu için bu etiketlerin hiçbiri sanitizer'ı gevşetmeyi gerektirmedi — `sanitizeUntrustedHtml` script/style/iframe/form gibi kapları ve `on*`, `srcdoc`, tehlikeli `style`, güvensiz URL niteliklerini zaten atıyor. Bağlantı adresleri ayrıca `lib/editorToolbar.ts` içinde doğrulanıyor: yalnızca `http`, `https` ve `mailto` kabul ediliyor; `javascript:`, `data:`, `file:` ve boşluk/tırnak içeren adresler reddediliyor, etiket metni kaçırılıyor. `lib/editorToolbar.test.ts` her eklenen parçayı sanitizer'dan geçirip **değişmeden döndüğünü** doğruluyor — yani kullanıcı yazdığı biçimi sessizce kaybetmiyor, saldırgan da sanitizer'ın arkasından dolaşamıyor.
