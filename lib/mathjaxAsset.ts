/**
 * Metro needs a static require so the vendored MathJax (lib/mathjax.ts) ships with every build.
 * Keeping the one call in its own module lets tests stand in for the asset.
 */
export function requireMathJaxAsset(): number | string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../assets/mathjax/tex-svg-full.js.txt');
}
