// Integration evidence for the exact built demo payload, not a medical fact-check.
// Uses an existing Playwright install; optionally set PLAYWRIGHT_MODULE_PATH.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const website = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(website, 'dist');
const target = path.resolve(process.argv[2] ?? path.join(website, '../docs/claims/browser-demo-payload-verification.json'));
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const raw = {};
for (const name of ['demo-cards.json', 'demo-decks.json']) raw[name] = await fs.readFile(path.join(dist, 'data', name), 'utf8');
const home = JSON.parse(raw['demo-cards.json']);
const tablet = JSON.parse(raw['demo-decks.json']);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    let rel = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(dist, '.' + rel);
    assert(file.startsWith(dist + path.sep));
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const startedAt = new Date().toISOString();
const cardText = (card) => card.parts.map((p) => p.type === 'cloze' ? p.answer : p.value).join('');

try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await playwright[engine].launch({ headless: true });
    try {
      for (const width of [320, 390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const checks = [];
        for (const mode of ['home', 'tablet']) {
          await page.goto(origin + (mode === 'home' ? '/' : '/kart-denemesi/'));
          const root = page.locator(mode === 'home' ? '[data-live-demo]' : '[data-demo-simulator]');
          const cards = mode === 'home' ? home : tablet.cards;
          if (mode === 'home') { await root.locator('[data-demo-study="tus-cards"]').click(); }
          else await root.locator('[data-demo-study="tus-deneme"]').click();
          for (let index = 0; index < cards.length; index++) {
            const card = cards[index];
            const reveal = root.locator('[data-demo-reveal]');
            await reveal.click();
            const body = root.locator(mode === 'home' ? '[data-demo-body]' : '[data-demo-card-body]');
            assert.equal(await body.textContent(), cardText(card), `${engine}/${width}/${mode}/${card.qid}: body`);
            if (card.extra) {
              const extra = root.locator('[data-demo-extra]');
              assert(await extra.isVisible(), `${card.qid}: hidden Extra`);
              assert.equal(await extra.textContent(), card.extra, `${card.qid}: Extra`);
            }
            const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
            assert(overflow <= 1, `${card.qid}: ${overflow}px horizontal overflow`);
            checks.push({ mode, qid: card.qid, bodySha256: sha(cardText(card)), extraSha256: sha(card.extra), editorialCorrection: Boolean(card.editorialCorrection), overflowPx: overflow });
            await root.locator('[data-demo-grade="good"]').click();
          }
          if (mode === 'tablet') assert(await root.locator('[data-demo-complete-stage]').isVisible(), 'Deck did not complete');
        }
        assert.deepEqual(errors, []);
        results.push({ engine, width, checks, pageErrors: errors });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  for (const name of Object.keys(raw)) assert.equal(await fs.readFile(path.join(dist, 'data', name), 'utf8'), raw[name], 'Build changed during verification');
  const report = { startedAt, finishedAt: new Date().toISOString(), scope: `Actual reveal/grade flows: all ${home.length} home and ${tablet.cards.length} tablet cards, two browser engines and three widths. Payload fidelity and page overflow only; no physical iPhone, clinical correctness or independent physician signoff.`, scriptSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))), generatedDataSha256: Object.fromEntries(Object.entries(raw).map(([name, content]) => [name, sha(content)])), results };
  await fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
  console.log(`${results.reduce((n, r) => n + r.checks.length, 0)} rendered card checks passed; ${target}`);
} finally { await new Promise((resolve) => server.close(resolve)); }
