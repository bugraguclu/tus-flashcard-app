/**
 * Image Occlusion shapes as Anki stores them in a note's `Occlusion` field.
 *
 * Each shape is one cloze deletion, `{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}`,
 * and Anki's own editor ends each one with `<br>`. Positions and sizes are fractions of the image
 * (x of its width, y of its height); `fs` is a text size as a fraction of the image height and
 * `angle` a turn in ten-thousandths. Shapes that share a cloze number are asked together; a text
 * label is `c0` and never makes a card of its own. `oi=1` on a shape is "hide all, guess one".
 *
 * The grammar, measured in Anki 26.09.3 (scripts/anki-oracle): after the shape name each property
 * is `name=value`, the name running to the first `=` and the value to the next unescaped `:`. A
 * value escapes `:` and `\` with a backslash; any other backslash ends the shape's properties
 * there, and a trailing piece without `=` is dropped. Numbers are written with four decimals and
 * their leading and trailing zeros left off (`0.1` is `.1`, `0` is `.0000`, `1` is `1.`).
 *
 * Editing keeps what it does not change: a shape the learner did not touch is written back as the
 * exact text it was read from, and a touched one keeps the order of its properties and any
 * property this app does not know.
 */

export type OcclusionShapeKind = 'rect' | 'ellipse' | 'polygon' | 'text';

export interface OcclusionProperty {
    name: string;
    /** The unescaped value. */
    value: string;
}

export interface OcclusionShape {
    /** The cloze number; 0 for a text label. */
    ordinal: number;
    /** `rect`, `ellipse`, `polygon` or `text`; anything else is kept as it was read. */
    kind: string;
    properties: OcclusionProperty[];
    /** The exact deletion this shape was read from; cleared once the shape changes. */
    source?: string;
}

/** Anki's default fills: a mask without `fill` is drawn in this colour, a text label in black. */
export const OCCLUSION_DEFAULT_FILL = '#ffeba2';
export const OCCLUSION_TEXT_DEFAULT_FILL = '#000000';
/** Anki's editor makes text 40 image pixels tall unless it is resized. */
export const OCCLUSION_DEFAULT_TEXT_PIXELS = 40;

const ANGLE_UNITS = 10000;
const DELETION = /\{\{c(\d+)(?:,\d+)*::image-occlusion:([\s\S]*?)\}\}/g;

/** The properties after the shape name, read the way Anki reads them. */
export function parseOcclusionProperties(text: string): OcclusionProperty[] {
    const properties: OcclusionProperty[] = [];
    let index = 0;
    while (index < text.length) {
        const equals = text.indexOf('=', index);
        if (equals < 0) break;
        const name = text.slice(index, equals);
        let value = '';
        let cursor = equals + 1;
        let ended = false;
        while (cursor < text.length) {
            const char = text[cursor];
            if (char === '\\') {
                const next = text[cursor + 1];
                if (next !== ':' && next !== '\\') return properties;
                value += next;
                cursor += 2;
                continue;
            }
            if (char === ':') {
                ended = true;
                break;
            }
            value += char;
            cursor++;
        }
        properties.push({ name, value });
        index = ended ? cursor + 1 : cursor;
    }
    return properties;
}

/** The text after `image-occlusion:` as a shape name and its properties. */
export function parseOcclusionBody(body: string): { kind: string; properties: OcclusionProperty[] } {
    // Anki names a shape only when a colon follows the name: `image-occlusion:rect` is no shape.
    const colon = body.indexOf(':');
    if (colon < 0) return { kind: '', properties: [] };
    return { kind: body.slice(0, colon), properties: parseOcclusionProperties(body.slice(colon + 1)) };
}

/** Every occlusion deletion in an `Occlusion` field, in field order. */
export function parseOcclusionField(field: string): OcclusionShape[] {
    const shapes: OcclusionShape[] = [];
    for (const match of field.matchAll(DELETION)) {
        const { kind, properties } = parseOcclusionBody(match[2]);
        shapes.push({ ordinal: Number(match[1]), kind, properties, source: match[0] });
    }
    return shapes;
}

const escapeValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

/** One shape as its deletion text: its source when untouched, otherwise rebuilt. */
export function serializeOcclusionShape(shape: OcclusionShape): string {
    if (shape.source) return shape.source;
    const properties = shape.properties.map((property) => `:${property.name}=${escapeValue(property.value)}`).join('');
    return `{{c${shape.ordinal}::image-occlusion:${shape.kind}${properties}}}`;
}

