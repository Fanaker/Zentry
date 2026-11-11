#!/usr/bin/env bash
set -euo pipefail
# JDK17, Android SDK35 and Gradle8.11.1 required. No paid service.
cd "$(dirname "$0")/.."
npm run build
mkdir -p android/app/src/main/assets/web
cp -a dist/. android/app/src/main/assets/web/
cd android
"${ZENTRY_GRADLE:-gradle}" --no-daemon assembleRelease
