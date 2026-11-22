import assert from 'node:assert/strict';
import test from 'node:test';
import { getHelpArticles } from '../src/lib/helpDocs.ts';
import { readingSections, groupReading } from '../src/lib/helpReading.ts';
import { HELP_INTROS } from '../src/data/help-intros.ts';

const articles = getHelpArticles();
const ids = (html: string) => [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

test('all 21 guides have short task steps and valid related guides', () => {
  assert.equal(articles.length, 21);
  assert.deepEqual(Object.keys(HELP_INTROS).sort(), articles.map((article) => article.slug).sort());
  for (const article of articles) {
    const intro = HELP_INTROS[article.slug];
    assert.ok(intro.steps.length >= 3 && intro.steps.length <= 4, article.slug);
    assert.ok(intro.intro.length < 250, article.slug);
    for (const slug of intro.related) assert.ok(articles.some((target) => target.slug === slug), slug);
  }
});

test('reading groups preserve every paragraph and deep link from the source', () => {
  for (const article of articles) {
    const reading = readingSections(article.html);
    assert.equal(reading.lead + reading.sections.map((section) => section.html).join(''), article.html, article.slug);
    const groups = groupReading(reading.sections, HELP_INTROS[article.slug].groups);
    assert.ok(groups.length >= 2 && groups.length <= 5, article.slug);
    assert.deepEqual(ids(reading.lead + groups.map((group) => group.html).join('')), ids(article.html), article.slug);
    assert.equal(new Set(ids(article.html)).size, ids(article.html).length, `Duplicate source ID: ${article.slug}`);
    const original = reading.sections.map((section) => section.html).join('');
    const expanded = groups.map((group) => group.html).join('').replace(/<(\/?)(h[3-6])\b/g, (_match, closing: string, heading: string) => `<${closing}h${Number(heading[1]) - 1}`);
    assert.equal(expanded, original, article.slug);
  }
});

test('authored anchors before a heading remain inside its revealable section', () => {
  const html = '<p>Lead.</p><span id="stable" class="block"></span>\n<h2 id="generated">First</h2><p>Body.</p><h2 id="next">Next</h2><p>More.</p>';
  const result = readingSections(html);
  assert.equal(result.lead, '<p>Lead.</p>');
  assert.ok(result.sections[0].html.startsWith('<span id="stable"'));
  assert.throws(() => groupReading(result.sections, [{ title: 'Missing', from: 'Absent' }]));
});

test('Markdown paragraph wrappers keep a deep link with the section it names', () => {
  const article = articles.find((item) => item.slug === 'anki-ile-kullanma')!;
  const reading = readingSections(article.html);
  const groups = groupReading(reading.sections, HELP_INTROS[article.slug].groups);
  assert.ok(groups[1].html.includes('id="back-to-anki"'));
  assert.ok(groups[1].html.includes('id="tusankim-den-anki-ye-goturmek"'));
  assert.ok(!groups[0].html.includes('id="back-to-anki"'));
});
