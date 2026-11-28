/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { withMermaid } from "vitepress-plugin-mermaid";

function customPathResolver(href: string, currentPath: string): string {
    const [link, fragment] = href.split("#", 2);
    if (currentPath === "index.md") {
        if (link.startsWith("./docs/")) {
            return `../docs/${href.slice(7)}`;
        } else if (link.startsWith("docs/")) {
            return `../${href}`;
        }
    }

    switch (link) {
        case "../packages/shared-components/README.md":
            return `../docs/readme-shared-components.md#${fragment}`;
        case "../apps/web/README.md":
            return `../docs/readme-element-web.md#${fragment}`;
        case "../README.md":
            return `../docs/index.md#${fragment}`;

        default:
            return `https://github.com/element-hq/element-web/blob/develop/${href.split("/").pop()}`;
    }
}

// https://vitepress.dev/reference/site-config
export default withMermaid({
    title: "Element Web & Desktop docs",
    description: "Documentation",
    // Notes for this fork, which link to source files rather than to pages of the site
    srcExclude: ["fork/**"],
    markdown: {
        config: (md) => {
            // Custom rule to fix links
            const defaultRender =
                md.renderer.rules.link_open ||
                function (tokens, idx, options, env, self) {
                    return self.renderToken(tokens, idx, options);
                };

            md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
                const token = tokens[idx];
                const hrefIndex = token.attrIndex("href");

                if (hrefIndex >= 0) {
                    const href = token.attrs![hrefIndex][1];

                    if (!href.includes("://") && href.split("#", 2)[0].endsWith(".md")) {
                        token.attrs![hrefIndex][1] = customPathResolver(href, env.relativePath);
                    }
                }
                return defaultRender(tokens, idx, options, env, self);
            };
        },
    },
    themeConfig: {
        nav: [
            { text: "Home", link: "/" },
            { text: "Website", link: "https://element.io/en" },
        ],

        search: {
            provider: "local",
        },

        sidebar: [
            {
                text: "README",
                items: [
                    { text: "Introduction", link: "/index" },
                    { text: "Element Web", link: "/readme-element-web" },
                    { text: "Shared Components", link: "/readme-shared-components" },
                ],
            },
            {
                text: "Usage",
                items: [{ text: "Labs", link: "/labs" }],
            },
            {
                text: "Usage",
                items: [{ text: "Labs", link: "/labs" }],
            },
            {
                text: "Setup",
                items: [
                    { text: "Install", link: "/install" },
                    { text: "Config", link: "/config" },
                    { text: "Encryption", link: "/e2ee" },
                    { text: "Desktop app", link: "/desktop" },
                ],
            },
            {
                text: "Development",
                items: [
                    { text: "Monorepo", link: "/monorepo" },
                    { text: "App load order", link: "/app-load" },
                    { text: "MVVM", link: "/MVVM" },
                    { text: "Theming", link: "/theming" },
                    { text: "Settings", link: "/settings" },
                    { text: "Feature flags", link: "/feature-flags" },
                    { text: "OAuth and delegated authentication", link: "/oauth" },
                    { text: "Playwright end to end tests", link: "/playwright" },
                ],
            },
            {
                text: "Deep dive",
                items: [
                    { text: "Composer and keyboard shortcuts", link: "/composer" },
                    { text: "Cider editor", link: "/ciderEditor" },
                    { text: "Room List", link: "/room-list" },
                    { text: "Usercontent", link: "/usercontent" },
                ],
            },
        ],

        socialLinks: [{ icon: "github", link: "https://github.com/element-hq/element-web" }],
    },
});
