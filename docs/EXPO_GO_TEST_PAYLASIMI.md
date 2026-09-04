# Expo Go ile uzaktan test paylaşımı

Şehir dışındaki bir test kullanıcısının iPhone'unda uygulamayı çalıştırmak için kullanılan akış.

## Neden bu yol

Ücretsiz Apple ID ile başka birinin iPhone'una uygulama kurulamaz: ad-hoc dağıtım, TestFlight ve
`eas go` üçü de ücretli Apple Developer Program üyeliği ister. Ücretli üyelik alınana kadar tek
ücretsiz yol App Store'daki Expo Go.

Bunun iki sonucu var:

- **Expo Go iOS'ta yalnızca en güncel SDK'yı çalıştırır.** Apple eski Expo Go sürümlerinin
  kurulmasına izin vermiyor. Proje bu yüzden 4 Eylül 2026'da SDK 54'ten SDK 57'ye yükseltildi.
- **Test kullanıcısı bu makineye bağımlı.** EAS Update ile yayınlanan sürümler Expo Go'da
  açılmıyor, dolayısıyla her testte burada `npm run share` çalışıyor olmalı.

## Her testte yapılacaklar

```bash
cd ~/tus-flashcard-app && npm run share
```

1. `Tunnel ready` satırını bekle; terminalde QR kod belirir.
2. **Bundle'ı önden ısıt:** terminalde `i` tuşuna bas. Simülatörde açılır ve Metro paketi derleyip
   önbelleğe alır (~5 sn). Bu adım atlanırsa karşı taraf ilk açılışta zaman aşımı görebilir.
3. QR'ın ekran görüntüsünü ve şu adresi gönder: `exp://tusankim-bg-test.ngrok.io`
4. Karşı taraf QR'ı **iPhone Kamera** uygulamasıyla okutup çıkan bildirime dokunur; Expo Go açılır.
   Adresi doğrudan da açabilir. Uygulama Expo Go içinde çalışır.
5. Test bitince terminalde `Ctrl+C`. Sunucu kapandığı anda karşı taraf uygulamayı açamaz.

Adres `EXPO_TUNNEL_SUBDOMAIN=tusankim-bg-test` sayesinde her açılışta aynıdır; karşı taraf linki
bir kez kaydederse sonraki seferlerde QR'a gerek kalmaz. Expo Go son projeyi hatırladığı için
uygulamayı ikinci kez açtığında doğrudan uygulamaya girer.

**Mac'in uykuya geçmesi tüneli düşürür.** Uzun testlerde:

```bash
caffeinate -i npm run share
```

## Komutlar

| Komut | Ne yapar | Ne zaman |
| --- | --- | --- |
| `npm run share` | Tünel + Expo Go, üretim modunda paket (9,0 MB) | Karşı tarafın testi için varsayılan |
| `npm run share:dev` | Tünel + Expo Go, geliştirme modunda paket (11,1 MB), Fast Refresh açık | Kodu değiştirip anında görmek istediğinde |
| `npm run share -- --clear` | Metro önbelleğini temizler | Açıklanamayan paket hatalarında |
| `npm start` | Yalnız yerel ağ, tünel yok | Kendi simülatör/telefon testin |

`share` üretim modunda çalıştığı için Fast Refresh yoktur: kod değiştiğinde sunucuyu yeniden
başlatıp karşı taraftan uygulamayı yeniden açmasını istemek gerekir.

## Hata → sebep → çözüm

| Karşı tarafın gördüğü | Sebep | Çözüm |
| --- | --- | --- |
| `ERR_NGROK_3200` — "endpoint is offline" | Bu makinede sunucu kapalı, Mac uykuda veya `Ctrl+C` yapılmış | `npm run share` çalışıyor mu bak; uzun testte `caffeinate -i` ile başlat |
| "The request timed out" | Paket henüz derlenmemiş ya da bağlantı yavaş | Terminalde `i` ile paketi ısıt, sonra tekrar denesin; mobil veri yerine Wi-Fi |
| "Project is incompatible with this version of Expo Go" | Expo Go'nun SDK'sı projeninkinden farklı | Expo Go yeni bir SDK'ya geçtiyse proje de o SDK'ya yükseltilmeli (aşağıya bak) |
| Beyaz ekran veya "Something went wrong" | Paket indi ama JS hatası var | Buradaki terminal çıktısındaki kırmızı hataya bak |
| `Tunnel subdomain is taken` benzeri hata | `tusankim-bg-test` alt alanını başkası tutmuş | `package.json` içindeki `EXPO_TUNNEL_SUBDOMAIN` değerini değiştir |

Sabit alt alan adı tahmin edilebilir olduğu için tünel açıkken adresi bilen herkes paketi
indirebilir. Sunucuyu yalnızca test süresince açık tut; daha kapalı bir kurulum istenirse
`package.json` içindeki `EXPO_TUNNEL_SUBDOMAIN=... ` öneki silinir, Expo her açılışta rastgele bir
adres üretir (o zaman her seferinde yeni QR gerekir).

## Expo Go'da test EDİLEMEYEN özellikler

Expo Go kendi imzasıyla çalışan hazır bir kabuk olduğu için projenin native tarafı devrede değil.
Test isteğinde bunları kapsam dışı bırak:

- **Apple Kısayolları / deste kısayolu** — `modules/deck-shortcuts` native modülü yok, sessizce
  `unavailable` döner.
- **Satın alma ve katalog ödemesi** — `react-native-purchases` Expo Go'da bulunmuyor. Ücretsiz
  katalog açma çalışır (9.575 kart kuruluyor), gerçek App Store satın alması denenemez.
- **Dosyalar'dan `.apkg` / `.colpkg` "birlikte aç"** — dosya tipi ilişkilendirmesi uygulamanın
  kendi bundle kimliğine bağlı. Uygulama içinden dosya seçerek içe aktarma çalışır.
- **`tusankim://` derin bağlantıları ve URL otomasyonu** — Expo Go `exp://` şemasıyla açılır.
- **Uygulama ikonu, açılış ekranı, dosya koruma yetkisi (`NSFileProtectionComplete`)** — bunlar
  yalnızca gerçek derlemede görünür.

Çalışanlar: tüm çalışma akışı ve zamanlayıcı, SQLite koleksiyonu, kart tarayıcı, istatistik
grafikleri, düzenleyici, fotoğraf/ses ekleme, yedekleme ve dışa aktarma, yerel hatırlatıcılar.

## Bakım notları

- Expo SDK 58 yayınlanıp karşı tarafın Expo Go'su güncellendiğinde bu yol kırılır. O gün proje de
  yükseltilmeli: `npx expo install expo@latest --fix`, ardından `npm run check` ve `npx expo-doctor`.
- `ios/` klasörü hâlâ SDK 54 prebuild çıktısı. Native derleme veya App Store işi öncesi
  `npx expo prebuild --clean -p ios` ile yeniden üretilmeli.
- Ücretli Apple Developer üyeliği alındığı gün bu akış bırakılabilir: `eas build --profile preview`
  ile kurulabilir bir derleme üretilir, `eas update` ile güncellemeler itilir ve karşı tarafın bu
  makineye bağımlılığı ortadan kalkar.
