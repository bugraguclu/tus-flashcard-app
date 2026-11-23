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
    seoTitle: 'Anatomi TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 78 Anatomi sorusu için 22/78 (%28,2) çözüm desteği, 72/78 (%92,3) konu kapsamı ve 477 kartlık BKA Anatomi destesi analizi.',
    strongAreas: 'Geçen yapılar ve sınır listeleri, alt ekstremite ve beyin sapı arterleri kartları yüksek doğrulukta.',
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
    seoTitle: 'Fizyoloji-Histoloji-Embriyoloji TUS Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 90 FHE sorusu için 35/90 (%38,9) çözüm desteği, 87/90 (%96,7) konu kapsamı ve katalogdaki 597 kartlık FHE destesi analizi.',
    strongAreas: 'Göz ve retina histolojisi, deri ve bağ dokusu ile gametogenez kartları güçlü çözüm desteği veriyor.',
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
    seoTitle: 'Biyokimya TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 109 Biyokimya sorusu için 61/109 (%56,0) çözüm desteği, 101/109 (%92,7) konu kapsamı ve 602 kartlık Biyokimya destesi analizi.',
    strongAreas: 'Nükleotid yolları, üre döngüsü ve kalıtsal metabolik hastalık–enzim eşleşmeleri yüksek isabet oranına sahip.',
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
    seoTitle: 'Mikrobiyoloji TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 108 Mikrobiyoloji sorusu için 60/108 (%55,6) çözüm desteği, 105/108 (%97,2) konu kapsamı ve 730 kartlık Mikrobiyoloji destesi analizi.',
    strongAreas: 'Parazitoloji (10/12), mikoloji (9/13) ve temel viroloji sınıflama kartları yüksek doğrudan çözüm sağlıyor.',
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
    seoTitle: 'Patoloji TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 107 Patoloji sorusu için 51/107 (%47,7) çözüm desteği, 100/107 (%93,5) konu kapsamı ve 724 kartlık Patoloji destesi analizi.',
    strongAreas: 'Testis germ hücreli tümörleri, glomerül hastalıkları ve lenfoma translokasyon kartları doğrudan çözüm sunuyor.',
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
    seoTitle: 'Farmakoloji TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 106 Farmakoloji sorusu için 60/106 (%56,6) çözüm desteği, 103/106 (%97,2) konu kapsamı ve 827 kartlık Farmakoloji destesi analizi.',
    strongAreas: 'Biyolojik ajanlar, mekanizmadan ilaca gidiş ve CYP450 etkileşim kartları son 6 TUS’ta en yüksek çözüm oranına sahip.',
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
    seoTitle: 'Dahiliye TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 143 Dahiliye sorusu için 58/143 (%40,6) çözüm desteği, 130/143 (%90,9) konu kapsamı ve 1.183 kartlık Dahiliye destesi analizi.',
    strongAreas: 'Romatoloji otoantikorları, endokrin dinamik testleri ve hepatoloji skorlama kartları istikrarlı destek veriyor.',
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
    seoTitle: 'Pediatri TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 148 Pediatri sorusu için 77/148 (%52,0) çözüm desteği, 139/148 (%93,9) konu kapsamı ve 1.506 kartlık Pediatri destesi analizi.',
    strongAreas: 'Pediatrik kardiyoloji (%88), yenidoğan (%80) ve nefroloji (%79) alt desteleri klinik bilimler arasında öne çıkıyor.',
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
    seoTitle: 'Genel Cerrahi TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 120 Genel Cerrahi sorusu için 38/120 (%31,7) çözüm desteği, 104/120 (%86,7) konu kapsamı ve 742 kartlık Genel Cerrahi destesi analizi.',
    strongAreas: 'Sınıflama/şema kartları, tiroit cerrahisi ve karın duvarı fıtıkları kartları doğrudan çözüm sunuyor.',
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
    seoTitle: 'Kadın Doğum TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 60 Kadın Doğum sorusu için 21/60 (%35,0) çözüm desteği, 58/60 (%96,7) konu kapsamı ve 755 kartlık Kadın Doğum destesi analizi.',
    strongAreas: 'Prenatal tarama testleri, hormon profilleri ve servikal preinvaziv lezyon yönetimi yüksek konu kapsamı sağlıyor.',
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
    seoTitle: 'Küçük Stajlar TUS Çıkmış Soru & Kart Analizi | TusAnkiM',
    seoDescription:
      'Son 6 TUS’ta 126 Küçük Stajlar sorusu için 38/126 (%30,2) çözüm desteği, 109/126 (%86,5) konu kapsamı ve 626 kartlık Küçük Stajlar destesi analizi.',
    strongAreas: 'Epidemiyoloji araştırma tipleri, anestezi farmakolojisi ve klasik “en sık” bilgi kartları güçlü destek veriyor.',
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
