// Image Occlusion cards on screen: the masks Anki's occlusion script paints, drawn ahead of time
// because card scripts do not run here (lib/imageOcclusionMasks.ts). The note type below is Anki
// 26.09.3's stock Image Occlusion type, its templates as Anki writes them.
import { describe, expect, it } from 'vitest';
import type { Note, NoteType } from './models';
import { renderCardHtml } from './templates';

const template = (answer: boolean) => '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n'
    + '<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n'
    + '<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n}\n</script>\n'
    + (answer ? '\n<div><button id="toggle">Toggle Masks</button></div>\n{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}' : '');

const occlusion: NoteType = {
    id: 9, name: 'Image Occlusion', kind: 'cloze', sortFieldIdx: 0, mod: 0, css: '',
    fields: ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'].map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
    templates: [{ name: 'Image Occlusion', ord: 0, qfmt: template(false), afmt: template(true) }],
};

function note(occlusions: string): Note {
    return { id: 1, guid: 'g', noteTypeId: 9, mod: 0, usn: -1, tags: [], fields: [occlusions, '<img src="kalp.png">', 'Kalp', '', ''], sfld: '', csum: 0, flags: 0 };
}

const shapes = '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}'
    + '{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2}}'
    + '{{c3::image-occlusion:polygon:points=.1,.1 .2,.1 .2,.2:oi=1}}'
    + '{{c2::image-occlusion:text:left=.6:top=.1:text=Sol & sağ:scale=2:fs=12}}';

describe('Image Occlusion masks', () => {
    it('masks the asked shape and, marked "hide all", the others', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 1 });
        expect(html).not.toContain('<canvas');
        expect(html).toContain('<rect x="0.1" y="0.2" width="0.3" height="0.4" style="fill:var(--active-shape-color, #ff8e8e)" stroke="#212121"');
        // c3 hides the others; c2's ellipse does not, so it is not drawn while c1 is asked.
        expect(html).toContain('<polygon points="0.1,0.1 0.2,0.1 0.2,0.2" style="fill:var(--inactive-shape-color, #ffeba2)"');
        expect(html).not.toContain('<ellipse');
        expect(html).not.toContain('<text');
        expect(html).toContain('<img src="kalp.png">');
    });

    it('labels a text shape while its deletion is asked', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 2 });
        expect(html).toContain('<text x="60%" y="10%" font-family="Arial" font-size="24px"');
        expect(html).toContain('>Sol &amp; sağ</tspan>');
        expect(html).toContain('<ellipse cx="0.6" cy="0.7" rx="0.1" ry="0.2" style="fill:var(--active-shape-color, #ff8e8e)"');
    });

    it('outlines the answered shape and keeps the masks it hides', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'answer', { clozeOrd: 2 });
        expect(html).toContain('<ellipse cx="0.6" cy="0.7" rx="0.1" ry="0.2" style="fill:var(--highlight-shape-color, #ff8e8e00)" stroke="#ff8e8e"');
        expect(html).toContain('style="fill:var(--inactive-shape-color, #ffeba2)"');
        expect(html).toContain('<label id="toggle"><input id="io-toggle" type="checkbox" hidden>Toggle Masks</label>');
        expect(html).toContain('#toggle{-webkit-appearance:button;appearance:button;display:inline-block');
    });

    it('hides Toggle Masks when no shape hides the others', () => {
        const html = renderCardHtml(occlusion, note('{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1}}'), 0, 'answer', { clozeOrd: 1 });
        expect(html).toContain('#toggle{-webkit-appearance:button;appearance:button;display:none');
    });

    it('leaves the canvas in a text export, as Anki writes the card', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 1, forTextExport: true });
        expect(html).toContain('<canvas id="image-occlusion-canvas"></canvas>');
        expect(html).not.toContain('<svg');
    });
});
