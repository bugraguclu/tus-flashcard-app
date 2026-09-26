import type { useI18n } from '../../hooks/useI18n';

/** The two translation helpers the browser's pieces render their copy through. */
export type BrowserI18n = Pick<ReturnType<typeof useI18n>, 'l' | 't'>;
