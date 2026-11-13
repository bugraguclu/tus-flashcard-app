/**
 * Paths for shapes drawn at an angle — a capsule, a polygon turned about a point — computed here
 * instead of with SVG transforms, so the Kronometre's ring knob and its subject pictures render
 * the same on iPhone and on the web.
 */

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A capsule (a rectangle with round ends) centred on (cx, cy), `length` long including its round
 * ends and `2 * radius` thick, its long side turned `angleDeg` clockwise from the x axis.
 */
export function capsulePath(cx: number, cy: number, length: number, radius: number, angleDeg: number): string {
    const angle = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const half = Math.max(0, length / 2 - radius);
    const [nx, ny] = [-dy * radius, dx * radius];
    const p1 = [cx - dx * half, cy - dy * half];
    const p2 = [cx + dx * half, cy + dy * half];
    const r = round(radius);
    return [
        `M ${round(p1[0]! + nx)} ${round(p1[1]! + ny)}`,
        `L ${round(p2[0]! + nx)} ${round(p2[1]! + ny)}`,
        `A ${r} ${r} 0 0 0 ${round(p2[0]! - nx)} ${round(p2[1]! - ny)}`,
        `L ${round(p1[0]! - nx)} ${round(p1[1]! - ny)}`,
        `A ${r} ${r} 0 0 0 ${round(p1[0]! + nx)} ${round(p1[1]! + ny)}`,
        'Z',
    ].join(' ');
}

/**
 * The half of a capsule from its start to its middle, to colour one end of a two-tone pill. Same
 * arguments as `capsulePath`.
 */
export function halfCapsulePath(cx: number, cy: number, length: number, radius: number, angleDeg: number): string {
    const angle = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const half = Math.max(0, length / 2 - radius);
    const [nx, ny] = [-dy * radius, dx * radius];
    const p1 = [cx - dx * half, cy - dy * half];
    const r = round(radius);
    return [
        `M ${round(cx + nx)} ${round(cy + ny)}`,
        `L ${round(cx - nx)} ${round(cy - ny)}`,
        `L ${round(p1[0]! - nx)} ${round(p1[1]! - ny)}`,
        `A ${r} ${r} 0 0 0 ${round(p1[0]! + nx)} ${round(p1[1]! + ny)}`,
        'Z',
    ].join(' ');
}

/** A closed polygon through `points`, each turned `angleDeg` clockwise about (cx, cy). */
export function turnedPolygon(points: readonly (readonly [number, number])[], cx: number, cy: number, angleDeg: number): string {
    const angle = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return points
        .map(([x, y], index) => {
            const tx = cx + (x - cx) * cos - (y - cy) * sin;
            const ty = cy + (x - cx) * sin + (y - cy) * cos;
            return `${index === 0 ? 'M' : 'L'} ${round(tx)} ${round(ty)}`;
        })
        .join(' ') + ' Z';
}
