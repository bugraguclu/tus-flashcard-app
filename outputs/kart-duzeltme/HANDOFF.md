# BKA TUS kart düzeltme işi — devir notu

## İstek (kullanıcının sözleri)

> bu sorular kullanıcın kendi çalışması için tasarlanmış. bu soruları tam mükemmel tam profesyonel
> hale getir. ai slop yapma. mesela yazımları falan da düzelt. eksik az bilgi veriyorsa çok kritik
> onları da ekle. bana excel önce sonra değişiklikleri kritiklik seviyesine göre sıralayarak ver.

"Sorular" = `assets/catalog/bka-tus-complete.apkg` içindeki BKA TUS kataloğu: 7.721 not, 9.575 kart,
12 ders (7.638 Cloze-AnKingMaster notu: Text/Extra alanları; 83 "Basic (type in the answer)" notu:
Ön/Geri). Bir öğrencinin kişisel notları: kişisel kısaltmalar, Title Case, yazım hataları, ASCII oklar,
HTML artıkları, ara sıra tıbbi hata veya eksik niteleyici.

Teslim: önce/sonra Excel'i, kritikliğe göre sıralı + uygulanabilir düzeltme dosyası (`.patch.json`).
Değişiklikler pakete **uygulanmayacak**; kullanıcı Excel'de Kabul/Ret seçtikten sonra ayrı iş.

## Durum (2026-09-23 13:50)

- Araçlar hazır ve test edildi; hiçbir paket henüz işlenmedi.
- İki pilot (b01, b33; Opus alt ajanları) iki kez oturum limitine takıldı, çıktı yazamadı.
- Hesap **Pro** planında. 23 Eylül 13:47 itibarıyla haftalık "tüm modeller" kotası %71 dolu
  (sıfırlanma 27 Eylül 17:00 TSİ). Eski orkestrasyon oturumunun bağlamı ~420 bin token'a ulaştı;
  bu oturumdaki her istek 5 saatlik pencerenin ~%2,5'ini tüketiyordu. Devam eden oturum hafif
  tutulmalı: büyük dosyaları bağlama okuma, ajan bildirimlerine az tepki ver.
- Terminaldeki `claude` kabuk fonksiyonu `~/.claude-tokens/pureko` token'ını kullanıyor (başka
  hesap). Kullanıcı açıkça izin vermeden bu yolla iş çalıştırma.

## İlerleme (2026-09-23 14:40)

- b33 (K5/Y18/O67/D22, 8 doğrulama işareti) ve b34 (K3/Y19/O73/D17, 8 işaret) bitti; `validate`
  temiz. b35 başlatıldı.
- Ölçülen maliyet (Opus düzenleme ajanı, paket başına): 5 saatlik pencerenin ~%20'si, haftalık
  kotanın ~%3'ü, ~30 dakika. Tüm katalog (72 paket) yalnız düzenleme için ~2 haftalık tam kota eder.
- `verify_tools.py make` varsayılanı 60 not/paket → Farmakoloji için ~3 kontrol paketi.
- `build_report.py`, `verify/final.json` yoksa `out/bNN.result.json`'dan kontrolsüz (Doğrulama
  sütunu "—") ön Excel üretebilir.
- Haftalık kota 14:40'ta %81; b36–b38 ve kontrolün bu haftaya sığıp sığmayacağı kullanıcıya soruldu.

## İlerleme (2026-09-23 21:10)

- b35 bitti (K4/Y20/O66/D22, 4 işaret; `validate` temiz). b36 başlatıldı; b37, b38 sırayla.
- Kullanıcı Excel'i istedi: `../BKA_TUS_Farmakoloji_Ara_Rapor_b33-b35.xlsx` (+ `.patch.json`)
  kontrolsüz ara sürüm olarak gönderildi (335 satır, 804 kalem; K12/Y57/O206/D60).
- `build_report.py`: `verify/final.json` yoksa Özet artık "ara sürüm, bağımsız kontrol henüz
  yapılmadı" diyor (önceden kontrol yapılmış gibi yazıyordu).
- Haftalık kota 21:04'te %6'ya düşmüştü (sıfırlanma tarihi yine 27 Eylül); haftalık sınır artık
  bağlayıcı değil. 5 saatlik pencere %45 (kullanıcının başka oturumları da harcıyor), bu yüzden
  paketler tek tek çalıştırılıyor.
- Kullanıcı ara Excel'de Karar sütununu doldurursa, son Excel'e Not ID ile taşınacak.

