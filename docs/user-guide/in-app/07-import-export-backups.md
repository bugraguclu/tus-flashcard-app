# Uygulama içi metinler — içe/dışa aktarma, yedekler, bakım

Kapsam: **İçe aktar** (`app/import.tsx`), **İçe aktarma günlüğü**
(`components/ImportLogView.tsx`), **Dışa aktar** / **Yedeği dışa aktar** (`app/export.tsx`,
`components/DeckExportSelector.tsx`), **Yedekler** ve **Medyayı denetle** (`app/backups.tsx`,
`components/backups/MediaCheckSection.tsx`), **Boş kartlar** (`app/empty-cards.tsx`), **Ayarlar ›
Veri yönetimi** (`app/settings.tsx`). Bütün yerler iPhone ve web için aynıdır; farklı olanlar
belirtilmiştir. Satır numaraları master c6108e6'ya göredir.

Bileşen kalıpları: bilgi sayfaları `components/HelpSheet.tsx` (README › Uygulamaya ekleme, madde 3);
tam ekran ekranlarda ⓘ düğmesi `ScreenHeader` `actions` yuvasına `HeaderIconButton` ile
(`components/ScreenHeader.tsx:11,47-60`); Ayarlar gruplarında mevcut `Group`
`onHelpPress`/`helpLabel` özelliği (`app/settings.tsx:161-188`, `?` düğmesi). Satır altı ipuçları
ekranın mevcut ipucu stillerini kullanır: içe aktarmada `renderToggleRow` ipucu ve `ChoiceModal`
seçenek `hint` alanı (`app/import.tsx:606-623`, `components/import/ImportControls.tsx:18,46`),
dışa aktarmada `styles.optionHint` (`app/export.tsx:393`), Ayarlar'da `DataActionRow` `detail` ve
`ToggleRow` `summary`.

---

## Bilgi sayfaları

