# Desktop app

Notes on building, debugging and updating Element Desktop (`apps/desktop`). In LiberMsg it is installed as
`element-desktop-fork`; `scripts/build-deb.sh` builds and installs the Linux package.

## Native Node modules

For some features, the desktop app uses native Node modules. These let it integrate with the desktop in ways that a
browser cannot.

Currently the only native module is [Seshat](https://github.com/matrix-org/seshat), which adds support for local event
indexing and full text search in E2E encrypted rooms.

### Adding Seshat for search in E2E encrypted rooms

Seshat is consumed via the [`@matrix-org/seshat`](https://www.npmjs.com/package/@matrix-org/seshat) npm package, which
ships prebuilt binaries for every platform Element Desktop supports as per-platform `optionalDependencies`:

| Platform | Architectures | SQLCipher |
| -------- | ------------- | --------- |
| Linux    | x64, arm64    | static    |
| macOS    | x64, arm64    | static    |
| Windows  | x64, arm64    | static    |

pnpm only installs the binary matching the machine running the install. Building for another architecture (for example
a Windows arm64 package on an x64 machine, or the macOS universal package) needs pnpm to install the extra binaries
too. This is done by adding a [`supportedArchitectures`](https://pnpm.io/settings#supportedarchitectures) block to
`pnpm-workspace.yaml` before running `pnpm install`, for example for a macOS universal build:

```yaml
supportedArchitectures:
    os: [current] # Assuming you are on "darwin"
    cpu: [x64, arm64]
```

The electron-builder configuration prunes binaries for other platforms and architectures from the packaged app, so
only the ones needed by the target end up in the package.

### Checking a Linux package

`apps/desktop/scripts/glibc-check.sh` checks every `.node` file in a packaged app to make sure it does not need a newer
glibc than the oldest supported distribution ships. Run it after upgrading Seshat; the release workflow does not run
it.

### Building from source

Should you need to build Seshat yourself, for example for an unsupported platform or to link against the system
SQLCipher, follow the instructions in the
[Seshat repository](https://github.com/matrix-org/seshat/tree/main/seshat-node#building-from-source) and use
`pnpm link` to substitute the resulting package for `@matrix-org/seshat`.

## Debugging

There are two parts of the desktop app that you might want to debug.

### The renderer process

This is the regular web app and can be debugged by choosing "Toggle developer tools" from the menu, even in packaged
builds. It then works the same as Chrome's developer tools for the web app.

### The main process

This is debugged as a Node app:

1. Open any Chrome developer tools window.
1. Start the app with the `--inspect-brk` flag.
1. Click the green Node icon that appears in the top left of the developer tools window.

You are now debugging the code of the desktop app itself.

### The main process of a packaged app

When the app is packaged, Electron's "fuses" are flipped, editing the Electron binary to turn off some features, one of
which is debugging with `--inspect-brk`. On Linux you can flip the fuse back:

```sh
sudo npx @electron/fuses write --app /opt/Element-Fork/element-desktop-fork EnableNodeCliInspectArguments=on
```

A similar command works on macOS and Windows in theory, but it breaks code signing (which is the point of fuses), so
the app would have to be signed again.

## Updates

The desktop app can update itself on macOS and Windows. The update server's base URL is set as `update_base_url` in
`config.json`, and it can be served by a static file host, CDN or object storage.

- **Windows** uses [Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows) and can be served by any
  compatible Squirrel server, such as [squirrel-server](https://github.com/Tiliq/squirrel-server).
- **macOS** uses [Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac) with its
  [JSON update file format](https://github.com/Squirrel/Squirrel.Mac#update-file-json-format).

LiberMsg's release config (`apps/desktop/element.io/release/config.json`) sets no `update_base_url`, so the app does
not update itself. New versions are installed from the GitHub release, which `.github/workflows/release.yml` builds for
Linux, Windows and macOS.
