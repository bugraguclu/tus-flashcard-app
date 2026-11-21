import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(WEBSITE_ROOT, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

/** Assemble a standards-compliant multi-size PNG-in-ICO binary buffer. */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (ICO)
  header.writeUInt16LE(frames.length, 4);

  const dirEntries = [];
  let offset = 6 + frames.length * 16;

  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...frames.map((f) => f.data)]);
}

async function optimizeLogos() {
  const srcPath = path.join(IMAGES_DIR, 'app-mark.png');
  const raw = fs.readFileSync(srcPath);

  // 1. Strip EXIF and recompress 1024x1024 master (used only in Organization/Brand JSON-LD logo)
  const cleanMaster = await sharp(raw)
    .ensureAlpha()
    .toColorspace('srgb')
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  fs.writeFileSync(srcPath, cleanMaster);

  // 2. 128x128 (2x retina for 32-56px UI) lightweight WebP + PNG fallback
  const webp128 = await sharp(cleanMaster)
    .resize(128, 128, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  fs.writeFileSync(path.join(IMAGES_DIR, 'app-mark-128.webp'), webp128);

  const png128 = await sharp(cleanMaster)
    .resize(128, 128, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toBuffer();
  fs.writeFileSync(path.join(IMAGES_DIR, 'app-mark-128.png'), png128);

  console.log(
    `[brand-assets] Logos: app-mark.png ${(cleanMaster.length / 1024).toFixed(1)} KB (EXIF-stripped), ` +
    `app-mark-128.webp ${(webp128.length / 1024).toFixed(1)} KB, ` +
    `app-mark-128.png ${(png128.length / 1024).toFixed(1)} KB`
  );

  return { cleanMaster, png128 };
}

async function generateFavicons(cleanMaster) {
  const svgPath = path.join(PUBLIC_DIR, 'favicon.svg');
  const svgBuf = fs.readFileSync(svgPath);

  // Render crisp RGBA favicons from brand vector favicon.svg
  const renderIcon = (size) =>
    sharp(svgBuf, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .toColorspace('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer();

  const [png16, png32, png48] = await Promise.all([renderIcon(16), renderIcon(32), renderIcon(48)]);
  const ico = buildIco([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
    { size: 48, data: png48 },
  ]);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), ico);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-32x32.png'), png32);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-48x48.png'), png48);

  // 180x180 opaque Apple Touch Icon from clean master brand mark
  const mark152 = await sharp(cleanMaster)
    .resize(152, 152, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .toBuffer();
  const appleIcon = await sharp({
    create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: mark152, gravity: 'center' }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColorspace('srgb')
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), appleIcon);

  // Remove stale grayscale favicon.png if present
  const staleFavicon = path.join(PUBLIC_DIR, 'favicon.png');
  if (fs.existsSync(staleFavicon)) fs.unlinkSync(staleFavicon);

  console.log(
    `[brand-assets] Favicons: favicon.ico ${(ico.length / 1024).toFixed(1)} KB, ` +
    `favicon-32x32.png ${(png32.length / 1024).toFixed(1)} KB, ` +
    `favicon-48x48.png ${(png48.length / 1024).toFixed(1)} KB, ` +
    `apple-touch-icon.png ${(appleIcon.length / 1024).toFixed(1)} KB`
  );
}

