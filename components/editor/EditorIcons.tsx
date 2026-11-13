import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { IconFrame, iconStroke, outline } from '../icons/IconFrame';
import { EyeGlyph, RedoGlyph, UndoGlyph } from '../UiGlyphs';

export function EyeIcon({ color, size = 24 }: { color: string; size?: number }) {
    return <EyeGlyph color={color} size={size} />;
}

/** Hide the keyboard: a keyboard above a downward chevron. */
export function KeyboardDismissIcon({ color, size = 18 }: { color: string; size?: number }) {
    const line = outline(color, iconStroke(size));
    const key = Math.max(0.9, iconStroke(size) * 0.55);
    return (
        <IconFrame size={size}>
            <Rect x={2.75} y={3.75} width={18.5} height={12} rx={2.75} {...line} />
            {[6.75, 10.25, 13.75, 17.25].map((cx) => <Circle key={cx} cx={cx} cy={7.75} r={key} fill={color} />)}
            <Path d="M8.5 11.75h7M9.5 19 12 21.25 14.5 19" {...line} />
        </IconFrame>
    );
}

/** Keep the field's content for the next note: a push pin. */
export function PinIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <IconFrame size={size}>
            <Path d="M9 3.75h6M10 3.75v5L7.25 12.1a.9.9 0 0 0 .7 1.4h8.1a.9.9 0 0 0 .7-1.4L14 8.75v-5M12 13.5v6.75" {...outline(color, iconStroke(size))} />
        </IconFrame>
    );
}

export type AnkiToolbarIconName =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikethrough'
    | 'removeFormat'
    | 'subscript'
    | 'superscript'
    | 'color'
    | 'listBullet'
    | 'listNumber'
    | 'rule'
    | 'heading'
    | 'fontSize'
    | 'math'
    | 'html'
    | 'add'
    | 'alignLeft'
    | 'alignCenter'
    | 'alignRight'
    | 'alignJustify'
    | 'indent'
    | 'outdent'
    | 'table'
    | 'link'
    | 'quote'
    | 'code'
    | 'callout'
    | 'undo'
    | 'redo'
    | 'paragraph'
    | 'fontFamily'
    | 'growFont'
    | 'shrinkFont'
    | 'changeCase'
    | 'lineSpacing';

/**
 * The formatting toolbar's icons. Letterform tools (bold, italic, sizes, case, ¶, Σ) keep their
 * solid letters, as text controls do on iOS; every other tool is a line icon on the app's grid.
 */
const TOOLBAR_LINES: Partial<Record<AnkiToolbarIconName, string>> = {
    listBullet: 'M9.5 6.5h10M9.5 12h10M9.5 17.5h10',
    listNumber: 'M10 6.5h9.5M10 12h9.5M10 17.5h9.5',
    rule: 'M3.5 12h17',
    alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
    alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
    alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
    alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    indent: 'M4 5.25h16M11.5 9.75H20M11.5 14.25H20M4 18.75h16M4.5 9.25 7.5 12l-3 2.75',
    outdent: 'M4 5.25h16M11.5 9.75H20M11.5 14.25H20M4 18.75h16M7.5 9.25 4.5 12l3 2.75',
    lineSpacing: 'M11 6.5h9M11 12h9M11 17.5h9M6 4.5v15M3.5 7 6 4.5 8.5 7M3.5 17 6 19.5 8.5 17',
    table: 'M6 4.5h12A2.5 2.5 0 0 1 20.5 7v10a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5ZM3.5 9.5h17M3.5 14.5h17M9.25 9.5v10M14.75 9.5v10',
    link: 'M10 13.75a3.75 3.75 0 0 0 5.3 0l3-3a3.75 3.75 0 0 0-5.3-5.3l-.85.85M14 10.25a3.75 3.75 0 0 0-5.3 0l-3 3a3.75 3.75 0 0 0 5.3 5.3l.85-.85',
    code: 'M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5',
    html: 'M8 7.5 3.5 12 8 16.5M16 7.5l4.5 4.5-4.5 4.5M13.25 5.5l-2.5 13',
    callout: 'M4 7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.25V16.5h-.5A2.5 2.5 0 0 1 4 14ZM12 7.75v3.5',
    color: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.05 0 1.75-.7 1.75-1.6 0-.45-.17-.8-.43-1.1-.26-.3-.42-.66-.42-1.05 0-.85.68-1.5 1.55-1.5h1.85a4.2 4.2 0 0 0 4.2-4.2C20.5 6.9 16.7 3.5 12 3.5Z',
    add: 'M7.25 3.75h9.5a3.5 3.5 0 0 1 3.5 3.5v9.5a3.5 3.5 0 0 1-3.5 3.5h-9.5a3.5 3.5 0 0 1-3.5-3.5v-9.5a3.5 3.5 0 0 1 3.5-3.5ZM12 8v8M8 12h8',
};

/** Small marks drawn as dots beside a line icon: list bullets, palette wells, the callout's point. */
const TOOLBAR_DOTS: Partial<Record<AnkiToolbarIconName, [number, number][]>> = {
    listBullet: [[5, 6.5], [5, 12], [5, 17.5]],
    color: [[7.75, 12], [9.5, 7.75], [14.25, 7.5]],
    callout: [[12, 13.6]],
};

/** The numbered list's 1, 2 and 3, drawn with a finer pen than the rules beside them. */
const LIST_NUMERALS = 'M4.4 5.25 5.6 4.5v4M4.25 10.6a1.3 1.3 0 0 1 2.5.4c0 .45-.25.8-.6 1.15L4.3 14.1h2.6M4.3 15.8h2.45l-1.35 1.55a1.3 1.3 0 1 1-1.2 1.95';

