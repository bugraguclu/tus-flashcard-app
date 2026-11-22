import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Inspect emitted assets and dates, not just matching source configuration. */
export function verifyBrandOutput({ dist, htmlFiles, check }) {
  const read = (file) => fs.readFileSync(path.join(dist, file));
  const png = (file, width, height, colour = false) => {
    const asset = path.join(dist, file);
    if (!fs.existsSync(asset)) { check(false, `Missing PNG asset: ${file}`); return; }
    const data = read(file);
    const valid = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    check(valid, `${file}: invalid PNG signature`);
    if (!valid) return;
    check(data.readUInt32BE(16) === width && data.readUInt32BE(20) === height,
      `${file}: expected ${width}×${height} pixels`);
    if (colour) {
      let coloured = false;
      for (let cursor = 8; cursor + 12 <= data.length;) {
        const length = data.readUInt32BE(cursor);
        const type = data.toString('ascii', cursor + 4, cursor + 8);
        check(type !== 'eXIf', `${file}: EXIF metadata must be stripped`);
        if (type === 'PLTE') {
          for (let i = cursor + 8; i < cursor + 8 + length; i += 3) {
            if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) coloured = true;
          }
        }
        cursor += length + 12;
      }
      check(coloured, `${file}: expected a colour palette, not a grayscale icon`);
    }
  };
  png('images/app-mark.png', 128, 128, true);
  png('favicon-32.png', 32, 32, true);
  png('favicon.png', 48, 48, true);
  png('apple-touch-icon.png', 180, 180, true);
  if (fs.existsSync(path.join(dist, 'images/app-mark.png'))) {
    check(read('images/app-mark.png').length < 16384, 'Brand mark exceeds 16 KB budget');
  }
  if (fs.existsSync(path.join(dist, 'favicon.ico'))) {
    const ico = read('favicon.ico');
    check(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'favicon.ico: expected three icon sizes');
  } else check(false, 'Missing favicon.ico');

  const sitemap = read('sitemap.xml').toString('utf8');
  const dates = new Map([...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)]
    .map((match) => [match[1], match[2]]));
  const imageFiles = new Set();
  const covers = JSON.parse(read('images/og/manifest.json').toString('utf8'));
  for (const file of htmlFiles) {
    const rel = path.relative(dist, file);
    const html = fs.readFileSync(file, 'utf8');
    check(!/905000000000|wa\.me\/|api\.whatsapp\.com\/|whatsapp:\/\//i.test(html), `${rel}: WhatsApp contact returned`);
    check(html.includes('href="/favicon.png" sizes="48x48"'), `${rel}: favicon size declaration differs from file`);
    check(html.includes('rel="apple-touch-icon"'), `${rel}: missing Apple home screen icon`);
    if (rel === '404.html') continue;

    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    check(dates.has(canonical), `${rel}: canonical URL missing from sitemap`);
    const modified = dates.get(canonical);
    check(/^\d{4}-\d{2}-\d{2}$/.test(modified ?? ''), `${rel}: missing real sitemap lastmod (fetch full git history)`);
    const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .flatMap((match) => { try { return [JSON.parse(match[1])]; } catch { return []; } });
    const page = schemas.find((schema) => schema.dateModified);
    check(page?.dateModified === modified, `${rel}: schema dateModified and sitemap lastmod differ`);

    const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    const twitter = html.match(/name="twitter:image" content="([^"]+)"/)?.[1];
    check(og === twitter, `${rel}: OG and Twitter cover images differ`);
    try {
      const url = new URL(og);
      check(url.origin === 'https://tusankim.com' && url.pathname.endsWith('.png'), `${rel}: cover must be a canonical PNG`);
      const pagePath = new URL(canonical).pathname.replace(/^\/+|\/+$/g, '') || 'home';
      check(url.pathname === `/images/og/${pagePath}.png`, `${rel}: cover must correspond to this page`);
      check(!imageFiles.has(url.pathname), `${rel}: another page already uses this social cover`);
      png(url.pathname.slice(1), 1200, 630);
      const cover = covers[url.pathname];
      check(Boolean(cover?.title), `${rel}: missing cover title manifest`);
      const asset = path.join(dist, url.pathname);
      if (fs.existsSync(asset)) check(createHash('sha256').update(fs.readFileSync(asset)).digest('hex') === cover?.sha256,
        `${rel}: social cover differs from its generated title manifest`);
      const article = schemas.find((schema) => schema['@type'] === 'TechArticle');
      if (article) check(cover?.title === article.headline, `${rel}: cover title differs from article title (run npm run assets:build)`);
      imageFiles.add(url.pathname);
    } catch { check(false, `${rel}: invalid social cover URL`); }
  }
  check(imageFiles.size === dates.size, 'Every canonical page must use its own relevant social cover');
  console.log(`[verify-brand] ${imageFiles.size} PNG covers, icon dimensions, contact removal and sitemap/schema date parity checked.`);
}
