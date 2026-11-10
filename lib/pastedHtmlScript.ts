/*
 * What a paste keeps, as source the field's own document runs.
 *
 * A browser copies text together with the look it had on its page: every run arrives wrapped in
 * `style="color: rgb(0, 0, 0); font-family: …; font-size: 12px; background-color: rgb(255, 255,
 * 255)"`. Left in a field, that look follows the text onto the card: the pasted sentence is smaller
 * than the one typed beside it, and in the dark theme it is black on black, or sits on a white
 * slab. Anki filters a paste for the same reason (ts/lib/html-filter, behaviour only): structure
 * and emphasis stay, the source page's typography does not.
 *
 * Kept: bold, italic, underline, strike-through, sub/superscript, lists, tables, headings, links,
 * pictures, line and paragraph breaks, alignment, and a colour or highlight that is really a
 * colour. Dropped: fonts, sizes, spacing, classes and ids, scripts and embeds, and the blacks,
 * whites and greys that are only a page's own text and paper.
 *
 * The filter runs inside the field, in the paste event itself. Sent to the app and back, the
 * pasted text reached the field a moment later, and a save pressed in that moment wrote the note
 * without it. It is therefore plain script text (no template interpolation, nothing an inline
 * script element could mistake for markup); `lib/pastedHtml.ts` evaluates the same text for tests.
 */
