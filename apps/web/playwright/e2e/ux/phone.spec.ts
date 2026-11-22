/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Walks through the app on a phone-sized touch screen and saves a screenshot at each step, for reviewing the phone
// layout by eye. A step that fails is noted in phone-steps.txt and the walk carries on, so one broken screen does
// not hide the rest. It compares nothing.

import { writeFile } from "node:fs/promises";

import { type Page } from "@playwright/test";

import { test } from "../../element-web-test";
import { quietStart, UX_OUT } from "./journey";
import { getSampleFilePath } from "../../sample-files";

const PHOTO = getSampleFilePath("element.png");

test.use({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
    displayName: "Dana",
    config: { brand: "Element Fork" },
    botCreateOpts: { displayName: "Sam" },
    actionTimeout: 10_000,
});

/** Holds a finger on the element's centre long enough to count as a long press. */
async function longPress(page: Page, selector: ReturnType<Page["locator"]>): Promise<void> {
    const box = (await selector.boundingBox())!;
    const touch = { identifier: 0, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    await selector.dispatchEvent("touchstart", { touches: [touch], changedTouches: [touch] });
    await page.waitForTimeout(700);
    await selector.dispatchEvent("touchend", { touches: [], changedTouches: [touch] });
}

test("phone walkthrough", async ({ page, app, user, bot }) => {
    test.setTimeout(240_000);
    const log: string[] = [];
    let n = 0;
    const shot = async (name: string): Promise<void> => {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${UX_OUT}/phone/${String(++n).padStart(2, "0")}-${name}.png` });
    };
    page.setDefaultTimeout(10_000);
    const step = async (name: string, run: () => Promise<void>): Promise<void> => {
        try {
            await run();
            log.push(`ok   ${name}`);
        } catch (e) {
            log.push(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
            await shot(`${name}-failed`).catch(() => {});
            await page.keyboard.press("Escape").catch(() => {});
        }
    };

    await quietStart(page);
    const general = await app.client.createRoom({ name: "general", invite: [bot.credentials!.userId] });
    await bot.joinRoom(general);
    for (const text of [
        "Morning all",
        "Standup at 10",
        "Can someone review my change? It is the one about the phone layout",
    ]) {
        await bot.sendMessage(general, text);
    }
    await app.client.sendMessage(general, "On my way");
    const planning = await bot.createRoom({ name: "planning" });
    await bot.inviteUser(planning, user.userId);
    await app.client.createSpace({ name: "Team" });

    await step("list", async () => {
        await page.getByRole("button", { name: /Open room general/ }).waitFor();
        await shot("list");
    });

    await step("room", async () => {
        await page.getByRole("button", { name: /Open room general/ }).click();
        await page.getByText("On my way").waitFor();
        await shot("room");
    });

    await step("long-press", async () => {
        await longPress(page, page.locator(".mx_EventTile_line", { hasText: "Standup at 10" }));
        await page.getByRole("menu").waitFor({ timeout: 3000 });
        await shot("long-press-menu");
        await page.keyboard.press("Escape");
    });

    await step("composer", async () => {
        await page.getByRole("textbox", { name: /message/i }).click();
        await page.keyboard.type("Typing on a phone");
        await shot("composer");
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
    });

    await step("room-info", async () => {
        await page.getByRole("button", { name: "Room info" }).last().click();
        await shot("room-info");
        await page.locator(".mx_RightPanel").getByRole("button", { name: "Close" }).click();
    });

    await step("upload", async () => {
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Attachment" }).click();
        await (await chooser).setFiles(PHOTO);
        await page.getByRole("dialog", { name: "Upload files" }).waitFor();
        await shot("upload-dialog");
    });

    await step("editor", async () => {
        const sizeBefore = await page.getByRole("dialog", { name: "Upload files" }).getByText(/ KB$/).textContent();
        await page.getByRole("button", { name: "Edit" }).click();
        await page.getByRole("dialog", { name: "Edit picture" }).waitFor();
        await shot("editor");
        const canvas = page.getByLabel("Picture being edited");
        await page.getByRole("button", { name: "Text", exact: true }).click();
        const box = (await canvas.boundingBox())!;
        await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.3);
        await page.keyboard.type("Look here");
        await shot("editor-typing");
        await page.getByRole("radio", { name: "Large" }).click();
        await page.getByRole("radio", { name: "#ffd60a" }).click();
        await page.keyboard.type("!");
        await shot("editor-typing-large");
        await page.keyboard.press("Enter");
        await shot("editor-text-placed");
        // Drag the text lower down, then tap it to change it
        const from = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x, from.y + box.height * 0.4, { steps: 5 });
        await page.mouse.up();
        await shot("editor-text-moved");
        await page.touchscreen.tap(from.x, from.y + box.height * 0.4);
        await shot("editor-text-reopened");
        await page.keyboard.press("Enter");
        await page.getByRole("button", { name: "Done" }).click();
        await page.getByRole("dialog", { name: "Upload files" }).waitFor();
        await shot("upload-after-edit");
        const sizeAfter = await page.getByRole("dialog", { name: "Upload files" }).getByText(/ KB$/).textContent();
        if (sizeAfter === sizeBefore) throw new Error("the edited picture was not kept");
        await page.getByRole("button", { name: "Upload" }).click();
        await page.waitForTimeout(1500);
        await shot("room-after-upload");
    });

    await step("back-to-list", async () => {
        await page.getByRole("button", { name: "Back" }).first().click();
        await page.getByRole("button", { name: /Open room general/ }).waitFor();
        await shot("back-to-list");
    });

    await step("invite", async () => {
        await page.getByRole("button", { name: /Toggle Invites section/ }).click();
        await page.getByRole("button", { name: /planning/ }).click();
        await shot("invite");
        await page.getByRole("button", { name: "Back" }).first().click();
    });

    await step("space", async () => {
        await page.getByRole("tree", { name: "Spaces" }).getByRole("button", { name: /Team/ }).first().click();
        await shot("space");
        await page
            .getByRole("tree", { name: "Spaces" })
            .getByRole("button", { name: /^All Chats/ })
            .first()
            .click();
    });

    await step("user-menu", async () => {
        await page.getByRole("button", { name: "User menu" }).click();
        await shot("user-menu");
        await page.keyboard.press("Escape");
    });

    await step("settings", async () => {
        await page.getByRole("button", { name: "User menu" }).click();
        await page.getByRole("menuitem", { name: "All settings" }).click();
        await page.getByRole("dialog").waitFor();
        await shot("settings");
        await page.getByRole("tab", { name: "Preferences" }).click();
        await shot("settings-preferences");
        await page.getByRole("dialog").getByRole("button", { name: "Close dialog" }).click();
    });

    await step("bytem", async () => {
        await page.getByRole("button", { name: /bytEM/i }).first().click();
        await shot("bytem");
        await page.getByRole("button", { name: "Back" }).first().click();
        await shot("after-bytem");
    });

    await writeFile(`${UX_OUT}/phone/phone-steps.txt`, log.join("\n") + "\n");
});
