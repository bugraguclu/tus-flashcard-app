// Auto-generated from research/tus-search-demand/raw_osym_tus_data.csv and raw_osym_applicants_and_transfers.csv
// Verified ÖSYM official placement PDFs (2025/1–2026/2). Zero copyrighted ÖSYM exam questions.

export type OsymPeriod = '2026/2' | '2026/1' | '2025/2';

export interface OsymBranchPlacement {
  id: string;
  period: OsymPeriod;
  branch: string;
  quota: number;
  placed: number;
  empty: number;
  fillRate: number;
  minScore: number;
  maxScore: number;
  programs: number;
}

export interface OsymMacroPlacement {
  id: string;
  period: string;
  date: string;
  programs: number;
  totalQuota: number;
  totalPlaced: number | null;
  totalEmpty: number | null;
  fillRate: number | null;
  genelSummary: string;
  sourceUrl: string;
}

export interface OsymApplicantTransfer {
  period: string;
  ttbt: number;
  ktbt: number;
  applicantSource: string;
  firstPlaced: number;
  ekPlaced: number | null;
  dalDegisikligiQuota: number | null;
  dalDegisikligiPlaced: number | null;
  totalPlacedLabel: string;
}

export const OSYM_PERIOD_COUNTS: Record<OsymPeriod, number> = {
  "2026/2": 40,
  "2026/1": 41,
  "2025/2": 41
};

export const OSYM_MACRO_PLACEMENTS: OsymMacroPlacement[] = [
  {
    "id": "OSYM-0030",
    "period": "2026-TUS 2. Dönem Yerleştirme",
    "date": "16 Ekim 2026",
    "programs": 2941,
    "totalQuota": 8637,
    "totalPlaced": 7625,
    "totalEmpty": 1013,
    "fillRate": 88.3,
    "genelSummary": "K: 8.353 · Y: 7.486 · B: 868 (%89,6)",
    "sourceUrl": "https://dokuman.osym.gov.tr/web/2026/10/2026-tus-2donem-yerlestirme-sonuclarina-liskin-en-buyuk-ve-en-kucuk-puanlar-genel-yabanci-uyruklu-uzp3a0-16132230.pdf"
  },
  {
    "id": "OSYM-EX-008",
    "period": "2026-TUS 2. Dönem Ek Yerleştirme (Kontenjan)",
    "date": "20 Kasım 2026",
    "programs": 788,
    "totalQuota": 1442,
    "totalPlaced": null,
    "totalEmpty": null,
    "fillRate": null,
    "genelSummary": "Genel: 1.287 · YU: 155 (429’u ilk yerleştirmede kayıt yaptırmayan veya vazgeçenlerden; sonuç bekleniyor)",
    "sourceUrl": "https://www.osym.gov.tr/SinavGrubu/Index/6"
  },
  {
    "id": "OSYM-0071",
    "period": "2026-TUS 1. Dönem Ek Yerleştirme",
    "date": "2 Temmuz 2026",
    "programs": 901,
    "totalQuota": 2450,
    "totalPlaced": 603,
    "totalEmpty": 1847,
    "fillRate": 24.6,
    "genelSummary": "K: 2.264 · Y: 598 · B: 1.666 (%26,4)",
    "sourceUrl": "https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/EK/ek_minmax02072026.pdf"
  },
  {
    "id": "OSYM-0072",
    "period": "2026-TUS 1. Dönem Yerleştirme",
    "date": "15 Mayıs 2026",
    "programs": 2898,
    "totalQuota": 10155,
    "totalPlaced": 8237,
    "totalEmpty": 1921,
    "fillRate": 81.1,
    "genelSummary": "K: 9.855 · Y: 8.106 · B: 1.752 (%82,3)",
    "sourceUrl": "https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/YERLESTIRME/SB/minmax_ts1d21052026.pdf"
  },
  {
    "id": "OSYM-0114",
    "period": "2025-TUS 2. Dönem Ek Yerleştirme",
    "date": "26 Kasım 2025",
    "programs": 925,
    "totalQuota": 2573,
    "totalPlaced": 614,
    "totalEmpty": 1959,
    "fillRate": 23.9,
    "genelSummary": "K: 2.402 · Y: 600 · B: 1.802 (%25,0)",
    "sourceUrl": "https://dokuman.osym.gov.tr/pdfdokuman/2025/TUSDONEM-2/TERCIH/EK/minmax_ts2ed26112025.pdf"
  },
  {
    "id": "OSYM-0115",
    "period": "2025-TUS 2. Dönem Yerleştirme",
    "date": "10 Ekim 2025",
    "programs": 2949,
    "totalQuota": 10439,
    "totalPlaced": 8443,
    "totalEmpty": 1998,
    "fillRate": 80.9,
    "genelSummary": "K: 10.158 · Y: 8.303 · B: 1.857 (%81,7)",
    "sourceUrl": "https://dokuman.osym.gov.tr/pdfdokuman/2025/TUSDONEM-2/YERLESTIRME/minmax_ts2yd10102025.pdf"
  },
  {
    "id": "OSYM-0157",
    "period": "2025-TUS 1. Dönem Yerleştirme",
    "date": "3 Haziran 2025",
    "programs": 2929,
    "totalQuota": 8883,
    "totalPlaced": 7546,
    "totalEmpty": 1337,
    "fillRate": 84.9,
    "genelSummary": "K: 8.596 · Y: 7.427 · B: 1.169 (%86,4)",
    "sourceUrl": "https://dokuman.osym.gov.tr/pdfdokuman/2025/TUSDONEM-1/TERCIH/minmax03062025.pdf"
  }
];

