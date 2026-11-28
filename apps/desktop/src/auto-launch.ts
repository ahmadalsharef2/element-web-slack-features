/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import BaseAutoLaunch from "auto-launch";

import Store from "./store.js";
import { getConfig } from "./config.js";

export type AutoLaunchState = "enabled" | "minimised" | "disabled";

// Element Fork: auto-launch takes `isHidden` only when it is created, so make a new one for each change rather than
// patching its types to reach the private option.
function makeAutoLaunch(isHidden: boolean): BaseAutoLaunch {
    return new BaseAutoLaunch({
        name: getConfig().brand,
        isHidden,
        mac: {
            useLaunchAgent: true,
        },
    });
}

// Wrapper around auto-launch that remembers whether to start minimised
export class AutoLaunch {
    private static internalInstance?: AutoLaunch;

    public static get instance(): AutoLaunch {
        if (!AutoLaunch.internalInstance) {
            if (!Store.instance) throw new Error("Store not initialized");
            AutoLaunch.internalInstance = new AutoLaunch();
        }
        return AutoLaunch.internalInstance;
    }

    public async getState(): Promise<AutoLaunchState> {
        const minimised = Store.instance?.get("openAtLoginMinimised") ?? false;
        if (!(await makeAutoLaunch(minimised).isEnabled())) {
            return "disabled";
        }
        return minimised ? "minimised" : "enabled";
    }

    public async setState(state: AutoLaunchState): Promise<void> {
        const openAtLoginMinimised = state === "minimised";
        Store.instance?.set("openAtLoginMinimised", openAtLoginMinimised);

        const autoLaunch = makeAutoLaunch(openAtLoginMinimised);
        if (state !== "disabled") {
            return autoLaunch.enable();
        } else {
            return autoLaunch.disable();
        }
    }
}
