// Image Occlusion shapes read from and written to the Occlusion field (lib/imageOcclusion.ts).
// The grammar and number format are Anki 26.09.3's, recorded through scripts/anki-oracle; the
// oracle test lib/imageOcclusion.oracle.test.ts checks Anki reads what is written here.
import { describe, expect, it } from 'vitest';
import {
    createOcclusionShape,
    formatOcclusionNumber,
    groupOcclusionShapes,
    moveOcclusionShape,
    nextOcclusionOrdinal,
    occludesInactive,
    occlusionAngleDegrees,
    occlusionAngleUnits,
    occlusionGeometry,
    occlusionImageField,
    occlusionImageFilename,
    parseOcclusionBody,
    parseOcclusionField,
    resizeOcclusionShape,
    serializeOcclusionField,
    setOccludesInactive,
    ungroupOcclusionShapes,
    withOcclusionProperties,
} from './imageOcclusion';

const props = (body: string) => parseOcclusionBody(body).properties.map(({ name, value }) => [name, value]);

describe('reading shapes as Anki reads them', () => {
    it('splits a name at its first = and a value at an unescaped colon', () => {
        expect(props('text:left=.1:top=.2:text=a\\:b:scale=1')).toEqual([['left', '.1'], ['top', '.2'], ['text', 'a:b'], ['scale', '1']]);
        expect(props('text:text=a\\\\c:fs=.04')).toEqual([['text', 'a\\c'], ['fs', '.04']]);
        expect(props('text:text=a=b c')).toEqual([['text', 'a=b c']]);
        expect(props('text:text=x\ny')).toEqual([['text', 'x\ny']]);
    });

    it('matches Anki on malformed input', () => {
        // A bare colon ends the value; the rest becomes a property named up to its =.
        expect(props('text:text=a:b:scale=1')).toEqual([['text', 'a'], ['b:scale', '1']]);
        expect(props('text:text=a\\\\:b:scale=1')).toEqual([['text', 'a\\'], ['b:scale', '1']]);
        expect(props('rect:left=.1:noeq:oi=1')).toEqual([['left', '.1'], ['noeq:oi', '1']]);
        // Another backslash escape ends the properties; a trailing piece without = is dropped.
        expect(props('text:left=.1:text=a\\xb:scale=1')).toEqual([['left', '.1']]);
        expect(props('rect:left=.1:oi=1::hint')).toEqual([['left', '.1'], ['oi', '1']]);
        expect(parseOcclusionBody('')).toEqual({ kind: '', properties: [] });
        expect(parseOcclusionBody('rect')).toEqual({ kind: '', properties: [] });
        expect(parseOcclusionBody('rect:')).toEqual({ kind: 'rect', properties: [] });
    });

    it('reads every deletion of a field in order, with its source', () => {
        const field = '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}<br>'
            + 'Not a shape {{c2::metin}} {{c0::image-occlusion:text:left=.2:top=.3:text=Kalp:scale=1.5:fs=.04}}'
            + '{{c12::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.3}}';
        const shapes = parseOcclusionField(field);
        expect(shapes.map((shape) => [shape.ordinal, shape.kind])).toEqual([[1, 'rect'], [0, 'text'], [12, 'polygon']]);
        expect(shapes[0].source).toBe('{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}');
        expect(occlusionGeometry(shapes[2])).toEqual({ kind: 'polygon', left: 0.1, top: 0.1, points: [[0.1, 0.1], [0.3, 0.1], [0.2, 0.3]], angle: 0 });
        expect(occlusionGeometry(shapes[1])).toEqual({ kind: 'text', left: 0.2, top: 0.3, text: 'Kalp', scale: 1.5, fs: 0.04, angle: 0 });
    });
});

