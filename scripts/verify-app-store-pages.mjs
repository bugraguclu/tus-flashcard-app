import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../lib/legalLinks.ts';
import { inspectDocument } from './referenceAudit.ts';

const pages = [
    { url: PRIVACY_URL, title: 'Gizlilik Politikası' },
    { url: SUPPORT_URL, title: 'Destek ve İletişim' },
    { url: TERMS_URL, title: 'Kullanım Koşulları' },
];

const failures = [];
for (const { url, title } of pages) {
    try {
        const response = await fetch(url, {
            headers: { 'user-agent': 'TusAnkiM-App-Store-readiness-check' },
            signal: AbortSignal.timeout(15_000),
        });
        const body = await response.text();
        if (response.status !== 200) failures.push(`${url} returned HTTP ${response.status}`);
        else if (!body.includes('TusAnkiM') || !inspectDocument(body).title.includes(title)) failures.push(`${url} does not contain the expected TusAnkiM page`);
    } catch (error) {
        failures.push(`${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`);
    }
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

console.log('App Store privacy, support, and terms pages are publicly reachable.');
