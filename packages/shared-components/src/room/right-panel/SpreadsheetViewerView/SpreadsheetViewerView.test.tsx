/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@test-utils";
import { describe, expect, it, vi } from "vitest";

import { SpreadsheetViewerView, type SpreadsheetViewerViewProps } from "./SpreadsheetViewerView";
import { I18nApi } from "../../../core/i18n/I18nApi";
import { I18nContext } from "../../../core/i18n/i18nContext";

const defaultProps: SpreadsheetViewerViewProps = {
    status: "ready",
    sheetNames: ["Sheet1"],
    activeSheet: 0,
    rows: [["Name", "Age"], ["Ada", "36"], ["Grace"]],
    truncated: false,
    onSelectSheet: () => {},
};

const renderView = (props: Partial<SpreadsheetViewerViewProps> = {}): ReturnType<typeof render> =>
    render(<SpreadsheetViewerView {...defaultProps} {...props} />, {
        wrapper: ({ children }) => <I18nContext.Provider value={new I18nApi()}>{children}</I18nContext.Provider>,
    });

describe("SpreadsheetViewerView", () => {
    it("shows the first row as the header and pads short rows", () => {
        renderView();

        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Name", "Age"]);
        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(3);
        expect(rows[2].querySelectorAll("td")).toHaveLength(2);
    });

    it("has no sheet buttons for a single sheet", () => {
        renderView();

        expect(screen.queryByRole("group", { name: "Sheets" })).not.toBeInTheDocument();
    });

    it("lets the user switch sheets", async () => {
        const user = userEvent.setup();
        const onSelectSheet = vi.fn();
        renderView({ sheetNames: ["One", "Two"], onSelectSheet });

        expect(screen.getByRole("button", { name: "One" })).toHaveAttribute("aria-pressed", "true");
        await user.click(screen.getByRole("button", { name: "Two" }));

        expect(onSelectSheet).toHaveBeenCalledWith(1);
    });

    it("says when only the first rows are shown", () => {
        renderView({ truncated: true });

        expect(screen.getByText(/Showing the first 3 rows/)).toBeInTheDocument();
    });

    it("says when the sheet is empty", () => {
        renderView({ rows: [] });

        expect(screen.getByText("This sheet is empty.")).toBeInTheDocument();
    });

    it("shows no table while loading", () => {
        renderView({ status: "loading" });

        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.queryByTestId("spreadsheet-content")).not.toBeInTheDocument();
    });
});
