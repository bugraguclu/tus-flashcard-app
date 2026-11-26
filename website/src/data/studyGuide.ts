import type { WebsiteSearchEntry } from '../lib/websiteSearchIndex';
import catalog from './generated/catalog.json';
import refSummary from './generated/references-summary.json';
import examsData from './exams.json';
import {
  DEFAULT_PLANNER_INPUT,
  MEGA_DECK_CARDS,
  PLANNER_PRESETS,
  formatDurationTr,
  runPlanner,
} from '../lib/studyPlanner';
import { num, pct } from '../lib/format';

const totalCards = num(catalog.totals.cards);
const megaCards = num(MEGA_DECK_CARDS);
const refBySubject = new Map(refSummary.bySubject.map((s) => [s.ders, s]));
const destekPct = (ders: string) => {
  const row = refBySubject.get(ders);
  if (!row) throw new Error(`Missing subject in references-summary.json: ${ders}`);
  return pct(row.destekOran);
};

const runPreset = (id: 'stajyer' | 'intorn' | 'mezun' | 'son4ay') => {
  const preset = PLANNER_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Missing preset in PLANNER_PRESETS: ${id}`);
  return runPlanner({ ...DEFAULT_PLANNER_INPUT, ...preset.patch });
};

const stajyerSim = runPreset('stajyer');
const intornSim = runPreset('intorn');
const mezunSim = runPreset('mezun');
const sim270_60 = runPlanner({
  ...DEFAULT_PLANNER_INPUT,
  days: 270,
  newPerDay: mezunSim.activePace,
  studyDaysPerWeek: 7,
  bufferDays: 0,
});
const [exam1, exam2] = examsData.exams;
if (!exam1 || !exam2) throw new Error('Missing 2027 exams in exams.json');

export const GUIDE_META = {
  title: 'TUS Çalışma Rehberi 2027: Plan ve FSRS-6 | TusAnkiM',
  description:
    '2027 TUS çalışma rehberi: günde kaç kart çalışmalı, 11 branşa nasıl zaman ayırmalı, puan nasıl hesaplanır, sınav ne zaman? Sık takılınan 7 soruna çözümler.',
  kicker: 'TUS çalışma rehberi · 2027',
  h1: 'TUS çalışma rehberi: plan, 11 branş ve FSRS-6',
  lead:
    'Sınava kaç gün kaldığına bak, günlük temponu ona göre kur. Bu rehber 2027 ÖSYM takvimini, son 30 günde ne yapacağını, 11 branşın puana etkisini ve TUS hazırlığında en çok takılınan 7 sorunun çözümünü anlatır.',
} as const;

export interface GuideTocItem {
  id: string;
  label: string;
}

export const GUIDE_TOC: GuideTocItem[] = [
  { id: 'hizli-ozet', label: 'Hızlı özet' },
  { id: 'tempo-ve-profiller', label: 'Çalışma temposu' },
  { id: 'tus-takvimi', label: '2027 takvimi' },
  { id: 'brans-stratejisi', label: '11 Branş' },
  { id: 'puan-ve-mevzuat', label: 'Puan ve mevzuat' },
  { id: 'fsrs-ve-hacim', label: 'FSRS-6 ve rutin' },
  { id: 'kartlari-dene', label: 'Kartları dene' },
  { id: 'zorluklar', label: '7 zorluk ve çözüm' },
  { id: 'rehber-sss', label: 'Sık Sorulanlar' },
  { id: 'kaynaklar', label: 'Kaynaklar' },
];

export interface BranchStudyNote {
  /** Matches `references-summary.json` `bySubject[].ders` exactly. */
  ders: string;
  /** Matches `catalog.json` `courses[].id` exactly. */
  catalogId: string;
  group: 'Temel' | 'Klinik';
  /** Official ÖSYM question count per TUS sitting (2024–2026 standard 100+100 format). */
  examQuestionsLabel: string;
  /** Concise study guidance grounded in exam format & catalog coverage. */
  focus: string;
  priorityTag: 'Kart ağırlıklı' | 'Kart ve soru dengeli' | 'Atlas ve vaka da gerekir';
}

export const BRANCH_STUDY_NOTES: BranchStudyNote[] = [
  {
    ders: 'Anatomi',
    catalogId: 'bka-anatomi',
    group: 'Temel',
    examQuestionsLabel: '13 soru',
    priorityTag: 'Atlas ve vaka da gerekir',
    focus: 'Baş-boyun, nöroanatomi ve komşuluklarda kartların yanına görsel atlas aç, Görsel Gizleme kartlarını kullan.',
  },
  {
    ders: 'Fizyoloji-Histoloji-Embriyoloji',
    catalogId: 'bka-fhe',
    group: 'Temel',
    examQuestionsLabel: '15 soru',
    priorityTag: 'Kart ve soru dengeli',
    focus: 'Hücre ve doku histolojisini, temel fizyoloji mekanizmalarını Dahiliye ve Farmakolojiyle bağlantı kurarak çalış.',
  },
  {
    ders: 'Biyokimya',
    catalogId: 'bka-biyokimya',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Kart ağırlıklı',
    focus: 'Enzim eksiklikleri, hız kısıtlayıcı basamaklar ve vitamin-kofaktörler kart tekrarıyla çabuk nete döner.',
  },
  {
    ders: 'Mikrobiyoloji',
    catalogId: 'bka-mikrobiyoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Kart ağırlıklı',
    focus: 'Bakteriyoloji ve virolojide etken, virülans, tanı ve ilk tercih tedavi eşleştirmelerini her gün küçük bloklarla tekrar et.',
  },
  {
    ders: 'Patoloji',
    catalogId: 'bka-patoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Kart ve soru dengeli',
    focus: 'Genel patoloji ve sistem morfolojisi. Histopatolojik ayırt edici bulguları klinik vakayla bağlayarak çalış.',
  },
  {
    ders: 'Farmakoloji',
    catalogId: 'bka-farmakoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Kart ağırlıklı',
    focus: 'Etki mekanizması, önemli yan etkiler ve kontrendikasyonlar. TUS dersleri içinde kart tekrarına en uygun ders budur.',
  },
  {
    ders: 'Dahiliye',
    catalogId: 'bka-dahiliye',
    group: 'Klinik',
    examQuestionsLabel: '24 soru',
    priorityTag: 'Kart ve soru dengeli',
    focus: 'Hematoloji, kardiyoloji ve endokrinolojide tanı kriterini ve ilk basamak yaklaşımı çalış; üstüne çıkmış vaka sorusu çöz.',
  },
  {
    ders: 'Pediatri',
    catalogId: 'bka-pediatri',
    group: 'Klinik',
    examQuestionsLabel: '24–25 soru',
    priorityTag: 'Kart ağırlıklı',
    focus: 'Yenidoğan, aşı takvimi, döküntülü hastalıklar ve metabolizma. Soru sayısı yüksek, bu yüzden erken başla.',
  },
  {
    ders: 'Genel Cerrahi',
    catalogId: 'bka-genel-cerrahi',
    group: 'Klinik',
    examQuestionsLabel: '20 soru',
    priorityTag: 'Atlas ve vaka da gerekir',
    focus: 'Sorular çoğunlukla algoritma ve acil cerrahi yönetimden gelir. Kart tekrarının üstüne travma ve GİS vaka sorusu çöz.',
  },
  {
    ders: 'Kadın Doğum',
    catalogId: 'bka-kadin-dogum',
    group: 'Klinik',
    examQuestionsLabel: '10 soru',
    priorityTag: 'Kart ve soru dengeli',
    focus: 'Obstetri, jinekolojik onkolojide evreleme ve acil gebelik yönetimi. Konu görece dar olduğu için netin istikrarlı kalır.',
  },
  {
    ders: 'Küçük Stajlar',
    catalogId: 'bka-kucuk-stajlar',
    group: 'Klinik',
    examQuestionsLabel: '21–22 soru',
    priorityTag: 'Atlas ve vaka da gerekir',
    focus: 'Nöroloji, göz, dermatoloji, KBB, psikiyatri derken 15 alt branşa yayılır. Son haftaya bırakma, küçük parçalarla döndür.',
  },
];

export interface StruggleItem {
  number: string;
  tag: string;
  tone: 'teal' | 'warm';
  title: string;
  why: string;
  steps: string[];
  links: { label: string; href: string }[];
}

export const TUS_STRUGGLES: StruggleItem[] = [
  {
    number: '01',
    tag: 'Kalıcılık ve unutma',
    tone: 'teal',
    title: 'Okuduğunu unutuyorsun, 11 branşı aynı anda aklında tutamıyorsun',
    why:
      'Fakültede komite sınavları 2–4 haftalık bilgiyi ölçer. TUS ise 6 Temel ve 5 Klinik branşın ince ayrıntılarını aynı gün, 200 soruda sorar. Kalın konu kitabını baştan sona yeniden okumak aylar alır; ilk çalıştığın dersi sınav ayında hiç çalışmamış gibi hissedersin.',
    steps: [
      'Bir konuyu okuduğun gün o alt destenin boşluk doldurma kartlarını aç. Cevabı görmeden kendin hatırlamaya çalış.',
      'Hedef hatırlamayı %90’da (0,90) tut. Kartı ne zaman göstereceğine FSRS-6 karar versin; aralık kartın zorluğuna göre dakikalardan aylara kendiliğinden uzar.',
      'İlerlemeni yalnız okuduğun sayfa sayısıyla ölçme. İstatistikler ekranında Genç (aralığı 21 günden kısa) ve Olgun (21 gün ve üzeri) kartlardaki hatırlama oranına da bak.',
    ],
    links: [
      { label: 'FSRS-6 rehberi', href: '/yardim/fsrs/' },
      { label: 'İstatistikleri okuma', href: '/yardim/istatistikler/' },
    ],
  },
  {
    number: '02',
    tag: 'Tekrar borcu',
    tone: 'warm',
    title: 'Tekrarlar birikiyor, günlük kart sayısı 800–1.000’i geçiyor',
    why:
      `İlk heyecanla günde 100’den fazla yeni kart açarsan, ${megaCards}+ kartlık mega destelere girersen, hedef hatırlamayı %95’in üstüne çekersen ya da birkaç gün üst üste tekrar atlarsan kuyruk büyür. Bir noktadan sonra vadesi gelen kartlar bir günde bitmez.`,
    steps: [
      'Kuyruk normale dönene kadar günlük yeni kart sınırını 0 yap. Yalnız vadesi gelen tekrarları bitir.',
      'Hedef hatırlamayı %95+ yerine %88–%90 arasında tut. Yoğun staj ve nöbet haftalarında %85’e indir.',
      'Birikmiş kartları Filtrelenmiş Deste ile 100 kartlık oturumlara böl. Çabuk toparlanmak için sıralamada Hatırlanabilirlik (azalan) ya da gecikme önceliğini seç.',
      'Ağır günler için Deste Seçenekleri › Kolay günler ayarında Azaltılmış ya da Yok seç. 8 ve daha fazla kez unuttuğun kartları (sülük kartlar) kısalt ya da ikiye böl.',
    ],
    links: [
      { label: 'Filtrelenmiş deste rehberi', href: '/yardim/filtrelenmis-deste/' },
      { label: 'Deste seçenekleri ve sınırlar', href: '/yardim/deste-secenekleri/' },
    ],
  },
  {
    number: '03',
    tag: 'Temel ve Klinik dengesi',
    tone: 'teal',
    title: 'Klinik istiyorsun diye Temel Bilimleri sona bırakmak (ya da tam tersi)',
    why:
      'Klinik branş isteyen adayların çoğu zamanını Dahiliye, Pediatri ve Genel Cerrahiye verir, 6 Temel dersi sona bırakır. Ama ÖSYM Klinik Tıp Puanını %40 Temel + %60 Klinik ağırlığıyla hesaplar. Temel netin düşerse Klinik puanın da düşer.',
    steps: [
      'Temel ve Klinik çalışmalarını Kronometre’de ders ders kaydet. Çalışma Takvimi ve analiz ekranında haftalık Temel/Klinik dağılımına bak.',
      `İlk turda son 6 TUS’ta çözüm desteği yüksek olan derslerle başla: Farmakoloji (${destekPct('Farmakoloji')}), Biyokimya (${destekPct('Biyokimya')}), Mikrobiyoloji (${destekPct('Mikrobiyoloji')}) ve Pediatri (${destekPct('Pediatri')}).`,
      `Anatomi (${destekPct('Anatomi')}), Küçük Stajlar (${destekPct('Küçük Stajlar')}) ve Genel Cerrahi (${destekPct('Genel Cerrahi')}) gibi derslerde kart tekrarının yanına görsel atlas ve klinik vaka sorusu ekle.`,
    ],
    links: [
      { label: 'Puan ağırlıklarını hesapla', href: '/puan-hesapla/' },
      { label: 'Kronometre ve takvim', href: '/yardim/kronometre/' },
    ],
  },
  {
    number: '04',
    tag: 'İntörnlük, nöbet ve tükenmişlik',
    tone: 'warm',
    title: 'Nöbet ve ağır staj haftalarında “ya hep ya hiç” deyip bırakmak',
    why:
      'Haftanın 7 gününe aynı yüksek hedefi yazan program ilk 24–36 saatlik nöbette, sınav haftasında ya da hastalandığında bozulur. Bir gün aksayınca suçluluk duyarsın ve haftanın kalanını da bırakırsın.',
    steps: [
      'Çalışma Planı aracında haftada 5 ya da 6 gün yeni kart aç. Nöbet ve dinlenme günlerinde yeni kart açma, yalnız tekrar yap.',
      'Kronometre’de 50 dakika çalışma, 10 dakika mola hatırlatıcısını kullan. Kendine günlük bir üst sınır koy ve onu aşma.',
      'Nöbet ertesi yorgunken konu okumaya zorlanma; 15–20 dakikada vadesi gelen kartları bitir. Ritmi korumak, sıfırdan başlamaktan çok daha kolaydır.',
    ],
    links: [
      { label: 'Haftada 5–6 gün planı kur', href: '/calisma-plani/' },
      { label: 'Ayarlar ve hatırlatmalar', href: '/yardim/ayarlar/' },
    ],
  },
  {
    number: '05',
    tag: 'Kaynak dağınıklığı ve pasif okuma',
    tone: 'teal',
    title: 'Çok kaynak arasında boğulmak ve altını çizince öğrendiğini sanmak',
    why:
      'Aynı ders için farklı dershane kitaplarını, PDF özetleri, video notlarını ve 25.000+ kartlık paylaşılan desteleri birlikte götürmeye çalışırsan hiçbiri bitmez. Metni fosforlu kalemle okumak da yanıltır: konu tanıdık gelir ama şıklardaki klinik ayrımı hatırlatmaz.',
    steps: [
      `Her branş için tek bir ana konu kaynağı ve bitirebileceğin tek bir kart destesi seç (örneğin ${totalCards} kartlık BKA TUS paketi).`,
      `Son 6 TUS verisinde konu kapsamı ${pct(refSummary.overall.konuKapsamiOran)}, çözüm desteği ${pct(refSummary.overall.destekOran)}. Aradaki fark şunu gösterir: konuyu görmüş olmak yetmez, sorunun sorduğu ayırt edici bilgiyi kendin hatırlaman gerekir.`,
      'Notlarında eksik gördüğün yerleri uzun paragraf yerine tek bilgi soran kısa kartlara çevir. Yanlış cevapladığın kartta Zor’a değil, her zaman Tekrar’a bas.',
    ],
    links: [
      { label: 'Çalışma ekranı ve değerlendirme', href: '/yardim/calisma-ekrani/' },
      { label: 'Kendi kartını ekleme', href: '/yardim/kart-ekleme/' },
    ],
  },
  {
    number: '06',
    tag: 'Deneme platosu (55–65 bandı)',
    tone: 'warm',
    title: 'Deneme netleri aynı aralıkta takılıp kalıyor',
    why:
      'Çoğu aday haftada çözdüğü soru sayısını artırır ama yanlışlarının neden çıktığına bakmaz. Aynı iki şık arasında kalıp tekrar tekrar yanlış yaptığın klinik ayrımları düzeltmedikçe netlerin 55–65 bandında kalır.',
    steps: [
      'Her denemeden sonra yanlış ve boşlarını 3 gruba ayır: (A) hiç görmediğim bilgi, (B) çalıştığım ama iki şıkta karıştırdığım ya da unuttuğum bilgi, (C) soru kökünü dikkatsiz okuduğum soru.',
      'Puan en hızlı (B) grubundan gelir. Karıştırdığın iki hastalığı ya da ilacı kıyaslayan tek cümlelik kartlar yaz ve “deneme-yanlis” etiketiyle topla.',
      'Kartlarım arama ekranında bu etiketi ya da en çok hata yaptığın dersin alt destesini filtrele. 7–10 gün sonra kendini yeniden sına.',
    ],
    links: [
      { label: 'Kartlarım ve arama filtreleri', href: '/yardim/kartlarim-ve-arama/' },
      { label: 'Son 6 TUS referans kanıtları', href: '/referanslar/' },
    ],
  },
  {
    number: '07',
    tag: 'Son 30–60 gün paniği',
    tone: 'teal',
    title: 'Sınav yaklaşırken yeni kaynak açmak ve oturmuş bilgiyi kaybetmek',
    why:
      'Son ayda kaygı artar. “Ya buradan soru gelirse” diye yeni özet kitapçıklara ya da yüzlerce yeni karta yönelirsin. Son 3–4 haftada açtığın yüzlerce kart sınava kadar oturmaz; asıl işe yarayan mevcut tekrarların da aksar.',
    steps: [
      'İlk turu sınavdan en az 14–30 gün önce bitirecek şekilde tampon bırak. Bu dönemde yeni kart açma.',
      'Son 2–3 haftada tekrar takvimini bozmadan hedefli çalışmak için Filtrelenmiş Deste › Önizleme modunu ve Özel Çalışma seçeneklerini kullan.',
      'Son 6–10 TUS’un çıkmış sorularını süre tutarak çöz (Kronometre › Deneme oturumu). Sınava 48 saat kala ağır yeni konu açma; dinlen ve kısa tekrarlar yap.',
    ],
    links: [
      { label: 'Tampon günlü planını hesapla', href: '/calisma-plani/' },
      { label: 'Önizleme ve özel çalışma', href: '/yardim/filtrelenmis-deste/' },
    ],
  },
];

export interface WorkflowStep {
  step: string;
  name: string;
  summary: string;
  detail: string;
  href: string;
  linkLabel: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: '01',
    name: 'Sınav tarihine göre temponu ve tamponunu belirle',
    summary: 'Kartlara günde 60–125 dakika ayır, 2–4+ saati konuya ve soruya bırak.',
    detail:
      'Günlük yeni kart sayını üç şeye göre seç: sınava kalan gün, çalışacağın dersler ve haftada kaç gün yeni kart açabileceğin. Sınavdan önceki son 14–30 günde yeni kart açma; bu süreyi tekrara ve denemeye ayır.',
    href: '/calisma-plani/',
    linkLabel: 'FSRS-6 planlayıcıyı aç',
  },
  {
    step: '02',
    name: 'Her gün önce vadesi gelen tekrarları bitir, sonra yeni kart aç',
    summary: 'Tekrar zamanını FSRS-6’ya bırak (%90 hedef hatırlama).',
    detail:
      'Cevabı açmadan önce aklından söyle. Hatırlayamadıysan Zor’a değil, her zaman Tekrar’a bas. Nöbet ya da yoğun staj günlerinde yeni kartı 0 yap, yalnız vadesi gelen tekrarları bitir; düzenin bozulmaz.',
    href: '/yardim/calisma-ekrani/',
    linkLabel: 'Çalışma ekranı rehberi',
  },
  {
    step: '03',
    name: 'Konu, soru ve deneme süreni Kronometre ile aynı takvimde topla',
    summary: 'Kart dışındaki çalışmanı ve Temel/Klinik dengeni de gör.',
    detail:
      'Konu okuma, çıkmış soru ve deneme sürelerini Kronometre’de ders ders kaydet. Çalışma Takvimi kart tekrarlarınla bu oturumları çift saymadan aynı yerde gösterir.',
    href: '/yardim/kronometre/',
    linkLabel: 'Kronometre rehberi',
  },
  {
    step: '04',
    name: 'Deneme yanlışlarını etiketli karta çevir, son ayda filtrele',
    summary: '55–65 puanda takıldıysan önce yanlışlarını kapat.',
    detail:
      'Her denemede iki şık arasında kaldığın ayrımları kısa kartlara yaz. Sınavdan önceki son haftalarda bu kartları Filtrelenmiş Deste’nin Önizleme moduyla tara; tekrar takvimin bozulmaz.',
    href: '/yardim/filtrelenmis-deste/',
    linkLabel: 'Filtrelenmiş deste rehberi',
  },
];

export interface GuideFaq {
  q: string;
  a: string;
}

export const GUIDE_FAQS: GuideFaq[] = [
  {
    q: 'TUS’a kaç ay önce ve nereden başlamalıyım?',
    a: `Herkese uyan tek bir süre yok. Önemli olan hazırlığı ikiye bölmen: önce ilk tur, sonra sınavdan önceki 14–30 günde yalnız tekrar. ${totalCards} kartlık BKA TUS paketini 4.–5. sınıf stajyeri 12 ayda, stajının yanında günde ~${stajyerSim.activePace}–40 yeni kartla bitirebilir. İntörn 9 ayda, haftada ${intornSim.input.studyDaysPerWeek} gün ~${intornSim.activePace}–60 yeni kartla; tam zamanlı çalışan mezun 6 ayda günde ~${mezunSim.activePace} yeni kartla bitirebilir. Böylece deneme ve konu çalışmasına da geniş zaman kalır.`,
  },
  {
    q: 'TUS için günde kaç saat, kaç kart çalışmalıyım?',
    a: `Kart tekrarına günde 60–125 dakika ayır; konu okuma, soru bankası ve deneme analizi için her gün 2–4+ saat kalır. %${mezunSim.input.retention} hedef hatırlamayla yaptığımız FSRS-6 simülasyonunda ${totalCards} kartlık BKA TUS paketinde günde ${mezunSim.activePace} yeni kart açarsan ilk tur ${mezunSim.target.finishDay ?? mezunSim.input.days}. günde biter. ${mezunSim.input.days} günlük planda günde ortalama ${num(mezunSim.target.avgCards)} kart çalışırsın (~${formatDurationTr(mezunSim.target.avgMinutes)}/gün). 270 günlük planda ortalama ${num(sim270_60.target.avgCards)} kart (~${formatDurationTr(sim270_60.target.avgMinutes)}/gün), 270. günde ise ${num(sim270_60.target.endDayCards)} kart (~${formatDurationTr(sim270_60.target.endDayMinutes)}/gün) çalışırsın.`,
  },
  {
    q: 'TUS kaç soru, kaç dakika? Puan nasıl hesaplanır, Temel Bilimler Klinik puanını nasıl etkiler?',
    a: 'TUS aynı gün iki oturumda yapılır ve toplam 200 sorudur: 100 Temel Bilimler (135 dakika) ve 100 Klinik Bilimler (135 dakika), toplam 270 dakika. 4 yanlış 1 doğruyu götürür. ÖSYM katsayılarına göre Klinik Tıp Puanı (K) = %40 Temel + %60 Klinik, Temel Tıp Puanı (T) = %60 Temel + %40 Klinik. Yani Klinik branş istesen bile puanının %40’ı 6 Temel Bilimler dersinden gelir.',
  },
  {
    q: 'TUS’ta %5 puan kesintisi kimlere uygulanır ve net hedefini nasıl değiştirir?',
    a: 'Kesinti uzmanlık eğitimine devam ederken sınava girenlere, istifa edenlere ve yerleşip süresi içinde başlamayanlara uygulanır. Bu kişilerin takip eden ilk sınavdaki mesleki bilgi puanından %5 düşülür (× 0,95). Dayanağı Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği ve oranı %2’den %5’e çıkaran 16 Mayıs 2024 değişikliğidir. Kesinti yokken 65 Klinik puanı yaklaşık 130 net eder. %5 kesinti varken kesinti sonrası aynı 65 puana ulaşmak için yaklaşık 68,4 ham puan (~143 net) gerekir. Güncel koşullar için ÖSYM kılavuzuna bak.',
  },
  {
    q: 'FSRS-6 hedef hatırlama oranı TUS için %85 mi, %90 mı, %93 mü olmalı?',
    a: 'Çoğu TUS adayı için varsayılan %90 (0,90) uygundur; bilginin kalıcılığıyla günlük süre arasında iyi bir denge kurar. İntörnlükte, yoğun nöbet döneminde ya da tam zamanlı pratisyenlik yaparken günlük tekrarı azaltmak için %85 (0,85) seçebilirsin. %93–%95 ve üzeri hatırlamayı yalnız birkaç puan artırır ama tekrar aralıklarını belirgin biçimde kısaltır ve günlük süreyi katlar.',
  },
  {
    q: 'Tekrar kartları biriktiğinde (tekrar borcu) desteyi sıfırlamalı mıyım?',
    a: 'Hayır. Sıfırlarsan olgunlaşmış kartların geçmişi de silinir. Onun yerine kuyruk eriyene kadar yeni kartı 0 yap, birikmiş kartları Filtrelenmiş Deste ile 100 kartlık bloklara böl ve ağır günlerde Kolay günler ayarını kullan. 8 ve daha fazla kez unuttuğun kartları (sülük kartlar) kısaltıp sadeleştir.',
  },
  {
    q: '2027 TUS ne zaman, son 30 günde ne yapmalıyım?',
    a: `Resmî ÖSYM 2027 sınav takvimine göre ${exam1.name} ${exam1.examDateLabel}’de yapılır (başvuru ${exam1.applicationLabel.replace(' 2027', '')}, sonuç ${exam1.resultLabel.replace(' 2027', '')}). ${exam2.name} ise ${exam2.examDateLabel}’de (başvuru ${exam2.applicationLabel.replace(' 2027', '')}, sonuç ${exam2.resultLabel.replace(' 2027', '')}). Son 14–30 günde yeni kart açma. Deneme yanlışlarına, vadesi gelen tekrarlara ve Filtrelenmiş Deste Önizleme oturumlarına öncelik ver.`,
  },
  {
    q: 'TusAnkiM hangi cihazlarda çalışır ve BKA TUS paketi dışa aktarılır mı?',
    a: 'TusAnkiM iPhone için geliştiriliyor. Bugün web tarayıcısında (Mac, Windows, iPad, Android tarayıcı) ücretsiz beta olarak çalışır; kartların ve çalışma geçmişin cihazında kalır. Kendi .apkg ve .colpkg destelerini içe ve dışa aktarabilirsin. Hazır BKA TUS paketi ve ilerlemesi dışa aktarılamaz. Otomatik bulut eşitleme, Android uygulaması ve Tercih Simülasyonu henüz hazır değil; geliştiriyoruz.',
  },
];

export const OFFICIAL_SOURCES = [
  {
    title: 'ÖSYM — TUS Duyuruları, Kılavuzlar ve Temel Soru Kitapçıkları',
    url: 'https://www.osym.gov.tr/SinavGrubu/Index/6',
    note: 'Sınav yapısı, 45 barajı, yabancı dil koşulu, kılavuzlar ve yayımlanan soru kitapçıkları',
  },
  {
    title: 'ÖSYM — Resmî Sınav ve Yerleştirme Takvimi',
    url: 'https://www.osym.gov.tr/Sayfa/SinavTakvimi',
    note: 'Güncel TUS başvuru, sınav ve sonuç açıklaması tarihleri',
  },
  {
    title: 'Resmî Gazete — Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği',
    url: 'https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm',
    note: 'Puan kesintisi ve yerleştirme hükümleri (kesinti başlangıçta %2)',
  },
  {
    title: 'Resmî Gazete — Uzmanlık Eğitimi Yönetmeliğinde Değişiklik (16 Mayıs 2024, Sayı 32548)',
    url: 'https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm',
    note: 'Kesinti oranını %2’den %5’e çıkaran değişiklik',
  },
  {
    title: 'ACM KDD ’22 — A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling',
    url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
    note: 'FSRS algoritmasının dayandığı akademik makale',
  },
  {
    title: 'Open Spaced Repetition — FSRS-6 Algoritma Şartnamesi',
    url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
    note: 'Algoritmanın izlediği üç değer (zorluk, kararlılık, hatırlanabilirlik) ve 21 parametre',
  },
  {
    title: 'Anki Manual — Deck Options & FSRS',
    url: 'https://docs.ankiweb.net/manual/deck-options',
    note: 'Hedef hatırlama, öğrenme adımları ve parametre optimizasyonu belgeleri',
  },
] as const;

export const GUIDE_SEARCH_ENTRIES: WebsiteSearchEntry[] = [
  {
    type: 'Sayfa',
    title: `TUS çalışma temposu: 4 profil, ${totalCards} ve ${megaCards} kart`,
    sub: 'Stajyer (365 gün), intörn (270 gün), mezun (180 gün) ve son 4 ay (120 gün) için FSRS-6 simülasyonu ve mega deste karşılaştırması.',
    url: '/tus-calisma-rehberi/#tempo-ve-profiller',
    terms: `tus çalışma temposu stajyer intörn mezun son 4 ay kaç kart günde kaç saat mega deste ${catalog.totals.cards} ${MEGA_DECK_CARDS} fsrs-6`,
  },
  {
    type: 'Sayfa',
    title: '2027 TUS tarihleri, başvuru ve sonuç takvimi',
    sub: `${exam1.examDateLabel} (2027/1) ve ${exam2.examDateLabel} (2027/2) ÖSYM sınav, başvuru ve sonuç tarihleri; son 30 günde ne yapmalı.`,
    url: '/tus-calisma-rehberi/#tus-takvimi',
    terms: 'tus ne zaman 2027 tus tarihleri mart ağustos başvuru sonuç takvimi ösym son 30 gün',
  },
  {
    type: 'Sayfa',
    title: 'TUS’ta 11 branşın soru dağılımı ve ders çalışma stratejisi',
    sub: '6 Temel ve 5 Klinik branşta soru sayıları, BKA kart sayısı, son 6 TUS çözüm desteği ve her derste neye odaklanmalı.',
    url: '/tus-calisma-rehberi/#brans-stratejisi',
    terms: 'tus dersleri hangi dersten kaç soru anatomi fizyoloji biyokimya mikrobiyoloji patoloji farmakoloji dahiliye pediatri genel cerrahi kadın doğum küçük stajlar',
  },
  {
    type: 'Sayfa',
    title: 'TUS puan ağırlıkları, 45 barajı, YDS ve %5 kesinti',
    sub: 'Klinik (%40/%60) ve Temel (%60/%40) ağırlıkları, 4 yanlış 1 doğru, YDS/TIPDİL 50 şartı ve %5 kesinti etkisi.',
    url: '/tus-calisma-rehberi/#puan-ve-mevzuat',
    terms: 'tus puan hesaplama %5 kesinti baraj 45 yds tipdil temel klinik ağırlık net',
  },
  {
    type: 'Sayfa',
    title: 'TUS’ta FSRS-6 aralıklı tekrar ve günlük çalışma rutini',
    sub: 'Pasif okuma ile aktif hatırlamanın farkı, FSRS-6’nın izlediği üç değer, %85/%90/%93 hedef hatırlama ve Kronometre ile günlük düzen.',
    url: '/tus-calisma-rehberi/#fsrs-ve-hacim',
    terms: 'aralıklı tekrar fsrs-6 sm-2 hedef hatırlama aktif hatırlama active recall kronometre çalışma programı rutin',
  },
  {
    type: 'Sayfa',
    title: 'TUS çalışırken en çok zorlanılan 7 alan ve çözümleri',
    sub: 'Okuduğunu unutma, biriken tekrarlar, Temel/Klinik dengesi, nöbet ve intörnlük, deneme platosu ve son ay paniği.',
    url: '/tus-calisma-rehberi/#zorluklar',
    terms: 'tus zorluklar unutma tekrar yığılması kart birikmesi tekrar borcu nöbet intörnlük tükenmişlik deneme platosu 55 65 puan son ay panik kaynak dağınıklığı leech',
  },
];
