/**
 * react-native-svg for vitest (node). The real package ships syntax vite cannot parse. Each export
 * renders as a host element named after it, so a screen test can render a screen that draws icons
 * without mocking every glyph module. Wired up via the resolve.alias entry in vitest.config.ts.
 */

const Svg = 'Svg';
export default Svg;
export { Svg };
export const Circle = 'Circle';
export const ClipPath = 'ClipPath';
export const Defs = 'Defs';
export const Ellipse = 'Ellipse';
export const FeColorMatrix = 'FeColorMatrix';
export const Filter = 'Filter';
export const G = 'G';
export const Image = 'SvgImage';
export const Line = 'Line';
export const LinearGradient = 'LinearGradient';
export const Path = 'Path';
export const Polygon = 'Polygon';
export const Polyline = 'Polyline';
export const RadialGradient = 'RadialGradient';
export const Rect = 'Rect';
export const Stop = 'Stop';
export const Text = 'SvgText';
export const TSpan = 'TSpan';
