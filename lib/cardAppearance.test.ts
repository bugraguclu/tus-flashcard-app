import { describe, expect, it } from 'vitest';
import { reviewerSurfaceCss } from './cardAppearance';

describe('reviewerSurfaceCss', () => {
    it('replaces a catalog card background with the light reviewer surface', () => {
        expect(reviewerSurfaceCss({
            catalogPack: 'bka-tus',
            surfaceColor: '#ffffff',
            plainFrame: false,
        })).toBe(
            'html,body{background:#ffffff!important;}.card.card,#qa{background:transparent!important;}',
        );
    });

    it('uses the active dark reviewer surface for catalog cards', () => {
        expect(reviewerSurfaceCss({
            catalogPack: 'bka-tus',
            surfaceColor: '#2a3832',
            plainFrame: false,
        })).toContain('background:#2a3832!important');
    });

    it('preserves the authored background of a user-imported deck', () => {
        expect(reviewerSurfaceCss({
            surfaceColor: '#ffffff',
            plainFrame: false,
        })).toBe('');
    });

    it('keeps plain card frames transparent regardless of their source', () => {
        expect(reviewerSurfaceCss({
            catalogPack: 'bka-tus',
            surfaceColor: '#ffffff',
            plainFrame: true,
        })).toBe(
            'html,body{background:transparent!important;}.card.card,#qa{background:transparent!important;}',
        );
    });
});
