import { Circle, Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline, type IconProps } from './icons/IconFrame';
import { arc, circle } from './icons/iconGeometry';

/**
 * The line icons shared by the app's chrome, so a screen never mixes emoji or text symbols with
 * drawn icons. Every glyph follows the grid, stroke and corner rules in `icons/IconFrame`.
 * They are decorative: the control that holds one carries the accessibility label.
 */

type GlyphProps = IconProps;

const DEFAULT_SIZE = 20;

function paint({ color, size = DEFAULT_SIZE, strokeWidth }: GlyphProps, weight = 1) {
    return outline(color, strokeWidth ?? iconStroke(size, weight));
}

function LineGlyph({ d, weight = 1, ...props }: GlyphProps & { d: string; weight?: number }) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d={d} {...paint(props, weight)} />
        </IconFrame>
    );
}

function Dots({ color, size = DEFAULT_SIZE, points, r }: GlyphProps & { points: [number, number][]; r: number }) {
    return (
        <IconFrame size={size}>
            {points.map(([cx, cy]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={color} />)}
        </IconFrame>
    );
}

// Actions

export function PlusGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 5v14M5 12h14" />;
}

export function MinusGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M5 12h14" />;
}

export function CloseGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
}

export function CheckGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4.75 12.75 9.5 17.5 19.25 7" weight={1.05} />;
}

/** A circle with a tick: a finished day or a completed step. */
export function CheckCircleGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={12} r={9} {...paint(props)} />
            <Path d="M8.25 12.25l2.6 2.6 4.9-5.2" {...paint(props)} />
        </IconFrame>
    );
}

/** A rounded square with a tick: select all. */
export function CheckSquareGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={3.75} y={3.75} width={16.5} height={16.5} rx={3.5} {...paint(props)} />
            <Path d="M8.25 12.25l2.6 2.6 4.9-5.2" {...paint(props)} />
        </IconFrame>
    );
}

/** Three dots in a row: a row's or a screen's "more" menu. */
export function MoreGlyph(props: GlyphProps) {
    return <Dots {...props} r={1.6} points={[[5.25, 12], [12, 12], [18.75, 12]]} />;
}

/** Three dots in a column: the "more" menu of a toolbar that reads top to bottom. */
export function MoreVerticalGlyph(props: GlyphProps) {
    return <Dots {...props} r={1.6} points={[[12, 5.25], [12, 12], [12, 18.75]]} />;
}

/** Six dots: the handle a row is dragged by. */
export function GripGlyph(props: GlyphProps) {
    return <Dots {...props} r={1.35} points={[[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]]} />;
}

/** Three rules: a list or a side menu. */
export function MenuGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4.5 7h15M4.5 12h15M4.5 17h15" />;
}

export function SearchGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={10.75} cy={10.75} r={6.75} {...paint(props)} />
            <Path d="M15.55 15.55 20 20" {...paint(props)} />
        </IconFrame>
    );
}

/**
 * Rebuild or reload: a clockwise circular arrow whose head sits on the right side, pointing
 * down, the mirror of RotateLeftGlyph.
 */
export function RefreshGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={`${arc(11.5, 12, 8, 0, 55, false)}M21.75 9.75 19.5 12l-2.25-2.25`} />;
}

/** Turn right: the same clockwise arrow as Refresh, named for rotation controls. */
export const RotateRightGlyph = RefreshGlyph;

/**
 * Turn left, or start over: an anticlockwise circular arrow whose head sits on the left side,
 * pointing down, in the same family as HistoryGlyph.
 */
export function RotateLeftGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={`${arc(12.5, 12, 8, 180, 125)}M2.25 9.75 4.5 12l2.25-2.25`} />;
}

/** Undo: an arrow that turns back on itself. */
export function UndoGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M8.75 13.25 4.5 9l4.25-4.25M4.5 9h10.25a5 5 0 0 1 0 10H10" />;
}

export function RedoGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M15.25 13.25 19.5 9l-4.25-4.25M19.5 9H9.25a5 5 0 0 0 0 10H14" />;
}

export function TrashGlyph(props: GlyphProps) {
    return (
        <LineGlyph
            {...props}
            d="M4.5 6.5h15M9.5 6.5V4.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V6.5M6.5 6.5l.85 12.15a2 2 0 0 0 2 1.85h5.3a2 2 0 0 0 2-1.85L17.5 6.5M10.25 10.5v6M13.75 10.5v6"
        />
    );
}