describe('writing shapes as Anki writes them', () => {
    it('formats numbers with four decimals and no outer zeros', () => {
        expect(formatOcclusionNumber(0.1)).toBe('.1');
        expect(formatOcclusionNumber(0.123456)).toBe('.1235');
        expect(formatOcclusionNumber(0)).toBe('.0000');
        expect(formatOcclusionNumber(Number.NaN)).toBe('.0000');
        expect(formatOcclusionNumber(1)).toBe('1.');
        expect(formatOcclusionNumber(1.5)).toBe('1.5');
        expect(formatOcclusionNumber(-0.25)).toBe('-0.25');
    });

    it('stores angles in ten-thousandths of a turn', () => {
        expect(occlusionAngleUnits(9)).toBe('250');
        expect(occlusionAngleUnits(0)).toBeNull();
        expect(occlusionAngleUnits(360)).toBeNull();
        expect(occlusionAngleDegrees('250')).toBe(9);
        expect(occlusionAngleDegrees(undefined)).toBe(0);
    });

    it('writes new shapes in the order Anki’s editor does, each followed by <br>', () => {
        const shapes = [
            createOcclusionShape({ kind: 'rect', left: 0.1, top: 0.2, width: 0.3, height: 0.4, angle: 0 }, 1, true),
            createOcclusionShape({ kind: 'ellipse', left: 0.5, top: 0.5, rx: 0.1, ry: 0.2, angle: 9 }, 2, true),
            createOcclusionShape({ kind: 'polygon', left: 0.1, top: 0.1, points: [[0.1, 0.1], [0.3, 0.1], [0.2, 0.3]], angle: 0 }, 3, false),
            createOcclusionShape({ kind: 'text', left: 0.2, top: 0.3, text: 'Sol: sağ \\ alt', scale: 1, fs: 0.04, angle: 0 }, 4, true),
        ];
        expect(serializeOcclusionField(shapes)).toBe(
            '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}<br>'
            + '{{c2::image-occlusion:ellipse:left=.5:top=.5:angle=250:rx=.1:ry=.2:oi=1}}<br>'
            + '{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.3}}<br>'
            + '{{c0::image-occlusion:text:left=.2:top=.3:text=Sol\\: sağ \\\\ alt:scale=1.:fs=.04:oi=1}}<br>');
        expect(parseOcclusionField(serializeOcclusionField(shapes)).map((shape) => shape.properties)).toEqual(shapes.map((shape) => shape.properties));
    });

    it('writes an untouched imported field back unchanged', () => {
        const field = '{{c1::image-occlusion:rect:left=.10:top=.2:width=.3:height=.4:foo=bar:oi=1}}<br>'
            + '{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2:angle=250:fill=#00ff00}}<br>';
        expect(serializeOcclusionField(parseOcclusionField(field))).toBe(field);
    });

    it('keeps the order and unknown properties of a shape it changes', () => {
        const [shape] = parseOcclusionField('{{c3::image-occlusion:rect:left=.10:top=.2:width=.3:foo=b\\:r:height=.4:oi=1}}');
        const moved = moveOcclusionShape(shape, 0.05, 0);
        expect(serializeOcclusionField([moved])).toBe('{{c3::image-occlusion:rect:left=.15:top=.2:width=.3:foo=b\\:r:height=.4:oi=1}}<br>');
        expect(moveOcclusionShape(shape, 0, 0)).toBe(shape);
        // A property set to its present value leaves the source alone.
        expect(withOcclusionProperties(shape, { oi: '1' }).source).toBe(shape.source);
        expect(serializeOcclusionField([withOcclusionProperties(shape, { fill: '#ff0000' })])).toContain(':height=.4:fill=#ff0000:oi=1}}');
    });

    it('moves polygons point by point and resizes boxes', () => {
        const [polygon] = parseOcclusionField('{{c1::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .3,.1 .2,.3}}');
        expect(serializeOcclusionField([moveOcclusionShape(polygon, 0.1, 0.2)])).toBe(
            '{{c1::image-occlusion:polygon:left=.2:top=.3:points=.2,.3 .4,.3 .3,.5}}<br>');
        const [ellipse] = parseOcclusionField('{{c1::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2}}');
        expect(serializeOcclusionField([resizeOcclusionShape(ellipse, { left: 0.4, top: 0.4, width: 0.4, height: 0.2 })])).toBe(
            '{{c1::image-occlusion:ellipse:left=.4:top=.4:rx=.2:ry=.1}}<br>');
    });
});

