/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Performs each of the most frequent user tasks the way a user would, by the shortest route the app offers, and
// writes what each one cost (steps, clicks, key presses, response time) to the results folder. The tasks and how
// they were chosen are in docs/fork/UX_PLAN.md.

import { test, expect } from "../../element-web-test";
import { getSampleFilePath } from "../../sample-files";
import { Journey, quietStart } from "./journey";
import { type ElementAppPage } from "../../pages/ElementAppPage";
import { type Bot } from "../../pages/bot";

/** A small team space: two rooms, one with unread messages from a colleague. */
async function seed(app: ElementAppPage, bot: Bot): Promise<{ general: string; random: string }> {
    const general = await app.client.createRoom({ name: "general", invite: [bot.credentials!.userId] });
    const random = await app.client.createRoom({ name: "random", invite: [bot.credentials!.userId] });
    await bot.joinRoom(general);
    await bot.joinRoom(random);
    for (const text of ["Morning all", "Standup at 10", "Can someone review my change?"]) {
        await bot.sendMessage(general, text);
    }
    await bot.sendMessage(random, "The quarterly report is attached");
    return { general, random };
}

test.describe("UX journeys", () => {
    test.use({
        displayName: "Dana",
        // The settings LiberMsg ships in its config.json
        config: { brand: "LiberMsg", setting_defaults: { ctrlFForSearch: true } },
        botCreateOpts: { displayName: "Sam" },
    });

    test.beforeEach(async ({ page, user }) => {
        await quietStart(page);
    });

    test("1 read new messages", async ({ page, app, bot }) => {
        await seed(app, bot);
        const unread = page.getByRole("option", { name: /Open room general with 3 unread messages/ });
        await expect(unread).toBeVisible();

        const j = new Journey(page, "01 Read new messages");
        await j.click("Click the room with the unread badge", unread, page.getByText("Can someone review my change?"));
        await j.shot("done");
        j.finish();
    });

    test("2 send a message", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");
        const composer = page.getByRole("textbox", { name: /Send .*message/ });
        await expect(composer).toBeFocused();

        const j = new Journey(page, "02 Send a message");
        await j.type("Type the message", "On my way");
        await j.press("Press Enter", "Enter", page.locator(".mx_EventTile", { hasText: "On my way" }));
        j.finish();
    });

    test("3 switch room", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");

        const j = new Journey(page, "03 Switch to another room");
        await j.press("Press Ctrl+K", "Control+k", page.getByRole("dialog", { name: "Search Dialog" }));
        await j.type("Type the start of the name", "ran", page.getByRole("option", { name: /random/ }));
        await j.press("Press Enter", "Enter", page.getByText("The quarterly report is attached"));
        await j.shot("done");
        j.finish();
    });

    test("4 react and reply", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");
        const message = page.locator(".mx_EventTile", { hasText: "Standup at 10" });

        const react = new Journey(page, "04a React to a message");
        await react.hover("Point at the message", message, message.getByRole("button", { name: "React" }));
        const picker = page.getByRole("region", { name: "Emoji picker" });
        await react.click("Click React", message.getByRole("button", { name: "React" }), picker);
        await react.shot("picker");
        await react.click(
            "Click the thumbs-up under Quick Reactions",
            picker.getByRole("checkbox", { name: "👍" }).last(),
            message.getByRole("button", { name: /👍/ }),
        );
        react.finish();

        await page.keyboard.press("Escape");
        const reply = new Journey(page, "04b Reply in a thread");
        await reply.hover("Point at the message", message, message.getByRole("button", { name: "Reply in thread" }));
        await reply.click(
            "Click Reply in thread",
            message.getByRole("button", { name: "Reply in thread" }),
            page.locator(".mx_ThreadView").getByRole("textbox"),
        );
        await reply.type("Type the reply", "I'll be there");
        await reply.press(
            "Press Enter",
            "Enter",
            page.locator(".mx_ThreadView .mx_EventTile", { hasText: "I'll be there" }),
        );
        await reply.shot("done");
        reply.finish();
    });

    test("5 share a file", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");

        const j = new Journey(page, "05 Share a file with a caption");
        const dialog = page.getByRole("dialog", { name: "Upload files" });
        const chooser = page.waitForEvent("filechooser");
        await j.click("Click Attachment", page.getByRole("button", { name: "Attachment" }));
        await j.outside(
            "Pick the file in the system dialog",
            async () => (await chooser).setFiles(getSampleFilePath("riot.png")),
            dialog,
        );
        await j.shot("dialog");
        await j.click("Click the caption field", dialog.getByLabel("Add a caption (optional)"));
        await j.type("Type the caption", "Our old logo");
        await j.press("Press Enter", "Enter", page.locator(".mx_EventTile", { hasText: "Our old logo" }));
        await j.shot("done");
        j.finish();
    });

    test("6 start a direct message", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "06 Message a person directly");
        await j.click("Click New", page.getByRole("button", { name: "New", exact: true }), page.getByRole("menu"));
        await j.shot("menu");
        await j.click(
            "Click Start chat",
            page.getByRole("menuitem", { name: "Start chat" }),
            page.getByRole("dialog", { name: "Direct Messages" }),
        );
        await j.type("Type the person's name", "Sam", page.getByRole("dialog").getByText("Sam").first());
        await j.shot("found");
        await j.click("Click the person", page.getByRole("dialog").getByRole("option", { name: /Sam/ }).first());
        const composer = page.getByRole("textbox", { name: /Send .*message/ });
        const confirm = page.getByRole("dialog").filter({ hasText: "Start a chat with this new contact?" });
        await j.click("Click Go", page.getByRole("dialog").getByRole("button", { name: "Go" }), composer.or(confirm));
        if (await confirm.isVisible()) {
            await j.shot("confirm");
            j.problem("A second dialog asks to confirm the chat that was just asked for, with Cancel as the default");
            await j.click("Click Continue", confirm.getByRole("button", { name: "Continue" }), composer);
        }
        await j.type("Type the message", "Hi Sam");
        await j.press("Press Enter", "Enter", page.locator(".mx_EventTile", { hasText: "Hi Sam" }));
        await j.shot("done");
        j.finish();
    });

    test("6b start a direct message from search", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "06b Message a person directly (Ctrl+K)");
        const search = page.getByRole("dialog", { name: "Search Dialog" });
        await j.press("Press Ctrl+K", "Control+k", search);
        await j.type("Type the person's name", "Sam", search.getByRole("option", { name: /Sam/ }).first());
        await j.shot("found");
        const composer = page.getByRole("textbox", { name: /Send .*message/ });
        await j.click("Click the person", search.getByRole("option", { name: /Sam/ }).first(), composer);
        await j.type("Type the message", "Hi Sam");
        await j.press("Press Enter", "Enter", page.locator(".mx_EventTile", { hasText: "Hi Sam" }));
        await j.shot("done");
        j.finish();
    });

    test("6c write a note to myself", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "06c Write a note to myself");
        await j.click("Click your picture", page.getByRole("button", { name: "User menu" }), page.getByRole("menu"));
        await j.shot("menu");
        const composer = page.getByRole("textbox", { name: /Send .*message/ });
        await j.click("Click My notes", page.getByRole("menuitem", { name: "My notes" }), composer);
        await expect(page.locator(".mx_RoomHeader").getByText("My notes")).toBeVisible();
        await j.type("Type the note", "Ask Sam about the report");
        await j.press("Press Enter", "Enter", page.locator(".mx_EventTile", { hasText: "Ask Sam about the report" }));
        await j.shot("done");

        // The second time, the same room opens instead of another one being made
        // (with a direct chat in the list, its entries are buttons under "People" and "Rooms")
        await page.getByRole("button", { name: /Open room general/ }).click();
        await page.getByRole("button", { name: "User menu" }).click();
        await page.getByRole("menuitem", { name: "My notes" }).click();
        await expect(page.locator(".mx_EventTile", { hasText: "Ask Sam about the report" })).toBeVisible();
        await expect(page.getByRole("button", { name: /Open room My notes/ })).toHaveCount(1);
        j.finish();
    });

    test("7 search messages", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");

        const j = new Journey(page, "07 Find an old message");
        const direct = page.locator(".mx_RoomHeader").getByRole("button", { name: /^Search messages/ });
        const field = page.getByRole("searchbox").or(page.getByPlaceholder("Search messages…"));
        // The header's buttons appear together; wait for one that every version has
        await page.locator(".mx_RoomHeader").getByRole("button", { name: "Threads" }).waitFor();
        if (await direct.isVisible()) {
            await j.click("Click Search", direct, field);
        } else {
            j.problem("Nothing in the room says Search: the field is inside the Room info panel");
            await j.click("Click Room info", page.getByRole("button", { name: "Room info" }).last(), field);
            await j.shot("panel");
            await j.click("Click the search field", field);
        }
        await j.type("Type a word from it", "standup");
        await j.press("Press Enter", "Enter", page.getByText("1 result found for"));
        await j.shot("done");
        j.finish();
    });

    test("8 quiet notifications", async ({ page, app, bot }) => {
        await seed(app, bot);

        const snooze = new Journey(page, "08a Snooze notifications");
        await snooze.click(
            "Click your picture",
            page.getByRole("button", { name: "User menu" }),
            page.getByRole("menu"),
        );
        await snooze.shot("menu");
        await snooze.click("Click Snooze", page.getByRole("menuitem", { name: /Snooze notifications/ }));
        snooze.finish();

        const mute = new Journey(page, "08b Mute one room");
        const room = page.getByRole("option", { name: /Open room random/ });
        await mute.hover("Point at the room", room, room.getByRole("button", { name: "Notification options" }));
        await mute.click(
            "Click the bell",
            room.getByRole("button", { name: "Notification options" }),
            page.getByRole("menu"),
        );
        await mute.shot("menu");
        await mute.click("Click Mute room", page.getByRole("menuitem", { name: "Mute room" }));
        mute.finish();
    });

    test("9 schedule a message", async ({ page, app, bot }) => {
        await seed(app, bot);
        await app.viewRoomByName("general");

        await expect(page.getByRole("textbox", { name: /Send .*message/ })).toBeFocused();

        const j = new Journey(page, "09 Send a message later");
        await j.type("Type the message", "See you tomorrow");
        await j.click("Click the clock", page.getByRole("button", { name: "Schedule send" }), page.getByRole("menu"));
        await j.shot("menu");
        await j.click("Click In 1 hour", page.getByRole("menuitem", { name: "In 1 hour" }));
        await expect(page.getByRole("textbox", { name: /Send .*message/ })).toHaveText("");
        await j.shot("done");
        j.finish();
    });

    test("10 create a room and invite", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "10 Create a room and invite someone");
        await j.click("Click New", page.getByRole("button", { name: "New", exact: true }), page.getByRole("menu"));
        await j.click(
            "Click New room",
            page.getByRole("menuitem", { name: "New room" }),
            page.getByRole("dialog", { name: /Create a (private )?room/ }),
        );
        await j.shot("dialog");
        await j.type("Type the name", "project-x");
        await j.press("Press Enter", "Enter", page.getByRole("button", { name: "Invite to this room" }));
        await j.click(
            "Click Invite to this room",
            page.getByRole("button", { name: "Invite to this room" }),
            page.getByRole("dialog"),
        );
        await j.type("Type the person's name", "Sam", page.getByRole("dialog").getByRole("option", { name: /Sam/ }));
        await j.click("Click the person", page.getByRole("dialog").getByRole("option", { name: /Sam/ }).first());
        await j.click("Click Invite", page.getByRole("dialog").getByRole("button", { name: "Invite" }));
        const warning = page.locator(".mx_UnknownIdentityUsersWarningDialog");
        await warning.waitFor({ timeout: 3000 }).catch(() => {});
        if (await warning.isVisible()) {
            await j.shot("confirm");
            j.problem("A second dialog asks to confirm the invite that was just asked for");
            await j.click("Click Continue", warning.getByRole("button").last());
        }
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await j.shot("done");
        j.finish();
    });

    test("12 sign out", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "12 Sign out");
        await j.click("Click your picture", page.getByRole("button", { name: "User menu" }), page.getByRole("menu"));
        await j.shot("menu");
        const direct = page.getByRole("menuitem", { name: "Sign out" });
        if (await direct.isVisible()) {
            await j.click("Click Sign out", direct);
        } else {
            j.problem("The user menu has no Sign out entry");
            await j.click(
                "Click All settings",
                page.getByRole("menuitem", { name: "All settings" }),
                page.getByRole("dialog", { name: "Settings" }),
            );
            await j.shot("settings");
            j.problem('The only way out is a button named "Remove this device", which does not say "Sign out"');
            await j.click("Click Remove this device", page.getByRole("button", { name: "Remove this device" }));
        }
        const signedOut = page.getByRole("link", { name: "Sign in" });
        // Signing out either finishes at once or asks first; a settings dialog behind it is not the question
        const question = page
            .getByRole("dialog")
            .filter({ has: page.getByRole("button", { name: /^(Sign out|Remove this device)( anyway)?$/ }) });
        await signedOut.or(question).first().waitFor();
        if (!(await signedOut.isVisible())) {
            await j.shot("confirm");
            j.problem("The confirmation offers a recovery key as the main button and signing out as a small link");
            await j.click(
                "Click Remove this device anyway",
                page
                    .getByRole("dialog")
                    .last()
                    .getByRole("button", { name: /^(Sign out|Remove this device)( anyway)?$/ }),
                signedOut,
            );
        }
        await j.shot("done");
        j.finish();
    });

    test("13 change the theme", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "13 Switch to the dark theme");
        const quick = page.getByRole("region", { name: "Quick settings" });
        await j.click(
            "Click Quick settings",
            page.getByRole("button", { name: "Quick settings" }),
            quick.getByRole("button", { name: "Theme" }),
        );
        await j.shot("menu");
        await j.click(
            "Open the theme list",
            quick.getByRole("button", { name: "Theme" }),
            page.getByRole("option").first(),
        );
        await j.shot("list");
        await j.click("Click Dark", page.getByRole("option", { name: "Dark", exact: true }));
        await expect(page.locator("body")).toHaveClass(/cpd-theme-dark/);
        await j.shot("done");
        j.finish();
    });

    test("14 hide my online status", async ({ page, app, bot }) => {
        await seed(app, bot);

        const j = new Journey(page, "14 Hide my online status");
        await j.click("Click your picture", page.getByRole("button", { name: "User menu" }), page.getByRole("menu"));
        const settings = page.getByRole("dialog", { name: /^Settings/ });
        await j.click("Click All settings", page.getByRole("menuitem", { name: "All settings" }), settings);
        await j.click(
            "Click Preferences",
            settings.getByRole("tab", { name: "Preferences" }),
            settings.getByRole("heading", { name: "Language" }),
        );
        const toggle = settings.getByRole("switch", { name: "Share my online status" });
        await toggle.scrollIntoViewIfNeeded();
        await j.shot("found");
        await j.outside("Scroll down to Presence", async () => {});
        await j.click("Click Share my online status", toggle);
        await expect(toggle).not.toBeChecked();
        j.finish();
    });
});

