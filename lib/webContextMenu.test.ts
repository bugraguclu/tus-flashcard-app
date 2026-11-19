import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { webContextMenuProps } from './webContextMenu';

describe('webContextMenuProps', () => {
    it('opens the row menu on a right click and keeps the browser menu away', () => {
        const onOpen = vi.fn();
        const preventDefault = vi.fn();
        const props = webContextMenuProps(onOpen, 'web') as { onContextMenu: (event: object) => void };
        props.onContextMenu({ preventDefault });
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('adds nothing on iPhone or without an action', () => {
        expect(webContextMenuProps(() => undefined)).toEqual({});
        expect(webContextMenuProps(null, 'web')).toEqual({});
    });
});
