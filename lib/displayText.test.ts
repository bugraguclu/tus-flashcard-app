import { describe, expect, it } from 'vitest';
import { humanizeCardText } from './displayText';

describe('humanizeCardText', () => {
    it('reads a cloze note as text, not as deletion syntax', () => {
        expect(humanizeCardText('(-) CST ---> {{c1::iyi}} (+) CST ---> {{c1::kötü }}'))
            .toBe('(-) CST ---> iyi (+) CST ---> kötü');
    });

    it('keeps the answer and drops the hint of a hinted cloze', () => {
        expect(humanizeCardText('{{c2::asetilkolin::nörotransmitter}} salınır')).toBe('asetilkolin salınır');
    });

    it('names Image Occlusion masks once instead of printing their shape syntax', () => {
        expect(humanizeCardText(
            '{{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2}}'
            + '{{c2::image-occlusion:text:left=.2:top=.3:text=Sol & sağ:scale=1.5:fs=0.04}}',
        )).toBe('🖼️ Görüntü örtme');
        expect(humanizeCardText('Kalp {{c1::image-occlusion:polygon:points=1,2 3,4 5,6:oi=1}} ve {{c2::aort}}'))
            .toBe('Kalp 🖼️ Görüntü örtme ve aort');
    });

    it('replaces media with labels and strips markup', () => {
        expect(humanizeCardText('<div>EKG&nbsp;bulgusu</div><img src="a.png">[sound:b.mp3]'))
            .toBe('EKG bulgusu 🖼️ Görsel 🔊 Ses');
    });

    it('keeps inline formatting inside a word run and splits words at block boundaries', () => {
        expect(humanizeCardText('<b>Mitral</b>, triküspit, <i>aort</i>')).toBe('Mitral, triküspit, aort');
        expect(humanizeCardText('Na<sup>+</sup>/K<sup>+</sup> pompası')).toBe('Na+/K+ pompası');
        expect(humanizeCardText('<div>Kalp</div><div>Akciğer</div><ul><li>Böbrek</li><li>Karaciğer</li></ul>'))
            .toBe('Kalp Akciğer Böbrek Karaciğer');
    });

    it('shows safe audio filenames when the browser preference is enabled', () => {
        expect(humanizeCardText(
            '<div>Kalp sesi</div>[sound:media/../s1.mp3]<audio src="recording &quot;2&quot;.m4a"></audio>',
            { showAudioFilenames: true },
        )).toBe('Kalp sesi 🔊 s1.mp3 🔊 recording 2.m4a');
    });
});
