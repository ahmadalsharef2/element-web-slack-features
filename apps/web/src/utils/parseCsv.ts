/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The rows read from a CSV file, and whether reading stopped at `maxRows`. */
export interface CsvTable {
    rows: string[][];
    truncated: boolean;
}

const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"];

/**
 * Guess the delimiter from the first line: whichever candidate appears most often outside quotes.
 * Excel writes `;` in countries that use a decimal comma, and TSV files use tabs.
 */
export function detectDelimiter(text: string): string {
    const counts = new Map(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
    let inQuotes = false;
    for (const char of text) {
        if (char === '"') inQuotes = !inQuotes;
        else if (!inQuotes && (char === "\n" || char === "\r")) break;
        else if (!inQuotes && counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
    let best = ",";
    for (const [delimiter, count] of counts) {
        if (count > counts.get(best)!) best = delimiter;
    }
    return best;
}

/**
 * Parse CSV text as described in RFC 4180: quoted fields may hold delimiters, line breaks and doubled
 * quotes. Lines may end in CRLF or LF. A leading byte order mark is dropped.
 *
 * @param maxRows - Stop after this many rows, so a huge file does not fill memory.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text), maxRows = Infinity): CsvTable {
    if (text.startsWith("﻿")) text = text.slice(1);

    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;

    const endRow = (): void => {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
    };

    while (i < text.length) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"' && field === "") {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") i++;
            endRow();
            if (rows.length >= maxRows) {
                return { rows, truncated: i + 1 < text.length };
            }
        } else {
            field += char;
        }
        i++;
    }

    // The last line has no line break after it, unless the file ends in one.
    if (field !== "" || row.length > 0) endRow();
    return { rows, truncated: false };
}
