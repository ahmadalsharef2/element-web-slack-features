/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, waitFor } from "test-utils-rtl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditImageDialog from "./EditImageDialog";
import { exportEditedImage } from "../../../utils/imageEdit";

vi.mock("../../../utils/imageEdit", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../utils/imageEdit")>()),
    exportEditedImage: vi.fn(),
}));

/** happy-dom never loads pictures; this one loads straight away at 200 × 100. */
class MockImage {
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public naturalWidth = 200;
    public naturalHeight = 100;
    public set src(_: string) {
        setTimeout(() => this.onload?.(), 0);
    }
}

describe("<EditImageDialog />", () => {
    const originalImage = window.Image;
    const file = new File(["x"], "photo.png", { type: "image/png" });
    const edited = new File(["y"], "photo.png", { type: "image/png" });

    beforeEach(() => {
        window.Image = MockImage as unknown as typeof window.Image;
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        // Shown at half size, so a point on screen is twice as far in the picture
        vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 50,
        } as DOMRect);
        // Every letter is 6 picture pixels wide, so text boxes can be measured
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                {},
                {
                    get: (_, prop) =>
                        prop === "measureText" ? (text: string) => ({ width: text.length * 6 }) : vi.fn(),
                },
            ) as unknown as CanvasRenderingContext2D,
        );
        vi.mocked(exportEditedImage).mockResolvedValue(edited);
    });

    afterEach(() => {
        window.Image = originalImage;
        vi.restoreAllMocks();
    });

    async function renderDialog(onFinished = vi.fn()) {
        const result = render(<EditImageDialog file={file} onFinished={onFinished} />);
        // Done is disabled until the picture has loaded
        await waitFor(() => expect(result.getByRole("button", { name: "Done" })).toBeEnabled());
        return { ...result, onFinished, canvas: result.getByLabelText("Picture being edited") };
    }

    it("returns nothing when Done is pressed without edits", async () => {
        const { getByRole, onFinished } = await renderDialog();
        fireEvent.click(getByRole("button", { name: "Done" }));
        await waitFor(() => expect(onFinished).toHaveBeenCalledWith());
        expect(exportEditedImage).not.toHaveBeenCalled();
    });

    it("returns nothing when cancelled", async () => {
        const { getByRole, onFinished } = await renderDialog();
        fireEvent.click(getByRole("button", { name: "Cancel" }));
        expect(onFinished).toHaveBeenCalledWith();
    });

    it("draws with the pen in the picture's own pixels", async () => {
        const { getByRole, canvas, onFinished } = await renderDialog();
        fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
        fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
        fireEvent.pointerUp(canvas);
        fireEvent.click(getByRole("button", { name: "Done" }));

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(edited));
        const [, , marks, crop] = vi.mocked(exportEditedImage).mock.calls[0];
        expect(marks).toEqual([
            expect.objectContaining({
                kind: "pen",
                points: [
                    { x: 20, y: 20 },
                    { x: 40, y: 40 },
                ],
            }),
        ]);
        expect(crop).toBeNull();
    });

    it("crops, and undo takes the crop away again", async () => {
        const { getByRole, canvas, onFinished } = await renderDialog();
        const drag = (): void => {
            fireEvent.pointerDown(canvas, { clientX: 10, clientY: 5 });
            fireEvent.pointerMove(canvas, { clientX: 60, clientY: 30 });
            fireEvent.pointerUp(canvas);
        };
        fireEvent.click(getByRole("button", { name: "Crop" }));
        expect(getByRole("button", { name: "Crop" })).toHaveAttribute("aria-pressed", "true");

        drag();
        fireEvent.click(getByRole("button", { name: "Undo" }));
        expect(getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");

        drag();
        fireEvent.click(getByRole("button", { name: "Done" }));
        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(edited));
        expect(vi.mocked(exportEditedImage).mock.calls[0][3]).toEqual({ x: 20, y: 10, width: 100, height: 50 });
    });

    describe("text", () => {
        /** Types text at a point on screen and finishes it with Enter. */
        function addText(
            { getByLabelText, canvas }: Awaited<ReturnType<typeof renderDialog>>,
            x: number,
            y: number,
            value: string,
        ): void {
            fireEvent.pointerDown(canvas, { clientX: x, clientY: y });
            const input = getByLabelText("Text", { selector: "input" });
            fireEvent.change(input, { target: { value } });
            fireEvent.keyDown(input, { key: "Enter" });
        }

        async function sentMarks(dialog: Awaited<ReturnType<typeof renderDialog>>): Promise<unknown> {
            fireEvent.click(dialog.getByRole("button", { name: "Done" }));
            await waitFor(() => expect(dialog.onFinished).toHaveBeenCalled());
            return vi.mocked(exportEditedImage).mock.calls[0]?.[2];
        }

        it("writes text centred on the tap, in the chosen colour and size", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            fireEvent.click(dialog.getByRole("radio", { name: "#0074d0" }));
            fireEvent.click(dialog.getByRole("radio", { name: "Large" }));
            // 50, 25 on screen is 100, 50 in the picture; large text is 200 / 12 picture pixels tall
            addText(dialog, 50, 25, "  look here ");

            expect(await sentMarks(dialog)).toEqual([
                {
                    kind: "text",
                    color: "#0074d0",
                    size: expect.closeTo(200 / 12),
                    at: { x: 100, y: expect.closeTo(50 - 200 / 24) },
                    text: "look here",
                },
            ]);
        });

        it("moves text that is dragged", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            addText(dialog, 50, 25, "hi");
            // The text starts at 100, 45 in the picture; drag it 20 picture pixels right and 10 down
            fireEvent.pointerDown(dialog.canvas, { clientX: 51, clientY: 25 });
            fireEvent.pointerMove(dialog.canvas, { clientX: 61, clientY: 30 });
            fireEvent.pointerUp(dialog.canvas);

            expect(await sentMarks(dialog)).toEqual([expect.objectContaining({ text: "hi", at: { x: 120, y: 55 } })]);
        });

        it("opens text that is tapped, to change it", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            addText(dialog, 50, 25, "hi");
            fireEvent.pointerDown(dialog.canvas, { clientX: 51, clientY: 25 });
            fireEvent.pointerUp(dialog.canvas);

            const input = dialog.getByLabelText("Text", { selector: "input" });
            expect(input).toHaveValue("hi");
            fireEvent.click(dialog.getByRole("radio", { name: "#000000" }));
            fireEvent.change(input, { target: { value: "hello" } });
            fireEvent.keyDown(input, { key: "Enter" });

            expect(await sentMarks(dialog)).toEqual([
                expect.objectContaining({ text: "hello", color: "#000000", at: { x: 100, y: 45 } }),
            ]);
        });

        it("removes text with Remove text", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            addText(dialog, 50, 25, "hi");
            fireEvent.pointerDown(dialog.canvas, { clientX: 51, clientY: 25 });
            fireEvent.pointerUp(dialog.canvas);
            fireEvent.click(dialog.getByRole("button", { name: "Remove text" }));

            // Nothing is left to change, so the picture is not re-saved
            await sentMarks(dialog);
            expect(dialog.onFinished).toHaveBeenCalledWith();
        });

        it("finishes the text being typed with a tap elsewhere, and keeps it when Escape is pressed", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            fireEvent.pointerDown(dialog.canvas, { clientX: 10, clientY: 10 });
            fireEvent.change(dialog.getByLabelText("Text", { selector: "input" }), { target: { value: "one" } });
            fireEvent.pointerDown(dialog.canvas, { clientX: 80, clientY: 40 });
            expect(dialog.queryByLabelText("Text", { selector: "input" })).toBeNull();

            fireEvent.pointerDown(dialog.canvas, { clientX: 80, clientY: 40 });
            const input = dialog.getByLabelText("Text", { selector: "input" });
            fireEvent.change(input, { target: { value: "two" } });
            fireEvent.keyDown(input, { key: "Escape" });
            expect(dialog.onFinished).not.toHaveBeenCalled();

            expect(await sentMarks(dialog)).toEqual([expect.objectContaining({ text: "one" })]);
        });

        it("counts text still being typed when Done is pressed", async () => {
            const dialog = await renderDialog();
            fireEvent.click(dialog.getByRole("button", { name: "Text" }));
            fireEvent.pointerDown(dialog.canvas, { clientX: 10, clientY: 10 });
            fireEvent.change(dialog.getByLabelText("Text", { selector: "input" }), { target: { value: "late" } });

            expect(await sentMarks(dialog)).toEqual([expect.objectContaining({ text: "late" })]);
        });
    });
});
