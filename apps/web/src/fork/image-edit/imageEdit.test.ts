/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    drawMarks,
    exportEditedImage,
    findTextAt,
    isEditableImage,
    type Mark,
    rectBetween,
    textBox,
} from "./imageEdit";

/** A 2D context that records the calls made to it. */
function mockContext(): CanvasRenderingContext2D {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeText: vi.fn(),
        fillText: vi.fn(),
        translate: vi.fn(),
        drawImage: vi.fn(),
        // Every letter is 6 pixels wide
        measureText: (text: string) => ({ width: text.length * 6 }),
    } as unknown as CanvasRenderingContext2D;
}

describe("isEditableImage", () => {
    it.each([
        ["image/png", true],
        ["image/jpeg", true],
        ["image/webp", true],
        ["image/gif", false],
        ["video/mp4", false],
    ])("%s → %s", (type, expected) => {
        expect(isEditableImage(new File(["x"], "f", { type }))).toBe(expected);
    });
});

describe("rectBetween", () => {
    it("works whichever way the drag went", () => {
        expect(rectBetween({ x: 50, y: 60 }, { x: 10, y: 20 }, 100, 100)).toEqual({
            x: 10,
            y: 20,
            width: 40,
            height: 40,
        });
    });

    it("stays inside the picture", () => {
        expect(rectBetween({ x: -10, y: -10 }, { x: 150, y: 80 }, 100, 100)).toEqual({
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        });
    });
});

describe("drawMarks", () => {
    it("draws a stroke through all its points", () => {
        const ctx = mockContext();
        drawMarks(ctx, [
            {
                kind: "pen",
                color: "#e0272c",
                width: 4,
                points: [
                    { x: 1, y: 2 },
                    { x: 3, y: 4 },
                ],
            },
        ]);
        expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
        expect(ctx.lineTo).toHaveBeenCalledWith(3, 4);
        expect(ctx.stroke).toHaveBeenCalledTimes(1);
        expect(ctx.strokeStyle).toBe("#e0272c");
    });

    it("draws highlights see-through", () => {
        const ctx = mockContext();
        drawMarks(ctx, [{ kind: "highlight", color: "#ffd60a", width: 20, points: [{ x: 1, y: 1 }] }]);
        expect(ctx.globalAlpha).toBe(0.4);
        // A single point still leaves a mark
        expect(ctx.lineTo).toHaveBeenCalledTimes(1);
    });

    it("writes text with an outline", () => {
        const ctx = mockContext();
        drawMarks(ctx, [{ kind: "text", color: "#000000", size: 24, at: { x: 5, y: 6 }, text: "hi" }]);
        expect(ctx.fillText).toHaveBeenCalledWith("hi", 5, 6);
        expect(ctx.strokeText).toHaveBeenCalledWith("hi", 5, 6);
        expect(ctx.font).toBe("bold 24px sans-serif");
    });
});

describe("text boxes", () => {
    const hello: Mark = { kind: "text", color: "#000000", size: 30, at: { x: 10, y: 20 }, text: "hello" };
    const stroke: Mark = { kind: "pen", color: "#000000", width: 4, points: [{ x: 15, y: 25 }] };

    it("measures the text", () => {
        expect(textBox(mockContext(), hello as Extract<Mark, { kind: "text" }>)).toEqual({
            x: 10,
            y: 20,
            width: 30,
            height: 36,
        });
    });

    it("finds the text under a point, with a little room around it", () => {
        const ctx = mockContext();
        expect(findTextAt(ctx, [hello], { x: 25, y: 30 })).toBe(0);
        expect(findTextAt(ctx, [hello], { x: 5, y: 15 })).toBe(0);
        expect(findTextAt(ctx, [hello], { x: 80, y: 30 })).toBeNull();
    });

    it("prefers the text drawn last, and skips strokes", () => {
        const ctx = mockContext();
        expect(findTextAt(ctx, [hello, stroke, { ...hello, text: "over" }], { x: 15, y: 25 })).toBe(2);
        expect(findTextAt(ctx, [stroke], { x: 15, y: 25 })).toBeNull();
    });
});

describe("exportEditedImage", () => {
    afterEach(() => vi.restoreAllMocks());

    it("cuts to the crop and keeps the name and type", async () => {
        const ctx = mockContext();
        const canvas = {
            width: 0,
            height: 0,
            getContext: () => ctx,
            toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(["out"], { type })),
        };
        const createElement = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
            tag === "canvas" ? canvas : createElement(tag)) as typeof document.createElement);

        const image = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;
        const file = new File(["in"], "photo.jpg", { type: "image/jpeg" });
        const result = await exportEditedImage(image, file, [], { x: 10, y: 20, width: 50, height: 40 });

        expect(canvas.width).toBe(50);
        expect(canvas.height).toBe(40);
        expect(ctx.translate).toHaveBeenCalledWith(-10, -20);
        expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0);
        expect(result.name).toBe("photo.jpg");
        expect(result.type).toBe("image/jpeg");
    });
});
