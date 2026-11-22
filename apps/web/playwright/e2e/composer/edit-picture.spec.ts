/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { rejectToastIfExists } from "@element-hq/element-web-playwright-common";

import { test, expect } from "../../element-web-test";
import { getSampleFilePath } from "../../sample-files";

test.describe("Edit a picture before sending", () => {
    test.use({ displayName: "Janet" });

    // `user` signs in before the room is made
    test.beforeEach(async ({ page, app, user }) => {
        await app.client.createRoom({ name: "Photo Room" });
        await app.viewRoomByName("Photo Room");
        await rejectToastIfExists(page, "Notifications");
    });

    test("draws and writes on a picture, and sends the edited one with its caption", async ({ page }) => {
        // Through the button and the file chooser, as a person would. This also works against a production build,
        // which has no test ids for app.setComposerInputFiles to find.
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Attachment" }).click();
        await (await chooser).setFiles(getSampleFilePath("element.png"));
        const upload = page.getByRole("dialog", { name: "Upload files" });
        await upload.getByLabel("Add a caption (optional)").fill("look at this");
        const sizeBefore = await upload.getByText(/ KB$/).textContent();
        await upload.getByRole("button", { name: "Edit" }).click();

        const editor = page.getByRole("dialog", { name: "Edit picture" });
        const canvas = editor.getByLabel("Picture being edited");
        const box = (await canvas.boundingBox())!;

        // A pen stroke across the picture
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 });
        await page.mouse.up();

        // Some text, which can be opened again by clicking it
        await editor.getByRole("button", { name: "Text", exact: true }).click();
        await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.5 } });
        await editor.getByRole("textbox", { name: "Text" }).fill("Here");
        await page.keyboard.press("Enter");
        await canvas.click({ position: { x: box.width * 0.32, y: box.height * 0.5 } });
        await expect(editor.getByRole("textbox", { name: "Text" })).toHaveValue("Here");
        await expect(editor.getByRole("button", { name: "Remove text" })).toBeVisible();
        await page.keyboard.press("Enter");

        await editor.getByRole("button", { name: "Done" }).click();

        // Back in the upload dialog the caption is still there, and the picture is the edited one
        await expect(upload.getByLabel("Add a caption (optional)")).toHaveValue("look at this");
        await expect(upload.getByText(/ KB$/)).not.toHaveText(sizeBefore!);

        await upload.getByRole("button", { name: "Upload" }).click();
        await expect(upload).not.toBeVisible();
        // The picture is in the room, named after its caption
        await expect(page.getByRole("img", { name: "look at this" })).toBeVisible();
    });
});