## İlerleme (2026-09-23 21:30)

- b36 bitti (K6/Y22/O75/D9, 2 işaret; tek uyarı bilinçli: olaratumab Extra'sı "2019'da piyasadan
  çekildi" bilgisiyle uzadı). İki cevap değişti, önce bakılmalı: 1604757853167 (atopik dermatitte
  PDE4 inhibitörü krisaborol, apremilast değil) ve 1608620480684 (dağılım hacmi cinsiyetten etkilenir).
- 21:28'de 5 saatlik pencere %95 (başka oturumlar da harcıyor); sıfırlanma 01:40. b37+b38 için
  24 Eylül 01:47'ye oturum içi tek seferlik zamanlayıcı kuruldu. Oturum kapanırsa bu kaybolur:
  elle başlat (adım 1 istemi).

## İlerleme (2026-09-24 02:45)

- b37 (K4/Y19/O74/D15, 5 işaret) ve b38 (K8/Y23/O63/D14, 6 işaret; 1 not değişmedi) bitti; altı
  paket `validate` temiz, `lint` temiz (işaretli "Ca"ların hepsi kalsiyum, "Gag-Pol" gerçek ad).
- `verify_tools.py make --batches=b33-b38`: 151 not → v01 (60), v02 (60), v03 (31). v01+v02
  ajanları 02:45'te başladı; v03 bunlar bitince (pencere uygunsa). Çıktı: `verify/out/vNN.txt`.
- Kullanıcıya ayrıca söylenecek: 1621973964873 (b37, HLA kartı) flukloksasilin cloze'u c2 → c1
  taşındı (cevap sızıntısı); ordinal kümesi aynı ama o satırın çalışma geçmişi başka karta geçer.
  v02'de bağımsız kontrolden geçiyor.

## Farmakoloji tamamlandı (2026-09-24 03:25)

- Kontrol: v01 ONAY 55/DÜZELT 5, v02 56/4, v03 27/4; GERİ AL yok. `merge` → 668 not, 1 değişmemiş.
- Son Excel: `../BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx` (+ `.patch.json`), kullanıcıya
  gönderildi. 667 satır, 1.639 kalem; K31/Y118/O419/D99; 25 notta açık "Editör kararı gerekli".
- `build_report.py` cloze cümlesi düzeltildi ("hiçbir notta cloze numarası eklenmedi veya silinmedi";
  taşınan satırlar Yapısal kalemi olarak belirtilir).
- Ölçüm (gece, sıfırlanmadan sonra): b37+b38+v01–v03 = 5 saatlik pencerenin %40'ı, haftalık %5.
- Sıradaki: kullanıcının Farmakoloji onayı. Onay gelirse sonraki ders için `batches/index.json`
  paketleriyle adım 1'den başla. Karar sütunu doldurulmuş bir kopya gelirse kararları Not ID ile taşı.

## Klasör: `outputs/kart-duzeltme/work/` (git'e dahil değil)

| Dosya | Görev |
|---|---|
| `STYLE_GUIDE.md` | Editörlük sözleşmesi: değişmezler, ev stili, kısaltma politikası, kritiklik tanımları, çıktı biçimi, 9 gerçek örnek, anti-slop kuralları |
| `batches/bNN.txt/.json` | 72 paket (ders sırasıyla, ~100 not); `index.json` listesi |
| `validate.py bNN` | Ajan çıktısını denetler (cloze numaraları, medya, HTML, oklar, &nbsp;, kategori/seviye eşleşmesi, her notun ele alınması); `out/bNN.result.json` yazar |
| `lint.py` | Paketler arası tutarlılık: kalan kişisel kısaltmalar, Title Case oranı |
| `VERIFY_GUIDE.md`, `verify_tools.py make/check/merge` | Kritik/Yüksek notların bağımsız tıbbi kontrolü → `verify/final.json` |
| `build_report.py ÇIKTI.xlsx [--allow-partial]` | Excel (Özet, Değişiklikler, Değişiklik Kalemleri, Kısaltma Sözlüğü) + `.patch.json` |
| `all_notes.json`, `topics.json`, `apkg/` | Kaynak çıkarımı ve uygulamanın kendi konu sınıflandırması |

Ajan istemi (paket başına): STYLE_GUIDE'ı tamamen oku → `batches/bNN.txt`'yi oku → ≤30 notluk
parçalar hâlinde `out/bNN_pK.txt` yaz (her parçayı bitince hemen) → `python3 validate.py bNN`
hatasız olana kadar düzelt → Kritik/Yüksek kalemleri yeniden gözden geçir → ≤12 satırlık özet.
Web kullanma; yalnızca kendi `out/bNN_*` dosyalarına yaz.

