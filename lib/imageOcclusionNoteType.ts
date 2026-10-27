/**
 * Anki's stock "Image Occlusion" note type, as Anki 26.09.3 creates it in a new collection
 * (recorded through scripts/anki-oracle), and how a note type is recognised as one.
 *
 * Anki marks the type with `originalStockKind` 6 and tags its five fields 0–4 (Occlusion, Image,
 * Header, Back Extra, Comments), so a renamed field or a clone is still found. The templates leave
 * a canvas for Anki's occlusion script; here lib/imageOcclusionMasks.ts lays the masks out instead.
 */

import type { NoteType } from './models';

/** This app's id for the built-in copy; a type imported from Anki keeps its own id. */
export const IMAGE_OCCLUSION_NOTE_TYPE_ID = 9;
/** Anki's `StockNotetype.OriginalStockKind` value for Image Occlusion. */
export const IMAGE_OCCLUSION_STOCK_KIND = 6;

const TEMPLATE = '{{#Header}}<div>{{Header}}</div>{{/Header}}\n<div style="display: none">{{cloze:Occlusion}}</div>\n'
    + '<div id="err"></div>\n<div id="image-occlusion-container">\n    {{Image}}\n    <canvas id="image-occlusion-canvas"></canvas>\n</div>\n'
    + '<script>\ntry {\n    anki.imageOcclusion.setup();\n} catch (exc) {\n'
    + '    document.getElementById("err").innerHTML = `Error loading image occlusion. Is your Anki version up to date?<br><br>${exc}`;\n}\n</script>\n';

const FIELD_NAMES = ['Occlusion', 'Image', 'Header', 'Back Extra', 'Comments'] as const;

export const IMAGE_OCCLUSION_NOTE_TYPE: NoteType = {
    id: IMAGE_OCCLUSION_NOTE_TYPE_ID,
    name: 'Image Occlusion',
    kind: 'cloze',
    fields: FIELD_NAMES.map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
    templates: [{
        name: 'Image Occlusion',
        ord: 0,
        qfmt: TEMPLATE,
        afmt: `${TEMPLATE}\n<div><button id="toggle">Toggle Masks</button></div>\n{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}\n`,
    }],
    css: '#image-occlusion-canvas {\n    --inactive-shape-color: #ffeba2;\n    --active-shape-color: #ff8e8e;\n'
        + '    --inactive-shape-border: 1px #212121;\n    --active-shape-border: 1px #212121;\n'
        + '    --highlight-shape-color: #ff8e8e00;\n    --highlight-shape-border: 1px #ff8e8e;\n}\n\n'
        + '.card {\n    font-family: arial;\n    font-size: 20px;\n    text-align: center;\n    color: black;\n    background-color: white;\n}\n',
    sortFieldIdx: 0,
    mod: 0,
    // The keys Anki's JSON carries beyond what the app models, so an export is Anki's own type.
    ankiRaw: {
        did: null,
        usn: 0,
        latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n'
            + '\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
        latexPost: '\\end{document}',
        latexsvg: false,
        req: [[0, 'any', [0, 1, 2]]],
        originalStockKind: IMAGE_OCCLUSION_STOCK_KIND,
        flds: FIELD_NAMES.map((name, ord) => ({
            name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, description: '', plainText: false,
            collapsed: false, excludeFromSearch: false, tag: ord, preventDeletion: name !== 'Comments',
        })),
        tmpls: [{ name: 'Image Occlusion', ord: 0, bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0 }],
    },
};

export interface ImageOcclusionFields {
    occlusion: number;
    image: number;
    header: number;
    backExtra: number;
    comments: number;
}

/** Whether a note type is Anki's Image Occlusion type (or a clone of it). */
export function isImageOcclusionNoteType(noteType: Pick<NoteType, 'id' | 'kind' | 'ankiRaw'> | null | undefined): boolean {
    if (!noteType || noteType.kind !== 'cloze') return false;
    return noteType.id === IMAGE_OCCLUSION_NOTE_TYPE_ID || noteType.ankiRaw?.originalStockKind === IMAGE_OCCLUSION_STOCK_KIND;
}

/**
 * Where an Image Occlusion type keeps each of its fields: by Anki's field tag, then by the stock
 * name, then by the stock position. Null for any other note type, or when Occlusion and Image
 * cannot both be found.
 */
export function imageOcclusionFields(noteType: NoteType | null | undefined): ImageOcclusionFields | null {
    if (!noteType || !isImageOcclusionNoteType(noteType)) return null;
    const rawFields = Array.isArray(noteType.ankiRaw?.flds) ? noteType.ankiRaw.flds as { name?: unknown; tag?: unknown }[] : [];
    const find = (tag: number): number => {
        const byTag = noteType.fields.findIndex((field, index) => {
            const raw = rawFields.find((entry) => entry.name === field.name) ?? rawFields[index];
            return raw?.tag === tag;
        });
        if (byTag >= 0) return byTag;
        const byName = noteType.fields.findIndex((field) => field.name === FIELD_NAMES[tag]);
        if (byName >= 0) return byName;
        return tag < noteType.fields.length ? tag : -1;
    };
    const fields = { occlusion: find(0), image: find(1), header: find(2), backExtra: find(3), comments: find(4) };
    return fields.occlusion >= 0 && fields.image >= 0 && fields.occlusion !== fields.image ? fields : null;
}
