import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditUrls, extractReferenceUrls, validateSourceRegistry } from './referenceAudit.ts';
import { PRIVACY_URL, TERMS_URL, SUPPORT_URL } from '../lib/legalLinks.ts';

const registry = JSON.parse(fs.readFileSync(new URL('../docs/anki-reference-sources.json', import.meta.url), 'utf8'));
const failures = validateSourceRegistry(registry);
if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
const urls = registry.sources.flatMap(source => [
    source.url,
    ...source.useFor.flatMap(extractReferenceUrls),
]);
urls.push(PRIVACY_URL, TERMS_URL, SUPPORT_URL);
if (process.argv.includes('--manuals')) {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files = execFileSync('git', ['ls-files', '-z', '--', 'README.md', 'docs', 'lib', 'app', 'components', 'scripts'], { cwd: root, encoding: 'utf8' }).split('\0');
    for (const file of files) {
        if (!/\.(?:md|tsx?|mjs|json)$/.test(file)) continue;
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        urls.push(...extractReferenceUrls(text).filter(url => /^https:\/\/(?:docs\.ankiweb\.net|docs\.ankimobile\.net)\//.test(url)));
    }
}

const results = await auditUrls(urls);
for (const result of results) {
    if (result.error) failures.push(`${result.url}: ${result.error}`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ results, failures }, null, 2));
else {
    for (const failure of failures) console.error(`- ${failure}`);
    console.log(`${results.length - failures.length}/${results.length} reference URLs verified (HTTP 200, non-error content, exact fragments).`);
}
if (failures.length) process.exitCode = 1;
