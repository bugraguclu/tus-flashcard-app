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
    + '{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .2,.1 .2,.2:oi=1}}'
    + '{{c2::image-occlusion:text:left=.6:top=.1:text=Sol & sağ:scale=2:fs=.05}}';

const active = 'background:var(--active-shape-color, #ff8e8e);border:1px solid #212121';
const inactive = 'background:var(--inactive-shape-color, #ffeba2);border:1px solid #212121';
const highlight = 'background:var(--highlight-shape-color, #ff8e8e00);border:1px solid #ff8e8e';

describe('Image Occlusion masks', () => {
    it('masks the asked shape and, marked "hide all", the others', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 1 });
        expect(html).not.toContain('<canvas');
        expect(html).toContain(`<div class="io-shape" style="left:10%;top:20%;width:30%;height:40%;${active}"></div>`);
        // c3 hides the others; c2's ellipse does not, so it is not drawn while c1 is asked.
        expect(html).toContain('<polygon points="0.1,0.1 0.2,0.1 0.2,0.2" style="fill:var(--inactive-shape-color, #ffeba2)"');
        expect(html).not.toContain('border-radius');
        expect(html).not.toContain('io-label"');
        expect(html).toContain('<img src="kalp.png">');
    });

    it('labels a text shape while its deletion is asked, sized by the image height', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 2 });
        expect(html).toContain('<div class="io-label" style="left:60%;top:10%;font-size:10cqh;padding:0 10px 10px 0;color:#000">Sol &amp; sağ</div>');
        expect(html).toContain(`<div class="io-shape" style="left:50%;top:50%;width:20%;height:40%;${active};border-radius:50%"></div>`);
    });

    it('outlines the answered shape and keeps the masks it hides', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'answer', { clozeOrd: 2 });
        expect(html).toContain(`<div class="io-shape" style="left:50%;top:50%;width:20%;height:40%;${highlight};border-radius:50%"></div>`);
        expect(html).toContain(inactive);
        // Anki paints the hidden others before the answered outline.
        expect(html.indexOf(inactive)).toBeLessThan(html.indexOf(highlight));
        expect(html).toContain('<label id="toggle"><input id="io-toggle" type="checkbox" hidden>Toggle Masks</label>');
        expect(html).toContain('#toggle{-webkit-appearance:button;appearance:button;display:inline-block');
    });

    it('turns a box by its stored angle about its corner, and moves a polygon to its own corner', () => {
        const html = renderCardHtml(occlusion, note('{{c1::image-occlusion:rect:left=.1:top=.1:angle=250:width=.2:height=.1}}'
            + '{{c2::image-occlusion:polygon:left=.3:top=.4:points=.1,.1 .2,.1 .2,.3:oi=1}}'
            + '{{c0::image-occlusion:text:left=.1:top=.6:text=A\\:B:scale=1.5:oi=1}}'), 0, 'question', { clozeOrd: 1 });
        expect(html).toContain(`<div class="io-shape" style="left:10%;top:10%;width:20%;height:10%;${active};transform:rotate(9deg)"></div>`);
        expect(html).toContain('<polygon points="0.3,0.4 0.4,0.4 0.4,0.6"');
        // Without fs a label is Anki's 40 pixels, times its scale.
        expect(html).toContain('<div class="io-label" style="left:10%;top:60%;font-size:60px;padding:0 7.5px 7.5px 0;color:#000">A:B</div>');
    });

    it('hides Toggle Masks when no shape hides the others', () => {
        const html = renderCardHtml(occlusion, note('{{c1::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1}}'), 0, 'answer', { clozeOrd: 1 });
        expect(html).toContain('#toggle{-webkit-appearance:button;appearance:button;display:none');
    });

    it('leaves the canvas in a text export, as Anki writes the card', () => {
        const html = renderCardHtml(occlusion, note(shapes), 0, 'question', { clozeOrd: 1, forTextExport: true });
        expect(html).toContain('<canvas id="image-occlusion-canvas"></canvas>');
        expect(html).not.toContain('io-shape');
    });
});
