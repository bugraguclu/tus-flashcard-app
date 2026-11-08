import { StyleSheet } from 'react-native';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { DRAWING_MORE_TOOLS, type DrawingShapeTool, type DrawingTool } from '../../lib/drawingPad';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MenuItem } from '../ui/Menu';
import { AppSheet } from '../ui/Sheet';
import { DRAWING_TOOL_GLYPHS, drawingToolLabel } from './drawingTools';

interface MoreToolsSheetProps {
    visible: boolean;
    /** The tool in hand, marked in the list. */
    tool: DrawingTool;
    /** The tools to list; the photo editor leaves the picture out, since the photo is the picture. */
    tools?: (DrawingShapeTool | 'image')[];
    onPick: (tool: DrawingShapeTool | 'image') => void;
    onClose: () => void;
    /** Runs once the sheet has gone, e.g. to open the photo library for the picture tool. */
    onDismiss?: () => void;
}

/** The tools that do not fit on the bar: arrow, boxes, cover-up and a picture from the library. */
export function MoreToolsSheet({ visible, tool, tools = DRAWING_MORE_TOOLS, onPick, onClose, onDismiss }: MoreToolsSheetProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();

    const captions: Partial<Record<DrawingTool, string>> = {
        cover: l('Bir yeri dolu bir kutuyla kapatır', 'Hides an area under a solid box'),
        image: l('Galeriden bir görsel ekler', 'Adds a picture from the library'),
    };

    return (
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={l('Diğer araçlar', 'More Tools')}
            backdropLabel={l('Diğer araçları kapat', 'Close more tools')}
            onDismiss={onDismiss}
        >
            {/* One tool is in hand at a time: each row is an option of a single choice. */}
            <Card divided>
                {tools.map((id) => {
                    const Glyph = DRAWING_TOOL_GLYPHS[id];
                    const selected = tool === id;
                    return (
                        <MenuItem
                            key={id}
                            label={id === 'image' ? l('Görsel ekle', 'Add Picture') : drawingToolLabel(id, l)}
                            hint={captions[id]}
                            icon={<Glyph color={selected ? colors.accent : colors.textMuted} size={22} />}
                            checked={selected}
                            exclusive
                            onPress={() => onPick(id)}
                        />
                    );
                })}
            </Card>
            <Button label={t('common.cancel')} variant="plain" onPress={onClose} style={styles.cancel} />
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    cancel: { marginTop: Spacing.sm },
});
