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

## Gerçek iPhone imzalı manifest istiyor

Bu, günlerce hata kovalattıran kural: **fiziksel bir iPhone, halka açık bir adresten gelen imzasız
manifesti açmaz.** Ekranda çıkan hata:

> You need to be signed in to Expo Go and Expo CLI to open your project.

iOS simülatörü bu kuraldan muaf. Bu yüzden anonim kurulum simülatörde kusursuz çalışırken her
gerçek telefon denemesi başarısız oldu; iki farklı tünel (`exp.direct` ve Cloudflare) denendi,
ikisinde de aynı sonuç alındı — yani tünelle ilgisi yok.

Manifestin imzalanması için üç şart birlikte sağlanmalı:

1. `app.json` içinde `extra.eas.projectId` bulunmalı (imzalanacak projeyi bu tanımlar).
2. Bu makinede Expo CLI o projeye yetkili bir hesapla giriş yapmış olmalı.
3. Test kullanıcısının Expo Go'su **aynı hesapla** giriş yapmış olmalı.

Üçüncü madde hesabın paylaşılmasını gerektiriyor. Bunu kabul etmek istemezsen alternatif, test
kullanıcısına kendi ücretsiz Expo hesabını açtırıp onu projenin bağlı olduğu Expo organizasyonuna
üye olarak davet etmektir; o zaman kendi hesabıyla girer.

## Bir kerelik kurulum

**Bu makinede** — Expo hesabına giriş (hesap: `smbg`, parola tarayıcıda kayıtlı):

```bash
npx expo login --browser
```

`npm run share` giriş yapılmamışsa hiç başlamaz ve bunu söyler; çünkü imzasız sunucu gerçek
telefonda kesin başarısız olur. Yalnızca simülatörde deneyecekseniz `npm run share -- --anon`.

**Test kullanıcısında** — App Store'dan Expo Go kurulur ve **aynı hesapla** giriş yapılır
(Expo Go → Home sekmesi → sağ üstteki profil ikonu → Log in).

Expo Go **silinmemeli** — uygulamanın koleksiyonu ve çalışma geçmişi Expo Go'nun içinde durur,
uygulama silinirse veri de gider.

## Veri kalıcılığı

Expo Go uygulama verisini kapsam anahtarına göre ayırır. Anahtar değişirse Expo Go uygulamayı
sıfırdan kurulmuş sayar: koleksiyon ve ilerleme görünmez olur.

- İmzasız (anonim) sunumda anahtar `@anonymous/<slug>-<uuid>` olur; uuid `~/.expo/state.json`
  içindedir.
- İmzalı sunumda anahtar projenin kendi anahtarıdır ve makineye değil projeye bağlıdır — uzun
  vadede daha sağlamdır.

Anonim moddan imzalı moda geçiş anahtarı bir kez değiştirir, yani o ana kadar telefonlarda biriken
veri bir defalığına görünmez olur. Ücretsiz katalog birkaç saniyede yeniden kurulduğu için bu geçiş
test kullanıcısı başlamadan önce bilerek yapıldı. Sonrasında anahtar sabittir.

`npm run share` her çalıştırmada kapsam anahtarını `.expo/share-scope-key.txt` dosyasına yazar ve
değişirse uyarır. `app.json` içindeki `slug` ve `extra.eas.projectId` alanları test sürerken
değiştirilmemeli.

## Her testte — bu makinede

```bash
cd ~/tus-flashcard-app && caffeinate -i npm run share
```

1. Şu kutuyu bekle (~30-60 sn):

   ```
   Expo hesabı     : smbg  (Expo Go da aynı hesapla girmeli)
   ────────────────────────────────────────────────
     Adres  : exp://<rastgele>-smbg-8081.exp.direct
     QR     : docs/expo-go-qr.png
     Paket  : hazır — 9.1 MB, 0.7 sn
     İmza   : var — @smbg/tusankim
   ────────────────────────────────────────────────
     Test kullanıcısı şimdi bağlanabilir. Çıkmak için Ctrl+C.
   ```

   `İmza : YOK` yazıyorsa gönderme; gerçek telefon açmaz.
2. `docs/expo-go-qr.png` görselini gönder. Bu dosya her çalıştırmada güncel adresle yeniden üretilir.
3. Bağlantı kurulduğunda `iOS Bundled` ve uygulamanın log satırları bu terminalde akar.
4. Test bitince `Ctrl+C`.

`caffeinate -i` Mac'in uykuya geçip tüneli düşürmesini engeller.

Komutu ikinci kez çalıştırmak zararsız: imzalı bir sunucu zaten çalışıyorsa ona dokunmaz, adresi
yazıp çıkar. Portta imzasız ya da tünelsiz bir sunucu varsa onu kapatır, ngrok oturumunun serbest
kalmasını bekler ve yeniden başlatır; tünel ilk denemede açılmazsa 45 saniye sonra kendi kendine
tekrar dener.

`npm run share`, `scripts/share-expo-go.mjs` üzerinden çalışır ve gerçek iPhone'da yaşanan sessiz
hataları kapatır:

- **Giriş sorusu manifest isteğini bloke ediyordu.** Terminal etkileşimliyken CLI, telefon manifest
  isterken "Log in / Proceed anonymously" diye soruyor ve telefonun isteği cevap verilene kadar
  bekliyordu; telefon `The network connection was lost` ile düşüyordu. Script `CI=1` ile başlattığı
  için soru sorulmaz.
- **Tünel hazır olmadan manifest LAN adresi veriyordu.** Metro, tünel bağlanmadan gelen isteğe
  `Tunnel URL not found ... falling back to LAN URL` deyip paketi `192.168.x.x` üzerinden vaat
  ediyordu. Script, manifest gerçekten tüneli gösterene kadar "bağlanabilir" demez.
