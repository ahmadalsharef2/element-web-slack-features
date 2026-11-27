/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { toMatrixIdOnServer } from "./loginUsername";

describe("toMatrixIdOnServer", () => {
    it("turns name@server into a Matrix ID on the same homeserver", () => {
        expect(toMatrixIdOnServer("ahmad@matrix.org", "matrix.org")).toBe("@ahmad:matrix.org");
        expect(toMatrixIdOnServer("@ahmad@matrix.org", "matrix.org")).toBe("@ahmad:matrix.org");
        expect(toMatrixIdOnServer(" ahmad@Matrix.org ", "matrix.org")).toBe("@ahmad:Matrix.org");
    });

    it("keeps an email address on another domain", () => {
        expect(toMatrixIdOnServer("ahmad@gmail.com", "matrix.org")).toBe("ahmad@gmail.com");
    });

    it("keeps Matrix IDs and plain usernames", () => {
        expect(toMatrixIdOnServer("@ahmad:matrix.org", "matrix.org")).toBe("@ahmad:matrix.org");
        expect(toMatrixIdOnServer("ahmad", "matrix.org")).toBe("ahmad");
    });
});
