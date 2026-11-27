/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type HtmlSanitizeAttributes, sanitizeHtml } from "@element-hq/element-web-shared-utils";
import escapeHtml from "escape-html";

import { sanitizeHtmlParams, transformTags } from "../../Linkify";

/** A converted document: sanitized HTML, and the pictures it refers to by placeholder URL. */
export interface ConvertedDocument {
    html: string;
    /** Placeholder URL in `html` → the picture's bytes. The viewer swaps each for an object URL. */
    images: Map<string, Blob>;
}

/** Decode file bytes as text, refusing files that are clearly binary. */
export function decodeText(buffer: ArrayBuffer): string {
    const text = new TextDecoder().decode(buffer);
    // Text never contains NUL, so a file that does was never text, whatever it was labelled.
    if (text.includes("\0")) throw new Error("Attachment is not a text file");
    return text;
}

/** Show plain text as it is, keeping line breaks and spacing. */
export function textToHtml(text: string): ConvertedDocument {
    return { html: `<pre>${escapeHtml(text)}</pre>`, images: new Map() };
}

/**
 * Show the body of a web page, through the same sanitizer as message bodies. Scripts, styles, forms and
 * remote pictures are dropped, so the page cannot run code or tell its author it was opened. Links open
 * in a new tab.
 */
export function htmlFileToHtml(source: string): ConvertedDocument {
    const doc = new DOMParser().parseFromString(source, "text/html");
    return { html: sanitizeHtml(doc.body.innerHTML, sanitizeHtmlParams), images: new Map() };
}

/**
 * Convert a Word (.docx) file to HTML. Formatting is reduced to structure (headings, lists, tables,
 * bold and so on), which is what the reader needs.
 *
 * The document's own pictures are given placeholder URLs with a random part the document cannot guess,
 * and handed back to be shown. Every other picture is dropped. The placeholders are on the reserved
 * `.invalid` domain, so one that is never swapped makes no request.
 */
export async function docxToHtml(buffer: ArrayBuffer): Promise<ConvertedDocument> {
    const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
    const images = new Map<string, Blob>();
    const prefix = `https://docx-image.invalid/${crypto.randomUUID()}/`;

    const result = await mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
            externalFileAccess: false,
            convertImage: mammoth.images.imgElement(async (image) => {
                const src = `${prefix}${images.size}`;
                images.set(src, new Blob([await image.readAsArrayBuffer()], { type: image.contentType }));
                return { src };
            }),
        },
    );

    return {
        html: sanitizeHtml(result.value, {
            transformTags: {
                ...transformTags,
                img: (tagName, attribs) => {
                    const kept: HtmlSanitizeAttributes = {};
                    if (attribs.src?.startsWith(prefix)) {
                        kept.src = attribs.src;
                        kept.alt = attribs.alt ?? "";
                    }
                    return { tagName, attribs: kept };
                },
            },
        }),
        images,
    };
}

/**
 * Swap the picture placeholders in a converted document for object URLs. Returns the HTML and the
 * URLs made, which the caller must revoke when it is done with them.
 */
export function attachImages(doc: ConvertedDocument): { html: string; objectUrls: string[] } {
    let html = doc.html;
    const objectUrls: string[] = [];
    for (const [placeholder, blob] of doc.images) {
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        html = html.split(`src="${placeholder}"`).join(`src="${url}"`);
    }
    return { html, objectUrls };
}
