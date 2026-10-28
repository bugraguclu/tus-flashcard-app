import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ts from 'typescript';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Text, TextInput, TextScaleProvider } from '../components/AppText';

vi.mock('react-native', () => ({
    Text: 'Text',
    TextInput: 'TextInput',
    StyleSheet: {
        flatten: (style: unknown): Record<string, unknown> => (Array.isArray(style)
            ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
            : (style as Record<string, unknown>) ?? {}),
    },
}));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

const nativeInput = { focus: vi.fn() };

function render(multiplier: number, element: React.ReactElement) {
    act(() => {
        renderer = TestRenderer.create(
            React.createElement(TextScaleProvider, { multiplier }, element),
            { createNodeMock: () => nativeInput },
        );
    });
    return renderer!;
}

/** The style a host element is finally drawn with, later entries winning as in React Native. */
function drawnStyle(instance: TestRenderer.ReactTestInstance): Record<string, unknown> {
    const style = instance.props.style;
    return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : style ?? {};
}

const hosts = (type: string) => renderer!.root.findAll((node) => node.type === type);

describe('AppText at the designed size', () => {
    it('renders React Native Text and TextInput with the props untouched', () => {
        const style = { fontSize: 14, color: 'red' };
        render(1, React.createElement(React.Fragment, null,
            React.createElement(Text, { style, numberOfLines: 1 }, 'Kaydet'),
            React.createElement(TextInput, { style, value: 'a' }),
        ));
        const [text] = hosts('Text');
        const [input] = hosts('TextInput');
        expect(text.props.style).toBe(style);
        expect(text.props.numberOfLines).toBe(1);
        expect(input.props.style).toBe(style);
    });
});

describe('AppText at a larger step', () => {
    it('scales the size and line height of a Text and keeps its other styles', () => {
        render(1.3, React.createElement(Text, { style: [{ fontSize: 14, lineHeight: 20 }, { color: 'red' }] }, 'Desteler'));
        expect(drawnStyle(hosts('Text')[0])).toMatchObject({ fontSize: 18, lineHeight: 25.5, color: 'red' });
    });

    it('gives a Text without a size the scaled default size', () => {
        render(1.3, React.createElement(Text, null, 'Merhaba'));
        expect(drawnStyle(hosts('Text')[0]).fontSize).toBe(18);
    });

    it('lets nested Text inherit the scaled size instead of scaling it twice', () => {
        render(1.3, React.createElement(Text, { style: { fontSize: 14 } },
            'Toplam ',
            React.createElement(Text, { style: { fontWeight: '700' } }, '12'),
            React.createElement(Text, { style: { fontSize: 10 } }, ' kart'),
        ));
        const [outer, bold, small] = hosts('Text');
        expect(drawnStyle(outer).fontSize).toBe(18);
        expect(drawnStyle(bold).fontSize).toBeUndefined();
        expect(drawnStyle(small).fontSize).toBe(13);
    });

    it('keeps a Text that opts out of font scaling, and the Text inside it, at the designed size', () => {
        render(1.3, React.createElement(Text, { allowFontScaling: false, style: { fontSize: 22 } },
            'A',
            React.createElement(Text, { style: { fontSize: 11 } }, 'a'),
        ));
        const [outer, inner] = hosts('Text');
        expect(drawnStyle(outer).fontSize).toBe(22);
        expect(drawnStyle(inner).fontSize).toBe(11);
    });

    it('caps the step at maxFontSizeMultiplier and leaves the system size only what is left', () => {
        render(1.3, React.createElement(Text, { maxFontSizeMultiplier: 1.15, style: { fontSize: 20 } }, '28'));
        const [text] = hosts('Text');
        expect(drawnStyle(text).fontSize).toBe(23);
        expect(text.props.maxFontSizeMultiplier).toBe(1);
    });

    it('scales TextInput and still hands its ref to the native input', () => {
        const ref = React.createRef<TextInput>();
        render(1.3, React.createElement(TextInput, { ref, style: { fontSize: 16 }, value: 'x' }));
        const [input] = hosts('TextInput');
        expect(drawnStyle(input).fontSize).toBe(21);
        expect(input.props.value).toBe('x');
        // Screens focus inputs through this ref, so it must reach the native input, not the wrapper.
        expect(ref.current).toBe(nativeInput);
    });

    it('lets a preview area draw at a different step from the rest of the screen', () => {
        render(1, React.createElement(React.Fragment, null,
            React.createElement(Text, { style: { fontSize: 14 } }, 'Ekran'),
            React.createElement(TextScaleProvider, { multiplier: 1.3 },
                React.createElement(Text, { style: { fontSize: 14 } }, 'Önizleme')),
        ));
        const [screen, preview] = hosts('Text');
        expect(drawnStyle(screen).fontSize).toBe(14);
        expect(drawnStyle(preview).fontSize).toBe(18);
    });
});

describe('screens draw text through AppText', () => {
    const ROOTS = ['app', 'components', 'hooks', 'contexts'];
    const sourceFiles = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
    });

    it('never imports Text or TextInput from react-native outside AppText', () => {
        const offenders: string[] = [];
        for (const file of ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)))) {
            if (file.endsWith(path.join('components', 'AppText.tsx'))) continue;
            const source = fs.readFileSync(file, 'utf8');
            // Parsing every screen is slow on a busy machine: only a file with Text or TextInput
            // named in an import from react-native can offend, so only those are parsed.
            const imports = source.match(/import\s[^;]*?from\s+'react-native'/g) ?? [];
            if (!imports.some((statement) => /\bText(Input)?\b/.test(statement))) continue;
            const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
            for (const statement of tree.statements) {
                if (!ts.isImportDeclaration(statement)) continue;
                if ((statement.moduleSpecifier as ts.StringLiteral).text !== 'react-native') continue;
                const clause = statement.importClause;
                if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
                for (const element of clause.namedBindings.elements) {
                    const imported = (element.propertyName ?? element.name).text;
                    if (!element.isTypeOnly && (imported === 'Text' || imported === 'TextInput')) {
                        offenders.push(`${path.relative(process.cwd(), file)}: ${imported}`);
                    }
                }
            }
        }
        // Text drawn by React Native's own component ignores the Settings text size.
        expect(offenders).toEqual([]);
    });
});
