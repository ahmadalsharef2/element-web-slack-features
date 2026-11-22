/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Measures what it costs to open the app as a signed-in user: what the browser downloads and how long until the
// room list is on screen. Run it against a production build (BASE_URL), not the dev server.

import { mkdirSync, writeFileSync } from "node:fs";

import { test } from "../../element-web-test";
import { UX_OUT } from "./journey";

test.describe("UX start-up cost", () => {
    test.use({ displayName: "Dana", config: { brand: "LiberMsg" } });

    test("open the app", async ({ page, user }) => {
        const runs: { roomListMs: number; scriptKB: number; allKB: number; requests: number; largest: string[] }[] = [];
        for (let run = 0; run < 3; run++) {
            await page.reload();
            await page.getByRole("navigation", { name: "Room list" }).waitFor();
            runs.push(
                await page.evaluate(() => {
                    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
                    // Decoded size, so the numbers do not depend on caching or compression on the test server
                    const kb = (list: PerformanceResourceTiming[]): number =>
                        Math.round(list.reduce((n, r) => n + r.decodedBodySize, 0) / 1024);
                    return {
                        roomListMs: Math.round(performance.now()),
                        scriptKB: kb(resources.filter((r) => /\.(js|wasm)(\?|$)/.test(r.name))),
                        allKB: kb(resources),
                        requests: resources.length,
                        largest: resources
                            .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
                            .slice(0, 8)
                            .map((r) => `${Math.round(r.decodedBodySize / 1024)} KB ${r.name.split("/").pop()}`),
                    };
                }),
            );
        }
        // The first load fills caches, so report the median of the three
        const median = (key: "roomListMs" | "scriptKB" | "allKB" | "requests"): number =>
            runs.map((r) => r[key]).sort((a, b) => a - b)[1];
        const result = {
            roomListMs: median("roomListMs"),
            scriptKB: median("scriptKB"),
            allKB: median("allKB"),
            requests: median("requests"),
            largest: runs[0].largest,
            runs,
        };
        mkdirSync(UX_OUT, { recursive: true });
        writeFileSync(`${UX_OUT}/startup.json`, JSON.stringify(result, null, 2));
        console.log("START-UP", JSON.stringify(result));
    });
});
