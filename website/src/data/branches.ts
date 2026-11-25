import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import refSummary from './generated/references-summary.json';
import catalog from './generated/catalog.json';

export interface BranchSample {
  qid: string;
  sinav: string;
  rozet: string;
  olculenBilgi: string;
  eksikAdim: string;
  sinavOncesiSurumde: string | null;
  cardId: string | null;
  kartOzet: string;
}

export interface BranchExamRow {
  sinav: string;
  soru: number;
  dogrudan: number;
  dolayli: number;
  destek: number;
  destekOran: number;
  konu: number;
  konuKapsami: number;
  konuKapsamiOran: number;
  yok: number;
}

export interface BranchInfo {
  slug: string;
  name: string;
  catalogCourseId: string;
  catalogCourseName: string;
  group: 'Temel Bilimler' | 'Klinik Bilimler';
  seoTitle: string;
  seoDescription: string;
  strongAreas: string;
  priorityGaps: string;
  examAllocation: {
    standardQuestions: number;
    sessionTotal: 100;
    observedRange: string;
    sessionShareNote: string;
  };
  summary: {
    soru: number;
    dogrudan: number;
    dolayli: number;
    destek: number;
    destekOran: number;
    konu: number;
    konuKapsami: number;
    konuKapsamiOran: number;
    yok: number;
  };
  catalogCourse: {
    notes: number;
    cards: number;
    topicSubdecks: number;
    topTopics: { name: string; cards: number }[];
  };
  exams: BranchExamRow[];
  samples: BranchSample[];
}

interface BranchMeta {
  slug: string;
  name: string;
  catalogCourseId: string;
  group: 'Temel Bilimler' | 'Klinik Bilimler';
  seoTitle: string;
  seoDescription: string;
  strongAreas: string;
  priorityGaps: string;
  examAllocation: {
    standardQuestions: number;
    sessionTotal: 100;
    observedRange: string;
    sessionShareNote: string;
  };
}

