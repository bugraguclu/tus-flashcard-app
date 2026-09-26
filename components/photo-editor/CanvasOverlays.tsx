import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    PHOTO_ROTATE_HANDLE_OFFSET,
    photoRotateHandleSide,
    photoSelectionHandlePoints,
    photoTrashPillRect,
    type PhotoCropRect,
    type PhotoImage,
    type PhotoSelectionGeometry,
    type PhotoSelectionHandle,
    type PhotoText,
} from '../../lib/photoEditor';
import { PICTURE_STEP_DOWN, PICTURE_STEP_UP, type PhotoEditorI18n } from './editorModel';
import type { PhotoEditorStyles } from './photoEditorStyles';

interface SelectionOverlayProps {
    selectedBounds: PhotoSelectionGeometry['bounds'];
    selectedAnchor: PhotoSelectionGeometry['anchor'];
    selectedRotation: number;
    rotateSide: ReturnType<typeof photoRotateHandleSide>;
    selectionHandles: ReturnType<typeof photoSelectionHandlePoints>;
    activeHandle: PhotoSelectionHandle | null;
    rotationPreview: number | null;
    canvasSize: { width: number; height: number };
    selectedText: PhotoText | null;
    selectedPicture: PhotoImage | null;
    manipulating: boolean;
    selectionPillTop: number;
    selectionPillCentre: number;
    editSelectedText: () => void;
    cycleSelectedTextStyle: () => void;
    cycleSelectedTextAlign: () => void;
    changeSelectedTextSize: (delta: number) => void;
    deleteSelectedText: () => void;
    resizeSelectedPicture: (factor: number) => void;
    rotateSelectedPicture: () => void;
    deleteSelectedPicture: () => void;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
}

