# Gemini denetimi sonrası kart düzeltmeleri — 9 Ekim 2026

Altı notun kart alanları ve bir notun denetim gerekçesi düzeltildi. Değişiklikler hem katalog APKG'ye hem dağıtılan `.tuspack` varlığına işlendi; katalog manifesti yeniden üretildi. Bu çalışma mevcut kullanıcı koleksiyonuna bir import/restore yapmaz. Önceden yüklenmiş koleksiyonların alanlarının kendiliğinden güncellendiği iddia edilmez.

## Uygulanan düzeltmeler

| Ders | Not ID | Düzeltme |
| --- | --- | --- |
| Patoloji | 1622492118390 | Erken/geç HIV satırlarında aynı germinal merkez cevabı c1 içinde gizlendi. Sadece c2 sınırını genişletmek sızıntıyı çözmüyordu. |
| Patoloji | 1630168520911 | Başlıktaki dudak ipucu kaldırıldı; sık yerleşim bilgisi silinmeden tekrarlanan ağız tabanı c1 içine alındı. |
| Biyokimya | 1611214067113 | UMP için 3 ATP / 5 yüksek enerjili bağ, 3 ATP / 4 bağ olarak düzeltildi. |
| Biyokimya | 1628928200910 | Aynı UMP enerji hesabı ikinci kartta da düzeltildi. |
| Biyokimya | 1629141532040 | Flavoprotein oksidaz listesinde aldehit dehidrogenaz adı aldehit oksidaz olarak düzeltildi. |
| Biyokimya | 1611156046763 | Yalnız karaciğer ifadesi yerine dolaşımdaki ketonların başlıca üretim yeri belirtildi. |
| Biyokimya | 1607253754613 | Hemoglobin proksimal/distal histidin gerekçesi kaldırıldı; homokarnozin/karnozin/anserin kartının gerçek cloze gruplaması açıklandı. Kart alanı değişmedi. |

UMP hesabı riboz-5-fosfat başlangıcını ve PRPP sentezini içerir: CPS-II'de 2 ATP→2 ADP, PRPP üretiminde 1 ATP→AMP; toplam 3 ATP molekülü, 4 ATP eşdeğeri. [CAD reaksiyonu](https://reactome.org/content/detail/R-HSA-73577), [PRPP reaksiyonu](https://reactome.org/content/detail/R-HSA-73580).

