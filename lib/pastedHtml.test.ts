import { describe, expect, it } from 'vitest';
import { pastedFieldHtml, pastedTextAsHtml, sanitizePastedHtml } from './pastedHtml';

describe('sanitizePastedHtml', () => {
    it('drops the look a browser copies with plain text', () => {
        // What Safari puts on the clipboard for one unformatted sentence.
        const safari = '<meta charset="utf-8"><span style="caret-color: rgb(0, 0, 0); color: rgb(0, 0, 0); font-family: -webkit-standard; '
            + 'font-size: medium; font-style: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; text-align: start; '
            + 'text-indent: 0px; white-space: normal; -webkit-text-stroke-width: 0px; text-decoration: none; display: inline !important; float: none;">'
            + 'Kalp yetmezliği’nde BNP artar</span><br class="Apple-interchange-newline">';
        expect(sanitizePastedHtml(safari)).toBe('Kalp yetmezliği’nde BNP artar');
    });

    it('keeps emphasis, structure and links, without classes or ids', () => {
        const page = '<div class="mw-parser" id="x"><h2 class="t">Tanı</h2><p style="margin:0 0 8px;font-size:14px;line-height:1.5">'
            + '<strong class="b">EKG</strong>, <em>EKO</em>, <u>BNP</u>, <a href="https://tr.wikipedia.org/wiki/Kalp" class="l" onclick="x()">kalp</a>, H<sub>2</sub>O, m<sup>2</sup></p>'
            + '<ul class="list"><li data-x="1">bir</li><li>iki</li></ul></div>';
        expect(sanitizePastedHtml(page)).toBe(
            '<div><h2>Tanı</h2><p><strong>EKG</strong>, <em>EKO</em>, <u>BNP</u>, <a href="https://tr.wikipedia.org/wiki/Kalp">kalp</a>, H<sub>2</sub>O, m<sup>2</sup></p>'
            + '<ul><li>bir</li><li>iki</li></ul></div>',
        );
    });

    it('reads Google Docs: the bold wrapper that is not bold goes, real bold stays', () => {
        const docs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">'
            + '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;text-decoration:none;vertical-align:baseline;white-space:pre-wrap;">Başlık</span>'
            + '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;text-decoration:underline;">ve metin</span></p></b>';
        expect(sanitizePastedHtml(docs)).toBe(
            '<p dir="ltr"><span style="font-weight: bold">Başlık</span><span style="font-style: italic; text-decoration: underline">ve metin</span></p>',
        );
    });

    it('reads Word: only the copied fragment, without Office markup', () => {
        const word = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body><!--StartFragment-->'
            + "<p class=MsoNormal><span style='font-size:12.0pt;font-family:\"Times New Roman\",serif;color:red'>Kırmızı<o:p></o:p></span></p>"
            + '<!--EndFragment--></body></html>';
        expect(sanitizePastedHtml(word)).toBe('<p><span style="color: red">Kırmızı</span></p>');
    });

    it('keeps a colour that is a colour and a highlight that is a highlight', () => {
        expect(sanitizePastedHtml('<span style="color: rgb(220, 38, 38)">kırmızı</span>')).toBe('<span style="color: rgb(220, 38, 38)">kırmızı</span>');
        expect(sanitizePastedHtml('<font color="#0000ff" face="Arial" size="2">mavi</font>')).toBe('<span style="color: #0000ff">mavi</span>');
        expect(sanitizePastedHtml('<span style="background-color: rgb(255, 255, 0);">sarı</span>')).toBe('<span style="background-color: rgb(255, 255, 0)">sarı</span>');
        expect(sanitizePastedHtml('<mark>işaretli</mark>')).toBe('<mark>işaretli</mark>');
    });

    it('drops the ink and paper of the source page, which break the other theme', () => {
        for (const style of [
            'color: rgb(0, 0, 0)', 'color: #222', 'color: rgb(32, 33, 36)', 'color: white', 'color: rgba(0, 0, 0, 0.87)', 'color: hsl(210, 5%, 20%)',
            'background-color: rgb(255, 255, 255)', 'background-color: #f6f8fa', 'background: transparent', 'background-color: rgba(255, 255, 0, 0)',
            'background-color: rgb(221, 244, 255)', 'color: var(--text)', 'font-family: Georgia', 'font-size: 12px', 'line-height: 2', 'margin: 4px',
        ]) {
            expect(sanitizePastedHtml(`<span style="${style}">metin</span>`), style).toBe('metin');
        }
    });

    it('removes scripts, styles, embeds and handlers, and never a link that runs code', () => {
        const hostile = '<style>.a{}</style>önce<script>alert(1)</script><iframe src="x"></iframe><img src="javascript:alert(1)" onerror="x()">'
            + '<a href="javascript:alert(1)">tıkla</a><svg><circle/></svg><p onclick="x()" style="color:red;background:url(javascript:1)">sonra</p>';
        expect(sanitizePastedHtml(hostile)).toBe('öncetıkla<p style="color: red">sonra</p>');
    });

    it('keeps a table with its rules and cells', () => {
        const table = '<table class="t" style="border-collapse: collapse; width: 100%; font-size: 10px"><tbody><tr><th colspan="2" style="border: 1px solid #000; padding: 4px; background: #eee">Başlık</th></tr>'
            + '<tr><td style="border:1px solid rgb(0,0,0);padding:4px">a</td><td rowspan="1">b</td></tr></tbody></table>';
        expect(sanitizePastedHtml(table)).toBe(
            '<table style="border-collapse: collapse"><tbody><tr><th colspan="2" style="border: 1px solid; padding: 4px">Başlık</th></tr>'
            + '<tr><td style="border: 1px solid; padding: 4px">a</td><td rowspan="1">b</td></tr></tbody></table>',
        );
    });

    it("keeps what the app's own fields hold: clozes, pictures, sounds, alignment", () => {
        const field = 'Aort {{c1::kapağı}} <img src="pasted_17.jpg"> <audio controls src="s1.mp3"></audio><div style="text-align: center">orta</div>';
        // The same content; attributes come out in the order the filter lists them.
        expect(sanitizePastedHtml(field)).toBe('Aort {{c1::kapağı}} <img src="pasted_17.jpg"> <audio src="s1.mp3" controls></audio><div style="text-align: center">orta</div>');
        expect(sanitizePastedHtml('<img src="" data-tus-src="a.png" alt="x">')).toBe('<img src="" alt="x" data-tus-src="a.png">');
    });

    it('turns page sections into lines and keeps text of tags it does not know', () => {
        expect(sanitizePastedHtml('<article><section>bir</section><section>iki</section></article>')).toBe('<div><div>bir</div><div>iki</div></div>');
        expect(sanitizePastedHtml('<label>etiket</label> <custom-tag>özel</custom-tag> a < b')).toBe('etiket özel a &lt; b');
        expect(sanitizePastedHtml('<b>açık <i>kalan</b> etiket')).toBe('<b>açık <i>kalan</i></b> etiket');
    });
});

describe('pastedFieldHtml', () => {
    it('falls back to the plain text when the markup held nothing', () => {
        expect(pastedFieldHtml('<meta charset="utf-8"><style>p{}</style>', 'satır 1\nsatır <2>')).toBe('satır 1<br>satır &lt;2&gt;');
        expect(pastedFieldHtml('<span style="color:#000">metin</span>', 'metin')).toBe('metin');
        expect(pastedFieldHtml('<img src="a.png">', '')).toBe('<img src="a.png">');
        expect(pastedTextAsHtml('a & b\r\nc')).toBe('a &amp; b<br>c');
    });
});
