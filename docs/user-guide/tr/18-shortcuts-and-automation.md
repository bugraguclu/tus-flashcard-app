---
id: automation
title: Kısayollar ve otomasyon
summary: Deste kısayolları, tusankim:// bağlantılarıyla not ekleme ve arama, web sürümü ve klavye kısayolları.
order: 18
web_path: /yardim/kisayollar
app_help: help?article=automation
app_screens:
  - "Desteler › deste menüsü › Kısayol oluştur — app/(tabs)/decks.tsx"
  - "tusankim:// bağlantıları — app/_layout.tsx, lib/externalLinking.ts, lib/externalActionRoute.ts"
  - "Web otomasyon adresi — app/x-callback-url.tsx"
  - "Web sürümü — components/WebAppIntegrations.tsx, public/manifest.webmanifest"
verified_against: master c6108e6 (2026-10-25)
---

# Kısayollar ve otomasyon

TusAnkiM'i daha hızlı açmanın ve başka uygulamalardan kullanmanın yolları: bir desteyi tek
dokunuşla açan kısayollar, not ekleyen veya arama yapan `tusankim://` bağlantıları, tarayıcıda
çalışan web sürümü ve klavye kısayolları.

<a id="deck-shortcuts"></a>
## Deste kısayolları

Sık çalıştığınız bir desteyi Apple **Kestirmeler** uygulamasına ekleyebilirsiniz:

1. **Desteler** ekranında destenin **•••** menüsünü açın ve **Kısayol oluştur**'a dokunun.
2. iPhone'un açtığı sayfada kestirmeyi ekleyin.
3. Kestirmeyi **Kestirmeler** uygulamasından, ana ekrana eklediğiniz simgeden veya Siri'ye
   destenin adını söyleyerek çalıştırın. TusAnkiM o desteyle doğrudan çalışma ekranında açılır.