Aldehit dehidrogenazın NAD bağımlı reaksiyonu ile aldehit oksidazın FAD içeren yapısı ayrı enzimleri gösterir. [ALDH2](https://www.uniprot.org/uniprotkb/P05091.html), [insan AOX1 yapısı](https://www.rcsb.org/structure/4UHW).

Ekstrahepatik ketogenez deneysel olarak gösterilmiştir; fare kolon verisi insanlarda miktar veya klinik önem iddiasına çevrilmedi. [Kolonik ketogenez çalışması](https://pubmed.ncbi.nlm.nih.gov/38372391/), [intestinal hücre çalışması](https://pubmed.ncbi.nlm.nih.gov/34087430/).

## Kaynak ve onay düzeltmeleri

Önceki kontrolde 31 farklı PMID'nin 20'si farklı makaleye gidiyor, ikisi incelenen iddiayı kapsamıyor, üçünden kayıt alınamıyordu. Tekrarlanan kullanımlarla 27 kaynak kaydı onarıldı. Yerlerine gerçek yayın kimlikleri veya resmi NCI bölümleri yazıldı; geri çekilen PMID'ler ve yeni başlık/URL'ler `gemini-followup-sources.json` içinde saklandı.

Başlık ve özet kimlik kontrolü, kartın tüm iddialarının veya kitaptaki TUS listesinin doğrulandığı anlamına gelmez. Yanlış/kapsam dışı referanslarla verilen son onaylar geri çekildi. Erişilebilir sayfa kanıtı olmayan Harper/Lehninger/Lippincott/Tietz okuma beyanları bağımsız tıbbi onay yerine kullanılmıyor. İlgili kayıtlar “Kaynak doğrulaması bekliyor” durumunda; Excel'in bağımsız karar/gerekçe alanları bu sınırı gösteriyor. Yedi somut bulgu dışındaki tüm tıbbi önerilere toplu son onay verilmedi.

## Veri güvenliği ve doğrulama

- İşlem öncesi APKG, dağıtım paketi, manifest, JSON ve Excel yedekleri alındı.
- Yalnız altı notun `flds`, `sfld`, `csum`, `mod` alanları değişti. GUID, not/kart ID'leri, kart satırları, çalışma geçmişi, etiketler, koleksiyon meta verileri ve diğer notlar korunuyor.
- Zip medya girdileri ve diğer dosyalar aynı; SQLite bütünlük kontrolü geçti.
- İki Excel'in 1.093 notundaki güncel Text/Extra alanları son paketle eşleşti. İlgisiz değerler, stiller, sekmeler ve yerel filtre/doğrulama kontrolleri korundu; değişen görünüm görsel olarak kontrol edildi.
- Uygulamanın gerçek göstericisiyle HIV ve oral c1 ön yüzleri için regresyon testleri geçti. UMP hesabı ve doğru enzim adı, dağıtılan şifreli katalogdan okunarak test edildi.
- `npm run quality`: 156 test dosyası / 1.647 test, TypeScript ve iOS yapılandırma/kaynak sicili kontrolleri geçti.
- iPhone canlı smoke testi yapılmadı. Paket import davranışı veya katalog sahipliği kodu değiştirilmedi; cihazda mevcut koleksiyona import/restore yapılmadı.

Manifest üretimindeki npm komutu ortamda bulunmayan `sucrase-node` nedeniyle çalışmadı; aynı mevcut `build-catalog-manifest.ts` betiği Node 24'ün TypeScript desteği ve yerel uzantı çözümleyicisiyle çalıştırıldı. Manifest toplamları 9.575 kart / 12 ders / 106 konu / 49 medya olarak korundu.

## Yerel işlem izi

`outputs/gemini-duzeltmeleri-2026-10-09-01a11d73/` içinde yedekler, önce/sonra dosya hash'leri, altı alanın uygulama kontrolleri, kaynak XML kanıtları, Excel hücre değişiklik listeleri ve son eşleşme sonuçları bulunur. Önceki bağımsız denetim snapshot'ları tarihsel kanıt olarak korunur.

## ChatGPT son rapor karşılaştırması — yalnız Patoloji

Bu ek bölüm kartlara uygulama yapmaz. Gemini'nin dosyaları değiştirilmeden, önceki raporlarındaki adaylar güncel paket ve uygulamanın gerçek `renderClozeQuestion` çıktısıyla yeniden karşılaştırıldı. Biyokimya bölümü bu karşılaştırmaya dahil edilmedi. Kararlar yalnız belirtilen bulgu içindir; notun diğer tıbbi önermelerine toplu onay değildir.

### Gemini'den alınan ve güncel veride desteklenen bulgular

| Not ID | Doğrulanan dar bulgu | Rapor için doğru işlem / sınır |
| --- | --- | --- |
| 1625238469386 | c1 gizliyken başlıkta “Tersiyer sifiliz”, satırda “sifilitik aortit” görünür. | Sifiliz cevabı için kök tarafsızlaştırılmalı. Görünür kök Treponema adını yazmadığından bütün yanıtın harfi harfine sızdığı iddia edilmedi. |
| 1604470510973 | c2 ön yüzünde “üveoparotid ateş” üç bulgunun adlarını verir. | Parantez Extra'ya taşınabilir; c2 ve üç öğrenme hedefi korunmalı. |
| 1608041801311 | c4/c5 ön yüzlerinde diğer satırlardan G1-S ve p21 okunabilir. | Yalnız Siklin E parantezini silmek tam çözüm değildir: RB satırı c4'ü, D/E satırları c5'i, inhibitör listesi p21'i açık bırakır. Numaraları birleştirmeden görevleri koruyan tasarım gerekli; otomatik tam HTML önerisi verilmedi. |
| 1604390292097 | c1'de ALK satırı akciğer adenokarsinomunu; c3'te ERB-B1/MYC satırları adenokarsinom ve nöroblastomu gösterir. | ALK satırının cevapları zaten c3 içindedir; sorun düz metin değil farklı ordinalden görünürlüktür. Yalnız ALK'yi tekrar cloze içine almak çözüm olmaz. |
| 1620369027703 | c1'de marjinal zon bölümündeki düz DLBCL ifadesi gizli cevabı gösterir. | Aynı tekrar c1 içine alınabilir. Lenfomaların bütün hücresel köken listesi bu yapısal bulguyla doğrulanmış sayılmaz. |
| 1625242082067 | c3'te Li-Fraumeni ve Turcot satırları medulloblastomu açık gösterir. | Tekrarlanan medulloblastom aynı c3 içinde gizlenebilir; sendromların tüm tıbbi kapsamı ayrı değerlendirilir. |
| 1620242619131 | c1'de başlık glikojen ve müsini açık gösterir. | Başlık tarafsızlaştırılabilir. c2'deki “diastaz” sözcüğü yöntem için bir ipucudur; tam PAS-diastaz cevabının aynen görünmesiyle eş tutulmadı. |
| 1604599510831 | c2'de mikst evre parantezi osteoblastik/osteoklastik yanıtlarını gösterir. | Parantez aynı c2 içinde gizlenebilir veya Extra'ya taşınabilir; evre öğrenme hedefleri korunmalı. |
| 1620300325642 | Özgün Text'teki Gottron, heliotrop ve Jo-1 klinik ilişkilerine ait #ff3b30 vurguları güncel Text'te yoktur. | Biçim kaybı yerel önce/sonra kanıtıyla desteklenir. Yalnız ilgili vurgular geri konabilir; “tamirci eli dermatomiyozite özgüdür” gibi ek tıbbi hüküm kurulmadı. |

Güncel pakette `1630168520911` (oral SCC) ve `1622492118390` (HIV germinal merkez) c1 cevapları ön yüzde görünmüyor. Önceki bölümde uygulanan bu iki düzeltme yeniden açık hata olarak sayılmadı. Ön yüz kanıtları: `outputs/son-denetim-2026-10-09-01a11fb0/rendered-fronts.json`.

### Alınmayan veya kapsamı düzeltilen tıbbi gerekçeler

- **Wilms (`1604400644490`, `1625595892368`)**: Diffüz anaplazinin olumsuz histolojik önemini ve bilateral renal tutulumun evre V olduğunu destekleyen bulgular korunur. “Blastem hiçbir koşulda kötü prognostik değildir” gerekçesi alınmadı: kemoterapi sonrası blastem ağırlıklı histoloji ayrı yüksek risk bağlamıdır. Yayılım listesinin 1/2/3 numaraları sıklık sırası diye onaylanmadı. [NCI Wilms PDQ — histoloji ve evreleme](https://www.cancer.gov/types/kidney/hp/wilms-treatment-pdq).
- **Prostat diyeti (`1604579385372`)**: Likopen yazım düzeltmesi, kanserden koruyuculuğun kanıtı değildir. SELECT selenyum ve E vitamini çalışmasıdır; likopen/soya/D vitamininin birlikte etkisizliğini bu çalışmaya atfetmek hatalıdır. Ön yüzdeki koruyucu hükmü ile Extra'daki kanıtlanmadı açıklaması arasındaki uyuşmazlık açıktır. [NCI Prostate Cancer, Nutrition, and Dietary Supplements PDQ](https://www.cancer.gov/about-cancer/treatment/cam/hp/prostate-supplements-pdq).
- **Kadmiyum (`1604389807636`)**: Cevap sızıntısını çözmek için akciğer yanıtını prostatla değiştirme önerisi alınmadı. IARC değerlendirmesinde akciğer kanseri ilişkisi desteklenir; prostat verileri tutarsızdır. Sızıntı tasarımı ile tıbbi cevap değişikliği ayrı tutulmalı. [IARC 100C — Cadmium and cadmium compounds](https://www.ncbi.nlm.nih.gov/books/NBK304372/).
- **Genel onay**: “609 notun tıbbi doğruluğu tamamen onaylandı”, “Robbins/WHO kitabı baştan sona okundu” ve kaynaksız tek/en sık/en kötü üstünlük iddiaları alınmadı. Doğru PMID'nin bulunması, ilgili kartın bütün iddialarının desteklenmesi değildir.

Bu karşılaştırmada yeni kart değişikliği veya yeni tıbbi yama uygulanmadı. Güncel ChatGPT ana raporlarının listesi ve kaynak kimliği kontrolünün sınırı: [Son denetim kaydı](../../outputs/son-denetim-2026-10-09-01a11fb0/SON_DENETIM.md).
