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
    '2027 TUS çalışma rehberi: FSRS-6 tempo planı, 11 branş stratejisi, puan ağırlıkları, sınav takvimi ve adayların en sık zorlandığı 7 alana somut çözümler.',
  kicker: 'Kapsamlı TUS Çalışma Rehberi · 2027',
  h1: 'TUS Çalışma Rehberi: plan, 11 branş stratejisi ve FSRS-6',
  lead:
    'Sınava kaç gün kaldığına göre gerçekçi günlük tempo kur, 2027 ÖSYM takvimine göre son 30 gün tamponunu ayarla, 11 branşta puan ağırlıklarını doğru yönet ve TUS hazırlığında en çok takılınan 7 soruna ölçülebilir çözümler uygula.',
} as const;

export interface GuideTocItem {
  id: string;
  label: string;
}

export const GUIDE_TOC: GuideTocItem[] = [
  { id: 'hizli-ozet', label: 'Hızlı Özet' },
  { id: 'tempo-ve-profiller', label: 'Çalışma Temposu' },
  { id: 'tus-takvimi', label: '2027 Takvimi' },
  { id: 'brans-stratejisi', label: '11 Branş' },
  { id: 'puan-ve-mevzuat', label: 'Puan & Mevzuat' },
  { id: 'fsrs-ve-hacim', label: 'FSRS-6 & Rutin' },
  { id: 'zorluklar', label: '7 Zorluk ve Çözüm' },
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
  priorityTag: 'Yüksek kart tabanı' | 'Dengeli çekirdek' | 'Atlas / vaka desteği';
}

