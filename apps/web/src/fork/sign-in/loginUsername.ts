/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Turns a username written as `name@server` or `@name@server` into the Matrix ID `@name:server` when `server` is the
 * homeserver being signed in to. People often write their Matrix ID the way they write an email address. Anything
 * else, including a real email address on another domain, is returned unchanged.
 *
 * @param username - what was typed in the username field.
 * @param hsName - the server name of the homeserver being signed in to, such as `matrix.org`.
 */
export function toMatrixIdOnServer(username: string, hsName: string): string {
    const match = /^@?([^@:\s]+)@([^@:\s]+)$/.exec(username.trim());
    if (!match || match[2].toLowerCase() !== hsName.toLowerCase()) return username;
    return `@${match[1]}:${match[2]}`;
}
