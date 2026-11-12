/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Saves the main screens at phone, tablet and desktop sizes, in the light and dark themes, for reviewing the look
// of a change. Writes PNGs to the results folder; it compares nothing.

import { test } from "../../element-web-test";
import { quietStart, UX_OUT } from "./journey";

const SIZES = {
    phone: { width: 390, height: 844 },
    tablet: { width: 820, height: 1180 },
    desktop: { width: 1280, height: 800 },
};

for (const [size, viewport] of Object.entries(SIZES)) {
    for (const theme of ["light", "dark"]) {
        test.describe(`${size} ${theme}`, () => {
            test.use({
                viewport,
                displayName: "Dana",
                config: { brand: "Element Fork", default_theme: theme },
                botCreateOpts: { displayName: "Sam" },
            });

            test("screens", async ({ page, app, user, bot }) => {
                const shot = (name: string) =>
                    page.screenshot({ path: `${UX_OUT}/screens/${size}-${theme}-${name}.png` });
                await quietStart(page);
                const general = await app.client.createRoom({ name: "general", invite: [bot.credentials!.userId] });
                await app.client.createRoom({ name: "random" });
                await bot.joinRoom(general);
                for (const text of ["Morning all", "Standup at 10", "Can someone review my change?"]) {
                    await bot.sendMessage(general, text);
                }
                await app.client.sendMessage(general, "On my way");
                await page.getByRole("option", { name: /Open room general/ }).click();
                await page.getByText("On my way").waitFor();
                await shot("1-room");
                await page.getByRole("button", { name: "Room info" }).last().click();
                await page.waitForTimeout(400);
                await shot("2-room-info");
                await page.locator(".mx_RightPanel").getByRole("button", { name: "Close" }).click();
                if (size === "phone") await page.getByRole("button", { name: "Back" }).click();
                await page.waitForTimeout(400);
                await shot("3-list");
                await page.getByRole("button", { name: "User menu" }).click();
                await page.waitForTimeout(300);
                await shot("4-user-menu");
                await page.keyboard.press("Escape");
                await app.settings.openUserSettings("Preferences");
                await page.waitForTimeout(400);
                await shot("5-settings");
            });
        });
    }
}

test.describe("signed out", () => {
    for (const [size, viewport] of Object.entries(SIZES)) {
        test.describe(size, () => {
            test.use({ viewport, config: { brand: "Element Fork" } });
            test("welcome", async ({ page, homeserver }) => {
                await page.goto("/#/welcome");
                await page.getByRole("link", { name: "Sign in" }).waitFor();
                await page.waitForTimeout(500);
                await page.screenshot({ path: `${UX_OUT}/screens/${size}-light-0-welcome.png` });
                await page.getByRole("link", { name: "Sign in" }).click();
                await page.waitForTimeout(800);
                await page.screenshot({ path: `${UX_OUT}/screens/${size}-light-0-sign-in.png` });
            });
        });
    }
});
