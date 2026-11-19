/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * The bytEM tab: the demand side of the bytEM PWA's public index page, copied, searching every market the user
 * added at once. The map, its markers, the legend and the DEID panel follow the PWA's LandingPageMap and
 * SupplyIndexExplorer; what differs is that entries come from several markets and the legend lets a reader hide
 * classes, as many markets bring many classes.
 */

import "leaflet/dist/leaflet.css";
import React, { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Control, DomEvent, DomUtil, divIcon, latLngBounds, type DivIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { sleep } from "matrix-js-sdk/src/utils";

import logo from "../../../../res/img/bytem-logo.png";
import { ModuleApi } from "../../../modules/Api";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import { useSettingValue } from "../../../hooks/useSettings";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";

/** The screen (`#/bytem`) and the space bar key of the bytEM tab. */
const BYTEM_TAB = "bytem";
/** The bytEM network's list of markets, offered when adding one. */
const MARKET_LIST = "https://bytem.app/markets/bytem-market-list.json";

// From the PWA: the map loads every match once and finds what is in view itself.
const LOAD_LIMIT = 100000;
const DRAW_LIMIT = 500;
const GRID_COLUMNS = 40;
const MAP_FIELDS = "deid,label,class,schema,location";
const FIT_MAX_ZOOM = 12;
const FIT_PADDING = 32;
const LOCK_MARGIN = 1.5;
const ICON_PX = 26;
const ICON_ROW = 4;
const SEARCH_DEBOUNCE_MS = 200;
const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
const DEFAULT_ZOOM = 5;
const FALLBACK_COLORS = ["#1677ff", "#d4380d", "#389e0d", "#722ed1", "#08979c", "#c41d7f", "#d48806"];
const PIN_COLOR = "#0b57d0";
// The page sends no Referer (index.html says no-referrer), and OpenStreetMap blocks tile requests without one, so
// map pictures send the app's origin.
const TILE_REFERRER_POLICY = "strict-origin-when-cross-origin";
const BACKGROUNDS = [
    {
        name: "Map",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        picture: "https://tile.openstreetmap.org/5/16/10.png",
    },
    {
        name: "Satellite",
        url: "https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}",
        attribution: '<a href="https://versatiles.org/sources/">VersaTiles sources</a>',
        picture: "https://tiles.versatiles.org/tiles/satellite/5/16/10",
    },
];
/** How many classes the legend lists before "more". */
const LEGEND_SHOWN = 8;

// The exchange: the room bytEM marks as a demand room and how the request is followed.
const ROOM_BASE_TYPES = ["bytem.app.room-base-type", "room-base-type"];
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const JOIN_ATTEMPTS = 5;

/** A public index entry, with the market it came from. */
interface Entry {
    key: string;
    market: string;
    deid: string;
    label?: string;
    class: string;
    schema?: string;
    location?: { lat?: number; lon?: number; location_mode?: string };
}

type Area = { west: number; south: number; east: number; north: number };
type Pin = [number, number];
type Request = { status: "requesting" | "delivered" | "failed"; roomId?: string; error?: string };

/** Whether bytEM delivers data into this room: its base type event says `demand`. */
export function isBytemDemandRoom(room: Room): boolean {
    return ROOM_BASE_TYPES.some((type) =>
        room.currentState.getStateEvents(type).some((event) => event.getContent().base_type === "demand"),
    );
}

/** The host of a market from what the user typed, a host or a URL on the market; null when it is not one. */
export function marketHost(input: string): string | null {
    const text = input.trim();
    if (!text) return null;
    try {
        const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase();
        return host.includes(".") && !/^[\d.]+$/.test(host) && !host.startsWith("[") ? host : null;
    } catch {
        return null;
    }
}

/** A class URL as its name: the last path segment. */
const className = (uri: string): string => uri.replace(/\/+$/, "").split("/").pop() || uri;
/** A class's icon is the .svg beside its class file. */
const iconUrl = (cls: string): string => `${cls}.svg`;
const isPlaced = (entry: Entry): boolean =>
    Number.isFinite(Number(entry.location?.lat)) &&
    Number.isFinite(Number(entry.location?.lon)) &&
    entry.location?.location_mode !== "user_input";

/** Calls a market's API and returns the `data` of its answer, or null on 404. Throws the market's message. */
async function callMarket<T>(market: string, path: string, init?: RequestInit): Promise<T | null> {
    const response = await fetch(`https://${market}${path}`, init);
    if (response.status === 404) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message || response.statusText);
    return body?.data as T;
}

