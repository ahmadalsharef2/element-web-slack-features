#!/bin/bash
#
# Copyright 2026 Ahmad
#
# SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
# Please see LICENSE files in the repository root for full details.
#
# Builds LiberMsg for Linux and installs the .deb.
# Usage: scripts/build-deb.sh [--no-install]

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
    echo "Run this without sudo: root has no pnpm. The script asks for your password when it installs." >&2
    exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"

cd "$root/apps/web"
# Start from an empty folder: webpack never deletes old bundles, and the dev server writes its own into it too,
# so without this every earlier build ends up inside the package
rm -rf webapp
pnpm build
cp ../desktop/element.io/release/config.json webapp/config.json

cd "$root/apps/desktop"
rm -f webapp.asar
pnpm exec asar p ../web/webapp webapp.asar
pnpm build:ts
pnpm build:res
# Only the .deb is installed, so skip upstream's tar.gz. zstd packs it in seconds where the default xz takes
# minutes on one core, and apt on Ubuntu 22.04+ and Debian 12+ reads it.
pnpm exec electron-builder --linux deb -c.deb.compression=zst

version="$(node -p 'require("./package.json").version')"
deb="$root/apps/desktop/dist/element-desktop-fork_${version}_amd64.deb"

if [[ "${1:-}" == "--no-install" ]]; then
    echo "Built $deb"
else
    sudo apt install --reinstall "$deb"
fi
