// Captures the six README screens from the web build at iPhone size, in light and dark.
//
//   node scripts/readme-screenshots/capture.mjs <sample.apkg> <out dir> [base url]
//
// Base URL defaults to the live preview (the production build of master). Each theme runs in a
// fresh browser profile: (dark: Settings › Genel › Koyu › Kaydet), drop the sample package and
// import it, then deck list, study screen, Statistics, card browser and note editor. Playwright is
// not a project dependency: set PLAYWRIGHT_MODULE to a playwright package directory and, when its
// own browser is not installed, CHROME_PATH to a Chromium or headless-shell binary.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [apkg, outDir, base = 'https://tusankim.vercel.app'] = process.argv.slice(2);
if (!apkg || !outDir) throw new Error('usage: capture.mjs <sample.apkg> <out dir> [base url]');
fs.mkdirSync(outDir, { recursive: true });

// iPhone 17 Pro: 402×874 points. compose.mjs draws the status bar (54 pt) and the home-indicator
// strip (34 pt) that iOS keeps clear of content; the web build has no safe areas of its own.
const VIEWPORT = { width: 402, height: 874 - 54 - 34 };
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

async function capture(theme) {
    const context = await browser.newContext({
        viewport: VIEWPORT, deviceScaleFactor: 3, colorScheme: theme, locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const shot = (name) => page.screenshot({ path: path.join(outDir, `${theme}-${name}.png`) });
    const settle = (ms = 1200) => page.waitForTimeout(ms);
    // Animations off, so a screenshot never catches a sheet or a fade half way.
    const still = () => page.addStyleTag({ content: '*{animation-duration:1ms!important;transition-duration:1ms!important;caret-color:transparent!important}' });

    await page.goto(`${base}/decks`, { waitUntil: 'networkidle' });
    await settle(1500);
    if (theme === 'dark') {
        await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
        await page.getByLabel('Genel', { exact: true }).click();
        await page.getByRole('radio', { name: 'Koyu', exact: true }).click();
        await page.getByLabel('Ayarları kaydet').click();
        await settle();
        await page.goto(`${base}/decks`, { waitUntil: 'networkidle' });
        await settle(1500);
    }

    // Import: the web app opens /import for a package dropped onto the window.
    const b64 = fs.readFileSync(apkg).toString('base64');
    await page.evaluate(({ b64, name }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: 'application/octet-stream' }));
        for (const type of ['dragenter', 'dragover', 'drop']) {
            window.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
        }
    }, { b64, name: path.basename(apkg) });
    await page.waitForURL(/\/import/);
    await settle(1500);
    await page.getByRole('button', { name: 'İçe aktar', exact: true }).last().click();
    await page.getByText('İçe aktarma günlüğü').waitFor();
    await still();
    await settle();
    await shot('import');

    // Deck list with Temel Bilimler open.
    await page.goto(`${base}/decks`, { waitUntil: 'networkidle' });
    await still();
    await settle(1500);
    const expandTemel = page.getByLabel('Temel Bilimler destesini çalış').locator('xpath=..').getByLabel('Alt desteleri göster');
    if (await expandTemel.count()) await expandTemel.first().click();
    else await page.getByLabel('Alt desteleri göster').last().click();
    await settle();
    await shot('decks');

    // Study screen, answer side. A grade tapped right after revealing is ignored, so none is.
    await page.getByLabel('Farmakoloji destesini çalış').click();
    await page.getByText('Cevabı göster').waitFor();
    await settle(1500);
    await page.getByText('Cevabı göster').click();
    await settle(1500);
    await shot('study');

    // Statistics for the last month.
    await page.goto(`${base}/stats`, { waitUntil: 'networkidle' });
    await still();
    await settle(1500);
    await page.getByText('Ay', { exact: true }).click();
    await settle(1500);
    await shot('stats');

    // Card browser with a search, then the note editor for the digoxin card.
    await page.goto(`${base}/browser`, { waitUntil: 'networkidle' });
    await still();
    await settle(1500);
    const search = page.getByLabel('Kart ara veya deck:tag:is:…');
    await search.click();
    await search.fill('tag:farmakoloji -is:new');
    await search.press('Enter');
    await settle(1800);
    await shot('browser');

    const edit = await page.evaluateHandle(() => {
        const buttons = [...document.querySelectorAll('[aria-label="Kartı düzenle"]')];
        return buttons.find((b) => {
            let row = b.parentElement;
            while (row && row.querySelectorAll('[aria-label="Kartı düzenle"]').length === 1) {
                if (row.innerText.includes('Digoksin')) return true;
                row = row.parentElement;
            }
            return false;
        });
    });
    await edit.asElement().click();
    await page.waitForURL(/\/editor/);
    await still();
    await settle(3000);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await settle(500);
    await shot('editor');

    console.log(theme, errors.length ? `page errors: ${errors.join(' | ')}` : 'ok');
    await context.close();
}

for (const theme of ['light', 'dark']) await capture(theme);
await browser.close();
