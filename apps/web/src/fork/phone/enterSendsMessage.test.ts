/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { isCtrlEnterToSend, isTouchOnlyDevice } from "./enterSendsMessage";
import { getKeyBindingsManager } from "../../KeyBindingsManager";
import { KeyBindingAction } from "../../accessibility/KeyboardShortcuts";
import SettingsStore from "../../settings/SettingsStore";

function mockTouchOnly(touchOnly: boolean): void {
    vi.spyOn(window, "matchMedia").mockImplementation(
        (query: string) =>
            ({ matches: touchOnly && query.includes("pointer: coarse"), media: query }) as MediaQueryList,
    );
}

function enterAction(): KeyBindingAction | undefined {
    return getKeyBindingsManager().getMessageComposerAction(new KeyboardEvent("keydown", { key: "Enter" }));
}

describe("enterSendsMessage", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("detects a touch-only device", () => {
        mockTouchOnly(true);
        expect(isTouchOnlyDevice()).toBe(true);
        mockTouchOnly(false);
        expect(isTouchOnlyDevice()).toBe(false);
    });

    it("needs Ctrl+Enter when the setting is on or the device is touch only", () => {
        mockTouchOnly(false);
        expect(isCtrlEnterToSend(false)).toBe(false);
        expect(isCtrlEnterToSend(true)).toBe(true);
        mockTouchOnly(true);
        expect(isCtrlEnterToSend(false)).toBe(true);
    });

    it("makes Enter start a new line in the composer on a touch-only device", () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue(false);
        mockTouchOnly(false);
        expect(enterAction()).toBe(KeyBindingAction.SendMessage);
        mockTouchOnly(true);
        expect(enterAction()).toBe(KeyBindingAction.NewLine);
    });
});
