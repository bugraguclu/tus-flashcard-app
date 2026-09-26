import {
    calculatePhotoTextBounds,
    normalizePhotoRotation,
    normalizedRect,
    photoArrowHead,
    photoImageAnchorPixels,
    photoImageBounds,
    photoTextAnchorPixels,
    photoTextColors,
    scalePhotoAnnotation,
    resolvePhotoTextAlign,
    type PhotoAnnotation,
} from '../../lib/photoEditor';
import {
    blankCanvasPaperGeometry,
    blankCanvasPaperInk,
    scaleBlankCanvasRuling,
    type BlankCanvasPage,
} from '../../lib/blankCanvas';

/** The web export's counterpart to `renderAnnotation`, scaled the same way and by the same rule. */
function drawAnnotationOnCanvas(
    ctx: CanvasRenderingContext2D,
    source: PhotoAnnotation | null | undefined,
    width: number,
    height: number,
    scale = 1,
) {
    if (!source) return;
    const annotation = scalePhotoAnnotation(source, scale);
    ctx.save();
    ctx.globalAlpha = annotation.opacity ?? 1;
    ctx.strokeStyle = annotation.color || '#000000';
    ctx.fillStyle = annotation.color || '#000000';
    ctx.lineWidth = annotation.width || 3 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (!points.length) return ctx.restore();
        ctx.beginPath();
        ctx.moveTo((points[0].x ?? 0) * width, (points[0].y ?? 0) * height);
        for (let index = 1; index < points.length; index += 1) {
            ctx.lineTo((points[index].x ?? 0) * width, (points[index].y ?? 0) * height);
        }
        ctx.stroke();
        return ctx.restore();
    }

    if (annotation.type === 'text') {
        if (!annotation.point) return ctx.restore();
        const rotation = normalizePhotoRotation(annotation.rotation ?? 0);
        if (rotation) {
            const anchor = photoTextAnchorPixels(annotation, width, height);
            ctx.translate(anchor.x, anchor.y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-anchor.x, -anchor.y);
        }
        const bounds = calculatePhotoTextBounds(annotation, width, height);
        const bgStyle = annotation.bgStyle || 'classic';
        const textColor = annotation.color || '#ffffff';
        const fontSize = annotation.fontSize || 20 * scale;
        const lineHeight = fontSize * 1.25;
        const textAlign = resolvePhotoTextAlign(annotation);
        const { background: badgeBgColor, text: finalTextColor } = photoTextColors(annotation);

        if (bgStyle !== 'classic') {
            const radius = Math.max(6 * scale, fontSize * 0.3);
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
            } else {
                ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
            if (bgStyle === 'outline') {
                ctx.strokeStyle = textColor;
                ctx.lineWidth = 2.5 * scale;
                ctx.stroke();
            } else {
                ctx.fillStyle = badgeBgColor;
                ctx.globalAlpha = bgStyle === 'frosted' ? 0.75 : 1;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
        ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = textAlign === 'left' ? 'left' : textAlign === 'right' ? 'right' : 'center';
        const textX = textAlign === 'left'
            ? bounds.x + bounds.paddingX
            : textAlign === 'right'
                ? bounds.x + bounds.width - bounds.paddingX
                : bounds.x + bounds.width / 2;

        bounds.lines.forEach((line, index) => {
            const lineY = bounds.y + bounds.paddingY + (index + 0.82) * lineHeight;
            if (bgStyle === 'classic') {
                ctx.strokeStyle = textColor === '#ffffff' ? '#111827' : '#ffffff';
                ctx.lineWidth = Math.max(3 * scale, fontSize * 0.18);
                ctx.lineJoin = 'round';
                ctx.strokeText(line, textX, lineY);
            }
            ctx.fillStyle = finalTextColor;
            ctx.fillText(line, textX, lineY);
        });

        return ctx.restore();
    }

    // Painted by `drawPlacedPicturesOnCanvas` before this pass, for the reason above.
    if (annotation.type === 'image') return ctx.restore();

    if (!annotation.start || !annotation.end) return ctx.restore();
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 * scale + ctx.lineWidth * 1.5);
        ctx.beginPath();
        ctx.moveTo(head[0].x, head[0].y);
        ctx.lineTo(head[1].x, head[1].y);
        ctx.lineTo(head[2].x, head[2].y);
        ctx.closePath();
        ctx.fill();
        return ctx.restore();
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'rect') {
        ctx.strokeRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else if (annotation.type === 'cover') {
        ctx.globalAlpha = 0.96;
        ctx.fillRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else {
        ctx.beginPath();
        ctx.ellipse(
            (rect.x + rect.width / 2) * width,
            (rect.y + rect.height / 2) * height,
            rect.width * width / 2,
            rect.height * height / 2,
            0, 0, Math.PI * 2,
        );
        ctx.stroke();
    }
    ctx.restore();
}

/** Load one picture for a web export; the DOM decodes before the canvas can draw it. */
function loadWebImage(uri: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Image could not be loaded'));
        element.src = uri;
    });
}

