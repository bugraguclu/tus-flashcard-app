import { describe, expect, it } from 'vitest';
import { parseExternalAppUrl } from './externalLinking';
import { inferImportFileType } from './importFile';
import { isOpenedByAppLayout, redirectSystemPath } from './nativeIntent';

const FILES_HANDOFF = 'file:///Users/test/Library/Developer/CoreSimulator/Devices/ABC/data/Containers/Data/Application/DEF/Documents/Inbox/Kardiyoloji%20Tekrar.apkg';
const ADD_NOTE = 'tusankim://x-callback-url/addnote?type=Basic&deck=TUS%3A%3ADahiliye&fldFront=Kalp&fldBack=Heart';
const SEARCH = 'tusankim://x-callback-url/search?query=tag%3Amarked';

describe('native intent redirect', () => {
    it('keeps a Files hand-off out of the route stack', () => {
        // Launched by the file: start where a plain launch starts, so leaving /import shows the decks.
        expect(redirectSystemPath({ path: FILES_HANDOFF, initial: true })).toBe('/');
        // Already running: stay on the current screen; app/_layout.tsx pushes /import.
        expect(redirectSystemPath({ path: FILES_HANDOFF, initial: false })).toBeNull();
        expect(redirectSystemPath({ path: 'FILE:///private/var/mobile/Inbox/notes.CSV', initial: false })).toBeNull();
        // Files only offers declared types, but a file URL is never a screen address either way.
        expect(redirectSystemPath({ path: 'file:///private/var/mobile/Inbox/photo.heic', initial: false })).toBeNull();
    });

    it('leaves x-callback actions to app/_layout.tsx, including ones it ignores', () => {
        for (const path of [ADD_NOTE, SEARCH, 'TUSANKIM://X-Callback-URL/Search?query=a', 'tusankim://x-callback-url//search?query=a']) {
            expect(redirectSystemPath({ path, initial: false })).toBeNull();
            expect(redirectSystemPath({ path, initial: true })).toBe('/');
        }
        // Incomplete, or an action this build does not know: ignored rather than "Sayfa bulunamadı".
        expect(redirectSystemPath({ path: 'tusankim://x-callback-url/addnote?type=Basic', initial: false })).toBeNull();
        expect(redirectSystemPath({ path: 'tusankim://x-callback-url/unknown', initial: false })).toBeNull();
    });

    it('lets the router open the x-callback-url route and every ordinary address', () => {
        for (const path of [
            'tusankim://x-callback-url?action=addnote&type=Basic&deck=Default&fldFront=a',
            'tusankim://x-callback-url',
            'tusankim://x-callback-url/?action=search&query=a',
            'tusankim:///',
            'tusankim:///stats',
            'tusankim:///browser?initialSearch=deck%3Acurrent',
            'exp+tusankim://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
            '/decks',
        ]) {
            expect(redirectSystemPath({ path, initial: false })).toBe(path);
            expect(redirectSystemPath({ path, initial: true })).toBe(path);
        }
    });

    it('claims every URL app/_layout.tsx routes itself', () => {
        const incoming = [
            FILES_HANDOFF,
            ADD_NOTE,
            SEARCH,
            'file:///Inbox/collection.colpkg',
            'file:///Inbox/renamed-by-mail.zip',
            'content://com.android.providers.downloads/document/Deck.apkg',
            'tusankim:///stats',
            'tusankim://x-callback-url?action=search&query=a',
        ];
        for (const url of incoming) {
            const handledByLayout = parseExternalAppUrl(url) !== null || inferImportFileType(url) !== undefined;
            if (handledByLayout) expect(isOpenedByAppLayout(url), url).toBe(true);
        }
    });
});
