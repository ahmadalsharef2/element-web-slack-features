# Paper documents in Matrix rooms: plan

## The idea

Paper post is scanned with the phone and kept in Matrix rooms on a homeserver Ahmad runs himself, one room per case.
Each letter is found again by the words in it, from any device. The working name is "personal bytEM".

It is built in steps, and each step has to prove itself before the next one starts:

1. **Scan and find** (this plan). Only LiberMsg and a plain Synapse. No bot, no bytEM, no classes, no value
   extraction. It proves on Ahmad's own post that letters can live in rooms and be found again.
2. **Show it to the CEO**, with the store of real letters as the proof.
3. **Later, each on its own**: search in encrypted rooms on the phone, PDFs, the Liberbyte-AI-Framework parser for
   tables and values, and bytEM for sharing a case with a tax adviser or an authority. They are listed under "Not in
   this step" below.

Official post over Matrix (letters from an authority arriving in a room, with legal effect) is not part of any step.
It needs a law that recognises the channel, a verified identity and a legal proof of delivery, none of which Matrix
defines today. The data kept for each letter should still leave room for a letter that arrives through a channel
instead of a scanner.

## Step 1: scan a letter into a room and find it by its words

**What the user does**: opens a room (one room per case, for example "Finanzamt – ESt 2025"), taps attach, takes a
photo of the letter or picks a picture, and sends it. The app reads the text from the picture on the device and sends
it with the picture. The normal message search then finds the letter by any word in it.

**Current state**:

- The upload dialog has a caption. `ContentMessages.sendContentToRoom` (:606-621) puts the caption in `body` and the
  file name in `filename` (MSC2530). Only the first file of an upload gets the caption (`sendContentListToRoom` :543).
- The upload dialog can already crop and draw on a picture (`fork/image-edit/`).
- Search reads `body`. In an unencrypted room the server searches, so it works on every device. In an encrypted room
  search needs an index on the device, and only Desktop has one (`BasePlatform.getEventIndexingManager` :285 returns
  `null`; `ElectronPlatform` returns `SeshatIndexManager`).
- A caption is drawn under the picture as a text body (`TextualBodyFactory.tsx` :58, class `mx_EventTile_caption`).
- There is no text recognition library in the repo. The content security policy already allows WebAssembly and
  workers from the app's own origin (`apps/web/src/vector/index.html` :25, :31).
- The Android app is the built web app inside Capacitor (`apps/mobile/`). Its manifest asks only for `INTERNET`.

**Files**:

- `apps/web/src/ContentMessages.ts` (`sendContentListToRoom` :450-560, `sendContentToRoom` :606-621)
- `apps/web/src/components/views/dialogs/UploadConfirmDialog.tsx` (caption field :208-215, `onFinished` :41, :149-159)
- `apps/web/src/components/views/messages/TextualBodyFactory.tsx` (caption body :58)
- `apps/web/src/settings/Settings.tsx` (labs flag), `docs/labs.md`
- `apps/web/webpack.config.ts` (`CopyWebpackPlugin` :696, for the recognition files)
- `apps/web/src/vector/index.html` (content security policy, read only)
- `apps/web/src/Searching.ts` (`serverSideSearch` :28, `eventIndexSearch` :619, read only)
- `apps/mobile/android/app/src/main/AndroidManifest.xml`, `apps/mobile/capacitor.config.json`
- New: `apps/web/src/fork/documents/readImageText.ts` and its test

**Steps**:

1. Labs flag `feature_document_text` (`LabGroup.Messaging`, off by default).
2. `apps/web/src/fork/documents/readImageText.ts`: `readImageText(file: File, languages: string[]): Promise<string>`. It
   loads tesseract.js with a dynamic `import()`, so the library stays out of the main bundle. It scales the picture
   down to about 2500 px on the long side before reading, to keep a phone fast. The worker script, the WebAssembly
   core and the language files (`deu`, `eng`) are copied into the build with `CopyWebpackPlugin` and loaded from the
   app's own origin (`workerPath`, `corePath`, `langPath`), never from a CDN.
