import { updateAnkiCardData } from './fsrsCardData';
/** Progress-free interchange keeps opaque add-on data, never remembered scheduling state. */
export function withoutPackageSchedulingData(raw: string | undefined): string {
    return updateAnkiCardData(raw, { originalPosition: null, stability: null, difficulty: null,
        desiredRetention: null, decay: null, lastReviewTimeSecs: null }) ?? '';
}
