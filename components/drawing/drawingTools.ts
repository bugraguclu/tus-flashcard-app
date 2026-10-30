import type { DrawingTool } from '../../lib/drawingPad';
import {
    ArrowGlyph,
    CoverGlyph,
    EllipseGlyph,
    EraserGlyph,
    HighlighterGlyph,
    ImageGlyph,
    PenGlyph,
    RectGlyph,
    TextGlyph,
} from './drawingGlyphs';

type Localize = (turkish: string, english: string) => string;

/** The name a tool goes by on the bar and in the "More" sheet. */
export function drawingToolLabel(tool: DrawingTool, l: Localize): string {
    switch (tool) {
        case 'pen': return l('Kalem', 'Pen');
        case 'highlighter': return l('Fosforlu', 'Highlighter');
        case 'eraser': return l('Silgi', 'Eraser');
        case 'text': return l('Metin', 'Text');
        case 'arrow': return l('Ok', 'Arrow');
        case 'rect': return l('Dikdörtgen', 'Rectangle');
        case 'ellipse': return l('Elips', 'Ellipse');
        case 'cover': return l('Ört', 'Cover');
        case 'image': return l('Görsel', 'Picture');
    }
}

/** What a screen reader calls an ink on the bar, from the drawing pad's palettes and the photo editor's. */
export function drawingInkName(ink: string, l: Localize): string {
    switch (ink.toLowerCase()) {
        case '#111827': return l('Siyah', 'Black');
        case '#ffffff': return l('Beyaz', 'White');
        case '#2563eb':
        case '#60a5fa': return l('Mavi', 'Blue');
        case '#dc2626':
        case '#ef4444':
        case '#f87171': return l('Kırmızı', 'Red');
        case '#16a34a':
        case '#4ade80': return l('Yeşil', 'Green');
        case '#ea580c':
        case '#fb923c': return l('Turuncu', 'Orange');
        case '#facc15':
        case '#f59e0b': return l('Sarı', 'Yellow');
        case '#f472b6': return l('Pembe', 'Pink');
        default: return ink;
    }
}

export const DRAWING_TOOL_GLYPHS: Record<DrawingTool, typeof PenGlyph> = {
    pen: PenGlyph,
    highlighter: HighlighterGlyph,
    eraser: EraserGlyph,
    text: TextGlyph,
    arrow: ArrowGlyph,
    rect: RectGlyph,
    ellipse: EllipseGlyph,
    cover: CoverGlyph,
    image: ImageGlyph,
};
