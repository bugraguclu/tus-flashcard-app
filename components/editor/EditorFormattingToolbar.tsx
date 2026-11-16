import type { RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, type ColorScheme } from '../../constants/theme';
import {
    calculateToolbarButtonWidth,
    EDITOR_TOOLBAR_TABS,
    editorToolKeysForTab,
    type EditorToolbarTabId,
    type EditorToolKey,
} from '../../lib/editorToolbar';
import { isEditorToolActive, isEditorToolDisabled, type EditorFormatState } from '../../lib/editorFormatState';
import type { CustomToolbarButton } from '../../lib/customToolbar';
import { longPressHaptic } from '../../lib/haptics';
import { ToolButton } from '../ui/Bars';
import { SegmentedControl } from '../ui/Choice';
import { AnkiToolbarIcon } from './EditorIcons';
import { ToolbarKeyboardDoneButton } from './KeyboardDoneButton';
import type { FormattingTool } from './editorTools';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

interface EditorFormattingToolbarProps {
    toolbarTab: EditorToolbarTabId;
    onSelectTab: (tab: EditorToolbarTabId) => void;
    tools: Record<EditorToolKey, FormattingTool>;
    formatState: EditorFormatState;
    isCloze: boolean;
    /** `same` (long press) reuses the highest cloze number instead of the next one. */
    onCloze: (same?: boolean) => void;
    customButtons: CustomToolbarButton[];
    onCustomButtonPress: (button: CustomToolbarButton) => void;
    onCustomButtonLongPress: (button: CustomToolbarButton) => void;
    onCreateCustomButton: () => void;
    onDismissKeyboard: () => void;
    scrollable: boolean;
    scrollRef: RefObject<ScrollView | null>;
    screenWidth: number;
    colors: ColorScheme;
    styles: EditorStyles;
    l: EditorI18n['l'];
}

