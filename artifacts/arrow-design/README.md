# Drawing arrow design — 2026-10-28

The shaft now ends at the midpoint of the triangular head's base rather than at its tip. Its round cap can no longer protrude through the tip. A drag shorter than the head draws only the head rather than a backwards shaft. The live SVG, native PNG export surface and web PNG export share `photoArrowGeometry`.

`before-after.png` is a comparison rendered from the actual `renderAnnotation` function: HEAD for Before, the changed implementation for After, with the same points, width and colour. It is a renderer comparison, not an iPhone screenshot. `comparison.html`, `before.svg` and `after.svg` are the source visuals.

Automated checks cover all three tool widths in 24 directions, consistent geometry at 4× export resolution and short arrows. The focused photo-editor/drawing tests passed (108 tests). TypeScript and the iOS/source-registry checks passed.

The first full quality run hit six 5-second test timeouts. A four-worker retry passed 2,529 tests but two additional test files could not start their worker processes. The final full-suite run (`npm test -- --pool=threads --maxWorkers=4`) passed: 242 test files, 2,544 tests; 2 files / 5 tests skipped. No product or test configuration was changed to achieve this.

The targeted iPhone Photo editor capture smoke remains pending: computer-use tools could not start because the configured workspace root is a symbolic link. Before release, draw arrows in multiple directions and sizes under More in Draw on Blank Canvas, then save, reopen and confirm the PNG matches the live canvas.

This is a product-specific rendering correction; Anki file formats and compatibility semantics are unchanged.
