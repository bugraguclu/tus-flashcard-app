// Keeps screens on the shared design system (docs/DESIGN_SYSTEM.md): colours come from theme
// tokens, control glyphs from components/ui/icons, dimming from the scrim tokens.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'components'];

function sourceFiles(root: string): string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
    });
}

const files = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
    .map((file) => path.relative(process.cwd(), file).split(path.sep).join('/'))
    .sort();

/** Comments say what a colour or a character means; only code draws. */
function withoutComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:'"`])\/\/.*$/gm, (_line, lead: string) => lead);
}

/**
 * Files that may hold colour literals, and why. Anything else takes its colours from
 * `useThemeColors()`, so it follows the light and dark themes.
 */
const COLOUR_LITERALS_ALLOWED: Record<string, string> = {
    'app/+html.tsx': 'the browser theme-color meta tags, read before the app runs',
    'components/CardWebView.tsx': 'CSS inside the card document',
    'components/RichTextEditor.tsx': 'CSS inside the field document',
    'components/WhiteboardOverlay.tsx': 'the ink colours a learner picks',
    'components/whiteboardSave.tsx': 'the saved page is paper, whatever the theme',
    'components/drawing/drawingTools.ts': 'the ink colours a learner picks',
    'components/drawing/DrawingPadModal.tsx': 'the eraser ring is drawn on the page, whatever colour the page is',
    'components/drawing/TextEntrySheet.tsx': 'the halo drawn around white ink',
    'components/editor/FormatPickerModals.tsx': 'the text and highlight colours a learner picks',
    'components/image-occlusion/occlusionEditorModel.ts': 'mask colours stored with the note',
    'components/image-occlusion/OcclusionShapesSvg.tsx': 'mask colours stored with the note',
    'components/image-occlusion/OcclusionCanvas.tsx': 'the zoom buttons float over the picture itself',
    'components/photo-editor/annotationRendering.tsx': 'ink and halo drawn into the photo',
    'components/photo-editor/webExport.ts': 'ink and halo drawn into the exported photo',
    'components/photo-editor/CropFrame.tsx': 'the crop frame is drawn over the photo itself',
    'components/photo-editor/PhotoEditorModal.tsx': 'the eraser ring and the compare badge are drawn over the photo itself',
    'components/stopwatch/SleepingPanda.tsx': 'an illustration',
    'components/stopwatch/SubjectArt.tsx': 'the course illustrations',
    'components/stopwatch/StopwatchHero.tsx': 'translucent white drawn over the green Kronometre hero',
    'app/catalog.tsx': 'the catalog hero artwork',
};

/** Characters that screens once drew as icons; components/ui/icons draws them now. */
const GLYPHS = ['›', '‹', '⌄', '⌃', '▾', '▸', '×', '✕', '✓', '⋮', '•••', '＋', '↻', '⌕', '☰', '⠿'];
const glyphPattern = GLYPHS.map((glyph) => glyph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
/**
 * A JSX text node, or a string literal, that is nothing but one of the glyphs. A literal with spaces
 * around the glyph (' › ' joining a deck path) is typography, not an icon.
 */
const LONE_GLYPH = new RegExp(`>\\s*(${glyphPattern})\\s*<|(['"\`])(${glyphPattern})\\2`, 'u');

describe('screens draw from the design system', () => {
    it('takes every colour from the theme, outside the files that draw user ink or artwork', () => {
        const offenders: string[] = [];
        for (const file of files) {
            if (file.startsWith('components/ui/') || COLOUR_LITERALS_ALLOWED[file]) continue;
            const lines = withoutComments(fs.readFileSync(file, 'utf8')).split('\n');
            lines.forEach((line, index) => {
                if (/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
            });
        }
        // Use colors.danger / warning / success / info, colors.onAccent, colors.scrim / scrimLight /
        // scrimStrong or colors.marked (constants/theme.ts) instead of a literal.
        expect(offenders).toEqual([]);
    });

    it('draws control glyphs as icons, not as text characters', () => {
        const offenders: string[] = [];
        for (const file of files) {
            if (file.startsWith('components/ui/') || !file.endsWith('.tsx')) continue;
            const lines = withoutComments(fs.readFileSync(file, 'utf8')).split('\n');
            lines.forEach((line, index) => {
                if (LONE_GLYPH.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
            });
        }
        // Use BackIcon, ChevronRightIcon, ChevronDownIcon, CloseIcon, CheckIcon, PlusIcon,
        // MoreIcon, MoreVerticalIcon, RefreshIcon, SearchIcon or DragHandleIcon from components/ui/icons.
        expect(offenders).toEqual([]);
    });

    it('lists only files that still exist among the colour exceptions', () => {
        expect(Object.keys(COLOUR_LITERALS_ALLOWED).filter((file) => !files.includes(file))).toEqual([]);
    });
});
