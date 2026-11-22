# UX plan

How LiberMsg's user experience is measured, what changed, and what is still open. Numbers come from the harness
in `apps/web/playwright/e2e/ux/`, run against production builds of the app before and after the change (12 November
2026).

## Users and their tasks

LiberMsg is a team chat app on Matrix: people who chat with colleagues all day, on a desktop app, in a browser or
on a phone. Their tasks, most frequent first:

| #   | Task                                    | How often       |
| --- | --------------------------------------- | --------------- |
| 1   | Read new messages                       | Many times/hour |
| 2   | Send a message                          | Many times/hour |
| 3   | Switch to another room                  | Many times/hour |
| 4   | React to a message, reply in a thread   | Hourly          |
| 5   | Share a file with a caption             | Daily           |
| 6   | Message a person directly, note to self | Daily           |
| 7   | Find an old message                     | Daily           |
| 8   | Quiet notifications (snooze, mute room) | Daily           |
| 9   | Send a message later                    | Weekly          |
| 10  | Create a room and invite someone        | Weekly          |
| 11  | Sign in                                 | Per device      |
| 12  | Sign out                                | Per device      |
| 13  | Change the theme, hide my online status | Once            |

## How it is measured

- **Journeys** (`journeys.spec.ts`) perform each task by the shortest route the app offers, with real clicks and key
  presses, and count steps, clicks and keys. Time is a Keystroke-Level Model estimate for a practised user (a
  thinking pause per step, pointing, clicks, keys), so it does not depend on the test machine. Each journey also
  records how long the app took to answer each step and notes every place the user has to guess or hits a detour.
- **Start-up** (`startup.spec.ts`): time until the room list shows for a signed-in user, and how much the browser
  downloads.
- **Screens** (`screens.spec.ts`): the main screens at phone (390 px), tablet (820 px) and desktop (1280 px) widths, in
  Light and Dark, for review by eye.
- **Phone walkthrough** (`phone.spec.ts`): a touch phone (412 px, Android browser) goes through the app: room list,
  room, long press, composer, room info, sending a picture with text drawn on it, an invite, a space, the user menu,
  settings and the bytEM tab. It saves a screenshot per step in `phone/` and lists any step that failed in
  `phone/phone-steps.txt`.

Run them against a production build, not the dev server:

```sh
cd apps/web
pnpm exec webpack-cli --mode production --output-path /tmp/webapp
cp ../desktop/element.io/release/config.json /tmp/webapp/
pnpm exec serve -p 8082 -L /tmp/webapp &
BASE_URL=http://localhost:8082 UX_OUT=/tmp/ux pnpm exec playwright test playwright/e2e/ux --project=Chrome
```

Results land in `/tmp/ux/journeys/*.json`, `/tmp/ux/startup.json` and `/tmp/ux/screens/`. They need Docker for the
test homeserver, like the other e2e tests.

## Results

| Task                        | Steps before → after | Est. time before → after | What changed                                                                                  |
| --------------------------- | -------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Sign out                    | 4 → 3                | 10.6 s → 8.0 s           | "Sign out" in the user menu; no more "Remove this device" wording                             |
| Find an old message         | 4 → 3                | 10.6 s → 8.0 s           | Search button in the room header; Ctrl+F searches                                             |
| Sign in (first start)       | 5 → 5                | 25 s → 25 s              | 3 prompts → 2: the "Introducing Sections" tour is gone                                        |
| Use the app on a phone      | impossible → works   |                          | Phones were sent to a page about Element's own apps; now they get the app, one pane at a time |
| Room info on a tablet       | timeline 60 px wide  | → covers the room        | Room info, threads and members cover the timeline below 1024 px                               |
| Read new messages           | 1                    | 2.7 s                    | unchanged                                                                                     |
| Send a message              | 2                    | 5.5 s                    | unchanged                                                                                     |
| Switch room (Ctrl+K)        | 3                    | 5.7 s                    | unchanged                                                                                     |
| React to a message          | 3                    | 7.8 s                    | unchanged                                                                                     |
| Reply in a thread           | 4                    | 12.1 s                   | unchanged                                                                                     |
| Share a file with a caption | 5                    | 14.7 s                   | unchanged                                                                                     |
| Message a person directly   | 8 → 7 (5 by Ctrl+K)  | 21.3 s → 18.7 s (12.2 s) | No confirmation dialog for people on your own server; Ctrl+K, name, Enter is the short way    |
| Write a note to myself      | no such thing → 4    | 15.4 s                   | "My notes" in the user menu opens a private room, made on first use                           |
| Snooze notifications        | 2                    | 5.3 s                    | unchanged                                                                                     |
| Mute a room                 | 3                    | 7.8 s                    | unchanged                                                                                     |
| Send a message later        | 3                    | 11.5 s                   | unchanged                                                                                     |
| Create a room and invite    | 9 → 8                | 25.2 s → 22.5 s          | No confirmation dialog for people on your own server                                          |
| Switch to the dark theme    | 3                    | 8.0 s                    | unchanged                                                                                     |
| Hide my online status       | 5                    | 13.3 s                   | unchanged                                                                                     |

