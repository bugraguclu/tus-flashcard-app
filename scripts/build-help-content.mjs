// Compiles docs/user-guide/{tr,en}/*.md into a typed, offline-ready TypeScript module
// (lib/helpContent.generated.ts) so the Help Center and its search index share one source
// of truth and every internal cross-link / anchor is verified at build time.
//
// Usage:
//   node scripts/build-help-content.mjs           # generate lib/helpContent.generated.ts
//   node scripts/build-help-content.mjs --check   # exit non-zero if generated file is stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const guideDir = path.join(projectRoot, 'docs/user-guide');
const outputPath = path.join(projectRoot, 'lib/helpContent.generated.ts');
const checkOnly = process.argv.includes('--check');

const GROUP_BY_ARTICLE_ID = {
    welcome: 'getting-started',
    concepts: 'getting-started',
    'quick-start': 'getting-started',
    decks: 'studying',
    studying: 'studying',
    'deck-options': 'studying',
    fsrs: 'studying',
    'filtered-decks': 'studying',
    editing: 'cards',
    'note-types': 'cards',
    browser: 'cards',
    statistics: 'progress',
    stopwatch: 'progress',
    'import-export': 'data',
    backups: 'data',
    anki: 'data',
    settings: 'app',
    automation: 'app',
    'tus-cards': 'app',
    faq: 'help',
    glossary: 'help',
};

function parseFrontMatter(raw, fileLabel) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    if (!match) throw new Error(`${fileLabel}: missing YAML front matter`);
    const fm = {};
    let currentKey = null;
    for (const line of match[1].split('\n')) {
        const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
        if (kv) {
            currentKey = kv[1];
            const cleaned = kv[2].replace(/\s+#.*$/, '').trim().replace(/^"(.*)"$/, '$1');
            fm[currentKey] = cleaned;
            continue;
        }
        if (currentKey && /^\s+-\s+/.test(line)) {
            fm[currentKey] = (fm[currentKey] ? `${fm[currentKey]}\n` : '') + line.trim();
        }
    }
    for (const required of ['id', 'title', 'summary', 'order']) {
        if (!fm[required]) throw new Error(`${fileLabel}: front matter missing "${required}"`);
    }
    return {
        fm,
        body: raw.slice(match[0].length),
    };
}

function slugifyHeading(text, fallbackIndex) {
    const slug = text
        .toLocaleLowerCase('tr')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || `section-${fallbackIndex}`;
}

function stripHtmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, '');
}

function parseInlines(rawText, context) {
    const text = rawText.replace(/\s+/g, ' ');
    const out = [];
    // Matches `code`, [label](href), **bold**, or *italic* in left-to-right order.
    const tokenRe = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
    let lastIndex = 0;
    let match;

    const pushText = (slice) => {
        if (!slice) return;
        const prev = out[out.length - 1];
        if (prev && prev.kind === 'text') {
            prev.text += slice;
        } else {
            out.push({ kind: 'text', text: slice });
        }
    };

    while ((match = tokenRe.exec(text)) !== null) {
        if (match.index > lastIndex) {
            pushText(text.slice(lastIndex, match.index));
        }
        if (match[1] !== undefined) {
            out.push({ kind: 'code', text: match[1] });
        } else if (match[2] !== undefined && match[3] !== undefined) {
            const label = match[2];
            const href = match[3];
            if (/^(https?:|mailto:)/i.test(href)) {
                out.push({ kind: 'link', text: label, url: href });
            } else {
                const [filePart, anchorPart] = href.split('#');
                let targetArticleId = context.articleId;
                let targetFile = context.file;
                if (filePart) {
                    const resolved = context.fileToId.get(filePart);
                    if (!resolved) {
                        throw new Error(`${context.fileLabel}: link to unknown article "${href}"`);
                    }
                    targetArticleId = resolved;
                    targetFile = filePart;
                }
                if (anchorPart) {
                    const targetAnchors = context.anchorsByFile.get(targetFile);
                    if (!targetAnchors || !targetAnchors.has(anchorPart)) {
                        throw new Error(`${context.fileLabel}: link to missing anchor "${href}"`);
                    }
                }
                const linkNode = { kind: 'link', text: label, articleId: targetArticleId };
                if (anchorPart) linkNode.sectionId = anchorPart;
                out.push(linkNode);
            }
        } else if (match[4] !== undefined) {
            out.push({ kind: 'bold', text: match[4] });
        } else if (match[5] !== undefined) {
            out.push({ kind: 'italic', text: match[5] });
        }
        lastIndex = tokenRe.lastIndex;
    }

    if (lastIndex < text.length) {
        pushText(text.slice(lastIndex));
    }

    return out.length ? out : [{ kind: 'text', text: '' }];
}

function isTableSeparatorLine(line) {
    return /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());
}

