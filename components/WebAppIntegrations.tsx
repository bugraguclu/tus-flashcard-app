import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { usePathname, useRouter } from 'expo-router';
import { Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { Radius, Type } from './ui/tokens';
import { useI18n } from '../hooks/useI18n';
import { useWebKeyboardNavigation } from '../hooks/useWebKeyboardNavigation';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import { onKeyboardShortcutsRequested } from '../lib/keyboardShortcutsHelp';
import { isShowingRoute, type AppShortcut } from '../lib/webKeyboardNavigation';
import { returnToDeckList } from '../lib/backNavigation';
import { alert } from '../lib/confirm';
import { inferImportFileType } from '../lib/importFile';
import { onStudyReminderOpened } from '../lib/studyNotifications';
import { registerWebServiceWorker } from '../lib/webServiceWorker';
import { installWebHover } from '../lib/webHover';

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
 * - Keyboard use: focus rings, focus inside dialogs and menus, arrow keys, app-wide shortcuts and
 *   their list (`?`). See `hooks/useWebKeyboardNavigation.ts`.
 * - Hover feedback under a mouse pointer, which a touch screen never needs.
 *
 * Mounted once, by the root stack, on web only.
 */
export default function WebAppIntegrations() {
    const router = useRouter();
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [dragging, setDragging] = useState(false);
    const [shortcutsVisible, setShortcutsVisible] = useState(false);
    const pathname = usePathname();

    const runShortcut = useCallback((shortcut: AppShortcut) => {
        if (shortcut.kind === 'help') {
            setShortcutsVisible(true);
            return;
        }
        if (shortcut.kind === 'search') {
            const field = Array.from(document.querySelectorAll<HTMLElement>('[role="searchbox"]'))
                .find((element) => element.getClientRects().length > 0);
            field?.focus();
            return;
        }
        if (isShowingRoute(pathname, shortcut.route)) return;
        if (shortcut.route === '/decks') returnToDeckList(router);
        else router.push(shortcut.route as never);
    }, [pathname, router]);

    // The text colour on a band of the card colour: it stands out on white cards, the accent headers and
    // filled buttons alike, light or dark.
    useWebKeyboardNavigation({ ringColor: colors.textPrimary, haloColor: colors.bgCard, onShortcut: runShortcut });
    useEffect(() => onKeyboardShortcutsRequested(() => setShortcutsVisible(true)), []);

    const openImport = useCallback((file: File) => {
        router.push({
            pathname: '/import',
            params: { incomingUri: URL.createObjectURL(file), incomingName: file.name },
        } as never);
    }, [router]);

    useEffect(() => {
        registerWebServiceWorker();
    }, []);

    useEffect(() => installWebHover(document, colors.hoverOverlay), [colors.hoverOverlay]);

    useEffect(() => onStudyReminderOpened(() => returnToDeckList(router)), [router]);

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
                    'Yalnızca .apkg (veya .zip), .colpkg, .csv, .tsv ve .txt dosyaları içe aktarılabilir.',
                    'Only .apkg (or .zip), .colpkg, .csv, .tsv and .txt files can be imported.',
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

    return (
        <>
            <KeyboardShortcutsDialog visible={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
            {dragging ? (
                <View style={[styles.overlay, { pointerEvents: 'none' }]} accessibilityLiveRegion="polite">
                    <View style={styles.card}>
                        <Text style={styles.title}>{l('İçe aktarmak için bırakın', 'Drop to import')}</Text>
                        <Text style={styles.body}>.apkg / .zip · .colpkg · .csv · .tsv · .txt</Text>
                    </View>
                </View>
            ) : null}
        </>
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
            backgroundColor: colors.scrim,
        },
        card: {
            paddingVertical: Spacing.xl,
            paddingHorizontal: Spacing.xl * 2,
            borderRadius: Radius.card,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.accent,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
        },
        title: { ...Type.sectionTitle, color: colors.textPrimary },
        body: { ...Type.caption, marginTop: Spacing.sm, color: colors.textMuted },
    });
}
