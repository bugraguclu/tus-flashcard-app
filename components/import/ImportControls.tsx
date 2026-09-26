import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import type { ImportStyles } from './importStyles';

export function ChevronDownIcon({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
            <Path d="m7 9.5 5 5 5-5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

export interface ChoiceModalProps {
    visible: boolean;
    title: string;
    cancelLabel: string;
    options: { value: string; label: string; hint?: string; selected: boolean }[];
    styles: ImportStyles;
    onSelect: (value: string) => void;
    onClose: () => void;
}

/** The centered list Anki's import selects drop down into, reused by every option on this screen. */
export function ChoiceModal({ visible, title, cancelLabel, options, styles, onSelect, onClose }: ChoiceModalProps) {
    if (!visible) return null;
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={cancelLabel} />
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{title}</Text>
                    <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                        {options.map((option) => (
                            <TouchableOpacity
                                key={option.value}
                                style={[styles.modalOption, option.selected && styles.modalOptionActive]}
                                onPress={() => onSelect(option.value)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: option.selected }}
                            >
                                <View style={styles.modalOptionCopy}>
                                    <Text style={[styles.modalOptionText, option.selected && styles.modalOptionTextActive]}>
                                        {option.label}
                                    </Text>
                                    {option.hint ? <Text style={styles.modalOptionHint}>{option.hint}</Text> : null}
                                </View>
                                {option.selected ? <Text style={styles.modalCheck}>✓</Text> : null}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.modalCloseText}>{cancelLabel}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
