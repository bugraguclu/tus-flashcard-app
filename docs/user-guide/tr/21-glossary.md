---
id: glossary
title: Sözlük
summary: Uygulamadaki Türkçe terimler, İngilizce arayüzdeki ve Anki'deki karşılıkları ve kısa açıklamaları.
order: 21
web_path: /yardim/sozluk
app_help: help?article=glossary
app_screens:
  - "Yardım merkezi — app/help.tsx (yeni)"
verified_against: master c6108e6 (2026-10-25)
---

# Sözlük

Bu sayfa uygulamada gördüğünüz terimleri, İngilizce arayüzdeki adlarıyla birlikte açıklar.
İngilizce adlar çoğunlukla Anki'deki terimlerle aynıdır; Anki kaynaklarında aradığınız şeyi bulmak
için de kullanabilirsiniz.

<a id="basics"></a>
## Temel terimler

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Not | Note | Bir bilginin kendisi; alanlardan oluşur. Bkz. [Temel kavramlar](02-key-concepts.md#notes-and-cards). |
| Alan | Field | Notun bir parçası, örneğin **Ön** ve **Arka**. |
| Kart | Card | Notun çalışırken gördüğünüz hâli. Bir not birden fazla kart üretebilir. |
| Kardeş kart | Sibling | Aynı nottan üretilen kartlar. |
| Not türü | Note type | Notun alanlarını ve hangi kartların üretileceğini belirler. Bkz. [Not türleri](09-note-types.md). |
| Kart türü, şablon | Card type, template | Bir not türünün kart üretme kalıbı; ön ve arka yüzün nasıl görüneceği. |
| Deste | Deck | Kart grubu. |
| Alt deste | Subdeck | Bir destenin içindeki deste; adında `::` bulunur. |
| Koleksiyon | Collection | Cihazınızdaki bütün desteler, notlar, kartlar ve geçmiş. |
| Etiket | Tag | Notlara verdiğiniz serbest etiket; `::` ile iç içe olabilir. |
| Bayrak | Flag | Bir karta koyduğunuz renkli işaret (Kırmızı, Turuncu, Yeşil, Mavi, Pembe, Turkuaz, Mor). |
| İşaret, Notu işaretle | Mark, Mark note | Notu öne çıkarır; `marked` etiketi olarak saklanır. |
| Ayar grubu | Preset | Birden çok desteye aynı çalışma ayarlarını veren grup. Bkz. [Deste seçenekleri](06-deck-options.md#presets). |
| Zamanlayıcı | Scheduler | Kartın ne zaman yeniden geleceğini hesaplayan yöntem: klasik veya FSRS. |
| Varsayılan | Default | Uygulamayla gelen deste. Adı İngilizce arayüzde de "Varsayılan" görünür. |

<a id="card-states"></a>
## Kart durumları

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Yeni | New | Hiç görülmemiş kart. İstatistiklerde **Görülmemiş** (Unseen) olarak da geçer. |
| Öğrenme | Learning, Learn | Kısa adımlarla öğrenilmekte olan kart. |
| Tekrar (kart) | Review | Öğrenilmiş, vadesi gelen kart. Cevap düğmesi olan **Tekrar** ile karıştırmayın. |
| Yeniden öğrenme | Relearning | Tekrarda unutulup yeniden kısa adımlarla çalışılan kart. |
| Genç / Olgun | Young / Mature | Aralığı 21 günden kısa / en az 21 gün olan tekrar kartı. |
| Askıya alınmış, Askıda | Suspended | Siz geri açana kadar gösterilmeyen kart. |
| Gömülü | Buried | Yalnızca bugün için kenara konmuş kart. |
| Unutma | Lapse | Tekrar kartında **Tekrar** düğmesine basılması. |
| Sürekli Unutulan Kart | Leech | Çok kez unutulan kart. Bkz. [Deste seçenekleri](06-deck-options.md#lapses). |

<a id="studying"></a>
## Çalışma

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Çalış, çalışma ekranı | Study, study screen | Kartları cevapladığınız ekran. Bkz. [Çalışma ekranı](05-studying.md). |
| Klasik / Yeni çalışma ekranı | Classic / New study screen | Çalışma ekranının iki görünümü. |
| Cevabı göster | Show Answer | Kartın cevap yüzünü açar. |
| Tekrar / Zor / İyi / Kolay | Again / Hard / Good / Easy | Cevap düğmeleri. Bkz. [Temel kavramlar](02-key-concepts.md#answer-buttons). |
| Geri al / Yinele | Undo / Redo | Son cevabı veya işlemi geri alır / yeniden uygular. |
| Göm | Bury | Kartı bugünlük kenara koyar. |
| Askıya al / Askıdan çıkar | Suspend / Unsuspend | Kartı çalışmadan çıkarır / geri alır. |
| Araçlar | Tools | Çalışma ekranındaki kart ve not menüsü. |
| Kart bilgisi | Card Info | Kartın geçmişi ve zamanlama bilgileri. Bkz. [Kartlarım ve arama](10-browser-and-search.md#card-info). |
| Zaman kutusu | Timebox | Belirli sürede bir mola soran çalışma bloğu. |
| Otomatik ilerleme | Auto Advance | Süre dolunca cevabı açan ve seçilen işlemi yapan özellik. |
| Önceden öğrenme sınırı | Learn ahead limit | Sırada başka kart kalmayınca, vadesine az kalan öğrenme kartlarının erken gösterildiği süre. |
| Beklemeden çalış | Study Now | Bekleyen öğrenme kartını vaktinden önce açar. |
| Yazı tahtası | Whiteboard | Kartın üzerine çizim yapma alanı. |
| Metin okuma | Text to speech | Kart metnini sesli okur. |
| Bugünün kartları | Cards for Today | Bütün destelerden çalışırken başlıkta görünen ad. |
| Tebrikler! | Congratulations! | Bugünlük kartlar bitince görünen ekran. |
| Sonraki günün başlangıcı | Start of next day | Çalışma gününün değiştiği saat (varsayılan 04:00). |
| Çalışma serisi | Study streak | Art arda çalışılan gün sayısı. Bkz. [İstatistikler](12-statistics.md). |

<a id="deck-options-terms"></a>
## Deste seçenekleri

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Deste seçenekleri | Deck Options | Destenin ayar grubunu düzenlediğiniz ekran. Bkz. [Deste seçenekleri](06-deck-options.md). |
| Bu deste / Yalnızca bugün | This deck / Today only | Tekrar limitini yalnızca bu desteye kalıcı olarak / yalnızca bugün için değiştirir. |
| Günlük en fazla tekrar | Maximum reviews/day | Bir günde gösterilecek tekrar kartı sınırı. |
| Limitler en üst desteden başlasın | Limits start from top | Alt desteyi çalışırken üst destelerin sınırlarını da uygular. |
| Öğrenme adımları | Learning steps | Yeni kartın öğrenilirken yeniden gösterildiği kısa aralıklar, örneğin `1m 10m`. |
| Mezuniyet aralığı / Kolay aralığı | Graduating interval / Easy interval | Öğrenmeyi **İyi** / **Kolay** ile bitiren kartın ilk günlük aralığı. |
| Yeniden öğrenme adımları | Relearning steps | Unutulan kartın kısa tekrar adımları. |
| En az aralık | Minimum interval | Unutulan kartın alabileceği en kısa günlük aralık. |
| Sürekli unutulan kart eşiği | Leech threshold | Kaç unutmadan sonra kartın işaretleneceği. |
| Görüntüleme sırası | Display Order | Kartların hangi sırayla toplanıp gösterileceği. |
| Yeni / tekrar sırası | New/review order | Yeni kartların tekrarlarla karışık mı, önce mi, sonra mı geleceği. |
| Gömme | Burying | Kardeş kartların aynı gün gösterilmemesi. |
| Kolay günler | Easy Days | Seçtiğiniz günlerde tekrar yükünü azaltır (Normal / Azaltılmış / Yok). |
| En fazla aralık | Maximum interval | Bir kartın alabileceği en uzun aralık. |
| Başlangıç kolaylığı, Kolay bonusu, Zor aralık çarpanı, Aralık düzenleyici | Starting ease, Easy bonus, Hard interval multiplier, Interval modifier | Klasik zamanlayıcının çarpanları. |
| Hedeflenen hatırlama oranı | Desired retention | FSRS'in hedeflediği hatırlama olasılığı, örneğin 0,90. Bkz. [FSRS](07-fsrs.md). |
| Hafıza gücü, Zorluk, Hatırlanabilirlik | Stability, Difficulty, Retrievability | FSRS'in her kart için tuttuğu değerler. |
| Parametreleri optimize et | Optimize parameters | FSRS'i kendi tekrar geçmişinize göre ayarlar. |

<a id="cards-terms"></a>
## Kartlar ve düzenleme

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Not ekle / Kartı düzenle | Add note / Edit Card | Kart düzenleyici. Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md). |
| Temel | Basic | Ön ve arka alanlı, tek kart üreten not türü. |
| Temel (ve ters kart) | Basic (and reversed card) | İki yönlü iki kart üretir. |
| Temel (seçimli ters kart) | Basic (optional reversed card) | Ters kart yalnızca **Tersini Ekle** alanı doluysa üretilir. |
| Temel (yanıtı yazarak) | Basic (type in the answer) | Cevabı klavyeyle yazdığınız kart. |
| Boşluklu, boşluk doldurma | Cloze | Metindeki boşluklardan kart üreten not türü. |
| Sabitle | Pin (sticky field) | Yeni not eklerken alanın içeriğini korur. |
| Kartlarım | Card Browser | Bütün kartları aradığınız ve düzenlediğiniz ekran. Bkz. [Kartlarım ve arama](10-browser-and-search.md). |
| Desteyi değiştir | Change deck | Seçili kartları başka desteye taşır. |
| Not türünü değiştir | Change note type | Notları başka bir not türüne çevirir. |
| Yeniden konumlandır | Reposition | Yeni kartların sırasını değiştirir. |
| Vade tarihini ayarla | Set due date | Kartın ne zaman geleceğini elle belirler. |
| Şimdi derecelendir | Grade now | Kartı çalışma ekranını açmadan cevaplanmış sayar. |
| Kartları sıfırla | Reset cards | Seçili kartları yeniden yeni duruma getirir. |
| Boş kartlar | Empty Cards | Şablonu artık kart üretmeyen kartları bulup temizler. |
| Not türleri | Note Types | Not türlerini yönettiğiniz ekran. |

<a id="data-terms"></a>
## Veriler

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| İçe aktar / Dışa aktar | Import / Export | Dosyadan kart getirme / dosyaya kart yazma. Bkz. [İçe ve dışa aktarma](14-import-export.md). |
| Anki Deste Paketi (.apkg) | Anki Deck Package (.apkg) | Bir veya birkaç deste. İçe aktarınca koleksiyona eklenir. |
| Anki Koleksiyon Paketi (.colpkg) | Anki Collection Package (.colpkg) | Koleksiyonun tamamı. İçe aktarınca mevcut koleksiyonun yerine geçer. |
| Çalışma ilerlemesini içe aktar | Import any learning progress | Paketteki çalışma durumunu ve geçmişi de getirir. |
| Çalışma programını dahil et | Include scheduling information | Dışa aktarılan pakete çalışma durumunu ve geçmişi ekler. |
| İçe aktarma günlüğü | Import Log | İçe aktarmanın sonucunu listeler. |
| Yedek, Şimdi yedekle | Backup, Back Up Now | Koleksiyonun cihazdaki kopyası. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md). |
| Güvenlik yedeği | Safety backup | Riskli bir işlemden önce otomatik alınan yedek. |
| Kurtarma kopyası | Recovery copy | Hasarlı satırları olduğu gibi saklayan, doğrudan geri yüklenemeyen kopya. |
| Medyayı denetle | Check Media | Kullanılmayan ve eksik resim/ses dosyalarını bulur. |
| Veritabanını kontrol et | Check database | Koleksiyonu değiştirmeden denetler. |
| Onar ve optimize et | Repair and optimize | Önce yedek alır, sonra bozuk satırları onarır. |
| İlerlemeyi sıfırla | Reset progress | Koleksiyonun tamamını siler. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#reset-progress). |
| Kurtarılan Kartlar | (aynı ad) | Onarımın destesi kaybolan kartları koyduğu deste. |

<a id="app-terms"></a>
## Uygulamanın bölümleri

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| Desteler | Decks | Uygulamanın açılış ekranı. Bkz. [Desteler](04-decks.md). |
| Genel bakış | Overview | Bir destenin özet ekranı. |
| Filtrelenmiş deste | Filtered Deck | Bir aramaya uyan kartları geçici olarak toplayan deste. Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md). |
| Özel çalışma | Custom Study | Bir desteden ek çalışma oturumu açar. |
| İstatistik(ler) | Stats, Statistics | Bkz. [İstatistikler](12-statistics.md). |
| Kronometre | Stopwatch | Ders çalışma süresini ölçer. Bkz. [Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md). |
| Çalışma Takvimi | Study Calendar | Günlere göre çalışma oturumlarınız. |
| TUS Kartları | TUS Kartları (TUS Cards) | Hazır kart paketi. Bkz. [TUS Kartları paketi](17-tus-card-pack.md). |
| Kısayol oluştur | Create shortcut | Bir desteyi Apple Kestirmeler'e ekler. Bkz. [Kısayollar ve otomasyon](18-shortcuts-and-automation.md). |
| Ayarlar | Settings | Bkz. [Ayarlar](16-settings.md). |

<a id="units"></a>
## Süre kısaltmaları

| Kısaltma | Anlamı |
| --- | --- |
| `sn` | saniye |
| `dk` | dakika |
| `sa` | saat |
| `gün` | gün |
| `ay` | ay (yaklaşık 30 gün) |
| `yıl` | yıl |

Cevap düğmelerinin üstündeki aralıklar, sığan en büyük birimle ve tek ondalıkla yazılır: 90 dakika
`1.5sa`, 45 gün `1.5 ay` olarak görünür. Önünde `<` olan bir süre, öğrenme adımının önceden öğrenme
sınırı içinde kaldığını gösterir.

## İlgili konular

- [Temel kavramlar](02-key-concepts.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