Ayrıntılar: [Desteler](04-decks.md#deck-shortcut).

> **Web sürümünde:** **Kısayol oluştur**, desteyi doğrudan açan bağlantıyı panoya kopyalar. Bu
> bağlantıyı tarayıcınızın yer imlerine ekleyebilirsiniz.

<a id="url-automation"></a>
## tusankim:// bağlantıları

iPhone'da `tusankim://` ile başlayan bir bağlantı TusAnkiM'i açar. İki işlem desteklenir:

| İşlem | Bağlantı | Ne olur? |
| --- | --- | --- |
| Not ekleme | `tusankim://x-callback-url/addnote?…` | Not ekleme ekranı alanları doldurulmuş olarak açılır. |
| Arama | `tusankim://x-callback-url/search?query=…` | **Kartlarım** ekranı bu aramayla açılır. |

Bu bağlantıları Kestirmeler uygulamasında bir bağlantı açma eylemiyle, bir not uygulamasındaki
bağlantıyla veya başka bir uygulamanın "bağlantıyı aç" özelliğiyle kullanabilirsiniz. Bağlantıdaki
değerleri URL kodlamasıyla yazın: boşluk `%20`, alt deste ayıracı `::` ise `%3A%3A` olur.
Kestirmeler'in metni bağlantı için kodlayan eylemi bunu sizin için yapar.

> **Anki'den farkı:** AnkiMobile'ın bağlantı otomasyonuna benzer, ama adres `tusankim://` ile
> başlar ve yalnızca not ekleme ile arama vardır.

<a id="add-note-url"></a>
### Not ekleme bağlantısı

```text
tusankim://x-callback-url/addnote?type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX%20inhibit%C3%B6r%C3%BC&tags=farmako%20tus
```

| Değer | Gerekli mi? | Anlamı |
| --- | --- | --- |
| `type` | Evet | Not türünün adı; büyük-küçük harf fark etmez. Hazır türlerde İngilizce adı yazın: `Basic`, `Basic (and reversed card)`, `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze`. Türkçe arayüzde bunlar **Temel**, **Boşluklu** gibi görünür. |
| `deck` | Evet | Destenin adı; büyük-küçük harf fark etmez. Alt deste için `::` kullanın: `TUS%3A%3AFarmakoloji`. Filtrelenmiş bir deste olamaz. |
| `fld` + alan adı | En az bir alan | Alanın içeriği. Alan adını `fld`'nin hemen arkasına, yazıldığı gibi ekleyin: `fldFront`, `fldBack`, `fldText`, `fldBack%20Extra`. Hazır türlerin alan adları İngilizcedir (Türkçe arayüzde **Ön**, **Arka**, **Metin**, **Arka Ek** görünür). |
| `tags` | Hayır | Boşlukla ayrılmış etiketler. |
| `x-success` | Hayır | Not kaydedildikten sonra açılacak bağlantı. Bkz. [Geri dönüş bağlantısı](#x-callback). |

Bağlantıyı açtığınızda:

1. **Not ekle** ekranı, not türü, deste, alanlar ve etiketler doldurulmuş olarak açılır.
   **Kendiliğinden hiçbir şey kaydedilmez.**
2. Notu kontrol edin ve sağ üstteki **✓** (**Notu kaydet**) düğmesine dokunun.
3. **Tamamlandı** penceresi kaç kart oluşturulduğunu söyler. Bağlantıda `x-success` varsa
   **Tamam**'a dokunduğunuzda o bağlantı açılır.

Boşluk doldurma notu örneği:

```text
tusankim://x-callback-url/addnote?type=Cloze&deck=Farmakoloji&fldText=%7B%7Bc1%3A%3AAspirin%7D%7D%20COX%20enzimini%20inhibe%20eder&fldBack%20Extra=NSAID
```

Bağlantı eksikse (`type`, `deck` veya hiç alan yoksa) ya da deste veya not türü bulunamazsa
TusAnkiM bağlantıyı yok sayar ve olduğu ekranda kalır. Hiçbir şey olmuyorsa destenin ve not
türünün adını kontrol edin. TUS Kartları paketindeki destelere not eklenemez; böyle bir deste adı
verirseniz ekran başka bir desteyle açılır, kaydetmeden önce desteyi değiştirin.

<a id="search-url"></a>
### Arama bağlantısı

```text
tusankim://x-callback-url/search?query=deck%3AFarmakoloji%20is%3Adue
```

**Kartlarım** ekranı, `query` değerindeki aramayla açılır; bu örnek "Farmakoloji destesinde zamanı
gelmiş kartlar" demektir. Arama yazımı için bkz. [Kartlarım ve arama](10-browser-and-search.md).

<a id="x-callback"></a>
### Geri dönüş bağlantısı ve güvenlik

`x-success`, not kaydedildikten sonra sizi başka bir yere, örneğin kestirmenin sonraki adımına
götürür. Güvenliğiniz için yalnızca iki tür bağlantı kabul edilir:

- `https://` ile başlayan bir web adresi (içinde kullanıcı adı veya parola olmadan),
- `shortcuts://x-callback-url/…` ile başlayan bir Kestirmeler bağlantısı.

Örnek: `x-success=shortcuts%3A%2F%2Fx-callback-url%2Frun-shortcut%3Fname%3DSonraki`

Başka her bağlantı (`http://`, `file:`, `data:`, yeniden `tusankim://` gibi) sessizce yok sayılır;
not yine kaydedilir ama geri dönüş olmaz. Notu kaydetmeden çıkarsanız geri dönüş bağlantısı
açılmaz. Bu tabloda olmayan değerler (örneğin `x-error`, `x-cancel`, `dupes`) kullanılmaz.

<a id="web-version"></a>
## Web sürümü

TusAnkiM'in tarayıcıda çalışan bir önizlemesi vardır: `tusankim.vercel.app`. Aynı uygulamadır;
koleksiyonunuz tarayıcınızın kendi deposunda tutulur ve hiçbir yere yüklenmez. Asıl uygulama
iPhone uygulamasıdır. Web sürümünde farklı olanlar:

- Deste kısayolları Apple Kestirmeler'e eklenmez, bağlantı olarak kopyalanır.
- Not ekleme ve arama bağlantıları şu adresle çalışır:
  `tusankim.vercel.app/x-callback-url?action=addnote&type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX`
  (`action=search&query=…` arama içindir). Eksik bir istek deste listesini açar.
- Geniş bir pencerede çalışma ekranının yanında bir kenar çubuğu görünür.
- Uygulama aynı anda iki sekmede açılırsa yalnızca ilk sekme kaydeder. Öbür sekmenin üstünde
  **⚠️ Uygulama başka bir sekmede açık — değişiklikler bu sekmede kaydedilmez.** yazar.
- Tarayıcının site verilerini silerseniz koleksiyon da silinir. Önemli çalışmalarınızı
  [dışa aktararak](14-import-export.md) saklayın.

<a id="install-web-app"></a>
### Ana ekrana veya masaüstüne yükleme

Web sürümünü uygulama gibi yükleyebilirsiniz: iPhone'da Safari'nin paylaş menüsünden ana ekrana
ekleyin; bilgisayarda tarayıcının adres çubuğundaki veya menüsündeki yükleme seçeneğini kullanın.
Yüklenen uygulama kendi penceresinde açılır. Simgesinin kısayol menüsünde **Desteler**,
**Kart ekle** ve **İstatistikler** bulunur. Bilgisayarda yüklü uygulamayla bir `.apkg`, `.colpkg`,
`.csv`, `.tsv` veya `.txt` dosyasını açarsanız **Deste içe aktar** ekranı o dosyayla açılır.

<a id="offline"></a>
### İnternetsiz açılış

Siteyi bir kez açtıktan sonra uygulama internet bağlantısı olmadan da başlar. Bağlantı varken
açtığınızda yeni sürüm kendiliğinden gelir.

<a id="web-reminders"></a>
### Hatırlatmalar

Çalışma hatırlatması web sürümünde yalnızca uygulama bir sekmede açıkken gelir (sekme arka planda
olabilir). İzni **Ayarlar › Bildirimler** anahtarını açarak verirsiniz. Bkz.
[Ayarlar](16-settings.md#notifications).

<a id="drag-and-drop"></a>
### Sürükleyip bırakarak içe aktarma

Bir deste dosyasını tarayıcı penceresinin üstüne sürükleyin. **İçe aktarmak için bırakın** yazısı
çıkınca bırakın; **Deste içe aktar** ekranı o dosyayla açılır. `.apkg`, `.colpkg`, `.zip`, `.csv`,
`.tsv` ve `.txt` dosyaları kabul edilir; başka bir dosya bırakırsanız **Bilinmeyen dosya biçimi**
uyarısı çıkar. Bkz. [İçe ve dışa aktarma](14-import-export.md).

<a id="keyboard"></a>
## Klavye kısayolları

Fiziksel bir klavyeyle çalışırken Boşluk cevabı gösterir, 1–4 cevap düğmelerini seçer; R sesi
yeniden oynatır, - kartı gömer, @ askıya alır, * notu işaretler. Esc çalışmadan çıkar, Z veya U son
işlemi geri alır. Web sürümünde Ctrl/Cmd+Z geri alır, Ctrl/Cmd+1–7 bayrak koyar.

- Tam liste: [Çalışma ekranı](05-studying.md#keyboard-shortcuts).
- Tuşları değiştirmek: [Ayarlar › Kontroller › Klavye](16-settings.md#keyboard).

## İlgili konular

- [Desteler](04-decks.md)
- [Kart ekleme ve düzenleme](08-adding-and-editing.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Ayarlar](16-settings.md)
