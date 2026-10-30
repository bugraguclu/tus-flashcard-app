// Light and colour for a photo being edited: four sliders, a handful of ready-made looks, and the
// one colour matrix both of them come down to.
//
// The matrix is applied in linear light. That is what an SVG `feColorMatrix` does by default in a
// browser and what Core Image does on iOS, so the photo on screen and the exported file agree on
// both platforms, and it is also the space where exposure, white balance and saturation behave the
// way a camera's do.

export type PhotoAdjustmentKey = 'brightness' | 'contrast' | 'saturation' | 'warmth';
export type PhotoAdjustments = Record<PhotoAdjustmentKey, number>;

export const PHOTO_ADJUSTMENT_KEYS: PhotoAdjustmentKey[] = ['brightness', 'contrast', 'saturation', 'warmth'];
/** Every slider runs from −LIMIT to +LIMIT around zero, which leaves the photo as it was. */
export const PHOTO_ADJUSTMENT_LIMIT = 100;

export const NEUTRAL_PHOTO_ADJUSTMENTS: PhotoAdjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };

export type PhotoFilterId = 'original' | 'vivid' | 'document' | 'mono' | 'warm' | 'cool';

/** The ready-made looks. Each one is only a setting of the sliders, so it can be fine-tuned. */
export const PHOTO_FILTERS: { id: PhotoFilterId; adjustments: PhotoAdjustments }[] = [
    { id: 'original', adjustments: NEUTRAL_PHOTO_ADJUSTMENTS },
    { id: 'vivid', adjustments: { brightness: 0, contrast: 15, saturation: 40, warmth: 0 } },
    // A page photographed under a lamp: grey paper lifted to white, ink pressed to black.
    { id: 'document', adjustments: { brightness: 50, contrast: 70, saturation: -100, warmth: 0 } },
    { id: 'mono', adjustments: { brightness: 0, contrast: 15, saturation: -100, warmth: 0 } },
    { id: 'warm', adjustments: { brightness: 0, contrast: 0, saturation: 10, warmth: 45 } },
    { id: 'cool', adjustments: { brightness: 0, contrast: 0, saturation: 0, warmth: -45 } },
];

/** A slider value as it is stored: a whole number inside the slider's range. */
export function clampPhotoAdjustment(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-PHOTO_ADJUSTMENT_LIMIT, Math.min(PHOTO_ADJUSTMENT_LIMIT, Math.round(value)));
}

export function samePhotoAdjustments(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
    return PHOTO_ADJUSTMENT_KEYS.every((key) => a[key] === b[key]);
}

export function isNeutralPhotoAdjustments(adjustments: PhotoAdjustments): boolean {
    return samePhotoAdjustments(adjustments, NEUTRAL_PHOTO_ADJUSTMENTS);
}

/** The ready-made look the sliders are set to exactly, or null once one of them has been moved. */
export function photoFilterMatching(adjustments: PhotoAdjustments): PhotoFilterId | null {
    return PHOTO_FILTERS.find((filter) => samePhotoAdjustments(filter.adjustments, adjustments))?.id ?? null;
}

/** Rec. 709 luminance weights for linear RGB. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/** Photographic middle grey in linear light; contrast pivots on it. */
const CONTRAST_PIVOT = 0.18;

/**
 * The 4×5 colour matrix, row by row as `feColorMatrix` reads it, that applies the sliders — or
 * null when they leave the photo as it is, so an untouched photo is never filtered at all.
 *
 * The pixel goes through exposure (±1 stop), contrast about middle grey, saturation about its own
 * luminance, and then white balance, each of which is linear in linear light, so together they
 * are one matrix.
 */
export function photoColorMatrix(adjustments: PhotoAdjustments): number[] | null {
    if (isNeutralPhotoAdjustments(adjustments)) return null;
    const unit = (key: PhotoAdjustmentKey) => clampPhotoAdjustment(adjustments[key]) / PHOTO_ADJUSTMENT_LIMIT;
    const brightness = unit('brightness');
    const contrast = unit('contrast');
    const saturation = unit('saturation');
    const warmth = unit('warmth');

    const gain = 2 ** brightness;
    const slope = contrast >= 0 ? 1 + 0.75 * contrast : 1 + 0.5 * contrast;
    const saturationScale = saturation >= 0 ? 1 + 0.8 * saturation : 1 + saturation;
    const balance = [1 + 0.15 * warmth, 1, 1 - 0.15 * warmth];
    const offset = CONTRAST_PIVOT * (1 - slope);

    const matrix: number[] = [];
    for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
            const saturated = LUMA[column] * (1 - saturationScale) + (row === column ? saturationScale : 0);
            matrix.push(round(balance[row] * slope * gain * saturated));
        }
        matrix.push(0, round(balance[row] * offset));
    }
    matrix.push(0, 0, 0, 1, 0);
    return matrix;
}

function round(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

/** The matrix as the space-separated list `feColorMatrix` takes on every platform. */
export function photoColorMatrixValues(matrix: number[]): string {
    return matrix.join(' ');
}

function srgbToLinear(value: number): number {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

const TO_LINEAR = Float32Array.from({ length: 256 }, (_, index) => srgbToLinear(index / 255));
/** Fine enough that a byte survives the trip into linear light and back unchanged. */
const TO_SRGB_STEPS = 16383;
let toSrgbTable: Uint8Array | null = null;

function toSrgb(): Uint8Array {
    if (!toSrgbTable) {
        toSrgbTable = Uint8Array.from(
            { length: TO_SRGB_STEPS + 1 },
            (_, index) => Math.round(linearToSrgb(index / TO_SRGB_STEPS) * 255),
        );
    }
    return toSrgbTable;
}

/**
 * Apply a colour matrix to RGBA bytes in place, in linear light, the way the on-screen
 * `feColorMatrix` applies it. This is the web export's half of the bargain: the canvas it paints
 * the photo on has no filter of its own that can be trusted to match the preview.
 */
export function applyPhotoColorMatrix(pixels: Uint8ClampedArray | Uint8Array, matrix: number[]): void {
    if (matrix.length !== 20) return;
    const table = toSrgb();
    const encode = (value: number) => table[Math.round(Math.min(1, Math.max(0, value)) * TO_SRGB_STEPS)];
    const [
        m0, m1, m2, m3, m4,
        m5, m6, m7, m8, m9,
        m10, m11, m12, m13, m14,
        m15, m16, m17, m18, m19,
    ] = matrix;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const r = TO_LINEAR[pixels[index]];
        const g = TO_LINEAR[pixels[index + 1]];
        const b = TO_LINEAR[pixels[index + 2]];
        const a = pixels[index + 3] / 255;
        pixels[index] = encode(m0 * r + m1 * g + m2 * b + m3 * a + m4);
        pixels[index + 1] = encode(m5 * r + m6 * g + m7 * b + m8 * a + m9);
        pixels[index + 2] = encode(m10 * r + m11 * g + m12 * b + m13 * a + m14);
        pixels[index + 3] = Math.round(Math.min(1, Math.max(0, m15 * r + m16 * g + m17 * b + m18 * a + m19)) * 255);
    }
}
