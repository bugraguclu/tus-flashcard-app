export interface ReadingSection {
  title: string;
  html: string;
}

// Markdown headings are rendered as HTML before they are matched to reading groups.
const headingText = (html: string) => html.replace(/<[^>]+>/g, '')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) =>
    String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_match, entity: string) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]!);

/** Group rendered Markdown without dropping the authored anchors before each heading. */
export function readingSections(html: string): { lead: string; sections: ReadingSection[] } {
  const headings = [...html.matchAll(/(?:(?:<p>\s*)?<span id="[^"]+"[^>]*><\/span>(?:\s*<\/p>)?\s*)*<h2\b[^>]*>([\s\S]*?)<\/h2>/g)];
  return {
    lead: html.slice(0, headings[0]?.index ?? html.length),
    sections: headings.map((heading, index) => ({
      title: headingText(heading[1]),
      html: html.slice(heading.index, headings[index + 1]?.index ?? html.length),
    })),
  };
}

export function groupReading(sections: ReadingSection[], groups: { title: string; from: string }[]) {
  const starts = groups.map((group) => sections.findIndex((section) => section.title === group.from));
  if (starts[0] !== 0 || starts.some((start, index) => start < 0 || (index > 0 && start <= starts[index - 1]))) {
    throw new Error('Help reading groups must follow the source headings and cover every section.');
  }
  return groups.map((group, index) => ({
    title: group.title,
    // Details summaries name the group. Its source headings start at h3 under the h2 below.
    html: sections.slice(starts[index], starts[index + 1] ?? sections.length).map((section) => section.html).join('')
      .replace(/<(\/?)(h[2-5])\b/g, (_match, closing: string, heading: string) => `<${closing}h${Number(heading[1]) + 1}`),
  }));
}
