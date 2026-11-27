/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

const loggerCompress = logger.getChild("compressVideo");

/** How the video is re-encoded so that it fits under the upload limit. */
export interface VideoCompressionPlan {
    /** Longest side of the output in pixels, or undefined to keep the source size. */
    maxSide?: number;
    /** Target video bitrate in bits per second. */
    videoBitrate: number;
    /** Target audio bitrate in bits per second. */
    audioBitrate: number;
    /** Output frame rate, or undefined to keep the source rate. */
    frameRate?: number;
}

/**
 * Share of the upload limit the output aims for. Encoders overshoot their target bitrate, and the
 * container adds its own bytes, so aiming for the limit itself would often miss it.
 */
const TARGET_SHARE = 0.85;
/** Below this the picture is too blocky to be worth sending, so the file is reported as too big instead. */
const MIN_VIDEO_BITRATE = 150_000;
/** Above this a 720p video looks no better, so a short clip ends up smaller than the limit. */
const MAX_VIDEO_BITRATE = 4_000_000;
/** 30 fps is enough for chat videos and halves the work for 60 fps phone recordings. */
const MAX_FRAME_RATE = 30;

/** Longest side of the output for a given video bitrate: less detail for less data. */
function maxSideForBitrate(videoBitrate: number): number {
    if (videoBitrate >= 1_500_000) return 1280;
    if (videoBitrate >= 700_000) return 854;
    return 640;
}

/**
 * Work out how to re-encode a video so that it fits in `limitBytes`, or return null when it cannot
 * fit at a quality worth sending.
 *
 * @param durationSeconds - Length of the video.
 * @param sourceLongSide - Longest side of the source in pixels. The output is never made bigger.
 * @param sourceFrameRate - Average frame rate of the source, if known.
 * @param limitBytes - The server's upload limit.
 */
export function planVideoCompression(
    durationSeconds: number,
    sourceLongSide: number,
    sourceFrameRate: number | undefined,
    limitBytes: number,
): VideoCompressionPlan | null {
    if (!(durationSeconds > 0) || !(limitBytes > 0)) return null;

    const totalBitrate = (limitBytes * TARGET_SHARE * 8) / durationSeconds;
    const audioBitrate = totalBitrate < 400_000 ? 48_000 : 96_000;
    const videoBitrate = Math.min(totalBitrate - audioBitrate, MAX_VIDEO_BITRATE);
    if (videoBitrate < MIN_VIDEO_BITRATE) return null;

    const side = maxSideForBitrate(videoBitrate);
    return {
        maxSide: sourceLongSide > side ? side : undefined,
        videoBitrate: Math.round(videoBitrate),
        audioBitrate,
        frameRate: sourceFrameRate && sourceFrameRate > MAX_FRAME_RATE + 1 ? MAX_FRAME_RATE : undefined,
    };
}

/**
 * Whether this browser can re-encode videos. Uses WebCodecs, which runs on the device's video hardware
 * where it has one, so it is quick and light on battery, phones included.
 */
export function canCompressVideo(): boolean {
    return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

/** Whether the file looks like a video we could try to make smaller. */
export function isCompressibleVideo(file: File): boolean {
    return file.type.startsWith("video/");
}

/** Handle on a running compression. */
export interface VideoCompression {
    /** Resolves to the smaller file, or null if it could not be made small enough. Rejects if cancelled. */
    result: Promise<File | null>;
    /** Stop the work. `result` then rejects. */
    cancel: () => void;
}

/**
 * Re-encode a video as H.264/AAC MP4 small enough to upload under `limitBytes`.
 *
 * Runs entirely on the device. The library is loaded on first use, so it stays out of the main bundle.
 *
 * @param onProgress - Called with a number from 0 to 1 as the work goes on.
 */
export function compressVideo(
    file: File,
    limitBytes: number,
    onProgress?: (progress: number) => void,
): VideoCompression {
    let cancelled = false;
    let cancelConversion: (() => Promise<void>) | undefined;

    const run = async (): Promise<File | null> => {
        const mb = await import("mediabunny");
        const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
        try {
            const videoTrack = await input.getPrimaryVideoTrack();
            if (!videoTrack) return null;

            const [duration, width, height, stats] = await Promise.all([
                input.computeDuration(),
                videoTrack.getDisplayWidth(),
                videoTrack.getDisplayHeight(),
                // A sample of packets is enough for a frame rate estimate.
                videoTrack.computePacketStats(100).catch(() => undefined),
            ]);
            const plan = planVideoCompression(duration, Math.max(width, height), stats?.averagePacketRate, limitBytes);
            if (!plan) return null;

            // Scale the longest side down, keeping the aspect ratio; the encoder wants even sizes.
            const scale = plan.maxSide ? plan.maxSide / Math.max(width, height) : 1;
            const outWidth = Math.round((width * scale) / 2) * 2;
            const outHeight = Math.round((height * scale) / 2) * 2;
            const encodable = await mb.canEncodeVideo("avc", {
                width: outWidth,
                height: outHeight,
                bitrate: plan.videoBitrate,
            });
            if (!encodable) return null;
            // AAC plays everywhere, but not every browser can encode it; Opus in MP4 is the fallback.
            const audioCodec = (await mb.canEncodeAudio("aac", { bitrate: plan.audioBitrate })) ? "aac" : "opus";

            // Fast start puts the index first, so the video can play before it has fully downloaded.
            const output = new mb.Output({
                format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
                target: new mb.BufferTarget(),
            });
            const conversion = await mb.Conversion.init({
                input,
                output,
                tracks: "primary",
                video: {
                    codec: "avc",
                    width: outWidth,
                    height: outHeight,
                    fit: "contain",
                    bitrate: plan.videoBitrate,
                    frameRate: plan.frameRate,
                    forceTranscode: true,
                },
                audio: { codec: audioCodec, bitrate: plan.audioBitrate },
                showWarnings: false,
            });
            if (!conversion.isValid) {
                loggerCompress.warn("Cannot convert video", conversion.discardedTracks);
                return null;
            }
            cancelConversion = () => conversion.cancel();
            if (cancelled) await conversion.cancel();
            if (onProgress) conversion.onProgress = (progress) => onProgress(progress);

            await conversion.execute();

            const buffer = output.target.buffer;
            if (!buffer || buffer.byteLength > limitBytes) return null;

            const baseName = file.name.replace(/\.[^.]*$/, "") || "video";
            return new File([buffer], `${baseName}.mp4`, { type: "video/mp4", lastModified: file.lastModified });
        } finally {
            input.dispose();
        }
    };

    return {
        result: run(),
        cancel: () => {
            cancelled = true;
            void cancelConversion?.();
        },
    };
}
