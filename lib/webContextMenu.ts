import { Platform } from 'react-native';

type ContextMenuEvent = { preventDefault?: () => void };

/**
 * A right click on the web build does what a long press does on iPhone: it opens the row's menu
 * (or starts selecting) instead of the browser's own menu. Spread onto a View or Touchable;
 * React Native Web passes `onContextMenu` to the DOM element. Native gets nothing.
 */
export function webContextMenuProps(
    onOpen: (() => void) | null | undefined,
    platform: string = Platform.OS,
): Record<string, unknown> {
    if (platform !== 'web' || !onOpen) return {};
    return {
        onContextMenu: (event: ContextMenuEvent) => {
            event.preventDefault?.();
            onOpen();
        },
    };
}
