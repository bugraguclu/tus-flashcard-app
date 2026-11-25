const urls = [
    // The addresses docs/app-store/metadata-tr.md gives App Store Connect.
    'https://tusankim.vercel.app/gizlilik/',
    'https://tusankim.vercel.app/destek/',
    'https://tusankim.vercel.app/kullanim-kosullari/',
];

const failures = [];
for (const url of urls) {
    try {
        const response = await fetch(url, {
            headers: { 'user-agent': 'TusAnkiM-App-Store-readiness-check' },
            signal: AbortSignal.timeout(15_000),
        });
        const body = await response.text();
        if (response.status !== 200) failures.push(`${url} returned HTTP ${response.status}`);
        else if (!body.includes('TusAnkiM')) failures.push(`${url} does not contain the expected TusAnkiM page`);
    } catch (error) {
        failures.push(`${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`);
    }
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

console.log('App Store privacy, support, and terms pages are publicly reachable.');
