export type ReviewerSurface = 'none' | 'tools' | 'flag';

/** A toolbar action owns its own modal surface; it never inherits a sibling's internal view. */
export function openReviewerSurface(surface: Exclude<ReviewerSurface, 'none'>): ReviewerSurface {
    return surface;
}

/** Dismissing one surface cannot turn it into the other toolbar action. */
export function closeReviewerSurface(current: ReviewerSurface, closing: Exclude<ReviewerSurface, 'none'>): ReviewerSurface {
    return current === closing ? 'none' : current;
}

