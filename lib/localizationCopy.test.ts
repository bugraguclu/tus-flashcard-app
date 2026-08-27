import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const COPY_ROOTS = ['app', 'components'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(root: string): string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
    });
}

function staticText(node: ts.Expression): string | null {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = staticText(node.left);
        const right = staticText(node.right);
        return left === null || right === null ? null : left + right;
    }
    return null;
}

describe('localized product copy', () => {
    const files = COPY_ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)));

    it('keeps static Turkish and English pairs nonempty and whitespace-aligned', () => {
        const issues: string[] = [];

        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node) => {
                if (
                    ts.isCallExpression(node)
                    && ts.isIdentifier(node.expression)
                    && node.expression.text === 'l'
                    && node.arguments.length >= 2
                ) {
                    const turkish = staticText(node.arguments[0]);
                    const english = staticText(node.arguments[1]);
                    if (turkish !== null && english !== null) {
                        const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                        const location = `${path.relative(process.cwd(), file)}:${line}`;
                        if (!turkish.trim() || !english.trim()) issues.push(`${location}: empty translation`);
                        if (/^\s/.test(turkish) !== /^\s/.test(english)) issues.push(`${location}: leading whitespace differs`);
                        if (/\s$/.test(turkish) !== /\s$/.test(english)) issues.push(`${location}: trailing whitespace differs`);
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(tree);
        }

        expect(issues).toEqual([]);
    });

    it('uses the formal Turkish voice in product copy', () => {
        const informalPatterns = [
            /\barayabilirsin\b/,
            /\bbirleştirebilirsin\b/,
            /\bçözebilirsin\b/,
            /\bçalışabilirsin\b/,
            /\bgeri alabilirsin\b/,
            /Bağlantını(?!z)/u,
            /deste listene(?!iz)/u,
        ];
        const issues = files.flatMap((file) => {
            const source = fs.readFileSync(file, 'utf8');
            return informalPatterns
                .filter((pattern) => pattern.test(source))
                .map((pattern) => `${path.relative(process.cwd(), file)}: ${pattern.source}`);
        });

        expect(issues).toEqual([]);
    });
});
