/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { type DocumentViewerStatus, SpreadsheetViewerView } from "@element-hq/web-shared-components";

import { type DocumentMedia } from "../../../@types/document-viewer";
import { parseCsv } from "../../../utils/parseCsv";
import { decodeText } from "../../../utils/documentToHtml";
import { loadMediaBytes } from "./ConvertedDocumentViewer";

const loggerSheet = logger.getChild("SpreadsheetViewer");

/** Rows shown per sheet. More would make the panel slow, and nobody reads that far in a preview. */
export const MAX_ROWS = 2000;
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_XLSX_BYTES = 10 * 1024 * 1024;

/** One sheet, ready to show. */
export interface SheetTable {
    name: string;
    rows: string[][];
    truncated: boolean;
}

/** Show a cell value the way a reader expects it: dates as dates, nothing for empty cells. */
function cellText(value: unknown): string {
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

/** Read a CSV or TSV file into a single sheet. */
export function readCsv(buffer: ArrayBuffer): SheetTable[] {
    const { rows, truncated } = parseCsv(decodeText(buffer), undefined, MAX_ROWS);
    return [{ name: "", rows, truncated }];
}

/** Read every sheet of an Excel (.xlsx) workbook. */
export async function readXlsx(buffer: ArrayBuffer): Promise<SheetTable[]> {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(new Blob([buffer]));
    return sheets.map(({ sheet, data }) => ({
        name: sheet,
        rows: data.slice(0, MAX_ROWS).map((row) => row.map(cellText)),
        truncated: data.length > MAX_ROWS,
    }));
}

interface Props {
    media: DocumentMedia;
    maxBytes: number;
    read: (buffer: ArrayBuffer) => Promise<SheetTable[]> | SheetTable[];
}

function SpreadsheetViewer({ media, maxBytes, read }: Props): JSX.Element {
    const [status, setStatus] = useState<DocumentViewerStatus>("loading");
    const [sheets, setSheets] = useState<SheetTable[]>([]);
    const [activeSheet, setActiveSheet] = useState(0);

    useEffect(() => {
        setStatus("loading");
        setSheets([]);
        setActiveSheet(0);

        let disposed = false;
        const load = async (): Promise<void> => {
            const result = await read(await loadMediaBytes(media, maxBytes));
            if (disposed) return;
            setSheets(result);
            setStatus("ready");
        };
        void load().catch((error: unknown) => {
            if (disposed) return;
            loggerSheet.error("Unable to load spreadsheet", error);
            setStatus("error");
        });

        return () => {
            disposed = true;
        };
    }, [media, maxBytes, read]);

    const sheet = sheets[activeSheet];
    return (
        <SpreadsheetViewerView
            status={status}
            sheetNames={sheets.map((s) => s.name)}
            activeSheet={activeSheet}
            rows={sheet?.rows ?? []}
            truncated={sheet?.truncated ?? false}
            onSelectSheet={setActiveSheet}
        />
    );
}

/** Shows a CSV or TSV attachment as a table. */
export function CsvViewer({ media }: { media: DocumentMedia }): JSX.Element {
    return <SpreadsheetViewer media={media} maxBytes={MAX_CSV_BYTES} read={readCsv} />;
}

/** Shows an Excel (.xlsx) attachment as a table per sheet. */
export function XlsxViewer({ media }: { media: DocumentMedia }): JSX.Element {
    return <SpreadsheetViewer media={media} maxBytes={MAX_XLSX_BYTES} read={readXlsx} />;
}
