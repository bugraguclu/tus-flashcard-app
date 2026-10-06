import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Kind = 'emptyCards' | 'import' | 'export' | 'backup' | 'restore';

export default function DeckOverflowGlyph({ kind, color, size = 20 }: {
    kind: Kind;
    color: string;
    size?: number;
}) {
    const line = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            {kind === 'emptyCards' && (
                <>
                    <Path d="M6 4h11a2 2 0 0 1 2 2v11" {...line} />
                    <Rect x="3" y="7" width="13" height="14" rx="2" {...line} />
                    <Path d="m7 12 5 5m0-5-5 5" {...line} />
                </>
            )}
            {(kind === 'import' || kind === 'export') && (
                <>
                    <Path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" {...line} />
                    {kind === 'import'
                        ? <Path d="M12 3v13m-4-4 4 4 4-4" {...line} />
                        : <Path d="M12 16V3m-4 4 4-4 4 4" {...line} />}
                </>
            )}
            {kind === 'backup' && (
                <>
                    <Rect x="3" y="3" width="18" height="4" rx="1" {...line} />
                    <Path d="M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7M12 10v7m-3.5-3.5h7" {...line} />
                </>
            )}
            {kind === 'restore' && (
                <>
                    <Path d="M4 6v5h5M4.8 11a8 8 0 1 1 .6 5.2M12 8v4l3 2" {...line} />
                </>
            )}
        </Svg>
    );
}
