# Ayarlar, izinler ve uygulama kabuğu — uygulama içi metinler

Kapsam: `app/settings.tsx`, `components/settings/KeyboardSettingsSection.tsx`, izin uyarıları,
başlangıç hatası, bulunamayan sayfa, web sekme/başlatma metinleri, otomasyon bağlantıları.
Makaleler: `tr/16-settings.md`, `tr/18-shortcuts-and-automation.md` (İngilizceleri `en/` altında).
Bütün satır numaraları master c6108e6'ya göredir.

Ayarlar gruplarında **?** düğmesi için yeni bileşen gerekmez: `Group` zaten `onHelpPress` ve
`helpLabel` alır (`app/settings.tsx:161-188`). Yeni bilgi sayfaları `SwipeDismissSheet` üstünde
`HelpSheet` kalıbıyla açılır (README › Uygulamaya ekleme, 3. madde); mevcut Kontroller yardımı
ortalanmış bir iletişim kutusudur, tutamaç eklenmez.

---

## 1. Ayarlar ana sayfası

### Kategori alt satırları

Alt satırlar aramanın da tek kaynağıdır (`settings.tsx:682` başlık + alt satırda arar). Bu yüzden
"Yardım" kelimesinin Hakkında satırında geçmesi gerekir.

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.cat.general | Genel satırı, `settings.tsx:671` | alt satır | Dil • Tema • Düzenleme | Language • Theme • Editing | Mevcut — koru |
| help.settings.cat.newStudy | Yeni çalışma ekranı, `:672` | alt satır | Ekran • Araç çubuğu • Yanıt düğmeleri | Screen • Toolbar • Answer buttons | Mevcut — koru |
| help.settings.cat.reviewing | İnceleme, `:673` | alt satır | Zamanlama • Gelişmiş | Scheduling • Advanced | Mevcut — koru |
| help.settings.cat.notifications | Bildirimler, `:674` | alt satır | Hatırlatma saati | Reminder time | Mevcut — koru |
| help.settings.cat.controls | Kontroller, `:675` | alt satır | Dokunma ve kaydırma • Ekran kontrolü • Klavye | Taps and swipes • On-screen control • Keyboard | Mevcut — koru |
| help.settings.cat.accessibility | Erişilebilirlik, `:676` | alt satır | Kart • Yanıt düğmeleri • Kart tarayıcısı | Card • Answer buttons • Card browser | Mevcut — koru |
| help.settings.cat.data | Veri yönetimi, `:677` | alt satır | Yedekleme • İçe ve dışa aktar • Bakım | Backup • Import and export • Maintenance | Mevcut — koru |
| help.settings.cat.about | Hakkında, `:678` | alt satır | Yardım • Gizlilik politikası • Koşullar • Destek | Help • Privacy Policy • Terms • Support | Mevcut — güncelle (eski metin: Gizlilik politikası • Destek / Privacy Policy • Support) |
| help.settings.search | Arama kutusu, `:1673` | yer tutucu | Ara… | Search… | Mevcut — koru |
| help.settings.noResults | Arama sonucu boşken, `:1697` | boş durum | Eşleşen ayar bulunamadı. Kategori adıyla arayın; örneğin “bildirim” veya “klavye”. | No matching settings found. Search by category name, for example “notification” or “keyboard”. | Mevcut — güncelle (eski metin: Eşleşen ayar bulunamadı. / No matching settings found.) |

### Kaydetme

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.save | Başlık sağı, `settings.tsx:1637-1654` | düğme | Kaydet / ✓ Kaydedildi | Save / ✓ Saved | Mevcut — koru |
| help.settings.unsaved | Kaydetmeden çıkış, `:449-455` | onay | Kaydedilmemiş değişiklikler — Ayarlarınız kaydedilmedi. Çıkarsanız değişiklikler kaybolacak. | Unsaved changes — Your settings have not been saved. They will be lost if you leave. | Mevcut — koru |
| help.settings.saveFailed | Kaydetme hatası, `:564-567` | uyarı | Ayarlar kaydedilemedi — Değişiklik cihaz depolamasına kaydedilemedi. Lütfen yeniden deneyin. | Settings Not Saved — The change could not be saved to device storage. Please try again. | Mevcut — koru |

---

