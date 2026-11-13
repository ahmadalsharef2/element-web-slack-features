/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";

import CompressVideoDialog from "./CompressVideoDialog";
import { compressVideo } from "../../../utils/compressVideo";

vi.mock("../../../utils/compressVideo", () => ({ compressVideo: vi.fn() }));

const first = new File(["aaaa"], "first.mov", { type: "video/quicktime" });
const second = new File(["bbbb"], "second.mp4", { type: "video/mp4" });
const smaller = new File(["a"], "first.mp4", { type: "video/mp4" });

describe("CompressVideoDialog", () => {
    it("works through the videos and reports which could be made small enough", async () => {
        vi.mocked(compressVideo)
            .mockImplementationOnce((_file, _limit, onProgress) => {
                onProgress?.(0.5);
                return { result: Promise.resolve(smaller), cancel: vi.fn() };
            })
            .mockReturnValueOnce({ result: Promise.resolve(null), cancel: vi.fn() });
        const onFinished = vi.fn();

        render(<CompressVideoDialog videos={[first, second]} limit={2} onFinished={onFinished} />);

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith({ compressed: [smaller], failed: [second] }));
    });

    it("counts a failed compression as not small enough", async () => {
        vi.mocked(compressVideo).mockReturnValueOnce({ result: Promise.reject(new Error("boom")), cancel: vi.fn() });
        const onFinished = vi.fn();

        render(<CompressVideoDialog videos={[first]} limit={2} onFinished={onFinished} />);

        await waitFor(() => expect(onFinished).toHaveBeenCalledWith({ compressed: [], failed: [first] }));
    });

    it("stops the work when cancelled", async () => {
        const user = userEvent.setup();
        const cancel = vi.fn();
        vi.mocked(compressVideo).mockReturnValueOnce({ result: new Promise(() => {}), cancel });
        const onFinished = vi.fn();

        render(<CompressVideoDialog videos={[first]} limit={2} onFinished={onFinished} />);
        expect(screen.getByText("Making video smaller")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(cancel).toHaveBeenCalled();
        expect(onFinished).toHaveBeenCalledWith();
    });
});
