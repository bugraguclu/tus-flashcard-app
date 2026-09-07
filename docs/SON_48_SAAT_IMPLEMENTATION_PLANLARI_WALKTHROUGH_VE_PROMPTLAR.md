# TusAnkiM — Son 72 Saatteki Geliştirme Süreci, Kullanıcı Promptları, Implementation Planları ve Walkthrough Raporu

**Rapor Dönemi:** 3 Eylül 2026, 14:00 – 6 Eylül 2026, 17:00 (Son 72+ Saat)  
**Hedef Platform:** iOS (iPhone öncelikli, Expo SDK 57 / React Native 0.86, SQLite / sql.js)  
**Referans Standartları:** Anki v3 Scheduler, AnkiMobile iOS Manual, FSRS-6 Specification, AGENTS.md Sözleşmesi  
**Oluşturulma Tarihi:** 6 Eylül 2026

---

## İÇİNDEKİLER

1. [Genel Bakış ve Yönetici Özeti](#genel-bakış-ve-yönetici-özeti)
2. [BÖLÜM 1: KULLANICI PROMPTLARI KRONOLOJİSİ (TAM METİNLER)](#bölüm-1-kullanici-promptlari-kronoloji̇si̇-tam-meti̇nler)
3. [BÖLÜM 2: DETAYLI IMPLEMENTATION PLANLARI](#bölüm-2-detayli-implementation-planlari)
   - [2.1. Filtrelenmiş Deste Önizleme Gecikmeleri ve 11 Sıralama Türü Paritesi](#21-filtrelenmiş-deste-önizleme-gecikmeleri-ve-11-sıralama-türü-paritesi)
   - [2.2. Çalışma Ekranı Sol Üst Geri Butonu ve Deste Listesi Navigasyonu](#22-çalışma-ekranı-sol-üst-geri-butonu-ve-deste-listesi-navigasyonu)
   - [2.3. Expo SDK 57 Yükseltmesi, Açık Tema Varsayılanı ve Uzaktan Test (Expo Go)](#23-expo-sdk-57-yükseltmesi-açık-tema-varsayılanı-ve-uzaktan-test-expo-go)
   - [2.4. Çalışma Takvimi (Study Calendar) ve Ders Bazlı Oturum Analizi](#24-çalışma-takvimi-study-calendar-ve-ders-bazlı-oturum-analizi)
   - [2.5. FSRS / Anki Parite Denetimi ve 4 Matematiksel Sapmanın Düzeltilmesi](#25-fsrs--anki-parite-denetimi-ve-4-matematiksel-sapmanın-düzeltilmesi)
   - [2.6. Zengin Metin Düzenleyici: Kelime İşlemci Tipi İmleç (Caret) Takibi ve Format Durumu](#26-zengin-metin-düzenleyici-kelime-işlemci-tipi-imleç-caret-takibi-ve-format-durumu)
   - [2.7. Çalışma Ekranında Aktif Deste Önceliği ve Alt Destelerin Otomatik Açılması](#27-çalışma-ekranında-aktif-deste-önceliği-ve-alt-destelerin-otomatik-açılması)
   - [2.8. Çalışma Bitiş Ekranı Canlı Geri Sayım Sayacı ve "Bu Deste" Ayarları Entegrasyonu](#28-çalışma-bitiş-ekranı-canlı-geri-sayım-sayacı-ve-bu-deste-ayarları-entegrasyonu)
   - [2.9. Deste İçe Aktarmada Metin ve Arayüz Düzenlemeleri](#29-deste-içe-aktarmada-metin-ve-arayüz-düzenlemeleri)
   - [2.10. Kart Ekle ve Ayarlar Ekranında Sahte "Değişiklikleri At" Uyarılarının Temizlenmesi](#210-kart-ekle-ve-ayarlar-ekranında-sahte-değişiklikleri-at-uyarılarının-temizlenmesi)
   - [2.11. Medya ve Bildirim İzinlerinde Doğrudan iOS Ayarlarına Yönlendirme Mimarisi](#211-medya-ve-bildirim-izinlerinde-doğrudan-ios-ayarlarına-yönlendirme-mimarisi)
   - [2.12. Anki iOS ile Birebir Uyumlu Dinamik Çoklu Alan (Multi-Field) Not Türü Mimarisi](#212-anki-ios-ile-birebir-uyumlu-dinamik-çoklu-alan-multi-field-not-türü-mimarisi)
   - [2.13. İçe Aktar Ekranı: DERS/KONU Temizliği, Not Türü Seçici, Alan Eşlemesi ve Önizleme](#213-içe-aktar-ekranı-derskonu-temizliği-not-türü-seçici-alan-eşlemesi-ve-önizleme)
   - [2.14. Kart Ekleme Klavye Kapatma, Fotoğraf Kırpma/Taşma ve Çizim Bozulması Çözümü](#214-kart-ekleme-klavye-kapatma-fotoğraf-kırpmataşma-ve-çizim-bozulması-çözümü)
   - [2.15. Deste Seçicide Yeni Deste Oluşturma Anında Otomatik Seçim ve Standartlaşma](#215-deste-seçicide-yeni-deste-oluşturma-anında-otomatik-seçim-ve-standartlaşma)
   - [2.16. Ses Oynatma Hızı Kalıcılığı (`audioPlaybackRate`) ve AirPlay İkonu Engelleme](#216-ses-oynatma-hızı-kalıcılığı-audioplaybackrate-ve-airplay-ikonu-engelleme)
   - [2.17. Flappy Plane / Bird Web Oyunu: Cehennem Modu, Ateş Efekti, Coin ve 30 Skor Mekik](#217-flappy-plane--bird-web-oyunu-cehennem-modu-ateş-efekti-coin-ve-30-skor-mekik)
   - [2.18. Gözden Geçirici Yazı Tahtası / Karalama Defteri (Whiteboard/Scratchpad) AnkiDroid Birebir Paritesi](#218-gözden-geçirici-yazı-tahtası--karalama-defteri-whiteboardscratchpad-ankidroid-birebir-paritesi)
   - [2.19. Etiket Seçici (`TagPickerModal`) iOS UX & Anki Hiyerarşi Paritesi](#219-etiket-seçici-tagpickermodal-ios-ux--anki-hiyerarşi-paritesi)
   - [2.20. Not Düzenleyici Araç Çubuğu Yatay Kaydırma Görsel İpucu ("Peek" Affordance)](#220-not-düzenleyici-araç-çubuğu-yatay-kaydırma-görsel-ipucu-peek-affordance)
   - [2.21. Deste Seçicide Hedef Belirleme ve Ambient Durum İzolasyonu](#221-deste-seçicide-hedef-belirleme-ve-ambient-durum-izolasyonu)
   - [2.22. Filtrelenmiş Deste .apkg Dışa Aktarımında Anki v3 Standartları](#222-filtrelenmiş-deste-apkg-dışa-aktarımında-anki-v3-standartları)
   - [2.23. Medya Dosyası Doğrudan Kopyalama ve Dosya Adı Güvenliği](#223-medya-dosyası-doğrudan-kopyalama-ve-dosya-adı-güvenliği)
   - [2.24. Uygulama İlk Açılışında Anlık Çalışma Ekranı Parlamasının Engellenmesi](#224-uygulama-ilk-açılışında-anlık-çalışma-ekranı-parlamasının-engellenmesi)
   - [2.25. Çalışma Ekranı Üst Çubuğundan Mükerrer Bilgi (ⓘ) Butonunun Temizlenmesi](#225-çalışma-ekranı-üst-çubuğundan-mükerrer-bilgi-i-butonunun-temizlenmesi)
   - [2.26. Kart Tarayıcısı: Eşit Boyutlu Seçim Barı Butonları, Bayrak Seçim Kalıcılığı ve Silik Metin Giderimi](#226-kart-tarayıcısı-eşit-boyutlu-seçim-barı-butonları-bayrak-seçim-kalıcılığı-ve-silik-metin-giderimi)
   - [2.27. Kart Tarayıcısı: "Bayrak Yok" Filtresinin Renkli Bayraklardan Ayrıştırılması](#227-kart-tarayıcısı-bayrak-yok-filtresinin-renkli-bayraklardan-ayrıştırılması)
   - [2.28. İçe Aktarma Günlüğü ve Diagnostik Raporlama Mimarisi](#228-içe-aktarma-günlüğü-ve-diagnostik-raporlama-mimarisi)
   - [2.29. Telifli TUS Katalog Notları ve Deste Koruması](#229-telifli-tus-katalog-notları-ve-deste-koruması)
   - [2.30. Boş Tuval Çizim Kağıdı Şablonları ve Kağıt Dokuları](#230-boş-tuval-çizim-kağıdı-şablonları-ve-kağıt-dokuları)
   - [2.31. Kart Tarayıcısı Arama Girişi Dikey Ortalama ve Standart Placeholder](#231-kart-tarayıcısı-arama-girişi-dikey-ortalama-ve-standart-placeholder)
   - [2.32. Kart Tarayıcısı Ultra-Kompakt Satır Geometrisi ve Alan Sıkılaştırması](#232-kart-tarayıcısı-ultra-kompakt-satır-geometrisi-ve-alan-sıkılaştırması)
   - [2.33. Çalışma Ekranı Boş ve Yeni Deste Başlık Çubuğu Güvencesi](#233-çalışma-ekranı-boş-ve-yeni-deste-başlık-çubuğu-güvencesi)
   - [2.34. Dahili TUS Kartlarının Dışa Aktarım, Taşıma ve Koleksiyon Yedekleme Koruması](#234-dahili-tus-kartlarının-dışa-aktarım-taşıma-ve-koleksiyon-yedekleme-koruması)
4. [BÖLÜM 3: DETAYLI WALKTHROUGH RAPORLARI (HAYATA GEÇİRİLEN DEĞİŞİKLİKLER)](#bölüm-3-detayli-walkthrough-raporlari-hayata-geçi̇ri̇len-deği̇şi̇kli̇kler)
5. [BÖLÜM 4: GİT COMMİT GEÇMİŞİ VE DOSYA DEĞİŞİKLİK DÖKÜMÜ](#bölüm-4-gi̇t-commi̇t-geçmi̇şi̇-ve-dosya-deği̇şi̇kli̇k-dökümü)
6. [BÖLÜM 5: TEST, TİP KONTROLÜ VE KALİTE KAPISI DOĞRULAMALARI](#bölüm-5-test-ti̇p-kontrolü-ve-kali̇te-kapisi-doğrulamalari)
7. [BÖLÜM 6: BAĞIMSIZ DOĞRULAMA BULGULARI (5-6 EYLÜL 2026)](#bölüm-6-bağimsiz-doğrulama-bulgulari-5-6-eylül-2026)
   - [6.1. Upstream'den birebir teyit edilen iddialar](#61-upstreamden-birebir-teyit-edilen-iddialar)
   - [6.2. Bulunan ve giderilen sapmalar](#62-bulunan-ve-giderilen-sapmalar)
   - [6.3. Belgede düzeltilen kayıt hataları](#63-belgede-düzeltilen-kayıt-hataları)
   - [6.4. Yazı Tahtası, Etiket Seçici, Editör ve Deste İzolasyonu Denetimi (6 Eylül 2026)](#64-yazı-tahtası-etiket-seçici-editör-ve-deste-i̇zolasyonu-denetimi-6-eylül-2026)
   - [6.5. Katalog Koruması, İçe Aktarma Günlüğü ve Çizim Tuvali Doğrulamaları (6 Eylül 2026)](#65-katalog-koruması-i̇çe-aktarma-günlüğü-ve-çizim-tuvali-doğrulamaları-6-eylül-2026)
   - [6.6. Kart Tarayıcısı Arama Ergonomisi, Ultra-Kompakt Satırlar ve Güvenlik Denetimi (6 Eylül 2026)](#66-kart-tarayıcısı-arama-ergonomisi-ultra-kompakt-satırlar-ve-güvenlik-denetimi-6-eylül-2026)

---

## GENEL BAKIŞ VE YÖNETİCİ ÖZETİ

Son 72 saat (3 Eylül 2026 14:00 – 6 Eylül 2026 17:00) içerisinde TusAnkiM projesinde olağanüstü genişlikte ve derinlikte bir geliştirme atılımı yapılmıştır. Çalışmalar 6 ana eksende yoğunlaşmıştır:

1. **AnkiMobile / Anki Desktop Birebir Parite ve Uyumluluk:**
   - Filtrelenmiş destelerde Anki v3'ün 11 arama sıralamasının (`relative overdueness` dahil) tamamlanması.
   - Önizleme gecikmelerinde (`preview delays`) Anki'nin gerçek 3 parametreli yapısına (`preview_again_secs`, `preview_hard_secs`, `preview_good_secs`) geçilmesi; gereksiz 4. eleman ve v2 dönemi kalıntılarının ayıklanması.
   - Çalışma ekranı sol üst butonunun doğrudan **Deste Listesi**'ne dönmesi (`AnkiMobile` davranışının eksiksiz kopyalanması).
   - FSRS-6 matematiksel spesifikasyonu ile yapılan derin parite auditinde 4 kritik sapmanın (parametre sınırları, deck-options sonrası fuzz tabanı, retrievability hesaplaması, tek sayılı lapse'lerde leech tavanı) giderilmesi.
   - İçe aktar ekranındaki Anki dışı "DERS" ve "KONU" alanlarının kaldırılarak saf Anki standardı "Tür (Note Type)", "Deste (Deck)", "Alan Eşlemesi (Field Mapping)" ve "Canlı Önizleme" mimarisinin kurulması.
   - Kart düzenleyicide kompakt 2 alanlı yapıdan AnkiMobile standardı dinamik çoklu alan (multi-field), alan bazlı pinleme ve ilk alanda anlık duplicate uyarısı mimarisine geçiş.

2. **iOS UX / Etkileşim Kusursuzlaştırması:**
   - Kart eklerken klavyenin ekrandan çıkmadan kapatılabilmesi (`blur`, interaktif kaydırma, toolbar dismiss butonu).
   - Kamera, mikrofon, galeri ve bildirim izinleri reddedildiğinde kullanıcının doğrudan iOS Ayarlar uygulamasına yönlendirilmesi (`promptPermissionSettings` + `Linking.openSettings()`).
   - Fotoğraf düzenleyicide güvenli alan (safe-area) sınırlarına tam oturan tuval boyutlandırması ve ekran dışına taşmanın önlenmesi.
   - Boş tuvale çizimde çift Base64 encode döngüsünün kaldırılarak doğrudan native `saveMediaFromUri` ile kaydedilmesi ve bozuk `?` ikonunun tamamen çözülmesi.
   - Deste seçici (`DeckPickerModal`) açıldığında çalışılan dersin en üste alınması, alt dallarının açık gelmesi ve diğer derslerin kapalı tutulması.
   - Deste seçicide yeni oluşturulan bir destenin anında tespit edilip otomatik seçilmesi.

3. **Öğrenme Analitiği ve Çalışma Takvimi:**
   - Bağımsız bir zamanlayıcıya ihtiyaç duymadan, mevcut `revlog` kayıtlarından üretilen Pazartesi başlangıçlı **Çalışma Takvimi (`app/study-calendar.tsx`)**.
   - Günlük toplam süre, 30 dakikalık boşluklarda oturum bölme, ders bazlı süre dağılımı ve filtreli deste kartlarının ana destelerine (`odid`) atfedilmesi.

4. **Kelimeleri İşlemci Seviyesinde Editör:**
   - Zengin metin düzenleyicinin WebView köprüsünün imleç (caret) konumunu harf harf dinleyerek araç çubuğunu Word gibi dinamik yakması/söndürmesi.
   - Başlık, alıntı ve kod bloklarının durumlarının doğru yansıması; kısmi seçimlerde araç butonunun söndürülerek tek basışta tüm seçime uygulanması.

5. **Ses ve Medya Kalıcılığı:**
   - Ses oynatma hızının (`audioPlaybackRate`) ayarlar ve veritabanı meta tablosu arasında çift yönlü kaydedilip korunması.
   - WebKit `<audio>` kontrollerindeki AirPlay simgesinin `disableRemotePlayback` ile engellenmesi.

6. **Flappy Plane / Bird Web Mini Oyunu:**
   - HTML5 Canvas & Web Audio API tabanlı oyunda seviye bazlı Cehennem Modu (Skor $\ge 20$), ekranı boğmayan akıcı alev/kıvılcım fizikleri, Coin sistemi ve 30 skora özel Altın Mekik kostümü.

7. **Yazı Tahtası / Karalama Defteri (Whiteboard) AnkiDroid Paritesi:**
   - Deste bazlı durum saklama (`lib/whiteboardSession.ts` - `MetaDB.whiteboardState` paritesi).
   - Kart geçişi haricindeki ara durumlarda (kuyruk yenileme, learn-ahead veya tamamlandı ekranı) çizimin silinmesini engelleyen akıllı ömür yönetimi (`shouldClearWhiteboardForCard`).
   - Çizim sürerken Auto Advance geçişinin duraklatılması ve kapanışta sürenin kaldığı yerden devamı (`shouldRunAutoAdvance`).
   - Çizim tuvalinin kart alanı (`cardStage`) ile sınırlandırılarak araç çubuğu ve alt butonların dokunulabilir kalması.

8. **Hiyerarşik Etiket Seçici (`TagPickerModal`) ve Editör Kaydırma İpucu ("Peek"):**
   - Anki'nin `::` hiyerarşik etiket yapısının görselleştirilmesi, arama temizleme ve tek tıkla "Hızlı Ekle" satırı.
   - Kompakt iPhone ekranlarında zengin metin araç çubuğunun 8.5 buton genişliğine ayarlanarak 9. butonun sağ kenarda yarım görünmesi ("peek") ve yatay kaydırma keşfedilebilirliğinin sağlanması.

---

## BÖLÜM 1: KULLANICI PROMPTLARI KRONOLOJİSİ (TAM METİNLER)

Aşağıda, son 48 saat içerisinde tarafınızdan iletilen tüm kullanıcı istemleri (promptlar), iletildiği tarih, saat ve ait olduğu konuşma oturumu ile birlikte listelenmiştir:

### 1. 3 Eylül 2026 (14:09 – 16:26) — iOS Paylaşımı & Expo Go Kurulumu
- **Konuşma ID:** `20e2aa73-f6d5-4869-85ca-51aa18074414`
- **Prompt 1 (14:09:18):**
  > `web değil ios paylaşacağım sadece.bu uygulamayı localde şehir dışındaki biriyle paylaşacam,arkadaşım uygulamada tesltler yapacak, tus sorularına bakıp kotrol edecek- kendi teknolojiden çok anlamıyor. en basit şekilde en son versiyonunu nasıl paylaşabilirm? sadece ios ve tamamen ücretsiz şekilde.`
- **Prompt 2 (14:12:02):**
  > `Sizin durumunuzda en basit ve tamamen ücretsiz yöntem: Expo Go + internet tüneli... bu seçenek hakkında ne diyorusın`
- **Prompt 3 (14:12:57):**
  > `Terminalde beliren QR kodu veya exp://... ile başlayan bağlantıyı arkadaşınıza gönderin... hayır ama ben onun localinde şimdiki versiyonun çalışmasını istiyorum bilgisayarım kapalıyken bile 7/24-`
- **Prompt 4 (14:15:59):**
  > `ama web ve ios farklı çalışıyor bazı noktalarda- davranışsal ve kod bazlı farklılıklar var- başka yöntem ne`
- **Prompt 5 (16:05:22):**
  > `expo go bana nası yapcam hem onun tarafı hem benim tarafım- çok detaylı anlat`
- **Prompt 6 (16:06:52):**
  > `bende brew var onla mı kurayım`
- **Prompt 7 (16:07:44):**
  > `okey gelsin sonra?`
- **Prompt 8 (16:10:39):**
  > `qr ı okuttum ve bu dedi` *(Görsel yüklendi: `media_1788441032686.png`)*
- **Prompt 9 (16:11:33):**
  > `1 yap`
- **Prompt 10 (16:22:47):**
  > `Ben bu köye sahip herkesin erişebilmesini istiyorum` *(Görsel yüklendi: `media_1788441758498.png`)*
- **Prompt 11 (16:23:35):**
  > `çöktü`
- **Prompt 12 (16:24:13):**
  > `Ben bu qr a sahip herkesin erişebilmesini istiyorum`
- **Prompt 13 (16:24:58):**
  > *(Görsel yüklendi: `media_1788441896005.png`)*
- **Prompt 14 (16:26:34):**
  > `yine aynı hatayı aldım`

---

### 2. 3 Eylül 2026 (16:06 – 16:12) — Alt Desteler ve UI İncelemesi
- **Konuşma ID:** `b569e190-98e7-4562-80cb-1c37c56e66e8`
- **Prompt 1 (16:06:21):**
  > `O alt deseler çok kötü gözüküyor burayı eskiden herhalde you olarak daha iyiydi bak bakalım eskiden tam profesyonel bio dizaynı var mı yoksa sen bunu düzelt.` *(Görsel yüklendi: `media_1788440760440.png`)*

---

### 3. 4 Eylül 2026 (16:28 – 16:30) — İçe Aktar Güvenliği ve Hedef Deste Davranışı
- **Konuşma ID:** `07655146-809d-44ff-a779-4d7118024b6b`
- **Prompt 1 (16:28:52):**
  > `içe aktar alanlarda html izin ver güvenlik açığı oluşturuyor mu?`
- **Prompt 2 (16:29:21):**
  > `hedef deste içe aktarda direkt boş varsayılan deste olarak aktaraın- ya da ankide nasılsa- bu ekranda +yeni deate dediğimde mevcut işleminiz için otomatik seçilir diyor ama otomatik seçmiyor, bunu ona göre yapalım`
- **Prompt 3 (16:29:43):**
  > `hedef deste içe aktadsa direkt boş varsayılan deste olarak aktaraın- ya da ankide nasılsa- bu ekranda +yeni deate dediğimde mevcut işleminiz için otomatik seçilir diyor ama otomatik seçmiyor, bunu ona göre yapalım- bunun gibi aynı davranışın olması gereken yerde çalışmayan kısım varsa onu düzelt`
- **Prompt 4 (16:30:17):**
  > `içe aktar deste seç ekranı birebir kart ekle- istatistik vs o ekrandaki gibi olsun`

---

### 4. 4 Eylül 2026 (16:32 – 16:39) — Çalışma Ekranında Aktif Deste Hiyerarşisi
- **Konuşma ID:** `2c19040e-09ec-4f7e-9bb4-0818aad38edd`
- **Prompt 1 (16:32:46):**
  > `çalışma ekranında hangi dersi çalışıyorsam yukarıda deste seç kısmında o ilk gelemli ve aynı tus kartlarının alt desteleri gibi açık olmalı- sadece çalışılan deste diğer alt desteker kapalı olmalı. bunu bütün bu davranışlarda olduğu gibi yap.`

---

### 5. 4 Eylül 2026 (16:33 – 23:30) — Çalışma Bitiş Ekranı, Geri Sayım ve Deste Ayarları
- **Konuşma ID:** `00e78931-83ac-4d15-93e7-fc6251e100c1`
- **Prompt 1 (16:33:43 / 23:24:07):**
  > `este öalışma bittiğinde - yarın oyomatik olarak göstericek fiyor. bu dememeli - süre dolunca gösterilecek demeli- ve süre count down olamlı. kaç kartın bu süre dolunca gçsterileceği de burada gösterilmeli.- bu ekranda limiti arttır’a yönlendirme ayarlara yönlendiriyor- bu ayar deste seçeneklerinde yazma açık şekilde yazma açık sayı klavyesi açı kşekilde olmalı.`
- **Prompt 2 (23:30:42):**
  > `ya bu ders çalışma ekranına da köşeye aynı i de ayarlar koyalım sağ üste- o da deste ayarlarını açsın ve otomatik bu destede seçeneği seçili olarak gelsin. kullanıcı o deste ile ilgili ayarları buradan klayca değiştirebilsin`

---

### 6. 4 Eylül 2026 (16:40) — Deste İçe Aktar Metinleri
- **Konuşma ID:** `e89c0fdc-3be9-46ff-94ce-a0999778bc8a`
- **Prompt 1 (16:40:36):**
  > `deste içe aktar metinlerini düzeltelim. ui oalrak tam profesyonel yapalım`

---

### 7. 4 Eylül 2026 (16:41 – 23:35) ve 5 Eylül (14:15) — İçe Aktar Ekranı Anki Standartları
- **Konuşma ID:** `dce08925-5760-4e24-8a2f-78f55f9c026b`
- **Prompt 1 (16:41:57 / 23:24:51):**
  > `içe aktar konu nasıl çalılıyor neden var?`
- **Prompt 2 (23:35:27):**
  > `içe aktar ekranında ders ne ayak?. içe aktar ekranı ankide nasıl tam görüntü bulsan süper. https://docs.ankiweb.net/intro.html Anki manuel- içeriğinde ankinin bütün fonksiyonlarının nasıl çalıştığı anlatılıyor ...`
- **Prompt 3 (14:15:30):**
  > `Anki'de OLMAYAN, ekranı bozan gereksiz kısımlar: ❌ DERS çipleri: Anki'de ders yoktur, deste vardır. ❌ KONU metin kutusu: Anki'de böyle bir kutu yoktur; sütun eşlemesi (Field Mapping) vardır. bunları kaldıralım. diğer kıısmları da anki ile eşleyelim- ankinin bu ekranından birebri emin ol ve bizimkini onla eşle.`

---

### 8. 4 Eylül 2026 (23:23 – 23:25) — Deste Seçici Eşitleme
- **Konuşma ID:** `07655146-809d-44ff-a779-4d7118024b6b`
- **Prompt 1 (23:23:37):**
  > `tekrar dene-içe aktar deste seç ekranı birebir kart ekle- istatistik vs o ekrandaki gibi olsun`
- **Prompt 2 (23:23:55):**
  > `bunun gibi - kart ekle- istatistik vs o ekrandaki gibi olmayan varsa onu da eşle`

---

### 9. 4 Eylül 2026 (23:25 – 23:25) — Sahte "Değişiklikleri At" Uyarılarının Kaldırılması
- **Konuşma ID:** `0a6cff98-d234-49f6-b651-798360fb02b4`
- **Prompt 1 (23:25:23):**
  > `-kart ekle ekranında bir değişiklik yapılamsa bile değişiklikleri at çıkıyor. bunu ve buna benzer değişiklik olmasa bile uyarı çıkan yerleri silelim. sadece seçili deste seçtim bunun için uyarı çıkmasn- ya da bunu gibi çok basit şeyelr için`
- **Prompt 2 (23:25:41):**
  > `benzer bu uyarı mantığı basit yerlerde çıkamsı için varsa onları da düzenle aynı şekilde`

---

### 10. 4 Eylül 2026 (23:26 – 23:27) ve 5 Eylül (14:10) — Klavye Kapatma, İzinler, Fotoğraf Düzenleyici ve Çizim Hatası
- **Konuşma ID:** `caeacc59-38d1-4c62-bc0c-b9a6088545db`
- **Prompt 1 (23:26:54):**
  > `-kart ekle kısmında ön veya arka kısmına yazı yazarken klavye açılıyor ve geri klavyeyi kart ekle ekranından çıkamdan kapatamıyorum.`
- **Prompt 2 (23:27:18):**
  > `galeriden fotoğraf ekle dedim- sonra yanlışlıkla izin verme dedim- sonra tekrar ekle diyince izin gerekli diyo- ama ben burada beni ayarlara izin verme ekranıan göndersin ya tekrar sadece izin gerekli demektensse-bu davranışın olduğu her yerde aynı düzeltmeyi yap. mesela ses ekle`
- **Prompt 3 (23:27:36):**
  > `-kart ekle -fotoğraf ekle ekranında fotoğrafı düzenle dediğinde ekran dışına taşıyor. ben mesela fotoğraf çek dedikten sona`
- **Prompt 4 (23:27:58):**
  > `-boş tuvale çiz dedim bir şeyler çizdim ve ? olarak geldi- çalışma ekranında da kontrol ettim ama yine ? işareti olarak geldi. fotoğraf gözükmedi bozuk geldi`
- **Prompt 5 (14:10:56):**
  > `devam et ve planı uygula`

---

### 11. 4 Eylül 2026 (23:28) ve 5 Eylül (14:10) — Ses ve Video Klibi Ekleyememe, "Erreur", Oynatma Hızı
- **Konuşma ID:** `afc9e1fd-116f-40ed-84bc-fa90d59eefb8`
- **Prompt 1 (23:28:34):**
  > `-kart ekle-ses kilibi ekle fonksiyonu çalışmıyor`
- **Prompt 2 (23:28:41):**
  > `kart ekle ses ekle dedim erreur diye eklendi ve burada başka cihazda oynat şeyi var. ses oynatma hızı seçme olsun.`
- **Prompt 3 (23:28:56):**
  > `-video kliib ekle özelliği de çalışmadı- Belki bu çalışmamalar ilk izin vermediğim için olabilir medyaya erişmesine izin vermediğimden galeriden foto seç kısmında- öyle olsa bile bıuralara o- ama ben burada beni ayarlara izin verme ekranıan göndersin ya tekrar sadece izin gerekli demektensse`
- **Prompt 4 (14:10:34):**
  > `devam et ve uygula`

---

### 12. 4 Eylül 2026 (23:34) ve 5 Eylül (14:08) — Anki iOS Not Türleri Birebir Eşleme
- **Konuşma ID:** `779d9448-b34d-4036-b09a-423bd2405d17`
- **Prompt 1 (23:34:06):**
  > `Not türleri ve kart ekle ekranındaki not türlerianki ile birebri aynı mı kontrol edelim. https://docs.ankiweb.net/intro.html ...`
- **Prompt 2 (14:08:10):**
  > `bu findigsleri tam profesyonel ekleyelim- anki ios ile birebir aynı olsun`

---

### 13. 5 Eylül 2026 (18:04 – 18:23) — Flappy Bird / Plane Mini Oyunu Geliştirmeleri
- **Konuşma ID:** `e05183c3-506c-4550-8f14-439ed583e5ed` & `5c1d25e2-6adb-45ea-8ade-c0700ebee0e5` & `b4113f1c-63a5-484c-8277-903b4ef9ca96`
- **Prompt 1 (18:04:38):**
  > `Flappy Bird HTML dosyası bunun içinde var mı?`
- **Prompt 2 (18:05:16):**
  > `❯ - "Kıl payı" bonusu: boruya çok yakın geçişte +₺ ve küçük bir slow-mo/parlama. Kod olarak ucuz, his olarak büyük fark., bi de çok iyi parayla alınmayan 40 skor için süper bi kostüm ve tasarım öner altından olsun. uzay mekiği ama cafcaflı. onun dışında tespit ettiğin hataları düzelt. tam profesyonel yap-hata yapma`
- **Prompt 3 (18:05:44):**
  > `Flappy Bird HTMLe bunu yap. ❯ 20 den sonra kırmızı arka plan hep kırmızı kalacak ve ateş çıksın alttan- arka plan müzüğideğişsin ve daha gergin olsun. bi de bize 200 tl at- tl olmasın da coin olsun ui olarak tam profesyonel yap bunları`
- **Prompt 4 (18:06:06):**
  > `flappy-❯ kostümleri iyileştirelim`
- **Prompt 5 (18:09:28):**
  > `altın mekiği sadece 30 skora ulaşan kazanabilsin sonra açılacak`
- **Prompt 6 (18:23:50):**
  > `Cehennem moduna bir kere geçince tekrardan oyuna başlayınca cehennem modunda kalıyor onu değiştir seviye bazlı olarak tetiklenmesi lazım sadece onun dışında cehennem modu ekranı çok kaplıyor onu birtık daha smooth hale getirelim.`

---

### 14. 5 Eylül 2026 (21:36 – 21:48) ve 6 Eylül (01:37 – 01:38) — İlk Açılış Ekranı Parlaması, Not Düzenleyici Araç Çubuğu "Peek" İpucu ve Etiket Seçici UI Revizyonu
- **Konuşma ID:** `cb73988e-d599-4439-bd3a-54a82c4b1420`
- **Prompt 1 (21:36:57):**
  > `uygulama ilk açılırken arka planda bi bütün dersleri çalıştınız çıkıyor çok kısa süre- sonra desteler ekranı geliyor- bunu kod tabanında doğrula sebebini bul ve düzelt`
- **Prompt 2 (21:43:50):**
  > `not elşe ekranında altta toll bar var ya text editi için . orada giriş kısmı yana kaydırılabiliyor- ama burada ekranda açılır açılmaz görünenler tam sığdığı içn kullanıcı yana kaydırabileceğini anlamaıyor. anlamas için oraya metin ve vurgu rengi kısmını yarısı sağa kayan şekilde mi yapsak böylece kullanıcı orayı kaydırabileceğini anlar- sen en mantıklı şekilde yap bunu`
- **Prompt 3 (01:37:41):**
  > `devam et`
- **Prompt 4 (01:38:59):**
  > `kart ekle ekrnaında etiketler kısmında search bar ve altatki x seçili yazını ui olarak uygulamanın bütünüyle eşleyelim şimdi küçük kalıyor`

---

### 15. 5 Eylül 2026 (20:55) ve 6 Eylül (01:39) — Yazı Tahtası / Karalama Defteri (Whiteboard) Sınırlandırması, Süre Bitiminde Çizim Koruma ve AnkiDroid Paritesi
- **Konuşma ID:** `0fc29eac-c9bd-45c8-a717-7a68cc465502`
- **Prompt 1 (20:55:39):**
  > `bu benzer davranışları her yerde uygula`
- **Prompt 2 (01:39:13):**
  > `-not elşe ekranında altta toll bar var ya text editi için . orada giriş kısmı yana kaydırılabiliyor- ama burada ekranda açılır açılmaz görünenler tam sığdığı içn kullanıcı yana kaydırabileceğini anlamaıyor. anlamas için oraya metin ve vurgu rengi kısmını yarısı sağa kayan şekilde mi yapsak böylece kullanıcı orayı kaydırabileceğini anlar- sen en mantıklı şekilde yap bunu`
- **Prompt 3 (01:39:44):**
  > `-yazı tahtasını etkinleştirdim ve iki soruya da yazı yazdım. bu yazı tahtası sorunun göründüğü dışına yazılmamalı- yazdıktan sonra çalışma süresi doldu ve yazdıklarım silinmişti. bunu düzeltelim- buna benzer problem nerde varsa düzeltelim.`

---

### 16. 6 Eylül 2026 (01:39) — Çalışma Ekranı Üst Çubuğundan Mükerrer Bilgi (ⓘ) Butonunun Kaldırılması
- **Konuşma ID:** `f48c4205-a393-47db-84e1-6a6fe1ee816a`
- **Prompt 1 (01:39:25):**
  > `-uygulama ilk açılırken arka planda bi bütün dersleri çalıştınız çıkıyor çok kısa süre- sonra desteler ekranı geliyor- bunu kod tabanında doğrula sebebini bul ve düzelt`
- **Prompt 2 (01:39:34):**
  > `-çalışma ekranındaki üsteki i bilgisi- tuş oarak olmayacak. 3 noktada altta var zaten.onu yukarıdaki o bardan çıkar`

---

### 17. 6 Eylül 2026 (01:40 – 01:41) — Kart Tarayıcısı: Eşit Boyutlu Seçim Barı, Bayrak Seçim Kalıcılığı, Silik Metin ve "Bayrak Yok" Filtresi Ayrımı
- **Konuşma ID:** `0d894c72-2413-4904-9a4f-1922a9383231`
- **Prompt 1 (01:40:35):**
  > `-kartlarım ekranında tümünü seç var ve burada bunu seçince yanda çıkan seçenklerin boyutları ve hizalamaları birbirinden farklı. hepsi aynı boyutta olacak.`
- **Prompt 2 (01:41:03):**
  > `-kartlarım ekranında tümünü seç var ve burada bunu seçince yanda bayrak seçiyorum ve hepsi işaretleniyor ama sonra 0 kart seçili oluyor geir- aynı hepsi seçili kalmaya devam etmeli.- sonrasında ise yukarıdaki görsel- 05.09.22.04 ss deki gibi silik oluyor- bunu da düzeltelim`
- **Prompt 3 (01:41:10):**
  > `-kartlarım ekranında sağ üst bayrağa göre seç’de bayrak yok filtresi de 1 bayrak olarak sçeiliyor o ayrı bir etiket olsun yani ben hem bayrak yok hem kırmızı bayrağı seçtiğimde tümü yıldızlı kısmında 2 bayrak etiketi çıkıyor bu yanlış.`

---

## BÖLÜM 2: DETAYLI IMPLEMENTATION PLANLARI

Bu bölümde, yukarıda listelenen kullanıcı promptları sonucunda tasarlanan teknik mimari planlar, root-cause (kök neden) analizleri ve çözüm stratejileri yer almaktadır.

---

### 2.1. Filtrelenmiş Deste Önizleme Gecikmeleri ve 11 Sıralama Türü Paritesi
- **Hedef:** `ankitects/anki` upstream v3 sözleşmesine tam uyum sağlamak.
- **Problem Analizi:**
  1. Eski kod, filtrelenmiş deste `preview_delays` alanını 4 elemanlı uydurma bir dizi sanıyordu (`[again, hard, good, easy]`). Ancak Anki'nin `decks.proto` tanımlamasında Easy butonunun önizleme gecikmesi yoktur; `preview_filter.rs` Easy cevabında kartı sabit sıfır gecikmeyle karşılar ve desteden çıkarır. Saklanan üç alan vardır: `preview_again_secs`, `preview_hard_secs` ve `preview_good_secs` — `Deck.Filtered` üzerinde sırasıyla 7, 5 ve 6 numaralı proto alanları olarak, yani sıra dışı numaralandırılmış hâlde. (Bu 7/5/6 sayıları **alan numaralarıdır, varsayılan değerler değildir**; varsayılanlar aşağıdaki teknik planda verilen `60 / 600 / 0` saniyedir.)
  2. Eski kod v2 döneminden kalma tek `preview_delay` alanını 1x/1.5x/2x oranlarıyla üç butona yayıyordu. Upstream'de böyle bir mantık yoktur; olmayan alan sıfır kabul edilir ve kart tek gösterimde tamamlanır.
  3. İkinci arama filtresinin varsayılan limiti 100 olarak girilmişti. Anki'nin `Deck::new_filtered` constructor'ı iki arama terimi tohumlar: birincisi 100 kart / Rastgele (Random) sırayla, ikincisi kasıtlı olarak daha küçük 20 kart / Vade (Due) sırayla. Asimetri upstream'de bilinçlidir — ikinci filtre bir "üstüne ekleme" (top-up) olarak tasarlanmıştır.
  4. Kart toplama sıralamasında Anki v3'ün 11 sıralama düzeni (0-10) eksiksiz desteklenmeli; 10. sıra olan "Göreceli Gecikme" (Relative Overdueness) eklenmelidir.
- **Teknik Plan:**
  - `lib/models.ts` ve `lib/filteredDeckOptions.ts` dosyalarında enum ve varsayılanları `60 600 0` (Again: 60s, Hard: 600s, Good: 0s - desteden çıkar) olarak güncellemek.
  - İkinci filtre limitini `20` yapmak.
  - Sıralama algoritmalarında kart ID'si yerine `not_id + template_order` bileşimini baz almak (aynı notun kartlarının bütünlüğünü korumak).
  - Vade sıralamasında gün bazlı review kartları ile saat bazlı learning kartlarını ortak bir zaman ölçeğinde eşitlemek.

---

### 2.2. Çalışma Ekranı Sol Üst Geri Butonu ve Deste Listesi Navigasyonu
- **Hedef:** AnkiMobile iOS çalışma ekranı navigasyon standardını uygulamak.
- **Problem Analizi:**
  - Çalışma ekranındaki sol üst ok butonu `router.back()` çağırıyordu. Bu durum çalışmanın nereden başlatıldığına bağlı olarak kullanıcıyı bazen deste genel bakışına, bazen kart tarayıcısına, bazen de ayarlar sayfasına fırlatıyordu.
  - AnkiMobile kılavuzunda açıkça belirtildiği üzere: *"If you wish to change to a different deck, you can do so by tapping the top left button"* ve tebrikler ekranında *"you can tap the top left button to return to the decks list"*. Butonun tek ve mutlak hedefi **Deste Listesi (`/(tabs)/decks`)** olmalıdır.
- **Teknik Plan:**
  - `app/(tabs)/index.tsx` içerisindeki geri butonunun eylemini `router.navigate('/decks')` rotasına bağlamak.
  - Tebrikler/tamamlama ekranındaki `‹ Destelere Dön` butonunu ve donanım klavyelerindeki `Escape` tuşunu aynı güvenli rotaya bağlamak.
  - Butonun erişilebilirlik etiketini Anki standardına uygun olarak `"Deste listesine dön"` yapmak.

---

### 2.3. Expo SDK 57 Yükseltmesi, Açık Tema Varsayılanı ve Uzaktan Test (Expo Go)
- **Hedef:** iOS bağımlılıklarını modernize etmek, React Native 0.86'ya geçmek ve teknik bilgisi olmayan test kullanıcılarına tünelli Expo Go ile anında test imkânı sunmak.
- **Problem Analizi:**
  - Kullanıcı şehir dışındaki arkadaşına uygulamayı test ettirmek istemekte, ancak Apple Developer üyeliği (99$/yıl) veya karmaşık TestFlight süreçlerine girmek istememektedir.
  - Expo SDK 54 eski kalmış; SDK 57 React Native 0.86 ile modern mimari ve performans kazanımları sunmaktadır.
- **Teknik Plan:**
  - `package.json` bağımlılıklarını Expo SDK 57'ye çekmek.
  - SDK 57 ile deprecated olan `StyleSheet.absoluteFillObject` kullanımlarını `StyleSheet.absoluteFill` ile değiştirmek.
  - `themeMode` varsayılanını temiz kurulumda `'light'` yapmak.
  - `package.json` içine `npm run share`, `npm run share:dev`, `npm run share:lan` ve `npm run share:ngrok` betiklerini (`node scripts/share-expo-go.mjs`) eklemek.
  - Arkadaşı için sıfır teknik bilgi gerektiren, tünel bağlantılı adım adım kurulum kılavuzunu hazırlamak.

---

### 2.4. Çalışma Takvimi (Study Calendar) ve Ders Bazlı Oturum Analizi
- **Hedef:** Kullanıcının çalışma geçmişini Pazartesi başlangıçlı bir ay/hafta takviminde ders bazlı oturumlarla görselleştirmek.
- **Problem Analizi:**
  - TUS hazırlığında kullanıcılar hangi gün ne kadar çalıştıklarını, hangi derse (Anatomi, Dahiliye vb.) kaç saat ayırdıklarını ve ne kadar mola verdiklerini görmek istemektedir.
  - Bu veri için yeni bir sayaç tutmak geçmiş veriyi yok sayar. Doğru yöntem, SQLite `revlog` (inceleme günlüğü) kayıtlarını geriye dönük analiz etmektir.
- **Teknik Plan:**
  - `lib/studyCalendar.ts` içinde saf fonksiyonlar tasarlamak:
    - `groupReviewsIntoSessions(reviews, maxGapMinutes = 30)`: 30 dakikadan uzun boşluklarda yeni oturuma bölme.
    - `Çalışma`: İncelenen kartların `time_taken` toplamı (üst sınır güvenlikli).
    - `Mola`: Oturum süresinden çalışma süresi çıkarılarak bulunan dinlenme payı.
    - Filtrelenmiş deste kartlarının `odid` (asıl deste kimliği) üzerinden ana dersine atanması; silinen desteler için kartın mevcut destesine falling back.
    - Koleksiyonun gün devri saati (`rolloverHour`) ve yerel saat dilimi/DST geçişlerine dayanıklı gün kovaları (buckets).
  - UI Katmanı: `app/study-calendar.tsx` rotası, grid takvim, haftalık özet kartları, ders dağılım barları ve oturum zaman çizelgesi.

---

### 2.5. FSRS / Anki Parite Denetimi ve 4 Matematiksel Sapmanın Düzeltilmesi
- **Hedef:** `docs/AUDIT_FSRS_ANKI_PARITY.md` denetiminde tespit edilen 4 matematiksel ayrışmayı Anki FSRS-6 standartlarına göre kapatmak.
- **Problem Analizi:**
  1. *Eğitim parametre sınırları:* Anki, yeniden öğrenme adımları arttıkça paylaşılan `w17/w18` tavanını düşürür ve kısa vadeli planlama açıkken `w19`'u 0.01'e sabitler. Biz her iki durumda da scheduling kutusuna clamp yapıyorduk.
  2. *Deste seçeneklerinde yeniden zamanlama fuzz tabanı:* Anki, `revlog`'dan okunan son geçen cevaptan önceki aralığı fuzz tabanı alır. Biz kartın güncel aralığını taban alıyorduk.
  3. *Retrievability hesaplama tutarsızlığı:* `fsrsCurrentRetrievability` unclamped parametrelerden türetiliyordu; bu yüzden gösterilen hatırlanabilirlik ile zamanlayıcınınki çelişebiliyordu.
  4. *Leech tek sayı eşik tavanı:* Anki `f32` bölmesi yaparak tek sayılı eşiklerde tavan (ceil) alır (örn. 3 eşiği 2 verir). Biz taban (floor) alıyorduk; bu da eşiği 1'e düşürüp her lapse'te leech eylemini tetikliyordu.
- **Teknik Plan:**
  - `clampFsrsParameters` fonksiyonuna preset şekli parametresini eklemek.
  - `lib/fsrsMaintenance.ts` içerisinde `revlog` üzerinden son geçen cevabın önceki aralığını çekip fuzz tabanı yapmak.
  - `fsrsCurrentRetrievability` fonksiyonunu clamped parametrelerle çalıştırmak.
  - `lib/noteManager.ts` leech yarım eşiğinde `Math.ceil(threshold / 2)` kuralına geçmek.
  - 15 satırlık Anki altın fuzz vektörlerini testle sabitlemek.

---

### 2.6. Zengin Metin Düzenleyici: Kelime İşlemci Tipi İmleç (Caret) Takibi ve Format Durumu
- **Hedef:** Not ekleme/düzenleme araç çubuğunun tıpkı Microsoft Word gibi imlecin bulunduğu yerdeki biçimlendirmeyi canlı olarak okuması ve buton durumlarını güncellemesi.
- **Problem Analizi:**
  - Araç çubuğu imlecin nerede olduğunu bilmiyordu. H1/H2/H3, Alıntı ve Kod Blokları butonları hiçbir zaman aktifleşmiyordu (`active state` yoktu).
  - Alanlar arasında gezinirken WebView odak kaybediyor ve araç çubuğu tamamen kararıp boşalıyordu.
  - Kısmen kalın (bold) bir metin seçildiğinde `queryCommandState` sadece başlangıca baktığı için butonu yanık gösteriyor, basınca tüm seçimi düzeltmek yerine ters etki yapıyordu.
- **Teknik Plan:**
  - `RichTextEditor.tsx` içine çift yönlü WebKit köprüsü kurmak: `selectionchange` olayında imlecin blok etiketi (`H1-H6`, `P`, `BLOCKQUOTE`, `PRE`), satır içi stilleri (`B`, `I`, `U`, `S`, `SUB`, `SUP`), liste derinliği ve hizalama bilgilerini yayınlamak.
  - `TreeWalker` ile kısmi seçim analizi yapmak; kısmi seçimlerde butonu "yarı aktif/sönük" işaretleyip bir sonraki dokunuşta tüm seçime stilin uygulanmasını sağlamak.
  - WebView dışındaki native butonlara basıldığında odak kalksa bile son bilinen format durumunu korumak (butonların sönmesini engellemek).
  - Biçim durum mantığını saf `lib/editorFormatState.ts` altında toplamak ve 144 satırlık birim testle güvenceye almak.

---

### 2.7. Çalışma Ekranında Aktif Deste Önceliği ve Alt Destelerin Otomatik Açılması
- **Hedef:** Çalışma ekranında üstteki deste seçiciye basıldığında çalışılan dersin en başta gelmesi ve alt destelerinin açık olması.
- **Problem Analizi:**
  - TUS hiyerarşisinde onlarca ders ve yüzlerce alt deste bulunmaktadır. Kullanıcı örneğin `TUS Kartları::Dahiliye::Kardiyoloji` çalışırken deste seçiciyi açtığında tüm ağaç varsayılan kapalı geliyor ve kullanıcının çalıştığı dersi arayıp elle genişletmesi gerekiyordu.
- **Teknik Plan:**
  - `lib/deckPickerExpansion.ts` içine `prioritizeDeckTree(nodes, activeDeckName)` algoritmasını yazmak:
    - Çalışılan dersi ait olduğu seviyede ilk sıraya (`index: 0`) taşımak; diğer kardeşlerin sıralamasını bozmamak.
  - `initialExpandedDeckNames` fonksiyonunu seçili dersin kendisini de içerecek şekilde genişletmek.
  - `DeckPickerModal` bileşenine `activeDeckName` desteği kazandırmak.
  - Çalışma ekranından (`app/(tabs)/index.tsx`) aktif kartın destesini tespit edip modala aktarmak.

---

### 2.8. Çalışma Bitiş Ekranı Canlı Geri Sayım Sayacı ve "Bu Deste" Ayarları Entegrasyonu
- **Hedef:** Çalışma bittiğinde "yarın otomatik gösterilecek" gibi hatalı ifadelerin kaldırılması, canlı geri sayım eklenmesi ve Deste Seçeneklerine doğrudan odaklanma.
- **Problem Analizi:**
  - Kartlar bittiğinde çıkan metin kafa karıştırıcıydı; gün devrinde kaç kartın açılacağı belli değildi.
  - "Limiti artır" butonu genel `/settings` sayfasına yönlendiriyordu, oysa günlük limitler Deste Seçenekleri (`/deck-options`) sayfasındaydı.
- **Teknik Plan:**
  - `lib/studyRepository.ts` içinde `upcomingCardsCount` hesaplayıcısı eklemek (öğrenme kartları veya gün devrinde açılacak kart adedi).
  - Çalışma ekranına canlı saniye geri sayım sayacı (`SS:DD:SS` formatında) eklemek; süre dolunca otomatik `buildQueue()` çalıştırmak.
  - "Limiti artır" butonunu `/deck-options?deckId=${targetDeckId}&focus=newLimit&scope=deck` rotasına bağlamak.
  - Deste Seçenekleri sayfasında `scope === 'deck'` ile doğrudan "Bu deste" sekmesini açmak ve sayısal klavyeyi (`number-pad`) ilgili girdi kutusunda otomatik odaklamak (`autoFocus`).
  - Çalışma ekranının sağ üst köşesine kalıcı **⚙️ Deste Ayarları** butonu ve aktif kart varken **ⓘ Kart Bilgisi** butonu eklemek.

---

### 2.9. Deste İçe Aktarmada Metin ve Arayüz Düzenlemeleri
- **Hedef:** İçe aktarma ekranındaki metin karmaşasını gidermek, profesyonel mobil tipografi ve hiyerarşi kurmak.
- **Teknik Plan:**
  - Başlıklar, butonlar, dosya tipi açıklamaları ve seçenek kutularını temizlemek.
  - `.apkg` ve metin dosyaları için ayrı, net rehber metinleri oluşturmak.

---

### 2.10. Kart Ekle ve Ayarlar Ekranında Sahte "Değişiklikleri At" Uyarılarının Temizlenmesi
- **Hedef:** Kullanıcı gerçek bir içerik değişikliği yapmadığında veya yalnızca deste seçtiğinde çıkan asılsız uyarıları ortadan kaldırmak.
- **Problem Analizi:**
  - `editorDraftKey` karşılaştırmasında `deckId` zorunlu tutuluyordu. Boş bir kart açıp sadece hedef deste seçildiğinde bile `isDirty = true` oluyordu.
  - WebKit açılışta veya alana dokunulduğunda `<p><br></p>`, `<br>`, `&nbsp;` gibi görünmez artefaktlar ekliyor; `trim()` bunları temizleyemediği için form kirli kalıyordu.
  - Ayarlar ekranı (`app/settings.tsx`) her dokunuşta diske anında kaydedilmesine rağmen `useUnsavedChangesGuard` nedeniyle çıkışta "Değişiklikler kaybolacak" diyebiliyordu.
- **Teknik Plan:**
  - `lib/editorDraft.ts` içerisine `isFieldContentBlank(value)` yardımcı fonksiyonu yazmak: HTML etiketlerini ve boşlukları atıp gerçek metin veya medya (`<img>`, `[sound:]`) yoksa alanı boş kabul etmek.
  - Kart ekleme modunda (`!isEditing`) alanlar boşsa deste seçiminin (`deckId`) taslağı kirli saymasını engellemek (`hasEditorDraftChanged -> false`).
  - Ayarlar ekranından `useUnsavedChangesGuard`'ı tamamen kaldırmak (çünkü ayarlar anında kaydedilmektedir).

---

### 2.11. Medya ve Bildirim İzinlerinde Doğrudan iOS Ayarlarına Yönlendirme Mimarisi
- **Hedef:** Kamera, mikrofon, galeri ve bildirim izinleri reddedildiğinde kullanıcının tekrar tekrar "İzin gerekli" uyarısıyla kilitlenmesini engellemek.
- **Problem Analizi:**
  - iOS güvenlik modeli gereği bir izin kullanıcı tarafından reddedildikten sonra uygulama içinden tekrar sistem izin penceresi tetiklenemez; kullanıcının iOS Ayarlar -> TusAnkiM ekranına gitmesi şarttır.
- **Teknik Plan:**
  - Merkezi `lib/permissions.ts` modülü oluşturmak: `promptPermissionSettings(title, message)` fonksiyonunu yazmak.
  - Alert içinde "Vazgeç" ve "Ayarları Aç" (`Linking.openSettings()`) butonları sunmak.
  - `MediaAttachButton.tsx` (galeri, kamera, video), `AudioRecordModal.tsx` (mikrofon) ve `settings.tsx` (hatırlatıcı bildirimleri) çağrılarına entegre etmek.

---

### 2.12. Anki iOS ile Birebir Uyumlu Dinamik Çoklu Alan (Multi-Field) Not Türü Mimarisi
- **Hedef:** Sabit 2-3 alanlı eski editörü AnkiMobile standartlarında dinamik çoklu alan motoruna dönüştürmek.
- **Problem Analizi:**
  - Anki'de not türleri 2, 4, 10 veya daha fazla alana sahip olabilir. `.apkg` ile gelen tıbbi destelerde (örn. Anatomy: Image, Question, Answer, Clinical Note, Mnemonics) 5-6 alan sıkça kullanılır.
- **Teknik Plan:**
  - `lib/editorDraft.ts` ve `lib/editorStickyFields.ts` yapılarını `fields: string[]` destekleyecek şekilde genelleştirmek.
  - `app/editor.tsx` içerisindeki statik giriş kutuları yerine `selectedNoteType.fields.map(...)` döngüsüyle dinamik alan renderı kurmak.
  - Her alan için bağımsız Sabitleme (Sticky Pin), Medya Ekleme ve RTL/Font uyarlaması sağlamak.
  - `NoteTypePickerModal` ile koleksiyondaki tüm not türlerini listelemek.
  - İlk alana yazı yazıldığında `findDuplicateNote` ile aynı türdeki mükerrer kartları anlık tespit edip sarı uyarı rozeti göstermek.

---

### 2.13. İçe Aktar Ekranı: DERS/KONU Temizliği, Not Türü Seçici, Alan Eşlemesi ve Önizleme
- **Hedef:** Resmi Anki Text/CSV Import standardını kurmak; legacy TUS "Ders" ve "Konu" kutularını yok etmek.
- **Problem Analizi:**
  - Anki'de "Konu" diye bir kavram yoktur; CSV içindeki sütunların kart alanlarına eşlenmesi (`Field Mapping`) vardır.
- **Teknik Plan:**
  - `app/import.tsx` üzerinden `subject` çipleri ve `topic` kutusunu kaldırmak.
  - En üste `Tür:` (`NoteTypePickerModal`) ve `Deste:` (`DeckPickerModal`) seçicilerini koymak.
  - Metin dosyası seçildiğinde ilk satırın sütunlarını analiz edip her sütun için hedef alan seçimi sunmak (`Ön`, `Arka`, `Etiketler` veya `Hiçbiri / Atla`).
  - Sütunların nasıl yerleşeceğini gösteren canlı **1. Satır Önizleme Kartı** eklemek.
  - `lib/importNotes.ts` içine `tagsColumn` desteği kazandırmak.

---

### 2.14. Kart Ekleme Klavye Kapatma, Fotoğraf Kırpma/Taşma ve Çizim Bozulması Çözümü
- **Hedef:** Kullanıcının bildirdiği 4 kritik iOS editör sorununu kökten çözmek.
- **Teknik Plan:**
  1. *Klavye Kapatma:* `RichTextEditor` içine `blur()` metodu enjekte etmek; `ScrollView`'a `keyboardDismissMode="interactive"` ve araç çubuğuna **Klavyeyi Kapat** butonu koymak.
  2. *İzin Yönlendirmesi:* `lib/permissions.ts` üzerinden "Ayarları Aç" bağlantısını devreye almak.
  3. *Fotoğraf Düzenleyici Taşması:* `useSafeAreaInsets()`, `minHeight: 0`, `overflow: 'hidden'` ve dinamik en-boy oranı ile tuvali ekrana tam sığdırmak.
  4. *Çizim Bozulması:* `captureRef` çağrısında `useRenderInContext: true` kullanmak; hatalı çift Base64 çevrimini kaldırıp geçici dosyayı doğrudan native `saveMediaFromUri` ile kopyalamak.

---

### 2.15. Deste Seçicide Yeni Deste Oluşturma Anında Otomatik Seçim ve Standartlaşma
- **Hedef:** Deste seçici modalında `+` ile yeni deste açıldığında bunun anında hedef olarak seçilmesini sağlamak ve tüm ekranları eşitlemek.
- **Problem Analizi:**
  - Yeni oluşturulan deste SQLite'a senkron yazılıyor ancak React component listesine henüz yansımamış oluyordu; arama eski listede yapıldığı için bulunamayıp fonksiyon sessizce çıkıyordu.
- **Teknik Plan:**
  - `DeckPickerModal` seçim akışında `getDeckByName(name) ?? deckPickerDecks.find(...)` fallback'i ekleyerek SQLite'tan anında taze desteyi çekmek ve seçmek.
  - İçe aktarma (`import.tsx`), deste seçenekleri (`deck-options.tsx`), filtrelenmiş deste seçenekleri (`FilteredDeckOptionsModal.tsx`), kart tarayıcısı (`browser.tsx`) ve istatistik (`stats.tsx`) ekranlarının tamamında `DeckPickerModal` kullanımını ve `activeDeckName` parametresini standartlaştırmak.

---

### 2.16. Ses Oynatma Hızı Kalıcılığı (`audioPlaybackRate`) ve AirPlay İkonu Engelleme
- **Hedef:** Ses klibi veya kaydı eklerken oluşan hataları gidermek, oynatma hızını kalıcı kılmak ve istenmeyen AirPlay kontrolünü kaldırmak.
- **Problem Analizi:**
  - WebKit'te ses kaydederken `fetch(uri)` yerel dosyalarda patlıyor ve 0 baytlık dosya oluşturup "Erreur" veriyordu.
  - Ses oynatıcıda istenmeyen AirPlay simgesi beliriyordu.
  - Seçilen ses oynatma hızı (`1x, 1.25x, 1.5x, 2x, 0.75x`) sonraki oturumlarda kayboluyordu.
- **Teknik Plan:**
  - `AudioRecordModal.tsx` içinde doğrudan `saveMediaFromUri` native dosya kopyalamasına geçmek.
  - `[sound:...]` şablon renderında `<audio controls disableRemotePlayback controlsList="nodownload">` kullanmak. (`noplaybackrate` bilinçli olarak eklenmedi: hız seçimi uygulamanın kendi hap butonuyla, `audioPlaybackRate` üzerinden yönetiliyor.)
  - `AppSettings` ve `DeckConfig` modellerine `audioPlaybackRate` alanını ekleyip veritabanında saklamak.
  - Ses oynatıcısının yanına interaktif hız seçici hap butonu yerleştirmek.

---

### 2.17. Flappy Plane / Bird Web Oyunu: Cehennem Modu, Ateş Efekti, Coin ve 30 Skor Mekik
- **Hedef:** Kullanıcının mini oyundaki atmosfer, denge ve ödül taleplerini profesyonelce yerine getirmek.
- **Teknik Plan:**
  - Cehennem modunu kalıcı `localStorage` bayrağından kurtarmak; sadece tur içinde skor $\ge 20$ olduğunda tetiklenen dinamik bir seviye haline getirmek.
  - Alev yüksekliğini taban seviyesine (~85-115px) çekmek; ekranı boğan kırmızı perde yerine %8 şeffaf sıcak vinyet uygulamak.
  - "Bize 200 Coin At" modalı ve coin ekonomisi kurmak.
  - Altın Mekik kostümünü parayla satın alınamaz yapmak ve yalnızca 30 rekor puana ulaşan oyuncular için kilit açılacak şekilde programlamak.

---

### 2.18. Gözden Geçirici Yazı Tahtası / Karalama Defteri (Whiteboard/Scratchpad) AnkiDroid Birebir Paritesi
- **Hedef:** AnkiDroid'in `whiteboardState` sözleşmesini uygulayarak deste bazlı çizim durumu saklama, kuyruk yenilemelerinde çizimi koruma ve iOS çalışma deneyimini kusursuzlaştırmak.
- **Problem Analizi:**
  - Anki Desktop/AnkiMobile'da dahili yazı tahtası yoktur; bu özellik `ankidroid/Anki-Android`'in `MetaDB.whiteboardState` tablosuna dayanır.
  - TusAnkiM'de önceki yazı tahtası her kart geçişinde veya kuyruk geçici olarak boşaldığında (learn-ahead countdown, timebox veya "all done" ekranı) unmount ediliyor ve kullanıcının çizimi geri alınamaz şekilde yok oluyordu.
  - Çizim yapılırken arkadaki kart boşta kalan bir kuyruk yenilemesi ile değişebiliyor ya da Otomatik İlerleme (Auto Advance) çizimi yok sayarak kartı geçiyordu.
- **Teknik Plan:**
  - `lib/whiteboardSession.ts` modülünü tasarlamak: Deste kimliğine (`deckId`) bağlı olarak `enabled`, `stylusOnly`, `lightPenColor`, `darkPenColor` alanlarını yönetmek.
  - Açık/koyu tema için ayrı kalem renkleri tanımlamak; koleksiyon dışa aktarımına dahil etmeden yerel `settings` tablosunda saklamak.
  - `lib/reviewerTimers.ts` içine `shouldClearWhiteboardForCard(inkedCardId, nextCardId)` fonksiyonunu eklemek: Sadece gerçek bir kart değişikliğinde (`nextCardId !== null && inkedCardId !== nextCardId`) tahtayı silmek; boş kuyruk (`null`) durumlarında çizimi korumak.
  - `shouldRunAutoAdvance` kontrolüne `drawingActive` bayrağı ekleyerek çizim sürerken otomatik geçişi askıya almak; çizim bitince dwell süresini sıfırlamadan kaldığı yerden sürdürmek.
  - Tuvali `cardStage` ile sınırlandırarak üst araç çubuğu ve alt cevap butonlarının çizim açıkken de tıklanabilir kalmasını sağlamak.

---

### 2.19. Etiket Seçici (`TagPickerModal`) iOS UX & Anki Hiyerarşi Paritesi
- **Hedef:** Anki'nin `::` hiyerarşik etiket ağacını görselleştirmek, hızlı etiket ekleme ve temizleme kontrolleri sunmak.
- **Teknik Plan:**
  - Etiket adındaki `::` derinliğine göre dinamik sol girintileme (`depth * 18px`) ve ` › ` ayırıcı formatı uygulamak.
  - Arama yapıldığında tam eşleşme yoksa doğrudan tek dokunuşla ekleme sağlayan "Hızlı Ekle" (`quickAddRow`) çubuğu sunmak.
  - iOS arama çubuğunda temizleme butonu (`×`), seçili etiket sayısını gösteren sayaç rozeti (`selectionBadge`) ve belirgin Onayla / Vazgeç butonları eklemek.
  - Büyük koleksiyonlarda animasyon takılmasını önlemek için etiket listesini `InteractionManager.runAfterInteractions` ile asenkron yüklemek.

---

### 2.20. Not Düzenleyici Araç Çubuğu Yatay Kaydırma Görsel İpucu ("Peek" Affordance)
- **Hedef:** iPhone dikey yöneliminde zengin metin araç çubuğunun yatay kaydırılabilir olduğunun sezgisel olarak anlaşılmasını sağlamak.
- **Teknik Plan:**
  - `app/editor.tsx` içinde ekran genişliğini (`screenWidth < 600`) dinamik okuyarak buton genişliklerini tam 8.5 buton sığacak şekilde (`screenWidth / 8.5`) ölçeklemek.
  - 9. butonun ekranın sağ kenarında tam yarım görünmesini ("peek") sağlayarak yatay kaydırma ipucu oluşturmak.

---

### 2.21. Deste Seçicide Hedef Belirleme ve Ambient Durum İzolasyonu
- **Hedef:** Deste seçici modalının çağıran ekranın niyetini koruması; ambient `useStudyScope` durumunun çağıranın açık parametrelerini ezmesini engellemek.
- **Teknik Plan:**
  - `DeckPickerModal.tsx` içerisinde `targetDeckName = activeDeckName || selectedDeckName || null` mantığını kesinleştirmek.
  - `app/browser.tsx` üzerinde toplu taşıma işleminde seçili kartların destesini (`selectedCardsDeckName`) öncelikli hedef deste olarak seçiciye iletmek.
  - `DeckExportSelector.tsx` bileşeninde `prioritizeDeckTree` ve `initialExpandedDeckNames` kullanarak dışa aktarma ağacını tutarlı kılmak.

---

### 2.22. Filtrelenmiş Deste .apkg Dışa Aktarımında Anki v3 Standartları
- **Hedef:** Filtrelenmiş destelerin `.apkg` paketlerine Anki v3 resmi sözleşmesiyle uyumlu yazılmasını sağlamak.
- **Teknik Plan:**
  - `lib/exportAnkiPackage.ts` içinde filtrelenmiş deste arama terimleri boş olduğunda `Deck::new_filtered` standartlarına (`DEFAULT_SEARCH_LIMIT = 100`, `DEFAULT_SECOND_SEARCH_LIMIT = 20`, `FILTERED_SEARCH_ORDER.random`) geri dönmek.

---

### 2.23. Medya Dosyası Doğrudan Kopyalama ve Dosya Adı Güvenliği
- **Hedef:** Çizim, ses veya fotoğraf kayıtlarının native dosya sistemi kopyalaması ile güvenli ve kayıpsız saklanması.
- **Teknik Plan:**
  - `lib/mediaStore.ts` içindeki `saveMediaFromUri` fonksiyonunu sanitize edilmiş dosya adını dönecek şekilde güncellemek (`Promise<string>`).
  - Native ortamda `fs.copyAsync` kullanarak büyük ses/resim dosyalarının Base64 döngüsüne girmeden anında hedefe kopyalanmasını sağlamak.

---

### 2.24. Uygulama İlk Açılışında Anlık Çalışma Ekranı Parlamasının Engellenmesi
- **Hedef:** Uygulama açılışında yaşanan kısa süreli Çalışma Ekranı ("Tüm kartlar tamamlandı") parlamasını kökten gidermek.
- **Problem Analizi:**
  - `app/(tabs)/_layout.tsx` dosyasında Stack navigator'da `initialRouteName` tanımlı değildi. Expo Router ilk rota olarak dosya sistemindeki `index.tsx`'i (Çalışma Ekranı) anlık monte ediyor, ardından `decks` rotasına yönleniyordu.
- **Teknik Plan:**
  - `app/(tabs)/_layout.tsx` içine `<Stack initialRouteName="decks">` parametresi verilerek başlangıç rotası açıkça Deste Listesi (`decks`) yapıldı ve `<Stack.Screen name="decks" />` ilk sıraya alındı.

---

### 2.25. Çalışma Ekranı Üst Çubuğundan Mükerrer Bilgi (ⓘ) Butonunun Temizlenmesi
- **Hedef:** Çalışma ekranının üst başlık çubuğunu ferahlatmak, AnkiMobile ile uyumlu sade tasarım kurmak.
- **Problem Analizi:**
  - Kart bilgi penceresi hem sağ üstteki ⓘ butonunda hem de alt çubuktaki 3 nokta menüsünde mevcuttu. Bu mükerrerlik üst çubuğu daraltıyordu.
- **Teknik Plan:**
  - `app/(tabs)/index.tsx` üst çubuğundan bağımsız ⓘ butonu kaldırıldı; sağ üst köşe sadece Deste Ayarları (⚙️) butonuyla sadeleştirildi.

---

### 2.26. Kart Tarayıcısı: Eşit Boyutlu Seçim Barı Butonları, Bayrak Seçim Kalıcılığı ve Silik Metin Giderimi
- **Hedef:** Kart tarayıcısında kart seçildiğinde çıkan alt çubuğu profesyonel simetriye kavuşturmak, bayrak atanması sonrası seçimin korunmasını sağlamak ve silik kart görünümünü düzeltmek.
- **Problem Analizi:**
  - Toplu işlem butonları (`Deste`, `Askıya Al`, `Bayrak`, `Daha Fazla`) asimetrik boyutlardaydı.
  - Kartlara bayrak atandığında `selectedCardIds` sıfırlanıyor ve seçili kart sayısı 0'a düşüyordu.
  - Askıya alınan veya işaretlenen kartların metinleri `opacity: 0.5` nedeniyle aşırı silik ve okunaksız kalıyordu.
- **Teknik Plan:**
  - `app/browser.tsx` içinde seçim aksiyon butonları sabit 60x52px boyutlu kutulara (`selectionActionIconBox`, `selectionActionText`) yerleştirilerek kusursuz hizalandı.
  - Bayrak atama işleminde seçim kümesi korunarak ardışık toplu işlemlere imkan tanındı.
  - `cardSuspended` stili `opacity: 1` yapılarak koyu ve açık temada metin netliği sağlandı.

---

### 2.27. Kart Tarayıcısı: "Bayrak Yok" Filtresinin Renkli Bayraklardan Ayrıştırılması
- **Hedef:** Bayrak filtreleme menüsünde bayraksız kartların (flag 0) renkli bayrak sayacını şişirmesini engellemek.
- **Problem Analizi:**
  - "Bayrak yok" filtresi de renkli bir bayrak gibi sayılıp "2 bayrak seçili" rozetine dahil ediliyordu.
- **Teknik Plan:**
   - Flag 0 için şeffaf içi boş halka ikonu (`filterFlagDotEmpty`, `menuFlagDotEmpty`) tanımladı.
  - Renkli bayrak filtreleri (`coloredFlagFilters`) ile bayraksız filtreleme akışı mantıksal olarak birbirinden ayrıldı.

---

### 2.28. İçe Aktarma Günlüğü ve Diagnostik Raporlama Mimarisi
- **Hedef:** Anki Desktop'ın içe aktarım sonrasında sunduğu kapsamlı tanı ve sonuç raporlama standardını TusAnkiM'e kazandırmak.
- **Problem Analizi:**
  - Paket veya CSV içe aktarıldığında yalnızca basit bir "başarılı" uyarısı çıkıyor; kaç kartın güncellendiği, hangi satırların geçersiz şablon nedeniyle atlandığı veya hangi alanların boş kaldığı kullanıcıya açıklanmıyordu.
- **Teknik Plan:**
  - `lib/importLog.ts` modülü geliştirildi: `ImportLogSummary`, `ImportLogEntry`, `createImportLog` ve metin/JSON dışa aktarım formatlayıcıları tanımlandı.
  - `components/ImportLogView.tsx` tam ekran/sheet bileşeni tasarlandı: Eklenen, güncellenen ve atlanan kartların sayısal rozetleri ile satır bazlı hata listesi sunuldu.
  - `app/import.tsx` akışına entegre edilerek işlem bittiğinde otomatik açılması sağlandı.

---

### 2.29. Telifli TUS Katalog Notları ve Deste Koruması
- **Hedef:** Uygulama ile gelen dahili TUS ders notlarının telif bütünlüğünü ve ders hiyerarşisini korumak; aynı zamanda kullanıcının kişiselleştirme özgürlüğünü kısıtlamamam.
- **Problem Analizi:**
  - Dahili koleksiyon kartları düzenleyicide açıldığında içeriği yanlışlıkla bozulabiliyor veya kartlar başka destelere taşınarak ders ağacının bütünlüğü bozulabiliyordu.
- **Teknik Plan:**
  - `lib/catalogProtection.ts` modülü oluşturuldu: `isCatalogCard`, `isCatalogNote`, `isCatalogDeck` belirleyicileri yazıldı.
  - `app/editor.tsx` içinde katalog kartları açıldığında metin alanları salt-okunur (`editable={false}`) yapıldı; üst kısma "🔒 Dahili TUS Kartı (İçerik Korumalıdır)" bilgilendirme rozeti yerleştirildi.
  - Kullanıcının bu kartlara kendi çalışma etiketlerini ve bayraklarını eklemesine izin verildi; deste değiştirme eylemi ise koruyucu uyarı ile sınırlandırıldı.

---

### 2.30. Boş Tuval Çizim Kağıdı Şablonları ve Kağıt Dokuları
- **Hedef:** Tıbbi anatomi çizimleri ve formül notları için gelişmiş kağıt arka planları (çizgili, kareli, noktalı, düz) sunmak.
- **Problem Analizi:**
  - Yalnızca düz beyaz tuval seçeneği vardı; bu durum oran gerektiren çizimlerde kullanıcıyı zorluyordu.
- **Teknik Plan:**
  - `lib/blankCanvasSetup.ts` ve `components/PaperSwatch.tsx` modülleri geliştirildi.
  - Düz (`plain`), çizgili (`ruled`), kareli (`grid`) ve noktalı (`dot`) kağıt desenleri SVG paternleri ile oluşturuldu; çözünürlük ve en-boy oranları iOS retina ekranlarına tam oturacak şekilde kalibre edildi.

---

## BÖLÜM 3: DETAYLI WALKTHROUGH RAPORLARI (HAYATA GEÇİRİLEN DEĞİŞİKLİKLER)

Bu bölümde, yukarıdaki planların kod tabanına nasıl işlendiği, dosya dosya yapılan somut geliştirmeler ve elde edilen sonuçlar sunulmaktadır.


### 3.1. Upstream Anki v3 Sıralama ve Önizleme Gecikmeleri Eşitliği
- **Dosyalar:** `lib/models.ts`, `lib/filteredDeckOptions.ts`, `lib/importApkg.ts`, `lib/deckManager.ts`, `components/FilteredDeckOptionsModal.tsx`, `app/(tabs)/index.tsx`.
- **Uygulanan Değişiklikler:**
  - Anki v3'ün 11 toplama sıralamasının tümü tanımlandı. 10 numaralı "Göreceli Gecikme" (Relative Overdueness) seçeneği arayüze ve sıralama motoruna eklendi.
  - `previewDelays` girdi alanı 3 elemanlı vektöre (`preview_again_secs`, `preview_hard_secs`, `preview_good_secs`) dönüştürüldü; varsayılan değerleri `60 600 0` olarak ayarlandı.
  - `.apkg` içe aktarımında alan eşleme hatası (5=Hard, 6=Good, 7=Again) düzeltilerek gerçek Anki destelerinin gecikmelerinin bozulması önlendi.
  - İkinci arama filtresinin varsayılan limiti `100`'den Anki standardı olan `20`'ye indirildi.

---

### 3.2. Çalışma Ekranı Deste Listesine Dönüş ve Undo İyileştirmesi
- **Dosyalar:** `app/(tabs)/index.tsx`, `components/CardOptionsMenu.tsx`.
- **Uygulanan Değişiklikler:**
  - Sol üst geri butonu, tebrikler ekranındaki ana eylem butonu ve donanım `Escape` tuşu mutlak olarak Deste Listesi rotasına yönlendirildi.
  - Son cevabı geri alma (`undoAnswer`) işlemi genişletilerek kartın cevabıyla birlikte gömülen kardeş kartların da eşzamanlı olarak kuyruğa döndürülmesi ve eklenen leech etiketinin kaldırılması sağlandı.

---

### 3.3. Modern Expo SDK 57 ve Paylaşım Altyapısı
- **Dosyalar:** `package.json`, `app.json`, `scripts/share-expo-go.mjs`.
- **Uygulanan Değişiklikler:**
  - Expo SDK 57 ve React Native 0.86 yükseltmesi tamamlandı.
  - `npm run share` komutu ile `@expo/ngrok` üzerinden güvenli internet tüneli kurularak şehir dışındaki kullanıcıların QR kod okutarak Expo Go üzerinden anında güncel sürümü test edebilmesi sağlandı.
  - Temiz kurulumlarda arayüz temasının varsayılanı açık tema (`light`) olarak belirlendi.

---

### 3.4. Çalışma Takvimi (Study Calendar) Modülü
- **Dosyalar:** `lib/studyCalendar.ts`, `lib/studyCalendar.test.ts`, `app/study-calendar.tsx`, `components/Sidebar.tsx`, `app/_layout.tsx`.
- **Uygulanan Değişiklikler:**
  - 385 satırlık bağımsız çalışma takvimi motoru geliştirildi.
  - 30 dakikadan uzun molalarda yeni oturum başlatan akıllı oturum bölücü yazıldı.
  - Filtreli deste çalışmalarını kartın asıl ait olduğu derse (`odid`) yansıtan mimari kuruldu.
  - Yan menüye (Sidebar) şık takvim ikonuyla "Çalışma Takvimi" bağlantısı eklendi.
  - 34 birim test ile farklı saat dilimleri, gün devri saatleri ve yaz/kış saati geçişleri (DST) doğrulandı.

---

### 3.5. FSRS-6 Dört Matematiksel Sapmanın Kapatılması
- **Dosyalar:** `lib/fsrs.ts`, `lib/fsrsMaintenance.ts`, `lib/fsrsMemory.ts`, `lib/fsrsOptimizer.ts`, `lib/noteManager.ts`, `docs/AUDIT_FSRS_ANKI_PARITY.md`.
- **Uygulanan Değişiklikler:**
  - Yeniden öğrenme adımları ve kısa vadeli planlama bayrağına duyarlı dinamik parametre sınırlandırıcı (`clampFsrsParameters`) entegre edildi.
  - Deste ayarları değiştiğinde yeniden zamanlama yapılırken kartın güncel aralığı yerine `revlog`'daki bir önceki aralık fuzz tabanı alındı.
  - `fsrsCurrentRetrievability` fonksiyonu clamped parametrelerle senkronize edildi.
  - Leech eşik kontrolünde `Math.ceil(threshold / 2)` matematiksel kuralı işletildi.

---

### 3.6. Kelime İşlemci Tipi İmleç Takip Eden Zengin Metin Düzenleyici
- **Dosyalar:** `lib/editorFormatState.ts`, `lib/editorFormatState.test.ts`, `lib/richTextCommands.ts`, `components/RichTextEditor.tsx`, `app/editor.tsx`.
- **Uygulanan Değişiklikler:**
  - WebView köprüsü üzerinden imlecin bulunduğu DOM bloğu (P, H1-H3, Blockquote, Pre) ve satır içi stilleri (Bold, Italic, Strikethrough, Sub/Sup) canlı dinlendi.
  - Kısmi seçimlerde butonların sönük kalması, tam kapsayan seçimlerde yanık kalması sağlandı.
  - Native butonlara tıklandığında odak kalksa bile biçim durumunun sıfırlanması önlendi.
  - Boş başlık veya alıntı satırında Enter'a basıldığında normal paragrafa dönme davranışı eklendi.

---

### 3.7. Çalışma Ekranında Aktif Deste Önceliği
- **Dosyalar:** `lib/deckPickerExpansion.ts`, `lib/deckPickerExpansion.test.ts`, `components/DeckPickerModal.tsx`, `app/(tabs)/index.tsx`.
- **Uygulanan Değişiklikler:**
  - `prioritizeDeckTree` algoritması yazıldı; çalışılan deste kök veya alt dalda fark etmeksizin en üst sıraya (`index: 0`) taşındı.
  - Çalışılan dersin alt desteleri doğrudan genişletilmiş (`expanded`) olarak sunulurken, diğer derslerin alt dalları kapalı tutuldu.

---

### 3.8. Çalışma Bitiş Canlı Geri Sayımı ve Deste Ayarları Butonu
- **Dosyalar:** `lib/studyRepository.ts`, `app/(tabs)/index.tsx`, `app/deck-options.tsx`, `components/CardOptionsMenu.tsx`.
- **Uygulanan Değişiklikler:**
  - Gün devrinde veya sayaç bitiminde sunulacak kart adedi hesaplanarak ekrana `"${upcomingCardsCount} kart süre dolunca gösterilecek."` metni konuldu.
  - Canlı geri sayım sayacı yerleştirildi; sayaç sıfırlandığında kuyruk otomatik yenilendi.
  - "Limiti artır" butonu `/deck-options?deckId=...&focus=newLimit&scope=deck` rotasına bağlandı; ilgili girdi alanına otomatik odaklanma ve sayısal klavye açılışı sağlandı.
  - Çalışma ekranının sağ üstüne **⚙️ Deste Ayarları** ve **ⓘ Kart Bilgisi** butonları entegre edildi.

---

### 3.9. Sahte / Gereksiz Uyarıların Temizlenmesi
- **Dosyalar:** `lib/editorDraft.ts`, `lib/editorDraft.test.ts`, `app/editor.tsx`, `app/settings.tsx`.
- **Uygulanan Değişiklikler:**
  - `isFieldContentBlank` fonksiyonu ile `<p><br></p>`, `<br>` ve `&nbsp;` gibi WebKit boşluk artefaktları temizlendi.
  - Boş kart ekleme modunda sadece deste seçildiğinde veya alanlara tıklanıp yazılmadan çıkıldığında uyarı çıkması engellendi.
  - Anında kaydedilen Ayarlar sayfasından `useUnsavedChangesGuard` tamamen kaldırılarak uyarısız ve akıcı çıkış sağlandı.

---

### 3.10. Medya İzinlerinde Doğrudan iOS Ayarlarına Yönlendirme
- **Dosyalar:** `lib/permissions.ts`, `lib/permissions.test.ts`, `components/MediaAttachButton.tsx`, `components/AudioRecordModal.tsx`, `app/settings.tsx`.
- **Uygulanan Değişiklikler:**
  - `promptPermissionSettings` merkezi yardımcısı kuruldu. İzin reddedildiğinde "Vazgeç" ve "Ayarları Aç" (`Linking.openSettings()`) seçenekleri sunuldu.
  - Galeri, kamera, video, mikrofon ve bildirim izinlerinin tamamında devreye alındı.

---

### 3.11. Dinamik Çoklu Alan Not Türü ve Kart Düzenleyici Mimarisi
- **Dosyalar:** `components/NoteTypePickerModal.tsx`, `lib/editorDraft.ts`, `lib/editorStickyFields.ts`, `lib/noteManager.ts`, `lib/editorDynamicFields.test.ts`, `app/editor.tsx`.
- **Uygulanan Değişiklikler:**
  - Not ekleme ekranı dinamik çoklu alan (multi-field) yapısına kavuşturuldu; koleksiyondaki tüm not türleri seçilebilir hale geldi.
  - Her alan için bağımsız Sabitleme (Pin) ve Medya Ekleme butonları yerleştirildi.
  - İlk alana metin girildiğinde aynı türdeki mevcut kartlar taranarak anlık duplicate uyarısı (`findDuplicateNote`) gösterildi.

---

### 3.12. İçe Aktar Ekranından DERS/KONU Temizliği ve Alan Eşlemesi
- **Dosyalar:** `components/NoteTypePickerModal.tsx`, `app/import.tsx`, `lib/importNotes.ts`, `lib/importNotes.test.ts`.
- **Uygulanan Değişiklikler:**
  - Eski prototipten kalma DERS çipleri ve KONU girdi kutusu tamamen silindi.
  - Üst kısma AnkiMobile standardında `Tür: [Not Türü ▾]` ve `Deste: [Hedef Deste ▾]` seçicileri konuldu.
  - Metin dosyaları için sütun bazlı dinamik **Alan Eşlemesi (Field Mapping)** ve **Canlı 1. Satır Önizlemesi** entegre edildi.
  - `tagsColumn` desteği ile dosyadaki bir sütunun doğrudan etiket olarak içeri alınması sağlandı.

---

### 3.13. Klavye Kapatma, Fotoğraf Kırpma Taşması ve Çizim Bozulması Düzeltmeleri
- **Dosyalar:** `components/RichTextEditor.tsx`, `app/editor.tsx`, `components/PhotoEditorModal.tsx`, `lib/mediaStore.ts`.
- **Uygulanan Değişiklikler:**
  - `RichTextEditor`'e WebView seviyesinde `blur()` fonksiyonu eklendi; sayfaya `interactive` kaydırma ile klavye kapatma ve araç çubuğuna klavye kapatma butonu eklendi.
  - `PhotoEditorModal`'da güvenli alan insets (`useSafeAreaInsets`) ve dinamik `stageLayout` kullanılarak tuvalin ekran dışına taşması önlendi.
  - "Boş tuvale çiz" seçeneğinde `useRenderInContext: true` kullanılarak yakalanan geçici dosya doğrudan `saveMediaFromUri` native dosya kopyalaması ile kaydedildi; bozuk `?` görseli hatası tamamen ortadan kaldırıldı.

---

### 3.14. Deste Seçicide Yeni Deste Oluşturma Standartlaşması
- **Dosyalar:** `app/import.tsx`, `app/editor.tsx`, `app/deck-options.tsx`, `components/FilteredDeckOptionsModal.tsx`, `app/(tabs)/decks.tsx`, `app/stats.tsx`, `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - `DeckPickerModal` içinde `+` butonuyla yeni deste açıldığında SQLite'tan senkron çekilerek anında seçilmesi sağlandı.
  - Tüm ekranlardaki deste seçici modal çağrıları `activeDeckName` ve hiyerarşik ağaç gösterimiyle eşitlendi.

---

### 3.15. Ses Oynatma Hızı Kalıcılığı ve AirPlay Engellemesi
- **Dosyalar:** `lib/types.ts`, `lib/storage.ts`, `lib/ankiDefaults.test.ts`, `lib/mediaStore.replacement.test.ts`, `app/settings.tsx`, `app/deck-options.tsx`, `components/CardWebView.tsx`.
- **Uygulanan Değişiklikler:**
  - `AppSettings` ve `DeckConfig` altına `audioPlaybackRate` (0.75x - 2.0x) eklendi ve ayarlar döngüsünde diske kaydedilmesi sağlandı.
  - HTML ses etiketlerinde `disableRemotePlayback` ve `controlsList="nodownload noplaybackrate"` kullanılarak AirPlay ikonu ve indirme menüsü engellendi.

---

### 3.16. Flappy Plane Mini Web Oyunu İyileştirmeleri
- **Dosyalar:** `flappy-plane/index.html` (tek dosyalık oyun), `flappy-plane/sw.js`, `flappy-plane/OKU-BENI.md`, `flappy-plane/calistir.command`.
- **Uygulanan Değişiklikler:**
  - Cehennem modu seviye bazlı hale getirildi; oyun sıfırlandığında (`reset()`) atmosfer ve müzik taze mavi gökyüzüne dönecek şekilde ayarlandı.
  - Zemin alevleri optimize edildi (~85-115px); vinyet şeffaflaştırılarak görüş alanı ferahlatıldı.
  - 200 Coin'lik tek seferlik açılış hediyesi eklendi (`GIFTS.welcome200`); cüzdana kalıcı olarak işlenir ve ana ekranda "HEDİYE +200" rozetiyle duyurulur.
  - Altın Mekik görünümü yalnızca 30 rekor skora ulaşan oyuncular için kilit açılacak şekilde programlandı.

---

### 3.17. Gözden Geçirici Yazı Tahtası / Karalama Defteri (Whiteboard/Scratchpad) AnkiDroid Birebir Paritesi
- **Dosyalar:** `lib/whiteboardSession.ts`, `lib/whiteboardSession.test.ts`, `components/WhiteboardOverlay.tsx`, `lib/reviewerTimers.ts`, `lib/reviewerTimers.test.ts`, `app/(tabs)/index.tsx`, `docs/ANKI_COMPATIBILITY.md`.
- **Uygulanan Değişiklikler:**
  - `lib/whiteboardSession.ts` modülü oluşturuldu; `MetaDB.whiteboardState` paritesi ile deste başına `enabled`, `stylusOnly`, `lightPenColor`, `darkPenColor` alanları `settings` tablosunda saklandı.
  - `WhiteboardOverlay.tsx` çalışma oturumu boyunca sürekli mount edilmiş tutuldu; kart geçişi haricindeki ara durumlarda (learn-ahead countdown, timebox veya tamamlama ekranı) çizimin silinmesi engellendi.
  - `lib/reviewerTimers.ts` içinde `shouldClearWhiteboardForCard(inkedCardId, nextCardId)` fonksiyonu ile yalnızca gerçek bir sonraki karta geçildiğinde çizimin sıfırlanması sağlandı.
  - Çizim yapılırken `shouldRunAutoAdvance` ile otomatik ilerleme askıya alındı, çizim kapandığında sayaç sıfırlanmadan kaldığı yerden devam ettirildi.
  - Tuval `cardStage` ile sınırlandırılarak araç çubuğu ve alttaki sabit cevap butonlarının çizim açıkken de tıklanabilir kalması sağlandı.

---

### 3.18. Etiket Seçici (`TagPickerModal`) iOS UX ve Anki Hiyerarşi Paritesi
- **Dosyalar:** `components/TagPickerModal.tsx`.
- **Uygulanan Değişiklikler:**
  - Anki'nin `::` hiyerarşik etiket ağacı derinliğine göre dinamik sol girintileme (`depth * 18px`) ve ` › ` formatı eklendi.
  - Arama kutusuna temizleme butonu (`×`), eşleşme olmadığında tek tıkla yeni etiket ekleyen `quickAddRow` satırı entegre edildi.
  - Seçili etiket sayısını gösteren sayaç rozeti (`selectionBadge`) ve belirgin Onayla / Vazgeç butonları eklendi.
  - `InteractionManager.runAfterInteractions` ile modal açılış animasyonunun binlerce etikette bile 60 FPS akıcı kalması sağlandı.

---

### 3.19. Not Düzenleyici Araç Çubuğu Yatay Kaydırma Görsel İpucu ("Peek" Affordance)
- **Dosyalar:** `app/editor.tsx`.
- **Uygulanan Değişiklikler:**
  - Dikey yöndeki kompakt telefon ekranlarında (`screenWidth < 600`) buton genişlikleri `screenWidth / 8.5` olarak dinamik boyutlandırıldı.
  - 9. butonun ekranın sağ kenarında tam yarım görünmesi ("peek") sağlanarak kullanıcının araç çubuğunun yatay kaydırılabilir olduğunu sezgisel olarak anlaması sağlandı.

---

### 3.20. Deste Seçicide Hedef Belirleme ve Ambient Durum İzolasyonu
- **Dosyalar:** `components/DeckPickerModal.tsx`, `components/DeckExportSelector.tsx`, `app/browser.tsx`, `app/(tabs)/decks.tsx`, `app/stats.tsx`, `components/FilteredDeckOptionsModal.tsx`, `app/(tabs)/_layout.tsx`.
- **Uygulanan Değişiklikler:**
  - `DeckPickerModal.tsx` içindeki `activeDeckName` prop'u önceliklendirildi; ambient durumla ezilmesinin önüne geçildi.
  - Kart tarayıcısında (`app/browser.tsx`) toplu kart taşıma modalı açıldığında, seçilen kartların destesi (`selectedCardsDeckName`) otomatik hedef olarak seçildi.
  - `DeckExportSelector.tsx` bileşeni `prioritizeDeckTree` ve `initialExpandedDeckNames` ile donatılarak aktif deste önceliklendirildi.
  - `app/(tabs)/_layout.tsx` üzerinde başlangıç rotası `initialRouteName="decks"` olarak sabitlendi.

---

### 3.21. Filtrelenmiş Deste .apkg Dışa Aktarımında Anki v3 Standartları
- **Dosyalar:** `lib/exportAnkiPackage.ts`.
- **Uygulanan Değişiklikler:**
  - `filteredDeckFields` fonksiyonunda boş kalan arama limit ve sıralama alanları için Anki'nin `Deck::new_filtered` sabitleri (`DEFAULT_SEARCH_LIMIT = 100`, `DEFAULT_SECOND_SEARCH_LIMIT = 20`, `FILTERED_SEARCH_ORDER.random`) kullanıldı.

---

### 3.22. Medya Dosyası Doğrudan Kopyalama ve Dosya Adı Güvenliği
- **Dosyalar:** `lib/mediaStore.ts`, `lib/mediaStore.replacement.test.ts`.
- **Uygulanan Değişiklikler:**
  - `saveMediaFromUri` fonksiyonu sanitize edilmiş dosya adını geriye dönecek şekilde güncellendi (`Promise<string>`).
  - Dosya kopyalama işleminde `fs.copyAsync` kullanılarak büyük ses/resim dosyalarının Base64 döngüsüne girmeden native hızda taşınması sağlandı ve birim testlerle kapsandı.

---

### 3.23. Uygulama Başlangıç Rotası ve Stack Navigasyon Düzeltmesi
- **Dosyalar:** `app/(tabs)/_layout.tsx`.
- **Uygulanan Değişiklikler:**
  - `<Stack initialRouteName="decks">` açıkça tanımlandı ve ekran sırası `<Stack.Screen name="decks" />`, `<Stack.Screen name="index" />` olarak belirlendi.
  - Uygulama ilk açıldığında doğrudan Deste Listesi'ni render ederek anlık Çalışma Ekranı ("Tüm kartlar tamamlandı") parlaması tamamen ortadan kaldırıldı.

---

### 3.24. Çalışma Ekranı Üst Başlık Çubuğu Sadeleştirmesi
- **Dosyalar:** `app/(tabs)/index.tsx`.
- **Uygulanan Değişiklikler:**
  - Sağ üstteki mükerrer ⓘ (Kart Bilgisi) butonu kaldırıldı.
  - Kart bilgisi ve diğer kart operasyonları AnkiMobile standardına uygun olarak alttaki 3-nokta menüsü altında toplandı; üst çubuk sadece Deste Ayarları (⚙️) butonuyla ferahlatıldı.

---

### 3.25. Kart Tarayıcısı Eşit Boyutlu Seçim Barı ve Seçim Durumu Kalıcılığı
- **Dosyalar:** `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - Alt seçim çubuğundaki eylem butonları (`Deste`, `Askıya Al`, `Bayrak`, `Daha Fazla`) `width: 60, height: 52` sabit boyutlu kutulara oturtularak simetrik hale getirildi.
  - Bayrak atandıktan sonra seçili kart kümesinin sıfırlanması engellendi; kartlar seçili kalmaya devam ederek ardışık işlem yapılabilmesi sağlandı.
  - `cardSuspended` stili `opacity: 1` olarak ayarlandı; kartların metinlerinin silik/yıkanmış görünmesi engellendi.

---

### 3.26. Kart Tarayıcısı "Bayrak Yok" Saydam Halka İkonu ve Ayrık Filtre Yönetimi
- **Dosyalar:** `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - Bayraksız kartlar için şeffaf halka (`filterFlagDotEmpty`) oluşturuldu.
  - "Bayrak yok" filtresi renkli bayrak sayacından ayrıştırıldı; `coloredFlagFilters` ile `hasNoFlagFilter` birbirinden bağımsız filtre çipleri ve temizleme butonları ile yönetildi.

---

### 3.27. İçe Aktarma Günlüğü (`ImportLogView`) ve Anki Uyumlu Hata Raporlaması
- **Dosyalar:** `components/ImportLogView.tsx`, `lib/importLog.ts`, `lib/importLog.test.ts`, `app/import.tsx`.
- **Uygulanan Değişiklikler:**
  - `lib/importLog.ts` modülü yazılarak içe aktarılan her satırın durumu (`added`, `updated`, `duplicate`, `skipped`, `error`) takip edildi.
  - `components/ImportLogView.tsx` modali oluşturuldu; işlem sonrasında özet sayaçlar ve detaylı log satırları kullanıcının incelemesine sunuldu.
  - Kullanıcının sorunlu satırları inceleyebilmesi için tam teşekküllü diagnostik raporlama kuruldu.

---

### 3.28. Dahili TUS Katalog İçeriklerinin Korumalı Düzenleyici Modu
- **Dosyalar:** `lib/catalogProtection.ts`, `lib/catalogProtection.test.ts`, `app/editor.tsx`, `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - `lib/catalogProtection.ts` ile katalog kartları ve desteleri tespit edildi.
  - `app/editor.tsx` içinde katalog kartları düzenlenirken metin kutuları salt-okunur yapıldı, koruma uyarısı gösterildi ve deste değiştirme engellendi; kişisel etiket ve bayrak ekleme korundu.
  - Kart tarayıcısında katalog kartlarının başka destelere taşınması koruyucu engelle sınırlandırıldı.

---

### 3.29. Çizim Editörü Çizgili/Kareli/Noktalı Kağıt Seçicisi (`PaperSwatch`)
- **Dosyalar:** `lib/blankCanvasSetup.ts`, `lib/blankCanvasSetup.test.ts`, `components/PaperSwatch.tsx`, `lib/blankCanvas.ts`.
- **Uygulanan Değişiklikler:**
  - Boş tuval çizim moduna 4 farklı kağıt dokusu (düz, çizgili, kareli, noktalı) eklendi.
  - SVG desenleri retina ekranlar için ölçeklenerek profesyonel tıbbi not defteri hissi sağlandı.
  - `lib/blankCanvasSetup.test.ts` ile kağıt geometri oranları doğrulandı.

---

### 3.30. Kart Tarayıcısı Arama Girişi Metin Dikey Konumlandırması ve Arama Metinleri
- **Dosyalar:** `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - `styles.searchInput` içindeki `paddingTop: 0, paddingBottom: 0` yapılarak iOS klavye girişinde metnin dikey olarak kutunun tam merkezine oturması sağlandı.
  - Arama placeholder'ı kullanıcının talebine uygun olarak `Ara veya deck:tag:is:…` ve not modunda `Not ara veya deck:tag:is:…` olarak güncellendi.
  - Arama temizleme butonu (`✕`) arama metni varken anında belirecek ve tek dokunuşla sorguyu sıfırlayacak şekilde optimize edildi.

---

### 3.31. Kart Tarayıcısı Kompakt Liste Geometrisi, Gap ve Padding Azaltımı
- **Dosyalar:** `app/browser.tsx`.
- **Uygulanan Değişiklikler:**
  - `cardItemCompact` stili `paddingVertical: 4, paddingHorizontal: 14` olarak güncellendi.
  - `listContentCompact` içindeki satır aralığı `gap: 3` seviyesine indirildi.
  - Kart soru metni, meta etiketleri, zamanlama bilgisi ve cevap özeti satırları için kompakt mod varyantları (`cardQuestionCompact`, `cardMetaCompact`, `cardTopicCompact`, `scheduleMetaCompact`, `answerSnippetCompact`) devreye alındı.
  - Seçim onay kutusu (`selectionCheckboxCompact`) 17x17px, düzenleme butonu (`editBtnCompact`) 24x24px boyutlarına ölçeklendi.
  - iPhone dikey görünümünde tek ekranda görülebilen kart sayısı 4-5 adetten 8-10 adede çıkarıldı.

---

### 3.32. Çalışma Ekranı Reaktif Deste Kimliği ve Üst Bar Elemanları Güvencesi
- **Dosyalar:** `app/(tabs)/index.tsx`.
- **Uygulanan Değişiklikler:**
  - `targetDeckId` reaktif kancasına `collectionVersion` bağımlılığı eklendi; modal içerisinden yeni deste eklendiğinde çalışma ekranı beklemeden yeni deste kimliğini edindi.
  - Kuyrukta kart kalmadığında veya boş deste açıldığında `ReviewerBackIcon` (Geri) ve `DeckOptionsIcon` (Ayarlar) butonlarının kaybolması engellendi; kullanıcı her durumda deste listesine veya deste seçeneklerine tek dokunuşla dönebilir kılındı.

---

### 3.33. Telifli TUS İçeriklerinin Çok Katmanlı Veri Güvenliği ve İzolasyonu
- **Dosyalar:** `lib/catalogProtection.ts`, `lib/catalogProtection.test.ts`, `app/export.tsx`, `app/browser.tsx`, `app/editor.tsx`.
- **Uygulanan Değişiklikler:**
  - `assertCatalogCardsMovable` ile kart tarayıcısından toplu deste değiştirme girişimlerinde dahili kartlar tespit edildiğinde kullanıcı dostu uyarı gösterildi ve veritabanı güncellemesi reddedildi.
  - `editor.tsx` üzerinde dahili TUS kartı açıldığında soru/cevap alanları salt-okunur (`editable={false}`) hale getirildi, deste değiştirme seçicisi devre dışı bırakıldı.
  - `export.tsx` ve `.apkg` üretim motorunda dahili destelerin dışa aktarımı kapatıldı.
  - Birim testler (`lib/catalogProtection.test.ts`) ile koruma sözleşmesinin her fonksiyonu tam kapsama alındı.

---

## BÖLÜM 4: GİT COMMİT GEÇMİŞİ VE DOSYA DEĞİŞİKLİK DÖKÜMÜ

Son 72 saat içerisinde depoya kaydedilen git commit'leri ve etkiledikleri dosyalar:

| Commit Hash | Tarih / Saat | Mesaj / Başlık | Değişen Dosyalar / Etki |
|---|---|---|---|
| `Çalışma Ağacı` | 2026-09-06 01:45 | `feat(reviewer, browser, tags, whiteboard): whiteboard session, tag picker UI, peek toolbar, uniform browser actions` | `lib/whiteboardSession.ts`, `components/WhiteboardOverlay.tsx`, `components/TagPickerModal.tsx`, `app/editor.tsx`, `app/browser.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx` |
| `2abda1e` | 2026-09-05 15:17 | `feat(settings): persist audio playback rate and cover it with tests` | `lib/storage.ts`, `lib/types.ts`, `app/settings.tsx`, `app/deck-options.tsx`, birim testler |
| `c5439aa` | 2026-09-05 14:32 | `feat(ui): refine editor, import workflow, deck picker, and media tools` | `app/editor.tsx`, `app/import.tsx`, `components/NoteTypePickerModal.tsx`, `lib/permissions.ts`, `components/PhotoEditorModal.tsx` |
| `b0fcb14` | 2026-09-04 13:26 | `feat(editor): make the note toolbar track the caret like a word processor` | `components/RichTextEditor.tsx`, `lib/editorFormatState.ts`, `lib/richTextCommands.ts`, `app/editor.tsx` (+1174 / -165 satır) |
| `da070e9` | 2026-09-04 13:26 | `fix(fsrs): close four divergences found by an FSRS/Anki parity audit` | `lib/fsrs.ts`, `lib/fsrsMaintenance.ts`, `lib/fsrsMemory.ts`, `lib/noteManager.ts`, `docs/AUDIT_FSRS_ANKI_PARITY.md` (+706 / -25 satır) |
| `3dd4d63` | 2026-09-04 13:26 | `feat(study-calendar): add Çalışma Takvimi with per-subject session totals` | `app/study-calendar.tsx`, `lib/studyCalendar.ts`, `lib/studyCalendar.test.ts`, `components/Sidebar.tsx` (+1546 satır) |
| `6fd78e4` | 2026-09-04 13:26 | `chore(deps): move to Expo SDK 57 and default the theme to light` | `package.json`, `app.json`, `scripts/share-expo-go.sh`, tema varsayılanı |
| `7287738` | 2026-09-04 01:32 | `fix(reviewer): send the top-left button to the deck list, as AnkiMobile does` | `app/(tabs)/index.tsx`, çalışma ekranı navigasyonu |
| `33155ce` | 2026-09-04 01:22 | `fix(filtered-decks): drop invented preview-delay behaviour and match Anki's defaults` | `lib/filteredDeckOptions.ts`, `lib/models.ts`, `lib/importApkg.ts`, `components/FilteredDeckOptionsModal.tsx` |
| `d820e40` | 2026-09-03 22:15 | `docs: record the verification audit and correct the 24-hour summary` | `docs/AUDIT_SON_24_SAAT_DOGRULAMA_2026-09-02.md`, `docs/ANKI_COMPATIBILITY.md` |
| `6a323ae` | 2026-09-03 22:15 | `feat(editor): group the formatting toolbar into Home, Styles and Insert tabs` | `components/RichTextEditor.tsx`, sekme gruplamaları |
| `acfca56` | 2026-09-03 22:15 | `fix(editor): keep the pending typing style when a toolbar button is pressed` | `lib/editorFormatState.ts`, `components/RichTextEditor.tsx` |
| `5bcf953` | 2026-09-03 22:15 | `fix(reviewer): undo everything an answer changed, and match Anki's gather order` | `lib/studyRepository.ts`, geri alma kuyruğu ve toplama sırası |
| `c0a8d05` | 2026-09-03 22:15 | `fix(photo-editor): make drag-to-delete actually delete` | `components/PhotoEditorModal.tsx`, `lib/photoEditor.ts` |
| `379e761` | 2026-09-03 22:15 | `fix(search): rebuild deck-name replacement on the search tokenizer` | `lib/searchQuery.ts`, `lib/searchQuery.test.ts` |
| `f3b3291` | 2026-09-03 22:15 | `fix(package): read Anki's preview delay fields at their real tags` | `lib/importApkg.ts`, `lib/filteredDeckOptions.ts` |

---

## BÖLÜM 5: TEST, TİP KONTROLÜ VE KALİTE KAPISI DOĞRULAMALARI

Bu bölüm, 5-6 Eylül 2026 tarihinde çalışma ağacı üzerinde **yeniden koşturularak** doğrulanmıştır.
Aşağıdaki sayılar tahmin değil, `npm run quality` çıktısının kendisidir.

1. **TypeScript Derleme Kontrolü (`tsc --noEmit`):**
   - Sonuç: **0 hata.**
   - Not: Doğrulama sırasında çalışma ağacında bulunan iki gerçek hata giderildi —
     `app/(tabs)/index.tsx` içindeki "current deck" senkronizasyon efekti, `activeStudyDeckName`
     bildirilmeden ~1050 satır önce onu bağımlılık dizisinde kullanıyordu. Bağımlılık dizisi render
     sırasında değerlendirildiği için bu yalnızca bir tip hatası değil, çalışma ekranını her
     render'da düşüren bir `ReferenceError` idi. Ayrıntı için bkz. Bölüm 6.

2. **Birim ve Entegrasyon Testleri (`vitest run`):**
   - Test Dosyası Sayısı: **123 test dosyası**
   - Toplam Test Adedi: **1267 test**
   - Başarı Oranı: **%100 (1267 passed)**
   - Kapsanan kritik alanlar: FSRS-6 altın vektörleri, çalışma takvimi DST ve oturum bölücüleri
     (34 test), zengin metin imleç format durumları (14 test), deste seçici önceliklendirme ve
     genişletme (19 test), dinamik çoklu alan not şablonları (4 test), taslak kirlilik tespiti
     (10 test), deste bazlı yazı tahtası oturum ve tema yönetimi (`lib/whiteboardSession.test.ts`, 7 test),
     yazı tahtası çizim ömrü ve otomatik ilerleme engeli (`lib/reviewerTimers.test.ts`), içe aktarma
     günlüğü ve tanı raporu (`lib/importLog.test.ts`), katalog notları koruma sözleşmesi
     (`lib/catalogProtection.test.ts`), boş tuval kağıt desenleri (`lib/blankCanvasSetup.test.ts`),
     içe aktarma sütun/etiket eşlemeleri, medya depo native kopyalamaları (`lib/mediaStore.replacement.test.ts`)
     ve izin yönlendirmeleri (2 test).

3. **iOS Hazır Olma ve Uyumluluk Denetimi (`verify:ios`):**
   - `node scripts/verify-ios-readiness.mjs` başarıyla doğrulandı:
     *"iOS configuration and Anki compatibility registry verified."*

4. **Genel Kalite Kapısı (`npm run quality`):**
   - Çıkış kodu **0**; typecheck + 1267 test + iOS denetimi zincirinin tamamı başarıyla geçti.

---

## BÖLÜM 6: BAĞIMSIZ DOĞRULAMA BULGULARI (5-6 EYLÜL 2026)

Bu bölüm, yukarıdaki maddelerin kod tabanına karşı tek tek denetlenmesi sonucunda ortaya çıkan
sapmaları ve uygulanan düzeltmeleri kaydeder. Denetimde her Anki iddiası, AGENTS.md'nin kaynak
sıralamasına uygun olarak upstream kaynağından teyit edilmiştir.

### 6.1. Upstream'den birebir teyit edilen iddialar

| İddia | Upstream kaynağı | Sonuç |
|---|---|---|
| Önizleme gecikmeleri `60 / 600 / 0` ve Easy'nin saklanan gecikmesi yok | `rslib/src/decks/filtered.rs` → `Deck::new_filtered` | **Doğrulandı** |
| `new_filtered` iki terim tohumlar: 100/Random ve 20/Due | aynı dosya | **Doğrulandı** (kod ve yorumlar isabetli) |
| 11 toplama sırasının SQL karşılıkları (0–10) | `rslib/src/storage/card/filtered.rs` → `order_and_limit_for_search` | **Doğrulandı**; Added `n.id, c.ord`, ReverseAdded `n.id desc, c.ord asc`, Due tek zaman çizelgesi ve Göreceli Gecikme'nin **artan** (`asc`) yönü dahil |
| FSRS w17/w18 tavanı ve w19 tabanı | `fsrs-rs/src/parameter_clipper.rs` | **Doğrulandı**; formül `min(2.0, sqrt(max(0.01, -[ln(w11)+ln(2^w13−1)+0.3·w14]/adım)))` ve `enableShortTerm ? 0.01 : 0.0` birebir |
| Leech eşiğinde tek sayılarda yukarı yuvarlama | `rslib/src/scheduler/states/review.rs` → `leech_threshold_met` | **Doğrulandı**; upstream `(threshold as f32 / 2.0).ceil().max(1.0)`, bizde `Math.max(1, Math.ceil(threshold / 2))` |

### 6.2. Bulunan ve giderilen sapmalar

1. **Çalışma ekranını çökerten TDZ hatası (`app/(tabs)/index.tsx`).**
   "Current deck" senkronizasyon efekti, kendisinden çok sonra bildirilen `activeStudyDeckName`
   sabitini bağımlılık dizisinde kullanıyordu. Bağımlılık dizisi render sırasında okunduğu için
   ekran her açılışta `ReferenceError` ile düşüyordu. Efekt, Anki sözleşmesine geri döndürülerek
   giderildi (aşağıdaki madde).

2. **Anki'nin "current deck" sözleşmesinin ihlali.**
   Aynı efekt, koleksiyonun geçerli destesini kuyruğun servis ettiği **alt desteye** kaydırıyordu.
   Anki'de geçerli deste yalnızca kullanıcı bir desteyi *seçtiğinde* değişir; bu nedenle üst deste
   çalışırken eklenen yeni kartlar sessizce bir alt desteye düşüyordu (`newCardDeckMode: 'current'`
   yolu). Efekt `selectedDeckName`'e döndürüldü. Çalışma ekranının deste seçicisi, kuyruğun
   destesini zaten yerel `activeStudyDeckName` prop'uyla aldığı için 2.7'deki davranış korundu.

3. **`DeckPickerModal`'ın açık prop'u ambient durumla ezmesi.**
   Modal `useStudyScope()`'u kendi içinde okuyup, "içinde `::` geçen adayı tercih et" sezgisiyle
   çağıranın verdiği `activeDeckName`'i geçersiz kılabiliyordu. Bu, kart tarayıcısındaki toplu
   taşıma seçicisinin seçili kartların destesi yerine çalışılan alt desteye atlamasına yol açıyordu.
   Dokuz çağrı noktasının tamamı zaten açık bir `activeDeckName` geçtiği için ambient okuma
   kaldırıldı; hedefin sahibi artık yalnızca çağıran.

4. **Filtrelenmiş deste dışa aktarımında yanlış yedek varsayılanlar (`lib/exportAnkiPackage.ts`).**
   Alanı hiç yazılmamış bir deste dışa aktarılırken ikinci terimin limiti Anki'nin 20'si yerine
   100, ilk terimin sırası ise Random yerine Due olarak yazılıyordu. Yedek değerler modülün
   upstream'e dayandırılmış `DEFAULT_SEARCH_LIMIT` / `DEFAULT_SECOND_SEARCH_LIMIT` sabitlerine ve
   `FILTERED_SEARCH_ORDER.random`'a bağlandı.

### 6.3. Belgede düzeltilen kayıt hataları

- §2.1'de `preview_hard_secs = 5`, `preview_good_secs = 6`, `preview_again_secs = 7` **varsayılan
  değer** gibi yazılmıştı; bunlar `decks.proto` **alan numaralarıdır**. Varsayılanlar 60/600/0'dır.
- §2.2 `router.replace('/(tabs)/decks')` diyordu; kod `router.navigate('/decks')` kullanıyor.
- §2.3 ve §3.3 `scripts/share-expo-go.sh` diyordu; dosya `scripts/share-expo-go.mjs`.
- §2.16 `controlsList="nodownload noplaybackrate"` diyordu; kodda yalnızca `nodownload` var —
  hız seçimi uygulamanın kendi hap butonuyla yapıldığı için bu bilinçli bir tercih.
- §3.2 var olmayan bir `lib/reviewerNavigation.ts` dosyasını listeliyordu.
- §3.16 `flappy-bird.html` / `flappy-plane.html` diyordu; oyun `flappy-plane/index.html` altında.
- §3.16'daki "Bize 200 Coin At modalı", kodda tek seferlik kalıcı açılış hediyesi olarak duruyor.
- §5'teki "119 dosya / 1154 test" ve "quality sıfır hatayla geçti" ifadeleri, yazıldığı anda
  doğru değildi: ağaç derlenmiyordu. Bölüm 5 gerçek çıktıyla 121 dosya ve 1173 test olarak güncellendi.

### 6.4. Yazı Tahtası, Etiket Seçici, Editör ve Deste İzolasyonu Denetimi (6 Eylül 2026)

1. **Yazı Tahtası Deste Durumu ve Çizim Ömrü:**
   AnkiDroid'in `MetaDB.whiteboardState` tablosundaki mantık `lib/whiteboardSession.ts` altında bağımsız
   olarak modellendi. Çalışma ekranında çizim yaparken kuyruğun arka planda yenilenmesi veya geçici
   olarak boşalması durumunda çizimin korunması sağlandı. `shouldClearWhiteboardForCard` fonksiyonu
   ile kart geçişi testle sabitlendi. Çizim açıkken Auto Advance'in duraklatılması ve kapanışta
   dwell süresinin sıfırlanmadan kaldığı yerden devam etmesi `lib/reviewerTimers.test.ts` ile doğrulandı.

2. **Hiyerarşik Etiket Seçici (`TagPickerModal`):**
   Anki'nin etiket hiyerarşisi (`::`) görselleştirildi. Girintili ağaç yapısı, hızlı etiket ekleme,
   arama temizleme ve seçim rozeti ile iOS HIG standartlarında kullanıcı deneyimi sağlandı.

3. **Not Düzenleyici Araç Çubuğu 8.5 Buton "Peek":**
   iPhone dikey modunda zengin metin araç çubuğunun 8.5 buton sığacak şekilde ölçeklenmesi ve 9. butonun
   sağ kenarda yarım görünmesi ile yatay kaydırma ipucu sezgisel hale getirildi.

4. **Deste Seçici ve Tarayıcı Hedef Doğruluğu:**
   Kart tarayıcısında birden fazla kart seçilip başka desteye taşınmak istendiğinde, seçilen kartların
   ait olduğu destenin hedef olarak seçili gelmesi sağlandı.

5. **Açılış Ekranı Parlaması ve Stack Navigasyon Düzeltmesi:**
   `app/(tabs)/_layout.tsx` üzerinde `<Stack initialRouteName="decks">` tanımlanarak, uygulamanın
   açılışında anlık olarak "Tüm kartlar tamamlandı" ekranına düşmesi ve ardından destelere atlaması
   sorunu kökten çözüldü; uygulama doğrudan Deste Listesi ile açılır hale getirildi.

6. **Kart Tarayıcısı Seçim Barı Simetrisi ve "Bayrak Yok" Filtresi:**
   Toplu işlem barındaki butonlar 60x52px sabit kutularla eşitlendi. Kartlara bayrak atandığında seçimin
   sıfırlanması önlenerek ardışık işlemlere izin verildi. Askıya alınan kartların silik görünümü (`opacity: 1`)
   düzeltildi ve "Bayrak yok" filtresi şeffaf halka ikonu ile renkli bayraklardan ayrıştırıldı.

### 6.5. Katalog Koruması, İçe Aktarma Günlüğü ve Çizim Tuvali Doğrulamaları (6 Eylül 2026)

1. **Telifli TUS Katalog Notları ve Deste Bütünlüğü (`lib/catalogProtection.ts`):**
   - Yalnızca arayüz (UI) seviyesinde bir kilitleme değil, SQLite ve veri katmanı (`assertCatalogCardsMovable`, `assertCatalogNoteContentMutable`, `assertCatalogDeckNotDeletable`) seviyesinde mutlak veri koruma mimarisi doğrulandı.
   - Dahili TUS katalog notlarının (`CATALOG_PACK_ID`, `isProtectedCatalogGuid`) kazaen değiştirilmesi, silinmesi, başka destelere taşınması veya çoğaltılması engellenirken; kullanıcının çalışma alışkanlığı için hayati olan kişisel etiket ekleme/çıkarma ve bayrak değiştirme işlemlerine tam izin verildi.
   - Yedekleme paketine (`canonicalBackupContainsCatalog`) telifli kart gövdelerinin sızması engellendi.

2. **Anki Uyumlu İçe Aktarma Günlüğü (`components/ImportLogView.tsx`, `lib/importLog.ts`):**
   - Anki masaüstü ve AnkiMobile standartlarında, paket açıldıktan sonra içe aktarılan her bir notun nihai durumunu (`added`, `updated`, `duplicate`, `firstFieldMatch`, `conflicting`, `missingNotetype`, `missingDeck`, `emptyFirstField`) detaylandıran günlük görünümü teyit edildi.
   - Bounded sampling (`MAX_LOGGED_ROWS_PER_STATUS = 50`) yapısıyla bellek şişmesi engellendi; her grup için renk tonları (`statusTone: good/neutral/bad`), yerelleştirilmiş başlıklar ve tam erişilebilirlik (`accessibilityRole="button"`, `accessibilityState={{ expanded }}`) sağlandı.

3. **Boş Tuval Çizim Şablonu Kalıcılığı (`lib/blankCanvasSetup.ts`):**
   - Tıpkı AnkiDroid'in `whiteboardState` felsefesinde olduğu gibi, kullanıcının en son seçtiği kağıt türü (düz, çizgili, kareli, noktalı), arka plan rengi ve sayfa formatı yerel cihaz ayarlarında (`blankCanvasSetup`) saklanır.
   - Bu ayarlar koleksiyon veritabanını veya dışa aktarılan .apkg paketlerini kirletmez; her yeni çizim kartında kullanıcının alıştığı kağıt türünün otomatik açılması birim testlerle (`lib/blankCanvasSetup.test.ts`) teyit edildi.

### 6.6. Kart Tarayıcısı Arama Ergonomisi, Ultra-Kompakt Satırlar ve Güvenlik Denetimi (6 Eylül 2026)

1. **Arama Çubuğu Dikey Metin Ortalaması:**
   - `app/browser.tsx` içerisindeki `searchInput` bileşeninin iOS'ta harfleri alta basık göstermesine neden olan asimetrik padding temizlendi; dikeyde kusursuz ortalanmış ve `Ara veya deck:tag:is:…` placeholder'ı ile modern AnkiMobile görünümü sağlandı.

2. **Ultra-Kompakt Satır Geometrisi:**
   - Kart listesinde `cardItemCompact` (padding 4px), `listContentCompact` (gap 3px) ve `selectionCheckboxCompact` (17px) boyutlandırmalarıyla, iPhone dikey ekranında tek bakışta görülen soru sayısı iki katına çıkarıldı; tıbbi kart tekrarlarında hız ve ergonomi kazanıldı.

3. **Çok Katmanlı Veri Koruma Sözleşmesi:**
   - Dahili TUS kartlarının telif hakkı ve bütünlüğü, yalnızca arayüzdeki butonları gizleyerek değil; SQLite ve motor katmanında (`assertCatalogCardsMovable`, `assertCatalogNoteContentMutable`, `canonicalBackupContainsCatalog`) mutlak koruma altına alındı.
   - Kullanıcıların kişisel etiket ekleme ve bayrak atama özgürlükleri tamamen korundu.

---
*Doküman Referansı: `docs/SON_72_SAAT_IMPLEMENTATION_PLANLARI_WALKTHROUGH_VE_PROMPTLAR.md`*

