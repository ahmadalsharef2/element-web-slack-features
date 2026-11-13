/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { isCompressibleVideo, planVideoCompression } from "./compressVideo";

const MB = 1024 * 1024;

describe("planVideoCompression", () => {
    it("aims under the limit, leaving room for the audio and the container", () => {
        const plan = planVideoCompression(300, 1920, 30, 50 * MB)!;

        const totalBytes = ((plan.videoBitrate + plan.audioBitrate) * 300) / 8;
        expect(totalBytes).toBeLessThan(50 * MB * 0.9);
        expect(totalBytes).toBeGreaterThan(50 * MB * 0.8);
    });

    it("scales a long video down further than a short one", () => {
        expect(planVideoCompression(120, 1920, 30, 50 * MB)!.maxSide).toBe(1280);
        expect(planVideoCompression(300, 1920, 30, 50 * MB)!.maxSide).toBe(854);
        expect(planVideoCompression(1500, 1920, 30, 50 * MB)!.maxSide).toBe(640);
    });

    it("never scales a video up", () => {
        expect(planVideoCompression(60, 640, 30, 50 * MB)!.maxSide).toBeUndefined();
    });

    it("caps the bitrate of a short clip, which only needs to be under the limit", () => {
        expect(planVideoCompression(10, 3840, 30, 50 * MB)!.videoBitrate).toBe(4_000_000);
    });

    it("halves 60 fps but keeps lower frame rates", () => {
        expect(planVideoCompression(60, 1920, 59.94, 50 * MB)!.frameRate).toBe(30);
        expect(planVideoCompression(60, 1920, 30, 50 * MB)!.frameRate).toBeUndefined();
        expect(planVideoCompression(60, 1920, undefined, 50 * MB)!.frameRate).toBeUndefined();
    });

    it("gives up when the video would have to look too bad to fit", () => {
        expect(planVideoCompression(4 * 3600, 1920, 30, 50 * MB)).toBeNull();
    });

    it("gives up on a missing duration or limit", () => {
        expect(planVideoCompression(0, 1920, 30, 50 * MB)).toBeNull();
        expect(planVideoCompression(NaN, 1920, 30, 50 * MB)).toBeNull();
        expect(planVideoCompression(60, 1920, 30, 0)).toBeNull();
    });
});

describe("isCompressibleVideo", () => {
    it("accepts videos only", () => {
        expect(isCompressibleVideo(new File([], "a.mp4", { type: "video/mp4" }))).toBe(true);
        expect(isCompressibleVideo(new File([], "a.mov", { type: "video/quicktime" }))).toBe(true);
        expect(isCompressibleVideo(new File([], "a.zip", { type: "application/zip" }))).toBe(false);
    });
});
