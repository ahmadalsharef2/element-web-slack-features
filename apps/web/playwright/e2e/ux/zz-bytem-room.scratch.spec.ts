/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Scratch: a demand room as the bytEM bot writes it, with the DEID widget pinned at the top. Deleted after the check.

import { test } from "../../element-web-test";

const OUT = process.env.SHOTS!;
const DEID = "https://bm1.liberbyte.app/de/rp/mainz/water/rhine-gauge";
const DEMAND = "demand.bytem.app.999999999999999";
const SUPPLY = { "@context": "https://bytem.app/supply", "license": "dl-de/zero-2-0", "as_of": "2026-11-02" };

test.use({ displayName: "Dana", config: { brand: "LiberMsg" }, botCreateOpts: { displayName: "bot" } });

test("demand room widget", async ({ page, app, user, bot }) => {
    test.setTimeout(240_000);
    page.on("console", (m) => /widget|capabilit/i.test(m.text()) && console.log("CONSOLE", m.text().slice(0, 240)));
    let n = 0;
    const shot = async (name: string): Promise<void> => {
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: false });
    };

    const roomId = await bot.createRoom({ name: `Demand — ${DEID}`, invite: [user.userId] });
    await app.client.joinRoom(roomId);
    const csv = await bot.uploadContent(Buffer.from("timestamp,value\n2026-11-01T00:00,288\n2026-11-01T00:15,290\n"), {
        name: "mainz-water-level-30-days.csv",
        type: "text/csv",
    });
    const send = async (body: object): Promise<string> =>
        (await bot.sendEvent(roomId, null, "m.room.message", { msgtype: "m.text", body: JSON.stringify(body) }))
            .event_id;
    const dataset = await send({
        ...SUPPLY,
        "@type": "supply-type-dataset",
        "asset_key": "mainz-water-level-30-days",
        "file": "mainz-water-level-30-days.csv",
        "url": csv.content_uri,
        "encodingFormat": "text/csv",
        "contentSize": 63194,
        "description": "Water level at the Mainz gauge every 15 minutes for 30 days, in cm above gauge zero.",
        "creditText": "Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV), PEGELONLINE",
    });
    const api = await send({
        ...SUPPLY,
        "@type": "supply-type-api",
        "asset_key": "mainz-water-level",
        "request":
            "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/MAINZ/W/measurements.json?start={period}",
        "parameters": { period: "P7D" },
        "creditText": "Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV), PEGELONLINE",
    });
    const extract = await send({
        ...SUPPLY,
        "@type": "supply-type-extract",
        "asset_key": "mainz-gauge-characteristic-levels",
        "version_key": "2010-2020",
        "extract": {
            Messstellenname: "MAINZ",
            Gewässer: "RHEIN",
            Kennzeichnende_Wasserstände: [
                { Kennwert: "Höchster Hochwasserstand (HHW)", Wert: "795 cm", Datum: "28.11.1882" },
                { Kennwert: "Mittel der Tageswasserstände (MW)", Wert: "288 cm", Zeitraum: "01.11.2010 - 31.10.2020" },
                { Kennwert: "Niedrigster Niedrigwasserstand (NNW)", Wert: "110 cm", Datum: "02.11.1947" },
            ],
        },
    });
    await bot.sendStateEvent(
        roomId,
        DEMAND,
        {
            [DEMAND]: {
                "@type": "bytem.app.demand-type",
                "deid": DEID,
                "event-ids.999999999999999": {
                    "supply-type-api": [api],
                    "supply-type-dataset": [dataset],
                    "supply-type-extract": [extract],
                },
            },
        },
        "1",
    );
    // As the bot's pinWidget writes them
    await bot.sendStateEvent(
        roomId,
        "im.vector.modular.widgets",
        {
            id: "bytem",
            type: "m.custom",
            name: "bytEM",
            url: `${process.env.PWA}/widget/${DEID.replace(/^https?:\/\//, "")}`,
            creatorUserId: bot.credentials!.userId,
        },
        "bytem",
    );
    await bot.sendStateEvent(
        roomId,
        "io.element.widgets.layout",
        { widgets: { bytem: { container: "top", height: 100 } } },
        "",
    );

    await page.setViewportSize({ width: 1400, height: 1500 });
    await page.goto(`/#/room/${roomId}`);
    await shot("room-opened");
    await page
        .getByRole("button", { name: "Later" })
        .click({ timeout: 8000 })
        .catch(() => {});
    await page
        .getByRole("button", { name: "Dismiss" })
        .click({ timeout: 3000 })
        .catch(() => {});
    for (let i = 0; i < 4; i++) {
        const button = page
            .locator('[class*="AppPermission"], [class*="AppTile"], [role=dialog]')
            .getByRole("button", { name: /^(Continue|Approve|Allow)$/ })
            .first();
        if (
            !(await button
                .waitFor({ timeout: 25_000 })
                .then(() => true)
                .catch(() => false))
        )
            break;
        await shot("asks");
        await button.click();
    }
    await page.waitForTimeout(12_000);
    await shot("widget-data");
    const frame = page.frameLocator('iframe[src*="/widget/"]').first();
    console.log(
        "WIDGET TEXT",
        (
            await frame
                .locator("body")
                .innerText({ timeout: 15_000 })
                .catch((e) => `none: ${e.message}`)
        ).slice(0, 1500),
    );
    // Make the widget tall to see all of it
    await frame
        .getByText("Datasets")
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    await shot("data-sections");
    await frame
        .getByText("Source & citation")
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
    await shot("data-lower");
});
