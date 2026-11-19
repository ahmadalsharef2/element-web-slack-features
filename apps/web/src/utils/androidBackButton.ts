/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The part of Capacitor's App plugin used here; the Android app (mobile/) provides it. */
interface CapacitorAppPlugin {
    addListener(event: "backButton", listener: () => void): Promise<{ remove(): Promise<void> }>;
    minimizeApp(): Promise<void>;
}

declare global {
    interface Window {
        Capacitor?: { Plugins?: { App?: CapacitorAppPlugin } };
    }
}

/**
 * Handles the Android back button when the app runs inside the Android app. `goBack` returns false when there is
 * nothing to go back to, and the app is then put in the background, as Android apps do. Outside the Android app
 * this does nothing. Returns a function that stops listening.
 */
export function onAndroidBackButton(goBack: () => boolean): () => void {
    const app = window.Capacitor?.Plugins?.App;
    if (!app) return () => {};

    const listener = app.addListener("backButton", () => {
        if (!goBack()) void app.minimizeApp();
    });
    return () => void listener.then((l) => l.remove());
}
