---
id: anki
title: Anki ile birlikte kullanma
summary: Anki'deki destelerinizi TusAnkiM'e taşıma, geri götürme ve iki uygulama arasındaki farklar.
order: 19
web_path: /yardim/anki-ile-kullanma
app_help: help?article=anki
app_screens:
  - "İçe aktar — app/import.tsx"
  - "Dışa aktar — app/export.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Anki ile birlikte kullanma

TusAnkiM, Anki'nin paket dosyalarını okur ve yazar. Anki masaüstü, AnkiMobile veya AnkiDroid'de
hazırladığınız desteleri getirebilir, TusAnkiM'de çalıştıklarınızı yeniden Anki'ye
götürebilirsiniz. Taşıma dosyayla yapılır; iki uygulama arasında otomatik eşitleme yoktur.

> TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir. "Anki" adı burada
> yalnızca dosya biçimlerini ve davranışları anlatmak için geçer.

<a id="what-transfers"></a>
## Neler taşınır?

| Dosya | İçinde ne var? | TusAnkiM'de ne olur? |
| --- | --- | --- |
| `.apkg` (deste paketi) | Bir veya birkaç deste: notlar, kartlar, not türleri (alanlar, şablonlar, CSS), medya; isteğe bağlı olarak çalışma ilerlemesi, tekrar geçmişi ve deste ayarları | Mevcut koleksiyonunuza **eklenir**. Aynı notlar bulunursa seçtiğiniz kurala göre güncellenir. |
| `.colpkg` (koleksiyon paketi) | Koleksiyonun tamamı, çalışma geçmişiyle | Mevcut kartlarınızın, destelerinizin ve geçmişinizin **yerine geçer**. Önce güvenlik yedeği alınır. |
| `.csv`, `.tsv`, `.txt` | Metin satırları; Anki'nin `#` ile başlayan başlık satırları desteklenir | Seçtiğiniz not türü ve desteye notlar olarak eklenir veya mevcut notları günceller. |

`.zip` uzantılı bir deste paketi de dosya seçiciden veya web sürümünde sürükleyip bırakarak
açılabilir; uygulama onu `.apkg` gibi okur.

<a id="move-whole-collection"></a>
## Anki'deki koleksiyonunuzun tamamını taşımak

TusAnkiM'e yeni başlıyorsanız ve Anki'deki her şeyi getirmek istiyorsanız:

1. Anki'de **Dışa aktar** penceresini açın, biçim olarak koleksiyon paketini (`.colpkg`) seçin ve
   medyayı dahil etme seçeneğini (**Include media**) açık bırakın.
2. Dosyayı iPhone'unuza aktarın: AirDrop, iCloud Drive veya bilgisayardan **Dosyalar** uygulamasına
   kopyalama işinizi görür.
3. **Dosyalar**'da dosyaya dokunun ve paylaşım menüsünden TusAnkiM'i seçin. Ya da TusAnkiM'de
   **Desteler › ⋮ › İçe aktar › Dosya seç** yolunu izleyin.
4. **Koleksiyon değiştirilsin mi?** sorusunu okuyun. Onaylarsanız TusAnkiM önce mevcut
   koleksiyonunuzun bir güvenlik yedeğini alır, sonra paketi yükler.
5. Bitince **İçe aktarma günlüğü** kaç kartın, tekrar kaydının ve medya dosyasının geldiğini
   gösterir. **Tamamlandı** ile çıkın.

Koleksiyon paketi yalnızca kartları, desteleri ve geçmişi değiştirir. Uygulama ayarlarınız,
Kronometre oturumlarınız ve cihazdaki medya dosyaları yerinde kalır.

> **Dikkat:** TusAnkiM'de zaten çalıştığınız kartlar varsa koleksiyon paketi onları siler. Yalnızca
> bazı desteleri eklemek istiyorsanız bir sonraki bölümdeki deste paketini kullanın.

<a id="bring-some-decks"></a>
## Yalnızca bazı desteleri getirmek

1. Anki'de desteyi deste paketi (`.apkg`) olarak dışa aktarın. Kendi ilerlemenizi de getirmek
   istiyorsanız çalışma bilgisini dahil etme seçeneğini (**Include scheduling information**) ve
   medyayı açık tutun.
2. Dosyayı TusAnkiM'de açın. **İçe aktarma seçenekleri** bölümünde:
   - **Çalışma ilerlemesini içe aktar** (varsayılan açık): Kartlar Anki'de kaldıkları yerden devam
     eder. Kapatırsanız kartlar yeni olarak başlar; tekrar geçmişi, `marked` ve `leech` etiketleri
     alınmaz.
   - **Deste ayarlarını içe aktar** (varsayılan açık): Paketteki ayar grupları da gelir. Aynısı
     zaten varsa yeniden kullanılır.
   - **Notları güncelle** ve **Not türlerini güncelle**: **Yeniyse** (varsayılan), **Her zaman** veya
     **Asla**. Daha önce içe aktardığınız bir paketin yeni sürümünü açtığınızda notların nasıl
     güncelleneceğini belirler.
3. **İçe aktar** düğmesine dokunun. Paketli her içe aktarmadan önce otomatik bir güvenlik yedeği alınır.

Aynı paketi ikinci kez içe aktarmak kartları çoğaltmaz: Notlar benzersiz kimlikleriyle tanınır.
Güncelleme yalnızca not içeriğini ve etiketleri değiştirir; TusAnkiM'deki çalışma durumunuz
korunur.

<a id="shared-decks"></a>
## Başkalarının paylaştığı desteler