const BRANCH_META: BranchMeta[] = [
  {
    slug: 'anatomi',
    name: 'Anatomi',
    catalogCourseId: 'bka-anatomi',
    group: 'Temel Bilimler',
    seoTitle: 'Anatomi TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Anatomi TUS çıkmış soruları: son 6 sınavda 78 soru, 477 kartlık deste. Çözüm desteği 22/78 (%28,2), Konu Kapsamı 72/78 (%92,3). Ön değerlendirmedir.',
    strongAreas: 'Geçen yapılar ve sınır listeleri, alt ekstremite ve beyin sapı arterleri kartları soruları iyi karşılıyor.',
    priorityGaps:
      'GİS anatomisi (bursa omentalis, omentumlar, vertebra düzeyleri), ürogenital boşluklar, periferik sinir hasar tabloları ve perine boşlukları.',
    examAllocation: {
      standardQuestions: 13,
      sessionTotal: 100,
      observedRange: '13',
      sessionShareNote: '100 Temel sorusunun 13’ü (%13,0) · 200 soruluk TUS’un %6,5’i',
    },
  },
  {
    slug: 'fizyoloji-histoloji-embriyoloji',
    name: 'Fizyoloji-Histoloji-Embriyoloji',
    catalogCourseId: 'bka-fhe',
    group: 'Temel Bilimler',
    seoTitle: 'Fizyoloji-Histoloji-Embriyoloji TUS analizi | TusAnkiM',
    seoDescription:
      'FHE TUS çıkmış soruları: son 6 sınavda 90 soru, 597 kartlık deste. Çözüm desteği 35/90 (%38,9), Konu Kapsamı 87/90 (%96,7). Ön değerlendirmedir.',
    strongAreas: 'Göz ve retina histolojisi, deri ve bağ dokusu ile gametogenez kartları çözüme iyi destek veriyor.',
    priorityGaps:
      'Starling kuvvetleri ve ödem mekanizmaları, böbrek medullası ve GFR, otonom etki tablosu, elektrofizyoloji ile epitel/GİS ve üriner histolojisi.',
    examAllocation: {
      standardQuestions: 15,
      sessionTotal: 100,
      observedRange: '14–16',
      sessionShareNote: '100 Temel sorusunun ~15’i (%15,0) · 200 soruluk TUS’un %7,5’i',
    },
  },
  {
    slug: 'biyokimya',
    name: 'Biyokimya',
    catalogCourseId: 'bka-biyokimya',
    group: 'Temel Bilimler',
    seoTitle: 'Biyokimya TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Biyokimya TUS çıkmış soruları: son 6 sınavda 109 soru, 602 kartlık deste. Çözüm desteği 61/109 (%56,0), Konu Kapsamı 101/109 (%92,7). Ön değerlendirmedir.',
    strongAreas: 'Nükleotid yolları, üre döngüsü ve kalıtsal metabolik hastalık–enzim eşleşmesi kartları soruları sık karşılıyor.',
    priorityGaps:
      'Preanalitik laboratuvar hataları (EDTA, NaF, tüp kapak renkleri, ışık), fosforilasyonla enzim düzenlenmesi ve organ laboratuvar yorumları.',
    examAllocation: {
      standardQuestions: 18,
      sessionTotal: 100,
      observedRange: '18–19',
      sessionShareNote: '100 Temel sorusunun ~18’i (%18,0) · 200 soruluk TUS’un %9,0’ı',
    },
  },
  {
    slug: 'mikrobiyoloji',
    name: 'Mikrobiyoloji',
    catalogCourseId: 'bka-mikrobiyoloji',
    group: 'Temel Bilimler',
    seoTitle: 'Mikrobiyoloji TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Mikrobiyoloji TUS çıkmış soruları: son 6 sınavda 108 soru, 730 kartlık deste. Çözüm desteği 60/108 (%55,6), Konu Kapsamı 105/108 (%97,2). Ön değerlendirmedir.',
    strongAreas: 'Parazitoloji (10/12), mikoloji (9/13) ve temel viroloji sınıflama kartları çoğu soruda Doğrudan çözüm veriyor.',
    priorityGaps:
      'Genel mikrobiyoloji kuralları (kan kültürü saklama, eküvyon seçimi, besiyeri sınıflaması, biyogüvenlik düzeyleri, FMT) ve klinik ipucundan etkene giden ayırt edici kartlar.',
    examAllocation: {
      standardQuestions: 18,
      sessionTotal: 100,
      observedRange: '18',
      sessionShareNote: '100 Temel sorusunun 18’i (%18,0) · 200 soruluk TUS’un %9,0’ı',
    },
  },
  {
    slug: 'patoloji',
    name: 'Patoloji',
    catalogCourseId: 'bka-patoloji',
    group: 'Temel Bilimler',
    seoTitle: 'Patoloji TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Patoloji TUS çıkmış soruları: son 6 sınavda 107 soru, 724 kartlık deste. Çözüm desteği 51/107 (%47,7), Konu Kapsamı 100/107 (%93,5). Ön değerlendirmedir.',
    strongAreas: 'Testis germ hücreli tümörleri, glomerül hastalıkları ve lenfoma translokasyon kartları Doğrudan çözüm veriyor.',
    priorityGaps:
      'Genel patoloji (hücre hasarı, onarım, mediyatörler) ve ayırt edici histolojiden tanıya giden karşılaştırma kartları (FNH, aktinik keratoz, ARVC vb.).',
    examAllocation: {
      standardQuestions: 18,
      sessionTotal: 100,
      observedRange: '17–19',
      sessionShareNote: '100 Temel sorusunun ~18’i (%18,0) · 200 soruluk TUS’un %9,0’ı',
    },
  },
  {
    slug: 'farmakoloji',
    name: 'Farmakoloji',
    catalogCourseId: 'bka-farmakoloji',
    group: 'Temel Bilimler',
    seoTitle: 'Farmakoloji TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Farmakoloji TUS çıkmış soruları: son 6 sınavda 106 soru, 827 kartlık deste. Çözüm desteği 60/106 (%56,6), Konu Kapsamı 103/106 (%97,2). Ön değerlendirmedir.',
    strongAreas: 'Son 6 TUS’ta çözüm oranı en yüksek kartlar biyolojik ajanlar, mekanizmadan ilaca gidiş ve CYP450 etkileşimleri.',
    priorityGaps:
      'Bisfosfonatlar, ektoparazitikler, nazal dekonjestanlar, ilaç geliştirme fazları, benzodiazepin farmakokinetiği ve sınıf içi mekanizma/endikasyon karşılaştırmaları.',
    examAllocation: {
      standardQuestions: 18,
      sessionTotal: 100,
      observedRange: '17–18',
      sessionShareNote: '100 Temel sorusunun ~18’i (%18,0) · 200 soruluk TUS’un %9,0’ı',
    },
  },
  {
    slug: 'dahiliye',
    name: 'Dahiliye',
    catalogCourseId: 'bka-dahiliye',
    group: 'Klinik Bilimler',
    seoTitle: 'Dahiliye TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Dahiliye TUS çıkmış soruları: son 6 sınavda 143 soru, 1.183 kartlık deste. Çözüm desteği 58/143 (%40,6), Konu Kapsamı 130/143 (%90,9). Ön değerlendirmedir.',
    strongAreas: 'Romatoloji otoantikorları, endokrin dinamik testleri ve hepatoloji skorlama kartları sınavdan sınava düzenli destek veriyor.',
    priorityGaps:
      'Akut kardiyoloji yönetimi (STEMI, sağ ventrikül enfarktüsü), miyelom/MPN prognoz ve hedefe yönelik tedaviler ile tanıdan sonraki ilk tetkik/tedavi adımları.',
    examAllocation: {
      standardQuestions: 24,
      sessionTotal: 100,
      observedRange: '23–25',
      sessionShareNote: '100 Klinik sorusunun ~24’ü (%24,0) · 200 soruluk TUS’un %12,0’si',
    },
  },
  {
    slug: 'pediatri',
    name: 'Pediatri',
    catalogCourseId: 'bka-pediatri',
    group: 'Klinik Bilimler',
    seoTitle: 'Pediatri TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Pediatri TUS çıkmış soruları: son 6 sınavda 148 soru, 1.506 kartlık deste. Çözüm desteği 77/148 (%52,0), Konu Kapsamı 139/148 (%93,9). Ön değerlendirmedir.',
    strongAreas: 'Pediatrik kardiyoloji (%88), yenidoğan (%80) ve nefroloji (%79) alt desteleri klinik derslerin en iyileri arasında.',
    priorityGaps:
      'Çocuk psikiyatrisi ve DEHB, nadir genetik sendromlar, adölesan jinekolojisi, pediatrik romatoloji ve diyabetik ketoasidoz yönetim ayrıntıları.',
    examAllocation: {
      standardQuestions: 25,
      sessionTotal: 100,
      observedRange: '24–25',
      sessionShareNote: '100 Klinik sorusunun ~25’i (%25,0) · 200 soruluk TUS’un %12,5’i',
    },
  },
  {
    slug: 'genel-cerrahi',
    name: 'Genel Cerrahi',
    catalogCourseId: 'bka-genel-cerrahi',
    group: 'Klinik Bilimler',
    seoTitle: 'Genel Cerrahi TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Genel Cerrahi TUS çıkmış soruları: son 6 sınavda 120 soru, 742 kartlık deste. Çözüm desteği 38/120 (%31,7), Konu Kapsamı 104/120 (%86,7). Ön değerlendirmedir.',
    strongAreas: 'Sınıflama ve şema kartları ile tiroit cerrahisi ve karın duvarı fıtıkları kartları Doğrudan çözüm veriyor.',
    priorityGaps:
      'Abdominal kompartman sendromu, travmaya metabolik yanıt, splenektomi endikasyonları ve komplikasyonları, safra taşı ileusu, SIRS eşikleri ve meme alt başlıkları.',
    examAllocation: {
      standardQuestions: 20,
      sessionTotal: 100,
      observedRange: '19–21',
      sessionShareNote: '100 Klinik sorusunun ~20’si (%20,0) · 200 soruluk TUS’un %10,0’u',
    },
  },
  {
    slug: 'kadin-dogum',
    name: 'Kadın Doğum',
    catalogCourseId: 'bka-kadin-dogum',
    group: 'Klinik Bilimler',
    seoTitle: 'Kadın Doğum TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Kadın Doğum TUS çıkmış soruları: son 6 sınavda 60 soru, 755 kartlık deste. Çözüm desteği 21/60 (%35,0), Konu Kapsamı 58/60 (%96,7). Ön değerlendirmedir.',
    strongAreas: 'Prenatal tarama testleri, hormon profilleri ve servikal preinvaziv lezyon yönetiminde konu kapsamı yüksek.',
    priorityGaps:
      'Kontrasepsiyon yöntemlerinin kontrendikasyon ayrıntıları, doğum eylemi komplikasyonları (operatif doğum, TOLAC, atoni cerrahisi) ve HPV alt tipleri.',
    examAllocation: {
      standardQuestions: 10,
      sessionTotal: 100,
      observedRange: '10',
      sessionShareNote: '100 Klinik sorusunun 10’u (%10,0) · 200 soruluk TUS’un %5,0’i',
    },
  },
  {
    slug: 'kucuk-stajlar',
    name: 'Küçük Stajlar',
    catalogCourseId: 'bka-kucuk-stajlar',
    group: 'Klinik Bilimler',
    seoTitle: 'Küçük Stajlar TUS çıkmış soru ve kart analizi | TusAnkiM',
    seoDescription:
      'Küçük Stajlar TUS çıkmış soruları: son 6 sınavda 126 soru, 626 kartlık deste. Çözüm desteği 38/126 (%30,2), Konu Kapsamı 109/126 (%86,5). Ön değerlendirmedir.',
    strongAreas: 'Epidemiyoloji araştırma tipleri, anestezi farmakolojisi ve klasik “en sık” bilgi kartları iyi destek veriyor.',
    priorityGaps:
      'Klinik tablodan tanıya giden sorular: kafa travması hematomları, demans/parkinson-plus ayrımı, psikiyatri tanı ölçütleri, ortopedi isimli tabloları ve dermatoloji tanımları.',
    examAllocation: {
      standardQuestions: 21,
      sessionTotal: 100,
      observedRange: '20–22',
      sessionShareNote: '100 Klinik sorusunun ~21’i (%21,0) · 200 soruluk TUS’un %10,5’i',
    },
  },
];

