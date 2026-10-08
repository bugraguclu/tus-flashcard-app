import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLegalIdentityPlaceholders } from './legal-identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pageNames = ['index.html', 'privacy.html', 'support.html', 'terms.html'];
const pages = pageNames.map((name) => ({
    name,
    content: fs.readFileSync(path.join(root, 'docs', name), 'utf8'),
}));
const metadata = fs.readFileSync(path.join(root, 'docs/app-store/metadata-tr.md'), 'utf8');

function report(ready, message) {
    const line = `Legal pages ${ready ? 'ready' : 'skipped'}: ${message}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
    }
}

if (hasLegalIdentityPlaceholders(pages.map((page) => page.content).join('\n') + metadata)) {
    report(false, 'publisher, address, or contact fields still need real values. App Store release verification remains required.');
} else {
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required to check Pages configuration');
    const response = await fetch(`https://api.github.com/repos/${repository}/pages`, {
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) {
        report(false, 'GitHub Pages is not enabled for this repository. Select GitHub Actions as the Pages source.');
    } else if (!response.ok) {
        throw new Error(`GitHub Pages configuration check failed: HTTP ${response.status}`);
    } else {
        const config = await response.json();
        if (config.build_type !== 'workflow') {
            report(false, 'GitHub Pages source must be GitHub Actions.');
        } else {
            const output = path.join(root, 'legal-pages');
            fs.mkdirSync(output, { recursive: true });
            for (const page of pages) fs.writeFileSync(path.join(output, page.name), page.content);
            report(true, 'legal identity and GitHub Pages configuration are complete.');
        }
    }
}
