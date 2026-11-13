import { Path, Rect } from 'react-native-svg';
import { IconFrame, iconStroke, outline, solid } from './icons/IconFrame';

type Props = {
    color: string;
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
};

/** The part of the tilted back card that shows around the upright front card. */
const BACK_CARD = 'M6.85 17.53A2.5 2.5 0 0 1 5.69 16.02L3.43 7.57A2.5 2.5 0 0 1 5.19 4.5L10.75 3.02A2.5 2.5 0 0 1 13.81 4.78L13.83 4.85';

/** My cards: two flashcards fanned, the back one tilted behind the front one. */
export default function CardsGlyph({ color, size = 20, filled = false, strokeWidth }: Props) {
    const width = strokeWidth ?? iconStroke(size);
    return (
        <IconFrame size={size}>
            <Path d={BACK_CARD} {...outline(color, width)} />
            <Rect x={9.25} y={7.25} width={10.75} height={13.75} rx={2.5} {...(filled ? solid(color, width) : outline(color, width))} />
        </IconFrame>
    );
}
