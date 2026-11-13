/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { type FileContent, type MediaEventContent } from "matrix-js-sdk/src/types";

import { MediaEventHelper } from "./MediaEventHelper";

/** How to recognise one kind of attachment. */
interface DocumentFormat {
    mimetypes: string[];
    extensions: string[];
    /**
     * Other mimetypes senders wrongly give this format. With one of these, as with a generic mimetype,
     * the file name decides.
     */
    looseMimetypes?: string[];
}

/** Mimetypes handed out for files the sender's device did not recognise. The file name is a better guide. */
const GENERIC_MIMETYPES = ["text/plain", "application/octet-stream", ""];

export const CSV_FORMAT: DocumentFormat = {
    mimetypes: ["text/csv", "application/csv", "text/comma-separated-values", "text/tab-separated-values"],
    extensions: [".csv", ".tsv"],
    // Windows labels CSV files as Excel files when Excel is installed.
    looseMimetypes: ["application/vnd.ms-excel"],
};

export const XLSX_FORMAT: DocumentFormat = {
    mimetypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: [".xlsx"],
    looseMimetypes: ["application/zip", "application/x-zip-compressed"],
};

export const DOCX_FORMAT: DocumentFormat = {
    mimetypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
    looseMimetypes: ["application/zip", "application/x-zip-compressed"],
};

export const HTML_FORMAT: DocumentFormat = {
    mimetypes: ["text/html", "application/xhtml+xml"],
    extensions: [".html", ".htm", ".xhtml"],
};

export const TEXT_FORMAT: DocumentFormat = {
    mimetypes: ["text/plain"],
    extensions: [".txt", ".log", ".text"],
};

function fileName(content: FileContent): string {
    return (content.filename || content.body || "").toLowerCase();
}

/**
 * Whether the event carries a file of the given format. A listed mimetype is enough. Failing that, the
 * file extension counts when the mimetype is missing, generic, or one senders are known to get wrong.
 * Parameters after the type (`text/csv; charset=utf-8`) are ignored.
 */
export function isDocumentFormatEvent(mxEvent: MatrixEvent, format: DocumentFormat): boolean {
    if (!MediaEventHelper.isEligible(mxEvent)) return false;

    const content = mxEvent.getContent<MediaEventContent & FileContent>();
    const mimetype = content.info?.mimetype?.split(";")[0].trim().toLowerCase() ?? "";
    if (format.mimetypes.includes(mimetype)) return true;
    if (!GENERIC_MIMETYPES.includes(mimetype) && !format.looseMimetypes?.includes(mimetype)) return false;

    const name = fileName(content);
    return format.extensions.some((extension) => name.endsWith(extension));
}
