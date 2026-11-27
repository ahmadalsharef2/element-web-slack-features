/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { appUrlForSsoReturn, isInAndroidApp, listenForAndroidSsoReturn } from "./androidSsoReturn";
import type { CapacitorAppPlugin } from "./androidBackButton";

describe("appUrlForSsoReturn", () => {
    it("opens the app's page with the login token and fragment", () => {
        expect(appUrlForSsoReturn("org.elementfork.app://sso/?loginToken=abc#/room/x", "https://localhost")).toBe(
            "https://localhost/?loginToken=abc#/room/x",
        );
    });

    it("ignores other addresses", () => {
        expect(appUrlForSsoReturn("https://example.org/?loginToken=abc", "https://localhost")).toBeNull();
    });
});

describe("listenForAndroidSsoReturn", () => {
    afterEach(() => {
        delete window.Capacitor;
    });

    it("does nothing outside the Android app", () => {
        expect(isInAndroidApp()).toBe(false);
        expect(() => listenForAndroidSsoReturn()).not.toThrow();
    });

    it("listens for the return and checks the launch address", async () => {
        const app = {
            addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
            getLaunchUrl: vi.fn().mockResolvedValue(undefined),
            minimizeApp: vi.fn(),
        } as unknown as CapacitorAppPlugin;
        window.Capacitor = { Plugins: { App: app } };

        expect(isInAndroidApp()).toBe(true);
        listenForAndroidSsoReturn();
        expect(app.addListener).toHaveBeenCalledWith("appUrlOpen", expect.any(Function));
        expect(app.getLaunchUrl).toHaveBeenCalled();
    });
});
