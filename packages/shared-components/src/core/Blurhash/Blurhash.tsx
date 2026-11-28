/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type JSX, useEffect, useRef } from "react";
import { decode } from "blurhash";

/** Width and height in pixels of the canvas the hash is drawn on. The browser stretches it to the element's size. */
const RESOLUTION = 32;

const canvasStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    height: "100%",
};

export interface BlurhashProps {
    /** The blurhash string from the event, see MSC2448. */
    hash: string;
    /** CSS width of the placeholder. */
    width: number | string;
    /** CSS height of the placeholder. */
    height: number | string;
    /** Class name for the outer element. */
    className?: string;
}

/**
 * A blurred preview of an image, drawn from its blurhash while the image loads.
 *
 * Renders the same markup as the `react-blurhash` package it replaces: a `div` holding a small `canvas` that fills it.
 */
export function Blurhash({ hash, width, height, className }: Readonly<BlurhashProps>): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const context = canvasRef.current?.getContext("2d");
        if (!context) return;
        const image = context.createImageData(RESOLUTION, RESOLUTION);
        image.data.set(decode(hash, RESOLUTION, RESOLUTION));
        context.putImageData(image, 0, 0);
    }, [hash]);

    return (
        <div className={className} style={{ display: "inline-block", height, width, position: "relative" }}>
            <canvas ref={canvasRef} width={RESOLUTION} height={RESOLUTION} style={canvasStyle} />
        </div>
    );
}
