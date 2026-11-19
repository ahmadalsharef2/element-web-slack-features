/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { type Map as LeafletMap, type TileLayer } from "leaflet";
import { MapContainer } from "react-leaflet";
import { render, screen } from "test-utils-rtl";

import { BaseLayers, exchangeIntoRoom, isBytemDemandRoom, marketHost } from "./BytemTab";

vi.mock("matrix-js-sdk/src/utils", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    sleep: vi.fn().mockResolvedValue(undefined),
}));

const MARKET = "bytem.bm1.liberbyte.app";
const ENTRY = {
    key: `${MARKET} https://bm1.liberbyte.app/de/buildings`,
    market: MARKET,
    deid: "https://bm1.liberbyte.app/de/buildings",
    label: "Buildings",
    class: "https://cities.app/class/building/Building",
};

/** Answers fetch per `METHOD path`, a list of answers used up in turn with the last one repeating. */
function marketAnswers(table: Record<string, Array<[number, unknown]>>): ReturnType<typeof vi.fn> {
    const calls = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
        const answers = table[key];
        if (!answers) throw new TypeError("Failed to fetch");
        const call = calls.get(key) ?? 0;
        calls.set(key, call + 1);
        const [status, data] = answers[Math.min(call, answers.length - 1)];
        const message = (data as { message?: string } | null)?.message;
        return new Response(JSON.stringify({ data, message }), { status });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function mockClient(): MatrixClient {
    return {
        getSafeUserId: vi.fn().mockReturnValue("@alice:example.org"),
        createRoom: vi.fn().mockResolvedValue({ room_id: "!own" }),
        joinRoom: vi.fn().mockResolvedValue({}),
    } as unknown as MatrixClient;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("marketHost", () => {
    it("takes the host of what was typed and refuses what is not a public host", () => {
        expect(marketHost("https://Bytem.De.Cities.App/index")).toBe("bytem.de.cities.app");
        expect(marketHost(" bytem.bm1.liberbyte.app ")).toBe(MARKET);
        expect(marketHost("localhost")).toBeNull();
        expect(marketHost("10.0.0.1")).toBeNull();
        expect(marketHost("")).toBeNull();
    });
});

describe("isBytemDemandRoom", () => {
    const room = (type: string, baseType: string): Room =>
        ({
            currentState: {
                getStateEvents: (t: string) => (t === type ? [{ getContent: () => ({ base_type: baseType }) }] : []),
            },
        }) as unknown as Room;

    it("recognises a demand room by either base type event", () => {
        expect(isBytemDemandRoom(room("bytem.app.room-base-type", "demand"))).toBe(true);
        expect(isBytemDemandRoom(room("room-base-type", "demand"))).toBe(true);
        expect(isBytemDemandRoom(room("bytem.app.room-base-type", "supply"))).toBe(false);
    });
});

describe("exchangeIntoRoom", () => {
    it("asks the market with the pin and joins the room it reports once the invite arrives", async () => {
        const client = mockClient();
        const fetchMock = marketAnswers({
            "POST /api/demand/access-by-deid": [[200, { request_id: "r1" }]],
            "GET /api/demand/access-by-deid-status/r1": [
                [200, { status: "finding_room" }],
                [200, { status: "delivering", room_id: "!market" }],
            ],
        });
        vi.mocked(client.joinRoom).mockRejectedValueOnce(new Error("no invite yet"));

        await expect(exchangeIntoRoom(client, ENTRY, [50, 8.27])).resolves.toBe("!market");

        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            deid: ENTRY.deid,
            matrix_user: "@alice:example.org",
            location: { lat: 50, lon: 8.27 },
        });
        expect(client.joinRoom).toHaveBeenCalledTimes(2);
        expect(client.createRoom).not.toHaveBeenCalled();
    });

    it("fails with the market's reason and joins nothing", async () => {
        const client = mockClient();
        marketAnswers({
            "POST /api/demand/access-by-deid": [[200, { request_id: "r1" }]],
            "GET /api/demand/access-by-deid-status/r1": [[200, { status: "failed", reason: "No supply" }]],
        });

        await expect(exchangeIntoRoom(client, ENTRY, null)).rejects.toThrow("No supply");
        expect(client.joinRoom).not.toHaveBeenCalled();
    });

    it("fails with the market's message when it refuses the request", async () => {
        const client = mockClient();
        marketAnswers({ "POST /api/demand/access-by-deid": [[402, { message: "This data has a price." }]] });

        await expect(exchangeIntoRoom(client, ENTRY, null)).rejects.toThrow("This data has a price.");
    });
});

describe("BaseLayers", () => {
    it("sends the app's origin as Referer with every map picture, as OpenStreetMap requires", () => {
        let map: LeafletMap | null = null;
        render(
            React.createElement(
                MapContainer,
                {
                    center: [51, 10],
                    zoom: 5,
                    style: { width: 300, height: 200 },
                    ref: (instance: LeafletMap | null) => {
                        map = instance;
                    },
                },
                React.createElement(BaseLayers),
            ),
        );

        const policies: unknown[] = [];
        map!.eachLayer((layer) => policies.push((layer as TileLayer).options.referrerPolicy));
        expect(policies).toEqual(["strict-origin-when-cross-origin"]);
        const preview = screen.getByRole("button", { name: "Show Satellite" }).querySelector("img");
        expect(preview?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    });
});