// The colour a schema's own map style gives its points, as on the PWA's map.
const styleColors = new Map<string, Promise<string | null>>();
function schemaColor(schema: string): Promise<string | null> {
    let color = styleColors.get(schema);
    if (!color) {
        color = fetch(schema, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : null))
            .then((doc) => (typeof doc?.styleUrl === "string" ? fetch(doc.styleUrl).then((res) => res.json()) : null))
            .then((style) => {
                const rules: { type?: string; style?: { fillColor?: string; strokeColor?: string } }[] = Array.isArray(
                    style?.rules,
                )
                    ? style.rules
                    : [];
                const rule = rules.find((r) => r.type === "Point") || rules[0];
                return rule?.style?.fillColor || rule?.style?.strokeColor || null;
            })
            .catch(() => null);
        styleColors.set(schema, color);
    }
    return color;
}

// One marker icon per class, colour, place in its row and selection, so a re-render does not rebuild the markers.
const iconCache = new Map<string, DivIcon>();
function classIcon(cls: string, color: string, dx: number, dy: number, selected: boolean): DivIcon {
    const key = [cls, color, dx, dy, selected].join("|");
    let icon = iconCache.get(key);
    if (!icon) {
        const ring = document.createElement("span");
        ring.className = "landingPageMapIcon";
        ring.style.borderColor = color;
        if (selected) {
            ring.style.outline = `3px solid ${PIN_COLOR}`;
            ring.style.outlineOffset = "2px";
        }
        const img = document.createElement("img");
        img.src = iconUrl(cls);
        img.alt = "";
        // A class without an icon file keeps its ring
        img.setAttribute("onerror", "this.style.visibility='hidden'");
        ring.append(img);
        icon = divIcon({
            className: "landingPageMapIconWrap",
            iconSize: [ICON_PX, ICON_PX],
            iconAnchor: [ICON_PX / 2 - dx, ICON_PX / 2 - dy],
            html: ring.outerHTML,
        });
        iconCache.set(key, icon);
    }
    return icon;
}

/** One button above the zoom buttons: it shows the other background and a click switches to it. */
export function BaseLayers(): JSX.Element {
    const map = useMap();
    const [shown, setShown] = useState(0);
    const [box, setBox] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const control = new Control({ position: "bottomleft" });
        control.onAdd = () => {
            const element = DomUtil.create("div", "leaflet-bar");
            DomEvent.disableClickPropagation(element);
            setBox(element);
            return element;
        };
        control.addTo(map);
        return () => {
            control.remove();
        };
    }, [map]);
    const background = BACKGROUNDS[shown];
    const next = BACKGROUNDS[(shown + 1) % BACKGROUNDS.length];
    return (
        <>
            <TileLayer
                key={background.name}
                attribution={background.attribution}
                url={background.url}
                maxZoom={19}
                referrerPolicy={TILE_REFERRER_POLICY}
            />
            <ZoomControl position="bottomleft" />
            {box &&
                createPortal(
                    <button
                        type="button"
                        onClick={() => setShown((shown + 1) % BACKGROUNDS.length)}
                        aria-label={`Show ${next.name}`}
                        style={{
                            position: "relative",
                            display: "block",
                            width: 56,
                            height: 56,
                            padding: 0,
                            border: 0,
                            cursor: "pointer",
                        }}
                    >
                        {/* An img, not a CSS background, as only an img can send the Referer the tiles need */}
                        <img
                            src={next.picture}
                            alt=""
                            referrerPolicy={TILE_REFERRER_POLICY}
                            style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        <span
                            style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                bottom: 0,
                                font: "600 11px/18px sans-serif",
                                color: "#fff",
                                background: "rgba(0, 0, 0, 0.55)",
                            }}
                        >
                            {next.name}
                        </span>
                    </button>,
                    box,
                )}
        </>
    );
}

