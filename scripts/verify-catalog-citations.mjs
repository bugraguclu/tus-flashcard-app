import fs from 'node:fs';
import { extractReferenceUrls } from './referenceAudit.ts';

// Identity check only: article existence/title does not approve every medical claim in a card.
const directory = new URL('../docs/catalog-corrections/', import.meta.url);
const citations = { pubmed: new Set(), pmc: new Set() };
function collect(value, key = '') {
    if (key === 'before') return; // Preserve historical source text as evidence, never current endorsement.
    if (Array.isArray(value)) return value.forEach(item => collect(item));
    if (value && typeof value === 'object') {
        for (const [field, item] of Object.entries(value)) collect(item, field);
    } else if (typeof value === 'string') {
        for (const url of extractReferenceUrls(value)) {
            const pubmed = url.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)(?:\/|$)/);
            const pmc = url.match(/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC(\d+)(?:\/|$)/);
            if (pubmed) citations.pubmed.add(pubmed[1]);
            if (pmc) citations.pmc.add(pmc[1]);
        }
    }
}
for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
    collect(JSON.parse(fs.readFileSync(new URL(name, directory), 'utf8')));
}
const records = { pubmed: {}, pmc: {} };
const failures = [];
for (const database of ['pubmed', 'pmc']) {
    const ids = [...citations[database]];
    for (let start = 0; start < ids.length; start += 60) {
        const chunk = ids.slice(start, start + 60);
        const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
        url.search = new URLSearchParams({ db: database, retmode: 'json', id: chunk.join(',') }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (!response.ok) throw new Error(`NCBI ${database}: HTTP ${response.status}`);
        const data = await response.json();
        if (!data.result) throw new Error(`NCBI ${database}: ${JSON.stringify(data)}`);
        for (const id of chunk) {
            const record = data.result[id];
            if (!record || record.error || !(record.title || record.booktitle)) failures.push(`${database}:${id}: missing bibliographic record/title`);
            else records[database][id] = record;
        }
    }
    console.log(`${database}: ${ids.length} citation identities checked via NCBI ESummary.`);
}
const repairs = JSON.parse(fs.readFileSync(new URL('gemini-followup-sources.json', directory), 'utf8'));
const normalize = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
let matchedTitles = 0;
for (const repair of repairs.corrections) {
    const id = repair.replacementURL.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/)?.[1];
    if (!id) continue;
    const actual = records.pubmed[id]?.title;
    if (!actual || normalize(actual) !== normalize(repair.replacementTitle)) failures.push(`${id}: replacement title does not match NCBI`);
    else matchedTitles++;
}
console.log(`${matchedTitles} replacement citation titles matched. This checks identity, not full-text access or all card claims.`);
if (process.argv.includes('--json')) console.log(JSON.stringify({ records, failures }, null, 2));
if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
}