/** The Home/Styles/Insert formatting toolbar that sits above the keyboard. */
export function EditorFormattingToolbar({
    toolbarTab,
    onSelectTab,
    tools,
    formatState,
    isCloze,
    onCloze,
    customButtons,
    onCustomButtonPress,
    onCustomButtonLongPress,
    onCreateCustomButton,
    onDismissKeyboard,
    scrollable,
    scrollRef,
    screenWidth,
    colors,
    styles,
    l,
}: EditorFormattingToolbarProps) {
    const toolbarToolKeys = editorToolKeysForTab(toolbarTab);
    // The user's own buttons belong to the Insert tab; they insert, they do not format.
    const showsInsertExtras = toolbarTab === 'insert';
    // Cloze is not one of them. It is the single button a cloze note cannot be written without —
    // and the save error tells the learner to look for it "in the toolbar" — so it sits on the
    // tab the toolbar opens on rather than two taps away.
    const showsClozeTool = isCloze && toolbarTab === 'home';

    const toolbarItemCount = toolbarToolKeys.length
        + (showsClozeTool ? 1 : 0)
        + (showsInsertExtras ? customButtons.length + 1 : 0);
    const centerToolbar = toolbarItemCount * 44 <= screenWidth;

    const { buttonWidth: dynamicButtonWidth, isPeeking: shouldPeekScrollable } = calculateToolbarButtonWidth({
        screenWidth,
        toolbarItemCount,
        isScrollable: scrollable,
    });
    const buttonWidthStyle = shouldPeekScrollable ? { width: dynamicButtonWidth } : null;

    const renderFormattingToolbarItems = () => (
        <>
            {showsClozeTool && (
                <ToolButton
                    style={buttonWidthStyle}
                    onPress={() => onCloze(false)}
                    onLongPress={() => { longPressHaptic(); onCloze(true); }}
                    accessibilityLabel={l('Boşluk ekle', 'Add cloze deletion')}
                    accessibilityHint={l('Seçimi bir sonraki boşluk numarasıyla kapatır; basılı tutunca aynı numarayı kullanır', 'Wraps the selection in the next cloze number; press and hold to reuse the same number')}
                    accessibilityActions={[{ name: 'longpress', label: l('Aynı numarayla boşluk ekle', 'Add cloze with the same number') }]}
                    onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onCloze(true); }}
                >
                    <Text style={styles.customFormatButtonText}>[…]</Text>
                </ToolButton>
            )}
            {toolbarToolKeys.map((key) => {
                const tool = tools[key];
                const isActive = isEditorToolActive(key, formatState);
                const isDisabled = isEditorToolDisabled(key, formatState);
                const tint = isDisabled ? colors.textMuted : isActive ? colors.accent : colors.textPrimary;
                return (
                    <ToolButton
                        key={key}
                        style={buttonWidthStyle}
                        selected={isActive}
                        // A tool that cannot apply is greyed rather than silently swallowing the press.
                        disabled={isDisabled}
                        onPress={tool.onPress}
                        onLongPress={tool.onLongPress ? () => { longPressHaptic(); tool.onLongPress?.(); } : undefined}
                        delayLongPress={450}
                        accessibilityLabel={tool.label}
                        accessibilityHint={tool.hint}
                    >
                        {tool.text
                            ? (
                                <Text style={[
                                    styles.blockStyleButtonText,
                                    isActive && !isDisabled && styles.blockStyleButtonTextActive,
                                    isDisabled && styles.blockStyleButtonTextDisabled,
                                ]}>
                                    {tool.text}
                                </Text>
                            )
                            : <AnkiToolbarIcon name={tool.icon} color={tint} />}
                    </ToolButton>
                );
            })}
            {showsInsertExtras && customButtons.map((button, index) => (
                <ToolButton
                    key={button.id}
                    style={buttonWidthStyle}
                    onPress={() => onCustomButtonPress(button)}
                    onLongPress={() => { longPressHaptic(); onCustomButtonLongPress(button); }}
                    delayLongPress={450}
                    accessibilityLabel={button.buttonText || String(index + 1)}
                    accessibilityHint={l('Basılı tutarak düzenleyin veya kaldırın', 'Long press to edit or remove')}
                >
                    <Text style={styles.customFormatButtonText} numberOfLines={1} adjustsFontSizeToFit>
                        {button.buttonText || String(index + 1)}
                    </Text>
                </ToolButton>
            ))}
            {showsInsertExtras && (
                <ToolButton
                    style={buttonWidthStyle}
                    onPress={onCreateCustomButton}
                    accessibilityLabel={l('Araç çubuğu öğesi oluştur', 'Create toolbar item')}
                >
                    <AnkiToolbarIcon name="add" color={colors.textPrimary} />
                </ToolButton>
            )}
        </>
    );

    return (
        <View style={styles.formatToolbar}>
            <View style={styles.toolbarTabsRow}>
                <SegmentedControl
                    options={EDITOR_TOOLBAR_TABS.map((tab) => ({ value: tab.id, label: l(tab.tr, tab.en) }))}
                    value={toolbarTab}
                    onChange={onSelectTab}
                    accessibilityLabel={l('Araç sekmesi', 'Tool tab')}
                />
                <ToolbarKeyboardDoneButton
                    onPress={onDismissKeyboard}
                    colors={colors}
                    styles={styles}
                    l={l}
                />
            </View>
            {scrollable ? (
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    style={styles.formatToolbarScroll}
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    contentContainerStyle={[
                        styles.formatToolbarContent,
                        centerToolbar && styles.formatToolbarContentCentered,
                        !centerToolbar && { paddingRight: Spacing.sm },
                    ]}
                >
                    {renderFormattingToolbarItems()}
                </ScrollView>
            ) : (
                <View style={styles.formatToolbarWrapped}>
                    {renderFormattingToolbarItems()}
                </View>
            )}
        </View>
    );
}
