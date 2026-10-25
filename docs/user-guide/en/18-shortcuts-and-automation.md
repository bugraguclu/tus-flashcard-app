---
id: automation
title: Shortcuts and automation
summary: Deck shortcuts, adding notes and searching with tusankim:// links, the web version, and keyboard shortcuts.
order: 18
web_path: /en/help/shortcuts
app_help: help?article=automation
app_screens:
  - "Decks › deck menu › Create shortcut — app/(tabs)/decks.tsx"
  - "tusankim:// links — app/_layout.tsx, lib/externalLinking.ts, lib/externalActionRoute.ts"
  - "Web automation address — app/x-callback-url.tsx"
  - "Web version — components/WebAppIntegrations.tsx, public/manifest.webmanifest"
verified_against: master c6108e6 (2026-10-25)
---

# Shortcuts and automation

Ways to open TusAnkiM faster and use it from other apps: shortcuts that open a deck in one tap,
`tusankim://` links that add a note or run a search, the web version that runs in a browser, and
keyboard shortcuts.

<a id="deck-shortcuts"></a>
## Deck shortcuts

You can add a deck you study often to Apple's **Shortcuts** app:

1. On the **Decks** screen, open the deck's **•••** menu and tap **Create shortcut**.
2. Add the shortcut on the sheet your iPhone shows.
3. Run it from the **Shortcuts** app, from an icon you add to the Home Screen, or by saying the
   deck's name to Siri. TusAnkiM opens straight into studying that deck.

