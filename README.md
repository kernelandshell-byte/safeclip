# SafeClip

Encrypted clipboard history for Chrome. Everything stays on your device.

Copy something on a web page and SafeClip remembers it. Star the things worth
keeping and file them into folders. All of it is encrypted with AES-256 before
it touches disk, behind a passphrase only you know. There is no account, no
server, and no sync, because there is nowhere for your data to go.

## Why this exists

Most clipboard managers store your history in plain text. Some sync it to a
server you have no visibility into. Neither is great when the things you copy
include tokens, addresses, order numbers, and the occasional password.

SafeClip does one thing: keep that history readable by you and nobody else.

## Install

**From the Chrome Web Store:** [link goes here once published]

**From source:**

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and pick the project folder.
4. Pin it from the puzzle piece icon in the toolbar.

On first run you set a passphrase. That is required, not optional.

## How it works

Three files do the work:

| File | Job |
|---|---|
| `content.js` | Listens for the browser's native `copy` event on http/https pages. It does not poll or watch the clipboard, it only reacts when you actually press Ctrl/Cmd+C. |
| `background.js` | The only place that touches keys or storage. Handles all encryption and decryption. |
| `popup.js` | The interface. Asks the background script for decrypted data, never handles keys itself. |

### Two keys, two different promises

**The passphrase key** is derived from what you type using PBKDF2 with 300,000
iterations and a random salt. It is never stored anywhere. Saved items are
always encrypted under this key, regardless of any other setting. Starring
something, opening Saved, or changing a security setting all require it.

**The Recent key** is a random key stored locally, no passphrase involved. It
only ever encrypts unstarred Recent items, and only if you turn on "let me view
Recent without entering my passphrase." It is never used for Saved. Recent is
still genuinely encrypted at rest this way, just with a key that lives on the
device instead of in your head. That protects against someone reading exported
data, not against someone sitting at your unlocked computer.

The practical result: turn the toggle on and your recent scratchpad stays
visible across restarts without a prompt, while starring something or opening
Saved still asks for the passphrase right there.

### What an attacker with disk access sees

Every stored item is `{ id, iv, data }`. The `id` is a random UUID carrying no
information. The clip text, its timestamp, its starred flag, and its folder name
all live inside the encrypted blob. Without the passphrase, someone with your
Chrome profile on disk learns that N encrypted blobs exist and nothing else. Not
your folder names, not when you copied things, not what is starred.

Each blob is also bound to its own `id` through AES-GCM's additional
authenticated data. Swapping two entries' ciphertext between storage slots fails
the authentication check instead of quietly succeeding under the wrong label.

### Locking

Wrong passphrases are throttled in the background script, not just in the UI.
Five failures triggers a 30 second lockout, doubling on each further failure up
to five minutes. The same counter covers both regular unlocking and the change
passphrase flow, since both are ways of guessing a passphrase.

Auto lock runs on `chrome.alarms`, so it fires on schedule even when the popup
is closed and the service worker has gone to sleep. Pick 1, 5, 15, 30, 60
minutes or never. Activity pushes the deadline out. While the popup is open you
get a live countdown and an Extend button.

### Changing your passphrase

Settings has a change passphrase flow: current passphrase, new one, confirm. On
success every Saved item is decrypted under the old key and re-encrypted under a
fresh key and salt. Recent items under the Recent key are untouched, since they
were never tied to the passphrase.

## Backup and restore

Export writes a single JSON file holding your encrypted vault. Import replaces
your current vault with the file's contents. It is a restore, not a merge.

Importing over an existing vault always asks for your current passphrase first,
verified before anything is overwritten. Without that check, someone could hand
you a crafted backup containing a key only they know, and your future copies
would silently be readable by them.

## What this is not

Not a password manager. No per site autofill, no password generation, no breach
checking, no cross device sync. Folders make it reasonable to keep a handful of
secrets here, but your primary vault should be a real password manager.

## Known limits

**It only sees copies made on http/https pages.** Chrome does not let extensions
touch its own interface, so anything copied from the address bar or bookmarks
bar is invisible to every extension, not just this one. There is no permission
that changes this and that is a good thing.

**The encryption key is marked extractable in WebCrypto.** This is forced by the
design, not an oversight. `crypto.subtle.wrapKey()` carries the same
extractability requirement as `exportKey()`, so wrapping is not a workaround. A
key cannot survive a Manifest V3 service worker restart without some persistable
representation, and any persistable representation is extractable by definition.
The real defense against a compromised library reading your key is having zero
dependencies, which this project does.

**PBKDF2 rather than Argon2id.** Argon2id would raise the bar against offline
brute force, but it means pulling in a WASM dependency. Given the point above,
that trade did not seem worth it. 300,000 iterations is solid for a local,
non networked tool.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saving your encrypted clips and settings locally. |
| `alarms` | Firing the auto lock on schedule when the popup is closed. |
| `http://*/*`, `https://*/*` | The content script needs to hear the copy event on whatever page you are on. It reads only the text you selected and copied. |

No `tabs`, no `webRequest`, no host permissions beyond what the copy listener
needs, and no network access of any kind.

## Verifying the privacy claim yourself

Do not take my word for it:

```bash
grep -rn "fetch(\|XMLHttpRequest\|new WebSocket\|sendBeacon" *.js
```

That returns nothing. There is no code in this extension that can send data
anywhere. You can also open `chrome://extensions`, click "service worker" under
SafeClip, and watch the Network tab stay empty while you use it.

## Contributing

Issues and pull requests are welcome. If you are reporting something security
related, please open an issue rather than emailing, since there is nothing
confidential to protect here and a public discussion is more useful to everyone.

Things I would genuinely like help with:

- Merge on import rather than replace.
- A session expiring warning while the popup is closed, via `chrome.notifications`.
- Real world testing on unusual sites where the copy event behaves oddly.

## License

MIT. See [LICENSE](LICENSE).
