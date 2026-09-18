# Chrome Web Store listing copy

Paste these into the matching fields in the developer dashboard. Character
limits are noted where Google enforces one.

---

## Name (75 char limit)

```
SafeClip: Encrypted Clipboard History
```

## Summary (132 char limit, this is the line shown in search results)

```
Encrypted clipboard history that never leaves your device. Passphrase protected, auto locking, no account and no server.
```

## Category

`Productivity` (secondary option if asked: `Workflow & Planning`)

## Language

English (United States), unless you want to add a German or Dutch listing later.
Extra languages are added as separate localized listings, not extra fields.

---

## Description (16,000 char limit)

```
SafeClip remembers what you copy while browsing, and keeps it encrypted on your own computer.

Copy something on a web page and it shows up in SafeClip. Star the things worth keeping and file them into folders. Everything is encrypted with AES-256 before it is written to disk, behind a passphrase only you know.

There is no account to create, no server to trust, and no sync. Your clipboard history has nowhere to go, because the extension has no way to send it anywhere.


WHAT IT DOES

• Keeps a rolling history of the last 30 things you copied
• Star anything worth keeping and it moves to Saved, kept permanently
• Organize saved items into folders that collapse and expand
• Search across everything
• Click any entry to copy it straight back to your clipboard
• Export an encrypted backup, restore it later or on another machine


HOW THE ENCRYPTION WORKS

Your passphrase is turned into an encryption key using PBKDF2 with 300,000 iterations and a random salt. The passphrase itself is never stored, anywhere. The key lives in memory only for as long as your session is unlocked, and Chrome wipes it when the browser fully closes.

Saved items are always encrypted under that key. There is no setting that changes this.

Each stored item is just a random ID and an opaque encrypted blob. The text, the timestamp, whether it is starred, and the folder name all live inside the encryption. Someone with access to your Chrome profile on disk, but not your passphrase, cannot see your folder names, cannot see when you copied things, and cannot see what you starred.


AUTO LOCK

Set it to lock itself after 1, 5, 15, 30 or 60 minutes of being unlocked and idle, or turn it off. It runs on a real alarm, so it locks on schedule even when the popup is closed. Using it pushes the deadline back out, and while the popup is open you get a countdown with an Extend button.

Wrong passphrase attempts are throttled. Five failures triggers a lockout that doubles with each further failure.

You can change your passphrase at any time. Everything saved is re-encrypted under the new one automatically.


A CONVENIENCE OPTION, CLEARLY LABELLED

If you want your recent scratchpad visible without typing your passphrase every time, there is a toggle for that. Recent items then use a key stored on your device instead. They are still encrypted at rest, but on-device encryption protects against someone reading exported data, not against someone sitting at your unlocked computer.

Saved items are never covered by that toggle. They always require your real passphrase. The toggle is off by default and the tradeoff is spelled out in the app itself, not buried.


WHAT IT DOES NOT DO

It cannot see anything you copy outside a web page. Chrome does not allow extensions to touch its own interface, so text copied from the address bar or bookmarks bar is invisible to every extension, including this one.

It is not a password manager. No autofill, no password generation, no breach checking. Folders make it reasonable to keep a handful of secrets here, but your main vault should be a real password manager.

It does not collect analytics, does not phone home, and contains no advertising or tracking code of any kind.


OPEN SOURCE

The full source is on GitHub. You do not have to take a privacy claim on faith when you can read the code and confirm there is no networking in it at all.

[GITHUB LINK GOES HERE]
```

---

# Privacy practices tab

## Single purpose description

```
SafeClip stores an encrypted, local-only history of text the user copies while browsing, and lets them search it and copy items back to the clipboard.
```

## Permission justifications

**storage**
```
Used to save the user's encrypted clipboard history and their settings on their own device. All values written are encrypted with AES-256-GCM before storage. No data is transmitted anywhere.
```

**alarms**
```
Used to trigger the auto-lock timer that clears the decryption key from memory after a user-configured period of inactivity. chrome.alarms is required rather than setTimeout because a Manifest V3 service worker can be suspended, which would silently cancel the lock.
```

**Host permission (http://*/* and https://*/*)**
```
The content script listens for the browser's native copy event so the extension can record what the user copies. The extension has no way to know in advance which sites the user will copy text on, so the listener must be available on any page.

The content script reads only the text the user has selected and copied. It does not read page content, does not inspect the DOM beyond the current selection, does not track URLs, and makes no network requests. Its full source is roughly 30 lines and is public on GitHub.
```

**Remote code**
```
No, I am not using remote code.
```

## Data usage disclosures

Check nothing in the data collection list. Then tick all three certification boxes:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL

Paste the raw GitHub URL of your PRIVACY.md, for example:
```
https://github.com/YOUR-USERNAME/safeclip/blob/main/PRIVACY.md
```