/** The `Occlusion` field for these shapes, each followed by `<br>` as Anki's editor writes it. */
export function serializeOcclusionField(shapes: readonly OcclusionShape[]): string {
    return shapes.map((shape) => `${serializeOcclusionShape(shape)}<br>`).join('');
}

/** A number as Anki writes a position or size: four decimals, outer zeros left off. */
export function formatOcclusionNumber(value: number): string {
    if (!Number.isFinite(value) || value === 0) return '.0000';
    let text = value.toFixed(4);
    while (text.startsWith('0')) text = text.slice(1);
    while (text.endsWith('0')) text = text.slice(0, -1);
    return text;
}

/** Degrees as Anki stores an angle (ten-thousandths of a turn), or null when there is none. */
export function occlusionAngleUnits(degrees: number): string | null {
    const units = Math.round(((degrees % 360) / 360) * ANGLE_UNITS) % ANGLE_UNITS;
    return Number.isFinite(units) && units !== 0 ? String(units) : null;
}

/** A stored angle in degrees, read as Anki's occlusion script reads it. */
export function occlusionAngleDegrees(units: string | undefined): number {
    const turn = Number(units) % ANGLE_UNITS;
    return Number.isFinite(turn) ? (turn / ANGLE_UNITS) * 360 : 0;
}

export function occlusionProperty(shape: OcclusionShape, name: string): string | undefined {
    return shape.properties.find((property) => property.name === name)?.value;
}

/**
 * The shape with these properties set (a string) or removed (null). A property already present
 * keeps its place; a new one goes before `oi`, where Anki writes it.
 */
export function withOcclusionProperties(shape: OcclusionShape, changes: Record<string, string | null>): OcclusionShape {
    const properties: OcclusionProperty[] = [];
    const pending = new Map(Object.entries(changes));
    for (const property of shape.properties) {
        if (!pending.has(property.name)) {
            properties.push(property);
            continue;
        }
        const value = pending.get(property.name);
        pending.delete(property.name);
        if (value !== null && value !== undefined) properties.push({ name: property.name, value });
    }
    const added = [...pending].filter((entry): entry is [string, string] => entry[1] !== null);
    if (added.length) {
        const oi = properties.findIndex((property) => property.name === 'oi');
        const at = oi < 0 ? properties.length : oi;
        properties.splice(at, 0, ...added.map(([name, value]) => ({ name, value })));
    }
    const same = properties.length === shape.properties.length
        && properties.every((property, index) => property.name === shape.properties[index].name && property.value === shape.properties[index].value);
    return same ? shape : { ordinal: shape.ordinal, kind: shape.kind, properties };
}

/** Whether the note hides every shape while one is asked: Anki's reading is "any shape has oi=1". */
export function occludesInactive(shapes: readonly OcclusionShape[]): boolean {
    return shapes.some((shape) => occlusionProperty(shape, 'oi') === '1');
}

/** Anki's editor sets or clears `oi=1` on every shape of the note at once. */
export function setOccludesInactive(shapes: readonly OcclusionShape[], on: boolean): OcclusionShape[] {
    return shapes.map((shape) => withOcclusionProperties(shape, { oi: on ? '1' : null }));
}

/**
 * The cloze number Anki's editor gives a new mask: the lowest number missing below the highest
 * one in use, otherwise one past it.
 */
export function nextOcclusionOrdinal(shapes: readonly OcclusionShape[]): number {
    const used = new Set(shapes.map((shape) => shape.ordinal));
    const highest = Math.max(0, ...used);
    for (let ordinal = 1; ordinal <= highest; ordinal++) if (!used.has(ordinal)) return ordinal;
    return highest + 1;
}

/** Geometry in image fractions; text size is a fraction of the image height before `scale`. */
export type OcclusionGeometry =
    | { kind: 'rect'; left: number; top: number; width: number; height: number; angle: number }
    | { kind: 'ellipse'; left: number; top: number; rx: number; ry: number; angle: number }
    | { kind: 'polygon'; left: number; top: number; points: [number, number][]; angle: number }
    | { kind: 'text'; left: number; top: number; text: string; scale: number; fs: number | null; angle: number };