/** A copy: one rounded square over another. */
export function CopyGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={8.5} y={8.5} width={12} height={12} rx={2.75} {...paint(props)} />
            <Path d="M15.5 8.5V6.25A2.75 2.75 0 0 0 12.75 3.5h-6.5A2.75 2.75 0 0 0 3.5 6.25v6.5a2.75 2.75 0 0 0 2.75 2.75H8.5" {...paint(props)} />
        </IconFrame>
    );
}

/** A label tag with its eyelet. */
export function TagGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M3.75 11.6V5.25c0-.83.67-1.5 1.5-1.5h6.35c.4 0 .78.16 1.06.44l7.6 7.6a1.5 1.5 0 0 1 0 2.12l-6.35 6.35a1.5 1.5 0 0 1-2.12 0l-7.6-7.6a1.5 1.5 0 0 1-.44-1.06Z" {...paint(props)} />
            <Circle cx={8.25} cy={8.25} r={1.5} fill={props.color} />
        </IconFrame>
    );
}

/** An eye: preview. */
export function EyeGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M2.75 12C4.6 8.1 8 5.75 12 5.75s7.4 2.35 9.25 6.25C19.4 15.9 16 18.25 12 18.25S4.6 15.9 2.75 12Z" {...paint(props)} />
            <Circle cx={12} cy={12} r={3} {...paint(props)} />
        </IconFrame>
    );
}

/** A pause sign in a circle: suspend. */
export function PauseCircleGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={12} r={9} {...paint(props)} />
            <Path d="M10 9v6M14 9v6" {...paint(props)} />
        </IconFrame>
    );
}

/** A paperclip: attach a file. */
export function PaperclipGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m19.75 11.25-7.4 7.4a4.75 4.75 0 0 1-6.72-6.72l7.75-7.75a3.17 3.17 0 0 1 4.48 4.48l-7.75 7.75a1.58 1.58 0 0 1-2.24-2.24l7.05-7.05" />;
}

/** A tray with an arrow coming down into it: save, download or import. */
export function DownloadGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4 14.5v3.25a2.75 2.75 0 0 0 2.75 2.75h10.5A2.75 2.75 0 0 0 20 17.75V14.5M12 3.5v11m-4.25-4.25L12 14.5l4.25-4.25" />;
}

/** A tray with an arrow leaving it: export. */
export function UploadGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4 14.5v3.25a2.75 2.75 0 0 0 2.75 2.75h10.5A2.75 2.75 0 0 0 20 17.75V14.5M12 14.5v-11M7.75 7.75 12 3.5l4.25 4.25" />;
}

/** An arrow pressed down onto a line: bury a card until tomorrow. */
export function BuryGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 3.75v11.5M7.5 10.75 12 15.25l4.5-4.5M5 19.75h14" />;
}

/** Three sliders: options and adjustments. */
export function SlidersGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M4 7h5.25M14.25 7H20M4 17h2.25M11.25 17H20" {...paint(props)} />
            <Circle cx={11.75} cy={7} r={2.5} {...paint(props)} />
            <Circle cx={8.75} cy={17} r={2.5} {...paint(props)} />
        </IconFrame>
    );
}

/** A microphone on its stand: record or play a voice. */
export function MicGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={9} y={3} width={6} height={11} rx={3} {...paint(props)} />
            <Path d="M5.75 11a6.25 6.25 0 0 0 12.5 0M12 17.25v3.5M9 20.75h6" {...paint(props)} />
        </IconFrame>
    );
}

/** A question mark on its own, for a help button that already has a shape around it. */
export function QuestionGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M9 9a3 3 0 1 1 4.25 2.73c-.75.34-1.25.98-1.25 1.8v.47" {...paint(props)} />
            <Circle cx={12} cy={17.75} r={1.15} fill={props.color} />
        </IconFrame>
    );
}

/** A question mark in a circle: help. */
export function QuestionCircleGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={12} r={9} {...paint(props)} />
            <Path d="M9.75 9.6a2.3 2.3 0 1 1 3.25 2.1c-.58.27-1 .8-1 1.45v.35" {...paint(props)} />
            <Circle cx={12} cy={16.6} r={1.05} fill={props.color} />
        </IconFrame>
    );
}

/** A speaker with sound waves: read the card aloud. */
export function SpeakerGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M11 5.25 6.75 9H4.75a1.25 1.25 0 0 0-1.25 1.25v3.5A1.25 1.25 0 0 0 4.75 15h2l4.25 3.75ZM15 9.25a4 4 0 0 1 0 5.5M17.75 6.5a7.75 7.75 0 0 1 0 11" />;
}

/** A lightning bolt: speed things up, as repairing and optimising the database does. */
export function BoltGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M13.25 2.75 4.75 13.25h6.5l-.5 8 8.5-10.5h-6.5Z" />;
}

