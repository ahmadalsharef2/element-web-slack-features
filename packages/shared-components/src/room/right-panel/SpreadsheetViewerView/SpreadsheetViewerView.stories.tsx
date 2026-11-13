/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpreadsheetViewerView, type SpreadsheetViewerViewProps } from "./SpreadsheetViewerView";

const sampleRows = [
    ["Region", "Quarter", "Revenue", "Notes"],
    ["North", "Q1", "12,400", ""],
    ["North", "Q2", "15,100", "New office opened"],
    ["South", "Q1", "9,800", "A longer note that wraps onto a second line inside the cell"],
    ["South", "Q2", "11,250"],
];

function SpreadsheetViewerStory(props: SpreadsheetViewerViewProps): JSX.Element {
    return (
        <div style={{ width: 420, height: 560 }}>
            <SpreadsheetViewerView {...props} />
        </div>
    );
}

const meta = {
    title: "Room/Right Panel/SpreadsheetViewerView",
    component: SpreadsheetViewerStory,
    tags: ["autodocs"],
    parameters: {
        layout: "centered",
    },
    argTypes: {
        status: {
            options: ["loading", "ready", "error"],
            control: { type: "select" },
        },
    },
    args: {
        status: "ready",
        sheetNames: ["Sheet1"],
        activeSheet: 0,
        rows: sampleRows,
        truncated: false,
        onSelectSheet: fn(),
    },
} satisfies Meta<typeof SpreadsheetViewerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Csv: Story = {};

export const SeveralSheets: Story = {
    args: {
        sheetNames: ["Revenue", "Costs", "Summary"],
    },
};

export const Truncated: Story = {
    args: {
        truncated: true,
    },
};

export const Loading: Story = {
    args: {
        status: "loading",
    },
};