Every step answered in under 1 s; the slowest were search results and the direct-message dialog (about 0.8 s).

Size and start-up:

| Measure                             | Before  | After   |
| ----------------------------------- | ------- | ------- |
| Linux `.deb`                        | 347 MB  | 225 MB  |
| Installed size                      | 746 MB  | 446 MB  |
| `webapp.asar` inside it             | 416 MB  | 101 MB  |
| Time to room list (signed in, warm) | 0.50 s  | 0.48 s  |
| Script loaded at start-up           | 15.9 MB | 15.9 MB |

The package shrank because `scripts/build-deb.sh` now builds into an empty folder: webpack never deletes old bundles,
and the dev server writes its own into the same folder, so every earlier build was being packed into the `.deb`.

## Also changed

- No "added by Ahmad" markers in the UI.
- The fork's logo everywhere the app shows one (sign-in, browser tab, phone home screen, error page, link previews),
  "Welcome to LiberMsg" instead of Element's slogan, and a light blue sign-in background instead of the lake
  photo.
- Light and Dark themes use the logo blue (#0074D0) as their accent. Green still means success (verified, sent).
- Main buttons and text links are blue instead of black; the message box has an outline that turns blue while typing.
- Settings lists 7 everyday tabs instead of 12 (plus Encryption until recovery is set up); the rest are one click away under "Show advanced".

## Open items

Ranked by how often a user meets them times how much they cost.

1. **Confirmation when starting a chat with, or inviting, someone from another server.** People on your own server
   no longer get it. For strangers from elsewhere it stays: it is upstream's guard against mistaken or spam invites.
2. **Two prompts on first start**: "Back up your chats" and "Notifications". Both protect the user (losing encrypted
   history, missing messages), so they stay. The sign-in page still shows the homeserver and an "Edit" link: once the
   team's server is decided, set it in `config.json` with `"disable_custom_urls": true` and that block disappears.
3. **Start-up downloads 15.9 MB of script.** 7.6 MB is the encryption engine and is needed. About 4.6 MB (two chunks
   holding parts of the diagram renderer, maths renderer and calls) loads before it is used; splitting those out is
   the next step to a faster start.
4. **Element Call is bundled (44 MB of the 97 MB web app).** Loading it from a hosted Element Call instead would
   shrink the desktop apps by that much, at the cost of depending on that server for calls. A decision for Ahmad.
5. **Phones: browser and home-screen app now; store apps not yet.** iOS and Android store apps would wrap this same
   layout (for example with Capacitor) and need Apple and Google developer accounts. Every page now has a way back,
   long press opens the message menu, and settings and dialogs fit a 390 px screen (19 November 2026). Not yet tried
   on real phones: the long press on iOS, the on-screen keyboard covering the composer, safe areas on notched phones,
   the Android back button. The Android emulator is installed (`~/Android/Sdk`, device `pixel`, Java in
   `~/.local/jdk/jdk-21`), but this computer has SVM turned off in the BIOS. Without it the emulator only runs in
   a slow software mode, where Android's WebView crashes while loading the app, so nothing has been seen in it yet.
6. **Not yet checked:** accessibility tools (axe, keyboard only, screen reader), right-to-left languages, and the same
   tasks in Slack for comparison (Slack is not installed on the build machine).

## Test with real people

Three to five people, 15 minutes each, on their own computer or phone. Watch; do not help. Note where they hesitate,
what they click first, and any task they cannot finish.

1. (1 min) Open the app link and sign in with the account you are given.
2. (2 min) Find the room "general" and read the newest message. Reply to it.
3. (2 min) React with a thumbs up to someone else's message, then reply to it in a thread.
4. (2 min) Send a photo with a caption.
5. (2 min) Find the message that mentions "standup".
6. (2 min) Send a direct message to Sam.
7. (1 min) Write a message and arrange for it to be sent tomorrow morning.
8. (1 min) Stop notifications for the next hour.
9. (1 min) Switch to the dark look.
10. (1 min) Sign out.

Afterwards ask: what was hardest, what surprised you, and what would you change first? Record per task: finished
yes/no, time, wrong turns. Compare with the step counts above; a task people fail or that takes more than twice the
estimate goes to the top of the open items.