3. Upload dialog: with the flag on and at least one picture in the upload, a checkbox "Read the text, so search can
   find it"; the last choice is kept per device. On Upload the dialog reads each picture and shows progress. If
   reading fails, the picture is still sent, without text. `onFinished` hands back one text per file.
4. `sendContentListToRoom`: one text per file in place of the single caption. For each file
   `body = [caption typed by the user (first file only), text read from the picture].filter(Boolean).join("\n\n")`,
   cut at 30 000 characters, since an event may not be larger than 65 KB.
5. Timeline: a caption longer than about six lines is shown folded, with "Show text". Otherwise every letter puts a
   page of text under its picture.
6. Tests: vitest for `readImageText` (tesseract.js mocked), for the dialog (checkbox, progress, failure) and for
   one text per file in `ContentMessages`. A Playwright happy path: upload a picture of text, search a word from it,
   find the message.
7. `pnpm i18n`, a row in `FORK_CHANGES.md`, the flag in `docs/labs.md`.

**The server for the proof** (not part of this repo): Synapse in Docker on the laptop, with the document rooms
created unencrypted. The phone reaches it over Tailscale; `tailscale serve` gives it HTTPS, which Android needs.
The Synapse database and media folder hold every document, so they need a backup and an encrypted disk.

**The proof is done when**: 20 real letters are scanned from the phone, each one is found by a word that appears
only in it, from the phone and from the laptop, and reading one page on the phone takes a few seconds.

**Difficulty**: small to medium. **Server dependency**: none for sending. Search on every device needs an
unencrypted room, on any Synapse.

**Gotchas**:

- tesseract.js fetches its worker, core and language files from a CDN unless all three paths are set. A letter's
  picture never leaves the device either way, but the content security policy blocks the CDN, and Desktop serves the
  app from `vector://vector`, so the paths must be relative to the app.
- The language files are several MB each. Load them on first use, not at start.
- tesseract reads plain letters well and tables badly. That is enough to find a letter. Values from tables wait for
  the parser (see below).
- A photo taken at an angle or in bad light reads badly. The crop tool in the dialog helps; there is no automatic
  straightening in this step.
- Taking the photo: the attach button's file input opens Android's chooser. Whether the chooser offers the camera
  inside the Capacitor shell, with no `CAMERA` permission in the manifest, has to be tried on a phone.
- Synapse's search may not match German word forms ("Bescheid" against "Bescheide"). Try it with real letters before
  relying on it.
- Encrypted rooms: the text is still sent and still shown, but search finds it only on Desktop.
- The text is in `body`, so notifications and the room list preview show the start of the letter.
- `UploadConfirmDialog.tsx` and `ContentMessages.ts` are upstream files that already carry `Element Fork:` changes.
  Keep the new code in `readImageText.ts` and touch those two in as few lines as possible.

**Not in this step**:

- **Search in encrypted rooms on phone and web**: a second index manager that runs in the browser (IndexedDB),
  implementing `apps/web/src/indexing/BaseEventIndexManager.ts` and returned from the web platform. It would serve
  every room, not only documents.
- **PDFs**: a PDF with a text layer can be read with `pdfjs-dist`, already a dependency. A scanned PDF has to be
  drawn page by page and read like a picture.
- **A letter of several pages as one document**: now each page is one message with its own text.
- **The Liberbyte-AI-Framework parser** (`extraction/universal_document_parser.py`): better on tables, but it is
  Python and runs on the laptop, not in the app.
- **bytEM**: once the proof holds, a case room can carry bytEM's shapes, the scan as `supply-type-dataset` and the
  read values as `supply-type-extract`, with `market_status: draft` and no DEID. bytEM today sets `draft` when a
  room's DEID does not resolve, and its seed tool refuses assets for a `draft` room
  (`api-gateway/routes/mcpRoutes.js` :328); that gate has to open for a room that has no DEID.
- **Classes and extraction** (Steuerbescheid, Arztbrief, amounts, dates, reference numbers).
