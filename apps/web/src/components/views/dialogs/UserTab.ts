/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export enum UserTab {
    Account = "USER_ACCOUNT_TAB",
    Appearance = "USER_APPEARANCE_TAB",
    Notifications = "USER_NOTIFICATIONS_TAB",
    Preferences = "USER_PREFERENCES_TAB",
    Keyboard = "USER_KEYBOARD_TAB",
    Sidebar = "USER_SIDEBAR_TAB",
    Voice = "USER_VOICE_TAB",
    Security = "USER_SECURITY_TAB",
    Encryption = "USER_ENCRYPTION_TAB",
    Labs = "USER_LABS_TAB",
    Mjolnir = "USER_MJOLNIR_TAB",
    Help = "USER_HELP_TAB",
    SessionManager = "USER_SESSION_MANAGER_TAB",
    /** Element Fork: not a tab with a body, but the entry that shows or hides the advanced tabs */
    AdvancedToggle = "USER_ADVANCED_TOGGLE",
}
