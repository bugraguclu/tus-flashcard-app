# Flappy Plane — çevrimdışı kurulum

Oyunun tamamı `index.html` içinde: tüm görseller base64 gömülü, dışarıya **hiçbir**
istek atılmıyor. `sw.js` sadece "ana ekrana eklendikten sonra internetsiz açılabilme"
için var.

## 1) Mac'te oynamak
`index.html` dosyasına çift tıkla. Bu kadar — internet gerekmez.
(Bu yolda `file://` üzerinden çalışıldığı için servis çalışanı devreye girmez,
ama zaten hiçbir şey indirilmediğinden oyun eksiksiz çalışır.)

Yerel sunucuyla açmak istersen (servis çalışanını da test etmek için):

    ./calistir.command          # ya da çift tıkla
    # veya
    python3 -m http.server 8000

Sonra Safari/Chrome'da http://localhost:8000/ adresini aç.
`localhost` güvenli bağlam sayıldığı için `sw.js` burada kaydolur.

Mac'te Dock'a uygulama gibi koymak: Safari'de aç ▸ Dosya ▸ **Dock'a Ekle**.

## 2) iPhone / iPad'de internetsiz oynamak
iOS'ta ana ekran uygulamasının çevrimdışı açılabilmesi için sayfanın
**https** üzerinden bir kez yüklenmesi gerekir (`http://192.168.x.x` güvenli
bağlam sayılmaz, servis çalışanı kaydolmaz).

### Yol A — GitHub Pages (önerilen, ücretsiz)
1. Bu klasörü bir GitHub deposuna it.
2. Depo ▸ Settings ▸ Pages ▸ Branch: `main`, klasör `/` (veya `/docs`).
3. Verilen `https://<kullanıcı>.github.io/<depo>/flappy-plane/` adresini
   iPhone'da **Safari** ile aç (Chrome değil — iOS'ta ana ekran ekleme Safari'de).
4. Paylaş ▸ **Ana Ekrana Ekle**.
5. Bir kez oyna (servis çalışanı önbelleğe alsın), sonra Uçak Modu'nda aç: çalışır.

### Yol B — Sunucusuz, tek dosya (kurulum yok)
`index.html`'i AirDrop ile iPhone'a gönder ▸ Dosyalar'a kaydet ▸ üstüne dokun.
Tam ekran ikon olmaz ama oyun internetsiz açılır.

## Güncelleme
`index.html` değiştiğinde `sw.js` içindeki `CACHE = 'flappy-plane-v1'` sürümünü
`v2` yap; yoksa eski sürüm önbellekten gelir.