function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    const cells = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i += 1) {
        if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
            current += '|';
            i += 1;
            continue;
        }
        if (trimmed[i] === '|') {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += trimmed[i];
    }
    cells.push(current.trim());
    return cells;
}

function detectCalloutTone(firstLine) {
    const lower = firstLine.toLocaleLowerCase('tr');
    if (lower.includes("anki'den farkı") || lower.includes('different from anki')) return 'anki';
    if (lower.includes('web sürümünde') || lower.includes('in the web version')) return 'web';
    if (
        lower.includes('dikkat')
        || lower.includes('warning:')
        || lower.includes('caution:')
        || lower.includes('watch out:')
    ) {
        return 'warning';
    }
    return 'note';
}

function parseBlocks(lines, context) {
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (!trimmed) {
            i += 1;
            continue;
        }

        // Fenced code block
        if (trimmed.startsWith('```')) {
            const codeLines = [];
            i += 1;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) i += 1; // closing fence
            blocks.push({ kind: 'code', text: codeLines.join('\n').trimEnd() });
            continue;
        }

        // Blockquote / callout
        if (trimmed.startsWith('>')) {
            const quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
                i += 1;
            }
            const tone = detectCalloutTone(quoteLines[0] ?? '');
            const innerBlocks = parseBlocks(quoteLines, context);
            if (innerBlocks.length > 0) {
                blocks.push({ kind: 'callout', tone, blocks: innerBlocks });
            }
            continue;
        }

        // Markdown table
        if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
            const headerCells = splitTableRow(trimmed).map((cell) => parseInlines(cell, context));
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                const cells = splitTableRow(lines[i]).map((cell) => parseInlines(cell, context));
                rows.push(cells);
                i += 1;
            }
            blocks.push({ kind: 'table', headers: headerCells, rows });
            continue;
        }

        // Unordered or ordered list
        const unorderedMatch = /^[-*]\s+(.*)$/.exec(trimmed);
        const orderedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
        if (unorderedMatch || orderedMatch) {
            const ordered = Boolean(orderedMatch);
            const itemRe = ordered ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/;
            const items = [];
            while (i < lines.length) {
                const line = lines[i];
                const t = line.trim();
                if (!t) break;
                const m = itemRe.exec(t);
                if (m) {
                    const parts = [m[1].trim()];
                    i += 1;
                    while (i < lines.length) {
                        const nextLine = lines[i];
                        const nextTrimmed = nextLine.trim();
                        if (!nextTrimmed) break;
                        if (/^[-*]\s+/.test(nextTrimmed) || /^\d+\.\s+/.test(nextTrimmed)) {
                            // Nested bullet indented under a list item: fold cleanly as sub-clause.
                            if (/^\s{2,}[-*]\s+/.test(nextLine)) {
                                parts.push(`• ${nextTrimmed.replace(/^[-*]\s+/, '')}`);
                                i += 1;
                                continue;
                            }
                            break;
                        }
                        if (nextTrimmed.startsWith('>') || nextTrimmed.startsWith('|') || nextTrimmed.startsWith('```')) {
                            break;
                        }
                        parts.push(nextTrimmed);
                        i += 1;
                    }
                    items.push(parseInlines(parts.join(' '), context));
                } else {
                    break;
                }
            }
            if (items.length > 0) {
                blocks.push({ kind: 'list', ordered, items });
            }
            continue;
        }

        // Regular paragraph (consume consecutive prose lines)
        const paraLines = [];
        while (i < lines.length) {
            const t = lines[i].trim();
            if (!t) break;
            if (
                t.startsWith('```')
                || t.startsWith('>')
                || (t.startsWith('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
                || /^[-*]\s+/.test(t)
                || /^\d+\.\s+/.test(t)
            ) {
                break;
            }
            paraLines.push(t);
            i += 1;
        }
        if (paraLines.length > 0) {
            blocks.push({ kind: 'paragraph', inlines: parseInlines(paraLines.join(' '), context) });
        }
    }

    return blocks;
}

