interface ReviewerSurfaceCssOptions {
    catalogPack?: string;
    surfaceColor: string;
    plainFrame: boolean;
}

/**
 * Curated catalog decks are part of the app's own visual system, so their legacy Anki page
 * background follows the active reviewer theme. User-imported decks keep their authored card
 * background exactly as-is.
 */
export function reviewerSurfaceCss({
    catalogPack,
    surfaceColor,
    plainFrame,
}: ReviewerSurfaceCssOptions): string {
    if (plainFrame) {
        return 'html,body{background:transparent!important;}.card.card,#qa{background:transparent!important;}';
    }

    if (!catalogPack) return '';

    return `html,body{background:${surfaceColor}!important;}.card.card,#qa{background:transparent!important;}`;
}