Details: [Decks](04-decks.md#deck-shortcut).

> **In the web version:** **Create shortcut** copies a link that opens the deck directly. You can
> save it as a browser bookmark.

<a id="url-automation"></a>
## tusankim:// links

On iPhone, a link starting with `tusankim://` opens TusAnkiM. Two actions are supported:

| Action | Link | What happens |
| --- | --- | --- |
| Add a note | `tusankim://x-callback-url/addnote?…` | The add-note screen opens with the fields filled in. |
| Search | `tusankim://x-callback-url/search?query=…` | The **Card Browser** opens with that search. |

Use these links with the Shortcuts **Open URLs** action, from a link in a notes app, or from any
app that can open a link. Write the values URL-encoded: a space becomes `%20` and the subdeck
separator `::` becomes `%3A%3A`. The Shortcuts **URL Encode** action does this for you.

> **Different from Anki:** This is similar to AnkiMobile's link automation, but the address starts
> with `tusankim://` and only adding notes and searching are available.

<a id="add-note-url"></a>
### Add-note link

```text
tusankim://x-callback-url/addnote?type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX%20inhibitor&tags=pharma%20tus
```

| Value | Required? | Meaning |
| --- | --- | --- |
| `type` | Yes | The note type's name; upper and lower case do not matter. For the built-in types use their English names: `Basic`, `Basic (and reversed card)`, `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze`. |
| `deck` | Yes | The deck's name; case does not matter. For a subdeck use `::`: `TUS%3A%3AFarmakoloji`. It cannot be a filtered deck. |
| `fld` + field name | At least one field | The field's content. Put the field name right after `fld`, written exactly as it is named: `fldFront`, `fldBack`, `fldText`, `fldBack%20Extra`. The built-in types' fields are Front, Back, Text and Back Extra (shown as **Ön**, **Arka**, **Metin**, **Arka Ek** in the Turkish interface). |
| `tags` | No | Tags separated by spaces. |
| `x-success` | No | A link to open after the note is saved. See [Return link](#x-callback). |

When you open the link:

1. The **Add note** screen opens with the note type, deck, fields and tags filled in.
   **Nothing is saved on its own.**
2. Check the note and tap **✓** (**Save note**) at the top right.
3. The **Done** window says how many cards were created. If the link has `x-success`, tapping
   **OK** opens that link.

A cloze note example:

```text
tusankim://x-callback-url/addnote?type=Cloze&deck=Farmakoloji&fldText=%7B%7Bc1%3A%3AAspirin%7D%7D%20inhibits%20COX&fldBack%20Extra=NSAID
```

If the link is incomplete (no `type`, no `deck` or no field) or the deck or note type cannot be
found, TusAnkiM ignores the link and stays on the screen it was on. If nothing happens, check the
deck and note type names. Notes cannot be added to the decks of the TUS card pack; if you give
such a deck, the screen opens with another deck, so change the deck before saving.

<a id="search-url"></a>
### Search link

```text
tusankim://x-callback-url/search?query=deck%3AFarmakoloji%20is%3Adue
```

The **Card Browser** opens with the search in `query`; this example means "cards due in the
Farmakoloji deck". For search syntax see [Card Browser and search](10-browser-and-search.md).

<a id="x-callback"></a>
### Return link and safety

`x-success` takes you somewhere else after the note is saved, for example to the next step of a
shortcut. For your safety only two kinds of link are accepted:

- a web address starting with `https://` (without a user name or password in it),
- a Shortcuts link starting with `shortcuts://x-callback-url/…`.

Example: `x-success=shortcuts%3A%2F%2Fx-callback-url%2Frun-shortcut%3Fname%3DNext`

Any other link (`http://`, `file:`, `data:`, another `tusankim://` and so on) is silently ignored;
the note is still saved, but there is no return. If you leave without saving the note, the return
link is not opened. Values not listed in the table (such as `x-error`, `x-cancel` or `dupes`) are
not used.

<a id="web-version"></a>
## Web version

TusAnkiM has a preview that runs in a browser: `tusankim.vercel.app`. It is the same app; your
collection is kept in your browser's own storage and is never uploaded. The main app is the iPhone
app. What is different on the web:

- Deck shortcuts are not added to Apple Shortcuts; they are copied as a link.
- Add-note and search links work at this address:
  `tusankim.vercel.app/x-callback-url?action=addnote&type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX`
  (`action=search&query=…` for a search). An incomplete request opens the deck list.
- In a wide window, a sidebar appears next to the study screen.
- If the app is open in two tabs at once, only the first tab saves. The other tab shows
  **⚠️ The app is open in another tab — changes in this tab will not be saved.**
- Clearing the browser's site data also deletes the collection. Keep important work safe by
  [exporting it](14-import-export.md).

<a id="install-web-app"></a>
### Installing on the Home Screen or desktop

You can install the web version like an app: on iPhone, add it to the Home Screen from Safari's
share menu; on a computer, use the install option in the browser's address bar or menu. The
installed app opens in its own window. Its icon's shortcut menu offers **Desteler**, **Kart ekle**
and **İstatistikler** (these names are in Turkish). On a computer, opening an `.apkg`, `.colpkg`,
`.csv`, `.tsv` or `.txt` file with the installed app opens the **Import deck** screen with that
file.

<a id="offline"></a>
### Starting offline

After you have opened the site once, the app starts without an internet connection too. When you
open it while online, a new version arrives by itself.

<a id="web-reminders"></a>
### Reminders

In the web version, the study reminder arrives only while the app is open in a tab (the tab can be
in the background). You grant permission by turning on **Settings › Notifications**. See
[Settings](16-settings.md#notifications).

<a id="drag-and-drop"></a>
### Importing by drag and drop

Drag a deck file onto the browser window. When **Drop to import** appears, let go; the
**Import deck** screen opens with that file. `.apkg`, `.colpkg`, `.zip`, `.csv`, `.tsv` and `.txt`
files are accepted; any other file shows **Unknown file format**. See
[Import and export](14-import-export.md).

<a id="keyboard"></a>
## Keyboard shortcuts

With a physical keyboard, Space shows the answer and 1–4 choose the answer buttons; R replays
audio, - buries the card, @ suspends it, * marks the note. Esc leaves study, and Z or U undoes the
last action. In the web version Ctrl/Cmd+Z undoes and Ctrl/Cmd+1–7 sets a flag.

- Full list: [Studying](05-studying.md#keyboard-shortcuts).
- Changing the keys: [Settings › Controls › Keyboard](16-settings.md#keyboard).

## Related topics

- [Decks](04-decks.md)
- [Adding and editing cards](08-adding-and-editing.md)
- [Card Browser and search](10-browser-and-search.md)
- [Settings](16-settings.md)
