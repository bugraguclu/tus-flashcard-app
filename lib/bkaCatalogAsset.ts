/**
 * Metro needs a static require so the bundled Anki package ships with every build. Keeping that
 * one call in its own module lets tests substitute the asset without touching the installer.
 */
export function requireBkaCatalogAsset(): number {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../assets/catalog/bka-tus-complete.apkg');
}