/**
 * The web export's counterpart to `renderPlacedPictures`: every placed picture, in order, under
 * the pass that draws the ink. A picture that cannot be read is skipped rather than allowed to
 * fail the whole save — the rest of the drawing is still worth keeping.
 */
async function drawPlacedPicturesOnCanvas(
    ctx: CanvasRenderingContext2D,
    annotations: PhotoAnnotation[],
    width: number,
    height: number,
    scale = 1,
): Promise<void> {
    for (const source of annotations) {
        if (source.type !== 'image') continue;
        const picture = scalePhotoAnnotation(source, scale);
        let element: HTMLImageElement;
        try {
            element = await loadWebImage(picture.uri);
        } catch (error) {
            console.warn('[PhotoEditor] a placed picture could not be exported:', error);
            continue;
        }
        const bounds = photoImageBounds(picture, width, height);
        const rotation = normalizePhotoRotation(picture.rotation ?? 0);
        ctx.save();
        if (rotation) {
            const anchor = photoImageAnchorPixels(picture, width, height);
            ctx.translate(anchor.x, anchor.y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-anchor.x, -anchor.y);
        }
        ctx.drawImage(element, bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.restore();
    }
}

export async function rasterizePhotoWeb(
    uri: string,
    annotations: PhotoAnnotation[],
    surface: { width: number; height: number; scale: number },
): Promise<Uint8Array> {
    const width = Math.max(1, Math.round(surface.width));
    const height = Math.max(1, Math.round(surface.height));
    const image = await loadWebImage(uri);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    await drawPlacedPicturesOnCanvas(ctx, annotations, width, height, surface.scale);
    annotations.forEach((annotation) => drawAnnotationOnCanvas(ctx, annotation, width, height, surface.scale));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

/** Web export for a drawn page: paint the paper, then replay the annotations over it. */
export async function rasterizeBlankCanvasWeb(
    page: BlankCanvasPage,
    annotations: PhotoAnnotation[],
    surface: { width: number; height: number; scale: number },
): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(surface.width));
    canvas.height = Math.max(1, Math.round(surface.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pageRuling = page.ruling
        ? scaleBlankCanvasRuling(page.ruling, canvas.width / Math.max(1, page.width))
        : null;
    const ruling = blankCanvasPaperGeometry(page.paper, canvas.width, canvas.height, pageRuling);
    if (ruling.lines.length || ruling.dots.length) {
        const ink = blankCanvasPaperInk(page.background);
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = Math.max(1, ruling.spacing / 40);
        ruling.lines.forEach((line) => {
            ctx.beginPath();
            ctx.moveTo(line.x1, line.y1);
            ctx.lineTo(line.x2, line.y2);
            ctx.stroke();
        });
        const dotRadius = Math.max(1, ruling.spacing / 22);
        ruling.dots.forEach((dot) => {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    await drawPlacedPicturesOnCanvas(ctx, annotations, canvas.width, canvas.height, surface.scale);
    annotations.forEach((annotation) => (
        drawAnnotationOnCanvas(ctx, annotation, canvas.width, canvas.height, surface.scale)
    ));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}
