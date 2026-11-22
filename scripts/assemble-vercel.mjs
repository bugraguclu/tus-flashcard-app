import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const base = process.env.TUSANKIM_WEB_BASE;
if (!/^\/[a-z-]+$/.test(base ?? '')) throw new Error('TUSANKIM_WEB_BASE must be an absolute path segment.');

const output = new URL('../dist/vercel/', import.meta.url);
const site = new URL('../website/dist/', import.meta.url);
const app = new URL('../.expo/vercel-web/', import.meta.url);
await rm(output, { recursive: true, force: true });
await cp(site, output, { recursive: true });

const publicFiles = new Set(['icons', 'manifest.webmanifest', 'sw.js']);
await cp(app, new URL(base.slice(1) + '/', output), {
    recursive: true,
    filter: (source) => !publicFiles.has(basename(source)),
});
await cp(new URL('icons/', app), new URL('icons/', output), { recursive: true });

const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', app), 'utf8'));
manifest.start_url = base + '/';
for (const shortcut of manifest.shortcuts) shortcut.url = base + shortcut.url;
for (const handler of manifest.file_handlers) handler.action = base + handler.action;
await writeFile(new URL('manifest.webmanifest', output), JSON.stringify(manifest));

const worker = await readFile(new URL('sw.js', app), 'utf8');
await writeFile(new URL('sw.js', output), `const APP_BASE = ${JSON.stringify(base)};\n${worker}`);