## 2. Genel (`renderGeneral`, `settings.tsx:1015-1128`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.language.hint | **Dil** grubu, düğmelerin altı, `:1017-1039` (Group `description`) | ipucu | Sistem seçiliyken uygulama iPhone'unuzun dilini izler: Türkçe ise Türkçe, değilse İngilizce. | With System, the app follows your iPhone's language: Turkish if it is Turkish, otherwise English. | Yeni (kullanılmayan `settings.languageDescription` anahtarının yerine) |
| help.settings.theme.hint | **Tema** grubu, `:1040-1062` (Group `description`) | ipucu | Sistem, iPhone'un açık/koyu görünümünü izler. | System follows your iPhone's light/dark appearance. | Yeni |
| help.settings.newCardDeck | **Yeni kartların destesi** alt satırı, `:1066` | alt satır | Kart ekleme ekranı bir desteden açılmadığında başlangıç destesini seçer. Geçerli deste en son çalıştığınız destedir. | Picks the starting deck when the add-card screen is not opened from a deck. Current deck is the deck you studied last. | Mevcut — güncelle (eski metin: Kart ekleme ekranının başlangıç destesini belirler. / Sets the initial deck in the add-card screen.) |
| help.settings.pastePng | **Pano görsellerini PNG olarak yapıştır**, `:1077` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.typeAnswer.* | Yazarak cevap üç satırı, `:1084`, `:1093`, `:1100` | alt satır | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.browserGroupTitle | **Dosya adlarını göster** satırının başlıksız kartı, `:1108` (`View` → `Group title`) | grup başlığı | Kart tarayıcısı | Card browser | Yeni |
| help.settings.showFilenames | **Dosya adlarını göster**, `:1111` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |

### help.settings.restoreDefaults — Varsayılan ayarlar onayı
- **Yer:** Genel sayfasının altı, **↺ Varsayılan ayarlara dön** düğmesi, `app/settings.tsx:1124-1126`; onay `:963`
- **Tetikleyici:** düğmeye dokunma
- **Bileşen:** onay penceresi (`confirm`, Tamam yıkıcı stil önerilir)
- **Daha fazla bilgi:** `tr/16-settings.md#restore-defaults`
- **Durum:** Mevcut — güncelle (eski metin: Tüm uygulama ayarları varsayılana döndürülsün mü? / Restore all app settings to defaults?)

**TR**
- Başlık: Varsayılan ayarlar
- Metin: Bütün sayfalardaki ayarlar ilk değerlerine döner: dil Türkçe, tema Açık, klavye kısayolları varsayılan tuşlar. Varsayılan ayar grubunu kullanan destelerin günlük limitleri ve adımları da sıfırlanır. Kartlarınız ve çalışma geçmişiniz korunur.

**EN**
- Title: Default Settings
- Text: Settings on every page return to their starting values: language Türkçe, theme Light, keyboard shortcuts on their default keys. Decks using the Default preset also get their daily limits and steps reset. Your cards and study history are kept.

---

## 3. Yeni çalışma ekranı (`renderNewStudy`, `settings.tsx:1130-1204`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.newStudy.scope | **Yeni çalışma ekranı** grubu açıklaması, `:1132` (Group `description`) | ipucu | Bu sayfadaki seçenekler, Araç çubuğu konumu dışında, klasik çalışma ekranında da geçerlidir. | Except Toolbar position, the options on this page also apply to the classic study screen. | Yeni |
| help.settings.newStudy.toggle | **Yeni çalışma ekranını kullan** alt satırı (iki hâl), `:1135-1143` | alt satır | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.screen.* | Ekran grubu alt satırları, `:1159-1162` | alt satır | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.toolbar | **Araç çubuğunu göster**, `:1165` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.answerButtons.* | **Yanıt düğmelerini göster** alt satırı ve engelleme uyarısı, `:1182`, `:1187-1191` | alt satır, uyarı | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.hideHardEasy | `:1200` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.autoAdvance | **Otomatik ilerleme** alt satırı, `:1201` | alt satır | Deste seçeneklerindeki Otomatik ilerleme sürelerini çalıştırır. Süreleri her deste için Deste seçenekleri › Otomatik ilerleme bölümünde verin; 0 saniye kapalı demektir. | Runs the Auto Advance times set in deck options. Set them per deck in Deck Options › Auto Advance; 0 seconds means off. | Mevcut — güncelle (eski metin: Kart açıldıktan sekiz saniye sonra cevabı gösterir. / Reveals the answer eight seconds after a card opens.) |

---

## 4. İnceleme (`renderReviewing`, `settings.tsx:1206-1233`)

