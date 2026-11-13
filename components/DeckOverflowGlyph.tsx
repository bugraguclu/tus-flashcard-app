import { Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline } from './icons/IconFrame';
import { DeckGlyph, DownloadGlyph, FilterGlyph, HISTORY_PATH, UploadGlyph } from './UiGlyphs';

type Kind = 'emptyCards' | 'import' | 'export' | 'backup' | 'restore' | 'deck' | 'filteredDeck';

/**
 * The deck screens' line glyphs: the deck list's overflow menu, its add menu, and the mark of a
 * regular (`deck`) or filtered (`filteredDeck`) deck, which the list used to draw as ▤ and ⧉.
 */
export default function DeckOverflowGlyph({ kind, color, size = 20 }: {
    kind: Kind;
    color: string;
    size?: number;
}) {
    if (kind === 'import') return <DownloadGlyph color={color} size={size} />;
    if (kind === 'export') return <UploadGlyph color={color} size={size} />;
    if (kind === 'deck') return <DeckGlyph color={color} size={size} />;
    if (kind === 'filteredDeck') return <FilterGlyph color={color} size={size} />;
    const line = outline(color, iconStroke(size));
    return (
        <IconFrame size={size}>
            {kind === 'emptyCards' && <Rect x={5} y={3.5} width={14} height={17} rx={3} {...line} strokeDasharray="2.25 3.4" />}
            {kind === 'backup' && (
                <>
                    <Rect x={3.5} y={4} width={17} height={4.75} rx={1.75} {...line} />
                    <Path d="M5 8.75v9a2.75 2.75 0 0 0 2.75 2.75h8.5A2.75 2.75 0 0 0 19 17.75v-9M12 11.5v5.5m-2.75-2.75h5.5" {...line} />
                </>
            )}
            {kind === 'restore' && <Path d={HISTORY_PATH} {...line} />}
        </IconFrame>
    );
}