### help.import.sheet — İçe aktar bilgi sayfası (yeni)
- **Yer:** **İçe aktar** ekranı başlığı, sağda ⓘ düğmesi (yeni), `app/import.tsx:643-647` (`ScreenHeader` `actions`)
- **Tetikleyici:** ⓘ'ye dokunma. Erişilebilirlik etiketi: "İçe aktarma hakkında" / "About importing"
- **Bileşen:** bilgi sayfası (eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/14-import-export.md#import` (`help?article=import-export&section=import`)
- **Durum:** Yeni

**TR**
- Üst başlık: İÇE AKTARMA
- Başlık: Dosyadan kart alma
- Özet: Bir dosya seçin; uygulama türünü uzantısından anlar ve uygun seçenekleri gösterir.
- Maddeler: (1) **.apkg** desteleri koleksiyonunuza ekler; sizdeki kartların çalışma durumu değişmez. (2) **.colpkg** bütün koleksiyonunuzun yerine geçer. (3) **CSV, TSV, TXT** dosyalarında her satır bir not olur; sütunları alanlara siz eşlersiniz. Dosyayı UTF-8 olarak kaydedin. (4) Paketlerden ve var olan notları güncelleyen metin dosyalarından önce otomatik güvenlik yedeği alınır.
- Not: Dosyaları Dosyalar, Mail veya AirDrop'tan **Paylaş › TusAnkiM** ile de gönderebilirsiniz.

**EN**
- Eyebrow: IMPORTING
- Title: Bringing cards in from a file
- Summary: Choose a file; the app recognises its type from the extension and shows the matching options.
- Points: (1) **.apkg** adds decks to your collection; the study state of the cards you already have does not change. (2) **.colpkg** replaces your whole collection. (3) In **CSV, TSV, TXT** files every line becomes a note and you map the columns to fields. Save the file as UTF-8. (4) A safety backup is made automatically before package imports and before text imports that update existing notes.
- Note: You can also send files from Files, Mail or AirDrop with **Share › TusAnkiM**.

### help.export.sheet — Dışa aktar bilgi sayfası (yeni)
- **Yer:** **Dışa aktar** / **Yedeği dışa aktar** ekranı başlığı, sağda ⓘ (yeni), `app/export.tsx:228-232` (`ScreenHeader` `actions`)
- **Tetikleyici:** ⓘ'ye dokunma. Erişilebilirlik etiketi: "Dışa aktarma hakkında" / "About exporting"
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/14-import-export.md#export-formats` (`help?article=import-export&section=export-formats`)
- **Durum:** Yeni

**TR**
- Üst başlık: DIŞA AKTARMA
- Başlık: Hangi biçimi seçmeliyim?
- Özet: Desteleri veya bütün koleksiyonu bir dosyaya kaydedip paylaşın.
- Maddeler: (1) Yeni cihaza geçerken **Anki Koleksiyon Paketi (.colpkg)**: ilerleme, geçmiş ve bütün medya dahildir. (2) Bir desteyi paylaşırken **Anki Deste Paketi (.apkg)** ve **Çalışma programını dahil et** kapalı. (3) Düz metin biçimleri tabloda düzenlemek veya okumak içindir. (4) Paylaşım sayfasında **Dosyalar'a Kaydet** ile dosyayı saklayabilirsiniz.
- Not: Dosya şifrelenmez. TUS Kartları paketi ve filtrelenmiş desteler dışa aktarılmaz.

**EN**
- Eyebrow: EXPORTING
- Title: Which format should I choose?
- Summary: Save decks or your whole collection to a file and share it.
- Points: (1) Moving to a new device: **Anki Collection Package (.colpkg)**, with progress, history and every media file. (2) Sharing a deck: **Anki Deck Package (.apkg)** with **Include scheduling information** off. (3) The plain-text formats are for editing in a spreadsheet or for reading. (4) In the share sheet, **Save to Files** keeps the file.
- Note: The file is not encrypted. The TUS Cards pack and filtered decks are not exported.

### help.backups.sheet — Yedekler bilgi sayfası (yeni)
- **Yer:** (a) **Yedekler** ekranı başlığı, sağda ⓘ (yeni), `app/backups.tsx:208-212`; (b) **Ayarlar › Veri yönetimi › Yedekleme** grup başlığındaki `?` (yeni), `app/settings.tsx:1544` (`Group onHelpPress`, `helpLabel`: "Yedekler hakkında" / "About backups")
- **Tetikleyici:** ⓘ veya `?` düğmesine dokunma
- **Bileşen:** bilgi sayfası (iki giriş aynı sayfayı açar)
- **Daha fazla bilgi:** `tr/15-backups-and-maintenance.md#automatic-backups`
- **Durum:** Yeni

**TR**
- Üst başlık: YEDEKLER
- Başlık: Yedekler nasıl çalışır?
- Özet: Uygulama koleksiyonunuzun yedeğini bu cihazda kendiliğinden alır.
- Maddeler: (1) Değişiklik varsa 30 dakikada bir yedek alınır. Adını değiştirdiğiniz yedekler siz silene kadar saklanır; diğerleri zamanla yenileriyle değiştirilir. (2) Yedekte kartlar, ilerleme, tekrar geçmişi ve ayarlar vardır; resim ve ses dosyaları yoktur. (3) **Geri yükle** bütün koleksiyonu ve ayarları yedekteki hâline döndürür; önce o anki durumun bir kopyası alınır. (4) **Paylaş** yedeği bir pakete çevirir; böylece onu cihaz dışına alabilirsiniz.
- Not: Yedekler uygulamanın içinde durur. Uygulamayı silerseniz onlar da silinir; önce koleksiyonu .colpkg olarak dışa aktarın.

**EN**
- Eyebrow: BACKUPS
- Title: How backups work
- Summary: The app backs up your collection on this device by itself.
- Points: (1) A backup is made every 30 minutes when something changed. Backups you rename are kept until you delete them; the others are replaced by newer ones over time. (2) A backup holds your cards, progress, review history and settings; it does not hold images or sounds. (3) **Restore** returns the whole collection and the settings to the backup; a copy of the current state is made first. (4) **Share** turns a backup into a package so you can take it off the device.
- Note: Backups live inside the app. Deleting the app deletes them too; export your collection as .colpkg first.

### help.settings.maintenanceSheet — Bakım araçları bilgi sayfası (yeni)
- **Yer:** **Ayarlar › Veri yönetimi › Bakım** grup başlığındaki `?` (yeni), `app/settings.tsx:1567` (`Group onHelpPress`, `helpLabel`: "Bakım araçları hakkında" / "About maintenance tools")
- **Tetikleyici:** `?` düğmesine dokunma
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/15-backups-and-maintenance.md#check-database`
- **Durum:** Yeni

**TR**
- Üst başlık: BAKIM
- Başlık: Bakım araçları
- Özet: Koleksiyondaki tutarsızlıkları bulun ve onarın.
- Maddeler: (1) **Veritabanını kontrol et** yalnızca rapor verir; hiçbir şeyi değiştirmez. (2) **Onar ve optimize et** önce bulduklarını gösterir; onayınızdan sonra güvenlik yedeği alır ve bozuk satırları düzeltir. Not metni silinmez. (3) **İlerlemeyi sıfırla** bütün koleksiyonu siler; kullanmadan önce yedek alın ve koleksiyonu dışa aktarın.
- Not: Bu işlemlerden önce alınan yedekler **Yedekler** ekranında görünür.

**EN**
- Eyebrow: MAINTENANCE
- Title: Maintenance tools
- Summary: Find and repair inconsistencies in your collection.
- Points: (1) **Check database** only reports; it changes nothing. (2) **Repair and optimize** shows what it found first; after you confirm it makes a safety backup and fixes broken rows. No note text is deleted. (3) **Reset progress** deletes the whole collection; make a backup and export the collection before you use it.
- Note: The backups made before these operations appear on the **Backups** screen.

---

## İçe aktar (`app/import.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.import.title | Ekran başlığı ve alt düğme `t('root.import')`, `app/import.tsx:644,945,949`; aynı anahtar **Desteler ›** ••• satırında, `app/(tabs)/decks.tsx:2269` | başlık / düğme | İçe aktar | Import | Mevcut — güncelle (eski metin: Deste içe aktar / Import deck). Ekran .colpkg ve metin dosyalarını da içe aktarır. Değişirse makale 14 ve 15'teki **Deste içe aktar** etiketleri güncellenir. |
| help.import.formatApkg | Boş durum biçim listesi, `.apkg` satırının adı, `app/import.tsx:660` | liste öğesi | `.apkg` / `.zip` | `.apkg` / `.zip` | Mevcut — güncelle (eski metin: `.apkg`). `.zip` kod tarafından kabul edilir (`lib/importFile.ts:26-31`). |
| help.import.textTip | Boş durum biçim listesinin altı, **Dosya seç** düğmesinin üstü, `app/import.tsx:669-670` arası | ipucu | Metin dosyasını UTF-8 olarak kaydedin. İlk satırdaki sütun başlıkları da not olarak eklenir; o satırı silin veya başına # koyun. | Save text files as UTF-8. Column titles in the first line are imported as a note too; delete that line or start it with #. | Yeni |
| help.import.separatorHint | **Alanları ayıran** satırının altı, `app/import.tsx:712-718` | ipucu | Önizlemede sütunlar yanlış bölünmüşse ayırıcıyı buradan değiştirin. | If the preview splits the columns wrongly, change the separator here. | Yeni |
| help.import.htmlHint | **Alanlarda HTML'e izin ver** ipucu, `app/import.tsx:721-724` | ipucu | Kapalıyken metin kaçışlanır ve satır sonları `<br>` olur. | When off, text is escaped and line breaks become `<br>`. | Mevcut — koru |
| help.import.existingNotesHint | **Mevcut notlar** satırının altı, `app/import.tsx:756-760` | ipucu | Aynı not türünde ilk alanı aynı olan not eşleşmiş sayılır. Güncellenecek not varsa içe aktarmadan önce onay istenir ve yedek alınır. | A note of the same note type with the same first field counts as a match. If notes will be updated, you are asked first and a backup is made. | Yeni |
| help.import.existingNotesOptions | **Mevcut notlar** seçim listesi ipuçları, `app/import.tsx:1025-1029` | seçenek ipucu | (mevcut üç ipucu) | (existing three hints) | Mevcut — koru |
| help.import.matchScope.notetype | **Eşleşme kapsamı** listesi, **Not türü** seçeneği, `app/import.tsx:1044-1048` (`hint` yok) | seçenek ipucu | Eşleşme bütün destelerde aranır. | Matches are looked for in every deck. | Yeni |
| help.import.matchScope.notetypeAndDeck | Aynı liste, **Not türü ve deste** seçeneği | seçenek ipucu | Yalnızca seçtiğiniz destede kartı olan notlar eşleşir. | Only notes with a card in the chosen deck match. | Yeni |
| help.import.mappingHint | **ALAN EŞLEMESİ** başlığının altı, `app/import.tsx:781` | ipucu | Her sütunun hangi alana gideceğini seçin. İlk alan bir sütuna eşlenmelidir; **Yok sayıldı** sütunu alınmaz. | Choose the field each column goes to. The first field must be mapped; an **Ignored** column is skipped. | Yeni |
| help.import.mappingFieldNames | Eşleme rozetleri ve seçim listesi alan adları, `app/import.tsx:217,1087` | etiket | Alan adları `localizeFieldName` ile gösterilir (Ön, Arka…) | Field names as stored (Front, Back…) | Mevcut — güncelle (Türkçe arayüzde "Front/Back" ham adları görünüyor; not türü adı ise yerelleştirilmiş). |
| help.import.progressHint | **Çalışma ilerlemesini içe aktar** ipucu, `app/import.tsx:885-888` | ipucu | (mevcut metin) | (existing text) | Mevcut — koru |
| help.import.presetsHint | **Deste ayarlarını içe aktar** ipucu, `app/import.tsx:892-897` (şu an `null`, 894) | ipucu | Paketteki ayar gruplarını getirir. Kapalıysa yeni desteler varsayılan ayar grubunu kullanır; var olan destelerinizin ayarları değişmez. | Brings the package's presets. When off, new decks use the default preset; your existing decks keep theirs. | Yeni |
| help.import.updatesHint | **GÜNCELLEMELER** altındaki ipucu, `app/import.tsx:909-914` | ipucu | Mevcut metne ek cümle: "Var olan kartlarınızın çalışma durumu hiçbir seçimde değişmez." | Add: "The study state of your existing cards never changes, whatever you choose." | Mevcut — genişlet |
| help.import.updateChoice.ifNewer | **Notları güncelle** / **Not türlerini güncelle** seçim listesi, **Yeniyse**, `app/import.tsx:1063-1067` (`hint` yok) | seçenek ipucu | Paketteki sürüm sizinkinden sonra değiştirilmişse güncellenir. | Updated only if the package's version was changed after yours. | Yeni |
| help.import.updateChoice.always | Aynı liste, **Her zaman** | seçenek ipucu | Paketteki sürüm her zaman yazılır. | The package's version is always written. | Yeni |
| help.import.updateChoice.never | Aynı liste, **Asla** | seçenek ipucu | Sizdeki sürüm olduğu gibi kalır. | Your version stays as it is. | Yeni |
| help.import.colpkgNotice | .colpkg uyarı metni, `app/import.tsx:919-920` | uyarı | Mevcut metne ek: "Yeni gün başlangıcı, FSRS ve günlük sınır kuralları paketteki koleksiyondan gelir; diğer uygulama ayarlarınız, Kronometre kayıtlarınız ve yedekleriniz korunur. Başlamadan önce güvenlik yedeği alınır." | Add: "Next day starts at, FSRS and the daily-limit rules come from the collection in the package; your other app settings, Stopwatch records and backups are kept. A safety backup is made before it starts." | Mevcut — genişlet |
| help.import.colpkgConfirm | **Koleksiyon değiştirilsin mi?** onayı, `app/import.tsx:450-456` | onay | (mevcut metin) | (existing text) | Mevcut — koru |
| help.import.packageBackupNote | .apkg seçiliyken **İçe aktar** düğmesinin üstü, `app/import.tsx:939-951` | dipnot | İçe aktarmadan önce otomatik bir güvenlik yedeği alınır. Büyük paketler birkaç dakika sürebilir. | A safety backup is made before the import. Large packages can take a few minutes. | Yeni |
| help.import.sizeError | Dosya okuma uyarısı, `app/import.tsx:275` | hata | Dosya çok büyük. Paketler en fazla 400 MB, metin dosyaları en fazla 50 MB olabilir. | The file is too large. Packages can be up to 400 MB and text files up to 50 MB. | Mevcut — güncelle (eski metin: Dosya güvenli boyut sınırını aşıyor. / The file exceeds the safe size limit.) |
| help.import.unknownFormat | **Bilinmeyen dosya biçimi** uyarısı, `app/import.tsx:306-307`; web aynı metin `components/WebAppIntegrations.tsx:91-92`, bırakma kutusu `:113` | hata | Yalnızca .apkg (veya .zip), .colpkg, .csv, .tsv ve .txt dosyaları içe aktarılabilir. | Only .apkg (or .zip), .colpkg, .csv, .tsv and .txt files can be imported. | Mevcut — güncelle (eski metin: .zip anılmıyor) |

### Kütüphaneden gelen hata metinleri (İçe/Dışa aktar uyarısında görünür)

Bu metinler `userFacingErrorMessage` ile olduğu gibi gösterilir (`lib/userFacingError.ts:36-49`) ve
bugün yalnızca Türkçedir; İngilizce arayüzde de Türkçe görünür. Önerilen anahtarlar `lib/i18n.ts`
tablosuna, metinler iki dilde eklenir.

| ID | Yer | TR | EN | Durum |
| --- | --- | --- | --- | --- |
| help.import.err.integrity | `lib/importApkg.ts:113` | Paketteki koleksiyon bütünlük denetimini geçemedi. Dosya bozulmuş olabilir. | The package's collection failed its integrity check. The file may be damaged. | Mevcut — güncelle (eski metin: Koleksiyon bütünlük denetimini geçemedi.) |
| help.import.err.structure | `lib/importApkg.ts:121`, `:328` | Dosyada geçerli bir Anki koleksiyonu bulunamadı. | No valid Anki collection was found in the file. | Mevcut — güncelle (eski metinler: Koleksiyonun temel tablo yapısı geçersiz. / Geçerli bir Anki koleksiyonu bulunamadı.) |
| help.import.err.tooMany | `lib/importApkg.ts:127`; `lib/archiveSecurity.ts:31` | Paket güvenle içe aktarılamayacak kadar çok kayıt veya dosya içeriyor. | The package contains too many records or files to import safely. | Mevcut — güncelle |
| help.import.err.tooLarge | `lib/importApkg.ts:135,271,308`; `lib/archiveSecurity.ts:40,41,52,113,132` | Paket veya içindeki bir dosya güvenli boyut sınırını aşıyor. | The package, or a file in it, exceeds the safe size limit. | Mevcut — güncelle (271'deki metin "en fazla 200 MB" diyor; gerçek sınır 400 MB, `lib/importApkg.ts:43`) |
| help.import.err.ratio | `lib/archiveSecurity.ts:44` | Paket olağan dışı biçimde sıkıştırılmış; güvenlik nedeniyle açılmadı. | The package is compressed in an unusual way and was not opened for safety. | Mevcut — güncelle |
| help.import.err.modernColpkg | `lib/importApkg.ts` | Bu koleksiyon paketinin not türleri ve desteleri okunamadı; koleksiyonunuz değiştirilmedi. | This collection package's note types and decks could not be read; your collection was not changed. | Mevcut — güncellendi (Anki'nin varsayılan biçimi artık okunuyor) |
| help.import.err.noteType | `lib/importApkg.ts:407` | Paketteki bir notun not türü pakette bulunamadı. | A note type used by a note in the package is missing from it. | Mevcut — güncelle |
| help.catalog.importBlocked | `lib/catalogProtection.ts:38` | Bu dosyada TUS Kartları paketinden kartlar var. Bu kartlar dosyayla içe aktarılamaz; paketi uygulamanın içinden kurun. | This file contains cards from the TUS Cards pack. They cannot be imported from a file; install the pack from inside the app. | Mevcut — güncelle (eski metin uygulama içi satın almadan söz ediyor; bu sürümde ödeme kapalı) |
| help.catalog.exportBlocked | `lib/catalogProtection.ts:20`; `lib/exportAnkiPackage.ts:129,145,166,548`; `lib/exportNotes.ts:119,122,133` | TUS Kartları paketindeki kartlar ve desteler dışa aktarılamaz. | Cards and decks from the TUS Cards pack cannot be exported. | Mevcut — güncelle (eski metinler "ücretli katalog" diyor) |

## İçe aktarma günlüğü (`components/ImportLogView.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.importLog.countsOnly | Grup açıldığında satır listesinin yerinde, yalnızca satır örneği olmayan günlüklerde (paketler), `components/ImportLogView.tsx:176-190` | açıklama | Paket içe aktarmalarında yalnızca sayılar gösterilir; notlar tek tek listelenmez. | Package imports show counts only; individual notes are not listed. | Mevcut — güncelle (eski metin, paketlerde hiçbir satır yokken: "… ve N not daha (ilk 200 tanesi listelendi)." / "… and N more (the first 200 are listed).") |
| help.importLog.duplicateDetail | **Zaten mevcut olanlar** grubunun açıklaması, `components/ImportLogView.tsx:56-57` | açıklama | Not atlandı; koleksiyonda zaten var | Note skipped, already in the collection | Mevcut — güncelle (eski metin: Not atlandı; koleksiyonda güncel kopyası var / Note skipped, up-to-date copy in collection — **Notları güncelle: Asla** seçiliyken kopya güncel olmayabilir) |

## Dışa aktar ve Yedeği dışa aktar (`app/export.tsx`, `components/DeckExportSelector.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.export.treeHint | **Dışa aktarılacak desteler** başlığının altı, seçili sayısının yanında değil altında, `components/DeckExportSelector.tsx:124-130` | ipucu | TUS Kartları paketi ve filtrelenmiş desteler listelenmez. | The TUS Cards pack and filtered decks are not listed. | Yeni |
| help.export.selectionCaption | **Kartlarım** seçiminden açıldığında başlık metni, `app/export.tsx:258` | açıklama | Mevcut metne ek: "Seçtiğiniz kartların notlarındaki diğer kartlar da eklenir." | Add: "The other cards of the selected cards' notes are included too." | Mevcut — genişlet |
| help.export.formatHint | — | — | — | — | Gerekmiyor: .colpkg artık her zaman listelenir (Kartlarım seçimi hariç) ve seçildiğinde deste listesinin yerinde "Koleksiyonun tamamı" yazar |
| help.export.mediaHint | **Medyayı dahil et** onay kutusunun altı, canlı dışa aktarmada, `app/export.tsx:269-274` | ipucu | Kartlarınızın kullandığı ve bu cihazda bulunan resim ve ses dosyaları eklenir. | The images and sounds your cards use, as far as they are on this device, are added. | Yeni |
| help.export.backupMediaHint | Yedekten dışa aktarmada medya ipucu, `app/export.tsx:276-279` | ipucu | (mevcut metin) | (existing text) | Mevcut — koru |
| help.export.schedulingHint | **Çalışma programını dahil et** ipucu, `app/export.tsx:289` | ipucu | Mevcut metne ek: "Kendi ilerlemenizi taşırken açın; desteyi başkasıyla paylaşırken kapalı bırakın." | Add: "Turn it on when you move your own progress; leave it off when you share a deck." | Mevcut — genişlet |
| help.export.presetsHint | **Deste ayarlarını dahil et** altı, `app/export.tsx:292-297` (ipucu yok) | ipucu | Destelerin ayar grupları (günlük limitler, adımlar) pakete eklenir. | The decks' presets (daily limits, steps) are added to the package. | Yeni |
| help.export.guidHint | **Düz Metin Notları** seçeneklerinin altı, `app/export.tsx:310-324` | ipucu | **Benzersiz kimliği dahil et** açıkken dosyayı yeniden içe aktardığınızda aynı notlar güncellenir, kopya oluşmaz. | With **Include unique identifier** on, importing the file again updates the same notes instead of creating copies. | Yeni |
| help.export.plaintextNote | **Dışa aktar** düğmesinin üstü, yalnızca canlı dışa aktarmada, `app/export.tsx:329-339` | dipnot | Dosya şifrelenmez; yalnızca güvendiğiniz kişilere ve yerlere gönderin. | The file is not encrypted; send it only to people and places you trust. | Yeni (yedekten dışa aktarmadaki uyarının eşi, `app/export.tsx:239-242`) |
| help.export.backupNotice | Yedekten dışa aktarma kutusu, `app/export.tsx:236-243` | açıklama | (mevcut metin) | (existing text) | Mevcut — koru |
| help.export.recoveryText | Kurtarma kopyası metni, `app/export.tsx:248` | açıklama | (mevcut metin) | (existing text) | Mevcut — koru |
| help.export.backupName | Yedekten dışa aktarma kutusundaki dosya adı, `app/export.tsx:238` | etiket | `displayBackupName(backupName)` | same | Mevcut — güncelle (iç `tus-backup-custom-` ön eki görünüyor) |

## Yedekler (`app/backups.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.backups.nameHint | **YEDEK ADI** kutusunun altı, **Şimdi yedekle** düğmesinin üstü, `app/backups.tsx:215-228` | ipucu | Adını değiştirdiğiniz yedekler siz silene kadar saklanır; önerilen adla alınanlar zamanla yenileriyle değiştirilir. | Backups you rename are kept until you delete them; those with the suggested name are replaced by newer ones over time. | Yeni |
| help.backups.empty | Boş liste, `app/backups.tsx:249` | boş durum | Henüz yedek yok. Uygulama, değişiklik olduğunda 30 dakikada bir kendiliğinden yedek alır. | No backups yet. The app backs up by itself every 30 minutes when something changed. | Mevcut — genişlet (eski metin: Henüz yedek yok. / No backups yet.) |
| help.backups.recoveryRow | Satır başlığı, yalnızca kurtarma kopyalarında, `app/backups.tsx:255-262` | etiket | ⚠️ Kurtarma kopyası (geri yüklenemez) | ⚠️ Recovery copy (cannot be restored) | Yeni (listeleme sırasında dosyanın `recoveryOnly` alanını okumayı gerektirir; bugün yalnızca **Geri yükle**'de anlaşılıyor) |
| help.backups.restoreConfirm | **Yedeği geri yükle** onayı, `app/backups.tsx:157-160` | onay | Bu yedek mevcut koleksiyonun ve uygulama ayarlarının yerini alacak. Medya dosyalarına dokunulmaz. Geri yüklemeden önce mevcut durumun bir kopyası **Geri yükleme öncesi kopya** olarak saklanır. | This backup will replace the current collection and app settings. Media files are not touched. A copy of the current state is kept as a **Pre-restore snapshot** first. | Mevcut — güncelle (eski metin: Bu yedek mevcut koleksiyonun yerini alacak. Geri yüklemeden önce mevcut durumun otomatik bir kopyası oluşturulur.) |
| help.backups.restoreNewer | Geri yükleme doğrulama hatası, neden `newer-version` iken, `app/backups.tsx:147-150` (`lib/backup.ts:183-185`) | hata | Bu yedek uygulamanın daha yeni bir sürümüyle alınmış. Uygulamayı güncelleyip tekrar deneyin. | This backup was made by a newer version of the app. Update the app and try again. | Yeni (bugün bütün nedenler için "Yedek geri yüklenemedi." görünüyor) |
| help.backups.deleteConfirm | **Yedeği sil** onayı, `app/backups.tsx:186` | onay | `${displayBackupName(name)} kalıcı olarak silinecek.` | `${displayBackupName(name)} will be permanently deleted.` | Mevcut — güncelle (iç ad gösteriliyor) |

## Medyayı denetle (`components/backups/MediaCheckSection.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.media.intro | **MEDYA** başlığının altı, **Medyayı denetle** düğmesinin üstü, `MediaCheckSection.tsx:79-80` | ipucu | Notlarınızın kullanmadığı dosyaları ve notlarda adı geçip bu cihazda olmayan dosyaları listeler. Kullanılmayanları çöp kutusuna taşıyıp sonra geri getirebilirsiniz; çöp kutusundaki dosyalar yer kaplamaya devam eder. | Lists files your notes don't use and files your notes mention that are not on this device. You can move unused files to the trash and bring them back later; files in the trash still take up space. | Yeni |
| help.media.webNote | Sonuç kartının altı, yalnızca web (`canTrashMedia()` false), `MediaCheckSection.tsx:104,111` | dipnot | Web sürümünde dosyalar çöp kutusuna taşınamaz; denetim yalnızca rapor verir. | In the web version files cannot be moved to the trash; the check only reports. | Yeni (yalnızca web) |
| help.media.trashConfirm | **Kullanılmayan medya** onayı, `MediaCheckSection.tsx:41-46` | onay | (mevcut metin) | (existing text) | Mevcut — koru |

## Boş kartlar (`app/empty-cards.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.emptyCards.intro | Ekranın üst açıklaması, `app/empty-cards.tsx:103-105` | açıklama | Mevcut metne ek: "Silme geri alınamaz ve öncesinde yedek alınmaz; gerekiyorsa önce **Yedekler**'den bir yedek alın." | Add: "Deleting cannot be undone and no backup is made first; make one on **Backups** if you need it." | Mevcut — genişlet |
| help.emptyCards.keepNotesHint | **Geçerli kartı olmayan notları koru** anahtarının altı, `app/empty-cards.tsx:126-129` | ipucu | Kapalıyken notun bütün kartları silinir ama not metni kartsız kalır; **Onar ve optimize et** böyle notlara yeniden kart ekler. | When off, all of a note's cards are deleted but the note text stays without cards; **Repair and optimize** gives such notes a card again. | Yeni |

## Ayarlar › Veri yönetimi (`app/settings.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.autoBackupSummary | **Otomatik yedekleme** satırının özeti, `app/settings.tsx:1547` | satır özeti | Değişiklik varsa 30 dakikada bir | Every 30 minutes when something changed | Mevcut — güncelle (eski metin: Haftada bir / Weekly). Gerçek politika `lib/backupPolicy.ts:2`; kapatma **Kaydet** ile kalıcı olur (`app/settings.tsx:1636-1653`). |
| help.settings.exportDetail | **Verileri dışa aktar** satırı, `detail` (yok), `app/settings.tsx:1563` | satır açıklaması | Koleksiyon, deste veya metin dosyası | Collection, deck or text file | Yeni |
| help.settings.importDetail | **Deste ve verileri içe aktar** satırı, `detail` (yok), `app/settings.tsx:1564` | satır açıklaması | .apkg, .colpkg, CSV, TSV veya TXT | .apkg, .colpkg, CSV, TSV or TXT | Yeni |
| help.settings.checkDbDetail | **Veritabanını kontrol et** açıklaması, `app/settings.tsx:1571` | satır açıklaması | (mevcut metin) | (existing text) | Mevcut — koru |
| help.settings.integrityHint | **Veritabanını kontrol et** sonuç penceresi, bütünlük sorunu olduğunda ipuçlarına eklenecek satır, `app/settings.tsx:716-738` | açıklama | Önce **Onar ve optimize et**'i deneyin; sorun sürerse yakın tarihli bir yedeği geri yükleyin. | Try **Repair and optimize** first; if the problem stays, restore a recent backup. | Mevcut — genişlet |
| help.settings.repairDetail | **Onar ve optimize et** açıklaması, `app/settings.tsx:1580` | satır açıklaması | (mevcut metin) | (existing text) | Mevcut — koru |
| help.settings.resetLabel | **İlerlemeyi sıfırla** satır etiketi ve onay başlığı, `app/settings.tsx:1587,979` | etiket | Koleksiyonu sıfırla | Reset collection | Mevcut — güncelle (öneri; eski metin: İlerlemeyi sıfırla / Reset progress). Değişirse makale 15'in `reset-progress` bölümü ve bilgi sayfası güncellenir. |
| help.settings.resetDetail | **İlerlemeyi sıfırla** satırı, `detail` (yok), `app/settings.tsx:1585-1591` | satır açıklaması | Bütün koleksiyonu siler; önce yedek alın | Erases the whole collection; back up first | Yeni |
| help.settings.resetConfirm | Sıfırlama onay metni, `app/settings.tsx:979` | onay | Bütün desteler, notlar, kartlar, not türleri, ayar grupları, tekrar geçmişi, istatistikler, Kronometre kayıtları ve uygulama ayarları silinir. Medya dosyaları ve yedekler kalır. Başlamadan önce geri yüklenebilir bir güvenlik yedeği alınır. Devam etmeden önce koleksiyonunuzu .colpkg olarak dışa aktarmanızı öneririz. | All decks, notes, cards, note types, presets, review history, statistics, Stopwatch records and app settings will be deleted. Media files and backups are kept. A restorable safety backup is made before it starts. We recommend exporting your collection as .colpkg before you continue. | Mevcut — güncelle (eski metin: Kartlar, çalışma geçmişi ve ilerleme silinecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulacak. / Cards, review history, and progress will be deleted after a restorable safety backup is created.) |
| help.settings.resetDone | **İlerleme sıfırlandı** mesajı, `app/settings.tsx:991-994` | sonuç | `Geri dönüş için ${backupFileName} yedeği saklandı. Yedekler ekranından geri yükleyebilirsiniz.` | `The backup ${backupFileName} was kept for recovery. You can restore it from Backups.` | Mevcut — genişlet |

## Desteler ••• menüsü (`app/(tabs)/decks.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.backupsMenu | **Yedek oluştur** satırı, `app/(tabs)/decks.tsx:2278-2286` | menü etiketi | Yedekler… | Backups… | Mevcut — güncelle (eski metin: Yedek oluştur / Create Backup). Satır yedek almıyor, **Yedekler** ekranını açıyor; 2287-2295'teki **Yedekten geri yükle** aynı ekranı açtığı için iki satır birleştirilebilir. Değişirse makale 15'in giriş paragrafı güncellenir. |