Bitiş sırası: 72 paket `validate` temiz → `lint.py` ile tutarlılık → `verify_tools.py make` →
doğrulama ajanları (`verify_tools.py check vNN`) → `verify_tools.py merge` →
`build_report.py ../BKA_TUS_Kart_Duzeltmeleri_Once_Sonra.xlsx` → Excel'i Quick Look ile gözden
geçir (`qlmanage -t`), kullanıcıya gönder.

Not: LibreOffice yok; Özet formülleri `fullCalcOnLoad` ile Excel/Numbers'ta hesaplanır ve
önizlemeler için önbellek değerleri dosyaya yazılır.

## Kullanıcı kararı (2026-09-23): önce tek ders, yeni hafif oturumda

Kapsam: **Farmakoloji** — paketler **b33–b38** (669 not). Kullanıcı başka bir ders adı verirse
`batches/index.json`'dan o dersin paketlerini kullan. Kalite: tasarlandığı gibi tam (düzenleme
ajanları varsayılan model, bağımsız kontrol dahil). Diğer derslere geçmek için kullanıcının
Farmakoloji Excel'ini görüp onay vermesini bekle.

Yeni oturum için adımlar (kota az, bu yüzden bağlamı küçük tut ve aynı anda en fazla 2–3 ajan):

1. Düzenleme ajanları (b33–b38). Her ajana verilecek istem:
   > You are the senior medical copy-editor for batch bNN of a Turkish TUS flashcard catalog
   > (Farmakoloji BKA). Work directory: /Users/bugra/tus-flashcard-app/outputs/kart-duzeltme/work.
   > 1. Read STYLE_GUIDE.md completely; it is the contract. 2. Run `python3 validate.py bNN
   > --remaining`: if some part files already exist, keep them and continue with the listed notes,
   > numbering new parts after the existing ones. 3. Read batches/bNN.txt and edit every remaining
   > note in order; write out/bNN_pK.txt parts of at most 30 notes, each as soon as it is done; the
   > last part ends with the @@UNCHANGED line (listing every unchanged note of the whole batch).
   > 4. Run `python3 validate.py bNN` until ERRORS: 0; fix real warnings. 5. Reread Kritik/Yüksek
   > items against section 9. No web tools; write only out/bNN_* files. Final message ≤12 lines:
   > validator summary, number of Doğrulama gerekli flags, unresolved ambiguities.
2. Oturum limiti gelirse: `get_usage` ile sıfırlanma saatini kontrol et, sonra aynı istemle
   yeniden başlat; `--remaining` sayesinde yazılmış parçalar korunur.
3. Tüm paketler temizse: `python3 lint.py b33` … `b38` (kalan kişisel kısaltma / Title Case);
   gerekirse ilgili ajana hedefli düzeltme yaptır.
4. `python3 verify_tools.py make --batches=b33-b38` → her `vNN` için bağımsız kontrol ajanı
   (VERIFY_GUIDE.md; web araması serbest; `python3 verify_tools.py check vNN` hatasız olmalı).
5. `python3 verify_tools.py merge --batches=b33-b38`
6. `python3 build_report.py ../BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx --batches=b33-b38`
7. `qlmanage -t -s 1400 -o <geçici klasör> <xlsx>` ile Özet'i gör; Değişiklikler sayfasından
   birkaç Kritik satırı `openpyxl` ile oku ve kendin kontrol et.
8. Excel'i kullanıcıya gönder (SendUserFile, `display: attach`); kısa özet: kritiklik sayıları,
   en önemli 3–5 tıbbi bulgu, diğer derslere geçip geçmeme sorusu.

## Yazım revizyonu (2026-10-03)