const num = (value: string | undefined, fallback = 0) => {
    const parsed = Number(value);
    return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

export function occlusionGeometry(shape: OcclusionShape): OcclusionGeometry | null {
    const get = (name: string) => occlusionProperty(shape, name);
    const left = num(get('left'));
    const top = num(get('top'));
    const angle = occlusionAngleDegrees(get('angle'));
    switch (shape.kind) {
        case 'rect':
            return { kind: 'rect', left, top, width: num(get('width')), height: num(get('height')), angle };
        case 'ellipse':
            return { kind: 'ellipse', left, top, rx: num(get('rx')), ry: num(get('ry')), angle };
        case 'polygon': {
            const points = (get('points') || '0,0').split(' ').map((pair) => {
                const [x, y] = pair.split(',');
                return [num(x), num(y)] as [number, number];
            });
            return { kind: 'polygon', left, top, points, angle };
        }
        case 'text': {
            const fs = get('fs');
            return { kind: 'text', left, top, text: get('text') ?? '', scale: num(get('scale'), 1), fs: fs ? num(fs) : null, angle };
        }
        default:
            return null;
    }
}

/** The fill a shape carries, or null for Anki's default. */
export function occlusionFill(shape: OcclusionShape): string | null {
    return occlusionProperty(shape, 'fill') ?? null;
}

/** A new shape with its properties in the order Anki's editor writes them. */
export function createOcclusionShape(geometry: OcclusionGeometry, ordinal: number, hideAll: boolean): OcclusionShape {
    const f = formatOcclusionNumber;
    const properties: OcclusionProperty[] = [
        { name: 'left', value: f(geometry.left) },
        { name: 'top', value: f(geometry.top) },
    ];
    const angle = occlusionAngleUnits(geometry.angle);
    if (angle) properties.push({ name: 'angle', value: angle });
    switch (geometry.kind) {
        case 'rect':
            properties.push({ name: 'width', value: f(geometry.width) }, { name: 'height', value: f(geometry.height) });
            break;
        case 'ellipse':
            properties.push({ name: 'rx', value: f(geometry.rx) }, { name: 'ry', value: f(geometry.ry) });
            break;
        case 'polygon':
            properties.push({ name: 'points', value: geometry.points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ') });
            break;
        case 'text':
            properties.push({ name: 'text', value: geometry.text }, { name: 'scale', value: f(geometry.scale) });
            if (geometry.fs !== null) properties.push({ name: 'fs', value: f(geometry.fs) });
            break;
    }
    if (hideAll) properties.push({ name: 'oi', value: '1' });
    return { ordinal: geometry.kind === 'text' ? 0 : ordinal, kind: geometry.kind, properties };
}

/** The shape moved by a fraction of the image; untouched properties keep their text. */
export function moveOcclusionShape(shape: OcclusionShape, dx: number, dy: number): OcclusionShape {
    const geometry = occlusionGeometry(shape);
    if (!geometry || (dx === 0 && dy === 0)) return shape;
    const f = formatOcclusionNumber;
    const changes: Record<string, string> = { left: f(geometry.left + dx), top: f(geometry.top + dy) };
    if (geometry.kind === 'polygon') {
        changes.points = geometry.points.map(([x, y]) => `${f(x + dx)},${f(y + dy)}`).join(' ');
    }
    return withOcclusionProperties(shape, changes);
}

/** A rect or ellipse given a new box (image fractions); other shapes come back unchanged. */
export function resizeOcclusionShape(shape: OcclusionShape, box: { left: number; top: number; width: number; height: number }): OcclusionShape {
    const f = formatOcclusionNumber;
    if (shape.kind === 'rect') {
        return withOcclusionProperties(shape, { left: f(box.left), top: f(box.top), width: f(box.width), height: f(box.height) });
    }
    if (shape.kind === 'ellipse') {
        return withOcclusionProperties(shape, { left: f(box.left), top: f(box.top), rx: f(box.width / 2), ry: f(box.height / 2) });
    }
    return shape;
}

/** A shape's fill set to a colour, or back to Anki's default (null). */
export function setOcclusionFill(shape: OcclusionShape, fill: string | null): OcclusionShape {
    return withOcclusionProperties(shape, { fill });
}

/** A polygon's points where Anki draws them: moved so their top-left corner is the shape's `left`/`top`. */
export function placedPolygonPoints(geometry: Extract<OcclusionGeometry, { kind: 'polygon' }>): [number, number][] {
    const dx = geometry.left - Math.min(...geometry.points.map(([x]) => x));
    const dy = geometry.top - Math.min(...geometry.points.map(([, y]) => y));
    return geometry.points.map(([x, y]) => [x + dx, y + dy]);
}

/** A polygon given new points (image fractions), its `left`/`top` their top-left corner. */
export function setOcclusionPolygonPoints(shape: OcclusionShape, points: readonly [number, number][]): OcclusionShape {
    if (shape.kind !== 'polygon' || points.length < 3) return shape;
    const f = formatOcclusionNumber;
    return withOcclusionProperties(shape, {
        left: f(Math.min(...points.map(([x]) => x))),
        top: f(Math.min(...points.map(([, y]) => y))),
        points: points.map(([x, y]) => `${f(x)},${f(y)}`).join(' '),
    });
}

const turnVector = (x: number, y: number, degrees: number): [number, number] => {
    const radians = (degrees * Math.PI) / 180;
    return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
};

/**
 * The shape turned by `degrees` (clockwise) about its centre. A box or label keeps its size and its
 * centre: its `angle` changes and its top-left corner, which Anki turns it about, moves. A polygon's
 * points are turned instead, so it needs no `angle`. `natural` is the image in pixels, so a turn
 * stays square on a picture of any shape; `extent` is a label's unturned size in image fractions,
 * which only the screen can measure (without it a label turns about its corner).
 */
export function rotateOcclusionShape(
    shape: OcclusionShape,
    degrees: number,
    natural: { width: number; height: number },
    extent?: { width: number; height: number },
): OcclusionShape {
    const geometry = occlusionGeometry(shape);
    const width = Math.max(1, natural.width);
    const height = Math.max(1, natural.height);
    if (!geometry || !Number.isFinite(degrees) || degrees % 360 === 0) return shape;
    if (geometry.kind === 'polygon') {
        const placed = placedPolygonPoints(geometry).map(([x, y]) => [x * width, y * height]);
        const xs = placed.map(([x]) => x);
        const ys = placed.map(([, y]) => y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        return setOcclusionPolygonPoints(shape, placed.map(([x, y]) => {
            const [tx, ty] = turnVector(x - cx, y - cy, degrees);
            return [(cx + tx) / width, (cy + ty) / height];
        }));
    }
    const size = geometry.kind === 'rect' ? { width: geometry.width, height: geometry.height }
        : geometry.kind === 'ellipse' ? { width: geometry.rx * 2, height: geometry.ry * 2 }
            : extent ?? { width: 0, height: 0 };
    const halfX = (size.width * width) / 2;
    const halfY = (size.height * height) / 2;
    const [fromX, fromY] = turnVector(halfX, halfY, geometry.angle);
    const centreX = geometry.left * width + fromX;
    const centreY = geometry.top * height + fromY;
    const angle = (((geometry.angle + degrees) % 360) + 360) % 360;
    const [toX, toY] = turnVector(halfX, halfY, angle);
    const f = formatOcclusionNumber;
    return withOcclusionProperties(shape, {
        left: f((centreX - toX) / width),
        top: f((centreY - toY) / height),
        angle: occlusionAngleUnits(angle),
    });
}

/** The selected masks asked together under the lowest of their numbers. Text labels stay `c0`. */
export function groupOcclusionShapes(shapes: readonly OcclusionShape[], selected: ReadonlySet<number>): OcclusionShape[] {
    const ordinals = shapes.filter((shape, index) => selected.has(index) && shape.kind !== 'text').map((shape) => shape.ordinal);
    if (ordinals.length < 2) return [...shapes];
    const target = Math.min(...ordinals);
    return shapes.map((shape, index) => (selected.has(index) && shape.kind !== 'text' && shape.ordinal !== target
        ? { ordinal: target, kind: shape.kind, properties: shape.properties }
        : shape));
}

/** Each selected mask that shares its number with another one gets a number of its own. */
export function ungroupOcclusionShapes(shapes: readonly OcclusionShape[], selected: ReadonlySet<number>): OcclusionShape[] {
    const next = [...shapes];
    // A number an unselected shape keeps is taken; otherwise the first selected shape keeps it.
    const taken = new Set(shapes.filter((shape, index) => !selected.has(index)).map((shape) => shape.ordinal));
    next.forEach((shape, index) => {
        if (!selected.has(index) || shape.kind === 'text') return;
        if (!taken.has(shape.ordinal)) {
            taken.add(shape.ordinal);
            return;
        }
        next[index] = { ordinal: nextOcclusionOrdinal(next), kind: shape.kind, properties: shape.properties };
    });
    return next;
}

/** The file an `Image` field shows: the first `<img src="…">`, its entities decoded. */
export function occlusionImageFilename(imageField: string): string | null {
    const match = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(imageField);
    const raw = match ? match[1] ?? match[2] ?? match[3] ?? '' : '';
    if (!raw) return null;
    return raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** The `Image` field Anki writes for a picked image. */
export function occlusionImageField(filename: string): string {
    return `<img src="${filename.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">`;
}