const OG_CARDS = [
  {
    file: 'og-home.png',
    kicker: 'TusAnkiM · tusankim.com',
    line1: '9.575 TUS kartıyla',
    line2: 'planlı tekrar.',
    subtitle: 'Anki uyumlu (.apkg/.colpkg) FSRS-6 · Son 6 TUS referans kaydı · Kronometre',
    pills: [
      { value: '521 / 1.195', label: 'Son 6 TUS çözüm desteği' },
      { value: '%92,7', label: 'Konu kapsamı (1.108/1.195)' },
      { value: '200 kart/gün ücretsiz', label: 'Tam erişim ₺50/ay · 7 gün iade' },
    ],
  },
  {
    file: 'og-referanslar.png',
    kicker: 'TusAnkiM · TUS Referansları',
    line1: '1.195 çıkmış TUS sorusu,',
    line2: 'ders ders referans cetveli.',
    subtitle: 'Son 6 TUS (2024/1–2026/2) · Doğrudan, Dolaylı ve Konu Kapsamı ayrı raporlanır',
    pills: [
      { value: '521 / 1.195', label: '%43,6 çözüm desteği' },
      { value: '1.108 / 1.195', label: '%92,7 konu kapsamı' },
      { value: '76 / 200 (%38,0)', label: '2026/2 sınav öncesi git a78ae1f' },
    ],
  },
  {
    file: 'og-puan-hesapla.png',
    kicker: 'TusAnkiM · TUS Puan Hesaplayıcı',
    line1: 'TUS puan ve hedef net',
    line2: 'hesaplayıcı.',
    subtitle: 'Temel (100) + Klinik (100) · 4 yanlış 1 doğru · Güncel %5 puan kesintisi kuralı',
    pills: [
      { value: '%70 / %30', label: 'Temel puan ağırlığı' },
      { value: '%50 / %50', label: 'Klinik puan ağırlığı' },
      { value: '%5 Kesinti', label: '45 barajı & hedef net hesabı' },
    ],
  },
  {
    file: 'og-yardim.png',
    kicker: 'TusAnkiM · Yardım Merkezi',
    line1: '21 Türkçe rehberle',
    line2: 'eksiksiz kullanım kılavuzu.',
    subtitle: 'Hızlı başlangıç, FSRS-6 ayarları, Anki (.apkg/.colpkg) aktarımı, Kronometre ve yedekleme',
    pills: [
      { value: '21 Rehber', label: '6 ana konu kategorisi' },
      { value: 'FSRS-6', label: 'Hedef hatırlama ve optimizasyon' },
      { value: '.apkg / .colpkg', label: 'Kayıpsız Anki uyumluluğu' },
    ],
  },
  {
    file: 'og-kurucu.png',
    kicker: 'TusAnkiM · Kurucumuz ve Standart',
    line1: 'Neden 30.000 değil,',
    line2: '9.575 TUS kartı?',
    subtitle: 'Bitirilebilir hacim, sınav öncesi sürüm kanıtı ve hekim editör doğrulama standardı',
    pills: [
      { value: '9.575 Kart', label: '160 günde tamamlanabilir hacim' },
      { value: 'Git a78ae1f', label: 'Sınav öncesi şeffaf doğrulama' },
      { value: 'Yerel Öncelikli', label: 'Çevrimdışı iPhone + Web' },
    ],
  },
  {
    file: 'og-sss.png',
    kicker: 'TusAnkiM · Sıkça Sorulan Sorular',
    line1: 'TusAnkiM hakkında',
    line2: 'sıkça sorulan sorular.',
    subtitle: 'Referans yöntemi, FSRS-6 tekrar mantığı, ücretsiz kullanım, iade ve Anki uyumu',
    pills: [
      { value: '16 Yanıt', label: '5 kategoride anlık arama' },
      { value: '7 Gün İade', label: 'Koşulsuz iade garantisi' },
      { value: 'iPhone + Web', label: 'Çevrimdışı yerel çalışma' },
    ],
  },
  {
    file: 'og-destek.png',
    kicker: 'TusAnkiM · Destek ve İletişim',
    line1: 'Destek, kart bildirimi',
    line2: 've kulüp programı.',
    subtitle: 'Kurulum, Anki aktarımı, FSRS-6 soruları ve tıp fakültesi kulüplerine ücretsiz erişim',
    pills: [
      { value: 'destek@tusankim.com', label: 'Doğrudan e-posta desteği' },
      { value: 'Tıp Kulüpleri', label: 'Ücretsiz tam erişim programı' },
      { value: 'Kart Bildirimi', label: 'Güncel kılavuz kontrolü' },
    ],
  },
];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadFontDataUri(filename) {
  const fontFile = path.join(WEBSITE_ROOT, 'node_modules/@fontsource/plus-jakarta-sans/files', filename);
  return `data:font/woff2;base64,${fs.readFileSync(fontFile).toString('base64')}`;
}

