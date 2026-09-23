import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { alert } from '../lib/confirm';
import { inferImportFileType } from '../lib/importFile';
import { onStudyReminderOpened } from '../lib/studyNotifications';
import { registerWebServiceWorker } from '../lib/webServiceWorker';

type LaunchParams = { files?: readonly FileSystemFileHandle[] };
type LaunchQueue = { setConsumer(consumer: (params: LaunchParams) => void): void };

/**
 * The browser's side of what the iPhone gets from the operating system:
 *
 * - "Open in" hand-off. A package or text file dropped onto the window, or opened with the
 *   installed web app from the desktop (File Handling API), goes to the canonical `/import`
 *   workflow exactly as a file handed over by the Files app does.
 * - Clicking a study reminder opens the deck list, as tapping one does on iOS.
 * - The service worker that lets the installed web app start offline.
 *
 * Mounted once, by the root stack, on web only.
 */
export default function WebAppIntegrations() {
    const router = useRouter();
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [dragging, setDragging] = useState(false);

    const openImport = useCallback((file: File) => {
        router.push({
            pathname: '/import',
            params: { incomingUri: URL.createObjectURL(file), incomingName: file.name },
        } as never);
    }, [router]);

    useEffect(() => {
        registerWebServiceWorker();
    }, []);

    useEffect(() => onStudyReminderOpened(() => router.replace('/decks' as never)), [router]);

    useEffect(() => {
        const launchQueue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
        launchQueue?.setConsumer(async ({ files }) => {
            for (const handle of files ?? []) {
                const file = await handle.getFile();
                if (inferImportFileType(file.name)) {
                    openImport(file);
                    return;
                }
            }
        });
    }, [openImport]);

    useEffect(() => {
        // Nested elements fire their own enter/leave pairs; a depth count keeps the overlay steady.
        let depth = 0;
        const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
        const onDragEnter = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            depth += 1;
            setDragging(true);
        };
        const onDragOver = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        };
        const onDragLeave = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDragging(false);
        };
        const onDrop = (event: DragEvent) => {
            if (!carriesFiles(event)) return;
            // Left alone, the browser would navigate away to show the file and drop the session.
            event.preventDefault();
            depth = 0;
            setDragging(false);
            const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) => inferImportFileType(candidate.name));
            if (file) {
                openImport(file);
                return;
            }
            alert(
                l('Bilinmeyen dosya biçimi', 'Unknown file format'),
                l(
                    'Yalnızca .apkg, .colpkg, .csv, .tsv ve .txt dosyaları içe aktarılabilir.',
                    'Only .apkg, .colpkg, .csv, .tsv and .txt files can be imported.',
                ),
            );
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('drop', onDrop);
        };
    }, [l, openImport]);

    if (!dragging) return null;
    return (
        <View style={styles.overlay} pointerEvents="none" accessibilityLiveRegion="polite">
            <View style={styles.card}>
                <Text style={styles.title}>{l('İçe aktarmak için bırakın', 'Drop to import')}</Text>
                <Text style={styles.body}>.apkg · .colpkg · .csv · .tsv · .txt</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1000,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
        },
        card: {
            paddingVertical: Spacing.xl,
            paddingHorizontal: Spacing.xl * 2,
            borderRadius: BorderRadius.lg,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.accent,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        body: { marginTop: Spacing.sm, fontSize: FontSize.sm, color: colors.textMuted },
    });
}
