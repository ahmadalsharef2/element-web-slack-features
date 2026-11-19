#!/bin/bash
#
# Copyright 2026 Ahmad
#
# SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
# Please see LICENSE files in the repository root for full details.
#
# Builds Element Fork for Android: the built web app inside a Capacitor shell, as a debug-signed APK.
# Needs Node 22+, Java 17+ and the Android SDK (ANDROID_HOME, default ~/Android/Sdk).
# Usage: scripts/build-apk.sh [--skip-web]   (--skip-web reuses apps/web/webapp)

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export NX_TUI=false

if [[ "${1:-}" != "--skip-web" ]]; then
    cd "$root/apps/web"
    rm -rf webapp
    pnpm build
fi

cd "$root/mobile"
rm -rf www
cp -r ../apps/web/webapp www
cp ../apps/desktop/element.io/release/config.json www/config.json
[[ -d node_modules ]] || npm install --no-audit --no-fund
[[ -d android ]] || npx cap add android
npx cap sync android

cd android
./gradlew assembleDebug
apk="$root/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
echo "Built $apk"