let cachedRefRows: Array<BranchSample & { ders: string }> | null = null;

function loadReferenceRows(): Array<BranchSample & { ders: string }> {
  if (cachedRefRows) return cachedRefRows;
  const candidates = [
    path.resolve(process.cwd(), 'public/data/references.json'),
    path.resolve(process.cwd(), 'website/public/data/references.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/data/references.json'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Could not locate public/data/references.json from ${process.cwd()}`);
  }
  const parsed = JSON.parse(fs.readFileSync(found, 'utf8'));
  cachedRefRows = parsed.kayitlar ?? [];
  return cachedRefRows!;
}

let cachedBranches: BranchInfo[] | null = null;

export function getBranches(): BranchInfo[] {
  if (cachedBranches) return cachedBranches;
  const allRows = loadReferenceRows();

  cachedBranches = BRANCH_META.map((meta) => {
    const subj = refSummary.bySubject.find((s) => s.ders === meta.name);
    if (!subj) throw new Error(`Missing subject "${meta.name}" in references-summary.json`);

    const course = catalog.courses.find((c) => c.id === meta.catalogCourseId);
    if (!course) throw new Error(`Missing course "${meta.catalogCourseId}" in catalog.json`);

    const exams: BranchExamRow[] = refSummary.byExam.map((ex) => {
      const row = ex.bySubject.find((s) => s.ders === meta.name);
      if (!row) throw new Error(`Missing exam ${ex.sinav} subject "${meta.name}"`);
      return {
        sinav: ex.sinav,
        soru: row.soru,
        dogrudan: row.dogrudan,
        dolayli: row.dolayli,
        destek: row.destek,
        destekOran: row.destekOran,
        konu: row.konu,
        konuKapsami: row.konuKapsami,
        konuKapsamiOran: row.konuKapsamiOran,
        yok: row.yok,
      };
    });

    const subjectRows = allRows.filter((r) => r.ders === meta.name);
    const prioritized = [
      ...subjectRows.filter((r) => r.rozet === 'DOGRUDAN' && r.sinavOncesiSurumde === 'evet'),
      ...subjectRows.filter((r) => r.rozet === 'DOGRUDAN' && r.sinavOncesiSurumde !== 'evet'),
      ...subjectRows.filter((r) => r.rozet === 'DOLAYLI'),
    ];
    const samples: BranchSample[] = prioritized.slice(0, 5).map((r) => ({
      qid: r.qid,
      sinav: r.sinav,
      rozet: r.rozet,
      olculenBilgi: r.olculenBilgi,
      eksikAdim: r.eksikAdim,
      sinavOncesiSurumde: r.sinavOncesiSurumde,
      cardId: r.cardId,
      kartOzet: r.kartOzet,
    }));

    return {
      slug: meta.slug,
      name: meta.name,
      catalogCourseId: meta.catalogCourseId,
      catalogCourseName: course.name,
      group: meta.group,
      seoTitle: meta.seoTitle,
      seoDescription: meta.seoDescription,
      strongAreas: meta.strongAreas,
      priorityGaps: meta.priorityGaps,
      examAllocation: meta.examAllocation,
      summary: {
        soru: subj.soru,
        dogrudan: subj.dogrudan,
        dolayli: subj.dolayli,
        destek: subj.destek,
        destekOran: subj.destekOran,
        konu: subj.konu,
        konuKapsami: subj.konuKapsami,
        konuKapsamiOran: subj.konuKapsamiOran,
        yok: subj.yok,
      },
      catalogCourse: {
        notes: course.notes,
        cards: course.cards,
        topicSubdecks: course.topicSubdecks,
        topTopics: course.topTopics,
      },
      exams,
      samples,
    };
  });

  return cachedBranches;
}

export function getBranchBySlug(slug: string): BranchInfo | undefined {
  return getBranches().find((b) => b.slug === slug);
}

export function getBranchByName(name: string): BranchInfo | undefined {
  return getBranches().find((b) => b.name === name);
}
