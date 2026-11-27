/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";

import { HtmlViewer, TextViewer, WordViewer } from "./ConvertedDocumentViewer";
import { type DocumentMedia } from "../../@types/document-viewer";
import { stubClient } from "../../test/test-utils";

vi.mock("mammoth/mammoth.browser.min.js", () => {
    type ImageReader = (image: {
        contentType: string;
        readAsArrayBuffer: () => Promise<ArrayBuffer>;
    }) => Promise<{ src: string }>;
    const imgElement = (reader: ImageReader): ImageReader => reader;
    return {
        default: {
            images: { imgElement },
            convertToHtml: vi.fn(async (_input: unknown, options: { convertImage: ImageReader }) => {
                const { src } = await options.convertImage({
                    contentType: "image/png",
                    readAsArrayBuffer: async () => new ArrayBuffer(4),
                });
                return {
                    value: `<h1>Report</h1><p>Body</p><img src="${src}"><img src="https://tracker.example/pixel.png">`,
                    messages: [],
                };
            }),
        },
    };
});

function media(body: BlobPart, name: string, size?: number): DocumentMedia {
    return {
        uri: `mxc://example.org/${name}`,
        name,
        size,
        blob: vi.fn(async () => new Blob([body])),
    };
}

describe("ConvertedDocumentViewer", () => {
    beforeEach(() => {
        stubClient();
        URL.createObjectURL = vi.fn(() => "blob:local/1");
        URL.revokeObjectURL = vi.fn();
    });

    it("shows plain text as it is, without interpreting markup", async () => {
        render(<TextViewer media={media("line one\n<b>not bold</b>", "notes.txt")} />);

        expect(await screen.findByText(/line one/)).toBeInTheDocument();
        expect(screen.getByTestId("markdown-content").querySelector("b")).toBeNull();
        expect(screen.getByText(/<b>not bold<\/b>/)).toBeInTheDocument();
    });

    it("shows a web page without its scripts, styles or remote pictures", async () => {
        const page = `<html><head><title>Hidden</title><style>p{}</style></head><body>
            <h1>Welcome</h1><script>window.pwned = true</script>
            <img src="https://tracker.example/pixel.png"><p onclick="alert(1)">Text</p></body></html>`;
        render(<HtmlViewer media={media(page, "page.html")} />);

        expect(await screen.findByRole("heading", { name: "Welcome" })).toBeInTheDocument();
        const content = screen.getByTestId("markdown-content");
        expect(content.querySelector("script, style, img[src]")).toBeNull();
        expect(content.querySelector("p")?.getAttribute("onclick")).toBeNull();
        expect(content.textContent).not.toContain("Hidden");
    });

    it("shows a Word document with its own pictures and drops remote ones", async () => {
        const { unmount } = render(<WordViewer media={media("PK", "report.docx")} />);

        expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument();
        const images = screen.getByTestId("markdown-content").querySelectorAll("img");
        expect(Array.from(images, (img) => img.getAttribute("src"))).toEqual(["blob:local/1", null]);

        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local/1");
    });

    it("refuses a file the sender declares as too large without downloading it", async () => {
        const tooLarge = media("x", "huge.txt", 50 * 1024 * 1024);
        render(<TextViewer media={tooLarge} />);

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to load this file."));
        expect(tooLarge.blob).not.toHaveBeenCalled();
    });

    it("shows an error for a binary file sent as text", async () => {
        render(<TextViewer media={media("a\0b", "notes.txt")} />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load this file.");
    });
});