export const BRANCH_STUDY_NOTES: BranchStudyNote[] = [
  {
    ders: 'Anatomi',
    catalogId: 'bka-anatomi',
    group: 'Temel',
    examQuestionsLabel: '13 soru',
    priorityTag: 'Atlas / vaka desteği',
    focus: 'Baş-boyun, nöroanatomi ve komşuluklar için kartları görsel atlas ve Görsel Gizleme ile destekle.',
  },
  {
    ders: 'Fizyoloji-Histoloji-Embriyoloji',
    catalogId: 'bka-fhe',
    group: 'Temel',
    examQuestionsLabel: '15 soru',
    priorityTag: 'Dengeli çekirdek',
    focus: 'Hücre/doku histolojisi ve temel fizyoloji mekanizmalarını Dahiliye ve Farmakolojiye köprü kurarak çalış.',
  },
  {
    ders: 'Biyokimya',
    catalogId: 'bka-biyokimya',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Yüksek kart tabanı',
    focus: 'Enzim eksiklikleri, hız kısıtlayıcı basamaklar ve vitamin-kofaktörler aralıklı tekrarda çok hızlı net getirir.',
  },
  {
    ders: 'Mikrobiyoloji',
    catalogId: 'bka-mikrobiyoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Yüksek kart tabanı',
    focus: 'Etken–virülans–tanı–ilk tercih tedavi eşleştirmelerini bakteriyoloji ve virolojide günlük küçük bloklarla taze tut.',
  },
  {
    ders: 'Patoloji',
    catalogId: 'bka-patoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Dengeli çekirdek',
    focus: 'Genel patoloji + sistem morfolojisi; histopatolojik ayırt edicileri klinik vaka bağlantısıyla çalış.',
  },
  {
    ders: 'Farmakoloji',
    catalogId: 'bka-farmakoloji',
    group: 'Temel',
    examQuestionsLabel: '18 soru',
    priorityTag: 'Yüksek kart tabanı',
    focus: 'Etki mekanizması, majör yan etki ve kontrendikasyonlar tüm TUS dersleri içinde kart tekrarına en uygun alandır.',
  },
  {
    ders: 'Dahiliye',
    catalogId: 'bka-dahiliye',
    group: 'Klinik',
    examQuestionsLabel: '24 soru',
    priorityTag: 'Dengeli çekirdek',
    focus: 'Hematoloji, kardiyoloji ve endokrinolojide tanı kriteri + ilk basamak yaklaşımı çıkmış vaka analiziyle birleştir.',
  },
  {
    ders: 'Pediatri',
    catalogId: 'bka-pediatri',
    group: 'Klinik',
    examQuestionsLabel: '24–25 soru',
    priorityTag: 'Yüksek kart tabanı',
    focus: 'Yenidoğan, aşı takvimi, döküntülü hastalıklar ve metabolizma; yüksek soru ağırlığı nedeniyle erken tura al.',
  },
  {
    ders: 'Genel Cerrahi',
    catalogId: 'bka-genel-cerrahi',
    group: 'Klinik',
    examQuestionsLabel: '20 soru',
    priorityTag: 'Atlas / vaka desteği',
    focus: 'Algoritma ve acil cerrahi yönetim soruları ağırlıklıdır; kart tekrarını travma/GİS vaka soruları ile tamamla.',
  },
  {
    ders: 'Kadın Doğum',
    catalogId: 'bka-kadin-dogum',
    group: 'Klinik',
    examQuestionsLabel: '10 soru',
    priorityTag: 'Dengeli çekirdek',
    focus: 'Obstetri ve jinekolojik onkolojide evreleme ile acil gebelik yönetimi görece dar hacimde istikrarlı net sağlar.',
  },
  {
    ders: 'Küçük Stajlar',
    catalogId: 'bka-kucuk-stajlar',
    group: 'Klinik',
    examQuestionsLabel: '21–22 soru',
    priorityTag: 'Atlas / vaka desteği',
    focus: 'Nöroloji, göz, dermatoloji, KBB ve psikiyatri 15 alt branşa yayılır; son haftaya bırakmadan küçük parçalarla döndür.',
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
    tag: 'Kalıcılık ve Unutma',
    tone: 'teal',
    title: '“Okuduğumu unutuyorum”: 11 branşı aynı gün taze tutamamak',
    why:
      'Tıp fakültesi komiteleri 2–4 haftalık kısa bellek isterken TUS, 6 Temel ve 5 Klinik branşın ince ayrıntılarını aynı gün 200 soruda ölçer. Kalın konu kitaplarını baştan sona tekrar okumak aylar sürdüğü için ilk çalıştığın ders sınav ayında sıfırlanmış gibi hissedilir.',
    steps: [
      'Konu okumasını bitirdiğin gün o alt destenin boşluk doldurma (Cloze) kartlarını aç; beyne pasif aşinalık yerine aktif geri çağırma yaptır.',
      'Hedef hatırlamayı %90 (0,90) bandında tut; FSRS-6 her kartın zorluğuna göre aralığı dakikalardan aylara kendisi uzatsın.',
      'İlerlemeyi yalnız okunan sayfa sayısıyla değil, İstatistikler ekranındaki Genç (<21g) ve Olgun (≥21g) hatırlama oranlarıyla takip et.',
    ],
    links: [
      { label: 'FSRS-6 rehberi', href: '/yardim/fsrs/' },
      { label: 'İstatistikleri okuma', href: '/yardim/istatistikler/' },
    ],
  },
  {
    number: '02',
    tag: 'Tekrar Borcu / Kuyruk Krizi',
    tone: 'warm',
    title: 'Günlük tekrar yığılması ve kartların 800–1.000+ üzerine şişmesi',
    why:
      `Başlangıç heyecanıyla günde 100+ yeni kart açmak, ${megaCards}+ kartlık bitmeyen mega destelere girmek, hedef hatırlamayı %95 üzerine çekmek veya birkaç gün üst üste tekrar atlamak vadesi gelen kuyruğu kırılamaz bir duvara dönüştürür.`,
    steps: [
      'Kuyruk normalleşene kadar günlük yeni kart sınırını 0’a indir; yeni yük eklemeden yalnız vadesi gelen tekrarları erit.',
      'Hedef hatırlamayı %95+ yerine %88–%90 bandında, yoğun staj/nöbet haftalarında %85 düzeyinde tut.',
      'Birikmiş kartları Filtrelenmiş Deste ile 100 kartlık oturumlara böl; sıralamayı hızlı toparlanma için Hatırlanabilirlik (azalan) veya gecikme önceliğiyle seç.',
      'Ağır günler için Deste Seçenekleri › Kolay günler (Azaltılmış/Yok) kullan ve 8+ kez unutulan sülük (leech) kartları sadeleştir veya böl.',
    ],
    links: [
      { label: 'Filtrelenmiş deste rehberi', href: '/yardim/filtrelenmis-deste/' },
      { label: 'Deste seçenekleri ve sınırlar', href: '/yardim/deste-secenekleri/' },
    ],
  },
  {
    number: '03',
    tag: 'Temel – Klinik Dengesi',
    tone: 'teal',
    title: 'Klinik hedefleyip Temel Bilimleri ihmal etmek (veya tam tersi)',
    why:
      'Klinik branş isteyen pek çok aday zamanının büyük kısmını Dahiliye, Pediatri ve Genel Cerrahiye ayırıp 6 Temel dersi sona bırakır. Oysa ÖSYM ağırlıklarına göre Klinik Tıp Puanı %50 Temel + %50 Klinik ile hesaplanır; Temel netindeki düşüş Klinik puanını birebir aşağı çeker.',
    steps: [
      'Temel ve Klinik çalışmalarını Kronometre’de ders bazlı kaydet; Çalışma Takvimi ve analiz ekranından haftalık Temel/Klinik dağılımını kontrol et.',
      `İlk turda yüksek kart tabanı sunan Farmakoloji (${destekPct('Farmakoloji')}), Biyokimya (${destekPct('Biyokimya')}), Mikrobiyoloji (${destekPct('Mikrobiyoloji')}) ve Pediatri (${destekPct('Pediatri')}) ile sağlam net zemini kur.`,
      `Anatomi (${destekPct('Anatomi')}), Küçük Stajlar (${destekPct('Küçük Stajlar')}) ve Genel Cerrahi (${destekPct('Genel Cerrahi')}) gibi derslerde kart tekrarının yanına görsel atlas ve klinik vaka sorusu ekle.`,
    ],
    links: [
      { label: 'Puan ağırlıklarını hesapla', href: '/puan-hesapla/' },
      { label: 'Kronometre ve takvim', href: '/yardim/kronometre/' },
    ],
  },
  {
    number: '04',
    tag: 'İntörnlük, Nöbet ve Tükenmişlik',
    tone: 'warm',
    title: 'Nöbet ve ağır staj haftalarında “ya hep ya hiç” kopuşu',
    why:
      'Haftanın 7 gününü aynı yüksek kotayla yazan katı programlar ilk 24–36 saatlik nöbette, sınav haftasında veya hastalıkta bozulur. Bir gün aksayınca oluşan suçluluk duygusu tüm haftanın bırakılmasına yol açar.',
    steps: [
      'Çalışma Planı aracında haftada 5 veya 6 aktif yeni-kart günü seç; nöbet ve dinlenme günlerini yeni kartsız yalnızca tekrar günü olarak ayır.',
      'Kronometre’de 50 dk çalışma / 10 dk mola blok hatırlatıcısı kullan; günlük tavanı belirleyip tükenmişlik sınırını geçme.',
      'Nöbet ertesi düşük enerjide tam konu okumak yerine 15–20 dakikalık vadesi gelen kart tekrarını bitir; ritmi korumanın sıfırdan başlamaktan çok daha kolay olduğunu unutma.',
    ],
    links: [
      { label: 'Haftada 5–6 gün planı kur', href: '/calisma-plani/' },
      { label: 'Ayarlar ve hatırlatmalar', href: '/yardim/ayarlar/' },
    ],
  },
  {
    number: '05',
    tag: 'Kaynak Dağınıklığı ve Pasif Okuma',
    tone: 'teal',
    title: 'Çok fazla kaynak arasında boğulmak ve alt çizme yanılsaması',
    why:
      'Aynı ders için farklı dershane kitapları, PDF özetler, video notları ve 25.000+ kartlık devasa paylaşımlı desteleri bir arada götürmeye çalışmak hiçbirinin bitmemesine yol açar. Üstelik metni fosforlu kalemle okumak tanıdıklık hissi verir ama şıklardaki klinik ayrımı hatırlatmaz.',
    steps: [
      `Her branş için tek bir ana konu kaynağı ve tek bir bitirilebilir kart çekirdeği (ör. ${totalCards} kartlık BKA TUS paketi) seç.`,
      `Son 6 TUS verisindeki ${pct(refSummary.overall.konuKapsamiOran)} konu kapsamı ile ${pct(refSummary.overall.destekOran)} çözüm desteği arasındaki farkı hatırla: konuyu görmek yetmez, soru kökünün ölçtüğü ayırt edici bilgiyi aktif çağırmak gerekir.`,
      'Kendi notlarında eksikliğini gördüğün noktaları uzun paragraflar yerine tek bilgi ölçen kısa kartlara dönüştür; yanlış cevapta Zor değil her zaman Tekrar seç.',
    ],
    links: [
      { label: 'Çalışma ekranı ve değerlendirme', href: '/yardim/calisma-ekrani/' },
      { label: 'Kendi kartını ekleme', href: '/yardim/kart-ekleme/' },
    ],
  },
  {
    number: '06',
    tag: 'Deneme Platosu (55–65 Bandı)',
    tone: 'warm',
    title: 'Deneme netlerinin aynı aralıkta takılı kalması',
    why:
      'Adaylar çoğu zaman haftalık çözülen soru sayısını artırmaya odaklanır ama yanlış yapılan soruların neden kaçtığını ayrıştırmaz. Aynı iki şık arasında kalıp tekrar tekrar düşülen klinik ayrımlar düzeltilmedikçe netler 55–65 bandında plato yapar.',
    steps: [
      'Her denemeden sonra yanlış ve boşları 3 sınıfa ayır: (A) Hiç görmediğim bilgi, (B) Çalıştım ama iki şıkta karıştırdığım/unuttuğum bilgi, (C) Soru kökü dikkatsizliği.',
      'En hızlı puan artışı (B) grubundan gelir: karıştırdığın iki hastalık veya ilacı kıyaslayan tek cümlelik kişisel kartlar yaz ve “deneme-yanlis” etiketiyle topla.',
      'Kartlarım arama ekranında bu etiketi veya en sık hata yaptığın dersin alt destesini filtreleyip 7–10 gün sonra tekrar test et.',
    ],
    links: [
      { label: 'Kartlarım ve arama filtreleri', href: '/yardim/kartlarim-ve-arama/' },
      { label: 'Son 6 TUS referans kanıtları', href: '/referanslar/' },
    ],
  },
  {
    number: '07',
    tag: 'Son 30–60 Gün Paniği',
    tone: 'teal',
    title: 'Sınav yaklaşırken yeni kaynak açmak ve olgun bilgiyi kaybetmek',
    why:
      'Son ayda artan kaygı, adayları “ya buradan soru gelirse” düşüncesiyle yeni özet kitapçıklara veya yüzlerce yeni karta yönlendirir. Oysa son 3–4 haftada açılan yüzlerce ham kart olgunlaşmadan sınava girilir ve asıl yüksek getirili mevcut tekrarlar aksar.',
    steps: [
      'İlk turu sınavdan en az 14–30 gün önce bitirecek şekilde tampon (buffer) bırak; bu dönemde yeni kart açmayı durdur.',
      'Son 2–3 haftada zamanlamayı bozmadan hedefli tekrar için Filtrelenmiş Deste › Önizleme modunu ve Özel Çalışma seçeneklerini kullan.',
      'Çıkmış son 6–10 TUS sorularını süre tutarak (Kronometre › Deneme oturumu) çöz; sınava son 48 saat kala ağır yeni konu yerine dinlenme ve kısa hafıza tazelemesine geç.',
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
    name: 'Sınav tarihine göre gerçekçi tempo ve tampon belirle',
    summary: 'Kart yükünü günde 60–125 dk bandında tutup 2–4+ saati konu ve soruya ayır.',
    detail:
      'Sınava kalan güne, seçtiğin derslere ve haftada kaç gün yeni kart açabileceğine göre günlük yeni kart hızını belirle; sınavdan önceki son 14–30 günü yeni kartsız tekrar ve deneme tamponu olarak koru.',
    href: '/calisma-plani/',
    linkLabel: 'FSRS-6 planlayıcıyı aç',
  },
  {
    step: '02',
    name: 'Her gün önce vadesi gelen tekrarları bitir, sonra yeni kart aç',
    summary: 'Aktif hatırlamayı FSRS-6 (%90 hedef hatırlama) ile yönet.',
    detail:
      'Cevabı açmadan önce aklından üret; hatırlamadıysan Zor yerine her zaman Tekrar seç. Nöbet veya yoğun staj günlerinde yeni kartı 0’a indirip yalnızca vadesi gelen tekrarları tamamlamak düzeni korur.',
    href: '/yardim/calisma-ekrani/',
    linkLabel: 'Çalışma ekranı rehberi',
  },
  {
    step: '03',
    name: 'Konu, soru ve deneme süreni Kronometre ile aynı takvimde topla',
    summary: 'Kart dışı emeğini ve Temel/Klinik dengeni ölçülebilir hâle getir.',
    detail:
      'Konu okuma, çıkmış soru çözme ve deneme sürelerini Kronometre’de ders bazlı kaydet; Çalışma Takvimi kart tekrarlarınla oturumlarını çift saymadan bir araya getirir.',
    href: '/yardim/kronometre/',
    linkLabel: 'Kronometre rehberi',
  },
  {
    step: '04',
    name: 'Deneme yanlışlarını etiketli karta çevir ve son ayda filtrele',
    summary: '55–65 puan platosunu hedefli hata kapatmayla aş.',
    detail:
      'Her denemede iki şık arasında kaldığın ayrımları kısa kişisel kartlara dök. Sınav öncesi son haftalarda Filtrelenmiş Deste’nin Önizleme moduyla zamanlamayı bozmadan bu eksikleri tara.',
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
    q: 'TUS’a çalışmaya nereden ve kaç ay önce başlanmalı?',
    a: `Tek bir standart süre yoktur; en kritik kural hazırlığı iki faza (ilk tur + sınav öncesi 14–30 gün yalnız tekrar tamponu) bölmektir. 4.–5. sınıf stajyerleri 12 aylık pencerede stajına paralel günde ~${stajyerSim.activePace}–40 yeni kartla, intörnler 9 ayda haftada ${intornSim.input.studyDaysPerWeek} gün ~${intornSim.activePace}–60 yeni kartla, tam zamanlı mezunlar 6 ayda ~${mezunSim.activePace} yeni kartla ${totalCards} kartlık BKA TUS çekirdeğini bitirip deneme ve konu çalışmasına geniş zaman ayırabilir.`,
  },
  {
    q: 'TUS için günde kaç saat ve kaç kart çalışmak sürdürülebilirdir?',
    a: `${totalCards} kartlık BKA TUS çekirdeği için %${mezunSim.input.retention} FSRS-6 hedef hatırlama simülasyonunda günde ${mezunSim.activePace} yeni kart açıldığında ilk tur ${mezunSim.target.finishDay ?? mezunSim.input.days}. günde tamamlanır; ${mezunSim.input.days} günlük pencerede ortalama ${num(mezunSim.target.avgCards)} kart (~${formatDurationTr(mezunSim.target.avgMinutes)}/gün), 270 günlük pencerede ortalama ${num(sim270_60.target.avgCards)} kart (~${formatDurationTr(sim270_60.target.avgMinutes)}/gün) ve 270. günde ${num(sim270_60.target.endDayCards)} kart (~${formatDurationTr(sim270_60.target.endDayMinutes)}/gün) olur. Kart tekrarını 60–125 dakika bandında tutmak, her gün konu okuma, soru bankası ve deneme analizi için 2–4+ saatlik net zaman bırakır.`,
  },
  {
    q: 'TUS kaç soru, kaç dakika ve puanı nasıl hesaplanır? Temel Bilimler Klinik puanını nasıl etkiler?',
    a: 'TUS aynı gün iki oturumda toplam 200 sorudan (100 Temel Bilimler · 135 dakika + 100 Klinik Bilimler · 135 dakika, toplam 270 dakika) oluşur ve 4 yanlış 1 doğruyu götürür. ÖSYM katsayılarına göre Temel Tıp Puanı (T) = %70 Temel + %30 Klinik; Klinik Tıp Puanı (K) = %50 Temel + %50 Klinik ağırlığıyla hesaplanır. Yani Klinik branş hedeflesen bile puanının yarısı 6 Temel Bilimler dersinden gelir.',
  },
  {
    q: 'TUS’ta %5 puan kesintisi kimlere uygulanır ve net hedefini nasıl değiştirir?',
    a: 'Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği uyarınca uzmanlık eğitimine devam ederken sınava girenler, istifa edenler veya yerleşip süresi içinde başlamayanlar için takip eden ilk sınavda mesleki bilgi puanında %5 kesinti (× 0,95) uygulanır. Kesintisiz 65 Klinik puanı yaklaşık 130 net bandındayken, %5 kesinti etkinken aynı 65 net puana ulaşmak için yaklaşık 68,4 ham puan (~143 net) gerekir. Güncel koşullar için ÖSYM kılavuzunu kontrol et.',
  },
  {
    q: 'FSRS-6 hedef hatırlama oranı TUS için %85 mi, %90 mı, %93 mü olmalı?',
    a: 'Varsayılan %90 (0,90) çoğu TUS adayı için bilgi kalıcılığı ile günlük süre arasında en sağlıklı dengeyi kurar. İntörnlük, yoğun nöbet veya tam zamanlı pratisyenlikte günlük tekrar baskısını azaltmak için %85 (0,85) seçilebilir. %93–%95 üzeri hedefler hatırlamayı birkaç puan artırırken tekrar aralıklarını ciddi biçimde daraltıp günlük süreyi katlar.',
  },
  {
    q: 'Tekrar kartları biriktiğinde (tekrar borcu) desteyi sıfırlamalı mıyım?',
    a: 'Hayır, tüm ilerlemeyi sıfırlamak olgunlaşmış kartların geçmişini de siler. Bunun yerine kuyruk eriyene kadar yeni kart açmayı 0’a indir, birikmiş kartları Filtrelenmiş Deste ile 100 kartlık bloklara böl, ağır günlerde Kolay günler ayarını kullan ve 8+ kez unutulan sülük (leech) kartlarını kısaltarak sadeleştir.',
  },
  {
    q: '2027 TUS tarihleri neler ve son 30 günde ne yapılmalı?',
    a: `Resmî ÖSYM 2027 sınav takvimine göre ${exam1.name} ${exam1.examDateLabel}’de (başvuru ${exam1.applicationLabel.replace(' 2027', '')}, sonuç ${exam1.resultLabel.replace(' 2027', '')}), ${exam2.name} ise ${exam2.examDateLabel}’de (başvuru ${exam2.applicationLabel.replace(' 2027', '')}, sonuç ${exam2.resultLabel.replace(' 2027', '')}) yapılır. Son 14–30 günde yeni kart açmayı durdurup deneme yanlışlarını, vadesi gelen tekrarları ve Filtrelenmiş Deste Önizleme oturumlarını öne almak en verimli yaklaşımdır.`,
  },
  {
    q: 'TusAnkiM hangi cihazlarda çalışır ve BKA TUS paketi dışa aktarılır mı?',
    a: 'TusAnkiM iPhone için geliştirilmektedir ve bugün web tarayıcısında (Mac, Windows, iPad, Android tarayıcı) ücretsiz beta olarak çalışır; kartların ve çalışma geçmişin cihazında saklanır. Kişisel .apkg ve .colpkg destelerini içe ve dışa aktarabilirsin; hazır BKA TUS paketi ve ilerlemesi dışa aktarılmaz. Otomatik bulut eşitleme, yerel Android uygulaması ve Tercih Simülasyonu geliştirme aşamasındadır.',
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
    note: 'Güncel %5 puan kesintisi ve yerleştirme hükümleri',
  },
  {
    title: 'ACM KDD ’22 — A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling',
    url: 'https://dl.acm.org/doi/10.1145/3534678.3539081',
    note: 'FSRS algoritmasının akademik bellek ve optimizasyon temeli',
  },
  {
    title: 'Open Spaced Repetition — FSRS-6 Algoritma Şartnamesi',
    url: 'https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm',
    note: 'DSR bellek modeli (Difficulty, Stability, Retrievability) ve 21 parametre',
  },
  {
    title: 'Anki Manual — Deck Options & FSRS',
    url: 'https://docs.ankiweb.net/manual/deck-options',
    note: 'Hedef hatırlama, öğrenme adımları ve parametre optimizasyonu dokümantasyonu',
  },
] as const;

export const GUIDE_SEARCH_ENTRIES: WebsiteSearchEntry[] = [
  {
    type: 'Sayfa',
    title: `TUS Çalışma Temposu: 4 Profil & ${totalCards} vs ${megaCards} Kart`,
    sub: 'Stajyer (365g), İntörn (270g), Mezun (180g) ve Son 4 Ay (120g) için FSRS-6 simülasyonu ve mega deste karşılaştırması.',
    url: '/tus-calisma-rehberi/#tempo-ve-profiller',
    terms: `tus çalışma temposu stajyer intörn mezun son 4 ay kaç kart günde kaç saat mega deste ${catalog.totals.cards} ${MEGA_DECK_CARDS} fsrs-6`,
  },
  {
    type: 'Sayfa',
    title: '2027 TUS Tarihleri, Başvuru ve Sonuç Takvimi',
    sub: `${exam1.examDateLabel} (2027/1) ve ${exam2.examDateLabel} (2027/2) ÖSYM sınav, başvuru, sonuç tarihleri ve son 30 gün tamponu.`,
    url: '/tus-calisma-rehberi/#tus-takvimi',
    terms: 'tus ne zaman 2027 tus tarihleri mart ağustos başvuru sonuç takvimi ösym son 30 gün',
  },
  {
    type: 'Sayfa',
    title: 'TUS 11 Branş Soru Dağılımı ve Ders Çalışma Stratejisi',
    sub: '6 Temel ve 5 Klinik branşta soru sayıları, BKA kart hacmi, son 6 TUS çözüm desteği ve ders bazlı çalışma odağı.',
    url: '/tus-calisma-rehberi/#brans-stratejisi',
    terms: 'tus dersleri hangi dersten kaç soru anatomi fizyoloji biyokimya mikrobiyoloji patoloji farmakoloji dahiliye pediatri genel cerrahi kadın doğum küçük stajlar',
  },
  {
    type: 'Sayfa',
    title: 'TUS Puan Ağırlıkları, 45 Barajı, YDS ve %5 Kesinti',
    sub: 'Temel (%70/%30) ve Klinik (%50/%50) ağırlıkları, 4 yanlış 1 doğru, YDS/TIPDİL 50 şartı ve %5 kesinti etkisi.',
    url: '/tus-calisma-rehberi/#puan-ve-mevzuat',
    terms: 'tus puan hesaplama %5 kesinti baraj 45 yds tipdil temel klinik ağırlık net',
  },
  {
    type: 'Sayfa',
    title: 'TUS’ta FSRS-6 Aralıklı Tekrar ve Günlük Çalışma Rutini',
    sub: 'Pasif okuma vs aktif hatırlama, FSRS-6 DSR modeli, %85/%90/%93 hedef hatırlama ve Kronometre iş akışı.',
    url: '/tus-calisma-rehberi/#fsrs-ve-hacim',
    terms: 'aralıklı tekrar fsrs-6 sm-2 hedef hatırlama aktif hatırlama active recall kronometre çalışma programı rutin',
  },
  {
    type: 'Sayfa',
    title: 'TUS Çalışırken En Çok Zorlanılan 7 Alan ve Çözümleri',
    sub: 'Okuduğunu unutma, tekrar yığılması (kart birikmesi), Temel/Klinik dengesi, nöbet/intörnlük, deneme platosu ve son ay paniği.',
    url: '/tus-calisma-rehberi/#zorluklar',
    terms: 'tus zorluklar unutma tekrar yığılması kart birikmesi tekrar borcu nöbet intörnlük tükenmişlik deneme platosu 55 65 puan son ay panik kaynak dağınıklığı leech',
  },
];
