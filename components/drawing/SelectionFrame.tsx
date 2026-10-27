import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Shadows, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { calculatePhotoTextBounds, photoImageBounds, type PhotoImage, type PhotoText } from '../../lib/photoEditor';
import { ClearGlyph } from './drawingGlyphs';

interface SelectionFrameProps {
    object: PhotoText | PhotoImage;
    canvas: { width: number; height: number };
    onDelete: () => void;
}

const BUTTON = 30;

/**
 * The outline around the label or picture in hand, and the button that removes it. The eraser
 * leaves pictures alone, so this button is how a picture comes off the page.
 */
export function SelectionFrame({ object, canvas, onDelete }: SelectionFrameProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const bounds = object.type === 'text'
        ? calculatePhotoTextBounds(object, canvas.width, canvas.height)
        : photoImageBounds(object, canvas.width, canvas.height);
    // The button sits on the frame's top-right corner, pulled back inside the page when the
    // object is against an edge, where a button half off the sheet could not be pressed.
    const left = Math.min(canvas.width - BUTTON - 2, Math.max(2, bounds.x + bounds.width - BUTTON / 2));
    const top = Math.min(canvas.height - BUTTON - 2, Math.max(2, bounds.y - BUTTON / 2));

    return (
        <>
            <View
                style={[
                    styles.frame,
                    { left: bounds.x - 4, top: bounds.y - 4, width: bounds.width + 8, height: bounds.height + 8, borderColor: colors.accent },
                    { pointerEvents: 'none' },
                ]}
            />
            <TouchableOpacity
                style={[styles.delete, { left, top, backgroundColor: colors.bgCard, borderColor: colors.border }]}
                onPress={onDelete}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel={object.type === 'text' ? l('Metni sil', 'Delete text') : l('Görseli sil', 'Delete picture')}
            >
                <ClearGlyph color={colors.btnAgain} size={16} />
            </TouchableOpacity>
        </>
    );
}

const styles = StyleSheet.create({
    frame: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 4 },
    delete: {
        position: 'absolute',
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.md,
    },
});
