/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type Locator, type Page } from "@playwright/test";

/** Where the UX harness writes its screenshots and measurements. */
export const UX_OUT = process.env.UX_OUT ?? "playwright/test-results/ux";

// Keystroke-Level Model times in seconds (Card, Moran and Newell): an estimate of how long a practised user
// needs, which stays comparable between builds because it does not depend on how fast the test machine is.
const KLM = {
    /** One key press, average typist. */
    key: 0.28,
    /** Pointing at a target with the mouse. */
    point: 1.1,
    /** Pressing and releasing the mouse button. */
    click: 0.2,
    /** Moving a hand between the mouse and the keyboard. */
    home: 0.4,
    /** Deciding what to do next, once per step. */
    think: 1.35,
};

interface Step {
    /** What the user does, in the words they would use. */
    what: string;
    clicks: number;
    keys: number;
    /** Milliseconds until the app showed the result of this step. */
    responseMs: number;
}

/** The measurements of one journey, as written to the results file. */
interface JourneyResult {
    task: string;
    /** Number of separate things the user did. */
    steps: number;
    clicks: number;
    keys: number;
    /** Keystroke-Level Model estimate of the time a practised user needs, in seconds. */
    klmSeconds: number;
    /** The slowest wait for the app in any step, in milliseconds. */
    slowestResponseMs: number;
    /** Places where the user had to guess, hit an error or had no way forward. */
    problems: string[];
    detail: Step[];
}

/**
 * Performs a task the way a user would and counts what it costs them: steps, clicks, key presses and how long
 * the app took to answer each one.
 */
export class Journey {
    private readonly detail: Step[] = [];
    private readonly problems: string[] = [];
    private device: "mouse" | "keyboard" | null = null;
    private homing = 0;

    public constructor(
        private readonly page: Page,
        private readonly task: string,
    ) {}

    private use(device: "mouse" | "keyboard"): void {
        if (this.device && this.device !== device) this.homing++;
        this.device = device;
    }

    private async record(what: string, clicks: number, keys: number, act: () => Promise<void>, result?: Locator) {
        const start = performance.now();
        try {
            await act();
            if (result) await result.first().waitFor({ state: "visible", timeout: 10000 });
        } catch (e) {
            // Keep what the user was looking at when the step failed
            const file = `${UX_OUT}/failed/${slug(this.task)}`;
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(`${file}.yml`, `# ${what}\n${await this.page.locator("body").ariaSnapshot()}`);
            await this.page.screenshot({ path: `${file}.png` });
            throw e;
        }
        this.detail.push({ what, clicks, keys, responseMs: Math.round(performance.now() - start) });
    }

    /** Click a target; `result` is what the user then expects to see. */
    public async click(what: string, target: Locator, result?: Locator): Promise<void> {
        this.use("mouse");
        await this.record(what, 1, 0, () => target.click(), result);
    }

    /** Right-click a target to open its menu. */
    public async rightClick(what: string, target: Locator, result?: Locator): Promise<void> {
        this.use("mouse");
        await this.record(what, 1, 0, () => target.click({ button: "right" }), result);
    }

    /** Move the mouse over a target, as needed for controls that only show on hover. Costs a pointing move. */
    public async hover(what: string, target: Locator, result?: Locator): Promise<void> {
        this.use("mouse");
        await this.record(what, 0, 0, () => target.hover(), result);
    }

    /** Type text into the field that has the focus. */
    public async type(what: string, text: string, result?: Locator): Promise<void> {
        this.use("keyboard");
        await this.record(what, 0, [...text].length, () => this.page.keyboard.type(text), result);
    }

    /** Press one key or shortcut, e.g. `Enter` or `Control+k`. */
    public async press(what: string, shortcut: string, result?: Locator): Promise<void> {
        this.use("keyboard");
        await this.record(what, 0, shortcut.split("+").length, () => this.page.keyboard.press(shortcut), result);
    }

    /** A step outside the app that still costs the user one action, such as picking a file in the system dialog. */
    public async outside(what: string, act: () => Promise<void>, result?: Locator): Promise<void> {
        this.use("mouse");
        await this.record(what, 1, 0, act, result);
    }

    /** Note a place where the user had to guess, hit an error or had no way forward. */
    public problem(text: string): void {
        this.problems.push(text);
    }

    /** Save a screenshot of the current state, named after the task. */
    public async shot(name: string): Promise<void> {
        await this.page.screenshot({ path: `${UX_OUT}/shots/${slug(this.task)}-${name}.png` });
    }

    /** Add up the journey and write it to the results folder. */
    public finish(): JourneyResult {
        const clicks = this.detail.reduce((n, s) => n + s.clicks, 0);
        const keys = this.detail.reduce((n, s) => n + s.keys, 0);
        const pointing = this.detail.filter((s) => s.keys === 0).length;
        const klm =
            this.detail.length * KLM.think +
            pointing * KLM.point +
            clicks * KLM.click +
            keys * KLM.key +
            this.homing * KLM.home;
        const result: JourneyResult = {
            task: this.task,
            steps: this.detail.length,
            clicks,
            keys,
            klmSeconds: Math.round(klm * 10) / 10,
            slowestResponseMs: Math.max(0, ...this.detail.map((s) => s.responseMs)),
            problems: this.problems,
            detail: this.detail,
        };
        const file = `${UX_OUT}/journeys/${slug(this.task)}.json`;
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(result, null, 2));
        return result;
    }
}

/**
 * Answers the prompts a new account is shown at start-up (notifications, device verification, new-feature
 * notes) with "not now", so a journey starts from the screen a returning user sees.
 * @returns the titles of the prompts that were shown
 */
export async function quietStart(page: Page): Promise<string[]> {
    const seen: string[] = [];
    const prompt = page
        .locator(".mx_Toast_toast")
        .or(page.getByRole("dialog", { name: /^Introducing / }))
        .first();
    // Prompts replace one another as each is answered, so keep going until none is left for a moment
    for (let quiet = 0; quiet < 3;) {
        if (await prompt.isVisible()) {
            quiet = 0;
            const title = await prompt
                .getByRole("heading")
                .first()
                .textContent({ timeout: 1000 })
                .catch(() => null);
            if (title && !seen.includes(title)) seen.push(title);
            await prompt
                .getByRole("button", { name: /^(Dismiss|Later|Ok|Not now|No)$/ })
                .first()
                .click({ timeout: 1000 })
                .catch(() => {});
        } else {
            quiet++;
        }
        await page.waitForTimeout(300);
    }
    return seen;
}

function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
