# Composer and keyboard shortcuts

What the message composer supports, and how keyboard shortcuts are wired up. Check this list before changing the
composer, so that none of it is lost.

## Composer features

### Autocomplete

- Tab tries to complete the word before the caret as a room member.
    - If no matching name is found, a visual bell is shown.
- `@` and a letter opens autocomplete for members starting with that letter.
    - A user pill inserted at the start of the composer gets a colon and a space after it.
    - A user pill inserted anywhere else gets only a space.
- `#` and a letter opens autocomplete for rooms starting with that letter.
- `:` opens autocomplete for emoji.
- Arrow up and arrow down move between options while autocomplete is open.
- Tab moves to the next option while autocomplete is open, wrapping around at the end after first going back to the
  typed text.

### Formatting

- Selecting text shows a formatting bar above the selection.
- The bar formats the selection as bold, italic, strikethrough, a block quote or a code block (inline when the
  selection has no line break).
- Formatting is applied as Markdown syntax.
- Ctrl/Cmd+B makes the selection bold, Ctrl/Cmd+I italic and Ctrl/Cmd+> a block quote.

### Sending and editing

- Enter sends the message and Shift+Enter inserts a line break. On touch-only devices (phones and tablets without a
  mouse) Enter inserts a line break instead, and pasting text with line breaks no longer sends it; the Send button
  sends. See `apps/web/src/fork/phone/enterSendsMessage.ts`.
- Arrow up with the caret at the start of the composer edits the last message you sent.
- Alt+arrow up and Alt+arrow down step through previously sent messages, putting them in the composer.
- Ctrl/Cmd+Z and Ctrl/Cmd+Y undo and redo.

### Other

- Clicking a display name on an event in the timeline inserts a user pill into the composer.
- Emoticons such as `:-)`, `>:-)` and `:-/` are replaced by emoji while typing, if that setting is on.
- Typing in the composer sends typing notifications to the room.
- "Quote" in an event's context menu inserts a quote of the event body into the composer.
- "Reply" in an event's context menu shows a preview above the composer of the message being replied to.

## Keyboard shortcuts

### Using the `KeyBindingsManager`

The `KeyBindingsManager` (`apps/web/src/KeyBindingsManager.ts`, reached with `getKeyBindingsManager()`) has methods
that turn a `KeyboardEvent | React.KeyboardEvent` into a `KeyBindingAction`, one per area of the app:
`getMessageComposerAction`, `getAutocompleteAction`, `getRoomListAction`, `getRoomAction`, `getNavigationAction`,
`getAccessibilityAction`, `getCallAction` and `getLabsAction`.

The event is compared with the shortcuts returned by the `IKeyBindingsProvider`s. The default provider is
`defaultBindingsProvider` in `apps/web/src/KeyBindingsDefaults.ts`.

For example, to close a menu when the right keys are pressed:

```ts
const onKeyDown = (ev: KeyboardEvent): void => {
    let handled = true;
    const action = getKeyBindingsManager().getAccessibilityAction(ev);
    switch (action) {
        case KeyBindingAction.Escape:
            closeMenu();
            break;
        default:
            handled = false;
            break;
    }

    if (handled) {
        ev.preventDefault();
        ev.stopPropagation();
    }
};
```

### How the shortcuts are defined

`defaultBindingsProvider` builds its `KeyBinding`s with `getBindingsByCategory()`, from the `KeyboardShortcutSetting`s
in `apps/web/src/accessibility/KeyboardShortcuts.ts`.

### Adding a keyboard shortcut

In most cases only `KeyboardShortcuts.ts` changes: add a `KeyBindingAction` and add it to the `KEYBOARD_SHORTCUTS`
object.

A shortcut with several key bindings can't be customised in settings, because both the settings and the UI would have
to manage all of them. To add one:

1. Add a `KeyBindingAction`.
2. Add how the shortcut is shown to `getUIOnlyShortcuts()` in `apps/web/src/accessibility/KeyboardShortcutUtils.ts`.
3. Add the key bindings to the matching method in `KeyBindingsDefaults.ts`.
