/**
 * The dock's measurements (components/ui/Dock.tsx) as plain numbers: where it floats, the outline
 * of its panel with the notch its raised button sits in, and the room a list keeps for it. The
 * look follows Yemek Takibi's dock: a white panel clear of the screen's edges, rounder at the
 * bottom, with the main action raised into a notch at the middle of its top edge.
 */
export const DOCK = {
    /** The panel's height, under the raised button. */
    height: 68,
    /** The widest the panel grows in a wide window. */
    maxWidth: 480,
    /** Gap between the panel and the screen's sides. */
    sideInset: 12,
    /** The least gap under the panel; a home indicator's safe area is larger and wins. */
    minBottom: 12,
    /** Space between the raised button and the notch around it. */
    notchGap: 6,
    /** The rounding where the notch meets the panel's top edge. */
    notchFillet: 8,
    /** The panel's top corners. */
    topRadius: 28,
    /** Its bottom corners: rounder, as the screen's own corners are. */
    bottomRadius: 34,
    /** Room left over the last row of a list, above the raised button. */
    rowGap: 8,
    /** How far the shadow reaches under the panel, so hiding takes it off the screen too. */
    shadowReach: 24,
} as const;

/** Distance between the panel and the screen's bottom edge: clear of the home indicator. */
export function dockBottom(safeAreaBottom: number): number {
    return Math.max(DOCK.minBottom, safeAreaBottom);
}

/** Distance between the raised button's bottom edge and the screen's: its centre sits on the panel's top edge. */
export function dockButtonBottom(safeAreaBottom: number, buttonSize: number): number {
    return dockBottom(safeAreaBottom) + DOCK.height - buttonSize / 2;
}

/** Height of the dock from the screen's bottom edge to the top of its raised button. */
export function dockReach(safeAreaBottom: number, buttonSize: number): number {
    return dockBottom(safeAreaBottom) + DOCK.height + buttonSize / 2;
}

/** The room a list keeps under its last row, so that row can scroll clear of the dock. */
export function dockClearance(safeAreaBottom: number, buttonSize: number): number {
    return dockReach(safeAreaBottom, buttonSize) + DOCK.rowGap;
}

/** How far down the dock moves to leave the screen, its raised button and shadow included. */
export function dockHiddenOffset(safeAreaBottom: number, buttonSize: number): number {
    return dockReach(safeAreaBottom, buttonSize) + DOCK.shadowReach;
}

export interface DockNotch {
    /** Half the notch's width at the panel's edge, before the fillets. */
    halfWidth: number;
    /** How deep it reaches into the panel. */
    depth: number;
    /** The rounding of its two bottom corners. */
    radius: number;
}

/**
 * The notch around a raised button of `buttonSize` with `buttonRadius` corners whose centre sits on
 * the panel's top edge: the button's own shape grown by the gap, so the gap is even all round.
 */
export function dockNotch(buttonSize: number, buttonRadius: number): DockNotch {
    const halfWidth = buttonSize / 2 + DOCK.notchGap;
    return { halfWidth, depth: halfWidth, radius: Math.min(buttonRadius + DOCK.notchGap, halfWidth) };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The panel's outline as an SVG path, `width` × `height`, drawn `inset` inside its box so a stroke
 * of twice that width stays whole. With a `notch`, its top edge dips around the raised button at
 * the middle; a panel too narrow to hold the notch and its corners draws without it.
 */
export function dockOutlinePath(width: number, height: number, notch: DockNotch | null, inset = 0): string {
    const left = inset;
    const top = inset;
    const right = width - inset;
    const bottom = height - inset;
    if (right - left <= 0 || bottom - top <= 0) return '';
    const topRadius = Math.min(DOCK.topRadius, (right - left) / 2, (bottom - top) / 2);
    const bottomRadius = Math.min(DOCK.bottomRadius, (right - left) / 2, (bottom - top) - topRadius);
    const centre = width / 2;
    const fillet = DOCK.notchFillet;
    // The notch sits between the top corners and leaves some of the panel under its floor.
    const fits = notch !== null
        && centre - notch.halfWidth - fillet >= left + topRadius
        && top + notch.depth <= bottom - fillet;

    const parts: string[] = [`M ${round(left + topRadius)} ${round(top)}`];
    if (fits && notch) {
        const wallTop = top + fillet;
        const wallBottom = Math.max(wallTop, top + notch.depth - notch.radius);
        const floor = top + notch.depth;
        const leftWall = centre - notch.halfWidth;
        const rightWall = centre + notch.halfWidth;
        parts.push(
            `L ${round(leftWall - fillet)} ${round(top)}`,
            `A ${fillet} ${fillet} 0 0 1 ${round(leftWall)} ${round(wallTop)}`,
            `L ${round(leftWall)} ${round(wallBottom)}`,
            `A ${notch.radius} ${notch.radius} 0 0 0 ${round(leftWall + notch.radius)} ${round(floor)}`,
            `L ${round(rightWall - notch.radius)} ${round(floor)}`,
            `A ${notch.radius} ${notch.radius} 0 0 0 ${round(rightWall)} ${round(wallBottom)}`,
            `L ${round(rightWall)} ${round(wallTop)}`,
            `A ${fillet} ${fillet} 0 0 1 ${round(rightWall + fillet)} ${round(top)}`,
        );
    }
    parts.push(
        `L ${round(right - topRadius)} ${round(top)}`,
        `A ${round(topRadius)} ${round(topRadius)} 0 0 1 ${round(right)} ${round(top + topRadius)}`,
        `L ${round(right)} ${round(bottom - bottomRadius)}`,
        `A ${round(bottomRadius)} ${round(bottomRadius)} 0 0 1 ${round(right - bottomRadius)} ${round(bottom)}`,
        `L ${round(left + bottomRadius)} ${round(bottom)}`,
        `A ${round(bottomRadius)} ${round(bottomRadius)} 0 0 1 ${round(left)} ${round(bottom - bottomRadius)}`,
        `L ${round(left)} ${round(top + topRadius)}`,
        `A ${round(topRadius)} ${round(topRadius)} 0 0 1 ${round(left + topRadius)} ${round(top)}`,
        'Z',
    );
    return parts.join(' ');
}
