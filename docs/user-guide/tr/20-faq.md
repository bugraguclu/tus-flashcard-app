---
id: faq
title: Sık sorulanlar ve sorun giderme
summary: Kart gelmiyor, yanlış düğmeye bastım, telefon değiştiriyorum, Anki destesi açılmıyor gibi sık sorunların çözümleri.
order: 20
web_path: /yardim/sss
app_help: help?article=faq
app_screens:
  - "Yardım merkezi — app/help.tsx (yeni)"
  - "Hata ekranı — app/_layout.tsx (Beklenmeyen Bir Hata Oluştu)"
  - "Destek sayfası — docs/support.html (web sitesi)"
verified_against: master c6108e6 (2026-10-25)
---

# Sık sorulanlar ve sorun giderme

En sık karşılaşılan soruları ve çözümlerini burada topladık. Aradığınızı bulamazsanız sayfanın
sonundaki [Destek](#contact-support) bölümüne bakın.

<a id="studying"></a>
## Çalışma

<a id="no-cards-today"></a>
### Desteye dokundum ama kart gelmiyor, hemen "Tebrikler!" çıkıyor

Bu, o deste için bugün çalışılacak kart kalmadığı anlamına gelir. Olası nedenler:

- Destede yeni kart yok ve bugün vadesi gelen tekrar yok. Deste listesindeki sayılar sıfırsa durum
  budur.
- Tekrar kartları için günlük sınıra ulaştınız. Sınırı **Deste seçenekleri › Günlük limitler**
  bölümünden değiştirebilirsiniz. Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits).
- Kartlar askıya alınmış veya bugün için gömülmüş olabilir. **Kartlarım** ekranında bu kartları
  bulup geri açabilirsiniz. Bkz. [Kartlarım ve arama](10-browser-and-search.md).

Yine de çalışmak istiyorsanız desteye bir **Özel çalışma** oturumu açın (deste satırının **•••**
menüsü). Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).

<a id="new-card-limit"></a>
### Günde kaç yeni kart çalışmalıyım?

TusAnkiM yeni kartlara günlük sınır koymaz; kararı size bırakır. Her yeni kart sonraki günlerde
tekrar olarak geri döner, bu yüzden bugün açtığınız yeni kartlar önümüzdeki haftaların tekrar
yükünü belirler. Birkaç gün boyunca aynı sayıda yeni kart çalışıp tekrar yükünüzü izleyin, sonra
artırın veya azaltın. [İstatistikler](12-statistics.md) ekranındaki tahmin grafiği bu konuda yol
gösterir.

<a id="midnight"></a>
### Gece yarısını geçtim ama kartlarım hâlâ "bugün" sayılıyor