İnternetten indirdiğiniz bir `.apkg` dosyasını da aynı yolla içe aktarırsınız. Desteyi hazırlayan
kişinin çalışma geçmişiyle başlamak istemiyorsanız **Çalışma ilerlemesini içe aktar** seçeneğini
kapatın; kartlar sizin için yeni olarak gelir.

Bazı paylaşılan destelerin kart şablonlarında JavaScript kodu bulunur. TusAnkiM güvenlik için
kartlardaki kodları çalıştırmaz; bu tür kartlar sade hâlde görünebilir. Bkz.
[Not türleri ve kart şablonları](09-note-types.md).

<a id="back-to-anki"></a>
## TusAnkiM'den Anki'ye götürmek

1. **Desteler › ⋮ › Dışa aktar** ekranını açın.
2. Biçimi seçin:
   - Bütün desteler seçiliyken **Anki Koleksiyon Paketi (.colpkg)**: koleksiyonun tamamı, çalışma
     geçmişiyle birlikte.
   - Bazı desteler için **Anki Deste Paketi (.apkg)**. İlerlemenizin de gitmesini istiyorsanız
     **Çalışma programını dahil et** seçeneğini açın; bu seçenek varsayılan olarak **kapalıdır**.
3. **Medyayı dahil et** açık kalsın, **Dışa aktar**'a dokunun ve dosyayı paylaşım menüsünden
   kaydedin veya gönderin.
4. Anki'de dosyayı içe aktarın.

TUS Kartları paketi ve filtrelenmiş desteler dışa aktarılmaz; filtrelenmiş destelerdeki kartlar
kendi destelerinde dışa aktarılır. Ayrıntılar: [İçe ve dışa aktarma](14-import-export.md).

<a id="using-both"></a>
## İki uygulamayı aynı anda kullanmak

TusAnkiM ile Anki arasında eşitleme olmadığı için aynı kartları iki yerde çalışırsanız iki ayrı
geçmiş oluşur ve bunlar birleştirilemez. Bir deste paketini yeniden içe aktarmak not içeriğini
günceller ama TusAnkiM'deki çalışma durumunu değiştirmez. Önerimiz:

- Kartlarınızı **tek bir ana uygulamada** çalışın.
- Uygulama değiştirdiğinizde koleksiyonun tamamını `.colpkg` olarak taşıyın.
- Taşımadan önce iki tarafta da bir yedek alın.

<a id="differences"></a>
## Anki'den farklı çalışan yerler

TusAnkiM, Anki'nin dosya biçimleriyle ve temel çalışma davranışıyla uyumlu olacak şekilde
geliştirilir, ama her özelliği yoktur. Fark edeceğiniz başlıca yerler:

| Konu | TusAnkiM'de |
| --- | --- |
| Eşitleme (AnkiWeb) | Yok. Taşıma `.colpkg` / `.apkg` dosyasıyla yapılır. |
| Profiller | Tek koleksiyon vardır. |
| Yeni kart günlük sınırı | Yok: istediğiniz kadar yeni kart çalışabilirsiniz. Tekrar kartlarının günlük sınırı vardır. Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits). |
| Matematik (MathJax/LaTeX) | Formüller işlenmiş hâlde gösterilmez; alanlardaki kaynak metin korunur. |
| Görüntü örtme (Image Occlusion) | Notlar uygulamanın maske düzenleyicisiyle yapılır ve düzenlenir, Anki'de dönüşleri ve renkleriyle aynı maskelerle açılır; burada renkler kısa bir paletten seçilir, Anki'de verilen her renk korunur. |
| Eklentiler (add-on) | Desteklenmez. |
| Kart şablonlarındaki JavaScript | Güvenlik için çalıştırılmaz. |
| Not türlerini birleştirme | Sunulmaz. Yapısı değişmiş bir not türü ayrı bir kopya olarak eklenir; adının sonuna `(Imported)` gelir. |
| Yedekler | Uygulamanın kendi yedekleridir, Anki'de doğrudan açılmaz. Bir yedeği Anki'ye götürmek için **Yedekler › Paylaş** ile pakete çevirin. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md). |
| İstatistikler | Anki'nin grafiklerinin bir bölümü vardır. Bkz. [İstatistikler](12-statistics.md). |
| Klavye kısayolları | Çalışma ekranının temel tuşları vardır; bazı Anki tuşları yoktur. Bkz. [Çalışma ekranı](05-studying.md). |
| **İlerlemeyi sıfırla** | Ayarlar'daki bu komut Anki'deki gibi tek tek kartları değil, koleksiyonun tamamını siler. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#reset-progress). |

Yalnızca TusAnkiM'de olanlar: hazır [TUS Kartları paketi](17-tus-card-pack.md),
[Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md), deste kısayolları ve
`tusankim://` bağlantılarıyla [otomasyon](18-shortcuts-and-automation.md).

<a id="limits"></a>
## Dosya sınırları

- Deste veya koleksiyon paketi: en fazla 400 MB; tek bir medya dosyası en fazla 100 MB.
- Metin dosyası: en fazla 50 MB. Dosya UTF-8 olarak kaydedilmiş olmalıdır; başka bir kodlamayla
  kaydedilen dosyalarda Türkçe harfler bozuk görünür.

Çok büyük paketlerin içe aktarılması birkaç dakika sürebilir; bu sırada uygulamayı açık tutun.

## İlgili konular

- [İçe ve dışa aktarma](14-import-export.md)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [Sık sorulanlar ve sorun giderme](20-faq.md)
