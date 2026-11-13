/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * Runs the real encoder: WebCodecs only exists in a browser. The input video is made here, at a
 * bitrate far above what the limit allows, so that it has to be shrunk to fit.
 */

import { describe, expect, it } from "vitest";
import { BufferTarget, CanvasSource, ConversionCanceledError, Output, WebMOutputFormat } from "mediabunny";

import { canCompressVideo, compressVideo } from "./compressVideo";

const SECONDS = 2;
const FPS = 30;

/** Make a 720p WebM with moving shapes at a high bitrate. */
async function makeVideo(): Promise<File> {
    const canvas = new OffscreenCanvas(1280, 720);
    const ctx = canvas.getContext("2d")!;
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(canvas, { codec: "vp8", bitrate: 8_000_000 });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();
    for (let frame = 0; frame < SECONDS * FPS; frame++) {
        ctx.fillStyle = `hsl(${frame * 6}, 70%, 50%)`;
        ctx.fillRect(0, 0, 1280, 720);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `hsl(${(i * 37 + frame * 11) % 360}, 80%, 60%)`;
            ctx.fillRect((i * 97 + frame * 13) % 1280, (i * 53 + frame * 7) % 720, 120, 80);
        }
        await source.add(frame / FPS, 1 / FPS);
    }
    await output.finalize();
    return new File([output.target.buffer!], "clip.webm", { type: "video/webm" });
}

describe("compressVideo", () => {
    it("is supported in this browser", () => {
        expect(canCompressVideo()).toBe(true);
    });

    it("makes a video small enough for the limit, as MP4", async () => {
        const input = await makeVideo();
        const limit = Math.floor(input.size / 2);
        const progress: number[] = [];

        const output = await compressVideo(input, limit, (p) => progress.push(p)).result;

        expect(output).not.toBeNull();
        expect(output!.size).toBeLessThanOrEqual(limit);
        expect(output!.type).toBe("video/mp4");
        expect(output!.name).toBe("clip.mp4");
        expect(progress.length).toBeGreaterThan(0);
    });

    it("can be cancelled", async () => {
        const input = await makeVideo();
        const compression = compressVideo(input, Math.floor(input.size / 2));
        compression.cancel();

        await expect(compression.result).rejects.toBeInstanceOf(ConversionCanceledError);
    });
});
