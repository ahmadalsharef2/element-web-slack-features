/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";

import { onAndroidBackButton } from "./androidBackButton";

describe("onAndroidBackButton", () => {
    afterEach(() => {
        delete (globalThis as { window?: Window }).window?.Capacitor;
        vi.unstubAllGlobals();
    });

    function mockApp() {
        let press: () => void = () => {};
        const remove = vi.fn().mockResolvedValue(undefined);
        const app = {
            addListener: vi.fn((_: string, listener: () => void) => {
                press = listener;
                return Promise.resolve({ remove });
            }),
            minimizeApp: vi.fn().mockResolvedValue(undefined),
        };
        vi.stubGlobal("window", { Capacitor: { Plugins: { App: app } } });
        return { app, remove, press: () => press() };
    }

    it("does nothing outside the Android app", () => {
        vi.stubGlobal("window", {});
        const goBack = vi.fn();
        const stop = onAndroidBackButton(goBack);
        expect(() => stop()).not.toThrow();
        expect(goBack).not.toHaveBeenCalled();
    });

    it("goes back when there is somewhere to go", () => {
        const { app, press } = mockApp();
        onAndroidBackButton(() => true);
        press();
        expect(app.minimizeApp).not.toHaveBeenCalled();
    });

    it("puts the app in the background when there is nowhere to go back to", () => {
        const { app, press } = mockApp();
        onAndroidBackButton(() => false);
        press();
        expect(app.minimizeApp).toHaveBeenCalled();
    });

    it("stops listening", async () => {
        const { remove } = mockApp();
        onAndroidBackButton(() => true)();
        await vi.waitFor(() => expect(remove).toHaveBeenCalled());
    });
});
