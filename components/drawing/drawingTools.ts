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
