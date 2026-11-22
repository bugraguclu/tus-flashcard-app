export interface HelpIntro {
  intro: string;
  steps: string[];
  note?: string;
  related: string[];
  groups: { title: string; from: string }[];
}

export const HELP_INTROS: Record<string, HelpIntro> = {
  'tusankim-nedir': {
    intro: 'TusAnkiM, kartlarla tekrar yapmanı ve çalışma süreni takip etmeni sağlar. İlk adım için hazır TUS paketini açabilir veya kendi kartlarını ekleyebilirsin.',
    steps: ['Desteler ekranından hazır paketi, kendi kartlarını veya bir Anki dosyasını seç.', 'Bir desteye dokun; soruyu yanıtla ve ne kadar iyi hatırladığını değerlendir.', 'Zamanı gelen kartlara dön; konu çalışmanı Kronometre ile kaydet.'],
    note: 'Verilerin cihazında tutulur. Otomatik bulut eşitleme yok; cihaz dışına yedek almak senin kontrolünde.',
    related: ['hizli-baslangic', 'temel-kavramlar', 'yedekler'],
    groups: [{ title: 'Uygulama ve verilerin', from: 'Neler yapabilirsiniz?' }, { title: 'Paket ve kullanım sınırları', from: 'Hazır TUS kart paketi' }, { title: 'Rehberleri kullanma', from: 'Bu kılavuzu kullanma' }],
  },
  'temel-kavramlar': {
    intro: 'Not, bilgiyi yazdığın kayıttır; kart ise o bilgiden üretilen sorudur. Desteler kartlarını, etiketler de notlarını düzenlemene yardım eder.',
    steps: ['Bir notun ön ve arka alanına soru ile cevabını yaz.', 'Oluşan kartı bir destede çalış; cevabı açmadan önce hatırlamaya çalış.', 'Hatırlama durumuna göre Tekrar, Zor, İyi veya Kolay seç.'],
    related: ['hizli-baslangic', 'kart-ekleme', 'fsrs'],
    groups: [{ title: 'Not, kart ve koleksiyon', from: 'Aralıklı tekrar nasıl işe yarar?' }, { title: 'Kart durumları ve cevaplar', from: 'Kart durumları' }, { title: 'Çalışma düzeni', from: 'Ayar grubu' }],
  },
  'hizli-baslangic': {
    intro: 'İlk tekrarın için bir deste ve birkaç kart yeterli. Hazır TUS paketiyle başlayabilir, kendi kartını yazabilir veya Anki desteni getirebilirsin.',
    steps: ['Desteler ekranında TUS Kartları → Kartları ücretsiz aç yolunu kullan. Kendi kartın için ＋ → Kart ekle seç.', 'Bir deste adına dokun; soruyu oku ve Cevabı göster düğmesine dokun.', 'Cevabını değerlendir. Yanlış hatırladıysan Tekrar seç; yanlış düğmeye bastıysan son cevabı geri al.'],
    note: 'Güncel beta ücretsizdir; ödeme veya kart bilgisi gerekmez. Hazır paket iPhone uygulamasında internet olmadan açılabilir.',
    related: ['calisma-ekrani', 'tus-kartlari', 'yedekler'],
    groups: [{ title: 'Kurulum ve kart edinme', from: '1. İlk ekran: Desteler' }, { title: 'İlk tekrar ve günlük düzen', from: '3. Çalışın' }, { title: 'Verilerini koruma', from: '5. Verilerinizi koruyun' }],
  },
  'desteler': {
    intro: 'Desteler ekranından çalışmaya başla, yeni deste oluştur veya bir destenin ayarlarına ulaş. Deste adına dokunmak doğrudan çalışmayı açar.',
    steps: ['Çalışmak istediğin deste adına dokun; alt desteler de çalışmaya katılır.', 'Yeni deste için ＋ → Deste oluştur seç ve bir ad yaz.', 'Bir destenin ••• menüsünden Genel bakış veya Deste seçenekleri aç.'],
    note: 'Deste silme kartlarını da etkiler. Silme adımından önce yedeğini ve ekrandaki onayı kontrol et.',
    related: ['calisma-ekrani', 'deste-secenekleri', 'kartlarim-ve-arama'],
    groups: [{ title: 'Deste seçme ve çalışma', from: 'Deste listesi' }, { title: 'Deste oluşturma ve menüler', from: 'Deste oluşturmak' }, { title: 'Taşıma, silme ve genel bakış', from: 'Yeniden adlandırmak ve taşımak' }, { title: 'Kısayollar ve gezinme', from: 'Deste kısayolu' }],
  },
  'calisma-ekrani': {
    intro: 'Soruyu oku, cevabını aklından ver ve ardından cevabı aç. Değerlendirme düğmeleri bir sonraki tekrarın zamanını belirler.',
    steps: ['Desteler ekranında çalışmak istediğin deste adına dokun.', 'Cevabı hatırlamaya çalış; sonra Cevabı göster seç.', 'Hatırlamadıysan Tekrar, zorlanarak hatırladıysan Zor, normal hatırladıysan İyi, çok rahat hatırladıysan Kolay seç.'],
    note: 'Yanlış cevabı Zor ile geçme; Tekrar seç. Yanlışlıkla bastığın son değerlendirmeyi geri alabilirsin.',
    related: ['temel-kavramlar', 'fsrs', 'deste-secenekleri'],
    groups: [{ title: 'Kartı çalışma ve değerlendirme', from: 'Çalışmaya başlama' }, { title: 'Geri alma ve kart işlemleri', from: 'Geri alma ve yineleme' }, { title: 'Ses, yazı ve dokunma araçları', from: 'Ses ve metin okuma' }, { title: 'Oturum ayarları ve bitiş', from: 'Zaman kutusu' }],
  },
  'deste-secenekleri': {
    intro: 'Günlük tekrar limitini, öğrenme adımlarını ve kart sırasını bu ekranda ayarla. Önce hangi destenin hangi ayar grubunu kullandığını kontrol et.',
    steps: ['Deste satırındaki ••• → Deste seçenekleri yolunu aç.', 'Üstteki ayar grubunu kontrol et; bu grubu kullanan diğer desteler de değişiklikten etkilenir.', 'İhtiyacın olan ayarı değiştir ve Kaydet seç.'],
    note: 'FSRS anahtarı bütün koleksiyonu etkiler. Ayar grubundaki diğer seçenekler o grubu kullanan destelere uygulanır.',
    related: ['fsrs', 'desteler', 'calisma-ekrani'],
    groups: [{ title: 'Ayar grubu ve günlük limitler', from: 'Deste seçeneklerini açmak' }, { title: 'Öğrenme, unutma ve FSRS', from: 'Yeni kartlar' }, { title: 'Sıralama, gömme ve çalışma araçları', from: 'Görüntüleme sırası' }, { title: 'Gelişmiş ayarlar ve kaydetme', from: 'Kolay günler' }],
  },
  'fsrs': {
    intro: 'FSRS-6, cevap geçmişinden kartı ne zaman unutabileceğini tahmin eder ve tekrar aralığını buna göre seçer. Hedef hatırlama oranı çalışma yükünü de etkiler.',
    steps: ['Bir destenin ••• menüsünden Deste seçenekleri aç.', 'FSRS bölümünde zamanlayıcıyı ve hedeflenen hatırlama oranını kontrol et.', 'Değişikliği kaydet; optimize etme ve yeniden zamanlama işlemlerini kullanmadan önce aşağıdaki açıklamaları oku.'],
    note: 'FSRS açma veya kapatma bütün koleksiyon için geçerlidir. Hedefi yükseltmek genellikle daha sık tekrar getirir.',
    related: ['deste-secenekleri', 'calisma-ekrani', 'istatistikler'],
    groups: [{ title: 'FSRS’i açma ve hedef belirleme', from: 'FSRS nedir?' }, { title: 'Optimizasyon ve yeniden zamanlama', from: 'Parametreleri optimize etmek' }, { title: 'Hesaplama ve Anki ile farklar', from: 'Hafıza durumu nasıl hesaplanır?' }],
  },
  'kart-ekleme': {
    intro: 'Bir not ekleyerek soru ve cevap kartlarını oluştur. İlk kart için Temel not türünü kullan; görsel, ses ve biçimlendirmeyi gerektiğinde ekle.',
    steps: ['Desteler ekranında ＋ → Kart ekle seç.', 'Tür ve Deste satırlarını kontrol et; Ön alanına soruyu, Arka alanına cevabı yaz.', '✓ ile kaydet. Yeni kart eklemek için alanlar boşalır; işin bitince geri dön.'],
    note: 'Bir not türü birden fazla kart üretebilir. Hazır TUS kartlarındaki kişisel metin değişiklikleri yedeklere ve dışa aktarmaya dahil edilmez.',
    related: ['not-turleri', 'kartlarim-ve-arama', 'tus-kartlari'],
    groups: [{ title: 'Not türü, alanlar ve metin', from: 'Ekranı açmak' }, { title: 'Görsel, ses ve çizim', from: 'Resim, video ve dosya ekleme' }, { title: 'Etiket, önizleme ve kaydetme', from: 'Etiketler' }, { title: 'Ek işlemler ve hazır TUS kartları', from: '••• menüsü' }],
  },
  'not-turleri': {
    intro: 'Not türü, hangi alanların bulunduğunu ve bunlardan hangi kartların üretildiğini belirler. Alanları ve şablonları değiştirmeden önce önizlemeyi kontrol et.',
    steps: ['Not türleri ekranında düzenlemek istediğin türü seç.', 'Alanları ve kart türlerini incele; soru ve cevap için hangi alanların kullanıldığına bak.', 'Değişikliği önizle, ardından kaydet.'],
    note: 'Bir şablon değişikliği o not türünü kullanan bütün notları etkileyebilir. Büyük değişikliklerden önce yedek al.',
    related: ['kart-ekleme', 'kartlarim-ve-arama', 'yedekler'],
    groups: [{ title: 'Not türleri, alanlar ve kartlar', from: 'Not türleri ekranı' }, { title: 'Şablonları düzenleme', from: 'Ön yüz ve arka yüz şablonları' }, { title: 'Stil, kontroller ve tür değiştirme', from: 'Stil (CSS)' }],
  },
  'kartlarim-ve-arama': {
    intro: 'Bir kartı bulmak için deste seç, arama yaz ve gerektiğinde filtre ekle. Arama ile filtreler aynı liste üzerinde birlikte çalışır.',
    steps: ['Desteler ekranının altından Kartlarım’ı aç.', 'Deste seçiciden kapsamı belirle; arama kutusuna bir kelime yaz.', 'Bir kartı açarak incele veya kalemle düzenle. Toplu işlem için bir satırı basılı tut.'],
    note: 'Notlar görünümündeki işlemler notun bütün kartlarına uygulanır. Toplu silmeden veya sıfırlamadan önce seçili kapsamı kontrol et.',
    related: ['kart-ekleme', 'filtrelenmis-deste', 'yedekler'],
    groups: [{ title: 'Kart bulma, filtreler ve görünüm', from: "Kartlarım'ı açma" }, { title: 'Seçim ve toplu düzenleme', from: 'Kart seçme ve toplu işlemler' }, { title: 'Zamanlama, dışa aktarma ve silme', from: 'Vade tarihini ayarlama' }, { title: 'Arama terimleri ve örnekler', from: 'Arama: temel kullanım' }, { title: 'Kart bilgisi ve ilgili konular', from: 'Kart bilgisi' }],
  },
  'filtrelenmis-deste': {
    intro: 'Bir aramaya uyan kartları geçici bir çalışma destesinde topla. Kartların asıl desteleri değişmez; çalışma bittiğinde geri dönerler.',
    steps: ['Filtrelenmiş deste oluştur ekranını aç ve desteye bir ad ver.', 'Arama, kart limiti ve sıralamayı belirle.', 'Kartları yeniden zamanla seçeneğini kontrol et; önizleme istiyorsan kapat ve desteyi oluştur.'],
    note: 'Yeniden zamanlama açıkken cevapların kartların takvimini değiştirir. Önizleme modunda kalıcı zamanlama değişmez.',
    related: ['kartlarim-ve-arama', 'desteler', 'deste-secenekleri'],
    groups: [{ title: 'Oluşturma ve kart seçimi', from: 'Filtrelenmiş deste nedir?' }, { title: 'Önizleme ve desteyi yenileme', from: 'Kartları yeniden zamanla (önizleme)' }, { title: 'Özel çalışma seçenekleri', from: 'Özel çalışma' }],
  },
  'istatistikler': {
    intro: 'İstatistikler, kart tekrarlarını ve yaklaşan çalışma yükünü gösterir. Önce deste ve dönemi seç; sonra ihtiyacın olan grafiğe bak.',
    steps: ['Desteler ekranının altındaki İstatistik düğmesini aç.', 'Deste seçiciden kapsamı ve dönem kontrolünden zaman aralığını belirle.', 'Bugün, Tekrarlar ve Gelecek vadeler ile tamamlanan ve yaklaşan kart çalışmalarını incele.'],
    note: 'Kronometre oturumları kart istatistiklerinin çalışma süresine eklenmez; Çalışma serisi ve Çalışma Takvimi’nde yer alır.',
    related: ['kronometre', 'fsrs', 'deste-secenekleri'],
    groups: [{ title: 'Kapsam, bugün ve çalışma serisi', from: 'Deste ve dönem seçimi' }, { title: 'Tekrarlar ve hatırlama', from: 'Gelecek vadeler' }, { title: 'Kart dağılımı ve grafikler', from: 'Tekrar aralıkları' }],
  },
  'kronometre': {
    intro: 'Konu, soru veya deneme çalışmanın süresini kaydet. Molaları ayrı tut; biten oturumlarını Çalışma Takvimi’nde gör.',
    steps: ['Desteler ekranından Kronometre’yi aç ve Başla seç.', 'Ders ve çalışma türünü belirleyip Başla düğmesine dokun.', 'Mola Ver ile ara ver, Devam Et ile dön. Bitince Sonlandır seç ve kaydı onayla.'],
    note: 'Kronometre kendiliğinden mola vermez veya durmaz. Sonlandırılan oturum devam ettirilemez; yeni oturum başlatabilirsin.',
    related: ['istatistikler', 'ayarlar', 'yedekler'],
    groups: [{ title: 'Başlatma, mola ve bitirme', from: 'Kronometre ekranı' }, { title: 'Oturumlar, günlük hedef ve planlar', from: 'Son Çalışmalarınız ve oturumlar' }, { title: 'Hatırlatmalar ve arka plan', from: 'Sınav tarihi' }, { title: 'Çalışma Takvimi ve toplamlar', from: 'Çalışma Takvimi' }],
  },
  'ice-disa-aktarma': {
    intro: 'Kişisel destelerini Anki paketleriyle, notlarını metin dosyalarıyla taşı. İçe aktarmadan önce dosya türünün mevcut kartlarına ne yapacağını kontrol et.',
    steps: ['Desteler → ••• → İçe aktar yolunu aç ve Dosya seç düğmesine dokun.', 'Dosya türünü ve seçenekleri kontrol et; ardından İçe aktar seç.', 'İşlem günlüğünü oku. Dosya oluşturmak için ayrı Dışa aktar ekranını kullan.'],
    note: '.colpkg bütün koleksiyonun yerine geçer; .apkg koleksiyonuna eklenir. Mevcut verilerini korumak için önce cihaz dışına yedek al. Hazır TUS paketi ve ilerlemesi dışa aktarılmaz.',
    related: ['yedekler', 'anki-ile-kullanma', 'tus-kartlari'],
    groups: [{ title: 'Dosya seçme ve içe aktarma', from: 'İçe aktarma' }, { title: 'Metin dosyaları ve işlem günlüğü', from: 'Metin dosyaları (CSV, TSV, TXT)' }, { title: 'Dışa aktarma ve dosya içeriği', from: 'Dışa aktarma' }, { title: 'Cihaz değiştirme ve paylaşma', from: 'Koleksiyonu yeni bir cihaza taşıma' }],
  },
  'yedekler': {
    intro: 'Yedekler, koleksiyonunu önceki bir kayda döndürmeni sağlar. Cihazda tutulan yedeklerin bir kopyasını cihaz dışına da çıkar.',
    steps: ['Ayarlar → Veri yönetimi → Yedekler yolunu aç.', 'Elle bir yedek oluştur; paylaşma seçeneğiyle Dosyalar’a veya başka güvenli bir konuma kopyala.', 'Geri yüklemeden önce yedek tarihini ve mevcut koleksiyonun değişeceğini kontrol et.'],
    note: '“İlerlemeyi sıfırla” yalnızca tekrar geçmişini temizlemez; bütün koleksiyonu silip başlangıç durumuna döndürür. Hazır TUS paketinin ilerlemesi yedeklere dahil edilmez.',
    related: ['ice-disa-aktarma', 'tus-kartlari', 'ayarlar'],
    groups: [{ title: 'Yedek alma, paylaşma ve geri yükleme', from: 'Otomatik yedekler' }, { title: 'Medya ve veritabanı bakımı', from: 'Medyayı denetle' }, { title: 'Boş kartlar, sıfırlama ve cihazdan silme', from: 'Boş kartlar' }],
  },
  'ayarlar': {
    intro: 'Görünümü, hatırlatmaları ve çalışma kontrollerini buradan düzenle. Bir ayarı bulmak için kategori listesinin üstündeki aramayı kullan.',
    steps: ['Desteler ekranının altındaki Ayarlar düğmesini aç.', 'Aramaya “tema”, “klavye” veya aradığın ayarın adını yaz; ilgili kategoriyi aç.', 'Değişiklikleri dene ve sağ üstteki Kaydet düğmesine dokun.'],
    note: 'Normal ayarlar Kaydet ile saklanır. Veri yönetimi ve Varsayılan ayarlara dön komutları onaylandıkları anda çalışır.',
    related: ['deste-secenekleri', 'yedekler', 'calisma-ekrani'],
    groups: [{ title: 'Ayar bulma ve kaydetme', from: 'Ayarları açma' }, { title: 'Görünüm ve çalışma tercihleri', from: 'Genel' }, { title: 'Bildirimler ve kontroller', from: 'Bildirimler' }, { title: 'Erişilebilirlik ve veri yönetimi', from: 'Erişilebilirlik' }],
  },
  'tus-kartlari': {
    intro: 'Hazır TUS paketi 12 derste 9.575 kart içerir. Güncel betada ödeme ve hesap gerektirmeden açılır; ders veya alt deste seçerek çalışabilirsin.',
    steps: ['Desteler ekranında TUS Kartları satırını aç.', 'İçeriği incele ve Kartları ücretsiz aç düğmesine dokun.', 'Kurulumdan sonra bir ders veya alt deste seçerek çalışmaya başla.'],
    note: 'Hazır paket ve ilerlemesi dışa aktarılamaz, yedekten veya otomatik eşitlemeyle başka cihaza taşınamaz. Kişisel metin değişiklikleri de yedeklere dahil değildir.',
    related: ['hizli-baslangic', 'calisma-ekrani', 'ice-disa-aktarma'],
    groups: [{ title: 'Paket içeriği, kurulum ve çalışma', from: 'Pakette neler var?' }, { title: 'Düzenleme ve içerik güncellemeleri', from: 'Kartları düzenleme' }, { title: 'Yedekler, cihaz değişimi ve kaldırma', from: 'Yedekler ve dışa aktarma' }],
  },
  'kisayollar': {
    intro: 'Sık kullandığın bir desteye daha hızlı ulaşabilir, bağlantılarla kart ekleme veya arama ekranını açabilirsin. Klavye kullanıyorsan ekranına uygun tuşlara bak.',
    steps: ['Deste menüsündeki kısayol seçeneğini kullanarak desteye doğrudan bağlantı oluştur.', 'Kart ekleme veya arama bağlantısı hazırlarken aşağıdaki bağlantı biçimlerini kullan.', 'Klavye tuşlarını Çalışma ekranı rehberindeki listeden kontrol et.'],
    related: ['desteler', 'calisma-ekrani', 'kartlarim-ve-arama'],
    groups: [{ title: 'Deste ve uygulama bağlantıları', from: 'Deste kısayolları' }, { title: 'Tarayıcı ve klavye', from: 'Web sürümü' }],
  },
  'anki-ile-kullanma': {
    intro: 'Kişisel Anki destelerini dosyayla TusAnkiM’e getirip tekrar dışa aktarabilirsin. Desteklenen içerik ve bilinen farkları taşımadan önce kontrol et.',
    steps: ['Anki’den seçtiğin desteyi .apkg olarak dışa aktar.', 'Dosyayı TusAnkiM’in İçe aktar ekranında seç; geçmişi getirip getirmeyeceğini kontrol et.', 'İşlem günlüğünü oku ve örnek kartların metin, medya ve zamanlamasını incele.'],
    note: 'Tam koleksiyon için kullanılan .colpkg mevcut koleksiyonun yerine geçer. İki uygulama arasında otomatik eşitleme ve tam özellik eşitliği yoktur.',
    related: ['ice-disa-aktarma', 'yedekler', 'not-turleri'],
    groups: [{ title: 'Anki’den kart getirme', from: 'Neler taşınır?' }, { title: 'Geri taşıma ve birlikte kullanma', from: "TusAnkiM'den Anki'ye götürmek" }, { title: 'Bilinen farklar ve dosya sınırları', from: "Anki'den farklı çalışan yerler" }],
  },
  'sss': {
    intro: 'Kart gelmemesi, yanlış cevap düğmesi veya dosya açılmaması gibi kullanım sorunlarını burada çözebilirsin. Fiyat ve ürün soruları ayrı SSS sayfasında.',
    steps: ['Aşağıdan sorununla ilgili bölümü aç.', 'Önerilen kontrolü uygula; veri silme veya geri yükleme adımından önce yedek al.', 'Sorun sürüyorsa cihazını, uygulama sürümünü ve izlediğin adımları destek talebine ekle.'],
    related: ['yedekler', 'ayarlar', 'hizli-baslangic'],
    groups: [{ title: 'Çalışma ve kart görünümü sorunları', from: 'Çalışma' }, { title: 'Veri ve TUS paketi sorunları', from: 'Verileriniz' }, { title: 'Uygulama sorunları ve destek', from: 'Uygulama sorunları' }],
  },
  'sozluk': {
    intro: 'Uygulamadaki bir terimin ne anlama geldiğine ve İngilizce karşılığına bak. Terimleri konu başlıkları altında bulabilirsin.',
    steps: ['Aradığın terimin ilgili olduğu konu grubunu aç.', 'Tabloda Türkçe terimi, İngilizce karşılığını ve kısa açıklamasını bul.', 'İşlemin adımları için ilgili kullanım rehberine geç.'],
    related: ['temel-kavramlar', 'deste-secenekleri', 'kart-ekleme'],
    groups: [{ title: 'Temel terimler ve çalışma', from: 'Temel terimler' }, { title: 'Deste, kart ve düzenleme', from: 'Deste seçenekleri' }, { title: 'Veriler ve uygulama bölümleri', from: 'Veriler' }],
  },
};
