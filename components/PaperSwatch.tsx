// One drawing page, ruled. The editor canvas, the paper chips and the new-page sheet all render
// through this so a thumbnail promises exactly what the exported PNG delivers.

import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import {
    blankCanvasPaperGeometry,
    blankCanvasPaperInk,
    type BlankCanvasPaper,
    type BlankCanvasRuling,
} from '../lib/blankCanvas';

interface PaperSwatchProps {
    paper: BlankCanvasPaper;
    background: string;
    width: number;
    height: number;
    /**
     * Ruling in this swatch's own units, for a page that has been cropped or turned. A chip or a
     * fresh page leaves it out and gets the default ruling for its size.
     */
    ruling?: BlankCanvasRuling | null;
    style?: StyleProp<ViewStyle>;
}

function PaperSwatch({ paper, background, width, height, ruling: pageRuling, style }: PaperSwatchProps) {
    const ruling = useMemo(
        () => blankCanvasPaperGeometry(paper, width, height, pageRuling),
        [paper, width, height, pageRuling],
    );
    const ink = blankCanvasPaperInk(background);
    const dotRadius = Math.max(1, ruling.spacing / 22);

    return (
        <View style={[{ width, height, backgroundColor: background, overflow: 'hidden' }, style]}>
            {(ruling.lines.length > 0 || ruling.dots.length > 0) && (
                <Svg width={width} height={height}>
                    {ruling.lines.map((line, index) => (
                        <Line
                            key={`rule-${index}`}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            stroke={ink}
                            strokeWidth={1}
                        />
                    ))}
                    {ruling.dots.map((dot, index) => (
                        <Circle key={`dot-${index}`} cx={dot.x} cy={dot.y} r={dotRadius} fill={ink} />
                    ))}
                </Svg>
            )}
        </View>
    );
}

export default React.memo(PaperSwatch);

type Localize = (turkish: string, english: string) => string;

export function paperLabel(paper: BlankCanvasPaper, l: Localize): string {
    if (paper === 'grid') return l('Kareli', 'Grid');
    if (paper === 'lined') return l('Çizgili', 'Lined');
    if (paper === 'dotted') return l('Noktalı', 'Dotted');
    return l('Düz', 'Plain');
}

export function pageColorLabel(backgroundId: string, l: Localize): string {
    if (backgroundId === 'cream') return l('Krem', 'Cream');
    if (backgroundId === 'slate') return l('Koyu', 'Dark');
    return l('Beyaz', 'White');
}
