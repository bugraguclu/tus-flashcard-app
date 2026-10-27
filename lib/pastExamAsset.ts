import type { PastExamManifest } from './pastExamPack';

export interface BundledPastExamPack {
    manifest: PastExamManifest;
    /** Metro asset id of the zip, for `Asset.fromModule`. */
    assetModule: number;
}

/**
 * The past-exam pack built into this copy of the app, or null when it has none.
 *
 * The questions are ÖSYM's. `npm run build:past-exams` writes the pack with a
 * loader under `assets/catalog/`, and metro.config.js resolves `tus-past-exam-pack` to that loader
 * when it exists and to an empty module when it does not. Restart Metro with `--clear` after
 * building or deleting the pack.
 */
export function loadBundledPastExamPack(): BundledPastExamPack | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const source = require('tus-past-exam-pack') as { manifest?: PastExamManifest; asset?: number } | null;
        if (!source?.manifest || source.asset === undefined) return null;
        return { manifest: source.manifest, assetModule: source.asset };
    } catch {
        return null;
    }
}
