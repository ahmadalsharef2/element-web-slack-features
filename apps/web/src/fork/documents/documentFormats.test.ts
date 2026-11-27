/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { EventType, MatrixEvent, MsgType } from "matrix-js-sdk/src/matrix";

import { CSV_FORMAT, DOCX_FORMAT, isDocumentFormatEvent, TEXT_FORMAT, XLSX_FORMAT } from "./documentFormats";

function mkFileEvent(body: string, mimetype?: string): MatrixEvent {
    return new MatrixEvent({
        room_id: "!room:example.org",
        sender: "@user:example.org",
        type: EventType.RoomMessage,
        content: { body, msgtype: MsgType.File, url: "mxc://example.org/file", info: { mimetype } },
    });
}

describe("isDocumentFormatEvent", () => {
    it("accepts a listed mimetype whatever the file is called", () => {
        expect(isDocumentFormatEvent(mkFileEvent("export", "text/csv; charset=utf-8"), CSV_FORMAT)).toBe(true);
    });

    it("falls back to the extension for a generic or missing mimetype", () => {
        expect(isDocumentFormatEvent(mkFileEvent("Data.CSV", "application/octet-stream"), CSV_FORMAT)).toBe(true);
        expect(isDocumentFormatEvent(mkFileEvent("data.tsv"), CSV_FORMAT)).toBe(true);
        expect(isDocumentFormatEvent(mkFileEvent("data.bin"), CSV_FORMAT)).toBe(false);
    });

    it("trusts the extension for mimetypes senders are known to get wrong", () => {
        expect(isDocumentFormatEvent(mkFileEvent("data.csv", "application/vnd.ms-excel"), CSV_FORMAT)).toBe(true);
        expect(isDocumentFormatEvent(mkFileEvent("a.docx", "application/zip"), DOCX_FORMAT)).toBe(true);
        expect(isDocumentFormatEvent(mkFileEvent("a.xlsx", "application/zip"), XLSX_FORMAT)).toBe(true);
    });

    it("does not trust the extension when the mimetype says something else", () => {
        expect(isDocumentFormatEvent(mkFileEvent("a.docx", "application/pdf"), DOCX_FORMAT)).toBe(false);
        expect(isDocumentFormatEvent(mkFileEvent("a.txt", "image/png"), TEXT_FORMAT)).toBe(false);
    });

    it("ignores events that are not media", () => {
        const event = new MatrixEvent({
            type: EventType.RoomMessage,
            content: { body: "data.csv", msgtype: MsgType.Text },
        });
        expect(isDocumentFormatEvent(event, CSV_FORMAT)).toBe(false);
    });
});