/** A folder: a deck that holds other decks. */
export function FolderGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M3.5 7.25A2.25 2.25 0 0 1 5.75 5h3.6l2 2.25h6.9a2.25 2.25 0 0 1 2.25 2.25v8.25A2.25 2.25 0 0 1 18.25 20H5.75a2.25 2.25 0 0 1-2.25-2.25Z" />;
}

// Media controls: solid marks, rounded by the same stroke as the outline glyphs.

/** Play: a rounded triangle, nudged right so its mass sits on the centre. */
export function PlayGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M8.5 5.25 19.25 12 8.5 18.75Z" {...paint(props)} fill={props.color} />
        </IconFrame>
    );
}

export function PauseGlyph({ color, size = DEFAULT_SIZE }: GlyphProps) {
    return (
        <IconFrame size={size}>
            <Rect x={6.25} y={4.75} width={4.25} height={14.5} rx={1.6} fill={color} />
            <Rect x={13.5} y={4.75} width={4.25} height={14.5} rx={1.6} fill={color} />
        </IconFrame>
    );
}

export function StopGlyph({ color, size = DEFAULT_SIZE }: GlyphProps) {
    return (
        <IconFrame size={size}>
            <Rect x={5.75} y={5.75} width={12.5} height={12.5} rx={3} fill={color} />
        </IconFrame>
    );
}

/** Play in a circle: replay the card's audio. */
export function PlayCircleGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={12} r={9} {...paint(props)} />
            <Path d="M10.25 8.75v6.5L15.5 12Z" {...paint(props)} />
        </IconFrame>
    );
}

/** A solid disc with a plus cut out of it, so the plus shows whatever lies behind the button. */
export function PlusCircleGlyph({ color, size = DEFAULT_SIZE }: GlyphProps) {
    const cross = 'M10.9 8.4a1.1 1.1 0 0 1 2.2 0v2.5h2.5a1.1 1.1 0 0 1 0 2.2h-2.5v2.5a1.1 1.1 0 0 1-2.2 0v-2.5H8.4a1.1 1.1 0 0 1 0-2.2h2.5Z';
    return (
        <IconFrame size={size}>
            <Path d={`${circle(12, 12, 9.75)}${cross}`} fill={color} fillRule="evenodd" />
        </IconFrame>
    );
}

export function ClockGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={12} r={9} {...paint(props)} />
            <Path d="M12 7.25V12l3.25 2" {...paint(props)} />
        </IconFrame>
    );
}

/** A stopwatch: round face, crown and pusher, one hand. */
export function StopwatchGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Circle cx={12} cy={13.5} r={7.75} {...paint(props)} />
            <Path d="M9.75 2.75h4.5M12 2.75v3M18.1 6.65l1.4-1.4M12 13.5V9.5" {...paint(props)} />
        </IconFrame>
    );
}

/** An open book: notes and study material. */
export function BookGlyph(props: GlyphProps) {
    return (
        <LineGlyph
            {...props}
            d="M12 7.25C10.25 5.75 7.75 5 4.25 5.25v12.5c3.5-.25 6 .5 7.75 2M12 7.25c1.75-1.5 4.25-2.25 7.75-2v12.5c-3.5-.25-6 .5-7.75 2M12 7.25v12.5"
        />
    );
}

/** A photo: a frame with a sun and two hills. */
export function PhotoGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={3} y={4.5} width={18} height={15} rx={3} {...paint(props)} />
            <Path d="M3.5 16.75 7.9 12.35a1.4 1.4 0 0 1 2 0L15.5 18M14 16.5l1.6-1.6a1.4 1.4 0 0 1 2 0l2.9 2.9" {...paint(props)} />
            <Circle cx={15.5} cy={9.25} r={1.6} {...paint(props)} />
        </IconFrame>
    );
}

/** Crop: two interlocking corners. */
export function CropGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M6.5 2.75v12.75a2 2 0 0 0 2 2h12.75M2.75 6.5H15.5a2 2 0 0 1 2 2v12.75" />;
}

// Navigation

export function ChevronRightGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m9.25 6 6 6-6 6" weight={1.1} />;
}

export function ChevronLeftGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M14.75 6l-6 6 6 6" weight={1.1} />;
}

export function ChevronDownGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m6 9.25 6 6 6-6" weight={1.1} />;
}

export function ChevronUpGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="m6 14.75 6-6 6 6" weight={1.1} />;
}

export function ArrowUpGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 19.5v-15M5.75 10.75 12 4.5l6.25 6.25" />;
}

export function ArrowDownGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M12 4.5v15M5.75 13.25 12 19.5l6.25-6.25" />;
}

export function ArrowLeftGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M19.5 12h-15M10.75 5.75 4.5 12l6.25 6.25" />;
}

