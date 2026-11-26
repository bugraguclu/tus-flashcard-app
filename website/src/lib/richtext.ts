// Safe inline Markdown-subset renderer for FAQ answers and short prose.
// Always escapes raw HTML first so data files can never inject markup.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]);

const MD_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(?:\/(?!\/)|#|https?:\/\/|mailto:)/i;
const STRONG = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g;
const EM = /\*(?=\S)([^*\n]+?)(?<=\S)\*/g;
const CODE = /`([^`\n]+)`/g;

const siteHref = (href: string): string => {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const m = href.match(/^([^?#]*)([?#].*)?$/);
  const base = m?.[1] ?? href;
  const rest = m?.[2] ?? '';
  if (base.endsWith('/') || /\.\w{2,4}$/.test(base)) return href;
  return base + '/' + rest;
};

function renderLinks(escaped: string): string {
  return escaped.replace(MD_LINK, (m, text, href) => {
    if (!SAFE_HREF.test(href)) return m;
    const isExternal = /^https?:\/\//i.test(href);
    const attrs = isExternal
      ? 'class="text-teal underline hover:text-tealDark" target="_blank" rel="noopener noreferrer"'
      : 'class="text-teal underline hover:text-tealDark"';
    return `<a href="${siteHref(href)}" ${attrs}>${text}</a>`;
  });
}

const emphasise = (escaped: string) =>
  escaped
    .replace(CODE, '<code>$1</code>')
    .replace(STRONG, '<strong>$1</strong>')
    .replace(EM, '<em>$1</em>');

/** Wrap English technical terms inside Turkish uppercase kickers so CSS text-transform keeps dotless I. */
const LATIN_TERMS = /\b(FSRS-6|FSRS|Anki|AnkiMobile|Image Occlusion|Cloze|iPhone|Web|WhatsApp|Instagram|SQLite|Git)\b/g;
export function markLatinTerms(s: string): string {
  return escapeHtml(s).replace(LATIN_TERMS, (m) => `<span lang="en">${m}</span>`);
}

export function inlineHtml(s: string): string {
  return emphasise(renderLinks(escapeHtml(s)));
}

export function answerHtml(a: string): string {
  return a
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      const html = emphasise(renderLinks(escapeHtml(block))).replace(/\n/g, '<br />');
      return `<p${i ? ' class="mt-3"' : ''}>${html}</p>`;
    })
    .join('');
}
