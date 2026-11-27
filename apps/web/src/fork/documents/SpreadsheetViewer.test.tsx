/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";

import { CsvViewer, MAX_ROWS, readCsv, XlsxViewer } from "./SpreadsheetViewer";
import { type DocumentMedia } from "../../@types/document-viewer";

vi.mock("read-excel-file/browser", () => ({
    default: vi.fn(async () => [
        {
            sheet: "Revenue",
            data: [
                ["Region", "Total"],
                ["North", 12],
                ["South", null],
            ],
        },
        { sheet: "Dates", data: [["When"], [new Date(2026, 0, 2)]] },
    ]),
}));

function media(body: BlobPart, name: string): DocumentMedia {
    return { uri: `mxc://example.org/${name}`, name, blob: async () => new Blob([body]) };
}

describe("SpreadsheetViewer", () => {
    it("shows a CSV file as a table", async () => {
        render(<CsvViewer media={media("name;age\nAda;36\n", "people.csv")} />);

        expect(await screen.findByRole("columnheader", { name: "name" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
    });

    it("shows each sheet of a workbook, with a button to switch", async () => {
        const user = userEvent.setup();
        render(<XlsxViewer media={media("PK", "budget.xlsx")} />);

        expect(await screen.findByRole("cell", { name: "12" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Dates" }));

        expect(screen.getByRole("columnheader", { name: "When" })).toBeInTheDocument();
        expect(screen.getByRole("cell", { name: new Date(2026, 0, 2).toLocaleDateString() })).toBeInTheDocument();
    });

    it("stops at the row limit", () => {
        const csv = Array.from({ length: MAX_ROWS + 5 }, (_, i) => String(i)).join("\n");
        const [sheet] = readCsv(new TextEncoder().encode(csv).buffer);

        expect(sheet.rows).toHaveLength(MAX_ROWS);
        expect(sheet.truncated).toBe(true);
    });
});
