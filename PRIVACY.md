# SafeClip Privacy Policy

Last updated: 2026

## The short version

SafeClip does not collect, transmit, store remotely, or share any user data.
There is no server. There is no account. There is no analytics, telemetry,
crash reporting, or advertising code. Nothing you copy ever leaves your
computer.

## What SafeClip stores

SafeClip stores the text you copy on web pages, along with its timestamp,
whether you starred it, and which folder you filed it in. All of this is
encrypted with AES-256-GCM before being written to disk, using a key derived
from a passphrase you choose.

This data is written to Chrome's local extension storage on your own device.
It is not synced to a Google account, not uploaded anywhere, and not readable
by the developer or anyone else.

## What SafeClip does not do

- It does not send network requests. The extension contains no code capable of
  making one, which you can verify yourself in the public source.
- It does not read page content. The content script listens for the copy event
  and reads only the text you selected and copied.
- It does not track browsing history, visited URLs, or page contents.
- It does not use cookies, fingerprinting, or identifiers of any kind.
- It does not share data with third parties, because it has no data to share
  and no way to send it.

## Deleting your data

Deleting individual clips, clearing everything, or removing the extension from
Chrome removes the stored data from your device. Since nothing was ever
transmitted, there is no copy anywhere else to request deletion of.

## Backup files

If you use the export feature, SafeClip writes an encrypted backup file to
wherever you choose to save it. Handling of that file is up to you. In
passphrase mode it is useless to anyone without your passphrase.

## Permissions

- `storage` is used to save your encrypted clips and settings locally.
- `alarms` is used to trigger the auto lock timer.
- Host access to http/https pages is used solely to listen for the copy event.

## Changes

Any change to this policy will be published in this file in the public
repository, with the change visible in the commit history.

## Contact

Open an issue on the GitHub repository.
