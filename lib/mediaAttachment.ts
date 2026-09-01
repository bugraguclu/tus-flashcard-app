/** Matches any media reference a field can carry (image/video/audio tag or [sound:] marker). */
export const FIELD_MEDIA_RE = /<img\b|<video\b|<audio\b|<a\b[^>]*\bhref=|\[sound:/i;
