/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button } from "@vector-im/compound-web";

import { useI18n } from "../../../core/i18n/i18nContext";
import { DocumentViewerView, type DocumentViewerStatus } from "../DocumentViewerView";
import styles from "./SpreadsheetViewerView.module.css";

/** Props for {@link SpreadsheetViewerView}. */
export interface SpreadsheetViewerViewProps {
    /** The lifecycle state currently presented. */
    status: DocumentViewerStatus;
    /** Names of the sheets in the file. A CSV file has one sheet and no names are shown for it. */
    sheetNames: string[];
    /** Index into `sheetNames` of the sheet shown. */
    activeSheet: number;
    /** The cells of the active sheet, row by row. The first row is shown as the header. */
    rows: string[][];
    /** Whether `rows` stops short of the end of the sheet. */
    truncated: boolean;
    /** Called when the user picks another sheet. */
    onSelectSheet: (index: number) => void;
    /** Optional CSS class for host-level styling, applied to the outer element. */
    className?: string;
}

/**
 * Shows a spreadsheet or CSV file as a table, with a button per sheet when there is more than one.
 * The host reads the file; the view only lays out the cells.
 */
export function SpreadsheetViewerView({
    status,
    sheetNames,
    activeSheet,
    rows,
    truncated,
    onSelectSheet,
    className,
}: Readonly<SpreadsheetViewerViewProps>): JSX.Element {
    const { translate: _t } = useI18n();

    const toolbar =
        sheetNames.length > 1 ? (
            <div className={styles.sheets} role="group" aria-label={_t("document_viewer|sheets")}>
                {sheetNames.map((name, index) => (
                    <Button
                        // A workbook cannot have two sheets of the same name
                        key={name}
                        size="md"
                        kind={index === activeSheet ? "primary" : "tertiary"}
                        aria-pressed={index === activeSheet}
                        onClick={() => onSelectSheet(index)}
                    >
                        {name}
                    </Button>
                ))}
            </div>
        ) : undefined;

    // Rows can be ragged; pad them so every row has a cell under every header.
    const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const [header, ...body] = rows;

    return (
        <DocumentViewerView status={status} toolbar={toolbar} className={className}>
            {status === "ready" ? (
                <div className={styles.content} data-testid="spreadsheet-content">
                    {rows.length === 0 ? (
                        <p className={styles.empty}>{_t("document_viewer|empty_sheet")}</p>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {Array.from({ length: columns }, (_, c) => (
                                        <th key={c} dir="auto">
                                            {header[c] ?? ""}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {body.map((row, r) => (
                                    // Rows have no identity but their place, and the table is only ever replaced whole
                                    // oxlint-disable-next-line react/no-array-index-key
                                    <tr key={r}>
                                        {Array.from({ length: columns }, (_, c) => (
                                            <td key={c} dir="auto">
                                                {row[c] ?? ""}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {truncated ? (
                        <p className={styles.truncated}>
                            {_t("document_viewer|rows_truncated", { count: rows.length })}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </DocumentViewerView>
    );
}