test.describe("UX journeys, signed out", () => {
    test.use({ displayName: "Dana", config: { brand: "LiberMsg", setting_defaults: { ctrlFForSearch: true } } });

    test("11 sign in", async ({ page, credentials }) => {
        await page.goto("/");

        const j = new Journey(page, "11 Sign in");
        await page.getByRole("link", { name: "Sign in" }).waitFor();
        await j.shot("welcome");
        const username = page.getByRole("textbox", { name: "Username" });
        await j.click("Click Sign in", page.getByRole("link", { name: "Sign in" }), username);
        await j.shot("form");
        if (!(await username.evaluate((field) => field === document.activeElement))) {
            j.problem("The username field does not have the focus, so it takes a click before typing");
            await j.click("Click Username", username);
        }
        await j.type("Type the username", credentials.username);
        await j.press("Press Tab", "Tab");
        await j.type("Type the password", credentials.password!);
        const roomList = page.getByRole("navigation", { name: "Room list" });
        await j.press("Press Enter", "Enter", roomList.or(page.locator(".mx_CompleteSecurity")));
        await j.shot("after-password");
        // Whatever stands between the password and the room list is part of signing in
        for (let screens = 0; !(await roomList.isVisible()) && screens < 5; screens++) {
            const heading = (await page.getByRole("heading").first().textContent()) ?? "";
            j.problem(`Extra screen before the app: "${heading.trim()}"`);
            await j.shot(`extra-${screens}`);
            const next = page.getByRole("button", {
                name: /^(Skip|Skip verification for now|I'll verify later|Done|Continue|Got it|OK)$/,
            });
            await j.click(`Click ${await next.first().textContent()}`, next.first());
            await page.waitForTimeout(500);
        }
        await roomList.waitFor();
        const prompts = await quietStart(page);
        for (const prompt of prompts) j.problem(`Prompt on first start: "${prompt}"`);
        await j.shot("done");
        j.finish();
    });
});