describe('cloze numbers and "hide all, guess one"', () => {
    const field = '{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1}}'
        + '{{c3::image-occlusion:rect:left=.2:top=.1:width=.1:height=.1}}'
        + '{{c3::image-occlusion:rect:left=.3:top=.1:width=.1:height=.1}}'
        + '{{c0::image-occlusion:text:left=.1:top=.5:text=T:scale=1}}';

    it('numbers a new mask as Anki’s editor does', () => {
        expect(nextOcclusionOrdinal(parseOcclusionField(field))).toBe(2);
        expect(nextOcclusionOrdinal(parseOcclusionField(field.replace('c1::', 'c2::').replace('c1::', 'c2::')))).toBe(1);
        expect(nextOcclusionOrdinal([])).toBe(1);
        expect(nextOcclusionOrdinal(parseOcclusionField('{{c1::image-occlusion:rect:left=0}}'))).toBe(2);
    });

    it('groups selected masks under their lowest number and ungroups them again', () => {
        const shapes = parseOcclusionField(field);
        const grouped = groupOcclusionShapes(shapes, new Set([0, 1, 3]));
        expect(grouped.map((shape) => shape.ordinal)).toEqual([1, 1, 3, 0]);
        expect(grouped[0]).toBe(shapes[0]);
        // One member of a group taken out gets its own number; the rest keep theirs.
        expect(ungroupOcclusionShapes(shapes, new Set([2])).map((shape) => shape.ordinal)).toEqual([1, 3, 2, 0]);
        expect(ungroupOcclusionShapes(shapes, new Set([1, 2])).map((shape) => shape.ordinal)).toEqual([1, 3, 2, 0]);
        expect(ungroupOcclusionShapes(shapes, new Set([0])).map((shape) => shape.ordinal)).toEqual([1, 3, 3, 0]);
    });

    it('reads and sets oi=1 on every shape at once', () => {
        const shapes = parseOcclusionField(field);
        expect(occludesInactive(shapes)).toBe(false);
        const hidden = setOccludesInactive(shapes, true);
        expect(occludesInactive(hidden)).toBe(true);
        expect(serializeOcclusionField(hidden)).toBe(
            '{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1:oi=1}}<br>'
            + '{{c3::image-occlusion:rect:left=.2:top=.1:width=.1:height=.1:oi=1}}<br>'
            + '{{c3::image-occlusion:rect:left=.3:top=.1:width=.1:height=.1:oi=1}}<br>'
            + '{{c0::image-occlusion:text:left=.1:top=.5:text=T:scale=1:oi=1}}<br>');
        expect(serializeOcclusionField(setOccludesInactive(hidden, false))).toBe(serializeOcclusionField(shapes.map((shape) => ({ ...shape, source: undefined }))));
        // Anki counts a note as hiding all when any one shape says so.
        expect(occludesInactive(parseOcclusionField('{{c1::image-occlusion:rect:oi=0}}{{c2::image-occlusion:rect:oi=1}}'))).toBe(true);
    });
});

describe('the Image field', () => {
    it('reads and writes the picked file as Anki does', () => {
        expect(occlusionImageField('kalp.png')).toBe('<img src="kalp.png">');
        expect(occlusionImageFilename('<img src="kalp.png">')).toBe('kalp.png');
        expect(occlusionImageFilename('<div><img alt="x" src=\'a&amp;b.jpg\' /></div>')).toBe('a&b.jpg');
        expect(occlusionImageFilename(occlusionImageField('a"b&c.png'))).toBe('a"b&c.png');
        expect(occlusionImageFilename('')).toBeNull();
    });
});
