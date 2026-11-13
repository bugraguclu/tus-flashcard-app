// Frames the captured screens three to an image, as the README shows them: 1800×1224 transparent
// PNGs with iPhone bezels, a 09:41 status bar over the app's own header colour and a home bar.
//
//   node scripts/readme-screenshots/compose.mjs <raw dir> <out dir>
//
// Reads <theme>-<screen>.png from capture.mjs and writes decks-study-stats-<theme>.png and
// browser-editor-import-<theme>.png. Same PLAYWRIGHT_MODULE / CHROME_PATH as capture.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [rawDir, outDir] = process.argv.slice(2);
if (!rawDir || !outDir) throw new Error('usage: compose.mjs <raw dir> <out dir>');

const IMAGES = {
    'decks-study-stats': ['decks', 'study', 'stats'],
    'browser-editor-import': ['browser', 'editor', 'import'],
};

// One phone in CSS px (the page renders at 2x). The screen keeps the 402×874 pt iPhone shape.
const SCREEN_W = 245;
const PT = SCREEN_W / 402;
const SCREEN_H = 874 * PT;
const STATUS_H = 54 * PT;
const HOME_H = 34 * PT;
const BEZEL = 8;

const statusIcons = (ink) => `
<svg width="${17 * PT * 1.35}" height="${11 * PT * 1.35}" viewBox="0 0 17 11" fill="${ink}" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="0.8"/><rect x="4.6" y="5" width="3" height="6" rx="0.8"/><rect x="9.2" y="2.6" width="3" height="8.4" rx="0.8"/><rect x="13.8" y="0" width="3" height="11" rx="0.8"/></svg>
<svg width="${16 * PT * 1.35}" height="${11 * PT * 1.35}" viewBox="0 0 16 11.5" fill="${ink}" aria-hidden="true"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.2A10.1 10.1 0 0 0 8 .6 10.1 10.1 0 0 0 .8 3.5L2 4.7a8.4 8.4 0 0 1 6-2.4Zm0 3.4c1.4 0 2.6.5 3.6 1.4l1.2-1.2A6.8 6.8 0 0 0 8 4a6.8 6.8 0 0 0-4.8 1.9l1.2 1.2c1-.9 2.2-1.4 3.6-1.4Zm0 3.3c.5 0 1 .2 1.3.5L8 10.8 6.7 9.5c.3-.3.8-.5 1.3-.5Z"/></svg>
<svg width="${27 * PT * 1.35}" height="${13 * PT * 1.35}" viewBox="0 0 27 13" aria-hidden="true"><rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="${ink}" stroke-opacity="0.4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="${ink}"/><path d="M25 4.4v4.2a2.2 2.2 0 0 0 0-4.2Z" fill="${ink}" fill-opacity="0.45"/></svg>`;

function phone(shot) {
    return `<div class="phone">
  <div class="screen" style="background:${shot.top}">
    <div class="status" style="height:${STATUS_H}px;color:${shot.ink}">
      <span class="time">09:41</span><span class="island"></span><span class="icons">${statusIcons(shot.ink)}</span>
    </div>
    <img src="${shot.src}" alt="" style="top:${STATUS_H}px;height:${SCREEN_H - STATUS_H - HOME_H}px">
    <div class="homezone" style="height:${HOME_H}px;background:${shot.bottom}"><span class="home" style="background:${shot.homeInk}"></span></div>
  </div>
</div>`;
}

function page(shots) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: transparent; }
body { width: 900px; height: 612px; display: flex; align-items: center; justify-content: space-evenly; font-family: -apple-system, "SF Pro Text", system-ui, sans-serif; }
.phone { position: relative; padding: ${BEZEL}px; border-radius: ${44 * PT + BEZEL}px; background: #0b0b0c;
  box-shadow: 0 0 0 1.5px #5b5c60, 0 0 0 2.5px #1d1d1f, 0 18px 40px -12px rgba(0,0,0,.45); }
.screen { position: relative; width: ${SCREEN_W}px; height: ${SCREEN_H}px; border-radius: ${44 * PT}px; overflow: hidden; }
.screen img { position: absolute; left: 0; width: 100%; display: block; }
.homezone { position: absolute; left: 0; right: 0; bottom: 0; }
.status { position: absolute; inset: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 ${26 * PT}px 0 ${34 * PT}px; z-index: 2; }
.time { font-weight: 600; font-size: ${17 * PT}px; letter-spacing: -0.2px; width: ${70 * PT}px; text-align: center; }
.icons { display: flex; align-items: center; gap: ${6 * PT}px; }
.island { position: absolute; left: 50%; top: ${11 * PT}px; width: ${126 * PT}px; height: ${37 * PT}px; margin-left: ${-63 * PT}px; border-radius: 999px; background: #000; }
.home { position: absolute; left: 50%; bottom: ${8 * PT}px; width: ${139 * PT}px; height: ${5 * PT}px; margin-left: ${-69.5 * PT}px; border-radius: 99px; z-index: 2; }
</style></head><body>${shots.map(phone).join('')}</body></html>`;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const context = await browser.newContext({ viewport: { width: 900, height: 612 }, deviceScaleFactor: 2 });
const probe = await context.newPage();

// The status bar takes the colour of the app's first pixel row and the home strip that of the
// page edge at the bottom (lists scroll under it on iOS), each with dark or light ink to match.
async function describe(file) {
    const src = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    const colours = await probe.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const g = canvas.getContext('2d');
        g.drawImage(img, 0, 0);
        const at = (x, y) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)];
        return { top: at(Math.round(img.width * 0.5), 2), bottom: at(2, img.height - 2) };
    }, src);
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return {
        src,
        top: `rgb(${colours.top.join(',')})`,
        bottom: `rgb(${colours.bottom.join(',')})`,
        ink: lum(colours.top) > 140 ? '#000' : '#fff',
        homeInk: lum(colours.bottom) > 140 ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.85)',
    };
}

fs.mkdirSync(outDir, { recursive: true });
for (const theme of ['light', 'dark']) {
    for (const [name, screens] of Object.entries(IMAGES)) {
        const shots = [];
        for (const s of screens) shots.push(await describe(path.join(rawDir, `${theme}-${s}.png`)));
        const p = await context.newPage();
        await p.setContent(page(shots), { waitUntil: 'load' });
        const out = path.join(outDir, `${name}-${theme}.png`);
        await p.screenshot({ path: out, omitBackground: true });
        await p.close();
        console.log(out);
    }
}
await browser.close();
