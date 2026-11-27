/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach } from "vitest";

import { applyThemeChoice, getSelectedThemeChoice, getThemeChoices, MATCH_SYSTEM_THEME_ID } from "./themeChoice";
import SettingsStore from "../../settings/SettingsStore";
import { SettingLevel } from "../../settings/SettingLevel";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";

describe("themeChoice", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("offers matching the system first", () => {
        expect(getThemeChoices()[0].id).toBe(MATCH_SYSTEM_THEME_ID);
    });

    it("reports matching the system when it is on", () => {
        vi.spyOn(SettingsStore, "getValue").mockImplementation((name) => name === "use_system_theme");
        expect(getSelectedThemeChoice()).toBe(MATCH_SYSTEM_THEME_ID);
    });

    it("reports the normal theme for a high contrast one", () => {
        vi.spyOn(SettingsStore, "getValue").mockImplementation((name) =>
            name === "theme" ? "light-high-contrast" : false,
        );
        expect(getSelectedThemeChoice()).toBe("light");
    });

    it("turns matching the system on", async () => {
        const setValue = vi.spyOn(SettingsStore, "setValue").mockResolvedValue();
        await applyThemeChoice(MATCH_SYSTEM_THEME_ID);
        expect(setValue).toHaveBeenCalledWith("use_system_theme", null, SettingLevel.DEVICE, true);
    });

    it("sets a theme and turns matching the system off", async () => {
        const setValue = vi.spyOn(SettingsStore, "setValue").mockResolvedValue();
        const dispatch = vi.spyOn(dis, "dispatch").mockImplementation(() => {});
        await applyThemeChoice("dark");
        expect(dispatch).toHaveBeenCalledWith({ action: Action.RecheckTheme, forceTheme: "dark" });
        expect(setValue).toHaveBeenCalledWith("theme", null, SettingLevel.DEVICE, "dark");
        expect(setValue).toHaveBeenCalledWith("use_system_theme", null, SettingLevel.DEVICE, false);
    });

    it("rechecks the theme when saving fails", async () => {
        vi.spyOn(SettingsStore, "setValue").mockRejectedValue(new Error("nope"));
        const dispatch = vi.spyOn(dis, "dispatch").mockImplementation(() => {});
        await applyThemeChoice("dark");
        expect(dispatch).toHaveBeenLastCalledWith({ action: Action.RecheckTheme });
    });
});
