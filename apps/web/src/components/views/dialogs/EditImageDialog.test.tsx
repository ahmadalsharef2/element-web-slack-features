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
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy({}, { get: () => vi.fn() }) as unknown as CanvasRenderingContext2D,
        );
        vi.mocked(exportEditedImage).mockResolvedValue(edited);
    });

    afterEach(() => {
        window.Image = originalImage;
        vi.restoreAllMocks();
    });

    async function renderDialog(onFinished = vi.fn()) {
        const result = render(<EditImageDialog file={file} onFinished={onFinished} />);
        await waitFor(() =>
            expect(result.getByRole("button", { name: "Done" })).not.toHaveAttribute("aria-disabled", "true"),
        );
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

    it("writes text where the user taps", async () => {
        const { getByRole, getByLabelText, canvas, onFinished } = await renderDialog();
        fireEvent.click(getByRole("button", { name: "Text" }));
        fireEvent.click(getByRole("radio", { name: "#0074d0" }));
        fireEvent.pointerDown(canvas, { clientX: 50, clientY: 25 });

        const input = getByLabelText("Text", { selector: "input" });
        fireEvent.change(input, { target: { value: "  look here " } });
        fireEvent.keyDown(input, { key: "Enter" });
        fireEvent.click(getByRole("button", { name: "Done" }));

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith(edited));
        expect(vi.mocked(exportEditedImage).mock.calls[0][2]).toEqual([
            { kind: "text", color: "#0074d0", size: 10, at: { x: 100, y: 50 }, text: "look here" },
        ]);
    });
});
