/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { afterEach, describe, expect, it } from "vitest";

import SdkConfig from "./SdkConfig";
import { isElementBranded } from "./branding";

describe("isElementBranded", () => {
    afterEach(() => SdkConfig.reset());

    it.each(["Element", "Element Nightly", "Element Pro"])("is true for Element's own %s", (brand) => {
        SdkConfig.put({ brand });
        expect(isElementBranded()).toBe(true);
    });

    it.each(["LiberMsg", "Element Fork", "Elemental", "Acme Chat"])("is false for %s", (brand) => {
        SdkConfig.put({ brand });
        expect(isElementBranded()).toBe(false);
    });
});
