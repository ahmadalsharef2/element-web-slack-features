/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import ProgressBar from "../elements/ProgressBar";
import { fileSize } from "../../../utils/FileUtils";
import { compressVideo } from "../../../utils/compressVideo";

/** What became of the videos: the ones made small enough, and the originals that could not be. */
export interface CompressVideoResult {
    compressed: File[];
    failed: File[];
}

interface Props {
    /** Videos over the upload limit. */
    videos: File[];
    /** The server's upload limit in bytes. */
    limit: number;
    /** Called with the outcome, or with nothing when the user cancels. */
    onFinished: (result?: CompressVideoResult) => void;
}

/**
 * Makes videos that are over the upload limit small enough to send, one after another, showing progress.
 * All the work happens on the device.
 */
export default function CompressVideoDialog({ videos, limit, onFinished }: Props): JSX.Element {
    const [index, setIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const cancelRef = useRef<() => void>(() => {});

    useEffect(() => {
        let stopped = false;
        let stopCurrent: (() => void) | undefined;

        const run = async (): Promise<void> => {
            const result: CompressVideoResult = { compressed: [], failed: [] };
            for (let i = 0; i < videos.length; i++) {
                if (stopped) return;
                setIndex(i);
                setProgress(0);
                const compression = compressVideo(videos[i], limit, (p) => {
                    if (!stopped) setProgress(p);
                });
                stopCurrent = compression.cancel;
                try {
                    const file = await compression.result;
                    if (file) result.compressed.push(file);
                    else result.failed.push(videos[i]);
                } catch (e) {
                    if (stopped) return;
                    logger.warn("Could not make video smaller", e);
                    result.failed.push(videos[i]);
                }
            }
            if (!stopped) onFinished(result);
        };

        cancelRef.current = () => {
            stopped = true;
            stopCurrent?.();
            onFinished();
        };
        void run();

        return () => {
            stopped = true;
            stopCurrent?.();
        };
        // Runs once: the dialog is opened for one set of videos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const video = videos[index];
    const title =
        videos.length > 1
            ? _t("upload_file|compress_video_title_n", { index: index + 1, total: videos.length })
            : _t("upload_file|compress_video_title");

    return (
        <BaseDialog
            className="mx_CompressVideoDialog"
            onFinished={() => cancelRef.current()}
            title={title}
            contentId="mx_CompressVideoDialog_content"
        >
            <div id="mx_CompressVideoDialog_content">
                <p>
                    {_t(
                        "upload_file|compress_video_description",
                        { fileName: video.name, size: fileSize(video.size), limit: fileSize(limit) },
                        { b: (sub) => <strong>{sub}</strong> },
                    )}
                </p>
                <ProgressBar value={Math.round(progress * 100)} max={100} />
                <p>{_t("upload_file|compress_video_percent", { percent: Math.round(progress * 100) })}</p>
            </div>
            <DialogButtons
                primaryButton={_t("action|cancel")}
                onPrimaryButtonClick={() => cancelRef.current()}
                hasCancel={false}
            />
        </BaseDialog>
    );
}