export const OSYM_APPLICANTS_AND_TRANSFERS: OsymApplicantTransfer[] = [
  {
    "period": "2025/1",
    "ttbt": 30276,
    "ktbt": 30945,
    "applicantSource": "ÖSYM 2025 Faaliyet Raporu (s. 71–72)",
    "firstPlaced": 7546,
    "ekPlaced": 626,
    "dalDegisikligiQuota": 1338,
    "dalDegisikligiPlaced": 12,
    "totalPlacedLabel": "8.184"
  },
  {
    "period": "2025/2",
    "ttbt": 33407,
    "ktbt": 34252,
    "applicantSource": "ÖSYM 2025 Faaliyet Raporu (s. 71–72)",
    "firstPlaced": 8443,
    "ekPlaced": 614,
    "dalDegisikligiQuota": 1959,
    "dalDegisikligiPlaced": 94,
    "totalPlacedLabel": "9.151"
  },
  {
    "period": "2026/1",
    "ttbt": 32927,
    "ktbt": 34531,
    "applicantSource": "ÖSYM Başkanı AA resmî sınav günü açıklaması",
    "firstPlaced": 8237,
    "ekPlaced": 603,
    "dalDegisikligiQuota": 1847,
    "dalDegisikligiPlaced": 46,
    "totalPlacedLabel": "8.886"
  },
  {
    "period": "2026/2",
    "ttbt": 35930,
    "ktbt": 37109,
    "applicantSource": "ÖSYM Başkanı AA resmî sınav günü açıklaması",
    "firstPlaced": 7625,
    "ekPlaced": null,
    "dalDegisikligiQuota": null,
    "dalDegisikligiPlaced": null,
    "totalPlacedLabel": "7.625 (1.442 kişilik ek yerleştirme bekleniyor)"
  }
];