/** Frames the matches and keeps the map from being dragged or zoomed away from them. */
function FitToMatches({ points }: { points: [number, number][] }): null {
    const map = useMap();
    useEffect(() => {
        if (!points.length) return;
        const lats = points.map(([lat]) => lat);
        const lons = points.map(([, lon]) => lon);
        const pad =
            Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons)) * LOCK_MARGIN;
        const lock = latLngBounds(
            [Math.min(...lats) - pad, Math.min(...lons) - pad],
            [Math.max(...lats) + pad, Math.max(...lons) + pad],
        );
        map.setMaxBounds(lock);
        map.setMinZoom(map.getBoundsZoom(lock));
        map.fitBounds(points, { padding: [FIT_PADDING, FIT_PADDING], maxZoom: FIT_MAX_ZOOM });
    }, [map, points]);
    return null;
}

/** Reports the area in view after every move. */
function ViewportWatcher({ onChange }: { onChange: (area: Area) => void }): null {
    const map = useMap();
    useEffect(() => {
        const report = (): void => {
            const b = map.getBounds();
            onChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
        };
        report();
        map.on("moveend", report);
        return () => {
            map.off("moveend", report);
        };
    }, [map, onChange]);
    return null;
}

/** A click on the map picks that place. */
function PinDropper({ onPin }: { onPin: (point: Pin) => void }): null {
    useMapEvents({ click: (event) => onPin([event.latlng.lat, event.latlng.lng]) });
    return null;
}

/**
 * Has the market deliver a DEID's data and returns the room's ID. The market makes or reuses a demand room on its
 * own homeserver and invites the user, who joins it once the market reports the room.
 */
export async function exchangeIntoRoom(client: MatrixClient, entry: Entry, pin: Pin | null): Promise<string> {
    const answer = await callMarket<{ request_id?: string }>(entry.market, "/api/demand/access-by-deid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            deid: entry.deid,
            matrix_user: client.getSafeUserId(),
            location: pin ? { lat: pin[0], lon: pin[1] } : null,
        }),
    });
    if (!answer?.request_id) throw new Error("This market does not take exchange requests.");

    let roomId: string | undefined;
    const statusPath = `/api/demand/access-by-deid-status/${encodeURIComponent(answer.request_id)}`;
    for (const deadline = Date.now() + POLL_TIMEOUT_MS; !roomId && Date.now() < deadline;) {
        await sleep(POLL_INTERVAL_MS);
        const status = await callMarket<{ status: string; room_id?: string; reason?: string }>(
            entry.market,
            statusPath,
        );
        if (!status) throw new Error("The market lost track of the request.");
        if (status.status === "failed" || status.status === "error") {
            throw new Error(status.reason || "The exchange failed.");
        }
        if (status.room_id && ["delivering", "completed", "ready"].includes(status.status)) roomId = status.room_id;
    }
    if (!roomId) throw new Error("The market did not deliver in time. The data may still arrive in your rooms.");

    // The invite crosses federation, so it may not have arrived yet
    for (let attempt = 1; ; attempt++) {
        try {
            await client.joinRoom(roomId);
            return roomId;
        } catch (error) {
            if (attempt >= JOIN_ATTEMPTS) throw error;
            await sleep(POLL_INTERVAL_MS);
        }
    }
}

