/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { detectDelimiter, parseCsv } from "./parseCsv";

describe("detectDelimiter", () => {
    it.each([
        ["a,b,c\n1,2,3", ","],
        ["a;b;c\n1,5;2,5;3", ";"],
        ["a\tb\tc", "\t"],
        ['"x;y;z",b\n', ","],
        ["single", ","],
    ])("picks the delimiter for %j", (text, delimiter) => {
        expect(detectDelimiter(text)).toBe(delimiter);
    });
});

describe("parseCsv", () => {
    it("reads rows and fields", () => {
        expect(parseCsv("a,b\n1,2\n").rows).toEqual([
            ["a", "b"],
            ["1", "2"],
        ]);
    });

    it("handles CRLF, a missing final line break and a byte order mark", () => {
        expect(parseCsv("﻿a,b\r\n1,2").rows).toEqual([
            ["a", "b"],
            ["1", "2"],
        ]);
    });

    it("keeps delimiters, line breaks and doubled quotes inside quoted fields", () => {
        expect(parseCsv('name,quote\n"Smith, J","He said ""hi""\nthen left"\n').rows).toEqual([
            ["name", "quote"],
            ["Smith, J", 'He said "hi"\nthen left'],
        ]);
    });

    it("keeps empty fields", () => {
        expect(parseCsv("a,,c\n,,\n").rows).toEqual([
            ["a", "", "c"],
            ["", "", ""],
        ]);
    });

    it("stops at the row limit and says so", () => {
        const result = parseCsv("1\n2\n3\n4\n", ",", 2);
        expect(result.rows).toEqual([["1"], ["2"]]);
        expect(result.truncated).toBe(true);
    });

    it("is not truncated when the limit is the exact row count", () => {
        expect(parseCsv("1\n2\n", ",", 2).truncated).toBe(false);
    });
});