export function AnkiToolbarIcon({ name, color, size = 24 }: { name: AnkiToolbarIconName; color: string; size?: number }) {
    if (name === 'undo') return <UndoGlyph color={color} size={size} />;
    if (name === 'redo') return <RedoGlyph color={color} size={size} />;
    const lines = TOOLBAR_LINES[name];
    if (lines) {
        const width = iconStroke(size);
        return (
            <IconFrame size={size}>
                <Path d={lines} {...outline(color, width)} />
                {(TOOLBAR_DOTS[name] ?? []).map(([cx, cy]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={width * 0.7} fill={color} />)}
                {name === 'listNumber' && <Path d={LIST_NUMERALS} {...outline(color, width * 0.72)} />}
            </IconFrame>
        );
    }
    return <LetterformIcon name={name} color={color} size={size} />;
}

function LetterformIcon({ name, color, size }: { name: AnkiToolbarIconName; color: string; size: number }) {
    const paths: Partial<Record<AnkiToolbarIconName, string>> = {
        bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42ZM10 6.5h3a1.5 1.5 0 0 1 0 3h-3v-3Zm3.5 9H10v-3h3.5a1.5 1.5 0 0 1 0 3Z',
        italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z',
        underline: 'M12 17a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 1 1-7 0V3H6v8a6 6 0 0 0 6 6ZM5 19v2h14v-2H5Z',
        strikethrough: 'M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z',
        removeFormat: 'M4 4h10v2H9v12H7V6H4V4zm11 7l3 3-3 3 1.4 1.4 3-3 3 3 1.4-1.4-3-3 3-3-1.4-1.4-3 3-3-3L15 11z',
        subscript: 'M5 4l3.5 6L5 16h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 8.2 7.2 4H5zm14 13h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V17h2.3z',
        superscript: 'M5 7l3.5 6L5 19h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 11.2 7.2 7H5zm14 3h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V10h2.3z',
        heading: 'M5 4v3h5.5v12h3V7H19V4H5Z',
        fontSize: 'M2.5 4v3h5v12h3V7h5V4h-13Zm19 5h-9v3h3v7h3v-7h3V9Z',
        // A serif "A" reads as "typeface" the way Word's font box does.
        fontFamily: 'M6.6 19H4l5.2-14h2.8L17.2 19h-2.7l-1.2-3.5H7.8L6.6 19Zm1.9-5.6h4.4l-2.2-6.3-2.2 6.3ZM3 20.5h18V22H3v-1.5Z',
        // Word draws grow and shrink as a large and a small A beside an arrow.
        growFont: 'M1.5 18 6 6h2.2l4.5 12h-2.2l-1-2.9H4.7l-1 2.9H1.5Zm3.8-4.7h3.4L7 8.6l-1.7 4.7ZM17 6.5l4.5 5h-3v7h-3v-7h-3l4.5-5Z',
        shrinkFont: 'M1.5 18 6 6h2.2l4.5 12h-2.2l-1-2.9H4.7l-1 2.9H1.5Zm3.8-4.7h3.4L7 8.6l-1.7 4.7ZM17 18.5l-4.5-5h3v-7h3v7h3l-4.5 5Z',
        // Word's Change Case button is a capital and a lower-case A side by side.
        changeCase: 'M2 18 6.3 6h2.3L12.9 18h-2.2l-.95-2.8H5.15L4.2 18H2Zm3.75-4.6h3.3L7.4 8.5l-1.65 4.9Zm12.4 4.8c-1.9 0-3.15-1.05-3.15-2.6 0-1.6 1.2-2.5 3.4-2.65l1.9-.15v-.35c0-.85-.5-1.3-1.5-1.3-.9 0-1.45.4-1.6 1.05h-1.9c.2-1.6 1.5-2.6 3.55-2.6 2.2 0 3.4 1.05 3.4 2.95V18h-1.85l-.05-1.1c-.5.8-1.35 1.3-2.2 1.3Zm.6-1.5c1.05 0 1.85-.7 1.85-1.7v-.4l-1.6.15c-1 .1-1.5.45-1.5 1.05 0 .55.45.9 1.25.9Z',
        quote: 'M6 17h3l2-4V6H4v7h3l-1 4Zm9 0h3l2-4V6h-7v7h3l-1 4Z',
        paragraph: 'M13 4H8a4 4 0 0 0 0 8h2v8h2V6h2v14h2V6h1V4h-4Z',
    };

    if (name === 'math') {
        return (
            <Svg width={size} height={size} viewBox="0 0 6.35 6.35" {...DECORATIVE_SVG_PROPS}>
                <Path
                    fill={color}
                    d="M1.559 1.099v.457l1.49 1.808-1.49 1.807v.458h2.345a1.246 1.246 0 0 1-.22-.483H2.321l-.009-.016L3.7 3.404V3.33L2.312 1.597l.009-.016h1.702l.047.52h.526V1.1H1.559Z"
                />
                <Path
                    fill={color}
                    d="M5.018 4.326H4.79v.454h-.454v.227h.454v.455h.228v-.455h.454V4.78h-.454v-.454Zm-.114-.568a1.136 1.136 0 1 0 0 2.271 1.136 1.136 0 0 0 0-2.271Zm0 2.044a.909.909 0 1 1 0-1.817.909.909 0 0 1 0 1.817Z"
                />
            </Svg>
        );
    }

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path fill={color} d={paths[name] ?? ''} />
        </Svg>
    );
}
