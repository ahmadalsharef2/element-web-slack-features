/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The address single sign-on returns to in the Android app. The sign-in page opens in the phone's browser, which
 * cannot reach the app's own `https://localhost` pages, so the homeserver sends the browser here instead and Android
 * hands the address to the app (see the intent filter in `apps/mobile/android/app/src/main/AndroidManifest.xml`).
 */
export const ANDROID_SSO_RETURN = "org.elementfork.app://sso/";

/** Whether the web app runs inside the Android app. */
export function isInAndroidApp(): boolean {
    return !!window.Capacitor?.Plugins?.App;
}

/**
 * The address inside the app that an SSO return address stands for: the app's own page with the same query (which
 * holds the `loginToken`) and fragment. Returns null for any other address.
 *
 * @param url - the address Android opened the app with.
 * @param appOrigin - the origin the app's pages are served from, such as `https://localhost`.
 */
export function appUrlForSsoReturn(url: string, appOrigin: string): string | null {
    if (!url.startsWith(ANDROID_SSO_RETURN)) return null;
    const ret = new URL(url);
    return `${appOrigin}/${ret.search}${ret.hash}`;
}

/**
 * Opens the app's page with the login token when the browser returns from single sign-on, whether the app was
 * still running or was started by the return. Outside the Android app this does nothing.
 */
export function listenForAndroidSsoReturn(): void {
    const app = window.Capacitor?.Plugins?.App;
    if (!app) return;

    const open = (url: string | undefined): void => {
        const target = url && appUrlForSsoReturn(url, window.location.origin);
        if (target && target !== window.location.href) window.location.href = target;
    };
    void app.addListener("appUrlOpen", ({ url }) => open(url));
    void app.getLaunchUrl().then((launch) => open(launch?.url));
}