### help.settings.scheduling.sheet — Zamanlama bilgi sayfası (yeni)
- **Yer:** İnceleme sayfası, **Zamanlama** grubunun başlığının sağında **?** düğmesi (yeni), `app/settings.tsx:1208` (`Group onHelpPress`)
- **Erişilebilirlik etiketi:** Zamanlama yardımını aç / Open scheduling help
- **Tetikleyici:** ?'ye dokunma
- **Bileşen:** bilgi sayfası (`HelpSheet`: eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/16-settings.md#reviewing`
- **Durum:** Yeni

**TR**
- Üst etiket: İNCELEME
- Başlık: Gün, önceden öğrenme ve zaman kutusu
- Özet: Bu üç ayar bütün desteler için geçerlidir. Destelere özel kurallar Deste seçenekleri'ndedir.
- Maddeler: (1) **Sonraki günün başlangıcı:** Gün bu saatte değişir. Bu saatten önce çalıştıklarınız bir önceki güne sayılır; günlük limitler, gömülen kartlar ve istatistiklerdeki "bugün" buna göre hesaplanır. (2) **Önceden öğrenme sınırı:** Çalışacak başka kart kalmadığında, adımının bitmesine bu kadar dakikadan az kalan öğrenme kartları beklemeden gelir. 0 bu özelliği kapatır. (3) **Zaman kutusu sınırı:** Süre dolduktan sonraki ilk cevapta kaç kart çalıştığınızı gösterir; Devam yeni bir blok başlatır, Bitir destelere döner. 0 kapalıdır.
- Not: Değişiklikler Kaydet'e dokununca geçerli olur.

**EN**
- Eyebrow: REVIEWING
- Title: The day, learn ahead and timebox
- Summary: These three settings apply to all decks. Rules for single decks are in Deck Options.
- Points: (1) **Start of next day:** The day changes at this hour. What you study before it counts towards the previous day; daily limits, buried cards and "today" in the statistics follow it. (2) **Learn ahead limit:** When nothing else is left, learning cards whose step ends within this many minutes come without waiting. 0 turns this off. (3) **Timebox time limit:** On the first answer after the time is up, shows how many cards you studied; Continue starts a new block, Finish returns to the decks. 0 is off.
- Note: Changes take effect when you tap Save.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.dayRollover | **Sonraki günün başlangıcı**, `:1209` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.learnAhead | **Önceden öğrenme sınırı**, `:1210` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.timebox | **Zaman kutusu sınırı**, `:1211` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.keepScreenOn | **Ekranı açık tut**, `:1214` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.autoplay | **Sesi otomatik oynat**, `:1215` (şu an alt satırsız) | alt satır | Bütün destelere uygulanır. Tek bir destede kapatmak için Deste seçenekleri › Ses bölümünü kullanın. | Applies to all decks. To turn it off for one deck, use Deck Options › Audio. | Yeni |
| help.settings.playbackRate | **Ses oynatma hızı** alt satırı, `:1218` | alt satır | Varsayılan ayar grubunu ve kendi hızı olmayan desteleri etkiler. Bir ayar grubuna özel hız Deste seçenekleri › Ses bölümünden verilir. | Affects the Default preset and decks without a speed of their own. A preset's own speed is set in Deck Options › Audio. | Mevcut — güncelle (eski metin: Kartlardaki seslerin varsayılan çalma hızı. / Default playback speed for audio in cards.) |
| help.settings.interruptAudio | **Yanıtlarken sesi kes**, `:1230` (şu an alt satırsız) | alt satır | Açıkken bir kartı cevapladığınızda çalan ses veya sesli okuma durur. | When on, answering a card stops any audio or speech that is playing. | Yeni |
| help.reviewer.learnAheadButton | Çalışma ekranı, **Şimdilik hepsi bu kadar!** durumu, **Bekleme ayarları** düğmesi, `app/(tabs)/index.tsx:3186-3194` | düğme | (mevcut etiket) | (existing) | Mevcut — koru. Davranış önerisi: Ayarlar'ı doğrudan İnceleme sayfasında açsın (ör. `/settings?section=reviewing`). |

---

## 5. Bildirimler (`renderNotifications`, `settings.tsx:1235-1290`)

### help.settings.notifications.sheet — Bildirimler bilgi sayfası (yeni)
- **Yer:** Bildirimler sayfası, **Bildirimler** grubunun başlığının sağında **?** düğmesi (yeni), `app/settings.tsx:1236` (`Group onHelpPress`)
- **Erişilebilirlik etiketi:** Bildirim yardımını aç / Open notifications help
- **Tetikleyici:** ?'ye dokunma
- **Bileşen:** bilgi sayfası (`HelpSheet`)
- **Daha fazla bilgi:** `tr/16-settings.md#notifications`
- **Durum:** Yeni (IOS_RELEASE_CHECKLIST "Notification" satırı, titreşim ve ışığın iOS'ta yönetildiğini anlatan bir metin bekliyor)

**TR**
- Üst etiket: BİLDİRİMLER
- Başlık: Günlük çalışma hatırlatması
- Özet: Her gün seçtiğiniz saatte, zamanı gelmiş tekrar kartlarınız seçtiğiniz sınırı aşıyorsa bir hatırlatma gelir. Bildirime dokunmak Desteler'i açar.
- Maddeler: (1) Yalnızca tekrar kartları sayılır; yeni kartlar ve öğrenme adımındaki kartlar sayılmaz. (2) Ses, titreşim, afiş ve Odak modları iPhone Ayarları › Bildirimler › TusAnkiM bölümünden yönetilir. İlk bildirimler sessizce Bildirim Merkezi'ne gelebilir. (3) Hatırlatmalar uygulamayı her açıp kapattığınızda yeniden hesaplanır; uygulama simgesinde rozet gösterilmez.
- Not (web): Web sürümünde hatırlatma yalnızca uygulama bir tarayıcı sekmesinde açıkken gelir.

**EN**
- Eyebrow: NOTIFICATIONS
- Title: Daily study reminder
- Summary: Every day at the time you choose, a reminder arrives if the reviews due exceed the limit you picked. Tapping it opens Decks.
- Points: (1) Only review cards count; new cards and cards in a learning step do not. (2) Sound, vibration, banners and Focus modes are managed in iPhone Settings › Notifications › TusAnkiM. The first reminders may arrive quietly in Notification Center. (3) Reminders are recalculated every time you open or leave the app; the app icon shows no badge.
- Note (web): In the web version, reminders arrive only while the app is open in a browser tab.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.notify.threshold.N | **Şu durumda bildir** seçici satırları, `:487-495` (`${threshold}’den fazla…`) | seçenek | 10’dan / 25’ten / 50’den / 75’ten / 100’den / 150’den / 200’den / 500’den fazla tekrar kartının zamanı geldiyse | More than 10 / 25 / 50 / 75 / 100 / 150 / 200 / 500 reviews are due | Mevcut — güncelle (eski metin: `N’den fazla kartın zamanı geldiyse` / `More than N cards are due`: ek her sayı için doğru değil ve yeni kartlar sayılmadığı için "tekrar" denmeli) |
| help.settings.notify.never / waiting | Aynı seçicinin ilk iki satırı, `:485-486` | seçenek | Asla bildirme / Bekleyen tekrar varsa | Never notify / When reviews are waiting | Mevcut — koru |
| help.settings.notify.time | **Hatırlatma saati** alt satırı, `:1262` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.notify.permissionOff | **Bildirimler** anahtarının altı, anahtar açık ama iOS/tarayıcı izni yokken (yeni; `getStudyNotificationPermission()` ile), `:1237-1242` | durum satırı + düğme | Bildirim izni kapalı, hatırlatma gelmeyecek. [Ayarları Aç] | Notification permission is off, so no reminder will arrive. [Open Settings] | Yeni. Web: "Tarayıcı izni yok. Anahtarı kapatıp açarak izin isteyin." / "No browser permission. Turn the switch off and on to ask for it." |
| help.settings.notify.unsupported | Anahtar, desteklenmeyen tarayıcı, `:595-600` | uyarı | Bildirimler desteklenmiyor — Bu tarayıcı site bildirimlerini desteklemiyor. | Notifications not supported — This browser does not support site notifications. | Mevcut — koru (yerel/Android metni "AnkiMobile uyumlu" ifadesini kullanıyor; iPhone'da görünmez) |
| help.settings.notify.permissionWeb | Web izni reddedildi, `:619-625` | uyarı | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.notify.permissionIos | iOS izni reddedildi, `:628-636` | uyarı + Ayarları Aç | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.notify.failed | İzin alınamadı, `:645-653` | uyarı | (mevcut metin) | (existing) | Mevcut — koru |
| help.notifications.reminder | Bildirimin kendisi, `lib/studyReminderSchedule.ts:61-71` | bildirim | Çalışma zamanı — N tekrar kartı sizi bekliyor. | Time to study — N reviews are waiting. | Mevcut — koru |

---

## 6. Kontroller (`renderControls`, `settings.tsx:1292-1522`; Klavye: `KeyboardSettingsSection.tsx`)

### help.settings.controls.sheet — Kontroller yardımı
- **Yer:** **Dokunma ve kaydırma** grubunun **?** düğmesi, `app/settings.tsx:1300`; pencere `:1702-1837`
- **Tetikleyici:** ?'ye dokunma
- **Bileşen:** mevcut ortalanmış iletişim kutusu (tutamaçsız)
- **Daha fazla bilgi:** `tr/16-settings.md#controls` (alttaki **Anladım** düğmesinin üstüne bağlantı, `:1826-1834`)
- **Durum:** Mevcut — genişlet. Mevcut paneller (giriş, 9 noktalı dokunma, durum, şu anki yönler, yanıt hareketleri, hassasiyet, hazır düzenler, güvenli kullanım) korunur; **Hassasiyet ayarı** panelinden sonra şu panel eklenir:

**TR**
- Panel başlığı: Dikey kaydırma
- Metin: Yukarı ve aşağı kaydırma, hareketi ekranın sol veya sağ kenarından başlattığınızda çalışır. Kartın ortasında dikey kaydırma uzun kartları kaydırır. Sola ve sağa kaydırma kartın her yerinde çalışır.

**EN**
- Panel title: Vertical swipes
- Text: Up and down swipes work when you start the movement at the left or right edge of the screen. In the middle of the card a vertical swipe scrolls long cards. Left and right swipes work anywhere on the card.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.controls.description | Grup açıklaması, `:1296-1299` | ipucu | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.ninePoint / swipesToggle / presets / sensitivity | Alt satırlar, `:1306`, `:1360`, `:1372`, `:1415` | alt satır | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.swipes.verticalHint | Dört yön satırının altı, hassasiyetin üstü, `:1398-1413` arası | ipucu | Yukarı ve aşağı kaydırmayı ekranın sol veya sağ kenarından başlatın. | Start up and down swipes at the left or right edge of the screen. | Yeni (Hızlı yanıt düzeni yukarı/aşağı kullandığı için gerekli) |
| help.settings.toolsButton.* | Ekran kontrolü alt satırları ve önizleme yazısı, `:1426`, `:1437`, `:1513-1514` | alt satır | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.keyboard.description | **Klavye** grubu açıklaması, `KeyboardSettingsSection.tsx:89-92` | ipucu | Bir satırda Değiştir’e dokunun, ardından bağlı fiziksel klavyede bir tuşa basın. Her tuşu yalnızca bir işleme atayın. Esc çalışmadan çıkar, Z veya U son işlemi geri alır. Değişiklikleri Kaydet ile saklayın. | Choose Change on a row, then press a key on a connected physical keyboard. Give each key to only one action. Esc leaves study, and Z or U undoes the last action. Use Save to keep your changes. | Mevcut — güncelle (eski metin: Bir satırda Değiştir’e dokunun, ardından bağlı fiziksel klavyede bir tuşa basın. Değişiklikleri Kaydet ile saklayın. / Choose Change on a row, … Use Save to keep your changes.) |
| help.settings.keyboard.duplicate | Bir tuş ikinci bir işleme atanınca, `KeyboardSettingsSection.tsx:44-53` | uyarı (satır içi) | “{key}” tuşu zaten “{action}” için kullanılıyor. Başka bir tuş seçin. | “{key}” is already used for “{action}”. Choose another key. | Yeni (şu an tekrar eden tuşlar kaydedilirken bütün kısayollar sessizce varsayılana dönüyor) |

---

## 7. Erişilebilirlik (`renderAccessibility`, `settings.tsx:1524-1540`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.longPress | **Cevabı göster basılı tutma süresi** alt satırı, `:1533` | alt satır | 0 ms normal dokunmadır. Yalnızca Cevabı göster düğmesine uygulanır. | 0 ms uses a normal tap. Applies only to the Show Answer button. | Mevcut — güncelle (eski metin: 0 ms normal dokunmadır. / 0 ms uses a normal tap.) |
| help.settings.doubleTap | **Çift dokunma aralığı**, `:1534` | alt satır | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.cardZoom | **Kart yakınlaştırma**, `:1527` (şu an alt satırsız) | alt satır | Kartın tamamını büyütür; görselleri ayrıca aşağıdaki ayarla ölçekleyin. | Scales the whole card; scale images separately with the setting below. | Yeni |

---

## 8. Veri yönetimi (`renderData`, `settings.tsx:1542-1595`)

Bakım pencerelerinin (kontrol raporu, onarım onayı ve sonucu, sıfırlama) metinleri `15-backups-and-maintenance` alanıyla birlikte gözden geçirilir; burada yalnızca Ayarlar satırları var.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.autoBackup | **Otomatik yedekleme** alt satırı, `:1547` | alt satır | Değişiklik varsa yaklaşık 30 dakikada bir | About every 30 minutes when there are changes | Mevcut — güncelle (eski metin: Haftada bir / Weekly; kod varsayılanı 30 dk, `lib/backupPolicy.ts:2`) |
| help.settings.manageBackups | **Yedekleri yönet**, `:1556` | ayrıntı | (mevcut metin) | (existing) | Mevcut — koru |
| help.settings.checkDb / repair | `:1571`, `:1580` | ayrıntı | (mevcut metinler) | (existing) | Mevcut — koru |
| help.settings.resetProgress.detail | **İlerlemeyi sıfırla** satırı (şu an ayrıntısız), `:1585-1592` (`detail`) | ayrıntı | Bütün desteleri, kartları ve geçmişi siler; önce yedek alır | Deletes all decks, cards and history; backs up first | Yeni |
| help.settings.resetProgress.confirm | Sıfırlama onayı, `:979` | onay | Bütün desteler, notlar, kartlar, not türleri, çalışma geçmişi ve Kronometre oturumları silinecek; uygulama ayarları da ilk değerlerine dönecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulur. | All decks, notes, cards, note types, study history and Stopwatch sessions will be deleted, and app settings will return to their starting values. A restorable safety backup is created first. | Mevcut — güncelle (eski metin: Kartlar, çalışma geçmişi ve ilerleme silinecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulacak.) — 15 alanıyla eşgüdümlü |

---

## 9. Hakkında (`renderAbout`, `settings.tsx:1597-1602`)

`in-app/00-help-center.md` yerleşimi onaylanır: **Yardım ve kullanım kılavuzu** satırı Hakkında
grubunun ilk satırıdır (`:1599`'daki **Gizlilik politikası** satırının üstü, aynı `linkRow` stili,
ok yerine `›` çünkü uygulama içinde açılır). Ek olarak **Kullanım koşulları** satırı ve bağımsız
proje cümlesi eklenir; ana sayfadaki alt satır (bölüm 1) "Yardım" kelimesini içerecek şekilde
güncellenir, böylece Ayarlar aramasında "yardım" yazmak Hakkında'yı bulur. iPhone'da kalıcı tek
giriş budur; kenar çubuğundaki **Yardım** düğmesi (`components/Sidebar.tsx:324-327`'den sonra, `:329`
"Powered by" satırından önce) yalnızca web sürümünde, en az 768 px genişlikteki pencerede görünür.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.settings.about.description | Grup açıklaması, `:1598` | açıklama | Sürüm {version} • Anki paketleriyle çalışan, verilerini cihazınızda tutan bağımsız bir kart uygulaması. Anki veya Ankitects ile bağlantılı değildir. | Version {version} • An independent flashcard app that works with Anki packages and keeps its data on your device. Not affiliated with Anki or Ankitects. | Mevcut — güncelle (eski metin: Sürüm {v} • Anki paket desteğine sahip yerel öncelikli kart uygulaması / Version {v} • Local-first flashcard app with Anki package support) |
| help.settings.about.help | Yeni ilk satır, `:1599` üstü | bağlantı satırı → `/help` | Yardım ve kullanım kılavuzu | Help and user guide | Yeni |
| help.settings.about.privacy | `:1599` | bağlantı satırı ↗ | Gizlilik politikası | Privacy Policy | Mevcut — koru |
| help.settings.about.terms | Gizlilik satırının altı (yeni) → `https://bugraguclu.github.io/tus-flashcard-app/terms.html` | bağlantı satırı ↗ | Kullanım koşulları | Terms of Use | Yeni (`docs/terms.html` var ama uygulamadan bağlantısı yok) |
| help.settings.about.support | `:1600` | bağlantı satırı ↗ | Destek | Support | Mevcut — koru |

---

## 10. İzin uyarıları

Hepsi `lib/permissions.ts:20-41` üzerinden açılır: iPhone'da **Ayarları Aç** / **İptal**, web'de
`permissions.webSiteSettings` metni.

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.permissions.microphone | Ses kaydı başlatma, `components/AudioRecordModal.tsx:43-50` | uyarı | İzin gerekli — Ses kaydetmek için mikrofon izni vermeniz gerekiyor. Ayarlardan mikrofon iznini açabilirsiniz. | Permission Required — Allow microphone access to record audio. You can enable microphone access in Settings. | Mevcut — koru |
| help.permissions.photos | Galeriden görsel/video, `components/MediaAttachButton.tsx:128-135`, `:237-244` | uyarı | (mevcut metin) | (existing) | Mevcut — koru |
| help.permissions.camera | Kameradan fotoğraf, `components/MediaAttachButton.tsx:163-170` | uyarı | (mevcut metin) | (existing) | Mevcut — koru |
| help.permissions.photoEditor | Çizim sayfasına görsel/fotoğraf, `components/PhotoEditorModal.tsx:507-514`, `:532-539` | uyarı | (mevcut metinler) | (existing) | Mevcut — koru |
| help.permissions.web | Web'de bütün izin uyarıları, `lib/i18n.ts:42` | uyarı | Tarayıcı bu izni vermedi. Adres çubuğunun yanındaki site ayarlarından bu siteye izin verip tekrar deneyin. | The browser did not grant this permission. Allow it for this site in the site settings next to the address bar, then try again. | Mevcut — koru |
| help.permissions.iosSystem | iOS sistem penceresi metinleri, `locales/tr.json`, `locales/en.json` (fotoğraf, kamera, mikrofon) | sistem metni | (mevcut metinler) | (existing) | Mevcut — koru |

---

## 11. Başlangıç hatası, çökme ekranı, bulunamayan sayfa

### help.shell.startupError — Başlangıç hatası ekranı
- **Yer:** `app/(tabs)/_layout.tsx:403-410` (şu an yalnızca simge, başlık ve metin; düğme yok)
- **Tetikleyici:** başlatma başarısız (`startupError === 'failed'`) veya 30 sn'yi aştı (`'timeout'`, `hooks/useAppStartup.ts:249-258`)
- **Bileşen:** tam ekran durum; mevcut `retryStartup` ve `continueStartupWait` işlevlerine bağlanan düğmeler (`hooks/useAppStartup.ts:272-281`, bugün kullanılmıyor)
- **Daha fazla bilgi:** — (SSS bölümü hazır olunca "Nasıl çözülür?" bağlantısı eklenebilir)
- **Durum:** Mevcut — güncelle (eski metin, iki durumda da: Beklenmeyen Bir Hata Oluştu — Uygulama başlatılamadı. Uygulamayı kapatıp yeniden açın; sorun sürerse destek ekibiyle iletişime geçin.)

**TR**
- Süre aşımı — Başlık: Başlatma uzun sürüyor · Metin: Verileriniz hazırlanıyor. Büyük bir koleksiyonda bu birkaç dakika sürebilir; uygulamayı kapatmayın. Hazır olunca kendiliğinden açılır. · Düğme: Beklemeye devam et
- Başarısız — Başlık: Beklenmeyen Bir Hata Oluştu · Metin: Uygulama başlatılamadı. Verileriniz silinmedi. Tekrar deneyin; sorun sürerse uygulamayı kapatıp açın veya Ayarlar › Hakkında › Destek üzerinden bize yazın. · Düğme: Tekrar dene

**EN**
- Timeout — Title: Startup is taking longer than usual · Text: Your data is being prepared. With a large collection this can take a few minutes; keep the app open. It opens by itself when ready. · Button: Keep waiting
- Failed — Title: Something went wrong · Text: The app could not start. Your data has not been deleted. Try again; if it keeps happening, close and reopen the app or write to us via Settings › About › Support. · Button: Try Again

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.shell.crash | Çökme ekranı, `app/_layout.tsx:156-286` | tam ekran | Beklenmeyen Bir Hata Oluştu — Uygulama çalışırken beklenmeyen bir durumla karşılaşıldı. Verileriniz güvende ve korunuyor. · Tekrar dene · Ana Ekrana Dön · Teknik detayları göster ▾ · Hata Bilgisini Kopyala | Something went wrong — An unexpected issue occurred while running the app. Your data is safe and intact. · Try Again · Return to Home · Show technical details ▾ · Copy Error Info | Mevcut — koru (dil cihazı izlemiyor, bkz. ekip notları) |
| help.shell.loading | Uzun açılışta, `app/_layout.tsx:455-466` | durum | Yükleniyor… | Loading… | Mevcut — koru |
| help.shell.notFound | `app/+not-found.tsx:24-36` | tam ekran | Sayfa bulunamadı — Bu adreste bir sayfa yok. Kartlarınız ve çalışma geçmişiniz etkilenmedi. · Destelere dön | Page not found — There is no page at this address. Your cards and review history are unaffected. · Back to Decks | Mevcut — koru |

---

## 12. Web sürümü

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.web.secondaryTab | İkinci sekmenin üst şeridi, `app/_layout.tsx:524-530` (`root.secondaryTab`) | şerit | ⚠️ Uygulama başka bir sekmede açık — değişiklikler bu sekmede kaydedilmez. Diğer sekmeyi kapatıp bu sayfayı yeniden yükleyin. | ⚠️ The app is open in another tab — changes in this tab will not be saved. Close the other tab and reload this page. | Mevcut — güncelle (eski metin, ikinci cümle olmadan) |
| help.web.readOnlyAction | İkinci sekmede kaydetme denemesi, `lib/i18n.ts:69` (`root.readOnlyTabAction`) | uyarı | (mevcut metin) | (existing) | Mevcut — koru |
| help.web.dbError | Web veritabanı açılamadı, `app/_layout.tsx:487-508` | tam ekran | Veritabanı başlatılamadı + `root.storageReadError` · Tekrar dene | Could not initialize the database + `root.storageReadError` · Try Again | Mevcut — koru |
| help.web.dropOverlay | Dosya sürüklenirken, `components/WebAppIntegrations.tsx:108-116` | katman | İçe aktarmak için bırakın · .apkg · .colpkg · .csv · .tsv · .txt | Drop to import · .apkg · .colpkg · .csv · .tsv · .txt | Mevcut — koru |
| help.web.unknownFile | Desteklenmeyen dosya bırakılınca, `WebAppIntegrations.tsx:88-94` | uyarı | Bilinmeyen dosya biçimi — Yalnızca .apkg, .colpkg, .zip, .csv, .tsv ve .txt dosyaları içe aktarılabilir. | Unknown file format — Only .apkg, .colpkg, .zip, .csv, .tsv and .txt files can be imported. | Mevcut — güncelle (eski metin `.zip` içermiyor; `.zip` kabul ediliyor, `lib/importFile.ts:30`) |

---

## 13. Otomasyon bağlantıları

### help.automation.ignored — Açılamayan bağlantı uyarısı (yeni)
- **Yer:** iPhone: `app/_layout.tsx:601-606` (`externalActionRoute` null döndüğünde); web: `app/x-callback-url.tsx:22-25` (deste listesine geçmeden önce). Kaynak: `lib/externalActionRoute.ts:23-26` (bugün yalnızca konsol uyarısı)
- **Tetikleyici:** `addnote` isteğinde not türü veya deste bulunamadığında, deste filtrelenmiş olduğunda ya da zorunlu değer eksik olduğunda
- **Bileşen:** uyarı (`alert`), ikincil düğme **Daha fazla bilgi**
- **Daha fazla bilgi:** `tr/18-shortcuts-and-automation.md#add-note-url`
- **Durum:** Yeni

**TR**
- Başlık: Bağlantı açılamadı
- Metin: “{deck}” destesi veya “{type}” not türü bulunamadı. Adları kontrol edin; hazır not türlerinde İngilizce adı kullanın (örneğin Basic, Cloze).

**EN**
- Title: Couldn't open the link
- Text: The deck “{deck}” or the note type “{type}” could not be found. Check the names; for built-in note types use the English name (for example Basic, Cloze).

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.automation.saved | Bağlantıyla açılan not kaydedilince, `app/editor.tsx:983-995` | uyarı | Tamamlandı — Not kaydedildi; N kart oluşturuldu. | Done — Note saved; N card(s) created. | Mevcut — koru |
| help.decks.shortcutFailed | Kestirme eklenemedi, `app/(tabs)/decks.tsx:726-731` | uyarı | Kestirme eklenemedi — Kestirme şu an eklenemedi. Daha sonra yeniden deneyin. | Could not add shortcut — The shortcut could not be added right now. Try again later. | Mevcut — güncelle (eski metin Expo Go ve yeniden derlemeden söz ediyor: "Bu özellik Expo Go yerine TusAnkiM uygulama yapısında çalışır. Uygulamayı yeniden derleyip tekrar deneyin.") — 04-decks alanıyla eşgüdümlü |
