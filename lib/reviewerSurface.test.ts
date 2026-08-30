import { describe, expect, it } from 'vitest';
import { closeReviewerSurface, openReviewerSurface } from './reviewerSurface';

describe('reviewer toolbar surfaces', () => {
    it('keeps Flag and Tools as separate destinations', () => {
        expect(openReviewerSurface('flag')).toBe('flag');
        expect(openReviewerSurface('tools')).toBe('tools');
    });

    it('closes Flag to no surface rather than opening Tools', () => {
        expect(closeReviewerSurface('flag', 'flag')).toBe('none');
        expect(closeReviewerSurface('tools', 'flag')).toBe('tools');
    });
});

