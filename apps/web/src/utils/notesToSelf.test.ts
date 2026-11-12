/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { vi, describe, it, expect, beforeEach, type MockedObject } from "vitest";
import { getMockClientWithEventEmitter, mockClientMethodsUser } from "test-utils";

import { findNotesRoom, openNotesToSelf } from "./notesToSelf";
import DMRoomMap from "./DMRoomMap";
import createRoom from "../createRoom";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";

vi.mock("../createRoom", () => ({ default: vi.fn().mockResolvedValue("!new:example.org") }));

const myUserId = "@dana:example.org";

function mkRoom(roomId: string, opts: { joined?: number; invited?: number; membership?: string; ts?: number }): Room {
    return {
        roomId,
        getMyMembership: () => opts.membership ?? KnownMembership.Join,
        getJoinedMemberCount: () => opts.joined ?? 1,
        getInvitedMemberCount: () => opts.invited ?? 0,
        getLastActiveTimestamp: () => opts.ts ?? 0,
    } as unknown as Room;
}

describe("notesToSelf", () => {
    let client: MockedObject<MatrixClient>;
    let rooms: Room[];

    beforeEach(() => {
        rooms = [];
        client = getMockClientWithEventEmitter({
            ...mockClientMethodsUser(myUserId),
            getRoom: vi.fn((roomId: string) => rooms.find((r) => r.roomId === roomId) ?? null),
            getClientWellKnown: vi.fn().mockReturnValue({}),
        });
        vi.spyOn(DMRoomMap, "shared").mockReturnValue({
            getDMRoomsForUserId: (userId: string) => (userId === myUserId ? rooms.map((r) => r.roomId) : []),
        } as unknown as DMRoomMap);
        vi.mocked(createRoom).mockClear();
    });

    it("finds the most recently used room that only we are in", () => {
        rooms = [
            mkRoom("!old:example.org", { ts: 1 }),
            mkRoom("!recent:example.org", { ts: 5 }),
            mkRoom("!shared:example.org", { joined: 2, ts: 9 }),
            mkRoom("!invited:example.org", { invited: 1, ts: 9 }),
            mkRoom("!left:example.org", { membership: KnownMembership.Leave, ts: 9 }),
        ];
        expect(findNotesRoom(client)?.roomId).toBe("!recent:example.org");
    });

    it("finds nothing when no room is marked as a chat with ourselves", () => {
        expect(findNotesRoom(client)).toBeUndefined();
    });

    it("shows the existing notes room", async () => {
        rooms = [mkRoom("!notes:example.org", {})];
        const dispatch = vi.spyOn(dis, "dispatch");

        await expect(openNotesToSelf(client)).resolves.toBe("!notes:example.org");
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ action: Action.ViewRoom, room_id: "!notes:example.org" }),
        );
        expect(createRoom).not.toHaveBeenCalled();
    });

    it("creates the notes room on first use", async () => {
        await expect(openNotesToSelf(client)).resolves.toBe("!new:example.org");
        expect(createRoom).toHaveBeenCalledWith(client, {
            dmUserId: myUserId,
            encryption: true,
            name: "My notes",
            topic: expect.stringContaining("Only you can see this room"),
        });
    });
});