export const PASTED_HTML_FILTER_SCRIPT = String.raw`
function createTusPasteFilter() {
  function setOf(words) {
    var set = {};
    words.split(' ').forEach(function (word) { set[word] = 1; });
    return set;
  }
  function has(map, key) { return Object.prototype.hasOwnProperty.call(map, key); }

  var VOID_TAGS = setOf('br hr img source wbr');
  // Removed together with everything inside them.
  var REMOVED_WITH_CONTENT = setOf('script style head title iframe object embed noscript template xml svg math select textarea button canvas');
  var KEPT_TAGS = setOf('b strong i em u s strike del ins sub sup mark small code kbd a span font br img ruby rt rp'
    + ' p div ul ol li table thead tbody tfoot tr td th caption h1 h2 h3 h4 h5 h6 blockquote pre hr dl dt dd'
    + ' audio video source anki-mathjax');
  // Sectioning tags a card has no use for; they still separate lines, so each becomes a div.
  var BLOCK_AS_DIV = setOf('article section header footer main aside nav address figure figcaption details summary center fieldset');
  var ATTRIBUTES_BY_TAG = {
    a: ['href'],
    img: ['src', 'alt', 'width', 'height', 'data-tus-src'],
    audio: ['src', 'controls', 'data-tus-src'],
    video: ['src', 'controls', 'data-tus-src'],
    source: ['src', 'type', 'data-tus-src'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    ol: ['start', 'type'],
    li: ['value'],
    table: ['border'],
    'anki-mathjax': ['block']
  };
  var NUMERIC_ATTRIBUTES = setOf('width height colspan rowspan start value border');
  var TABLE_TAGS = setOf('table td th');
  var ACHROMATIC_NAMES = setOf('black white gray grey silver dimgray dimgrey darkgray darkgrey lightgray lightgrey gainsboro'
    + ' whitesmoke snow ivory ghostwhite slategray slategrey darkslategray darkslategrey lightslategray lightslategrey'
    + ' transparent inherit initial unset revert currentcolor windowtext canvastext canvas window none auto');
  // A text colour is kept when it is a colour: black, white and greys are a page's own ink.
  var MIN_TEXT_COLOUR_SPREAD = 48;
  // A background is kept when it is a highlight: paper, tinted boxes and code panels are not.
  var MIN_HIGHLIGHT_SPREAD = 96;

  function spreadOf(r, g, b) { return Math.max(r, g, b) - Math.min(r, g, b); }

  // How far apart a colour's channels are (0 for a grey, 255 for a pure hue), or null when the
  // value cannot be read as one colour. A named colour that is not a grey counts as a full hue.
  function colourSpread(raw) {
    var value = String(raw).trim().toLowerCase();
    if (!value) return null;
    if (has(ACHROMATIC_NAMES, value)) return 0;
    var hex = value.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
      var digits = hex[1];
      if (digits.length === 3 || digits.length === 4) {
        return spreadOf(parseInt(digits[0] + digits[0], 16), parseInt(digits[1] + digits[1], 16), parseInt(digits[2] + digits[2], 16));
      }
      if (digits.length === 6 || digits.length === 8) {
        return spreadOf(parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16));
      }
      return null;
    }
    var rgb = value.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (rgb) {
      var channel = function (part) { return part.charAt(part.length - 1) === '%' ? parseFloat(part) * 2.55 : parseFloat(part); };
      var alpha = rgb[4] === undefined ? 1 : (rgb[4].charAt(rgb[4].length - 1) === '%' ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]));
      if (!(alpha > 0)) return 0;
      return spreadOf(channel(rgb[1]), channel(rgb[2]), channel(rgb[3]));
    }
    var hsl = value.match(/^hsla?\(\s*[-\d.]+(?:deg|rad|turn)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
    if (hsl) {
      // Chroma of an HSL colour, on the same 0 to 255 scale.
      var saturation = parseFloat(hsl[1]) / 100;
      var lightness = parseFloat(hsl[2]) / 100;
      return (1 - Math.abs(2 * lightness - 1)) * saturation * 255;
    }
    return /^[a-z]+$/.test(value) ? 255 : null;
  }

  function safeCssValue(value) {
    return value.length <= 80 && !/[<>"'\x60\\]|url\(|expression\(|@import|javascript:/i.test(value);
  }

  function spreadAtLeast(value, minimum) {
    var spread = colourSpread(value);
    return spread !== null && spread >= minimum;
  }

  // The declarations of a pasted style that survive, already normalised.
  function filteredStyle(tag, style) {
    var kept = [];
    function keep(declaration) { if (kept.indexOf(declaration) < 0) kept.push(declaration); }
    String(style).split(';').forEach(function (declaration) {
      var colon = declaration.indexOf(':');
      if (colon < 0) return;
      var property = declaration.slice(0, colon).trim().toLowerCase();
      var value = declaration.slice(colon + 1).replace(/!important/i, '').trim();
      var lower = value.toLowerCase();
      if (!value || !safeCssValue(value)) return;
      if (property === 'font-weight') {
        if (/^(bold|bolder|[6-9]00)$/.test(lower)) keep('font-weight: bold');
      } else if (property === 'font-style') {
        if (lower === 'italic' || lower === 'oblique') keep('font-style: italic');
      } else if (property === 'text-decoration' || property === 'text-decoration-line') {
        var lines = ['underline', 'line-through'].filter(function (line) { return lower.indexOf(line) >= 0; });
        if (lines.length) keep('text-decoration: ' + lines.join(' '));
      } else if (property === 'vertical-align') {
        if (lower === 'sub' || lower === 'super') keep('vertical-align: ' + lower);
      } else if (property === 'text-align') {
        if (lower === 'center' || lower === 'right' || lower === 'justify') keep('text-align: ' + lower);
      } else if (property === 'direction') {
        if (lower === 'rtl') keep('direction: rtl');
      } else if (property === 'color') {
        if (spreadAtLeast(value, MIN_TEXT_COLOUR_SPREAD)) keep('color: ' + value);
      } else if (property === 'background-color' || property === 'background') {
        if (spreadAtLeast(value, MIN_HIGHLIGHT_SPREAD)) keep('background-color: ' + value);
      } else if (has(TABLE_TAGS, tag) && (property === 'border-collapse' || property === 'padding' || /^border(-(top|right|bottom|left))?(-(width|style))?$/.test(property))) {
        // A table's rules and cell padding are its structure. A border's colour is left to the
        // card, so a black rule does not vanish on the dark page.
        var uncoloured = value.replace(/\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|black|white|gr[ae]y)\s*/gi, ' ').trim();
        keep(property + ': ' + (uncoloured || value));
      }
    });
    return kept;
  }

  function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function decodeAttribute(value) {
    return String(value).replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
  }

  function parseAttributes(source) {
    var attributes = {};
    var pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+)))?/g;
    var match = pattern.exec(source);
    while (match !== null) {
      var name = match[1].toLowerCase();
      var raw = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '';
      if (!has(attributes, name)) attributes[name] = decodeAttribute(raw);
      match = pattern.exec(source);
    }
    return attributes;
  }

  // The start tag to write for a pasted one, or null when the tag itself is dropped (unwrapped).
  function rebuiltStartTag(tag, attributes) {
    var style = has(attributes, 'style') ? attributes.style : '';
    // Google Docs wraps a whole paste in <b style="font-weight:normal">: the tag says bold, the
    // style takes it back. Without the style the tag would embolden everything, so it goes too.
    if ((tag === 'b' || tag === 'strong') && /font-weight\s*:\s*(normal|[1-4]00)\b/i.test(style)) return null;
    if ((tag === 'i' || tag === 'em') && /font-style\s*:\s*normal\b/i.test(style)) return null;
    if (tag === 'br' && /apple-interchange-newline/i.test(has(attributes, 'class') ? attributes['class'] : '')) return null;

    var parts = [];
    (has(ATTRIBUTES_BY_TAG, tag) ? ATTRIBUTES_BY_TAG[tag] : []).forEach(function (name) {
      if (!has(attributes, name)) return;
      var value = attributes[name];
      if (name === 'href') {
        if (!/^(https?:|mailto:)/i.test(value.trim())) return;
      } else if (name === 'src') {
        if (/^\s*(javascript|vbscript|file):/i.test(value)) return;
      } else if (has(NUMERIC_ATTRIBUTES, name)) {
        if (!/^\d{1,5}%?$/.test(value.trim())) return;
      }
      parts.push(value === '' && (name === 'controls' || name === 'block') ? name : name + '="' + escapeAttribute(value) + '"');
    });
    var direction = has(attributes, 'dir') ? attributes.dir.toLowerCase() : '';
    if (direction === 'rtl' || direction === 'ltr') parts.push('dir="' + direction + '"');

    var declarations = filteredStyle(tag, style);
    if (tag === 'font' && has(attributes, 'color')) {
      var colour = attributes.color;
      var hasColour = declarations.some(function (declaration) { return declaration.indexOf('color:') === 0; });
      if (colour && safeCssValue(colour) && spreadAtLeast(colour, MIN_TEXT_COLOUR_SPREAD) && !hasColour) {
        declarations.push('color: ' + colour);
      }
    }
    if (declarations.length) parts.push('style="' + escapeAttribute(declarations.join('; ')) + '"');

    // A span or font that says nothing any more is only noise around its text.
    if ((tag === 'span' || tag === 'font') && parts.length === 0) return null;
    function startsWith(prefix) { return parts.some(function (part) { return part.indexOf(prefix) === 0; }); }
    if (tag === 'a' && !startsWith('href=')) return null;
    if (tag === 'img' && !startsWith('src=') && !startsWith('data-tus-src=')) return null;
    return '<' + (tag === 'font' ? 'span' : tag) + (parts.length ? ' ' + parts.join(' ') : '') + '>';
  }

  // The HTML a paste puts into a field. Text is never dropped: whatever tag goes, what it held
  // stays, except scripts, styles and embedded widgets, which hold no text of the learner's.
  function sanitize(html) {
    var source = String(html === undefined || html === null ? '' : html);
    // Windows and Office clipboards mark the copied part inside a full document.
    var fragment = source.match(/<\x21--\s*StartFragment\s*-->([\s\S]*?)<\x21--\s*EndFragment\s*-->/i);
    if (fragment) source = fragment[1];
    source = source.replace(/<\x21--[\s\S]*?-->/g, '').replace(/<\x21\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\x21[^>]*>/g, '');
    // WebKit writes a space that ends a copied run as a non-breaking one inside
    // <span class="Apple-converted-space">, so that it survives the clipboard, and turns it back
    // into a space when it pastes. Dropping only the wrapper left "yetmezliginde&nbsp;<b>BNP</b>":
    // words that never wrap apart and that a quoted search does not find.
    source = source.replace(
      /<span\b[^>]*\bclass\s*=\s*(?:"[^"]*\bApple-converted-space\b[^"]*"|'[^']*\bApple-converted-space\b[^']*'|Apple-converted-space)[^>]*>([\s\S]*?)<\/span>/gi,
      function (_match, inner) { return inner.replace(/&nbsp;|&#160;|&#xa0;| /gi, ' '); }
    );

    var out = [];
    // One entry per open source tag: the tag to close it with, or null when it was unwrapped.
    var open = [];
    var tokens = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
    var skipUntil = null;
    var token = tokens.exec(source);
    for (; token !== null; token = tokens.exec(source)) {
      var text = token[0];
      var tag = token[1] ? token[1].toLowerCase() : '';
      if (!tag) {
        if (!skipUntil) out.push(text === '<' ? '&lt;' : text);
        continue;
      }
      var closing = text.charAt(1) === '/';
      var selfClosed = /\/\s*>$/.test(text);
      if (skipUntil) {
        if (closing && tag === skipUntil) skipUntil = null;
        continue;
      }
      if (has(REMOVED_WITH_CONTENT, tag)) {
        if (!closing && !selfClosed) skipUntil = tag;
        continue;
      }
      var mapped = has(BLOCK_AS_DIV, tag) ? 'div' : tag;
      if (closing) {
        if (has(VOID_TAGS, tag)) continue;
        // Close back to the matching open tag; a stray end tag with no partner is ignored.
        var index = -1;
        for (var i = open.length - 1; i >= 0; i--) { if (open[i].tag === tag) { index = i; break; } }
        if (index < 0) continue;
        var closed = open.splice(index).reverse();
        for (var c = 0; c < closed.length; c++) { if (closed[c].close) out.push('</' + closed[c].close + '>'); }
        continue;
      }
      var start = has(KEPT_TAGS, mapped) ? rebuiltStartTag(mapped, parseAttributes(token[2] || '')) : null;
      if (start) out.push(start);
      if (!has(VOID_TAGS, tag) && !selfClosed) {
        open.push({ tag: tag, close: start ? (mapped === 'font' ? 'span' : mapped) : null });
      }
    }
    for (var rest = open.length - 1; rest >= 0; rest--) {
      if (open[rest].close) out.push('</' + open[rest].close + '>');
    }
    return out.join('').replace(/^(?:\s|&nbsp;)+|(?:\s|&nbsp;)+$/g, '');
  }

  // Plain text as field HTML, for a paste whose markup held nothing after filtering.
  function textAsHtml(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n?|\n/g, '<br>');
  }

  // What to insert for a paste that carried HTML (and usually the same text as plain text).
  function fieldHtml(html, plainText) {
    var clean = sanitize(html);
    var hasContent = /<(?:img|audio|video|hr|anki-mathjax)\b/i.test(clean) || clean.replace(/<[^>]+>|&nbsp;|\s/g, '') !== '';
    return hasContent ? clean : textAsHtml(plainText);
  }

  return { sanitize: sanitize, textAsHtml: textAsHtml, fieldHtml: fieldHtml };
}
`;
