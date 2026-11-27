/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { _t } from "../../languageHandler";
import { Action } from "../../dispatcher/actions";
import dis from "../../dispatcher/dispatcher";
import { type RecheckThemePayload } from "../../dispatcher/payloads/RecheckThemePayload";
import { SettingLevel } from "../../settings/SettingLevel";
import SettingsStore from "../../settings/SettingsStore";
import { findNonHighContrastTheme, getOrderedThemes } from "../../theme";

/** Choice that follows the system's light/dark setting instead of naming a theme. */
export const MATCH_SYSTEM_THEME_ID = "MATCH_SYSTEM_THEME_ID";

/** The themes to offer in the user menu, with "match system" first. */
export function getThemeChoices(): { id: string; name: string }[] {
    return [{ id: MATCH_SYSTEM_THEME_ID, name: _t("theme|match_system") }, ...getOrderedThemes()];
}

/** The choice that is active on this device. High contrast variants count as their normal theme. */
export function getSelectedThemeChoice(): string {
    if (SettingsStore.getValue("use_system_theme")) return MATCH_SYSTEM_THEME_ID;
    const theme = SettingsStore.getValue("theme");
    return findNonHighContrastTheme(theme) ?? theme;
}

/** Switches the theme on this device. */
export async function applyThemeChoice(choice: string): Promise<void> {
    try {
        if (choice === MATCH_SYSTEM_THEME_ID) {
            await SettingsStore.setValue("use_system_theme", null, SettingLevel.DEVICE, true);
            return;
        }
        // The settings watcher only fires once the change is saved, so ask for the new theme straight away
        dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme, forceTheme: choice });
        await Promise.all([
            SettingsStore.setValue("theme", null, SettingLevel.DEVICE, choice),
            SettingsStore.setValue("use_system_theme", null, SettingLevel.DEVICE, false),
        ]);
    } catch {
        dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme });
    }
}
