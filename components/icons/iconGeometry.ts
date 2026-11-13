/**
 * Path builders for glyphs whose geometry is easier to state than to type: circles inside a
 * single path (for even-odd holes), arcs given by angle, stars and gears. Angles are in
 * degrees, measured clockwise from 3 o'clock, as SVG's y axis points down.
 */

function n(value: number): string {
    return String(Math.round(value * 100) / 100);
}

export function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
    const radians = (degrees * Math.PI) / 180;
    return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

/** A full circle as path data, so it can share a path (and an even-odd fill) with other shapes. */
export function circle(cx: number, cy: number, r: number): string {
    return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
}

/** A rounded rectangle as path data, drawn clockwise from the top edge. */
export function roundedRect(x: number, y: number, width: number, height: number, r: number): string {
    return `M${n(x + r)} ${n(y)}h${n(width - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(height - 2 * r)}`
        + `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(width - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}`
        + `v${n(-(height - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`;
}

/** An open arc from one angle to another, travelling clockwise or anticlockwise. */
export function arc(cx: number, cy: number, r: number, from: number, to: number, clockwise = true): string {
    const [x1, y1] = polar(cx, cy, r, from);
    const [x2, y2] = polar(cx, cy, r, to);
    const sweep = clockwise ? (to - from + 360) % 360 : (from - to + 360) % 360;
    return `M${n(x1)} ${n(y1)}A${n(r)} ${n(r)} 0 ${sweep > 180 ? 1 : 0} ${clockwise ? 1 : 0} ${n(x2)} ${n(y2)}`;
}

/** A star with `points` tips, the first pointing straight up. */
export function star(cx: number, cy: number, outer: number, inner: number, points = 5): string {
    const step = 180 / points;
    let d = '';
    for (let i = 0; i < points * 2; i += 1) {
        const [x, y] = polar(cx, cy, i % 2 === 0 ? outer : inner, -90 + i * step);
        d += `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`;
    }
    return `${d}Z`;
}

/**
 * A gear's outline: `teeth` flat-topped teeth between radius `root` and `tip`, each `tipWidth`
 * degrees wide at the tip and `rootWidth` degrees wide where it leaves the body.
 */
export function gear(cx: number, cy: number, tip: number, root: number, teeth: number, tipWidth: number, rootWidth: number): string {
    const pitch = 360 / teeth;
    let d = '';
    for (let i = 0; i < teeth; i += 1) {
        const centre = -90 + i * pitch;
        const [ax, ay] = polar(cx, cy, root, centre - rootWidth / 2);
        const [bx, by] = polar(cx, cy, tip, centre - tipWidth / 2);
        const [ex, ey] = polar(cx, cy, tip, centre + tipWidth / 2);
        const [fx, fy] = polar(cx, cy, root, centre + rootWidth / 2);
        const [gx, gy] = polar(cx, cy, root, centre + pitch - rootWidth / 2);
        d += `${i === 0 ? `M${n(ax)} ${n(ay)}` : ''}L${n(bx)} ${n(by)}A${n(tip)} ${n(tip)} 0 0 1 ${n(ex)} ${n(ey)}`
            + `L${n(fx)} ${n(fy)}A${n(root)} ${n(root)} 0 0 1 ${n(gx)} ${n(gy)}`;
    }
    return `${d}Z`;
}
