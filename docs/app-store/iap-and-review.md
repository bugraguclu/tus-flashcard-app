# App Store inceleme ve uygulama içi satın alma teslimi

> Güncel ürün kararı: ödeme akışı kapalıdır. Preview ve production profilleri
> `EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false` ile derlenir; “Kartları ücretsiz aç” Apple veya
> RevenueCat’e bağlanmadan tam paketi kurar. Aşağıdaki IAP yapılandırması gelecekte yeniden
> etkinleştirme için saklanan plandır ve mevcut build ile gönderilmemelidir.

## Non-consumable ürün

- Reference Name: `BKA TUS Complete Lifetime`
- Product ID: `com.tusankim.bka.complete.lifetime`
- Type: `Non-Consumable`
- Türkiye temel fiyatı: App Store Connect’te `₺1.500` fiyat noktası (mevcutsa; son tutarı Apple belirler)
- Display Name (TR): `BKA TUS Tam Koleksiyon`
- Description (TR): `12 dersi kapsayan 9.583 hazır TUS kartı`
- Display Name (EN): `BKA TUS Complete Catalog`
- Description (EN): `9,583 ready-made TUS cards across 12 courses`
- RevenueCat entitlement: `bka_tus_complete`
- RevenueCat offering: `default`

Bu ürün yalnız ödeme yeniden etkinleştirilecek gelecekteki bir sürüm içindir. Mevcut ücretsiz build ile
App Store Connect incelemesine eklenmemeli, metadata veya ekran görüntülerinde tanıtılmamalıdır. Gelecekte
etkinleştirilirse ilk non-consumable ürün ilgili uygulama sürümüyle aynı inceleme gönderimine eklenmeli ve
gerçek fiyatı gösteren ayrı IAP inceleme görseli sağlanmalıdır.

## App Review notu

TusAnkiM is a free, accountless, Anki-style spaced-repetition flashcard app. Every study feature is free and there is no launch paywall: the app opens straight into the deck list, where the user can create decks, import/export Anki packages, review, and see statistics without paying anything.

The current build contains no active purchase flow. To open the optional pre-made card pack: launch the app → Desteler (Decks) → tap “BKA TUS” → tap “Kartları ücretsiz aç” (Unlock cards for free). The full pack is installed locally without contacting Apple or RevenueCat.

The dormant product ID is com.tusankim.bka.complete.lifetime. It must not be submitted or advertised while payment is disabled. Installing the 9,583 cards does not modify anything the user created.

No account, review credentials or sandbox purchase is required for the current build.

The app is for medical exam education only. It does not diagnose, treat, monitor, or provide clinical decision support.

## App Privacy yanıtları

Mevcut ücretsiz erişim Apple veya RevenueCat’i çağırmadığı için uygulama tarafından satın alma geçmişi
toplanmaz. `NSPrivacyCollectedDataTypes` boştur; kart içeriği ve çalışma geçmişi de cihazdan çıkmaz.
Ödeme yolu yeniden etkinleştirilirse Purchase History beyanı, RevenueCat gizlilik bildirimi ve App Store
Privacy cevapları aynı sürümde yeniden eklenmelidir.

## Mevcut ücretsiz sürüm için inceleme öncesi kontroller

- [ ] Production build `EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false` ile alındı.
- [ ] App Store metadata ve ekran görüntüleri yalnız ücretsiz açma akışını anlatıyor.
- [ ] Dormant non-consumable ürün bu sürümün inceleme gönderimine eklenmedi.
- [ ] Paket ağ, Apple hesabı veya RevenueCat olmadan kurulabiliyor.
- [ ] 6,9 inç iPhone ekran görüntüleri alfa kanalsız yüklendi.
- [ ] Gizlilik, destek ve koşullar URL’leri herkese açık ve HTTPS üzerinden erişilebilir.
- [ ] Güncel yaş derecelendirme soruları yanıtlandı.
- [ ] İçerik hakları beyanı yalnızca gerekli dağıtım lisansı doğrulandıktan sonra onaylandı.

## Gelecekte ödeme yeniden etkinleştirilirse

- [ ] Paid Apps Agreement kabul edildi; banka ve vergi bilgileri tamamlandı.
- [ ] Non-consumable fiyat ve Türkiye kullanılabilirliği ayarlandı.
- [ ] Ürün `default` offering’e, ürün de `bka_tus_complete` entitlement’a bağlandı.
- [ ] EAS production environment içinde `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` tanımlandı.
- [ ] Sandbox’ta başarı, kullanıcı iptali, Ask to Buy/deferred, ağ hatası ve restore sınandı.
- [ ] İlk IAP, 1.0.0 uygulama sürümüyle aynı gönderime eklendi.
- [ ] App Review screenshot yüklendi.
