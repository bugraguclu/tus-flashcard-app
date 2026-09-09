/**
 * Metro needs a static require so the bundled catalog ships with every build. Keeping that one
 * call in its own module lets tests substitute the asset without touching the installer.
 *
 * Only the packed container is required here, and deliberately so: a second `require` for the
 * plain `.apkg` would make Metro bundle that file too, which would put the readable package back
 * inside every IPA. Regenerate the container with `npm run pack:catalog` whenever the catalog
 * changes — the build fails loudly if it is missing, which is the right failure.
 */
export function requireBkaCatalogAsset(): number {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../assets/catalog/bka-tus-complete.tuspack');
}
