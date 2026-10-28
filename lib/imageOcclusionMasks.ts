/**
 * Image Occlusion masks for a card shown on screen.
 *
 * Anki draws the masks with its own script (`anki.imageOcclusion.setup()`), which reads the shape
 * `<div>`s the cloze filter writes and paints them onto `#image-occlusion-canvas`. Card scripts do
 * not run here, so the same picture is laid out ahead of time in place of that canvas, with
 * Anki 26.09.3's rules: the asked shapes in the active colour, then the other shapes only when they
 * are marked "hide all", then the answered shapes as a highlight outline; a text shape is a label
 * on a white box. Positions are fractions of the image, as Anki stores them; an angle is a turn in
 * ten-thousandths, turning a box about its top-left corner; a polygon's points are moved so their
 * top-left corner sits at the shape's own; a label's `fs` is a fraction of the image height
 * (Anki's 40 pixels without one), times its `scale`. Boxes and labels are positioned elements, so
 * a turn stays square on a picture of any shape, and a label's size follows the picture through
 * container query units. "Toggle Masks" hides every mask but the text labels, and is hidden when
 * no shape hides the others, as in Anki. A text export keeps the canvas, as Anki writes it.
 */

import { occlusionGeometry, type OcclusionShape } from './imageOcclusion';

const SHAPE = /<div class="(cloze|cloze-inactive|cloze-highlight)" data-ordinal="[^"]*" ([^>]*)><\/div>/g;
const ATTRIBUTE = /data-([\w-]+)="([^"]*)"/g;

type Kind = 'cloze' | 'cloze-inactive' | 'cloze-highlight';

/** The colours Anki uses when the note type sets none; a note type's own CSS variables still win. */
const COLOURS = {
    cloze: { fill: 'var(--active-shape-color, #ff8e8e)', stroke: '#212121' },
    'cloze-inactive': { fill: 'var(--inactive-shape-color, #ffeba2)', stroke: '#212121' },
    'cloze-highlight': { fill: 'var(--highlight-shape-color, #ff8e8e00)', stroke: '#ff8e8e' },
} as const;

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const decodeAttribute = (value: string) => value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;
const turn = (degrees: number) => (degrees ? `;transform:rotate(${+degrees.toFixed(4)}deg)` : '');

/** The rendered `<div>`'s data attributes back as the shape Anki's script would read. */
function shapeFromAttributes(data: Record<string, string>): OcclusionShape {
    const names: Record<string, string> = { 'font-size': 'fs', occludeInactive: 'oi' };
    const properties = Object.entries(data)
        .filter(([name]) => name !== 'shape')
        .map(([name, value]) => ({ name: names[name] ?? name, value: name === 'text' ? decodeAttribute(value) : value }));
    return { ordinal: 0, kind: data.shape ?? '', properties };
}

function shapeHtml(kind: Kind, data: Record<string, string>): { mask: string; polygon: string; label: string } {
    const none = { mask: '', polygon: '', label: '' };
    const geometry = occlusionGeometry(shapeFromAttributes(data));
    if (!geometry) return none;
    const { stroke } = COLOURS[kind];
    const fill = kind === 'cloze-inactive' && data.fill ? escapeAttribute(data.fill) : COLOURS[kind].fill;
    const box = (left: number, top: number, width: number, height: number, round: boolean) =>
        `<div class="io-shape" style="left:${percent(left)};top:${percent(top)};width:${percent(width)};height:${percent(height)}`
        + `;background:${fill};border:1px solid ${stroke}${round ? ';border-radius:50%' : ''}${turn(geometry.angle)}"></div>`;
    switch (geometry.kind) {
        case 'rect':
            return { ...none, mask: box(geometry.left, geometry.top, geometry.width, geometry.height, false) };
        case 'ellipse':
            return { ...none, mask: box(geometry.left, geometry.top, geometry.rx * 2, geometry.ry * 2, true) };
        case 'polygon': {
            const dx = geometry.left - Math.min(...geometry.points.map(([x]) => x));
            const dy = geometry.top - Math.min(...geometry.points.map(([, y]) => y));
            const points = geometry.points.map(([x, y]) => `${+(x + dx).toFixed(6)},${+(y + dy).toFixed(6)}`).join(' ');
            return { ...none, polygon: `<polygon points="${points}" style="fill:${fill}" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>` };
        }
        case 'text': {
            const size = geometry.fs ? `${+(geometry.fs * geometry.scale * 100).toFixed(4)}cqh` : `${40 * geometry.scale}px`;
            const pad = `${+(5 * geometry.scale).toFixed(2)}px`;
            const colour = data.fill ? escapeAttribute(data.fill) : '#000';
            return {
                ...none,
                label: `<div class="io-label" style="left:${percent(geometry.left)};top:${percent(geometry.top)};font-size:${size}`
                    + `;padding:0 ${pad} ${pad} 0;color:${colour}${turn(geometry.angle)}">${escapeAttribute(geometry.text)}</div>`,
            };
        }
    }
}

export function withOcclusionMasks(html: string): string {
    if (!html.includes('<canvas id="image-occlusion-canvas"></canvas>')) return html;
    const drawn: Record<Kind, { masks: string; polygons: string; labels: string }> = {
        cloze: { masks: '', polygons: '', labels: '' },
        'cloze-inactive': { masks: '', polygons: '', labels: '' },
        'cloze-highlight': { masks: '', polygons: '', labels: '' },
    };
    let hidesOthers = false;
    for (const [, kind, attributes] of html.matchAll(SHAPE)) {
        const data = Object.fromEntries([...attributes.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value]));
        if (data.occludeInactive === '1') hidesOthers = true;
        if (kind === 'cloze-inactive' && data.occludeInactive !== '1') continue;
        const shape = shapeHtml(kind as Kind, data);
        drawn[kind as Kind].masks += shape.mask;
        drawn[kind as Kind].polygons += shape.polygon;
        drawn[kind as Kind].labels += shape.label;
    }
    // Anki paints the asked shapes first, then the hidden others, then the answered outlines.
    const order: Kind[] = ['cloze', 'cloze-inactive', 'cloze-highlight'];
    const masks = order.map((kind) => drawn[kind].masks).join('');
    const polygons = order.map((kind) => drawn[kind].polygons).join('');
    const labels = order.map((kind) => drawn[kind].labels).join('');
    const style = '<style>#image-occlusion-container{position:relative;display:inline-block;max-width:100%}'
        + '#image-occlusion-container img{display:block;max-width:100%}'
        + '#image-occlusion-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;container-type:size}'
        + '#image-occlusion-canvas .io-masks{position:absolute;inset:0}'
        + '#image-occlusion-canvas svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}'
        + '.io-shape{position:absolute;box-sizing:border-box;transform-origin:0 0}'
        + '.io-label{position:absolute;transform-origin:0 0;font-family:Arial;line-height:1.07;white-space:pre;background:#fff;text-align:left}'
        + 'body:has(#io-toggle:checked) .io-masks{display:none}'
        + `#toggle{-webkit-appearance:button;appearance:button;display:${hidesOthers ? 'inline-block' : 'none'};padding:2px 8px;cursor:pointer}</style>`;
    const canvas = '<div id="image-occlusion-canvas" aria-hidden="true"><div class="io-masks">'
        + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none">${polygons}</svg>${masks}</div>${labels}</div>`;
    return html
        .replace('<canvas id="image-occlusion-canvas"></canvas>', style + canvas)
        .replace('<button id="toggle">Toggle Masks</button>', '<label id="toggle"><input id="io-toggle" type="checkbox" hidden>Toggle Masks</label>');
}