export function ArrowRightGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4.5 12h15M13.25 5.75 19.5 12l-6.25 6.25" />;
}

/** An up and a down arrow side by side: sort order or reposition. */
export function SortGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M8 19.5v-15M4.25 8.25 8 4.5l3.75 3.75M16 4.5v15M12.25 15.75 16 19.5l3.75-3.75" />;
}

/** An arrow leaving the box: a link that opens outside the app. */
export function ExternalLinkGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M7 17 17 7M8.5 7H17v8.5" />;
}

// Objects

/** A funnel: a filtered deck, which gathers its cards by search. */
export function FilterGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M4.5 5.25h15l-5.75 7.25v5.75l-3.5 1.75v-7.5Z" />;
}

/** A deck: a card with two more stacked behind it. */
export function DeckGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={3} y={10.25} width={18} height={10.25} rx={2.5} {...paint(props)} />
            <Path d="M4.75 10.25V8.75a1.5 1.5 0 0 1 1.5-1.5h11.5a1.5 1.5 0 0 1 1.5 1.5v1.5M6.5 7.25V5.75a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v1.5" {...paint(props)} />
        </IconFrame>
    );
}

/** A sheet with a pencil: add or edit a note. */
export function NoteGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M11.5 4.5H7.25A2.75 2.75 0 0 0 4.5 7.25v9.5a2.75 2.75 0 0 0 2.75 2.75h9.5a2.75 2.75 0 0 0 2.75-2.75V12.5" {...paint(props)} />
            <Path d="M17.2 4.05a1.85 1.85 0 0 1 2.62 2.62l-7.3 7.3-3.47.85.85-3.47Z" {...paint(props)} />
        </IconFrame>
    );
}

export function HourglassGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d="M6.5 3.5h11M6.5 20.5h11M7.75 3.5c0 4.25 4.25 5.25 4.25 8.5s-4.25 4.25-4.25 8.5M16.25 3.5c0 4.25-4.25 5.25-4.25 8.5s4.25 4.25 4.25 8.5" />;
}

/** The arc, arrowhead and hands of a clock turned back: history and restore. */
export const HISTORY_PATH = `${arc(12.5, 12, 8, 180, 125)}M2.25 9.75 4.5 12l2.25-2.25M12.5 8v4.25l2.75 1.75`;

export function HistoryGlyph(props: GlyphProps) {
    return <LineGlyph {...props} d={HISTORY_PATH} />;
}

/** A warning triangle for notices that need attention before an action. */
export function WarningGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M10.27 4.5a2 2 0 0 1 3.46 0l7.05 12.5a2 2 0 0 1-1.74 3H4.96a2 2 0 0 1-1.74-3Z" {...paint(props)} />
            <Path d="M12 9.75v3.75" {...paint(props)} />
            <Circle cx={12} cy={16.6} r={1.15} fill={props.color} />
        </IconFrame>
    );
}

/** A shield with an exclamation mark: the app caught an error. */
export function ShieldAlertGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M12 3.25 5 5.9v5.35c0 4.4 2.95 8.15 7 9.5 4.05-1.35 7-5.1 7-9.5V5.9Z" {...paint(props)} />
            <Path d="M12 8.5v4" {...paint(props)} />
            <Circle cx={12} cy={15.6} r={1.15} fill={props.color} />
        </IconFrame>
    );
}

/** An open padlock: what unlocking the catalog gives. */
export function UnlockGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={5} y={11} width={14} height={9.5} rx={2.5} {...paint(props)} />
            <Path d="M8 11V8a4 4 0 0 1 7.75-1.4M12 14.5v2.5" {...paint(props)} />
        </IconFrame>
    );
}

export function LightbulbGlyph(props: GlyphProps) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Path d="M12 3.5a6 6 0 0 0-3.6 10.8c.55.42.85.98.85 1.6v1.35h5.5V15.9c0-.62.3-1.18.85-1.6A6 6 0 0 0 12 3.5Z" {...paint(props)} />
            <Path d="M9.75 20.5h4.5" {...paint(props)} />
        </IconFrame>
    );
}

/** A phone with its tools panel docked on one side. */
export function SidePanelGlyph({ side, ...props }: GlyphProps & { side: 'left' | 'right' }) {
    return (
        <IconFrame size={props.size ?? DEFAULT_SIZE}>
            <Rect x={5.5} y={2.75} width={13} height={18.5} rx={3} {...paint(props)} />
            <Rect x={side === 'left' ? 8.25 : 13.25} y={6.25} width={2.5} height={11.5} rx={1.25} fill={props.color} />
        </IconFrame>
    );
}
