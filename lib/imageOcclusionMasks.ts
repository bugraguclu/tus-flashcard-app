/**
 * Image Occlusion masks for a card shown on screen.
 *
 * Anki draws the masks with its own script (`anki.imageOcclusion.setup()`), which reads the shape
 * `<div>`s the cloze filter writes and paints them onto `#image-occlusion-canvas`. Card scripts do
 * not run here, so the same picture is drawn ahead of time as an SVG in place of that canvas, with
 * Anki 26.09.3's rules: the asked shapes in the active colour, the other shapes only when they are
 * marked "hide all", the answered shapes as a highlight outline, and a text shape as a white label.
 * Positions are fractions of the image, as Anki stores them. "Toggle Masks" hides every mask but
 * the text labels, and is hidden when no shape hides the others, as in Anki. A text export keeps
 * the canvas, as Anki writes it.
 */

const SHAPE = /<div class="(cloze|cloze-inactive|cloze-highlight)" data-ordinal="[^"]*" ([^>]*)><\/div>/g;
const ATTRIBUTE = /data-([\w-]+)="([^"]*)"/g;

/** The colours Anki uses when the note type sets none; a note type's own CSS variables still win. */
const COLOURS = {
    cloze: { fill: 'var(--active-shape-color, #ff8e8e)', stroke: '#212121' },
    'cloze-inactive': { fill: 'var(--inactive-shape-color, #ffeba2)', stroke: '#212121' },
    'cloze-highlight': { fill: 'var(--highlight-shape-color, #ff8e8e00)', stroke: '#ff8e8e' },
} as const;

const number = (value: string | undefined, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const decodeAttribute = (value: string) => value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function shapeSvg(kind: keyof typeof COLOURS, data: Record<string, string>): { mask: string; label: string } {
    const { stroke } = COLOURS[kind];
    const fill = kind === 'cloze-inactive' && data.fill ? escapeAttribute(data.fill) : COLOURS[kind].fill;
    const left = number(data.left);
    const top = number(data.top);
    const angle = number(data.angle);
    const paint = `style="fill:${fill}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"`
        + (angle ? ` transform="rotate(${angle} ${left} ${top})"` : '');
    switch (data.shape) {
        case 'rect':
            return { mask: `<rect x="${left}" y="${top}" width="${number(data.width)}" height="${number(data.height)}" ${paint}/>`, label: '' };
        case 'ellipse': {
            const rx = number(data.rx);
            const ry = number(data.ry);
            return { mask: `<ellipse cx="${left + rx}" cy="${top + ry}" rx="${rx}" ry="${ry}" ${paint}/>`, label: '' };
        }
        case 'polygon': {
            const points = (data.points || '0,0').split(' ').map((point) => point.split(',').map((value) => number(value)).join(',')).join(' ');
            return { mask: `<polygon points="${points}" ${paint}/>`, label: '' };
        }
        case 'text': {
            const size = number(data['font-size'], 40) * number(data.scale, 1);
            const lines = decodeAttribute(data.text ?? '').split('\n').map((line, index) =>
                `<tspan x="${left * 100}%" dy="${index ? 1.5 : 0}em">${escapeAttribute(line)}</tspan>`).join('');
            return {
                mask: '',
                label: `<text x="${left * 100}%" y="${top * 100}%" font-family="Arial" font-size="${size}px" dominant-baseline="hanging"`
                    + ` style="fill:${data.fill ? escapeAttribute(data.fill) : '#000'}" stroke="#ffffff" stroke-width="5" paint-order="stroke">${lines}</text>`,
            };
        }
        default:
            return { mask: '', label: '' };
    }
}

export function withOcclusionMasks(html: string): string {
    if (!html.includes('<canvas id="image-occlusion-canvas"></canvas>')) return html;
    let masks = '';
    let labels = '';
    let hidesOthers = false;
    for (const [, kind, attributes] of html.matchAll(SHAPE)) {
        const data = Object.fromEntries([...attributes.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value]));
        if (data.occludeInactive === '1') hidesOthers = true;
        if (kind === 'cloze-inactive' && data.occludeInactive !== '1') continue;
        const shape = shapeSvg(kind as keyof typeof COLOURS, data);
        masks += shape.mask;
        labels += shape.label;
    }
    const style = '<style>#image-occlusion-container{position:relative;display:inline-block;max-width:100%}'
        + '#image-occlusion-container img{display:block;max-width:100%}'
        + '#image-occlusion-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}'
        + 'body:has(#io-toggle:checked) .io-masks{display:none}'
        + `#toggle{-webkit-appearance:button;appearance:button;display:${hidesOthers ? 'inline-block' : 'none'};padding:2px 8px;cursor:pointer}</style>`;
    const svg = `<svg id="image-occlusion-canvas" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
        + `<svg class="io-masks" viewBox="0 0 1 1" preserveAspectRatio="none" width="100%" height="100%">${masks}</svg>${labels}</svg>`;
    return html
        .replace('<canvas id="image-occlusion-canvas"></canvas>', style + svg)
        .replace('<button id="toggle">Toggle Masks</button>', '<label id="toggle"><input id="io-toggle" type="checkbox" hidden>Toggle Masks</label>');
}