- **İlk paket derlemesi zaman aşımına uğruyordu.** Script paketi kendisi indirip Metro'nun
  önbelleğini doldurur.

## Her testte — test kullanıcısında

1. QR'ı **iPhone Kamera** uygulamasıyla okutur; Expo Go'yu önceden açması gerekmez.
2. Çıkan bildirime dokunur, Expo Go açılır ve paketi indirir (~9 MB).
3. Sonraki seferlerde QR gerekmez: Expo Go son projeyi hatırlar. Tek koşul bu makinede sunucunun
   çalışıyor olması.
4. Koleksiyon, ilerleme ve ayarlar telefonda kalır.

### Gönderilecek mesaj şablonu

> Uygulamayı test etmek için:
> 1. App Store'dan **Expo Go** uygulamasını kur.
> 2. Expo Go'yu aç, sağ üstteki profil ikonundan sana ilettiğim hesapla giriş yap.
> 3. Attığım QR kodu **iPhone Kamera** ile okut, çıkan bildirime dokun.
> 4. Biraz yüklenir, sonra uygulama açılır.
>
> Sonraki seferlerde QR gerekmiyor, sadece Expo Go'yu aç — ama önce haber ver, benim bilgisayarımın
> açık olması gerekiyor.
>
> Şunlar bu test ortamında çalışmaz, hata sanma: Apple Kısayolları, satın alma ekranı, Dosyalar'dan
> .apkg açma. Uygulama ikonu ve açılış ekranı da Expo Go'nunki görünür.

## Komutlar

| Komut | Ne yapar | Ne zaman |
| --- | --- | --- |
| `npm run share` | Tünel + Expo Go, üretim modunda paket (9,0 MB), imzalı manifest | Varsayılan |
| `npm run share:dev` | Aynısı, geliştirme modunda (11,1 MB), Fast Refresh açık | Kodu değiştirip anında görmek istediğinde |
| `npm run share:lan` | Tünel yok, yalnız yerel ağ | Telefon aynı Wi-Fi'dayken; tünel sorunlarını ayıklamak için |
| `npm run share -- --anon` | Giriş şartını atlar, imzasız sunar | Yalnızca simülatör testi |
| `npm run share -- --clear` | Metro önbelleğini temizler | Açıklanamayan paket hatalarında |

## Hata → sebep → çözüm

| Karşı tarafın gördüğü | Sebep | Çözüm |
| --- | --- | --- |
| "You need to be signed in to Expo Go and Expo CLI to open your project" | Manifest imzasız ya da iki taraf farklı hesapta | Bu makinede `npx expo login --browser`, telefonda Expo Go aynı hesapla girişli olmalı. Kutuda `İmza : var` yazmalı |
| "You're signed in to Expo CLI as X, but not signed in to Expo Go" | Telefon girişsiz | Expo Go → profil ikonu → aynı hesapla giriş |
| `ERR_NGROK_3200` — "endpoint is offline" | Sunucu kapalı ya da Mac uykuda | `npm run share` çalışıyor mu bak; `caffeinate -i` ile başlat |
| "The request timed out" | Paket derlenmemiş ya da bağlantı yavaş | Script paketi zaten ısıtıyor; kutuyu görmeden QR gönderme |
| `Opening project…` sonrası "The network connection was lost" | Tünel hazır olmadan LAN adresi verilmiş | `npm run share` bunu engeller; `npx expo start --tunnel` doğrudan çalıştırıldıysa hata geri gelir |
| `failed to start tunnel` / `Port 8081 is running this app…` | Önceki oturum/sunucu kapanmamış | `npm run share` ikisini de kendi halleder |
| Uygulama açılıyor ama koleksiyon boş | Kapsam anahtarı değişmiş | `.expo/share-scope-key.txt` içindeki değere bak; anahtar eski haline dönerse veri geri gelir |

## Expo Go'da test EDİLEMEYEN özellikler

Expo Go hazır bir kabuk olduğu için projenin native tarafı devrede değil:

- **Apple Kısayolları / deste kısayolu** — `modules/deck-shortcuts` native modülü yok.
- **Satın alma ve katalog ödemesi** — `react-native-purchases` Expo Go'da bulunmuyor. Ücretsiz
  katalog açma çalışır (9.575 kart kurulur).
- **Dosyalar'dan `.apkg` / `.colpkg` "birlikte aç"** — dosya tipi ilişkilendirmesi yok.
- **`tusankim://` derin bağlantıları ve URL otomasyonu** — Expo Go `exp://` şemasıyla açılır.
- **Uygulama ikonu, açılış ekranı, dosya koruma yetkisi** — yalnızca gerçek derlemede.

Çalışanlar: tüm çalışma akışı ve zamanlayıcı, SQLite koleksiyonu, kart tarayıcı, istatistik
grafikleri, düzenleyici, fotoğraf/ses ekleme, yedekleme ve dışa aktarma, yerel hatırlatıcılar.

## Bakım notları

- Expo SDK 58 yayınlanıp karşı tarafın Expo Go'su güncellendiğinde bu yol kırılır. O gün proje de
  yükseltilmeli: `npx expo install expo@latest --fix`, ardından `npm run check` ve `npx expo-doctor`.
- `ios/` klasörü hâlâ SDK 54 prebuild çıktısı. Native derleme veya App Store işi öncesi
  `npx expo prebuild --clean -p ios` ile yeniden üretilmeli.
- Ücretli Apple Developer üyeliği alındığı gün bu akış tamamen bırakılabilir:
  `eas build --profile preview` ile kurulabilir bir derleme üretilir, `eas update` ile güncellemeler
  itilir ve karşı tarafın bu makineye bağımlılığı ortadan kalkar.
