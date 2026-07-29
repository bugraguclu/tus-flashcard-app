# iOS App Store Release Pack

Last audited: 29 July 2026

## Release decision

The codebase is a release candidate only after every item under **Blocking before submission**
is cleared. Passing local tests or an Xcode simulator build does not replace App Store Connect
metadata, signing, real-device permission/audio checks, or Apple review.

## Blocking before submission

- **Store-facing product name:** `TusAnkiM` uses the Anki name even though this app is not an
  official Anki client or AnkiWeb-compatible client. Approve a distinct store name such as
  `TUS Kart` before submitting. Do not describe the app as official or fully Anki-compatible.
- **Public URLs:** merge the `docs/` and GitHub Pages workflow, enable Pages through GitHub
  Actions, and verify both URLs return HTTP 200:
  - Support: `https://bugraguclu.github.io/tus-flashcard-app/`
  - Privacy: `https://bugraguclu.github.io/tus-flashcard-app/privacy.html`
- **Real device:** verify camera, photo-library and microphone permission prompts; record and
  replay at least two audio files in sequence; import/export a backup; background and relaunch.
- **App Store Connect:** create the app record, accept current agreements, configure signing,
  complete privacy answers, upload screenshots, select age rating and submit the final archive.
- **Content ownership:** confirm every bundled TUS card, image, sound and font is owned or
  licensed for distribution.

## Suggested Turkish metadata

Use the final approved product name in place of `[ÜRÜN ADI]`.

- Name: `[ÜRÜN ADI]`
- Subtitle: `TUS için akıllı tekrar`
- Promotional text: `Kartlarını çevrimdışı oluştur, Anki V3 tabanlı aralıklı tekrar akışıyla
  çalış ve ilerlemeni net istatistiklerle takip et.`
- Keywords: `TUS,flashcard,kart,tekrar,aralıklı tekrar,tıp,sınav,çalışma`
- Category: `Education`
- Secondary category: `Medical` (only if the bundled content justifies it)

### Description draft

`[ÜRÜN ADI]`, TUS hazırlığını kart tabanlı ve sürdürülebilir bir çalışma düzenine dönüştürür.

Kartlarını ders ve konulara ayır; yeni, öğrenilen ve tekrar zamanı gelen kartları tek bir
akışta çalış. Tekrar aralıkları yanıtlarına göre planlanır ve tüm ilerleme cihazında saklanır.

Öne çıkanlar:

- Anki V3 davranışını temel alan Again / Hard / Good / Easy çalışma akışı
- Ana ve alt desteler, deste bazlı seçenekler ve özel çalışma desteleri
- Temel, yazarak cevaplama ve çift taraflı kart türleri
- Kartlara fotoğraf, görsel ve ses ekleme; fotoğraflara metin, çizim, vurgu, şekil ve çalışma örtüsü ekleme
- Kart gömme, askıya alma, işaretleme, bayraklama, unutma ve tarih belirleme
- Günlük çalışma özeti, haftalık seri ve yanıt istatistikleri
- JSON ve Anki paketi içe aktarma; cihaz içi yedekleme ve dışa aktarma
- Açık/koyu tema ve çevrimdışı kullanım

Uygulama tıbbi tanı veya tedavi hizmeti sunmaz. Çalışma içeriklerini güncel ve güvenilir
kaynaklarla doğrulayın.

## App Privacy answers

Based on the audited build, select **Data Not Collected**. The app contains no account,
advertising, analytics or crash-reporting SDK and sends no app data to a developer-operated
server. Camera, photo-library, microphone, document-picker and share-sheet use is initiated
by the user and the resulting data remains on-device or goes only to a destination the user
chooses.

Re-audit these answers before every release and whenever sync, analytics, crash reporting,
accounts, cloud backup or a third-party SDK is added.

## App Review notes draft

The app does not require an account or network connection.

Suggested review path:

1. Open **Desteler**, select a deck, then tap **Çalış**.
2. Tap **Cevabı Göster**, then rate the card with Tekrar / Zor / İyi / Kolay.
3. In the reviewer, **Göm** hides a card until the next study day; **Askıya Al** hides it
   until manually restored. **Diğer** opens card/note actions.
4. Open **Kart Ekle**. Tap the plus button beside Soru or Cevap to trigger the optional
   camera, photo-library or microphone permissions.
5. Open **Ayarlar › Veri Yönetimi** to test import, export, backup and database checks.

No demo credentials are needed. Permission-gated features remain optional; text-only card
creation and studying work when permissions are denied.

## Screenshot plan

Because `supportsTablet` is enabled, prepare both iPhone and iPad screenshot sets. Use real
in-app UI and consistent seeded content; do not show debug menus, simulator chrome, empty
states presented as finished functionality, or placeholder artwork.

Recommended sequence:

1. Deck dashboard with New / Learn / Review counts
2. Reviewer question side
3. Reviewer answer side with four rating buttons
4. Card editor with card types and media attachment
5. Weekly streak and statistics
6. Deck options or custom study

## Technical release configuration

- Bundle identifier: `com.tusankim.app`
- EAS owner: `smbg`
- EAS project: `e9a513b4-4561-4bf2-8b6e-2bf50e09364d`
- Version: `1.0.0`
- Production build number: remotely auto-incremented by EAS
- Export compliance: non-exempt encryption is not used
- Privacy manifest: tracking false; collected data types empty; required-reason API entries
  are supplied by the native dependencies during prebuild
- Orientation: portrait
- iPad: supported

## Final submission checklist

- [ ] Distinct product name approved and applied to app config and metadata
- [ ] Version/build numbers finalized
- [ ] Release tests and Expo Doctor pass
- [ ] Xcode Release builds for iPhone and iPad simulator
- [ ] Real-device audio/media/import/export test passes
- [ ] App icon and splash inspected on light and dark system appearance
- [ ] Support and privacy URLs are publicly reachable
- [ ] App Privacy and permission descriptions match the binary
- [ ] iPhone and iPad screenshots uploaded
- [ ] Copyright/licensing confirmed
- [ ] Archive uploaded and TestFlight smoke test passes
- [ ] App Review notes, age rating and category completed
