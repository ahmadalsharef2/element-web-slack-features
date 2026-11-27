/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2021 The Matrix.org Foundation C.I.C.
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback, useState, type JSX } from "react";

import { Button } from "@vector-im/compound-web";
import { EditIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import Field from "../elements/Field";
import { fileSize } from "../../../utils/FileUtils";
import Modal from "../../../Modal";
import SchedulePickerDialog from "../../../fork/scheduled-messages/SchedulePickerDialog";
import EditImageDialog from "../../../fork/image-edit/EditImageDialog";
import { isEditableImage } from "../../../fork/image-edit/imageEdit";
import {
    attachmentIcon,
    type ImageSize,
    type MediaPreviewGroupEntry,
    type MediaPreviewGroupEntryContent,
    MediaPreviewGroupPreview,
    useCreateAutoDisposedViewModel,
} from "@element-hq/web-shared-components";
import { MediaPreviewGroupViewModel } from "../../../viewmodels/message-body/MediaPreviewGroupViewModel";

interface IProps {
    files: File[];
    /**
     * `caption` is the text to send with the first file, if any. `sendAt` is the time to send at,
     * as a timestamp in ms, when the person chose to schedule instead of sending now. `files` are the files to
     * send, with any pictures the person edited in place of the originals.
     */
    onFinished: (uploadConfirmed: boolean, caption?: string, sendAt?: number, files?: File[]) => void;
}

const previewableFormats = ["video", "audio", "image"];
/**
 * previewable formats needs an object URL to be created for the preview
 */
function formatIsPreviewable(mimetype: string): boolean {
    return previewableFormats.includes(mimetype.split("/")[0]);
}

/**
 * objectUrl should only be undefined if mimetype is text
 */
function computePreviewContent(
    mimeType: string,
    fileName: string,
    objectUrl: string | undefined,
    size: ImageSize,
): MediaPreviewGroupEntryContent {
    if (objectUrl === undefined)
        return {
            type: "text",
        };

    switch (mimeType.split("/")[0]) {
        case "image":
            return {
                type: "image",
                imageSize: size,
                image: objectUrl,
                imageAlt: fileName,
            };
        case "video":
            return {
                type: "video",
                videoSize: size,
                video: objectUrl,
            };
        case "audio":
            return {
                type: "audio",
                audio: objectUrl,
            };
        default:
            return {
                type: "text",
            };
    }
}

/**
 * Owns the object URLs used for the previews so that their lifetime is tied to the lifetime of the
 * view-model: they are revoked when the view-model is disposed, i.e. when the dialog unmounts.
 */
class UploadPreviewViewModel extends MediaPreviewGroupViewModel {
    public constructor(files: File[]) {
        const objectUrls = files.map((file) =>
            formatIsPreviewable(file.type) ? URL.createObjectURL(file) : undefined,
        );

        const entries: MediaPreviewGroupEntry[] = files.map((file, i) => ({
            // The index keeps the id unique when several files have the same name, e.g. pasted images
            id: `${i}-${file.name}`,
            header: file.name,
            body: fileSize(file.size),
            ...attachmentIcon(file.type),
            // Several previews share the dialog, so keep each one short
            ...computePreviewContent(file.type, file.name, objectUrls[i], files.length > 1 ? "banner" : "tallbanner"),
        }));

        super({ entries });

        for (const objectUrl of objectUrls) {
            if (objectUrl !== undefined) this.disposables.track(() => URL.revokeObjectURL(objectUrl));
        }
    }
}

/** The previews; given a new key when a picture is edited, so its view model is made again for the new files. */
function UploadPreview({ files }: { files: File[] }): JSX.Element {
    const vm = useCreateAutoDisposedViewModel(() => new UploadPreviewViewModel(files));
    return <MediaPreviewGroupPreview vm={vm} />;
}

export default function UploadConfirmDialog({ files: originalFiles, onFinished }: IProps): JSX.Element {
    const [files, setFiles] = useState(originalFiles);
    const [previewKey, setPreviewKey] = useState(0);

    // The picture being edited, if any. The editor takes this dialog's place rather than opening as a second
    // dialog: Modal only keeps the top dialog mounted, so this one would come back with its files and caption reset.
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const onEditFinished = useCallback(
        (edited?: File): void => {
            if (edited) {
                setFiles((current) => current.map((f, i) => (i === editingIndex ? edited : f)));
                setPreviewKey((k) => k + 1);
            }
            setEditingIndex(null);
        },
        [editingIndex],
    );

    const onCancelClick = useCallback((): void => {
        onFinished(false);
    }, [onFinished]);

    const [caption, setCaption] = useState("");

    const onUploadClick = useCallback((): void => {
        onFinished(true, caption.trim() || undefined, undefined, files);
    }, [onFinished, caption, files]);

    const onScheduleClick = useCallback(async (): Promise<void> => {
        const { finished } = Modal.createDialog(SchedulePickerDialog);
        const [confirmed, sendAt] = await finished;
        if (confirmed && sendAt) onFinished(true, caption.trim() || undefined, sendAt, files);
    }, [onFinished, caption, files]);

    const onCaptionKeyDown = useCallback(
        (e: React.KeyboardEvent): void => {
            if (e.key === "Enter") {
                e.preventDefault();
                onUploadClick();
            }
        },
        [onUploadClick],
    );

    if (editingIndex !== null) {
        return <EditImageDialog file={files[editingIndex]} onFinished={onEditFinished} />;
    }

    return (
        <BaseDialog
            className="mx_UploadConfirmDialog"
            fixedWidth={false}
            onFinished={onCancelClick}
            title={_t("upload_file|title")}
            contentId="mx_Dialog_content"
        >
            <div id="mx_Dialog_content">
                <div className="mx_UploadConfirmDialog_previewOuter">
                    <div className="mx_UploadConfirmDialog_previewInner">
                        <UploadPreview key={previewKey} files={files} />
                    </div>
                </div>
                <div className="mx_UploadConfirmDialog_edit">
                    {files.map((file, i) =>
                        isEditableImage(file) ? (
                            <Button
                                // The list never changes length or order, so the index is a stable key
                                // oxlint-disable-next-line react/no-array-index-key
                                key={i}
                                kind="secondary"
                                size="md"
                                Icon={EditIcon}
                                onClick={() => setEditingIndex(i)}
                            >
                                {files.length > 1
                                    ? _t("upload_file|edit_image_named", { fileName: file.name })
                                    : _t("upload_file|edit_image")}
                            </Button>
                        ) : null,
                    )}
                </div>
                <Field
                    className="mx_UploadConfirmDialog_caption"
                    label={_t("upload_file|caption_label")}
                    value={caption}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCaption(e.target.value)}
                    onKeyDown={onCaptionKeyDown}
                    autoComplete="off"
                />
            </div>

            <DialogButtons
                primaryButton={_t("action|upload")}
                hasCancel={false}
                onPrimaryButtonClick={onUploadClick}
                focus={true}
            >
                <button onClick={() => void onScheduleClick()} className="mx_LegacyDialogButton" type="button">
                    {_t("schedule_send|picker_confirm")}
                </button>
            </DialogButtons>
        </BaseDialog>
    );
}
