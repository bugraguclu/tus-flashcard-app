# 28 Kasım 2026 — Kaynak bağlantıları ve web demosu yayını

## Kapsam

- İş 4: Anki kaynak sicilinin HTTP/içerik/fragment doğrulaması, kaynak ve yasal sayfa bağlantılarının düzeltilmesi. Kaynak commit: `086366df`.
- İş 6: Uygulamayla uyumlu deste ağacı/seçici, demo gezinmesi ve FSRS başlangıç aralıkları. Kaynak commit: `f5593394`.
- Yayın tabanı: `a28ba3a5` (`origin/master`).
- İş 1 (kronometre programları), iş 2 (takvim gün/aralık filtresi) ve iş 3 (editör önizleme düzeni) bu pakete alınmadı.
- İş 5'in `0ea6faad` commitinde değişen Türkçe/İngilizce yardım bölümleri yalnız `stopwatch`; iş 1'e bağlıdır. Canlı kaynaklarından `node scripts/build-help-content.mjs` tekrar çalıştırıldı, çıktı değişmedi. Yeni kronometreyi anlatan metin, özelliğin yayını onaylanana kadar bekletildi.

## Doğrulama

- `npm run quality`: 387 dosya / 4.082 test başarılı; iki dosya / beş test kasıtlı atlandı. TypeScript ve iOS yapılandırma/kaynak sicili doğrulandı.
- `npm run verify:sources`: 195/195 URL HTTP 200, içerik ve tam fragment denetiminden geçti.
- `node scripts/verify-app-store-pages.mjs`: gizlilik, destek ve koşul sayfaları erişilebilir.
- `npm run verify:catalog-citations`: 236 PubMed ve 123 PMC kaydının kimliği, 25 değiştirilen kaynak başlığı doğrulandı. Bu, klinik içeriğin tamamının onayı değildir.
- Website build ve verify: 72 HTML, 71 sitemap URL, 101 arama girdisi, 1.195 referans; bütünlük kontrolleri başarılı. Değişmeyen rehberde üç kullanılmayan-import ipucu var.
- `TUSANKIM_WEB_BASE=/uygulama npm run build:web -- --output-dir .expo/vercel-web` ve aynı taban yolu ile `scripts/assemble-vercel.mjs` başarılı.
- Üretim paketi üzerinde Chromium/WebKit × 320/390/1440 px × iki demo: 12 gezinme akışı başarılı; 330 kart göster/cevapla kontrolü başarılı.
- App Store işletmeci/adres/iletişim yer tutucusu uyarısı sürüyor. Bu web yayınıdır; fiziksel iPhone veya App Store gönderim onayı değildir.
