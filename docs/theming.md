# Theming Element

Themes are a very basic way of providing simple alternative look & feels to the
Element app via CSS & custom imagery.

Each built-in theme lives in `apps/web/res/themes/<name>/css/`. The built-in themes are `light`, `light-high-contrast`,
`light-sand` and `dark`; `light-sand` is the smallest example to copy. To add one, for example `teal`:

1.  Copy `res/themes/light-sand/css/light-sand.pcss` to `res/themes/teal/css/teal.pcss`. It imports the light theme's
    variables (`light/css/_light.pcss`), then the file with this theme's own values. A dark theme starts from
    `dark/css/dark.pcss` instead, which also imports `_dark.pcss`.
2.  Create `res/themes/teal/css/_teal.pcss` with only the variables that differ, and import it in `teal.pcss` in place
    of `_light-sand.pcss`.
3.  Add `"theme-teal": "./res/themes/teal/css/teal.pcss"` to the theme entry points in `apps/web/webpack.config.ts`.
4.  Add the theme and its translated name to `BUILTIN_THEMES` in `enumerateThemes()` in `apps/web/src/theme.ts`, and
    run `pnpm i18n`.

# Custom Themes

Themes derived from the built in themes may also be defined in settings.

Custom themes can also be added at runtime from a URL pointing at a JSON theme
definition: open the developer tools (`/devtools`) and pick **Custom themes**
under the **Other** category. Themes added this way remember the URL they came
from, so they can be re-downloaded from that same panel when the theme changes.

To avoid name collisions, the internal name of a theme is
`custom-${theme.name}`. So if you want to set the custom theme below as the
default theme, you would use `default_theme: "custom-Electric Blue"`.

e.g. in config.json:

```json5
"setting_defaults": {
        "custom_themes": [
            {
                "name": "Electric Blue",
                "is_dark": false,
                "fonts": {
                    "faces": [
                        {
                            "font-family": "Inter",
                            "src": [{"url": "/fonts/Inter.ttf", "format": "truetype"}]
                        }
                    ],
                    "general": "Inter, sans",
                    "monospace": "'Courier New'"
                },
                "colors": {
                    "accent-color": "#3596fc",
                    "primary-color": "#368bd6",
                    "warning-color": "#ff4b55",
                    "sidebar-color": "#27303a",
                    "roomlist-background-color": "#f3f8fd",
                    "roomlist-text-color": "#2e2f32",
                    "roomlist-text-secondary-color": "#61708b",
                    "roomlist-highlights-color": "#ffffff",
                    "roomlist-separator-color": "#e3e8f0",
                    "timeline-background-color": "#ffffff",
                    "timeline-text-color": "#2e2f32",
                    "timeline-text-secondary-color": "#61708b",
                    "timeline-highlights-color": "#f3f8fd",

                    // These should both be 8 values long
                    "username-colors": ["#ff0000", /*...*/],
                    "avatar-background-colors": ["#cc0000", /*...*/]
                },
                "compound": {
                    "--cpd-color-icon-accent-tertiary": "var(--cpd-color-blue-800)",
                    "--cpd-color-text-action-accent": "var(--cpd-color-blue-900)"
                }
            }, {
                "name": "Deep Purple",
                "is_dark": true,
                "colors": {
                    "accent-color": "#6503b3",
                    "primary-color": "#368bd6",
                    "warning-color": "#b30356",
                    "sidebar-color": "#15171B",
                    "roomlist-background-color": "#22262E",
                    "roomlist-text-color": "#A1B2D1",
                    "roomlist-text-secondary-color": "#EDF3FF",
                    "roomlist-highlights-color": "#343A46",
                    "roomlist-separator-color": "#a1b2d1",
                    "timeline-background-color": "#181b21",
                    "timeline-text-color": "#EDF3FF",
                    "timeline-text-secondary-color": "#A1B2D1",
                    "timeline-highlights-color": "#22262E"
                }
            }
        ]
    }
```

`compound` may contain overrides for any [semantic design token](https://compound.element.io/?path=/docs/tokens-semantic-colors--docs) belonging to our design system. The above example shows how you might change the accent color to blue by setting the relevant semantic tokens to refer to blue [base tokens](https://compound.element.io/?path=/docs/tokens-color-palettes--docs).

All properties in `fonts` are optional, and fall back to the app's standard fonts.