function buildOgHtml(card, markDataUri, fonts) {
  const pillsHtml = card.pills
    .map(
      (p) => `
      <div class="pill">
        <div class="pill-v">${escapeHtml(p.value)}</div>
        <div class="pill-l">${escapeHtml(p.label)}</div>
      </div>`
    )
    .join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: 'PJS'; font-weight: 400; src: url('${fonts.l400}') format('woff2'); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122; }
  @font-face { font-family: 'PJS'; font-weight: 400; src: url('${fonts.le400}') format('woff2'); unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF; }
  @font-face { font-family: 'PJS'; font-weight: 600; src: url('${fonts.l600}') format('woff2'); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122; }
  @font-face { font-family: 'PJS'; font-weight: 600; src: url('${fonts.le600}') format('woff2'); unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF; }
  @font-face { font-family: 'PJS'; font-weight: 700; src: url('${fonts.l700}') format('woff2'); unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122; }
  @font-face { font-family: 'PJS'; font-weight: 700; src: url('${fonts.le700}') format('woff2'); unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; background: #f3f6f6; font-family: 'PJS', -apple-system, sans-serif; color: #24292c; -webkit-font-smoothing: antialiased; }
  .frame { width: 1200px; height: 630px; padding: 48px; display: flex; }
  .card {
    position: relative;
    flex: 1;
    background: #ffffff;
    border: 2px solid #dde1e4;
    border-radius: 28px;
    padding: 48px 56px 46px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .accent { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: linear-gradient(90deg, #0e7469 0%, #14998a 65%, #a3430a 100%); }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 44px; height: 44px; border-radius: 10px; }
  .brand-text { font-size: 20px; font-weight: 700; color: #0e7469; letter-spacing: -0.01em; }
  .badge { font-size: 15px; font-weight: 600; color: #596166; background: #f3f6f6; border: 1px solid #dde1e4; padding: 8px 16px; border-radius: 999px; }
  .main { margin-top: 8px; }
  h1 { font-size: 54px; line-height: 1.12; font-weight: 700; letter-spacing: -0.03em; color: #1b2226; }
  .sub { margin-top: 20px; font-size: 22px; line-height: 1.45; font-weight: 400; color: #596166; max-width: 960px; }
  .pills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 24px; }
  .pill { background: #f8fafa; border: 1.5px solid #dde1e4; border-radius: 18px; padding: 18px 22px; }
  .pill-v { font-size: 24px; font-weight: 700; color: #0e7469; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pill-l { margin-top: 4px; font-size: 14px; font-weight: 600; color: #596166; }
</style>
</head>
<body>
  <div class="frame">
    <div class="card">
      <div class="accent"></div>
      <div class="top">
        <div class="brand">
          <img src="${markDataUri}" alt="" />
          <span class="brand-text">${escapeHtml(card.kicker)}</span>
        </div>
        <div class="badge">iPhone &amp; Web · FSRS-6</div>
      </div>
      <div class="main">
        <h1>${escapeHtml(card.line1)}<br />${escapeHtml(card.line2)}</h1>
        <p class="sub">${escapeHtml(card.subtitle)}</p>
      </div>
      <div class="pills">${pillsHtml}</div>
    </div>
  </div>
</body>
</html>`;
}

async function generateOgImages(png128) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('Chrome/Chromium binary not found for deterministic OG PNG generation.');
  }

  const fonts = {
    l400: loadFontDataUri('plus-jakarta-sans-latin-400-normal.woff2'),
    le400: loadFontDataUri('plus-jakarta-sans-latin-ext-400-normal.woff2'),
    l600: loadFontDataUri('plus-jakarta-sans-latin-600-normal.woff2'),
    le600: loadFontDataUri('plus-jakarta-sans-latin-ext-600-normal.woff2'),
    l700: loadFontDataUri('plus-jakarta-sans-latin-700-normal.woff2'),
    le700: loadFontDataUri('plus-jakarta-sans-latin-ext-700-normal.woff2'),
  };
  const markDataUri = `data:image/png;base64,${png128.toString('base64')}`;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tusankim-og-'));
  try {
    for (const card of OG_CARDS) {
      const htmlPath = path.join(tmpDir, `${card.file}.html`);
      const rawPngPath = path.join(tmpDir, card.file);
      fs.writeFileSync(htmlPath, buildOgHtml(card, markDataUri, fonts), 'utf8');

      execFileSync(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          '--window-size=1200,630',
          `--screenshot=${rawPngPath}`,
          `file://${htmlPath}`,
        ],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      );

      const optimized = await sharp(rawPngPath)
        .resize(1200, 630)
        .toColorspace('srgb')
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();

      fs.writeFileSync(path.join(IMAGES_DIR, card.file), optimized);
      console.log(`[brand-assets] OG: ${card.file} (${(optimized.length / 1024).toFixed(1)} KB, 1200x630 PNG)`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Remove old SVG OG image
  const staleOg = path.join(IMAGES_DIR, 'og.svg');
  if (fs.existsSync(staleOg)) fs.unlinkSync(staleOg);
}

async function main() {
  const { cleanMaster, png128 } = await optimizeLogos();
  await generateFavicons(cleanMaster);
  await generateOgImages(png128);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
