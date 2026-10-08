import React, { useLayoutEffect, useRef, type IframeHTMLAttributes, type RefObject } from 'react';

interface WebHtmlFrameProps extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'srcDoc'> {
    frameRef: RefObject<HTMLIFrameElement | null>;
    html: string;
}

/**
 * An HTML surface, not a navigation destination. Changing iframe.srcDoc navigates the child
 * browsing context; Safari can restore its about:srcdoc entry in the main tab when Expo Router
 * goes back after review. Write into the existing blank document instead, keeping browser
 * history owned by the router. The caller's sandbox and the document's CSP still apply.
 * https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-document-open
 */
export default function WebHtmlFrame({ frameRef, html, ...props }: WebHtmlFrameProps) {
    const written = useRef<{ document: Document; html: string } | null>(null);
    useLayoutEffect(() => {
        const document = frameRef.current?.contentDocument;
        if (!document || (written.current?.document === document && written.current.html === html)) return;
        document.open();
        document.write(html);
        written.current = { document, html };
        document.close();
    }, [frameRef, html]);

    return <iframe {...props} ref={frameRef} />;
}