/** The frame around the selected label or picture: its handles, its knob and its action pill. */
export function SelectionOverlay({
    selectedBounds,
    selectedAnchor,
    selectedRotation,
    rotateSide,
    selectionHandles,
    activeHandle,
    rotationPreview,
    canvasSize,
    selectedText,
    selectedPicture,
    manipulating,
    selectionPillTop,
    selectionPillCentre,
    editSelectedText,
    cycleSelectedTextStyle,
    cycleSelectedTextAlign,
    changeSelectedTextSize,
    deleteSelectedText,
    resizeSelectedPicture,
    rotateSelectedPicture,
    deleteSelectedPicture,
    styles,
    l,
}: SelectionOverlayProps) {
    return (
        <View style={styles.selectionLayer}>
            <View
                style={[
                    styles.textSelectionBox,
                    {
                        left: selectedBounds.x - 4,
                        top: selectedBounds.y - 4,
                        width: selectedBounds.width + 8,
                        height: selectedBounds.height + 8,
                        transformOrigin: [
                            selectedAnchor.x - (selectedBounds.x - 4),
                            selectedAnchor.y - (selectedBounds.y - 4),
                            0,
                        ],
                        transform: [{ rotate: `${selectedRotation}deg` }],
                    },
                    { pointerEvents: 'none' },
                ]}
            >
                {/* The stem the knob hangs from. It lives inside the frame so
                    it leans with it without any maths of its own. */}
                <View
                    style={[
                        styles.rotateStem,
                        rotateSide === 'bottom'
                            ? { top: selectedBounds.height + 8, height: PHOTO_ROTATE_HANDLE_OFFSET - 4 }
                            : { top: -PHOTO_ROTATE_HANDLE_OFFSET + 4, height: PHOTO_ROTATE_HANDLE_OFFSET - 4 },
                    ]}
                />
            </View>

            {/* Corner handles, drawn at exactly the points the gesture
                handlers hit-test against. Touches are read by the canvas
                itself, which is why these stay out of the way. */}
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                <View
                    key={corner}
                    style={[
                        styles.selectionHandle,
                        {
                            left: selectionHandles[corner].x - 7,
                            top: selectionHandles[corner].y - 7,
                        },
                        activeHandle === corner && styles.selectionHandleActive,
                        { pointerEvents: 'none' },
                    ]}
                />
            ))}

            <View
                style={[
                    styles.rotateKnob,
                    {
                        left: selectionHandles.rotate.x - 15,
                        top: selectionHandles.rotate.y - 15,
                    },
                    activeHandle === 'rotate' && styles.rotateKnobActive,
                    { pointerEvents: 'none' },
                ]}
            >
                <Text style={[styles.rotateKnobIcon, activeHandle === 'rotate' && styles.rotateKnobIconActive]}>↻</Text>
            </View>

            {/* The angle, while it is being turned: a picture straightened by
                eye is never quite straight, and this is how the user knows
                the turn has settled on a quarter of one. */}
            {rotationPreview !== null && (
                <View
                    style={[
                        styles.anglePill,
                        {
                            left: Math.max(4, Math.min(canvasSize.width - 56, selectionHandles.rotate.x - 26)),
                            top: Math.max(4, selectionHandles.rotate.y - 44),
                        },
                        { pointerEvents: 'none' },
                    ]}
                >
                    <Text style={styles.anglePillText}>{rotationPreview}°</Text>
                </View>
            )}

            {/* Floating Action Pill */}
            {selectedText && !manipulating && (
            <View
                style={[
                    styles.textFloatingToolbar,
                    {
                        top: selectionPillTop,
                        left: Math.max(6, Math.min(canvasSize.width - 236, selectionPillCentre - 118)),
                    },
                ]}
            >
                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={editSelectedText}
                    accessibilityRole="button"
                    accessibilityLabel={l('Metni düzenle', 'Edit text')}
                >
                    <Text style={styles.textFloatingIcon}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={cycleSelectedTextStyle}
                    accessibilityRole="button"
                    accessibilityLabel={l('Metin stilini değiştir', 'Change text style')}
                >
                    <View style={[
                        styles.textStyleIconBadge,
                        (selectedText.bgStyle || 'classic') === 'badge' && styles.textStyleBadgeSolid,
                        (selectedText.bgStyle || 'classic') === 'frosted' && styles.textStyleBadgeFrosted,
                        (selectedText.bgStyle || 'classic') === 'outline' && styles.textStyleBadgeOutline,
                    ]}>
                        <Text style={styles.textStyleIconText}>A</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={cycleSelectedTextAlign}
                    accessibilityRole="button"
                    accessibilityLabel={l('Hizalamayı değiştir', 'Change alignment')}
                >
                    <Text style={styles.textFloatingIcon}>
                        {(selectedText.textAlign || 'center') === 'left' ? '⇤' : (selectedText.textAlign || 'center') === 'right' ? '⇥' : '≡'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={() => changeSelectedTextSize(-4)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Metni küçült', 'Decrease text size')}
                >
                    <Text style={styles.textFloatingSmallA}>A-</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={() => changeSelectedTextSize(4)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Metni büyüt', 'Increase text size')}
                >
                    <Text style={styles.textFloatingBigA}>A+</Text>
                </TouchableOpacity>

                <View style={styles.textFloatingDivider} />

                <TouchableOpacity
                    style={[styles.textFloatingBtn, styles.textFloatingDeleteBtn]}
                    onPress={deleteSelectedText}
                    accessibilityRole="button"
                    accessibilityLabel={l('Metni sil', 'Delete text')}
                >
                    <Text style={styles.textFloatingDeleteIcon}>🗑</Text>
                </TouchableOpacity>
            </View>
            )}

            {/* The same pill for a picture: size it, turn it, throw it away.
                Pinching does all three at once; these are for the finger that
                wants one small step, and for a picture too big to pinch. */}
            {selectedPicture && !manipulating && (
            <View
                style={[
                    styles.textFloatingToolbar,
                    {
                        top: selectionPillTop,
                        left: Math.max(6, Math.min(canvasSize.width - 172, selectionPillCentre - 86)),
                    },
                ]}
            >
                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={() => resizeSelectedPicture(PICTURE_STEP_DOWN)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Görseli küçült', 'Make the picture smaller')}
                >
                    <Text style={styles.textFloatingSmallA}>−</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={() => resizeSelectedPicture(PICTURE_STEP_UP)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Görseli büyüt', 'Make the picture bigger')}
                >
                    <Text style={styles.textFloatingBigA}>+</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.textFloatingBtn}
                    onPress={rotateSelectedPicture}
                    accessibilityRole="button"
                    accessibilityLabel={l('Görseli çeyrek tur döndür', 'Turn the picture a quarter turn')}
                >
                    <Text style={styles.textFloatingIcon}>↻</Text>
                </TouchableOpacity>

                <View style={styles.textFloatingDivider} />

                <TouchableOpacity
                    style={[styles.textFloatingBtn, styles.textFloatingDeleteBtn]}
                    onPress={deleteSelectedPicture}
                    accessibilityRole="button"
                    accessibilityLabel={l('Görseli sil', 'Delete the picture')}
                >
                    <Text style={styles.textFloatingDeleteIcon}>🗑</Text>
                </TouchableOpacity>
            </View>
            )}
        </View>
    );
}

interface TrashZoneProps {
    trashPill: ReturnType<typeof photoTrashPillRect>;
    trashHovered: boolean;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
}

/** The bin a dragged object is dropped on to delete it. */
export function TrashZone({
    trashPill,
    trashHovered,
    styles,
    l,
}: TrashZoneProps) {
    return (
        <View
            style={[
                styles.textTrashZone,
                {
                    left: trashPill.x,
                    top: trashPill.y,
                    width: trashPill.width,
                    height: trashPill.height,
                },
                trashHovered && styles.textTrashZoneHovered,
                { pointerEvents: 'none' },
            ]}
        >
            <Text style={[styles.textTrashIcon, trashHovered && styles.textTrashIconHovered]}>🗑</Text>
            {/* Both captions have to occupy the same box: a pill that resized
                itself as the highlight came and went would change the target
                the finger is already hovering over. */}
            <Text
                numberOfLines={1}
                style={[styles.textTrashLabel, trashHovered && styles.textTrashLabelHovered]}
            >
                {trashHovered ? l('Silmek için bırakın', 'Release to delete') : l('Silmek için buraya sürükleyin', 'Drag here to delete')}
            </Text>
        </View>
    );
}

interface CropOverlayProps {
    cropBox: PhotoCropRect;
    canvasSize: { width: number; height: number };
    styles: PhotoEditorStyles;
}

/** The crop box, its grid and the dimmed page outside it. */
export function CropOverlay({
    cropBox,
    canvasSize,
    styles,
}: CropOverlayProps) {
    return (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            {/* Dimming masks */}
            <View style={[styles.cropDim, { top: 0, left: 0, right: 0, height: cropBox.y * canvasSize.height }]} />
            <View style={[styles.cropDim, { top: (cropBox.y + cropBox.height) * canvasSize.height, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.cropDim, { top: cropBox.y * canvasSize.height, left: 0, width: cropBox.x * canvasSize.width, height: cropBox.height * canvasSize.height }]} />
            <View style={[styles.cropDim, { top: cropBox.y * canvasSize.height, left: (cropBox.x + cropBox.width) * canvasSize.width, right: 0, height: cropBox.height * canvasSize.height }]} />

            {/* Active Crop Box Frame */}
            <View
                style={[
                    styles.cropBox,
                    {
                        left: cropBox.x * canvasSize.width,
                        top: cropBox.y * canvasSize.height,
                        width: cropBox.width * canvasSize.width,
                        height: cropBox.height * canvasSize.height,
                    },
                ]}
            >
                {/* 3x3 Grid Guidelines */}
                <View style={[styles.cropGridH, { top: '33.33%' }]} />
                <View style={[styles.cropGridH, { top: '66.66%' }]} />
                <View style={[styles.cropGridV, { left: '33.33%' }]} />
                <View style={[styles.cropGridV, { left: '66.66%' }]} />

                {/* Corner Markers */}
                <View style={[styles.cornerHandle, styles.cornerTL]} />
                <View style={[styles.cornerHandle, styles.cornerTR]} />
                <View style={[styles.cornerHandle, styles.cornerBL]} />
                <View style={[styles.cornerHandle, styles.cornerBR]} />

                {/* Edge Markers */}
                <View style={[styles.edgeHandleH, { top: -3 }]} />
                <View style={[styles.edgeHandleH, { bottom: -3 }]} />
                <View style={[styles.edgeHandleV, { left: -3 }]} />
                <View style={[styles.edgeHandleV, { right: -3 }]} />
            </View>
        </View>
    );
}