/** The markets the user added, and a field to add one, offering the markets on the bytEM market list. */
function Markets({ markets, errors }: { markets: string[]; errors: Record<string, string> }): JSX.Element {
    const [input, setInput] = useState("");
    const [listed, setListed] = useState<string[]>([]);
    useEffect(() => {
        fetch(MARKET_LIST)
            .then((res) => res.json())
            .then((list: Array<string | { app: string }>) =>
                setListed(list.map((m) => (typeof m === "string" ? m : m.app))),
            )
            .catch(() => {});
    }, []);
    const save = (next: string[]): void => {
        void SettingsStore.setValue("bytemMarkets", null, SettingLevel.ACCOUNT, next);
    };
    const host = marketHost(input);

    return (
        <div className="indexChips" aria-label="Markets">
            {markets.map((market) => (
                <span
                    key={market}
                    className={errors[market] ? "indexChip indexChipError" : "indexChip"}
                    title={errors[market]}
                >
                    {market}
                    {errors[market] && <span>unreachable</span>}
                    <button
                        type="button"
                        aria-label={`Remove ${market}`}
                        onClick={() => save(markets.filter((m) => m !== market))}
                    >
                        ×
                    </button>
                </span>
            ))}
            <form
                className="indexChip indexChipAdd"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!host) return;
                    if (!markets.includes(host)) save([...markets, host]);
                    setInput("");
                }}
            >
                <input
                    list="bytem-markets"
                    value={input}
                    placeholder="Add a market"
                    aria-label="Add a market"
                    onChange={(event) => setInput(event.target.value)}
                />
                <datalist id="bytem-markets">
                    {listed
                        .filter((m) => !markets.includes(m))
                        .map((m) => (
                            <option key={m} value={m} />
                        ))}
                </datalist>
                <button type="submit" disabled={!host}>
                    +
                </button>
            </form>
        </div>
    );
}

/** The selected DEID: what it is, where it comes from, and the exchange. */
function DeidPanel({
    entry,
    pin,
    request,
    onRequest,
    onClose,
}: {
    entry: Entry;
    pin: Pin | null;
    request?: Request;
    onRequest: () => void;
    onClose: () => void;
}): JSX.Element {
    const asksPlace = entry.location?.location_mode === "user_input";
    const openRoom = (): void => {
        if (!request?.roomId) return;
        defaultDispatcher.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: request.roomId,
            metricsTrigger: undefined,
        });
    };
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <aside className="deidPanel" aria-labelledby="deid-panel-title">
            <header className="deidPanelHeader">
                <div className="deidPanelHeadline">
                    <h2 id="deid-panel-title">{entry.label || entry.deid}</h2>
                    <code translate="no">{entry.deid}</code>
                    <code>{entry.market}</code>
                </div>
                <button type="button" className="deidPanelClose" aria-label="Close panel" onClick={onClose}>
                    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path
                            d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </header>
            <section className="deidPanelSection">
                {asksPlace && request?.status !== "delivered" && (
                    <p className="deidPanelPrompt">
                        {pin
                            ? `Location: ${pin[0].toFixed(6)}, ${pin[1].toFixed(6)}. Click another spot on the map to move it.`
                            : "Select location and exchange data to location"}
                    </p>
                )}
                {request?.status === "delivered" ? (
                    <button type="button" className="deidPanelExchange" onClick={openRoom}>
                        Open room
                    </button>
                ) : (
                    <button
                        type="button"
                        className="deidPanelExchange"
                        disabled={request?.status === "requesting" || (asksPlace && !pin)}
                        onClick={onRequest}
                    >
                        {request?.status === "requesting" ? "Requesting…" : "Request access"}
                    </button>
                )}
                {request?.status === "failed" && (
                    <p className="deidPanelNote" role="alert">
                        {request.error}
                    </p>
                )}
            </section>
        </aside>
    );
}

