// Keeps screens on the shared design system (docs/DESIGN_SYSTEM.md): colours come from theme
// tokens, control glyphs from components/ui/icons, dimming from the scrim tokens.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIELD_ROW_FOCUS_CSS } from './fieldRowFocus';

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
    'components/GoogleGlyph.tsx': 'Google’s trademark, in the colours its branding guidelines require',
};

/** Characters that screens once drew as icons; components/ui/icons draws them now. */
const GLYPHS = ['›', '‹', '⌄', '⌃', '▾', '▸', '×', '✕', '✓', '⋮', '•••', '＋', '↻', '⌕', '☰', '⠿'];
const glyphPattern = GLYPHS.map((glyph) => glyph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
/**
 * A JSX text node, or a string literal, that is nothing but one of the glyphs. A literal with spaces
 * around the glyph (' › ' joining a deck path) is typography, not an icon.
 */
const LONE_GLYPH = new RegExp(`>\\s*(${glyphPattern})\\s*<|(['"\`])(${glyphPattern})\\2`, 'u');

/**
 * Controls built by hand instead of from components/ui, counted per file. `touch` is every raw
 * touchable; `smallTouch` those among them with no 44-point target the test can see (no `hitSlop`,
 * and no style with a height of 44 or more); `modal`, `input` and `switch` are raw React Native
 * ones. lib/designSystemAllowlist.json records today's counts: a file may lower its numbers, never
 * raise them, and a new file starts at zero.
 */
const RAW_KINDS = ['touch', 'smallTouch', 'modal', 'input', 'switch'] as const;
type RawKind = typeof RAW_KINDS[number];
type RawCounts = Partial<Record<RawKind, number>>;
const ALLOWLIST_PATH = path.join(process.cwd(), 'lib', 'designSystemAllowlist.json');
const HIT_TARGET_POINTS = 44;

/** The opening tag that starts at `start`, up to the `>` that closes it. */
function openingTag(source: string, start: number): string {
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        else if (char === '>' && depth === 0 && source[index - 1] !== '=') return source.slice(start, index + 1);
    }
    return source.slice(start);
}

/** Names of the styles in `source` that are at least 44 points tall. */
function tallStyles(source: string): Set<string> {
    const names = new Set<string>();
    for (const match of source.matchAll(/(\w+): \{([^{}]*)\}/g)) {
        const height = /\b(?:minHeight|height): (\d+|HIT_TARGET|FAB_SIZE)\b/.exec(match[2]);
        if (height && (Number.isNaN(Number(height[1])) || Number(height[1]) >= HIT_TARGET_POINTS)) names.add(match[1]);
    }
    return names;
}

function countRawControls(file: string): RawCounts {
    const source = withoutComments(fs.readFileSync(file, 'utf8'));
    // A screen's styles often live beside it in a *Styles file.
    const styleSources = [...source.matchAll(/from '(\.[^']*[sS]tyles)'/g)].flatMap((match) => {
        const base = path.join(path.dirname(file), match[1]);
        return ['.ts', '.tsx'].map((ext) => base + ext).filter((candidate) => fs.existsSync(candidate))
            .map((candidate) => fs.readFileSync(candidate, 'utf8'));
    });
    const tall = new Set([source, ...styleSources].flatMap((text) => [...tallStyles(text)]));
    // `(?<![\w.])` keeps a type argument (`useRef<TextInput>`) from counting as an element.
    const counts: RawCounts = {};
    const add = (kind: RawKind) => { counts[kind] = (counts[kind] ?? 0) + 1; };
    for (const match of source.matchAll(/(?<![\w.])<(TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Pressable)\b/g)) {
        add('touch');
        const tag = openingTag(source, match.index);
        const sized = /\bhitSlop=/.test(tag) || [...tag.matchAll(/\.(\w+)\b/g)].some((name) => tall.has(name[1]));
        if (!sized) add('smallTouch');
    }
    for (const _match of source.matchAll(/(?<![\w.])<Modal\b/g)) add('modal');
    for (const _match of source.matchAll(/(?<![\w.])<TextInput\b/g)) add('input');
    for (const _match of source.matchAll(/(?<![\w.])<Switch\b/g)) add('switch');
    return counts;
}

// The kit itself draws the raw controls everyone else borrows.
const controlFiles = files.filter((file) => !file.startsWith('components/ui/') && !/\.test\.tsx?$/.test(file));
const rawControls: Record<string, RawCounts> = Object.fromEntries(
    controlFiles.map((file) => [file, countRawControls(file)] as const).filter(([, counts]) => Object.keys(counts).length > 0),
);
if (process.env.UPDATE_DESIGN_ALLOWLIST) fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(rawControls, null, 2)}\n`);
const allowedControls: Record<string, RawCounts> = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));

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
        // MoreIcon, RefreshIcon, SearchIcon or DragHandleIcon from components/ui/icons.
        expect(offenders).toEqual([]);
    });

    it('leaves the browser focus ring of a field to the field-row rule', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const lines = withoutComments(fs.readFileSync(file, 'utf8')).split('\n');
            lines.forEach((line, index) => {
                if (/outline(Style|Width|Color|Offset)\b/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
            });
        }
        // An input inside a drawn box spreads `fieldRowProps` (components/ui/fieldRow.ts) on that
        // box: hiding the ring by hand leaves keyboard focus invisible, and leaving it on the
        // input draws a second frame inside the field.
        expect(offenders).toEqual([]);
        expect(fs.readFileSync('app/+html.tsx', 'utf8')).toContain('FIELD_ROW_FOCUS_CSS');
        expect(FIELD_ROW_FOCUS_CSS).toBe(
            '[data-field-row] input,[data-field-row] textarea{outline:none}'
            + '[data-field-row]:has(input:focus-visible,textarea:focus-visible)'
            + '{outline:Highlight auto 1px;outline:-webkit-focus-ring-color auto 1px}',
        );
    });

    it('lists only files that still exist among the colour exceptions', () => {
        expect(Object.keys(COLOUR_LITERALS_ALLOWED).filter((file) => !files.includes(file))).toEqual([]);
    });

    it('builds no new control by hand: raw touchables, modals, fields and switches only shrink', () => {
        const grown = controlFiles.flatMap((file) => RAW_KINDS
            .filter((kind) => (rawControls[file]?.[kind] ?? 0) > (allowedControls[file]?.[kind] ?? 0))
            .map((kind) => `${file}: ${rawControls[file][kind]} ${kind} (allowed ${allowedControls[file]?.[kind] ?? 0})`));
        // Build it from components/ui instead (Button, IconButton, ListRow, AppDialog, AppSheet,
        // TextField, SwitchRow). A touchable that must stay raw needs a 44-point target: `hitSlop`,
        // or a style in the same file or its *Styles file with a height of 44 or more.
        expect(grown).toEqual([]);
    });

    it('keeps the raw-control list current, so it can only go down', () => {
        const stale = Object.keys(allowedControls).flatMap((file) => RAW_KINDS
            .filter((kind) => (allowedControls[file][kind] ?? 0) > (rawControls[file]?.[kind] ?? 0))
            .map((kind) => `${file}: ${kind} is now ${rawControls[file]?.[kind] ?? 0}, listed ${allowedControls[file][kind]}`));
        // Lower the numbers: UPDATE_DESIGN_ALLOWLIST=1 npx vitest run lib/designSystem.test.ts
        expect(stale).toEqual([]);
    });
});

