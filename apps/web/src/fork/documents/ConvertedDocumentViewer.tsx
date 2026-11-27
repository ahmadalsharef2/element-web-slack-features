/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, type MouseEvent, useCallback, useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { MarkdownViewerView, type DocumentViewerStatus } from "@element-hq/web-shared-components";

import { type DocumentMedia } from "../../@types/document-viewer";
import {
    attachImages,
    type ConvertedDocument,
    decodeText,
    docxToHtml,
    htmlFileToHtml,
    textToHtml,
} from "./documentToHtml";
import { tryTransformPermalinkToLocalHref } from "../../utils/permalinks/Permalinks";

const loggerViewer = logger.getChild("ConvertedDocumentViewer");

/**
 * Load an attachment, refusing it if the sender's declared size or the real size is over `maxBytes`.
 * The whole converted document sits in the DOM while it is open, and the sender chooses how big it is.
 */
export async function loadMediaBytes(media: DocumentMedia, maxBytes: number): Promise<ArrayBuffer> {
    // The declared size is the sender's claim, but a claim big enough to refuse saves the download.
    if (media.size !== undefined && media.size > maxBytes) throw new Error("Attachment is too large");

    const blob = await media.blob();
    if (blob.size === 0) throw new Error("Attachment is empty");
    if (blob.size > maxBytes) throw new Error("Attachment is too large");
    return blob.arrayBuffer();
}

interface Props {
    media: DocumentMedia;
    /** Largest file this viewer opens. */
    maxBytes: number;
    /** Turns the file into sanitized HTML. */
    convert: (buffer: ArrayBuffer) => Promise<ConvertedDocument> | ConvertedDocument;
}

/**
 * Shows an attachment converted to HTML, on the same view as Markdown documents. Links to rooms, users
 * and messages are followed within the app, as they are in the timeline.
 */
function ConvertedDocumentViewer({ media, maxBytes, convert }: Props): JSX.Element {
    const [status, setStatus] = useState<DocumentViewerStatus>("loading");
    const [html, setHtml] = useState("");

    useEffect(() => {
        setStatus("loading");
        setHtml("");

        let disposed = false;
        let objectUrls: string[] = [];

        const load = async (): Promise<void> => {
            const doc = await convert(await loadMediaBytes(media, maxBytes));
            if (disposed) return;

            const attached = attachImages(doc);
            objectUrls = attached.objectUrls;
            setHtml(attached.html);
            setStatus("ready");
        };

        void load().catch((error: unknown) => {
            if (disposed) return;
            loggerViewer.error("Unable to load document", error);
            setStatus("error");
        });

        return () => {
            disposed = true;
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [media, maxBytes, convert]);

    const onContentClick = useCallback((event: MouseEvent<HTMLDivElement>): void => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link) return;

        const localHref = tryTransformPermalinkToLocalHref(link.href);
        if (localHref !== link.href) {
            event.preventDefault();
            window.location.hash = localHref;
        }
    }, []);

    return <MarkdownViewerView status={status} html={html} onContentClick={onContentClick} />;
}

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_DOCX_BYTES = 20 * 1024 * 1024;

const convertText = (buffer: ArrayBuffer): ConvertedDocument => textToHtml(decodeText(buffer));
const convertHtml = (buffer: ArrayBuffer): ConvertedDocument => htmlFileToHtml(decodeText(buffer));

/** Shows a Word (.docx) attachment. */
export function WordViewer({ media }: { media: DocumentMedia }): JSX.Element {
    return <ConvertedDocumentViewer media={media} maxBytes={MAX_DOCX_BYTES} convert={docxToHtml} />;
}

/** Shows a web page attachment, without its scripts, styles or remote pictures. */
export function HtmlViewer({ media }: { media: DocumentMedia }): JSX.Element {
    return <ConvertedDocumentViewer media={media} maxBytes={MAX_TEXT_BYTES} convert={convertHtml} />;
}

/** Shows a plain text attachment. */
export function TextViewer({ media }: { media: DocumentMedia }): JSX.Element {
    return <ConvertedDocumentViewer media={media} maxBytes={MAX_TEXT_BYTES} convert={convertText} />;
}
