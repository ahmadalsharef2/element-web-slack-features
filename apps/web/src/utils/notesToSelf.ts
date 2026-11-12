/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";

import createRoom from "../createRoom";
import dis from "../dispatcher/dispatcher";
import { Action } from "../dispatcher/actions";
import { type ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import { _t } from "../languageHandler";
import DMRoomMap from "./DMRoomMap";
import { privateShouldBeEncrypted } from "./rooms";

/**
 * Finds the user's notes room: a room marked as a direct chat with themselves in which nobody else is, or is
 * invited. With several such rooms, the one used most recently wins.
 *
 * @param client - the signed-in client
 * @returns the notes room, or undefined if the user has none yet
 */
export function findNotesRoom(client: MatrixClient): Room | undefined {
    return DMRoomMap.shared()
        .getDMRoomsForUserId(client.getSafeUserId())
        .map((roomId) => client.getRoom(roomId))
        .filter(
            (room): room is Room =>
                !!room &&
                room.getMyMembership() === KnownMembership.Join &&
                room.getJoinedMemberCount() + room.getInvitedMemberCount() === 1,
        )
        .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp())[0];
}

/**
 * Shows the user's notes room, a private room only they are in, for jotting things down, keeping links and
 * drafting messages. The room is created the first time this is called.
 *
 * @param client - the signed-in client
 * @returns the ID of the notes room, or null if it could not be created
 */
export async function openNotesToSelf(client: MatrixClient): Promise<string | null> {
    const existing = findNotesRoom(client);
    if (existing) {
        dis.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: existing.roomId,
            metricsTrigger: undefined,
        });
        return existing.roomId;
    }

    // A direct chat with ourselves: createRoom invites nobody and records the room under our own user ID
    return createRoom(client, {
        dmUserId: client.getSafeUserId(),
        encryption: privateShouldBeEncrypted(client),
        name: _t("notes|room_name"),
        topic: _t("notes|room_topic"),
    });
}