function parseArticle(file, raw, lang, fileToId, anchorsByFile) {
    const fileLabel = `${lang}/${file}`;
    const { fm, body } = parseFrontMatter(raw, fileLabel);
    const id = fm.id;
    const groupId = GROUP_BY_ARTICLE_ID[id];
    if (!groupId) {
        throw new Error(`${fileLabel}: article id "${id}" is not assigned to a HelpGroupId`);
    }

    const cleanedBody = stripHtmlComments(body);
    const lines = cleanedBody.split('\n');
    const context = { articleId: id, file, fileLabel, fileToId, anchorsByFile };

    const introLines = [];
    const rawSections = [];
    let pendingAnchor = null;
    let currentSection = null;
    let currentH2Title = null;
    let autoSlugCounter = 0;
    const usedSectionIds = new Set();

    for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        const trimmed = line.trim();

        // Top-level H1 repeats the article title already rendered in the screen header.
        if (/^#\s+/.test(trimmed)) continue;

        const anchorMatch = /^<a id="([^"]+)"><\/a>$/.exec(trimmed);
        if (anchorMatch) {
            pendingAnchor = anchorMatch[1];
            continue;
        }

        const headingMatch = /^(##|###)\s+(.*)$/.exec(trimmed);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const title = headingMatch[2].trim();
            const explicitAnchor = Boolean(pendingAnchor);
            let sectionId = pendingAnchor ?? slugifyHeading(title, ++autoSlugCounter);
            while (usedSectionIds.has(sectionId)) {
                sectionId = `${sectionId}-${++autoSlugCounter}`;
            }
            usedSectionIds.add(sectionId);
            pendingAnchor = null;

            if (level === 2) {
                currentH2Title = title;
            }
            currentSection = {
                id: sectionId,
                explicitAnchor,
                level,
                title,
                ...(level === 3 && currentH2Title ? { parentTitle: currentH2Title } : {}),
                lines: [],
            };
            rawSections.push(currentSection);
            continue;
        }

        if (currentSection) {
            currentSection.lines.push(line);
        } else {
            introLines.push(line);
        }
    }

    const introBlocks = parseBlocks(introLines, context);
    const sections = rawSections.map((sec) => {
        const blocks = parseBlocks(sec.lines, context);
        const result = {
            id: sec.id,
            explicitAnchor: sec.explicitAnchor,
            level: sec.level,
            title: sec.title,
            blocks,
        };
        if (sec.parentTitle) result.parentTitle = sec.parentTitle;
        return result;
    });

    return {
        id,
        file,
        order: Number(fm.order),
        title: fm.title,
        summary: fm.summary,
        groupId,
        introBlocks,
        sections,
    };
}

function loadLocaleArticles(lang) {
    const dir = path.join(guideDir, lang);
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
    const rawByFile = new Map();
    const fileToId = new Map();
    const anchorsByFile = new Map();

    for (const file of files) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const { fm, body } = parseFrontMatter(raw, `${lang}/${file}`);
        rawByFile.set(file, raw);
        fileToId.set(file, fm.id);
        const anchors = new Set([...body.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
        anchorsByFile.set(file, anchors);
    }

    const articles = files
        .map((file) => parseArticle(file, rawByFile.get(file), lang, fileToId, anchorsByFile))
        .sort((a, b) => a.order - b.order);

    return { articles, anchorsByFile };
}

function buildSource() {
    const tr = loadLocaleArticles('tr');
    const en = loadLocaleArticles('en');

    // Verify anchor parity across both languages so deep links work regardless of app locale.
    const enById = new Map(en.articles.map((article) => [article.id, article]));
    if (tr.articles.length !== en.articles.length) {
        throw new Error(`Article count mismatch: tr=${tr.articles.length}, en=${en.articles.length}`);
    }
    for (const trArticle of tr.articles) {
        const enArticle = enById.get(trArticle.id);
        if (!enArticle) throw new Error(`Missing English counterpart for article "${trArticle.id}"`);
        const trAnchors = trArticle.sections.filter((s) => s.explicitAnchor).map((s) => s.id);
        const enAnchors = enArticle.sections.filter((s) => s.explicitAnchor).map((s) => s.id);
        const trSet = new Set(trAnchors);
        const enSet = new Set(enAnchors);
        const onlyTr = trAnchors.filter((id) => !enSet.has(id));
        const onlyEn = enAnchors.filter((id) => !trSet.has(id));
        if (onlyTr.length || onlyEn.length) {
            throw new Error(
                `Anchor mismatch in "${trArticle.id}": onlyTr=[${onlyTr.join(', ')}] onlyEn=[${onlyEn.join(', ')}]`,
            );
        }
    }

    const payload = {
        tr: tr.articles,
        en: en.articles,
    };

    return [
        '// AUTO-GENERATED by scripts/build-help-content.mjs from docs/user-guide/{tr,en}/*.md.',
        '// Do not edit by hand; run `npm run build:help` after updating the guide articles.',
        "import type { SupportedLocale } from './i18n';",
        "import type { HelpArticle } from './helpTypes';",
        '',
        `export const HELP_ARTICLES: Record<SupportedLocale, readonly HelpArticle[]> = ${JSON.stringify(payload)};`,
        '',
    ].join('\n');
}

const generated = buildSource();

if (checkOnly) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (existing !== generated) {
        console.error('lib/helpContent.generated.ts is out of date. Run `npm run build:help`.');
        process.exit(1);
    }
    console.log('lib/helpContent.generated.ts is up to date.');
} else {
    fs.writeFileSync(outputPath, generated, 'utf8');
    console.log(`Generated ${path.relative(projectRoot, outputPath)} (${Buffer.byteLength(generated, 'utf8')} bytes).`);
}
