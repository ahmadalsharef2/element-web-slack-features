/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** A point in the picture's own pixels. */
export interface Point {
    x: number;
    y: number;
}

/** A rectangle in the picture's own pixels. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A line drawn with the pen or the highlighter. */
export interface Stroke {
    kind: "pen" | "highlight";
    color: string;
    width: number;
    points: Point[];
}

/** Text written on the picture; `at` is the top left corner. */
export interface TextMark {
    kind: "text";
    color: string;
    size: number;
    at: Point;
    text: string;
}

/** Something drawn on the picture. */
export type Mark = Stroke | TextMark;

/** Picture types that can be edited and saved in the same type. GIFs are left out: they would lose their animation. */
const EDITABLE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Whether the file is a picture the editor can open. */
export function isEditableImage(file: File): boolean {
    return EDITABLE_TYPES.includes(file.type);
}

/** The rectangle between two corners, whichever way it was dragged, kept inside the picture. */
export function rectBetween(a: Point, b: Point, width: number, height: number): Rect {
    const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max);
    const x1 = clamp(Math.min(a.x, b.x), width);
    const y1 = clamp(Math.min(a.y, b.y), height);
    const x2 = clamp(Math.max(a.x, b.x), width);
    const y2 = clamp(Math.max(a.y, b.y), height);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Draws the marks onto a canvas whose pixels match the picture's. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[]): void {
    for (const mark of marks) {
        ctx.save();
        if (mark.kind === "text") {
            ctx.fillStyle = mark.color;
            ctx.font = `bold ${mark.size}px sans-serif`;
            ctx.textBaseline = "top";
            // A thin dark outline keeps the text readable on any background
            ctx.lineWidth = Math.max(1, mark.size / 12);
            ctx.strokeStyle = mark.color === "#ffffff" ? "#000000" : "#ffffff";
            ctx.strokeText(mark.text, mark.at.x, mark.at.y);
            ctx.fillText(mark.text, mark.at.x, mark.at.y);
        } else if (mark.points.length > 0) {
            ctx.strokeStyle = mark.color;
            ctx.lineWidth = mark.width;
            ctx.lineJoin = "round";
            ctx.lineCap = mark.kind === "highlight" ? "butt" : "round";
            // One path per stroke, so a highlight does not get darker where it crosses itself
            if (mark.kind === "highlight") ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(mark.points[0].x, mark.points[0].y);
            // A single tap still leaves a dot
            if (mark.points.length === 1) ctx.lineTo(mark.points[0].x + 0.1, mark.points[0].y);
            for (const p of mark.points.slice(1)) ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        ctx.restore();
    }
}

/**
 * Draws the picture with its marks, cut to the crop if there is one, and returns it as a new file with the same
 * name and, where the browser can write it, the same type.
 */
export async function exportEditedImage(
    image: CanvasImageSource & { naturalWidth: number; naturalHeight: number },
    file: File,
    marks: Mark[],
    crop: Rect | null,
): Promise<File> {
    const area = crop ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.width);
    canvas.height = Math.round(area.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");

    ctx.translate(-area.x, -area.y);
    ctx.drawImage(image, 0, 0);
    drawMarks(ctx, marks);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.92));
    if (!blob) throw new Error("Could not save the picture");
    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
}
