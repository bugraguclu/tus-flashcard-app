import type { RefObject } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
import { AnkiToolbarIcon, KeyboardDismissIcon } from './EditorIcons';
import type { FormattingTool } from './editorTools';
import type { EditorI18n } from './types';
import type { EditorStyles } from './editorStyles';

interface EditorFormattingToolbarProps {
    toolbarTab: EditorToolbarTabId;
    onSelectTab: (tab: EditorToolbarTabId) => void;
    tools: Record<EditorToolKey, FormattingTool>;
    formatState: EditorFormatState;
    isCloze: boolean;
    onCloze: () => void;
    customButtons: CustomToolbarButton[];
    onCustomButtonPress: (button: CustomToolbarButton) => void;
    onCustomButtonLongPress: (button: CustomToolbarButton) => void;
    onCreateCustomButton: () => void;
    keyboardVisible: boolean;
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
    keyboardVisible,
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
                <TouchableOpacity
                    style={[styles.formatButton, buttonWidthStyle]}
                    onPress={onCloze}
                    accessibilityRole="button"
                    accessibilityLabel={l('Boşluk ekle', 'Add cloze deletion')}
                    accessibilityHint={l('Metin alanındaki seçimi bir sonraki boşluk numarasıyla kapatır', 'Wraps the Text field selection in the next cloze number')}
                >
                    <Text style={styles.customFormatButtonText}>[…]</Text>
                </TouchableOpacity>
            )}
            {toolbarToolKeys.map((key) => {
                const tool = tools[key];
                const isActive = isEditorToolActive(key, formatState);
                const isDisabled = isEditorToolDisabled(key, formatState);
                const tint = isDisabled ? colors.textMuted : isActive ? colors.accent : colors.textPrimary;
                return (
                    <TouchableOpacity
                        key={key}
                        style={[
                            styles.formatButton,
                            buttonWidthStyle,
                            isActive && !isDisabled && styles.formatButtonActive,
                            isDisabled && styles.formatButtonDisabled,
                        ]}
                        onPress={tool.onPress}
                        onLongPress={tool.onLongPress}
                        delayLongPress={450}
                        disabled={isDisabled}
                        accessibilityRole="button"
                        accessibilityLabel={tool.label}
                        accessibilityState={{ selected: isActive, disabled: isDisabled }}
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
                    </TouchableOpacity>
                );
            })}
            {showsInsertExtras && customButtons.map((button, index) => (
                <TouchableOpacity
                    key={button.id}
                    style={[styles.formatButton, buttonWidthStyle]}
                    onPress={() => onCustomButtonPress(button)}
                    onLongPress={() => onCustomButtonLongPress(button)}
                    delayLongPress={450}
                    accessibilityRole="button"
                    accessibilityLabel={button.buttonText || String(index + 1)}
                    accessibilityHint={l('Basılı tutarak düzenleyin veya kaldırın', 'Long press to edit or remove')}
                >
                    <Text style={styles.customFormatButtonText} numberOfLines={1} adjustsFontSizeToFit>
                        {button.buttonText || String(index + 1)}
                    </Text>
                </TouchableOpacity>
            ))}
            {showsInsertExtras && (
                <TouchableOpacity
                    style={[styles.formatButton, buttonWidthStyle]}
                    onPress={onCreateCustomButton}
                    accessibilityRole="button"
                    accessibilityLabel={l('Araç çubuğu öğesi oluştur', 'Create toolbar item')}
                >
                    <AnkiToolbarIcon name="add" color={colors.textPrimary} />
                </TouchableOpacity>
            )}
        </>
    );

    return (
        <View style={styles.formatToolbar}>
            <View style={styles.toolbarTabsRow}>
                <View style={styles.toolbarTabs} accessibilityRole="tablist">
                    {EDITOR_TOOLBAR_TABS.map((tab) => {
                        const selected = toolbarTab === tab.id;
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={[styles.toolbarTab, selected && styles.toolbarTabActive]}
                                onPress={() => onSelectTab(tab.id)}
                                // The pill is short so the toolbar stays compact; the slop is what
                                // gives it the 44pt target a thumb needs.
                                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                                accessibilityLabel={l(tab.tr, tab.en)}
                            >
                                <Text style={[styles.toolbarTabText, selected && styles.toolbarTabTextActive]}>
                                    {l(tab.tr, tab.en)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {keyboardVisible && (
                    <TouchableOpacity
                        style={styles.keyboardDismissButton}
                        onPress={onDismissKeyboard}
                        accessibilityRole="button"
                        accessibilityLabel={l('Klavyeyi kapat', 'Dismiss keyboard')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <KeyboardDismissIcon color={colors.accent} size={17} />
                        <Text style={styles.keyboardDismissText}>{l('Kapat', 'Done')}</Text>
                    </TouchableOpacity>
                )}
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
