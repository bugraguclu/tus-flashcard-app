import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, Renderer } from 'marked';

export interface HelpHeading {
  depth: number;
  id: string;
  text: string;
}

export interface HelpArticle {
  file: string;
  sourceRelPath: string;
  id: string;
  slug: string;
  webPath: string;
  title: string;
  summary: string;
  order: number;
  category: string;
  headings: HelpHeading[];
  html: string;
  plainText: string;
}

function resolveGuideDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../docs/user-guide/tr'),
    path.resolve(process.cwd(), 'docs/user-guide/tr'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/user-guide/tr'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/user-guide/tr'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Could not locate docs/user-guide/tr from ${process.cwd()}`);
  return found;
}

const GUIDE_DIR = resolveGuideDir();

function slugifyTr(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function helpCategoryId(category: string): string {
  return `rehber-${slugifyTr(category)}`;
}

function categoryForOrder(order: number): string {
  if (order <= 3) return 'Başlangıç';
  if (order <= 7) return 'Çalışma & FSRS-6';
  if (order <= 11) return 'Kartlar & Arama';
  if (order <= 13) return 'İstatistik & Kronometre';
  if (order <= 16) return 'Veri, Yedek & Ayarlar';
  return 'TUS Paketi, Anki & Referans';
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (kv) {
      meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: m[2] };
}

let cached: HelpArticle[] | null = null;

export function getHelpArticles(): HelpArticle[] {
  if (cached) return cached;

  const files = fs
    .readdirSync(GUIDE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  // First pass: map filename (e.g. 05-studying.md) -> slug (calisma-ekrani)
  const rawDocs = files.map((file) => {
    const full = path.join(GUIDE_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const webPathRaw = meta.web_path || `/yardim/${meta.id || file.replace(/\.md$/, '')}`;
    const slug = webPathRaw.replace(/^\/yardim\//, '').replace(/\/+$/, '');
    return { file, meta, body, slug, webPath: `/yardim/${slug}/` };
  });

  const fileToPath = new Map(rawDocs.map((d) => [d.file, d.webPath]));

  const articles: HelpArticle[] = rawDocs
    .map((doc) => {
      // Strip leading H1 (page template renders the single semantic <h1>)
      let md = doc.body.replace(/^\s*#\s+[^\r\n]+\r?\n+/, '');

      // Rewrite relative .md links like (05-studying.md) or (15-backups-and-maintenance.md#share-backup)
      md = md.replace(/\]\((?:\.\/)?(\d{2}-[a-z0-9-]+\.md)(#[^)\s]+)?\)/g, (_m: string, fname: string, hash: string) => {
        const target = fileToPath.get(fname);
        if (!target) return _m;
        return `](${target}${hash || ''})`;
      });

      const headings: HelpHeading[] = [];
      // Reserve authored anchors so generated headings cannot duplicate stable deep links.
      const seenIds = new Set([...md.matchAll(/<a id="([^"]+)"><\/a>/g)].map((match) => match[1]));

      const renderer = new Renderer();
      renderer.heading = function (token) {
        const rawText = token.text.trim();
        const baseId = slugifyTr(rawText) || 'bolum';
        let id = baseId;
        let suffix = 1;
        while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
        seenIds.add(id);

        if (token.depth === 2 || token.depth === 3) {
          headings.push({
            depth: token.depth,
            id,
            text: rawText.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1'),
          });
        }

        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}" class="scroll-mt-24">${inner}</h${token.depth}>\n`;
      };

      // Strip internal engineering HTML comments (<!-- ... -->) while preserving <a id="..."></a> anchors.
      const cleanedMd = md.replace(/<!--[\s\S]*?-->/g, '');

      const marked = new Marked({ gfm: true, breaks: false, renderer });
      const html = String(marked.parse(cleanedMd))
        .replace(/<table>/g, '<div class="help-table-wrap" tabindex="0" role="region" aria-label="Tablo"><table>')
        .replace(/<\/table>/g, '</table></div>')
        .replace(/<thead>([\s\S]*?)<\/thead>/g, (_m, inner: string) => `<thead>${inner.replace(/<th(\b[^>]*)>/g, '<th scope="col"$1>')}</thead>`)
        .replace(/<a id="([^"]+)"><\/a>/g, '<span id="$1" class="block scroll-mt-24" aria-hidden="true"></span>');
      const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const order = Number(doc.meta.order || 99);

      return {
        file: doc.file,
        sourceRelPath: `docs/user-guide/tr/${doc.file}`,
        id: doc.meta.id || doc.slug,
        slug: doc.slug,
        webPath: doc.webPath,
        title: doc.meta.title || doc.slug,
        summary: doc.meta.summary || '',
        order,
        category: categoryForOrder(order),
        headings,
        html,
        plainText,
      };
    })
    .sort((a, b) => a.order - b.order);

  cached = articles;
  return articles;
}
