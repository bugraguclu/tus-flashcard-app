import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    InteractionManager,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text, TextInput } from '../AppText';
import type { ColorScheme } from '../../constants/theme';
import { alert, confirm } from '../../lib/confirm';
import { parseTagName, previewTagRename, renameTagWithBackup, TagNameError, type TagNameErrorCode, type TagRenamePreview } from '../../lib/tagRename';
import { bulkEditFailure, noteCount } from './noteToolMessages';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import type { NoteToolStyles } from './noteToolStyles';

interface RenameTagDialogProps {
    colors: ColorScheme;
    l: BrowserI18n['l'];
    /** Cancelled, or done and acknowledged: the browser returns to the tag list it came from. */
    onClose: () => void;
    /** The tag was renamed on the notes; the list refreshes and the tag filter follows the new name. */
    onRenamed: (oldName: string, newName: string) => void;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    /** The tag being renamed; the dialog shows while it is set. */
    tag: string | null;
    toolStyles: NoteToolStyles;
}

type Notice = { tone: 'info' | 'error'; text: string } | null;

/** Anki's sidebar Rename for a tag: the tag and its children, on every note. */
export function RenameTagDialog({ colors, l, onClose, onRenamed, styles, t, tag, toolStyles }: RenameTagDialogProps) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState<'counting' | 'renaming' | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const runRef = useRef(0);

    useEffect(() => {
        if (tag === null) return;
        setName(tag);
        setNotice(null);
        setBusy(null);
    }, [tag]);

    const close = () => {
        if (busy === 'renaming') return;
        runRef.current += 1;
        setBusy(null);
        onClose();
    };

    const nameMessage = (code: TagNameErrorCode) => (code === 'separator'
        ? l('Etiket adında boşluk olamaz. Alt etiketler için :: kullanın.', 'A tag name cannot contain spaces. Use :: for child tags.')
        : l('Yeni etiket adını yazın.', 'Type the new tag name.'));

    const confirmMessage = (oldName: string, preview: TagRenamePreview) => [
        l(
            `“${oldName}” ve alt etiketleri tüm koleksiyonda “${preview.newName}” olarak yeniden adlandırılacak.`,
            `“${oldName}” and its child tags will be renamed to “${preview.newName}” across the whole collection.`,
        ),
        l(`${noteCount(preview.noteCount, l)} değişecek.`, `${noteCount(preview.noteCount, l)} will change.`),
        preview.merges
            ? l(`“${preview.newName}” zaten kullanılıyor; iki etiket birleştirilecek.`, `“${preview.newName}” is already in use; the two tags will be merged.`)
            : null,
        l('Önce koleksiyonun bir güvenlik yedeği alınır.', 'A safety backup of the collection is taken first.'),
    ].filter(Boolean).join('\n');

    const rename = async (oldName: string, input: string) => {
        setBusy('renaming');
        try {
            const { backupFileName, result } = await renameTagWithBackup(oldName, input);
            setBusy(null);
            onRenamed(oldName, result.newName);
            alert(
                l('Etiket yeniden adlandırıldı', 'Tag Renamed'),
                [
                    l(`${result.updated} not güncellendi.`, result.updated === 1 ? '1 note updated.' : `${result.updated} notes updated.`),
                    l(`Koleksiyonun önceki hâli ${backupFileName} yedeğinde.`, `The collection as it was is in the backup ${backupFileName}.`),
                ].join('\n'),
                onClose,
            );
        } catch (error) {
            console.warn('[Browser] tag rename failed:', error);
            setBusy(null);
            if (error instanceof TagNameError) {
                setNotice({ tone: 'error', text: nameMessage(error.code) });
                return;
            }
            const failure = bulkEditFailure(error, { l, t });
            alert(failure.title, failure.message);
        }
    };

    const submit = () => {
        if (tag === null || busy) return;
        const input = name;
        try {
            parseTagName(input);
        } catch (error) {
            if (!(error instanceof TagNameError)) throw error;
            setNotice({ tone: 'error', text: nameMessage(error.code) });
            return;
        }
        setNotice(null);
        setBusy('counting');
        const oldName = tag;
        const token = ++runRef.current;
        InteractionManager.runAfterInteractions(() => {
            if (token !== runRef.current) return;
            let preview: TagRenamePreview;
            try {
                preview = previewTagRename(oldName, input);
            } catch (error) {
                console.warn('[Browser] tag rename preview failed:', error);
                setBusy(null);
                setNotice({ tone: 'error', text: l('Notlar okunamadı; hiçbir not değiştirilmedi.', 'The notes could not be read; no note was changed.') });
                return;
            }
            setBusy(null);
            if (preview.noteCount === 0) {
                setNotice({ tone: 'info', text: l('Bu adla hiçbir notun etiketi değişmez.', 'With this name no note’s tags would change.') });
                return;
            }
            confirm(
                l('Etiketi yeniden adlandır', 'Rename Tag'),
                confirmMessage(oldName, preview),
                () => { void rename(oldName, input); },
                { confirmLabel: l('Yeniden adlandır', 'Rename') },
            );
        });
    };

    const editable = busy === null;

    return (
        <Modal visible={tag !== null} transparent animationType="fade" onRequestClose={close}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={close}
                    accessibilityRole="button"
                    accessibilityLabel={l('Etiketi yeniden adlandırma penceresini kapat', 'Close Rename Tag')}
                />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle} accessibilityRole="header">{l('Etiketi yeniden adlandır', 'Rename Tag')}</Text>
                    <Text style={styles.modalCaption}>
                        {l(
                            'Etiket ve alt etiketleri (ad::alt) tüm notlarda yeniden adlandırılır. Var olan bir etiketin adını verirseniz ikisi birleşir.',
                            'The tag and its child tags (name::child) are renamed on every note. Giving the name of an existing tag merges the two.',
                        )}
                    </Text>
                    <Text style={styles.fieldLabel}>{l('Yeni ad', 'New name')}</Text>
                    <TextInput
                        style={styles.dialogInput}
                        value={name}
                        onChangeText={(value) => { setName(value); setNotice(null); }}
                        editable={editable}
                        autoFocus
                        selectTextOnFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel={l('Yeni etiket adı', 'New tag name')}
                    />
                    {notice && (
                        <Text style={[toolStyles.notice, notice.tone === 'error' && toolStyles.noticeError]} accessibilityLiveRegion="polite">
                            {notice.text}
                        </Text>
                    )}
                    {busy && (
                        <View style={toolStyles.busyRow} accessibilityLiveRegion="polite">
                            <ActivityIndicator color={colors.accent} />
                            <Text style={toolStyles.busyText}>
                                {busy === 'counting'
                                    ? l('Etiketi taşıyan notlar sayılıyor…', 'Counting the notes with this tag…')
                                    : l('Yedek alınıyor ve etiket yeniden adlandırılıyor…', 'Backing up and renaming the tag…')}
                            </Text>
                        </View>
                    )}
                    <View style={styles.dialogActions}>
                        <TouchableOpacity
                            style={[styles.dialogButton, busy === 'renaming' && toolStyles.disabled]}
                            onPress={close}
                            disabled={busy === 'renaming'}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.cancel')}
                            accessibilityState={{ disabled: busy === 'renaming' }}
                        >
                            <Text style={styles.dialogButtonText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.dialogButton, styles.dialogButtonPrimary, !editable && toolStyles.disabled]}
                            onPress={submit}
                            disabled={!editable}
                            accessibilityRole="button"
                            accessibilityLabel={l('Yeniden adlandır', 'Rename')}
                            accessibilityState={{ disabled: !editable }}
                        >
                            <Text style={styles.dialogButtonPrimaryText}>{l('Yeniden adlandır', 'Rename')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
