/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { Button } from "@vector-im/compound-web";
import { CropIcon, EditIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { logger } from "matrix-js-sdk/src/logger";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import {
    drawMarks,
    exportEditedImage,
    findTextAt,
    type Mark,
    type Point,
    type Rect,
    rectBetween,
    TEXT_SIZES,
    textFont,
    type TextMark,
} from "../../../utils/imageEdit";

type Tool = "crop" | "pen" | "highlight" | "text";
type TextSize = keyof typeof TEXT_SIZES;

/** The colours on offer: red, yellow, blue, black, white. */
const COLORS = ["#e0272c", "#ffd60a", "#0074d0", "#000000", "#ffffff"];

/** What the picture looks like after some edits; undo steps back through these. */
interface EditState {
    marks: Mark[];
    crop: Rect | null;
}

/** Text being typed: where it goes, and which existing text it replaces, if any. */
interface TextEdit {
    at: Point;
    index: number | null;
}

/** A finger or pointer on a piece of text: a drag moves it, a tap opens it for changing. */
interface TextDrag {
    index: number;
    start: Point;
    origin: Point;
    moved: boolean;
}

interface Props {
    /** The picture to edit. */
    file: File;
    /** Called with the edited picture, or with nothing when the user cancels. */
    onFinished: (edited?: File) => void;
}

/** The text size whose share of the picture is closest to the given pixel size. */
function nearestTextSize(pixels: number, pictureSize: number): TextSize {
    const sizes = Object.keys(TEXT_SIZES) as TextSize[];
    return sizes.reduce((best, s) =>
        Math.abs(TEXT_SIZES[s] * pictureSize - pixels) < Math.abs(TEXT_SIZES[best] * pictureSize - pixels) ? s : best,
    );
}

/**
 * Basic edits to a picture before it is sent: crop, draw with a pen, highlight and write text. Text can be moved by
 * dragging it, and changed by tapping it.
 */
export default function EditImageDialog({ file, onFinished }: Props): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState(COLORS[0]);
    const [textSize, setTextSize] = useState<TextSize>("medium");
    const [history, setHistory] = useState<EditState[]>([{ marks: [], crop: null }]);
    // The stroke or crop being dragged right now, not yet in the history
    const [draft, setDraft] = useState<Mark | Rect | null>(null);
    const dragStart = useRef<Point | null>(null);
    const [editing, setEditing] = useState<TextEdit | null>(null);
    const [text, setText] = useState("");
    const textDrag = useRef<TextDrag | null>(null);
    // Where the text being dragged is now
    const [movedTo, setMovedTo] = useState<Point | null>(null);
    // Screen pixels per picture pixel, so the text box matches the text it becomes
    const [scale, setScale] = useState(1);
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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => {
            if (canvas.clientWidth) setScale(canvas.clientWidth / image.naturalWidth);
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [image]);

    /** The marks as they look right now: the text being typed is left out, and the text being dragged has moved. */
    const visibleMarks = (): Mark[] => {
        const drag = textDrag.current;
        const marks = current.marks.map((mark, i) =>
            drag && movedTo && i === drag.index ? { ...mark, at: movedTo } : mark,
        );
        if (editing?.index != null) marks.splice(editing.index, 1);
        return marks;
    };

    // Redraw the picture, the marks and the crop whenever any of them changes
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !image) return;
        // Cleared first, so undone marks do not stay behind on see-through pictures
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        const draftIsMark = draft && "kind" in draft;
        const marks = visibleMarks();
        drawMarks(ctx, draftIsMark ? [...marks, draft] : marks);

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
        // visibleMarks reads only state listed here
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [image, current, draft, size, editing, movedTo]);

    const pushState = (next: EditState): void => setHistory((h) => [...h, next]);

    /** Where the pointer is, in the picture's own pixels; the canvas is shown smaller than it is. */
    const toImagePoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const box = e.currentTarget.getBoundingClientRect();
        return {
            x: ((e.clientX - box.left) / box.width) * e.currentTarget.width,
            y: ((e.clientY - box.top) / box.height) * e.currentTarget.height,
        };
    };

    /** The marks with the text being typed put in place, or null when that would change nothing. */
    const marksWithText = (): Mark[] | null => {
        if (!editing) return null;
        const typed = text.trim();
        const mark: TextMark = {
            kind: "text",
            color,
            size: size * TEXT_SIZES[textSize],
            at: editing.at,
            text: typed,
        };
        const marks = [...current.marks];
        if (editing.index === null) {
            if (!typed) return null;
            marks.push(mark);
        } else {
            const before = marks[editing.index];
            if (typed && JSON.stringify(before) === JSON.stringify(mark)) return null;
            // Emptying a piece of text removes it
            if (typed) marks[editing.index] = mark;
            else marks.splice(editing.index, 1);
        }
        return marks;
    };

    const stopEditing = (): void => {
        setEditing(null);
        setText("");
    };

    const commitText = (): void => {
        const marks = marksWithText();
        if (marks) pushState({ ...current, marks });
        stopEditing();
    };

    const startEditing = (index: number): void => {
        const mark = current.marks[index] as TextMark;
        setEditing({ at: mark.at, index });
        setText(mark.text);
        setColor(mark.color);
        setTextSize(nearestTextSize(mark.size, size));
    };

    const onRemoveText = (): void => {
        if (editing?.index == null) return;
        pushState({ ...current, marks: current.marks.filter((_, i) => i !== editing.index) });
        stopEditing();
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
        if (!image) return;
        const p = toImagePoint(e);
        if (tool === "text") {
            // A tap away from the text being typed finishes it, as in other apps
            if (editing) return commitText();
            const ctx = e.currentTarget.getContext("2d");
            const hit = ctx ? findTextAt(ctx, current.marks, p) : null;
            if (hit !== null) {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                textDrag.current = { index: hit, start: p, origin: (current.marks[hit] as TextMark).at, moved: false };
            } else {
                // The finger marks the middle of the first line, not its top
                const fontSize = size * TEXT_SIZES[textSize];
                setEditing({ at: { x: p.x, y: p.y - fontSize / 2 }, index: null });
            }
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
        const drag = textDrag.current;
        if (drag) {
            const p = toImagePoint(e);
            const dx = p.x - drag.start.x;
            const dy = p.y - drag.start.y;
            // A finger wobbles a little during a tap; only a real drag moves the text
            if (!drag.moved && Math.hypot(dx, dy) < size / 100) return;
            drag.moved = true;
            setMovedTo({ x: drag.origin.x + dx, y: drag.origin.y + dy });
            return;
        }
        if (!dragStart.current || !draft || !image) return;
        const p = toImagePoint(e);
        if ("kind" in draft) {
            if (draft.kind !== "text") setDraft({ ...draft, points: [...draft.points, p] });
        } else {
            setDraft(rectBetween(dragStart.current, p, image.naturalWidth, image.naturalHeight));
        }
    };

    const onPointerUp = (): void => {
        const drag = textDrag.current;
        if (drag) {
            textDrag.current = null;
            if (drag.moved && movedTo) {
                const marks = current.marks.map((mark, i) => (i === drag.index ? { ...mark, at: movedTo } : mark));
                pushState({ ...current, marks });
            } else {
                startEditing(drag.index);
            }
            setMovedTo(null);
            return;
        }
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
        stopEditing();
        setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    };

    const onDone = async (): Promise<void> => {
        if (!image) return;
        // Text still being typed counts
        const marks = marksWithText() ?? current.marks;
        if (marks.length === 0 && !current.crop) return onFinished();
        setSaving(true);
        try {
            onFinished(await exportEditedImage(image, file, marks, current.crop));
        } catch (e) {
            logger.warn("Could not save the edited picture", e);
            setSaving(false);
        }
    };

    /** Keeps the keyboard up while a colour or size is picked for the text being typed. */
    const keepTyping = (): void => {
        if (editing) inputRef.current?.focus();
    };

    const hints: Record<Tool, string> = {
        crop: _t("upload_file|edit_image_hint_crop"),
        pen: _t("upload_file|edit_image_hint_pen"),
        highlight: _t("upload_file|edit_image_hint_highlight"),
        text: _t("upload_file|edit_image_hint_text"),
    };

    const sizeLabels: Record<TextSize, string> = {
        small: _t("upload_file|edit_image_size_small"),
        medium: _t("upload_file|edit_image_size_medium"),
        large: _t("upload_file|edit_image_size_large"),
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

    // The text box sits where the text will be drawn, in the same size, so typing shows what will be sent. Its
    // position is a share of the picture's size, so it follows the canvas when the window changes size.
    let textBoxStyle: CSSProperties | undefined;
    if (editing && image) {
        const fontPx = size * TEXT_SIZES[textSize] * scale;
        const left = (editing.at.x / image.naturalWidth) * 100;
        textBoxStyle = {
            left: `${left}%`,
            // The box's line is a little taller than the canvas's, which starts at the very top of the letters
            top: `calc(${(editing.at.y / image.naturalHeight) * 100}% - ${fontPx * 0.1}px)`,
            maxWidth: `${100 - left}%`,
            width: `${Math.max(text.length, 4) + 1}ch`,
            font: textFont(fontPx),
            color,
            WebkitTextStroke: `${Math.max(1, fontPx / 12)}px ${color === "#ffffff" ? "#000000" : "#ffffff"}`,
        };
    }

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
                    <div className="mx_EditImageDialog_options">
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
                                    onClick={() => {
                                        setColor(c);
                                        keepTyping();
                                    }}
                                />
                            ))}
                        </div>
                        {tool === "text" && (
                            <div
                                className="mx_EditImageDialog_sizes"
                                role="radiogroup"
                                aria-label={_t("upload_file|edit_image_size")}
                            >
                                {(Object.keys(TEXT_SIZES) as TextSize[]).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        role="radio"
                                        aria-checked={s === textSize}
                                        aria-label={sizeLabels[s]}
                                        className={`mx_EditImageDialog_size mx_EditImageDialog_size_${s}`}
                                        onClick={() => {
                                            setTextSize(s);
                                            keepTyping();
                                        }}
                                    >
                                        A
                                    </button>
                                ))}
                            </div>
                        )}
                        {editing?.index != null && (
                            <Button kind="tertiary" size="md" destructive onClick={onRemoveText}>
                                {_t("upload_file|edit_image_remove_text")}
                            </Button>
                        )}
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
                            ref={inputRef}
                            className="mx_EditImageDialog_textInput"
                            style={textBoxStyle}
                            value={text}
                            autoFocus
                            enterKeyHint="done"
                            placeholder={_t("upload_file|edit_image_text_placeholder")}
                            aria-label={_t("upload_file|edit_image_text")}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitText();
                                } else if (e.key === "Escape") {
                                    // Leaves the text as it was, without closing the whole editor
                                    e.preventDefault();
                                    e.stopPropagation();
                                    stopEditing();
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
