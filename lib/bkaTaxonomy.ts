/** Deterministic TUS taxonomy used to turn the source's flat course decks into subdecks. */

export interface BkaTopicRule {
    name: string;
    /** Source Anki tags, normalized before matching. */
    tags?: string[];
    /** Medical terms expected in the note fields; the highest scoring topic wins. */
    keywords?: string[];
}

const rule = (name: string, keywords: string[] = [], tags: string[] = []): BkaTopicRule => ({ name, keywords, tags });

export const BKA_TOPIC_TAXONOMY: Record<string, BkaTopicRule[]> = {
    'Deneme ve Soru BKA': [
        rule('Deneme 1', [], ['1']), rule('Deneme 2', [], ['2']), rule('Deneme 3', [], ['3']),
        rule('Deneme 4', [], ['4']), rule('Karma Sorular', ['deneme', 'soru'], ['deneme']),
    ],
    'Anatomi BKA': [
        rule('Baş ve Boyun', ['baş', 'boyun', 'kranial', 'kafa', 'yüz', 'orbita', 'farenks', 'larenks', 'tiroid', 'carotis']),
        rule('Nöroanatomi', ['beyin', 'serebr', 'cerebr', 'medulla spinalis', 'omurilik', 'sinir sistemi', 'ventrikül', 'talamus', 'hipotalamus', 'ganglion']),
        rule('Toraks', ['toraks', 'thorax', 'kalp', 'akciğer', 'mediasten', 'mediastinum', 'plevra', 'perikard', 'sternum']),
        rule('Abdomen', ['abdomen', 'karın', 'mide', 'duodenum', 'jejunum', 'ileum', 'karaciğer', 'dalak', 'pankreas', 'portal']),
        rule('Pelvis ve Perine', ['pelvis', 'perine', 'mesane', 'uterus', 'over', 'prostat', 'rektum', 'inguinal', 'skrotum', 'testis']),
        rule('Üst Ekstremite', ['üst ekstremite', 'omuz', 'kol', 'dirsek', 'önkol', 'el bileği', 'radius', 'ulna', 'humerus', 'brachial']),
        rule('Alt Ekstremite', ['alt ekstremite', 'kalça', 'uyluk', 'diz', 'bacak', 'ayak bileği', 'femur', 'tibia', 'fibula', 'siyatik']),
        rule('Sırt ve Vertebral Kolon', ['vertebra', 'omurga', 'sırt', 'spinal', 'intervertebral', 'sakrum']),
        rule('Genel Anatomi', ['eklem', 'kemik', 'kas', 'fasya', 'arter', 'ven', 'lenf', 'sinir']),
    ],
    'FHE BKA': [
        rule('Hücre ve Doku Fizyolojisi', ['hücre', 'membran', 'aksiyon potansiyeli', 'transport', 'difüzyon', 'epitel', 'bağ dokusu']),
        rule('Kardiyovasküler Sistem', ['kalp', 'kardiyak', 'dolaşım', 'kan basıncı', 'debi', 'ekg', 'damar']),
        rule('Solunum Sistemi', ['solunum', 'akciğer', 'ventilasyon', 'oksijen', 'karbondioksit', 'spirometri']),
        rule('Böbrek ve Asit-Baz', ['böbrek', 'renal', 'nefron', 'glomerül', 'asit baz', 'idrar', 'klirens']),
        rule('Gastrointestinal Sistem', ['gastrointestinal', 'mide', 'bağırsak', 'sindirim', 'safra', 'pankreas']),
        rule('Endokrin ve Üreme', ['hormon', 'hipofiz', 'tiroid', 'adrenal', 'üreme', 'ovulasyon', 'menstrü']),
        rule('Sinir Sistemi', ['nöron', 'sinaps', 'refleks', 'duyu', 'motor', 'otonom sinir', 'beyin']),
        rule('Kas Fizyolojisi', ['kasılma', 'sarkomer', 'iskelet kası', 'düz kas', 'aktin', 'miyozin']),
        rule('Kan ve Bağışıklık', ['eritrosit', 'lökosit', 'hemoglobin', 'koagülasyon', 'immün', 'bağışıklık']),
        rule('Embriyoloji', ['embriyo', 'fetus', 'gastrulasyon', 'nöral tüp', 'germ yaprağı', 'organogenez']),
        rule('Histoloji', ['histoloji', 'mikroskop', 'epitel', 'bez', 'doku']),
    ],
    'Biyokimya BKA': [
        rule('Protein ve Amino Asitler', ['protein', 'amino asit', 'üre döngüsü', 'peptid'], ['protein', 'asit']),
        rule('Karbonhidrat Metabolizması', ['karbonhidrat', 'glukoz', 'glikoliz', 'glikojen', 'pentoz', 'krebs'], ['kh']),
        rule('Lipit Metabolizması', ['lipit', 'lipid', 'yağ asidi', 'kolesterol', 'keton', 'lipoprotein'], ['lipidler']),
        rule('Nükleik Asit ve Genetik', ['dna', 'rna', 'pürin', 'pirimidin', 'replikasyon', 'transkripsiyon', 'translasyon'], ['dna/rna', 'nükleik']),
        rule('Enzimler', ['enzim', 'kinetik', 'michaelis', 'inhibisyon', 'kofaktör']),
        rule('Vitamin ve Mineraller', ['vitamin', 'mineral', 'eser element', 'tiamin', 'riboflavin', 'niasin'], ['vit.']),
        rule('Hormon ve Sinyal İletimi', ['hormon', 'reseptör', 'ikinci haberci', 'camp', 'g protein'], ['hormon']),
        rule('Genel Biyokimya', ['metabolizma', 'enerji', 'atp', 'oksidasyon']),
    ],
    'Mikrobiyoloji BKA': [
        rule('Bakteriyoloji', ['bakteri', 'gram', 'stafilokok', 'streptokok', 'enterobakter', 'mikobakter'], ['bakteri']),
        rule('Viroloji', ['virüs', 'virus', 'viral', 'retrovir', 'hepatit', 'herpes'], ['virüs']),
        rule('Mikoloji', ['mantar', 'fungus', 'candida', 'aspergillus', 'kriptokok'], ['mantar']),
        rule('Parazitoloji', ['parazit', 'protozoon', 'helmint', 'plasmodium', 'toksoplazma'], ['parazit']),
        rule('İmmünoloji', ['immün', 'antikor', 'antijen', 'kompleman', 'hipersensitivite', 'sitokin'], ['immünoloji']),
        rule('Genel Mikrobiyoloji', ['mikro', 'sterilizasyon', 'dezenfeksiyon', 'kültür', 'boyama'], ['genel', 'mikro']),
    ],
    'Patoloji BKA': [
        rule('Hücre Hasarı ve Adaptasyon', ['hücre hasarı', 'nekroz', 'apoptoz', 'atrofi', 'hipertrofi', 'metaplazi']),
        rule('İnflamasyon ve İyileşme', ['inflamasyon', 'enflamasyon', 'iyileşme', 'granülom', 'sitokin', 'ödem']),
        rule('Hemodinamik Bozukluklar', ['tromboz', 'emboli', 'infarkt', 'şok', 'hiperemi', 'kanama']),
        rule('Neoplazi', ['neoplazi', 'tümör', 'kanser', 'karsinom', 'sarkom', 'metastaz', 'onkogen']),
        rule('İmmünopatoloji', ['otoimmün', 'immün yetmezlik', 'hipersensitivite', 'amiloid']),
        rule('Hematopatoloji', ['lösemi', 'lenfoma', 'anemi', 'kemik iliği', 'miyelom']),
        rule('Kardiyovasküler Patoloji', ['ateroskleroz', 'miyokard', 'kalp', 'vaskülit', 'anevrizma']),
        rule('Solunum Patolojisi', ['akciğer', 'bronş', 'pnömoni', 'koah', 'astım', 'plevra']),
        rule('Gastrointestinal ve Hepatobilier', ['mide', 'bağırsak', 'kolon', 'karaciğer', 'safra', 'pankreas']),
        rule('Böbrek ve Üriner Sistem', ['böbrek', 'glomerül', 'nefrit', 'renal', 'mesane']),
        rule('Endokrin ve Üreme Patolojisi', ['tiroid', 'hipofiz', 'adrenal', 'meme', 'uterus', 'over', 'prostat', 'testis']),
        rule('Sinir Sistemi Patolojisi', ['beyin', 'nöro', 'menenjit', 'gliom', 'demiyelinizasyon']),
    ],
    'Farmakoloji BKA': [
        rule('Genel Farmakoloji', ['farmakokinetik', 'farmakodinamik', 'biyoyararlanım', 'yarı ömür', 'reseptör', 'agonist', 'antagonist']),
        rule('Otonom Sinir Sistemi', ['kolinerjik', 'adrenerjik', 'sempatik', 'parasempatik', 'asetilkolin', 'atropin']),
        rule('Kardiyovasküler İlaçlar', ['antihipertansif', 'antiaritmik', 'kalp yetmezliği', 'diüretik', 'beta bloker', 'ace inhibitörü']),
        rule('Santral Sinir Sistemi', ['antidepresan', 'antipsikotik', 'antiepileptik', 'anestezik', 'opioid', 'benzodiazepin']),
        rule('Antibakteriyel İlaçlar', ['antibiyotik', 'penisilin', 'sefalosporin', 'makrolid', 'aminoglikozid', 'kinolon']),
        rule('Antiviral, Antifungal ve Antiparaziter', ['antiviral', 'antifungal', 'antimalaryal', 'antiparaziter', 'asiklovir', 'amfoterisin']),
        rule('Endokrin İlaçlar', ['insülin', 'antidiyabetik', 'kortikosteroid', 'tiroid ilacı', 'östrojen', 'kontraseptif']),
        rule('Antineoplastik ve İmmünomodülatör', ['kemoterapi', 'antineoplastik', 'immünsüpres', 'monoklonal', 'sitotoksik']),
        rule('Gastrointestinal ve Solunum', ['proton pompa', 'antiemetik', 'laksatif', 'bronkodilatör', 'antihistaminik']),
        rule('Ağrı ve İnflamasyon', ['nsaid', 'analjezik', 'parasetamol', 'aspirin', 'antiinflamatuvar']),
    ],
    'Dahiliye BKA': [
        rule('Kardiyoloji', ['kalp', 'kardiyo', 'ekg', 'aritmi', 'hipertansiyon', 'koroner'], ['kardiyo']),
        rule('Göğüs Hastalıkları', ['akciğer', 'solunum', 'koah', 'astım', 'pnömoni', 'tüberküloz'], ['göğüs']),
        rule('Gastroenteroloji ve Hepatoloji', ['mide', 'bağırsak', 'karaciğer', 'hepatit', 'siroz', 'pankreas'], ['hepato']),
        rule('Nefroloji', ['böbrek', 'renal', 'nefro', 'glomerül', 'diyaliz', 'elektrolit'], ['nefro']),
        rule('Endokrinoloji', ['diyabet', 'tiroid', 'hipofiz', 'adrenal', 'endokrin', 'osteoporoz'], ['endokrin']),
        rule('Hematoloji', ['anemi', 'lösemi', 'lenfoma', 'koagülasyon', 'trombosit', 'hematoloji'], ['hemato']),
        rule('Romatoloji', ['romato', 'artrit', 'lupus', 'vaskülit', 'skleroderma', 'gut'], ['romato']),
        rule('Onkoloji', ['kanser', 'tümör', 'kemoterapi', 'paraneoplastik', 'onkoloji'], ['onko']),
        rule('Enfeksiyon Hastalıkları', ['enfeksiyon', 'ateş', 'sepsis', 'hiv', 'antibiyotik']),
    ],
    'Pediatri BKA': [
        rule('Yenidoğan', ['yenidoğan', 'prematüre', 'neonatal', 'apgar'], ['yenidoğan']),
        rule('Büyüme ve Gelişme', ['büyüme', 'gelişme', 'persentil', 'puberte'], ['gelişme']),
        rule('Beslenme ve Vitaminler', ['beslenme', 'anne sütü', 'malnütrisyon', 'vitamin'], ['beslenme']),
        rule('Aşılar', ['aşı', 'immünizasyon'], ['aşı']),
        rule('Çocuk Enfeksiyonları ve Döküntü', ['enfeksiyon', 'ateş', 'döküntü', 'kızamık', 'suçiçeği'], ['döküntü']),
        rule('Alerji ve İmmünoloji', ['alerji', 'immün', 'anafilaksi', 'atopi'], ['allerji', 'immünoloji']),
        rule('Kardiyoloji', ['kalp', 'kardiyo', 'üfürüm', 'siyanotik'], ['kardiyo']),
        rule('Göğüs Hastalıkları', ['akciğer', 'solunum', 'astım', 'bronşiolit'], ['göğüs']),
        rule('Gastroenteroloji', ['gastro', 'ishal', 'kusma', 'karaciğer', 'malabsorpsiyon'], ['gastro']),
        rule('Nefroloji', ['böbrek', 'nefro', 'idrar', 'glomerül'], ['nefro']),
        rule('Endokrinoloji ve Metabolizma', ['endokrin', 'diyabet', 'tiroid', 'metabolizma'], ['endokrin', 'metabolizma']),
        rule('Hematoloji ve Onkoloji', ['anemi', 'lösemi', 'hemato', 'onkoloji'], ['hemato', 'onko']),
        rule('Nöroloji ve Genetik', ['nöro', 'konvülziyon', 'epilepsi', 'genetik', 'sendrom'], ['nöro', 'genetik']),
        rule('Romatoloji', ['romato', 'artrit', 'vaskülit'], ['romato']),
    ],
    'Genel Cerrahi BKA': [
        rule('Cerrahi İlkeler ve Yara', ['cerrahi', 'yara', 'sütür', 'preoperatif', 'postoperatif']),
        rule('Travma ve Şok', ['travma', 'şok', 'yanık', 'kanama']),
        rule('Sıvı, Elektrolit ve Beslenme', ['sıvı', 'elektrolit', 'beslenme', 'parenteral', 'enteral']),
        rule('Cerrahi Enfeksiyonlar', ['enfeksiyon', 'apse', 'sepsis', 'antibiyotik']),
        rule('Meme', ['meme', 'duktal', 'lobüler'], ['meme']),
        rule('Tiroid ve Paratiroid', ['tiroid', 'paratiroid', 'hiperkalsemi'], ['tiroit']),
        rule('Özofagus ve Mide', ['özofagus', 'mide', 'reflü', 'peptik']),
        rule('Hepatobilier, Pankreas ve Dalak', ['karaciğer', 'safra', 'pankreas', 'dalak', 'portal']),
        rule('İnce Bağırsak ve Kolorektal', ['ince bağırsak', 'kolon', 'rektum', 'apandisit', 'ileus']),
        rule('Fıtık ve Karın Duvarı', ['fıtık', 'hern', 'inguinal', 'karın duvarı']),
    ],
    'Küçük Stajlar BKA': [
        rule('Dermatoloji', ['dermat', 'cilt', 'deri', 'lezyon'], ['derma']),
        rule('Nöroloji', ['nöro', 'inme', 'epilepsi', 'baş ağrısı'], ['nöroloji']),
        rule('Psikiyatri', ['psikiyatri', 'depresyon', 'psikoz', 'anksiyete'], ['psikiyatri']),
        rule('Kulak Burun Boğaz', ['kbb', 'kulak', 'burun', 'sinüs', 'larenks'], ['kbb']),
        rule('Göz Hastalıkları', ['göz', 'retina', 'kornea', 'glokom'], ['göz']),
        rule('Ortopedi ve Travmatoloji', ['ortopedi', 'kırık', 'çıkık', 'tendon'], ['ortopedi']),
        rule('Üroloji', ['üroloji', 'prostat', 'mesane', 'testis'], ['üroloji']),
        rule('Anesteziyoloji', ['anestezi', 'entübasyon', 'hava yolu'], ['anestezi']),
        rule('Fizik Tedavi ve Rehabilitasyon', ['rehabilitasyon', 'ftr', 'egzersiz'], ['ftr']),
        rule('Kalp ve Damar Cerrahisi', ['kalp damar', 'vasküler', 'anevrizma'], ['kalp-damar']),
        rule('Beyin ve Sinir Cerrahisi', ['beyin cerrahi', 'kafa travması', 'intrakraniyal'], ['beyin']),
        rule('Halk Sağlığı ve Radyoloji', ['halk sağlığı', 'epidemiyoloji', 'radyoloji', 'tomografi', 'mr'], ['halk', 'sağlığı', 'radyoloji']),
    ],
    'Kadın Doğum BKA': [
        rule('Jinekolojik Onkoloji', ['serviks kanseri', 'over kanseri', 'endometrium kanseri', 'jinekolojik onkoloji'], ['onko']),
        rule('Obstetri Temelleri ve Antenatal İzlem', ['gebelik', 'antenatal', 'plasenta', 'fetus'], ['obstetri']),
        rule('Doğum ve Puerperium', ['doğum', 'eylem', 'servikal açıklık', 'puerperium', 'lohusa']),
        rule('Gebelik Komplikasyonları', ['preeklampsi', 'eklampsi', 'gestasyonel', 'erken doğum', 'abortus']),
        rule('Jinekoloji', ['jinekoloji', 'uterus', 'over', 'vajen', 'pelvik'], ['jineko']),
        rule('Üreme Endokrinolojisi ve İnfertilite', ['infertilite', 'ovulasyon', 'amenore', 'polikistik', 'hormon']),
        rule('Kontrasepsiyon', ['kontrasepsiyon', 'kontraseptif', 'rahim içi araç', 'doğum kontrol'], ['kontrasep']),
        rule('Menopoz ve Pelvik Taban', ['menopoz', 'inkontinans', 'prolapsus', 'pelvik taban'], ['menopoz']),
    ],
};

