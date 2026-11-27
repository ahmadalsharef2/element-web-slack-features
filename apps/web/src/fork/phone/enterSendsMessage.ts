/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Whether the device is used by touch only, with no mouse or trackpad, as on a phone or tablet. On these the
 * on-screen keyboard's Enter key should start a new line, and messages are sent with the send button.
 */
export function isTouchOnlyDevice(): boolean {
    return globalThis.matchMedia?.("(pointer: coarse) and (hover: none)").matches ?? false;
}

/**
 * Whether Enter needs Ctrl (or Cmd) to send a message: either the user chose so in the settings, or the device is
 * touch only, where Enter on the on-screen keyboard should start a new line.
 *
 * @param ctrlEnterToSendSetting - the value of the `MessageComposerInput.ctrlEnterToSend` setting.
 */
export function isCtrlEnterToSend(ctrlEnterToSendSetting: boolean): boolean {
    return ctrlEnterToSendSetting || isTouchOnlyDevice();
}
