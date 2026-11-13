/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// The prebuilt browser bundle of mammoth, which needs none of the Node built-ins the main entry imports.
declare module "mammoth/mammoth.browser.min.js" {
    import mammoth from "mammoth";
    export = mammoth;
}
