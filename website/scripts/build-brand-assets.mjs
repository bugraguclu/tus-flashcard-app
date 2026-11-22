import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getHelpArticles } from '../src/lib/helpDocs.ts';

// Technical derivatives of the existing brand assets; no generated imagery.
const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const mark = await fs.readFile(path.join(root, '../assets/app-mark.png'));
const favicon = await fs.readFile(path.join(publicDir, 'favicon.svg'));
const png = (input, size) => sharp(input).resize(size, size).png({ palette: true, colours: 256 }).toBuffer();
await fs.writeFile(path.join(publicDir, 'images/app-mark.png'), await png(mark, 128));
await fs.writeFile(path.join(publicDir, 'favicon-32.png'), await png(favicon, 32));
await fs.writeFile(path.join(publicDir, 'favicon.png'), await png(favicon, 48));
await sharp(mark).resize(180, 180).flatten({ background: '#ffffff' }).png({ palette: true, colours: 256 })
  .toFile(path.join(publicDir, 'apple-touch-icon.png'));

const icons = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(favicon, size) })));
const ico = Buffer.alloc(6 + icons.length * 16);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(icons.length, 4);
let offset = ico.length;
icons.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  ico[entry] = size;
  ico[entry + 1] = size;
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(data.length, entry + 8);
  ico.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await fs.writeFile(path.join(publicDir, 'favicon.ico'), Buffer.concat([ico, ...icons.map(({ data }) => data)]));

const covers = {
  home: ['TUS tekrarını günlük bir', 'alışkanlığa dönüştür.'],
  referanslar: ['TUS referansları'],
  'puan-hesapla': ['TUS puan hesaplayıcı'],
  yardim: ['Yardım Merkezi'],
  sss: ['Sıkça sorulan sorular'],
  kurucu: ['Neden TusAnkiM’i kurduk?'],
  destek: ['Destek ve iletişim'],
  gizlilik: ['Gizlilik politikası ve KVKK'],
  'kullanim-kosullari': ['Kullanım koşulları'],
};
const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function fitTitle(title) {
  const fontSize = 62;
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    const { info } = await sharp({ text: { text: escape(candidate), font: `Arial Bold ${fontSize}`, rgba: true } })
      .png().toBuffer({ resolveWithObject: true });
    if (line && info.width > 1040) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > 3) throw new Error(`Social cover title exceeds three lines: ${title}`);
  return lines;
}
for (const article of getHelpArticles()) {
  const title = article.slug === 'sss' ? 'Sorun giderme' : article.title;
  covers[`yardim/${article.slug}`] = await fitTitle(title);
}
const markData = (await sharp(mark).resize(108, 108).png().toBuffer()).toString('base64');
const manifest = {};
for (const [slug, lines] of Object.entries(covers)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#ffffff"/>
    <image href="data:image/png;base64,${markData}" x="64" y="44" width="108" height="108"/>
    <text x="190" y="112" font-family="Arial, sans-serif" font-size="30" font-weight="600" fill="#24292c">TusAnkiM</text>
    ${lines.map((line, index) => `<text x="80" y="${(lines.length > 2 ? 242 : 280) + index * 82}" font-family="Arial, sans-serif" font-size="62" font-weight="600" letter-spacing="-1.5" fill="#24292c">${escape(line)}</text>`).join('')}
    <path d="M80 506H1120" stroke="#dde1e4"/>
    <text x="80" y="565" font-family="Arial, sans-serif" font-size="24" fill="#0e7469">TUS için aralıklı tekrar</text>
    <text x="1120" y="565" text-anchor="end" font-family="Arial, sans-serif" font-size="24" fill="#596166">tusankim.com</text>
  </svg>`;
  const output = path.join(publicDir, `images/og/${slug}.png`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const data = await sharp(Buffer.from(svg)).png({ palette: true, colours: 256 }).toBuffer();
  await fs.writeFile(output, data);
  manifest[`/images/og/${slug}.png`] = { title: lines.join(' '), sha256: createHash('sha256').update(data).digest('hex') };
}
await fs.writeFile(path.join(publicDir, 'images/og/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Brand assets built: optimized mark, favicon package and ${Object.keys(covers).length} PNG covers.`);
