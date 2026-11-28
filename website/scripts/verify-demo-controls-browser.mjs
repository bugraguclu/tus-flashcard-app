// Exercises the stripped-down demo navigation and displayed FSRS starting intervals.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const origin = process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:4321';
const output = process.env.DEMO_OUTPUT_DIR ?? path.resolve(fileURLToPath(new URL('../../output/demo-navigation-2026-11-28/', import.meta.url)));
await fs.mkdir(output, { recursive: true });
const results = [];
for (const engine of ['chromium', 'webkit']) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      for (const mode of ['home', 'tablet']) {
        console.log(`${engine} ${width}px ${mode}`);
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        const errors = []; page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin + (mode === 'home' ? '/' : '/kart-denemesi/'));
        const root = page.locator(mode === 'home' ? '[data-live-demo]' : '[data-demo-simulator]');
        const rootDeck = mode === 'home' ? 'tus-cards' : 'tus-deneme';
        await root.locator(`[data-demo-study="${rootDeck}"]`).waitFor();
        const dialog = root.locator('[data-demo-dialog]');
        const close = async () => { await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); };
        const menu = root.locator('[data-demo-menu]');
        const card = root.locator(mode === 'home' ? '[data-demo-body]' : '[data-demo-card-body]');
        assert.equal(await page.evaluate(() => scrollY), 0, 'Boot scrolled the page');
        assert.equal(await root.locator('.demo-dock, [data-demo-tool]').count(), 0, 'Removed toolbar is still mounted');
        assert.equal(await root.locator('[data-demo-screen=decks] [data-demo-menu]').count(), 0, 'Deck screen still has a hamburger');
        assert(await menu.isHidden());
        if (engine === 'chromium' && [390, 1440].includes(width)) await root.screenshot({ path: path.join(output, `${mode}-decks-${width}.png`) });
        await root.locator(`[data-demo-study="${rootDeck}"]`).click();
        assert(await menu.isVisible());
        await root.locator('[data-demo-reveal]').click();
        const answer = await card.textContent();
        if (mode === 'home') {
          assert.deepEqual(await root.locator('[data-demo-interval]').allTextContents(), ['<1dk', '<6dk', '<10dk', '8 gün']);
          const sizes = await root.locator('[data-demo-grade]').evaluateAll((nodes) => nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
          assert(sizes.every(({ w, h }) => w >= 44 && h >= 44), 'Grade controls became too small');
          assert.equal(await root.locator('.demo-navigation, .demo-source').count(), 0);
        }
        if (engine === 'chromium' && [390, 1440].includes(width)) await root.screenshot({ path: path.join(output, `${mode}-answer-${width}.png`) });
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true');
        assert(await dialog.getByRole('navigation', { name: 'Deneme desteleri' }).isVisible());
        assert.deepEqual((await dialog.locator('[data-demo-sidebar-action]').allTextContents()).map((text) => text.trim()), ['Desteler']);
        const viewportBox = await root.locator('.demo-viewport').boundingBox();
        const drawerBox = await dialog.boundingBox();
        assert(drawerBox.x >= viewportBox.x && drawerBox.y >= viewportBox.y && drawerBox.x + drawerBox.width <= viewportBox.x + viewportBox.width + 1 && drawerBox.y + drawerBox.height <= viewportBox.y + viewportBox.height + 1);
        await dialog.locator('[data-demo-dialog-close]').click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.matches('[data-demo-menu][aria-expanded=false]'));
        assert.equal(await card.textContent(), answer, 'Drawer dismissal changed the answer');
        await menu.click(); await close();
        await menu.click();
        const box = await root.locator('.demo-viewport').boundingBox();
        await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
        await dialog.waitFor({ state: 'hidden' });
        await root.locator('[data-demo-grade=good]').click();
        await root.locator(mode === 'home' ? '[data-home-undo]' : '[data-demo-undo]').click();
        await root.locator('[data-demo-reveal]').click();
        assert.equal(await card.textContent(), answer, 'Undo did not restore the card');
        await menu.click();
        await dialog.locator('[data-demo-sidebar-action=Desteler]').click();
        await dialog.waitFor({ state: 'hidden' });
        assert(await root.locator('[data-demo-screen=decks]').isVisible());
        assert.equal(await root.locator('.demo-dock, [data-demo-tool]').count(), 0, 'Returning to decks restored the toolbar');
        await root.locator(`[data-demo-study="${rootDeck}"]`).click();
        await root.locator('[data-demo-scope]').click();
        await dialog.getByRole('button', { name: 'Deste ara', exact: true }).click();
        await dialog.getByRole('searchbox', { name: 'Deste ara' }).fill('ZZZ-bulunmayan');
        assert(await dialog.getByText('Eşleşen deste bulunamadı.').isVisible());
        await page.keyboard.press('Escape');
        assert(await dialog.isVisible(), 'Search Back closed the picker');
        await dialog.getByRole('button', { name: 'Deste ara', exact: true }).click();
        await dialog.getByRole('searchbox', { name: 'Deste ara' }).fill('Farmakoloji');
        await dialog.getByRole('radio', { name: 'Farmakoloji', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await root.locator('[data-demo-deck-title]').textContent(), 'Farmakoloji');
        await menu.click();
        await dialog.getByRole('button', { name: 'Anatomi', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await root.locator('[data-demo-deck-title]').textContent(), 'Anatomi');
        await root.locator('[data-demo-scope]').click();
        await dialog.getByRole('button', { name: 'Yeni deste', exact: true }).click();
        await dialog.getByLabel('Deste adı').fill('Deneme destem');
        await dialog.getByRole('button', { name: 'Oluştur', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert((await root.locator('[data-demo-screen=study]').textContent()).includes('Bu destede henüz kart yok.'));
        await root.locator('[data-demo-back]').click();
        assert(await root.locator('[data-demo-study="personal-0"]').isVisible());
        const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth);
        assert(overflow <= 1, `${overflow}px page overflow`);
        assert.deepEqual(errors, []);
        await page.reload(); await root.locator(`[data-demo-study="${rootDeck}"]`).waitFor();
        assert.equal(await root.locator('[data-demo-study="personal-0"]').count(), 0);
        results.push({ engine, width, mode, overflow, pageErrors: errors });
        await page.close();
      }
    }
  } finally { await browser.close(); }
}
await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ scope: 'Built website demo only; no app scheduling or physical iPhone changes.', results }, null, 2) + '\n');
console.log(`${results.length} browser journeys passed; ${output}`);