export const BKA_TOTAL_SUBDECKS = Object.values(BKA_TOPIC_TAXONOMY)
    .reduce((total, topics) => total + topics.length, 0);

function normalize(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .toLocaleLowerCase('tr-TR')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getBkaTopicNames(rootDeckName: string): string[] {
    return (BKA_TOPIC_TAXONOMY[rootDeckName] ?? [rule('Genel ve Karma')]).map((entry) => entry.name);
}

/** Highest-confidence source tag wins, followed by keyword score and taxonomy order. */
export function classifyBkaTopic(rootDeckName: string, fields: string[], tags: string[]): string {
    const rules = BKA_TOPIC_TAXONOMY[rootDeckName] ?? [rule('Genel ve Karma')];
    const normalizedTags = tags.map(normalize);
    const text = normalize(fields.join(' '));
    let best = rules[rules.length - 1];
    let bestScore = 0;

    for (const candidate of rules) {
        const tagScore = (candidate.tags ?? []).reduce((sum, tag) => {
            const expected = normalize(tag);
            return sum + (normalizedTags.some((actual) => actual === expected || actual.includes(expected)) ? 100 : 0);
        }, 0);
        const keywordScore = (candidate.keywords ?? []).reduce((sum, keyword) => (
            sum + (text.includes(normalize(keyword)) ? Math.max(1, normalize(keyword).split(' ').length) : 0)
        ), 0);
        const score = tagScore + keywordScore;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best.name;
}
