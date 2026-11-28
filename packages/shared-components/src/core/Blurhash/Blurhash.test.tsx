/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@test-utils";

import { Blurhash } from "./Blurhash";

const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

/** The colour of the pixel at the centre of the canvas. */
function centrePixel(canvas: HTMLCanvasElement): number[] {
    return Array.from(canvas.getContext("2d")!.getImageData(16, 16, 1, 1).data);
}

describe("Blurhash", () => {
    it("sizes the placeholder and stretches a 32 by 32 canvas over it", () => {
        const { container } = render(<Blurhash className="placeholder" hash={HASH} width={200} height="50%" />);

        const wrapper = container.firstElementChild as HTMLDivElement;
        expect(wrapper).toHaveClass("placeholder");
        expect(wrapper.style.width).toBe("200px");
        expect(wrapper.style.height).toBe("50%");
        expect(wrapper.style.position).toBe("relative");

        const canvas = wrapper.querySelector("canvas")!;
        expect(canvas.width).toBe(32);
        expect(canvas.height).toBe(32);
        expect(canvas.style.width).toBe("100%");
    });

    it("draws the hash, and draws again when the hash changes", () => {
        const { container, rerender } = render(<Blurhash hash={HASH} width={32} height={32} />);
        const canvas = container.querySelector("canvas")!;

        const first = centrePixel(canvas);
        // Fully opaque means something was drawn; an empty canvas is transparent
        expect(first[3]).toBe(255);

        rerender(<Blurhash hash="L00000fQfQfQfQfQfQfQfQfQfQfQ" width={32} height={32} />);
        expect(centrePixel(canvas)).not.toEqual(first);
    });
});
