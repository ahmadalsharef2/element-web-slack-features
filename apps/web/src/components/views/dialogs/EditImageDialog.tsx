/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@vector-im/compound-web";
import { CropIcon, EditIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { logger } from "matrix-js-sdk/src/logger";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import { drawMarks, exportEditedImage, type Mark, type Point, type Rect, rectBetween } from "../../../utils/imageEdit";

type Tool = "crop" | "pen" | "highlight" | "text";

/** The colours on offer: red, yellow, blue, black, white. */
const COLORS = ["#e0272c", "#ffd60a", "#0074d0", "#000000", "#ffffff"];

/** What the picture looks like after some edits; undo steps back through these. */
interface EditState {
    marks: Mark[];
    crop: Rect | null;
}

interface Props {
    /** The picture to edit. */
    file: File;
    /** Called with the edited picture, or with nothing when the user cancels. */
    onFinished: (edited?: File) => void;
}

/**
 * Basic edits to a picture before it is sent: crop, draw with a pen, highlight and write text.
 */
export default function EditImageDialog({ file, onFinished }: Props): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState(COLORS[0]);
    const [history, setHistory] = useState<EditState[]>([{ marks: [], crop: null }]);
    // The stroke or crop being dragged right now, not yet in the history
    const [draft, setDraft] = useState<Mark | Rect | null>(null);
    const dragStart = useRef<Point | null>(null);
    // Where the user tapped with the text tool, and what they have typed so far
    const [textAt, setTextAt] = useState<Point | null>(null);
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);

    const current = history[history.length - 1];
    const size = image ? Math.max(image.naturalWidth, image.naturalHeight) : 1000;

    useEffect(() => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => setImage(img);
        img.onerror = () => onFinished();
        img.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file, onFinished]);

    // Redraw the picture, the marks and the crop whenever any of them changes
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !image) return;
        // Cleared first, so undone marks do not stay behind on see-through pictures
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        const draftIsMark = draft && "kind" in draft;
        drawMarks(ctx, draftIsMark ? [...current.marks, draft] : current.marks);

        const crop = draft && !draftIsMark ? draft : current.crop;
        if (crop) {
            // Dim what will be cut away
            ctx.save();
            ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
            ctx.beginPath();
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.rect(crop.x, crop.y, crop.width, crop.height);
            ctx.fill("evenodd");
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(2, size / 400);
            ctx.setLineDash([size / 100, size / 100]);
            ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
            ctx.restore();
        }
    }, [image, current, draft, size]);

    const pushState = (next: EditState): void => setHistory((h) => [...h, next]);

    /** Where the pointer is, in the picture's own pixels; the canvas is shown smaller than it is. */
    const toImagePoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const box = e.currentTarget.getBoundingClientRect();
        return {
            x: ((e.clientX - box.left) / box.width) * e.currentTarget.width,
            y: ((e.clientY - box.top) / box.height) * e.currentTarget.height,
        };
    };

    const commitText = useCallback((): void => {
        if (textAt && text.trim()) {
            pushState({
                ...current,
                marks: [...current.marks, { kind: "text", color, size: size / 20, at: textAt, text: text.trim() }],
            });
        }
        setTextAt(null);
        setText("");
    }, [textAt, text, current, color, size]);

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!image) return;
        const p = toImagePoint(e);
        if (tool === "text") {
            commitText();
            setTextAt(p);
            return;
        }
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragStart.current = p;
        if (tool === "crop") {
            setDraft(rectBetween(p, p, image.naturalWidth, image.naturalHeight));
        } else {
            const width = tool === "highlight" ? size / 30 : size / 150;
            setDraft({ kind: tool, color, width, points: [p] });
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!dragStart.current || !draft || !image) return;
        const p = toImagePoint(e);
        if ("kind" in draft) {
            if (draft.kind !== "text") setDraft({ ...draft, points: [...draft.points, p] });
        } else {
            setDraft(rectBetween(dragStart.current, p, image.naturalWidth, image.naturalHeight));
        }
    };

    const onPointerUp = (): void => {
        if (!draft) return;
        if ("kind" in draft) {
            pushState({ ...current, marks: [...current.marks, draft] });
        } else if (draft.width > 10 && draft.height > 10) {
            // A tap rather than a drag does not crop to nothing
            pushState({ ...current, crop: draft });
        }
        dragStart.current = null;
        setDraft(null);
    };

    const onUndo = (): void => {
        setTextAt(null);
        setText("");
        setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    };

    const onDone = async (): Promise<void> => {
        if (!image) return;
        // Text still being typed counts
        const marks =
            textAt && text.trim()
                ? [...current.marks, { kind: "text" as const, color, size: size / 20, at: textAt, text: text.trim() }]
                : current.marks;
        if (marks.length === 0 && !current.crop) return onFinished();
        setSaving(true);
        try {
            onFinished(await exportEditedImage(image, file, marks, current.crop));
        } catch (e) {
            logger.warn("Could not save the edited picture", e);
            setSaving(false);
        }
    };

    const hints: Record<Tool, string> = {
        crop: _t("upload_file|edit_image_hint_crop"),
        pen: _t("upload_file|edit_image_hint_pen"),
        highlight: _t("upload_file|edit_image_hint_highlight"),
        text: _t("upload_file|edit_image_hint_text"),
    };

    const toolButton = (name: Tool, label: string, Icon?: typeof CropIcon): JSX.Element => (
        <Button
            kind={tool === name ? "primary" : "secondary"}
            size="md"
            Icon={Icon}
            aria-pressed={tool === name}
            onClick={() => {
                commitText();
                setTool(name);
            }}
        >
            {label}
        </Button>
    );

    // The text box sits where the user tapped, as a share of the picture's size so it follows the canvas's scaling
    const textBoxStyle =
        textAt && image
            ? {
                  left: `${(textAt.x / image.naturalWidth) * 100}%`,
                  top: `${(textAt.y / image.naturalHeight) * 100}%`,
                  color,
              }
            : undefined;

    return (
        <BaseDialog
            className="mx_EditImageDialog"
            fixedWidth={false}
            onFinished={() => onFinished()}
            title={_t("upload_file|edit_image_title")}
            contentId="mx_EditImageDialog_content"
        >
            <div id="mx_EditImageDialog_content">
                <div className="mx_EditImageDialog_tools" role="toolbar">
                    {toolButton("crop", _t("upload_file|edit_image_crop"), CropIcon)}
                    {toolButton("pen", _t("upload_file|edit_image_pen"), EditIcon)}
                    {toolButton("highlight", _t("upload_file|edit_image_highlight"))}
                    {toolButton("text", _t("upload_file|edit_image_text"))}
                    <Button kind="tertiary" size="md" onClick={onUndo} disabled={history.length < 2}>
                        {_t("upload_file|edit_image_undo")}
                    </Button>
                </div>
                {tool !== "crop" && (
                    <div className="mx_EditImageDialog_colors" role="radiogroup">
                        {COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={c === color}
                                aria-label={c}
                                className="mx_EditImageDialog_color"
                                style={{ backgroundColor: c }}
                                onClick={() => setColor(c)}
                            />
                        ))}
                    </div>
                )}
                <div className="mx_EditImageDialog_stage">
                    <canvas
                        ref={canvasRef}
                        width={image?.naturalWidth}
                        height={image?.naturalHeight}
                        className="mx_EditImageDialog_canvas"
                        aria-label={_t("upload_file|edit_image_canvas")}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    />
                    {textBoxStyle && (
                        <input
                            className="mx_EditImageDialog_textInput"
                            style={textBoxStyle}
                            value={text}
                            autoFocus
                            placeholder={_t("upload_file|edit_image_text_placeholder")}
                            aria-label={_t("upload_file|edit_image_text")}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitText();
                                }
                            }}
                        />
                    )}
                </div>
                <p className="mx_EditImageDialog_hint">{hints[tool]}</p>
            </div>
            <DialogButtons
                primaryButton={_t("action|done")}
                onPrimaryButtonClick={() => void onDone()}
                primaryDisabled={!image || saving}
                onCancel={() => onFinished()}
            />
        </BaseDialog>
    );
}
