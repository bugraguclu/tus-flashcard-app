import Svg, { Circle, Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';

export function EyeIcon({ color, size = 24 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M2.3 12s3.7-6.1 9.7-6.1 9.7 6.1 9.7 6.1-3.7 6.1-9.7 6.1S2.3 12 2.3 12Z"
                fill="none"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Circle cx={12} cy={12} r={2.7} fill={color} />
        </Svg>
    );
}

export function BackIcon({ color, size = 26 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="M15 18 9 12l6-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export function CheckIcon({ color, size = 27 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="m5 12.5 4.2 4L19 6.8" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export function MoreIcon({ color, size = 25 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Circle cx={12} cy={5} r={1.7} fill={color} />
            <Circle cx={12} cy={12} r={1.7} fill={color} />
            <Circle cx={12} cy={19} r={1.7} fill={color} />
        </Svg>
    );
}

export function ChevronDownIcon({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="m7 9.5 5 5 5-5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export function KeyboardDismissIcon({ color, size = 18 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M20 4H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-1 12H5c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v8c0 .55-.45 1-1 1z"
                fill={color}
            />
            <Path d="M6 8h2v2H6zm3 0h2v2H9zm3 0h2v2h-2zm3 0h2v2h-2zM6 11h2v2H6zm3 0h6v2H9zm7 0h2v2h-2z" fill={color} />
            <Path d="m7 21 5 3 5-3z" fill={color} />
        </Svg>
    );
}

export function PinIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path
                d="M8.2 3.5h7.6l-1.1 5.1 2.8 3.1v1.5H6.5v-1.5l2.8-3.1-1.1-5.1ZM12 13.2v7.3"
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
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

export function AnkiToolbarIcon({ name, color, size = 24 }: { name: AnkiToolbarIconName; color: string; size?: number }) {
    const paths: Record<Exclude<AnkiToolbarIconName, 'math'>, string> = {
        bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42ZM10 6.5h3a1.5 1.5 0 0 1 0 3h-3v-3Zm3.5 9H10v-3h3.5a1.5 1.5 0 0 1 0 3Z',
        italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z',
        underline: 'M12 17a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 1 1-7 0V3H6v8a6 6 0 0 0 6 6ZM5 19v2h14v-2H5Z',
        strikethrough: 'M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z',
        removeFormat: 'M4 4h10v2H9v12H7V6H4V4zm11 7l3 3-3 3 1.4 1.4 3-3 3 3 1.4-1.4-3-3 3-3-1.4-1.4-3 3-3-3L15 11z',
        subscript: 'M5 4l3.5 6L5 16h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 8.2 7.2 4H5zm14 13h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V17h2.3z',
        superscript: 'M5 7l3.5 6L5 19h2.2l2.4-4.2 2.4 4.2h2.2l-3.5-6 3.5-6h-2.2L9.6 11.2 7.2 7H5zm14 3h4v1h-5v-1l3-3c.5-.5.7-.9.7-1.3 0-.6-.4-1-1-1s-1 .4-1 1h-1c0-1.1.9-2 2-2s2 .9 2 2c0 .6-.3 1.2-.8 1.7l-2.2 2.2V10h2.3z',
        color: 'M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.17 19.38 10.53 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z',
        listBullet: 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
        listNumber: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
        rule: 'M2 11h20v2H2z',
        heading: 'M5 4v3h5.5v12h3V7H19V4H5Z',
        fontSize: 'M2.5 4v3h5v12h3V7h5V4h-13Zm19 5h-9v3h3v7h3v-7h3V9Z',
        // A serif "A" reads as "typeface" the way Word's font box does.
        fontFamily: 'M6.6 19H4l5.2-14h2.8L17.2 19h-2.7l-1.2-3.5H7.8L6.6 19Zm1.9-5.6h4.4l-2.2-6.3-2.2 6.3ZM3 20.5h18V22H3v-1.5Z',
        // Word draws grow and shrink as a large and a small A beside an arrow.
        growFont: 'M1.5 18 6 6h2.2l4.5 12h-2.2l-1-2.9H4.7l-1 2.9H1.5Zm3.8-4.7h3.4L7 8.6l-1.7 4.7ZM17 6.5l4.5 5h-3v7h-3v-7h-3l4.5-5Z',
        shrinkFont: 'M1.5 18 6 6h2.2l4.5 12h-2.2l-1-2.9H4.7l-1 2.9H1.5Zm3.8-4.7h3.4L7 8.6l-1.7 4.7ZM17 18.5l-4.5-5h3v-7h3v7h3l-4.5 5Z',
        // Word's Change Case button is a capital and a lower-case A side by side.
        changeCase: 'M2 18 6.3 6h2.3L12.9 18h-2.2l-.95-2.8H5.15L4.2 18H2Zm3.75-4.6h3.3L7.4 8.5l-1.65 4.9Zm12.4 4.8c-1.9 0-3.15-1.05-3.15-2.6 0-1.6 1.2-2.5 3.4-2.65l1.9-.15v-.35c0-.85-.5-1.3-1.5-1.3-.9 0-1.45.4-1.6 1.05h-1.9c.2-1.6 1.5-2.6 3.55-2.6 2.2 0 3.4 1.05 3.4 2.95V18h-1.85l-.05-1.1c-.5.8-1.35 1.3-2.2 1.3Zm.6-1.5c1.05 0 1.85-.7 1.85-1.7v-.4l-1.6.15c-1 .1-1.5.45-1.5 1.05 0 .55.45.9 1.25.9Z',
        // Stacked lines with a double-headed arrow, as in Word's line-spacing menu.
        lineSpacing: 'M10 5h11v2H10V5Zm0 6h11v2H10v-2Zm0 6h11v2H10v-2ZM6 3 2.5 7h2.25v10H2.5L6 21l3.5-4H7.25V7H9.5L6 3Z',
        html: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
        add: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z',
        alignLeft: 'M3 3h18v2H3V3Zm0 4h12v2H3V7Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Zm0 4h18v2H3v-2Z',
        alignCenter: 'M3 3h18v2H3V3Zm3 4h12v2H6V7Zm-3 4h18v2H3v-2Zm3 4h12v2H6v-2Zm-3 4h18v2H3v-2Z',
        alignRight: 'M3 3h18v2H3V3Zm6 4h12v2H9V7Zm-6 4h18v2H3v-2Zm6 4h12v2H9v-2Zm-6 4h18v2H3v-2Z',
        alignJustify: 'M3 3h18v2H3V3Zm0 4h18v2H3V7Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Zm0 4h18v2H3v-2Z',
        indent: 'M3 3h18v2H3V3Zm8 4h10v2H11V7Zm0 4h10v2H11v-2Zm0 4h10v2H11v-2ZM3 19h18v2H3v-2ZM3 8l4 3.5L3 15V8Z',
        outdent: 'M3 3h18v2H3V3Zm8 4h10v2H11V7Zm0 4h10v2H11v-2Zm0 4h10v2H11v-2ZM3 19h18v2H3v-2Zm4-11v7l-4-3.5L7 8Z',
        table: 'M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 6v4h6V9H4Zm8 0v4h8V9h-8Zm-8 6v4h6v-4H4Zm8 0v4h8v-4h-8ZM4 5v2h16V5H4Z',
        link: 'M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z',
        quote: 'M6 17h3l2-4V6H4v7h3l-1 4Zm9 0h3l2-4V6h-7v7h3l-1 4Z',
        code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z',
        callout: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-9 4h2v6h-2V6Zm0 8h2v2h-2v-2Z',
        paragraph: 'M13 4H8a4 4 0 0 0 0 8h2v8h2V6h2v14h2V6h1V4h-4Z',
        undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.98 7.98 0 0 1 12.5 11c2.98 0 5.5 1.94 6.4 4.62l2.37-.78A9.99 9.99 0 0 0 12.5 8Z',
        redo: 'M18.4 10.6A9.94 9.94 0 0 0 11.5 8a9.99 9.99 0 0 0-8.77 6.84l2.37.78A7.98 7.98 0 0 1 11.5 11c2.05 0 3.92.77 5.35 2.02L13 16h9V7l-3.6 3.6Z',
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
            <Path fill={color} d={paths[name]} />
        </Svg>
    );
}