/** The bytEM page: search across the added markets, the map with its legend, and the selected DEID. */
function BytemPage(): JSX.Element {
    const client = useMatrixClientContext();
    const markets = useSettingValue("bytemMarkets");
    const [input, setInput] = useState("");
    const [query, setQuery] = useState("");
    const [entries, setEntries] = useState<Entry[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [area, setArea] = useState<Area | null>(null);
    const [colors, setColors] = useState<Record<string, string>>({});
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [allClasses, setAllClasses] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [pin, setPin] = useState<Pin | null>(null);
    const [requests, setRequests] = useState<Record<string, Request>>({});

    useEffect(() => {
        const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [input]);

    // Every market at once; a market that fails is named on its chip, the others still show
    const marketKey = markets.join(",");
    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ fields: MAP_FIELDS, limit: String(LOAD_LIMIT) });
        if (query) params.set("q", query);
        void Promise.allSettled(
            markets.map((market) =>
                callMarket<{ entries?: Omit<Entry, "key" | "market">[] }>(market, `/api/index?${params}`, {
                    signal: controller.signal,
                }).then((data) =>
                    (data?.entries ?? []).map((e): Entry => ({ ...e, market, key: `${market} ${e.deid}` })),
                ),
            ),
        ).then((answers) => {
            if (controller.signal.aborted) return;
            setEntries(answers.flatMap((a) => (a.status === "fulfilled" ? a.value : [])));
            setErrors(
                Object.fromEntries(
                    answers.flatMap((a, i) =>
                        a.status === "rejected" ? [[markets[i], String(a.reason?.message ?? a.reason)]] : [],
                    ),
                ),
            );
        });
        return () => controller.abort();
        // marketKey stands for markets
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [marketKey, query]);

    // Classes in order of first appearance, so a class's fallback colour stays put while the reader pans
    const classes = useMemo(() => [...new Set(entries.map((entry) => entry.class))], [entries]);
    useEffect(() => {
        let cancelled = false;
        const schemaOf = new Map(entries.filter((e) => e.schema).map((e) => [e.class, e.schema!]));
        for (const [cls, schema] of schemaOf) {
            void schemaColor(schema).then((color) => {
                if (!cancelled && color) setColors((prev) => (prev[cls] ? prev : { ...prev, [cls]: color }));
            });
        }
        return () => {
            cancelled = true;
        };
    }, [entries]);
    const colorOf = (cls: string): string =>
        colors[cls] || FALLBACK_COLORS[Math.max(0, classes.indexOf(cls)) % FALLBACK_COLORS.length];

    const unplaced = useMemo(() => entries.filter((entry) => !isPlaced(entry)), [entries]);
    const allGroups = useMemo(() => {
        const byPoint = new Map<string, Entry[]>();
        for (const entry of entries) {
            if (!isPlaced(entry) || hidden.has(entry.class)) continue;
            const key = `${Number(entry.location?.lat)},${Number(entry.location?.lon)}`;
            byPoint.set(key, [...(byPoint.get(key) ?? []), entry]);
        }
        return [...byPoint.entries()].map(([key, list], rank) => {
            const [lat, lon] = key.split(",").map(Number);
            return { lat, lon, list, rank };
        });
    }, [entries, hidden]);
    const fitPoints = useMemo(
        () => entries.filter(isPlaced).map((e): [number, number] => [Number(e.location?.lat), Number(e.location?.lon)]),
        [entries],
    );

    // What the view shows: every entry in view, or one per grid cell past DRAW_LIMIT points (as on the PWA).
    // The legend counts every class in view, the hidden ones too, so they can be shown again.
    const { markers, inView, viewClasses } = useMemo(() => {
        const within = (lat: number, lon: number): boolean =>
            !!area && lat >= area.south && lat <= area.north && lon >= area.west && lon <= area.east;
        const visible = allGroups.filter((g) => within(g.lat, g.lon));
        const sampled = !!area && visible.length > DRAW_LIMIT;
        let shown = visible;
        if (area && sampled) {
            const cell = (area.east - area.west) / GRID_COLUMNS;
            const firstInCell = new Map<string, (typeof visible)[number]>();
            for (const g of visible) {
                const key = `${Math.floor(g.lat / cell)},${Math.floor(g.lon / cell)}`;
                const held = firstInCell.get(key);
                if (!held || g.rank < held.rank) firstInCell.set(key, g);
            }
            shown = [...firstInCell.values()];
        }
        const counts = new Map<string, number>();
        for (const entry of entries) {
            if (isPlaced(entry) && within(Number(entry.location?.lat), Number(entry.location?.lon))) {
                counts.set(entry.class, (counts.get(entry.class) ?? 0) + 1);
            }
        }
        return {
            markers: shown.flatMap(({ lat, lon, list }) => {
                const drawnList = sampled ? [list.find((e) => e.key === selected) ?? list[0]] : list;
                const columns = Math.min(drawnList.length, ICON_ROW);
                const rows = Math.ceil(drawnList.length / columns);
                return drawnList.map((entry, i) => ({
                    entry,
                    lat,
                    lon,
                    dx: ((i % columns) - (columns - 1) / 2) * ICON_PX,
                    dy: (Math.floor(i / columns) - (rows - 1) / 2) * ICON_PX,
                }));
            }),
            inView: visible.reduce((sum, g) => sum + g.list.length, 0),
            viewClasses: [...counts.entries()].sort((a, b) => b[1] - a[1]),
        };
    }, [allGroups, area, entries, selected]);

    const selectedEntry = entries.find((entry) => entry.key === selected);
    const asksPlace = selectedEntry?.location?.location_mode === "user_input";
    const onArea = useCallback((next: Area) => setArea(next), []);
    const toggleClass = (cls: string): void =>
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(cls)) next.delete(cls);
            else next.add(cls);
            return next;
        });
    const select = (key: string | null): void => {
        setSelected(key === selected ? null : key);
        setPin(null);
    };
    const request = async (entry: Entry): Promise<void> => {
        setRequests((prev) => ({ ...prev, [entry.key]: { status: "requesting" } }));
        try {
            const roomId = await exchangeIntoRoom(client, entry, asksPlace ? pin : null);
            setRequests((prev) => ({ ...prev, [entry.key]: { status: "delivered", roomId } }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setRequests((prev) => ({ ...prev, [entry.key]: { status: "failed", error: message } }));
        }
    };
    const legendClasses = allClasses ? viewClasses : viewClasses.slice(0, LEGEND_SHOWN);

    return (
        <main className="mx_BytemTab">
            <div className="indexTools">
                <div className="indexSearchRow">
                    <label className="indexSearchField">
                        Search all markets
                        <input
                            type="search"
                            value={input}
                            placeholder="Words, a place or a DEID"
                            onChange={(event) => setInput(event.target.value)}
                        />
                    </label>
                </div>
                <Markets markets={markets} errors={errors} />
            </div>
            <div className="indexMapBox">
                <section className="landingPageMap" aria-label="Map">
                    <div className={`landingPageMapFrame${asksPlace ? " landingPageMapPicking" : ""}`}>
                        <MapContainer
                            center={DEFAULT_CENTER}
                            zoom={DEFAULT_ZOOM}
                            zoomControl={false}
                            scrollWheelZoom
                            preferCanvas
                            style={{ height: "100%", width: "100%" }}
                        >
                            <BaseLayers />
                            <FitToMatches points={fitPoints} />
                            {asksPlace && <PinDropper onPin={setPin} />}
                            <ViewportWatcher onChange={onArea} />
                            {markers.map(({ entry, lat, lon, dx, dy }) => (
                                <Marker
                                    key={entry.key}
                                    position={[lat, lon]}
                                    title={`${entry.label || entry.deid} · ${entry.market}`}
                                    icon={classIcon(entry.class, colorOf(entry.class), dx, dy, entry.key === selected)}
                                    zIndexOffset={entry.key === selected ? 1000 : 0}
                                    eventHandlers={{ click: () => select(entry.key) }}
                                />
                            ))}
                            {pin && (
                                <>
                                    <CircleMarker
                                        center={pin}
                                        radius={16}
                                        interactive={false}
                                        pathOptions={{
                                            color: PIN_COLOR,
                                            weight: 3,
                                            fillColor: PIN_COLOR,
                                            fillOpacity: 0.15,
                                        }}
                                    />
                                    <CircleMarker
                                        center={pin}
                                        radius={6}
                                        interactive={false}
                                        pathOptions={{
                                            color: "#ffffff",
                                            weight: 2,
                                            fillColor: PIN_COLOR,
                                            fillOpacity: 1,
                                        }}
                                    />
                                </>
                            )}
                        </MapContainer>
                        <div className="landingPageMapLegend">
                            <span className="landingPageMapCount" aria-live="polite">
                                {markets.length === 0
                                    ? "Add a market to see its data."
                                    : inView > markers.length
                                      ? `Showing ${markers.length} of ${inView} entries in this area. Zoom in to see all.`
                                      : `${inView} ${inView === 1 ? "entry" : "entries"} in this area`}
                            </span>
                            {legendClasses.map(([cls, count]) => (
                                <button
                                    key={cls}
                                    type="button"
                                    className="landingPageMapClass"
                                    title={cls}
                                    aria-pressed={!hidden.has(cls)}
                                    onClick={() => toggleClass(cls)}
                                >
                                    <span className="landingPageMapIcon" style={{ borderColor: colorOf(cls) }}>
                                        <img src={iconUrl(cls)} alt="" />
                                    </span>
                                    {className(cls)}
                                    <small>{count}</small>
                                </button>
                            ))}
                            {viewClasses.length > LEGEND_SHOWN && (
                                <button
                                    type="button"
                                    className="landingPageMapMore"
                                    onClick={() => setAllClasses(!allClasses)}
                                >
                                    {allClasses ? "Fewer" : `${viewClasses.length - LEGEND_SHOWN} more`}
                                </button>
                            )}
                            {hidden.size > 0 && (
                                <button
                                    type="button"
                                    className="landingPageMapMore"
                                    onClick={() => setHidden(new Set())}
                                >
                                    Show all classes
                                </button>
                            )}
                            {unplaced.length > 0 && (
                                <div className="landingPageMapUnplaced">
                                    <span className="landingPageMapCount">Select DEID / Data</span>
                                    {unplaced.map((entry) => (
                                        <button
                                            key={entry.key}
                                            type="button"
                                            className="landingPageMapClass"
                                            title={entry.market}
                                            aria-current={entry.key === selected || undefined}
                                            onClick={() => select(entry.key)}
                                        >
                                            <span
                                                className="landingPageMapIcon"
                                                style={{ borderColor: colorOf(entry.class), borderStyle: "dashed" }}
                                            >
                                                <img src={iconUrl(entry.class)} alt="" />
                                            </span>
                                            {entry.label || entry.deid}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                {selectedEntry && (
                    <DeidPanel
                        entry={selectedEntry}
                        pin={pin}
                        request={requests[selectedEntry.key]}
                        onRequest={() => void request(selectedEntry)}
                        onClose={() => select(null)}
                    />
                )}
            </div>
        </main>
    );
}

/** Adds the bytEM tab to the space bar: it lists the rooms bytEM delivered data into and opens the bytEM page. */
export function registerBytemTab(): void {
    ModuleApi.instance.navigation.registerLocationRenderer(BYTEM_TAB, () => <BytemPage />);
    ModuleApi.instance.extras.setSpacePanelItem(BYTEM_TAB, {
        label: "bytEM",
        icon: <img className="mx_BytemTab_icon" src={logo} alt="" />,
        onSelected: () => {
            window.location.hash = `#/${BYTEM_TAB}`;
        },
    });
    ModuleApi.instance.extras.getVisibleRoomBySpaceKey(BYTEM_TAB, () =>
        (MatrixClientPeg.get()?.getRooms() ?? [])
            .filter((room) => room.getMyMembership() === KnownMembership.Join && isBytemDemandRoom(room))
            .map((room) => room.roomId),
    );
}
