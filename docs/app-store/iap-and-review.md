# App Store inceleme ve uygulama içi satın alma teslimi

## Non-consumable ürün

- Reference Name: `BKA TUS Complete Lifetime`
- Product ID: `com.tusankim.bka.complete.lifetime`
- Type: `Non-Consumable`
- Türkiye temel fiyatı: App Store Connect’te `₺1.500` fiyat noktası (mevcutsa; son tutarı Apple belirler)
- Display Name (TR): `BKA TUS Tam Koleksiyon`
- Description (TR): `9.583 TUS kartı ve tüm alt konu desteleri`
- Display Name (EN): `BKA TUS Complete Catalog`
- Description (EN): `9,583 TUS cards and every topic subdeck`
- RevenueCat entitlement: `bka_tus_complete`
- RevenueCat offering: `default`

İlk non-consumable ürün uygulamanın yeni sürümüyle aynı inceleme gönderimine eklenmelidir. İnceleme ekran görüntüsü, teklif ekranını ve 1.500 TL fiyatı açıkça göstermeli; desteklenen iPhone ekran görüntüsü ölçülerinden biri kullanılmalıdır.

## App Review notu

TusAnkiM is a free, accountless spaced-repetition flashcard app. On first launch it presents the 1,500 TRY complete-catalog offer before the deck list. The user can explicitly choose “1.200 ücretsiz kartla devam et” to enter the physical trial containing exactly 100 cards from each of 12 TUS courses (1,200 cards total). The complete catalog is not unlocked initially. Users may also create/import/export their own Anki-style decks without purchasing.

To find the IAP: launch the app → Desteler (Decks) → tap the “Ücretsiz deneme sürümü” banner or the “Deneme” badge → tap the gold purchase button. Product ID: com.tusankim.bka.complete.lifetime. It is a one-time non-consumable that unlocks the physical 9,583-card catalog and all topic subdecks. “Satın almayı geri yükle” is on the same screen.

No account or review credentials are required. Please use the Apple sandbox environment. Development builds contain an explicitly labeled local payment simulation for UI testing; production builds compile that path out and unlock only when RevenueCat reports the active bka_tus_complete entitlement.

The app is for medical exam education only. It does not diagnose, treat, monitor, or provide clinical decision support.

## App Privacy yanıtları

RevenueCat anonim kimlik kullanımı ve mevcut uygulama davranışı için:

- Data collected: `Purchases → Purchase History`
- Purposes: `App Functionality` ve `Analytics`
- Linked to identity: `No`
- Used for tracking: `No`
- Advertising: `No`
- Kart içeriği/çalışma geçmişi: geliştirici veya RevenueCat sunucusuna gönderilmez

RevenueCat’e özel kullanıcı kimliği, reklam entegrasyonu veya başka analiz SDK’sı eklenirse bu yanıtlar yeniden değerlendirilmelidir.

## İnceleme öncesi mağaza kontrolleri

- [ ] Paid Apps Agreement kabul edildi; banka ve vergi bilgileri tamamlandı.
- [ ] Non-consumable fiyat ve Türkiye kullanılabilirliği ayarlandı.
- [ ] Ürün `default` offering’e, ürün de `bka_tus_complete` entitlement’a bağlandı.
- [ ] EAS production environment içinde `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` tanımlandı.
- [ ] Sandbox’ta başarı, kullanıcı iptali, Ask to Buy/deferred, ağ hatası ve restore sınandı.
- [ ] İlk IAP, 1.0.0 uygulama sürümüyle aynı gönderime eklendi.
- [ ] App Review screenshot yüklendi.
- [ ] 6,9 inç iPhone ekran görüntüleri alfa kanalsız yüklendi.
- [ ] Gizlilik, destek ve koşullar URL’leri herkese açık ve HTTPS üzerinden erişilebilir.
- [ ] Güncel yaş derecelendirme soruları yanıtlandı.
- [ ] İçerik hakları beyanı yalnızca imzalı ticari lisans alındıktan sonra onaylandı.