- İstek: kullanıcı ilk Excel'de "önce/sonra"da çok sayıda yazım hatası buldu ve yazımın kusursuz olmasını
  istedi. Çoğu hata tutarsızlıktı: aynı terimin farklı yazımları (bloker/blokör, alfa1/Beta2/α1,
  tiazid/tiyazid, mivakuryum/mivaküryum, MI/Mİ) ve birkaç gerçek yazım hatası (solubl, -kaftor'lar, OFlayip).
- Sözleşme: `work/PROOF_GUIDE.md`. Bölüm 4, ders geneli tek yazım tablosudur; `STYLE_GUIDE.md` artık ona
  yönlendirir. Sonraki dersler bu tabloyu ilk düzenleme turunda uygulamalı.
- Araçlar: `proof_tools.py make|validate|merge|review|scan` ve `proof_lint.py`. 8 düzeltme ajanı
  (p01–p08, ~84 not) yalnız yazım, dil bilgisi ve tutarlılık düzeltti. Doğrulayıcı cloze sırasını,
  HTML etiketlerini, medyayı ve kodlama büyük harflerini kilitler. Elle düzeltmeler `proof/manual/*.json`
  dosyalarındadır (m01 tutarlılık, m02 solubl). `merge` her seferinde
  `verify/final.before-proof.json` + parçalar + manual'dan yeniden kurar. `verify_tools.py merge` yeniden
  çalıştırılırsa ardından `proof_tools.py merge --batches=b33-b38` de çalıştırılmalı.
- Sonuç: 201 not değişti. `proof_lint.py` 228 → 25 (kalanlar orijinal alıntıları ve bilinçli
  istisnalardır: non-Hodgkin, anti-alfa-4, α2δ, INN telcagepant). Excel'e "Yazım Birliği" sayfası eklendi.
  İlk sürüm `arsiv/2026-09-24_ilk-surum/` klasöründe. Fark listesi: `work/proof/review.txt`.
- Yazım ajanlarının bildirdiği, değiştirilmemiş olası tıbbi sorunlar (kullanıcı kararı bekliyor):
  1604660192048 tamoksifen CYP2C19 altında (asıl CYP2D6); 1604758670384 benralizumab "anti-IL-5"
  (hedefi IL-5Rα); 1604735290528 sitalopram "kısa etkili" SSRI; 1604678561084 ezetimib "duodenumda"
  (ince bağırsak fırçamsı kenarı); 1624171626287 pargilin nonselektif MAO inhibitörü (MAO-B tercihli);
  1622119953089 "antiepileptiklerin çoğu CYP indükler" genellemesi; 1604678344813 yazarın "NiKorandil"
  büyük K'si kodlama olabilir, ilk düzenlemede küçültülmüştü.
- Kota: 2026-10-03 23:00'te haftalık "tüm modeller" %96'nın üstündeydi (sıfırlanma 4 Ekim 17:00 TSİ).

## Son tıbbi kontrol, profesyonelleştirme ve AI notları (2026-10-04, sürüyor)

- İstek: Excel'in üzerinden son kez geçilmesi; tıbbi hata kalmaması; kişisel notların herkesin anlayacağı,
  TUS ile birebir uyumlu kartlara dönüşmesi; her değişikliğe başka yapay zekâlar için "ne / neden / nasıl"
  AI notu; dosyanın diğer derslerde şablon olarak kullanılabilmesi. Web araştırması serbest.
- Sözleşme: `work/FINAL_GUIDE.md` (kural kodları YP1…BÇ1, TUS çatışma kuralı TD2, AI notu biçimi).
  İkinci kontrol: `work/FINAL_VERIFY_GUIDE.md`.
- Araç: `work/final_tools.py make|validate|merge|vmake|vcheck|vmerge|review|status`. Taban:
  `verify/final.before-final.json` (yazım turu sonrası durum). `merge` → `verify/final.json` +
  `verify/final.after-final-pass.json`; `vmerge` ikinci kontrol kararlarını bunun üzerine uygular.
  Not: `proof_tools.py merge` yeniden çalıştırılırsa son geçiş silinir; ardından `final_tools.py merge` ve
  `vmerge` yeniden çalıştırılmalı.
- Girdiler: `work/final/in/f01…f10.txt` (67'şer not), `final/hints.json` (15 ön şüphe), `final/course_index.txt`.
  10 ajan paralel çalışıyor; çıktılar `final/out/fNN_k1..3.txt`.
- `build_report.py`: yeni "AI notu (ne · neden · nasıl)" sütunu (Bağımsız kontrol'den sonra; Karar artık K
  sütunu), "AI Rehberi" sayfası (iş akışı, değişmezler, kritiklik, kural kodları + örnek satırlar, TUS uyumu,
  profesyonel kart ölçütleri, AI notu biçimi, başka bir AI için hazır istem), Özet'te "Son tıbbi kontrol"
  bölümü, patch.json'da `ainote`. Önceki builder: oturum scratchpad'inde yedek.
- Sıradaki: 10 parça `validate` temiz → `merge` → `vmake` → ikinci kontrol ajanları → `vcheck` → `vmerge` →
  `proof_lint.py` + `proof_tools.py scan` → `build_report.py` → v2'yi `arsiv/2026-10-03_yazim-revizyonu/`
  klasörüne taşı, v3'ü aynı adla yaz. Kullanıcı Excel'i açık tutuyordu (21:49 kilit dosyası).

### Durum (2026-10-04 ~23:00): kullanım sınırı doldu, ajanlar durduruldu

- 5 saatlik pencere 23:50 TSİ'de sıfırlanıyor. 10 ajan durduruldu; yazdıkları parça dosyaları geçerli ve
  korunuyor. `python3 work/final_tools.py status` hangi notların tamamlandığını gösterir.
- Bitmiş parçalar: f01 (67/67, validate temiz), f06 (67/67, validate temiz). Diğerleri kısmen.
- Devam: her fNN için aynı ajan istemini yeniden ver (istem "part files already exist → keep them and continue"
  diyor). Ek talimat: AI notlarında "önceki geçişte / bu geçişte / ilk düzenlemede" gibi tur göndermesi
  olmasın; f01, f03, f06, f08, f10 parçalarındaki mevcut notlar bu yönden düzeltilmeli.
- Oturum geneli WebSearch kotası (200) dolmuştu; ajanlar WebFetch ile PubMed E-utilities, DailyMed, FDA, EMA
  kullanmalı (FINAL_VERIFY_GUIDE.md'ye eklendi).
- İncelemede açık kalan iki karar: 1604659073479 Extra "P-glikoprotein başlıca bağırsak epitelinde bulunur"
  abartılı → "Bağırsak epitelindeki P-glikoproteinin inhibisyonu ilaçların emilimini artırır." olmalı.
  1604660471791 İNH: ajan klasik TUS cevabını kartta tutup güncel NAT2 bulgusunu Extra'ya yazdı (TD2'nin ters
  uygulanışı); ikinci kontrolde ders kitaplarına göre karar verilmeli.

### Teslim (2026-10-05 00:11): v3 temiz sürüm

- `BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx` (+ `.patch.json`, artık `ainote` içerir) yeniden
  üretildi; v2 `arsiv/2026-10-03_yazim-revizyonu/` klasöründe. 667 satır, 1.756 kalem (K38/Y171/O377/D81),
  her satırda AI notu, açık "Doğrulama gerekli" yok.
- Kullanıcı isteğiyle dosya "temiz": "Bağımsız kontrol" sütunu ve son kontrol özeti çıkarıldı, notlarda tur
  / sürüm göndermesi yok (`final/manual/m02-no-history.json`). Önce = yazarın kartı, Sonra = son kart.
- Son geçişte tıbbi içeriği değişen 118 not ikinci bağımsız kontrolden GEÇMEDİ (kullanıcı beklemeden teslim
  istedi; w01–w08 yarıda durduruldu, `final/verify/w*.txt` hazır). İstenirse: ajanlar w01–w08'i yazar →
  `vcheck` → `vmerge` (`--allow-unchecked` olmadan) → `build_report.py`.
- Elle düzeltme: 1617737927059 oritavansin kökü "lipoglikopeptid" ile tekleştirildi (vankomisin etiketi de RNA
  sentezini bozduğunu söylüyor) — `final/manual/m01-consistency.json`.
- Yeniden üretim: `final_tools.py merge --batches=b33-b38` → `vmerge --allow-unchecked` → `final_qa.py` →
  `build_report.py ../BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx --batches=b33-b38`.

### Pakete uygulandı (2026-10-05 00:30)

- Kullanıcı "hepsini uygula git commit push" dedi: 668 Farmakoloji notu `assets/catalog/bka-tus-complete.apkg`'ye
  yazıldı (`work/apply_patch_to_apkg.py`; yalnız flds/sfld/csum/mod, kart id/ordinal/GUID/medya aynı),
  manifest yeniden üretildi (114 kart daha konuya yerleşti, ungrouped 3332 → 3218), `.tuspack` yeniden paketlendi.
- `npm run quality` temiz (134 dosya, 1.503 test). Commit e21e235, `feat/study-screen-ui` dalına push edildi;
  master'da değil.
- `sucrase-node` kurulu değil; manifest Node 24 type stripping + extensionless-import çözücüsüyle üretildi.
- `npm run audit:catalog` artık paket ile özgün dışa aktarımın bayt eşitliğini bekleyemez (içerik bilerek değişti).