Uygulamada gün gece yarısı değil, **Sonraki günün başlangıcı** saatinde (varsayılan 04:00)
değişir. Saati **Ayarlar › İnceleme** bölümünden değiştirebilirsiniz. Bkz.
[Temel kavramlar](02-key-concepts.md#study-day).

<a id="card-came-back-soon"></a>
### Az önce cevapladığım kart birkaç dakika sonra yeniden geldi

Öğrenme aşamasındaki kartlar dakikalarla ölçülen kısa adımlarla tekrar edilir. Başka kart
kalmadığında uygulama, birkaç dakika içinde vadesi gelecek bir öğrenme kartını beklemeden
gösterebilir (önceden öğrenme sınırı, varsayılan 20 dakika). Bu normaldir. Bkz.
[Çalışma ekranı](05-studying.md).

<a id="wrong-button"></a>
### Yanlış düğmeye bastım

Çalışma ekranının üst çubuğundaki geri alma düğmesine (kıvrık ok) dokunun; son cevabınız geri
alınır ve kart yeniden önünüze gelir. Birden çok kez dokunarak daha önceki işlemleri de geri
alabilirsiniz. Bkz. [Çalışma ekranı](05-studying.md).

<a id="leech-card"></a>
### Bir kartı sürekli unutuyorum

Kart defalarca unutulduğunda uygulama onu **Sürekli Unutulan Kart** olarak işaretler. Böyle bir
kartı daha kısa parçalara bölmek, bir örnek veya resim eklemek genellikle işe yarar. Kartı
düzenlemek için çalışma ekranından düzenleyiciyi açın. Bkz.
[Kart ekleme ve düzenleme](08-adding-and-editing.md) ve
[Deste seçenekleri](06-deck-options.md#lapses).

<a id="reminder-not-working"></a>
### Günlük hatırlatma gelmiyor

1. **Ayarlar › Bildirimler** bölümünde **Bildirimler** anahtarının açık olduğunu kontrol edin.
2. **Hatırlatma saati**'ni ve **Şu durumda bildir** seçeneğini kontrol edin. Hatırlatma, o saatte
   çalışılacak kart yoksa gelmeyebilir.
3. iPhone'un **Ayarlar › Bildirimler › TusAnkiM** bölümünde bildirimlere izin verildiğinden emin
   olun. **Bildirim izni gerekli** uyarısı görüyorsanız sorun budur.

Bkz. [Ayarlar](16-settings.md#notifications).

> **Web sürümünde:** Hatırlatma tarayıcı bildirimiyle gelir; tarayıcınızın bu site için bildirimlere
> izin vermesi ve sekmenin açık kalması gerekir.

<a id="cards"></a>
## Kartlar ve görünüm

<a id="images-missing"></a>
### İçe aktardığım destede resimler veya sesler görünmüyor

Paket medya olmadan dışa aktarılmış olabilir. Paketi hazırladığınız uygulamada medyayı dahil etme
seçeneğini açıp yeniden dışa aktarın, sonra yeniden içe aktarın; kartlar çoğalmaz. Hangi
dosyaların eksik olduğunu görmek için **Yedekler** ekranındaki **Medyayı denetle** düğmesini
kullanın. Bkz. [İçe ve dışa aktarma](14-import-export.md) ve
[Yedekler ve bakım](15-backups-and-maintenance.md#check-media).

<a id="card-looks-plain"></a>
### Paylaşılan bir destenin kartları Anki'deki gibi görünmüyor

Bazı paylaşılan destelerin şablonlarında JavaScript kodu bulunur. TusAnkiM güvenlik için bu kodu
çalıştırmaz; kart sade hâlde görünebilir. Matematik formülleri (MathJax/LaTeX) de işlenmiş hâlde
gösterilmez. Bkz. [Anki ile birlikte kullanma](19-using-with-anki.md#differences).

<a id="text-size"></a>
### Kart yazıları çok küçük veya çok büyük

**Ayarlar › Erişilebilirlik › Kart** bölümündeki **Kart yakınlaştırma** ile kart metnini, **Görsel
yakınlaştırma** ile resimleri %50–%200 arasında büyütüp küçültebilirsiniz. Bkz.
[Ayarlar](16-settings.md).

<a id="find-a-card"></a>
### Bir kartı bulamıyorum

Alt çubuktan **Kartlarım** ekranını açın ve arama kutusuna kartın içinden bir kelime yazın. Deste,
etiket veya bayrağa göre de daraltabilirsiniz. Bkz. [Kartlarım ve arama](10-browser-and-search.md).

<a id="data"></a>
## Verileriniz

<a id="new-phone"></a>
### Telefon değiştiriyorum; kartlarımı nasıl taşırım?

1. Eski telefonda **⋮ › Dışa aktar** ekranını açın ve bütün desteler seçiliyken
   **Anki Koleksiyon Paketi (.colpkg)** biçimiyle, **Medyayı dahil et** açık olarak dışa aktarın.
2. Dosyayı AirDrop, iCloud Drive veya bilgisayar üzerinden yeni telefona aktarın.
3. Yeni telefonda TusAnkiM'i kurun ve dosyayı **⋮ › İçe aktar** ile açın.

Koleksiyon paketi yeni telefondaki mevcut kartların yerine geçer; yeni kurulumda bu bir sorun
değildir. **TUS Kartları** paketi bu dosyaya girmez: yeni telefonda paketi
**Kartları ücretsiz aç** ile yeniden kurarsınız ve paket kartları yeni kart olarak başlar. Bkz.
[İçe ve dışa aktarma](14-import-export.md#move-to-new-device) ve
[TUS Kartları paketi](17-tus-card-pack.md#new-device).

<a id="sync"></a>
### Kartlarım iPhone ile bilgisayarım arasında eşitleniyor mu?

Hayır. TusAnkiM bütün verilerinizi yalnızca cihazınızda tutar; hesap, bulut veya eşitleme yoktur.
Kartları başka bir cihaza veya Anki'ye dosyayla taşırsınız. Bkz.
[Anki ile birlikte kullanma](19-using-with-anki.md#using-both).

<a id="delete-app"></a>
### Uygulamayı silersem ne olur?

Uygulamayı silmek cihazdaki bütün verilerini de siler: kartlar, tekrar geçmişi, ayarlar ve
uygulamanın kendi yedekleri. Silmeden önce koleksiyonunuzu **⋮ › Dışa aktar** ile bir `.colpkg`
dosyası olarak **Dosyalar** uygulamasına veya bilgisayarınıza kaydedin.

<a id="undo-import"></a>
### Yanlış bir dosyayı içe aktardım; geri dönebilir miyim?

Evet. Paketli her içe aktarmadan önce uygulama otomatik bir güvenlik yedeği alır.
**⋮ › Yedekten geri yükle** ile içe aktarmadan hemen önceki yedeği seçin. Bkz.
[Yedekler ve bakım](15-backups-and-maintenance.md).

<a id="reset-progress"></a>
### "İlerlemeyi sıfırla" ne yapar?

**Ayarlar › Veri yönetimi › Bakım › İlerlemeyi sıfırla**, tek tek kartları değil, koleksiyonun
tamamını siler: desteler, kartlar, tekrar geçmişi, Kronometre kayıtları ve uygulama ayarları.
Uygulama ilk kurulduğu gibi açılır. Önce geri yüklenebilir bir güvenlik yedeği alınır. Yalnızca
bazı kartları baştan almak istiyorsanız bunun yerine **Kartlarım** ekranında kartları seçip
**Kartları sıfırla…** komutunu kullanın. Bkz.
[Yedekler ve bakım](15-backups-and-maintenance.md#reset-progress).

<a id="turkish-characters"></a>
### İçe aktardığım metin dosyasında Türkçe harfler bozuk

Dosya UTF-8 dışında bir kodlamayla kaydedilmiş. Dosyayı Excel'de veya metin düzenleyicide
"CSV UTF-8" ya da "UTF-8" olarak yeniden kaydedin ve yeniden içe aktarın. Bkz.
[İçe ve dışa aktarma](14-import-export.md).

<a id="tus-pack"></a>
## TUS Kartları paketi

<a id="is-it-free"></a>
### TUS Kartları paketi ücretli mi?

Hayır. Paket bu sürümde ücretsizdir; hesap veya ödeme gerektirmez. Deste listesindeki
**TUS Kartları** satırına dokunup **Kartları ücretsiz aç** ile kurarsınız. Bkz.
[TUS Kartları paketi](17-tus-card-pack.md).

<a id="pack-content"></a>
### Paketteki bir kartta hata buldum

Kartı kendi kopyanızda düzenleyebilirsiniz. Hatayı bize bildirmek için [Destek](#contact-support)
bölümündeki yolu kullanın; kartın destesini ve ön yüzünü yazmanız işimizi kolaylaştırır.
Kartlar eğitim amaçlıdır; klinik karar için güncel kaynaklara başvurun.

<a id="problems"></a>
## Uygulama sorunları

<a id="error-screen"></a>
### "Beklenmeyen Bir Hata Oluştu" ekranı çıktı

1. **Tekrar dene**'ye dokunun. Çoğu zaman bu yeterlidir.
2. Olmazsa **Ana Ekrana Dön** ile deste listesine dönün.
3. Sorun sürüyorsa uygulamayı tamamen kapatıp yeniden açın.

Bize bildirmek isterseniz **Teknik detayları göster** ile açılan metni destek mesajınıza ekleyin.
Verileriniz bu ekrandan etkilenmez.

<a id="app-slow"></a>
### Uygulama yavaşladı veya arama tuhaf sonuçlar veriyor

1. **Ayarlar › Veri yönetimi › Bakım › Veritabanını kontrol et** ile koleksiyonunuzu denetleyin. Bu
   komut hiçbir şeyi değiştirmez, yalnızca sorun olup olmadığını söyler.
2. Sorun bulunursa veya arama hâlâ tuhafsa **Onar ve optimize et**'i çalıştırın. Komut önce
   denetler ve onayınızı ister; sonra güvenlik yedeği alır, bozuk kayıtları onarır ve arama
   dizinini yeniler.

Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#check-database).

<a id="contact-support"></a>
## Destek

Sorununuz burada yoksa web sitemizdeki **Destek** sayfasından bize ulaşın. Mesajınıza şunları
eklemeniz yardımcı olur:

- iPhone modeli ve iOS sürümü (veya web sürümünde tarayıcı adı),
- **Ayarlar › Hakkında** bölümünde "Sürüm" diye görünen uygulama sürümü,
- sorunun adımları ve varsa hata ekranındaki teknik ayrıntılar.

Kartlarınızı veya yedek dosyalarınızı göndermeniz gerekmez; istersek ayrıca sorarız.

## İlgili konular

- [Hızlı başlangıç](03-quick-start.md)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
- [Sözlük](21-glossary.md)