export const OSYM_BRANCH_PLACEMENTS: OsymBranchPlacement[] = [
  {"id":"OSYM-0070","period":"2026/2","branch":"Tıbbi Ekoloji ve Hidroklimatoloji","quota":2,"placed":2,"empty":0,"fillRate":100,"minScore":68.00617,"maxScore":69.63407,"programs":1},
  {"id":"OSYM-0058","period":"2026/2","branch":"Radyasyon Onkolojisi","quota":70,"placed":70,"empty":0,"fillRate":100,"minScore":66.1909,"maxScore":73.96464,"programs":38},
  {"id":"OSYM-0059","period":"2026/2","branch":"Tıbbi Biyokimya","quota":56,"placed":56,"empty":0,"fillRate":100,"minScore":66.04889,"maxScore":73.93588,"programs":53},
  {"id":"OSYM-0054","period":"2026/2","branch":"Plastik, Rekonstrüktif ve Estetik Cerrahi","quota":98,"placed":98,"empty":0,"fillRate":100,"minScore":64.8212,"maxScore":85,"programs":30},
  {"id":"OSYM-0067","period":"2026/2","branch":"Sualtı Hekimliği ve Hiperbarik Tıp","quota":15,"placed":15,"empty":0,"fillRate":100,"minScore":63.01626,"maxScore":67.85769,"programs":4},
  {"id":"OSYM-0066","period":"2026/2","branch":"Histoloji ve Embriyoloji","quota":17,"placed":17,"empty":0,"fillRate":100,"minScore":61.71695,"maxScore":70.7052,"programs":17},
  {"id":"OSYM-0053","period":"2026/2","branch":"Enfeksiyon Hastalıkları ve Klinik Mikrobiyoloji","quota":114,"placed":113,"empty":1,"fillRate":99.1,"minScore":60.87964,"maxScore":71.86926,"programs":86},
  {"id":"OSYM-0064","period":"2026/2","branch":"Halk Sağlığı","quota":37,"placed":37,"empty":0,"fillRate":100,"minScore":60.49685,"maxScore":75.85608,"programs":35},
  {"id":"OSYM-0038","period":"2026/2","branch":"Radyoloji","quota":326,"placed":324,"empty":2,"fillRate":99.4,"minScore":59.71836,"maxScore":79.64883,"programs":97},
  {"id":"OSYM-0068","period":"2026/2","branch":"Tıbbi Farmakoloji","quota":13,"placed":13,"empty":0,"fillRate":100,"minScore":59.43917,"maxScore":68.40472,"programs":12},
  {"id":"OSYM-0055","period":"2026/2","branch":"Çocuk ve Ergen Ruh Sağlığı ve Hastalıkları","quota":88,"placed":88,"empty":0,"fillRate":100,"minScore":57.33341,"maxScore":79.24097,"programs":62},
  {"id":"OSYM-0043","period":"2026/2","branch":"Kulak Burun Boğaz Hastalıkları","quota":225,"placed":225,"empty":0,"fillRate":100,"minScore":56.90583,"maxScore":80.24808,"programs":74},
  {"id":"OSYM-0060","period":"2026/2","branch":"Fizyoloji","quota":53,"placed":53,"empty":0,"fillRate":100,"minScore":56.65339,"maxScore":68.5109,"programs":34},
  {"id":"OSYM-0062","period":"2026/2","branch":"Anatomi","quota":42,"placed":42,"empty":0,"fillRate":100,"minScore":55.68533,"maxScore":69.51594,"programs":37},
  {"id":"OSYM-0041","period":"2026/2","branch":"Göz Hastalıkları","quota":267,"placed":267,"empty":0,"fillRate":100,"minScore":55.2721,"maxScore":84.52802,"programs":87},
  {"id":"OSYM-0063","period":"2026/2","branch":"Adli Tıp","quota":37,"placed":35,"empty":2,"fillRate":94.6,"minScore":54.82299,"maxScore":71.75768,"programs":17},
  {"id":"OSYM-0045","period":"2026/2","branch":"Deri ve Zührevi Hastalıkları","quota":212,"placed":212,"empty":0,"fillRate":100,"minScore":54.74232,"maxScore":84.43883,"programs":65},
  {"id":"OSYM-0065","period":"2026/2","branch":"Tıbbi Genetik","quota":31,"placed":30,"empty":1,"fillRate":96.8,"minScore":53.73923,"maxScore":79.33016,"programs":20},
  {"id":"OSYM-0051","period":"2026/2","branch":"Fiziksel Tıp ve Rehabilitasyon","quota":141,"placed":141,"empty":0,"fillRate":100,"minScore":49.53144,"maxScore":79.10652,"programs":89},
  {"id":"OSYM-0048","period":"2026/2","branch":"Üroloji","quota":171,"placed":169,"empty":2,"fillRate":98.8,"minScore":49.21411,"maxScore":75.34918,"programs":109},
  {"id":"OSYM-0050","period":"2026/2","branch":"Tıbbi Patoloji","quota":163,"placed":160,"empty":3,"fillRate":98.2,"minScore":48.81161,"maxScore":77.79413,"programs":82},
  {"id":"OSYM-0044","period":"2026/2","branch":"Ruh Sağlığı ve Hastalıkları","quota":213,"placed":213,"empty":0,"fillRate":100,"minScore":48.10613,"maxScore":81.5219,"programs":75},
  {"id":"OSYM-0057","period":"2026/2","branch":"Tıbbi Mikrobiyoloji","quota":70,"placed":69,"empty":1,"fillRate":98.6,"minScore":47.71889,"maxScore":80.71075,"programs":51},
  {"id":"OSYM-0052","period":"2026/2","branch":"Çocuk Cerrahisi","quota":120,"placed":62,"empty":58,"fillRate":51.7,"minScore":46.32675,"maxScore":68.70897,"programs":52},
  {"id":"OSYM-0069","period":"2026/2","branch":"Spor Hekimliği","quota":11,"placed":11,"empty":0,"fillRate":100,"minScore":45.49802,"maxScore":75.41281,"programs":9},
  {"id":"OSYM-0047","period":"2026/2","branch":"Göğüs Hastalıkları","quota":197,"placed":187,"empty":10,"fillRate":94.9,"minScore":45.44919,"maxScore":69.70173,"programs":79},
  {"id":"OSYM-0056","period":"2026/2","branch":"Göğüs Cerrahisi","quota":73,"placed":57,"empty":16,"fillRate":78.1,"minScore":45.44376,"maxScore":68.96084,"programs":44},
  {"id":"OSYM-0042","period":"2026/2","branch":"Ortopedi ve Travmatoloji","quota":264,"placed":256,"empty":8,"fillRate":97,"minScore":45.38064,"maxScore":73.24481,"programs":112},
  {"id":"OSYM-0036","period":"2026/2","branch":"Kadın Hastalıkları ve Doğum","quota":468,"placed":381,"empty":88,"fillRate":81.4,"minScore":45.19322,"maxScore":74.33757,"programs":109},
  {"id":"OSYM-0061","period":"2026/2","branch":"Nükleer Tıp","quota":42,"placed":41,"empty":1,"fillRate":97.6,"minScore":45.14662,"maxScore":77.64714,"programs":35},
  {"id":"OSYM-0037","period":"2026/2","branch":"Genel Cerrahi","quota":413,"placed":323,"empty":90,"fillRate":78.2,"minScore":45.12241,"maxScore":77.44139,"programs":110},
  {"id":"OSYM-0034","period":"2026/2","branch":"Acil Tıp","quota":533,"placed":433,"empty":100,"fillRate":81.2,"minScore":45.11523,"maxScore":65.11613,"programs":130},
  {"id":"OSYM-0031","period":"2026/2","branch":"Aile Hekimliği","quota":864,"placed":837,"empty":27,"fillRate":96.9,"minScore":45.10001,"maxScore":73.84524,"programs":90},
  {"id":"OSYM-0039","period":"2026/2","branch":"Kardiyoloji","quota":314,"placed":298,"empty":16,"fillRate":94.9,"minScore":45.08566,"maxScore":81.83923,"programs":118},
  {"id":"OSYM-0046","period":"2026/2","branch":"Beyin ve Sinir Cerrahisi","quota":199,"placed":158,"empty":41,"fillRate":79.4,"minScore":45.06299,"maxScore":78.52832,"programs":91},
  {"id":"OSYM-0033","period":"2026/2","branch":"İç Hastalıkları","quota":620,"placed":557,"empty":63,"fillRate":89.8,"minScore":45.03618,"maxScore":82.36901,"programs":120},
  {"id":"OSYM-0040","period":"2026/2","branch":"Nöroloji","quota":292,"placed":278,"empty":14,"fillRate":95.2,"minScore":45.02786,"maxScore":74.93098,"programs":108},
  {"id":"OSYM-0032","period":"2026/2","branch":"Çocuk Sağlığı ve Hastalıkları","quota":827,"placed":602,"empty":225,"fillRate":72.8,"minScore":45.0247,"maxScore":79.54978,"programs":110},
  {"id":"OSYM-0035","period":"2026/2","branch":"Anesteziyoloji ve Reanimasyon","quota":490,"placed":422,"empty":68,"fillRate":86.1,"minScore":45.01618,"maxScore":73.59668,"programs":117},
  {"id":"OSYM-0049","period":"2026/2","branch":"Kalp ve Damar Cerrahisi","quota":165,"placed":134,"empty":31,"fillRate":81.2,"minScore":45.01272,"maxScore":74.87136,"programs":83},
  {"id":"OSYM-0105","period":"2026/1","branch":"Tıbbi Genetik","quota":40,"placed":38,"empty":2,"fillRate":95,"minScore":65.81986,"maxScore":75.11193,"programs":22},
  {"id":"OSYM-0100","period":"2026/1","branch":"Radyasyon Onkolojisi","quota":55,"placed":55,"empty":0,"fillRate":100,"minScore":64.8569,"maxScore":75.02281,"programs":31},
  {"id":"OSYM-0112","period":"2026/1","branch":"Tıbbi Ekoloji ve Hidroklimatoloji","quota":3,"placed":3,"empty":0,"fillRate":100,"minScore":64.20287,"maxScore":66.03173,"programs":2},
  {"id":"OSYM-0109","period":"2026/1","branch":"Tıbbi Farmakoloji","quota":10,"placed":10,"empty":0,"fillRate":100,"minScore":63.65852,"maxScore":85,"programs":10},
  {"id":"OSYM-0101","period":"2026/1","branch":"Tıbbi Biyokimya","quota":52,"placed":52,"empty":0,"fillRate":100,"minScore":63.4077,"maxScore":72.93975,"programs":49},
  {"id":"OSYM-0089","period":"2026/1","branch":"Plastik, Rekonstrüktif ve Estetik Cerrahi","quota":209,"placed":210,"empty":0,"fillRate":100.5,"minScore":61.77648,"maxScore":80.99277,"programs":55},
  {"id":"OSYM-0110","period":"2026/1","branch":"Fizyoloji","quota":6,"placed":6,"empty":0,"fillRate":100,"minScore":61.16209,"maxScore":63.0068,"programs":6},
  {"id":"OSYM-0107","period":"2026/1","branch":"Histoloji ve Embriyoloji","quota":15,"placed":15,"empty":0,"fillRate":100,"minScore":61.05064,"maxScore":68.4785,"programs":15},
  {"id":"OSYM-0081","period":"2026/1","branch":"Göz Hastalıkları","quota":312,"placed":313,"empty":0,"fillRate":100.3,"minScore":60.08048,"maxScore":79.23369,"programs":121},
  {"id":"OSYM-0083","period":"2026/1","branch":"Deri ve Zührevi Hastalıkları","quota":303,"placed":303,"empty":0,"fillRate":100,"minScore":59.00526,"maxScore":83.08329,"programs":90},
  {"id":"OSYM-0111","period":"2026/1","branch":"Anatomi","quota":5,"placed":5,"empty":0,"fillRate":100,"minScore":58.79227,"maxScore":64.37704,"programs":5},
  {"id":"OSYM-0113","period":"2026/1","branch":"Hava ve Uzay Hekimliği","quota":1,"placed":1,"empty":0,"fillRate":100,"minScore":57.80494,"maxScore":57.80494,"programs":1},
  {"id":"OSYM-0087","period":"2026/1","branch":"Ruh Sağlığı ve Hastalıkları","quota":226,"placed":226,"empty":0,"fillRate":100,"minScore":55.94734,"maxScore":75.50809,"programs":72},
  {"id":"OSYM-0108","period":"2026/1","branch":"Spor Hekimliği","quota":13,"placed":13,"empty":0,"fillRate":100,"minScore":54.9165,"maxScore":72.95416,"programs":12},
  {"id":"OSYM-0096","period":"2026/1","branch":"Enfeksiyon Hastalıkları ve Klinik Mikrobiyoloji","quota":128,"placed":127,"empty":1,"fillRate":99.2,"minScore":54.45119,"maxScore":70.48619,"programs":86},
  {"id":"OSYM-0104","period":"2026/1","branch":"Adli Tıp","quota":42,"placed":40,"empty":2,"fillRate":95.2,"minScore":54.4474,"maxScore":67.81161,"programs":21},
  {"id":"OSYM-0094","period":"2026/1","branch":"Tıbbi Patoloji","quota":154,"placed":150,"empty":4,"fillRate":97.4,"minScore":54.36207,"maxScore":69.22477,"programs":72},
  {"id":"OSYM-0106","period":"2026/1","branch":"Sualtı Hekimliği ve Hiperbarik Tıp","quota":17,"placed":17,"empty":0,"fillRate":100,"minScore":53.98272,"maxScore":66.77718,"programs":6},
  {"id":"OSYM-0103","period":"2026/1","branch":"Nükleer Tıp","quota":45,"placed":44,"empty":1,"fillRate":97.8,"minScore":53.85808,"maxScore":75.71616,"programs":32},
  {"id":"OSYM-0093","period":"2026/1","branch":"Fiziksel Tıp ve Rehabilitasyon","quota":156,"placed":154,"empty":2,"fillRate":98.7,"minScore":53.32617,"maxScore":73.17714,"programs":85},
  {"id":"OSYM-0091","period":"2026/1","branch":"Üroloji","quota":199,"placed":196,"empty":3,"fillRate":98.5,"minScore":52.98171,"maxScore":69.57239,"programs":104},
  {"id":"OSYM-0102","period":"2026/1","branch":"Halk Sağlığı","quota":46,"placed":46,"empty":0,"fillRate":100,"minScore":52.87578,"maxScore":69.02303,"programs":45},
  {"id":"OSYM-0085","period":"2026/1","branch":"Kulak Burun Boğaz Hastalıkları","quota":284,"placed":284,"empty":0,"fillRate":100,"minScore":52.01178,"maxScore":76.0749,"programs":109},
  {"id":"OSYM-0097","period":"2026/1","branch":"Çocuk ve Ergen Ruh Sağlığı ve Hastalıkları","quota":102,"placed":102,"empty":0,"fillRate":100,"minScore":46.72948,"maxScore":81.20273,"programs":60},
  {"id":"OSYM-0086","period":"2026/1","branch":"Ortopedi ve Travmatoloji","quota":278,"placed":274,"empty":4,"fillRate":98.6,"minScore":46.57311,"maxScore":72.01976,"programs":110},
  {"id":"OSYM-0090","period":"2026/1","branch":"Göğüs Hastalıkları","quota":204,"placed":192,"empty":12,"fillRate":94.1,"minScore":45.49553,"maxScore":66.73809,"programs":75},
  {"id":"OSYM-0095","period":"2026/1","branch":"Çocuk Cerrahisi","quota":152,"placed":61,"empty":91,"fillRate":40.1,"minScore":45.48488,"maxScore":62.00831,"programs":52},
  {"id":"OSYM-0082","period":"2026/1","branch":"Kardiyoloji","quota":306,"placed":296,"empty":10,"fillRate":96.7,"minScore":45.48488,"maxScore":73.50479,"programs":105},
  {"id":"OSYM-0080","period":"2026/1","branch":"Radyoloji","quota":353,"placed":352,"empty":1,"fillRate":99.7,"minScore":45.48361,"maxScore":78.25454,"programs":96},
  {"id":"OSYM-0084","period":"2026/1","branch":"Nöroloji","quota":288,"placed":258,"empty":30,"fillRate":89.6,"minScore":45.46617,"maxScore":73.3665,"programs":106},
  {"id":"OSYM-0099","period":"2026/1","branch":"Tıbbi Mikrobiyoloji","quota":77,"placed":78,"empty":0,"fillRate":101.3,"minScore":45.33402,"maxScore":80.42003,"programs":51},
  {"id":"OSYM-0078","period":"2026/1","branch":"Genel Cerrahi","quota":496,"placed":274,"empty":222,"fillRate":55.2,"minScore":45.19212,"maxScore":68.58502,"programs":113},
  {"id":"OSYM-0098","period":"2026/1","branch":"Göğüs Cerrahisi","quota":99,"placed":69,"empty":30,"fillRate":69.7,"minScore":45.13915,"maxScore":60.88898,"programs":48},
  {"id":"OSYM-0092","period":"2026/1","branch":"Kalp ve Damar Cerrahisi","quota":160,"placed":123,"empty":37,"fillRate":76.9,"minScore":45.12234,"maxScore":72.59099,"programs":71},
  {"id":"OSYM-0088","period":"2026/1","branch":"Beyin ve Sinir Cerrahisi","quota":209,"placed":152,"empty":57,"fillRate":72.7,"minScore":45.06285,"maxScore":70.84493,"programs":86},
  {"id":"OSYM-0079","period":"2026/1","branch":"Kadın Hastalıkları ve Doğum","quota":489,"placed":382,"empty":107,"fillRate":78.1,"minScore":45.03385,"maxScore":70.47001,"programs":106},
  {"id":"OSYM-0077","period":"2026/1","branch":"Anesteziyoloji ve Reanimasyon","quota":537,"placed":493,"empty":44,"fillRate":91.8,"minScore":45.03322,"maxScore":65.87536,"programs":117},
  {"id":"OSYM-0073","period":"2026/1","branch":"Aile Hekimliği","quota":1603,"placed":1227,"empty":376,"fillRate":76.5,"minScore":45.01831,"maxScore":67.79744,"programs":77},
  {"id":"OSYM-0076","period":"2026/1","branch":"Acil Tıp","quota":572,"placed":439,"empty":133,"fillRate":76.7,"minScore":45.01578,"maxScore":64.90719,"programs":124},
  {"id":"OSYM-0075","period":"2026/1","branch":"İç Hastalıkları","quota":620,"placed":540,"empty":80,"fillRate":87.1,"minScore":45.00137,"maxScore":74.67709,"programs":115},
  {"id":"OSYM-0074","period":"2026/1","branch":"Çocuk Sağlığı ve Hastalıkları","quota":989,"placed":486,"empty":503,"fillRate":49.1,"minScore":45.00086,"maxScore":72.38356,"programs":101},
  {"id":"OSYM-0151","period":"2025/2","branch":"Spor Hekimliği","quota":10,"placed":9,"empty":1,"fillRate":90,"minScore":69.00604,"maxScore":81.22222,"programs":6},
  {"id":"OSYM-0146","period":"2025/2","branch":"Radyasyon Onkolojisi","quota":30,"placed":30,"empty":0,"fillRate":100,"minScore":65.77347,"maxScore":73.53156,"programs":18},
  {"id":"OSYM-0145","period":"2025/2","branch":"Tıbbi Biyokimya","quota":50,"placed":50,"empty":0,"fillRate":100,"minScore":64.65173,"maxScore":80.01235,"programs":48},
  {"id":"OSYM-0156","period":"2025/2","branch":"Hava ve Uzay Hekimliği","quota":2,"placed":2,"empty":0,"fillRate":100,"minScore":64.11645,"maxScore":65.79399,"programs":1},
  {"id":"OSYM-0155","period":"2025/2","branch":"Tıbbi Ekoloji ve Hidroklimatoloji","quota":2,"placed":2,"empty":0,"fillRate":100,"minScore":63.2218,"maxScore":63.41136,"programs":1},
  {"id":"OSYM-0152","period":"2025/2","branch":"Sualtı Hekimliği ve Hiperbarik Tıp","quota":5,"placed":5,"empty":0,"fillRate":100,"minScore":61.9888,"maxScore":64.50503,"programs":5},
  {"id":"OSYM-0149","period":"2025/2","branch":"Histoloji ve Embriyoloji","quota":20,"placed":20,"empty":0,"fillRate":100,"minScore":61.36999,"maxScore":80.3117,"programs":17},
  {"id":"OSYM-0150","period":"2025/2","branch":"Tıbbi Farmakoloji","quota":16,"placed":16,"empty":0,"fillRate":100,"minScore":60.33838,"maxScore":71.14997,"programs":16},
  {"id":"OSYM-0154","period":"2025/2","branch":"Fizyoloji","quota":4,"placed":4,"empty":0,"fillRate":100,"minScore":58.9944,"maxScore":66.93939,"programs":4},
  {"id":"OSYM-0126","period":"2025/2","branch":"Göz Hastalıkları","quota":292,"placed":293,"empty":0,"fillRate":100.3,"minScore":58.85323,"maxScore":82.96418,"programs":93},
  {"id":"OSYM-0124","period":"2025/2","branch":"Deri ve Zührevi Hastalıkları","quota":323,"placed":323,"empty":0,"fillRate":100,"minScore":58.67278,"maxScore":83.66736,"programs":94},
  {"id":"OSYM-0153","period":"2025/2","branch":"Anatomi","quota":4,"placed":4,"empty":0,"fillRate":100,"minScore":58.52212,"maxScore":61.90989,"programs":4},
  {"id":"OSYM-0148","period":"2025/2","branch":"Adli Tıp","quota":29,"placed":27,"empty":2,"fillRate":93.1,"minScore":56.53326,"maxScore":65.32567,"programs":15},
  {"id":"OSYM-0134","period":"2025/2","branch":"Plastik, Rekonstrüktif ve Estetik Cerrahi","quota":171,"placed":172,"empty":0,"fillRate":100.6,"minScore":56.33599,"maxScore":81.89786,"programs":60},
  {"id":"OSYM-0140","period":"2025/2","branch":"Çocuk ve Ergen Ruh Sağlığı ve Hastalıkları","quota":102,"placed":102,"empty":0,"fillRate":100,"minScore":56.14761,"maxScore":78.20392,"programs":58},
  {"id":"OSYM-0130","period":"2025/2","branch":"Ruh Sağlığı ve Hastalıkları","quota":244,"placed":244,"empty":0,"fillRate":100,"minScore":55.76588,"maxScore":78.27217,"programs":71},
  {"id":"OSYM-0137","period":"2025/2","branch":"Tıbbi Patoloji","quota":155,"placed":152,"empty":3,"fillRate":98.1,"minScore":55.61812,"maxScore":74.3512,"programs":71},
  {"id":"OSYM-0143","period":"2025/2","branch":"Tıbbi Mikrobiyoloji","quota":62,"placed":61,"empty":1,"fillRate":98.4,"minScore":54.36623,"maxScore":81.43439,"programs":44},
  {"id":"OSYM-0144","period":"2025/2","branch":"Nükleer Tıp","quota":52,"placed":52,"empty":0,"fillRate":100,"minScore":52.12217,"maxScore":75.58521,"programs":33},
  {"id":"OSYM-0125","period":"2025/2","branch":"Kulak Burun Boğaz Hastalıkları","quota":302,"placed":302,"empty":0,"fillRate":100,"minScore":51.81351,"maxScore":83.86077,"programs":102},
  {"id":"OSYM-0142","period":"2025/2","branch":"Halk Sağlığı","quota":71,"placed":71,"empty":0,"fillRate":100,"minScore":51.66951,"maxScore":69.66297,"programs":43},
  {"id":"OSYM-0147","period":"2025/2","branch":"Tıbbi Genetik","quota":30,"placed":30,"empty":0,"fillRate":100,"minScore":50.84279,"maxScore":80.72906,"programs":17},
  {"id":"OSYM-0123","period":"2025/2","branch":"Radyoloji","quota":342,"placed":342,"empty":0,"fillRate":100,"minScore":50.69203,"maxScore":78.44675,"programs":109},
  {"id":"OSYM-0138","period":"2025/2","branch":"Fiziksel Tıp ve Rehabilitasyon","quota":137,"placed":136,"empty":1,"fillRate":99.3,"minScore":48.69658,"maxScore":75.66197,"programs":84},
  {"id":"OSYM-0141","period":"2025/2","branch":"Enfeksiyon Hastalıkları ve Klinik Mikrobiyoloji","quota":101,"placed":101,"empty":0,"fillRate":100,"minScore":48.15805,"maxScore":71.34465,"programs":79},
  {"id":"OSYM-0131","period":"2025/2","branch":"Üroloji","quota":213,"placed":212,"empty":1,"fillRate":99.5,"minScore":47.91545,"maxScore":75.97184,"programs":105},
  {"id":"OSYM-0139","period":"2025/2","branch":"Göğüs Cerrahisi","quota":103,"placed":60,"empty":43,"fillRate":58.3,"minScore":45.68112,"maxScore":68.98133,"programs":49},
  {"id":"OSYM-0136","period":"2025/2","branch":"Çocuk Cerrahisi","quota":162,"placed":78,"empty":84,"fillRate":48.1,"minScore":45.50067,"maxScore":72.07456,"programs":54},
  {"id":"OSYM-0133","period":"2025/2","branch":"Beyin ve Sinir Cerrahisi","quota":196,"placed":163,"empty":33,"fillRate":83.2,"minScore":45.44152,"maxScore":78.73171,"programs":89},
  {"id":"OSYM-0129","period":"2025/2","branch":"Ortopedi ve Travmatoloji","quota":256,"placed":252,"empty":4,"fillRate":98.4,"minScore":45.23471,"maxScore":74.77631,"programs":105},
  {"id":"OSYM-0120","period":"2025/2","branch":"Genel Cerrahi","quota":525,"placed":316,"empty":209,"fillRate":60.2,"minScore":45.17601,"maxScore":74.07009,"programs":129},
  {"id":"OSYM-0135","period":"2025/2","branch":"Kalp ve Damar Cerrahisi","quota":167,"placed":122,"empty":45,"fillRate":73.1,"minScore":45.1673,"maxScore":76.67016,"programs":66},
  {"id":"OSYM-0128","period":"2025/2","branch":"Kardiyoloji","quota":258,"placed":252,"empty":6,"fillRate":97.7,"minScore":45.1335,"maxScore":81.56753,"programs":105},
  {"id":"OSYM-0127","period":"2025/2","branch":"Nöroloji","quota":286,"placed":248,"empty":38,"fillRate":86.7,"minScore":45.08847,"maxScore":79.8758,"programs":106},
  {"id":"OSYM-0132","period":"2025/2","branch":"Göğüs Hastalıkları","quota":204,"placed":181,"empty":23,"fillRate":88.7,"minScore":45.07657,"maxScore":68.0179,"programs":76},
  {"id":"OSYM-0118","period":"2025/2","branch":"İç Hastalıkları","quota":658,"placed":567,"empty":91,"fillRate":86.2,"minScore":45.0473,"maxScore":79.54527,"programs":123},
  {"id":"OSYM-0122","period":"2025/2","branch":"Anesteziyoloji ve Reanimasyon","quota":476,"placed":405,"empty":71,"fillRate":85.1,"minScore":45.02748,"maxScore":66.78571,"programs":118},
  {"id":"OSYM-0117","period":"2025/2","branch":"Çocuk Sağlığı ve Hastalıkları","quota":1024,"placed":593,"empty":431,"fillRate":57.9,"minScore":45.0154,"maxScore":76.40485,"programs":113},
  {"id":"OSYM-0119","period":"2025/2","branch":"Acil Tıp","quota":563,"placed":420,"empty":143,"fillRate":74.6,"minScore":45.00751,"maxScore":66.62288,"programs":125},
  {"id":"OSYM-0116","period":"2025/2","branch":"Aile Hekimliği","quota":2003,"placed":1480,"empty":523,"fillRate":73.9,"minScore":45.00366,"maxScore":73.60972,"programs":112},
  {"id":"OSYM-0121","period":"2025/2","branch":"Kadın Hastalıkları ve Doğum","quota":508,"placed":404,"empty":104,"fillRate":79.5,"minScore":45.00062,"maxScore":79.74254,"programs":123}
];
