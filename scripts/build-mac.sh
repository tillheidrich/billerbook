#!/bin/bash
# Build signed + notarized Billerbook DMGs (arm64 and x64) on a Mac.
# Signing: "Developer ID Application" certificate in the login keychain.
# Notarization: notarytool keychain profile, name in APPLE_KEYCHAIN_PROFILE (default: billerbook).
#   xcrun notarytool store-credentials billerbook --apple-id <id> --team-id <team> --password <app-specific-password>
# Publishing to GitHub Releases: ./scripts/build-mac.sh --publish  (needs GH_TOKEN, e.g. GH_TOKEN=$(gh auth token))
set -euo pipefail
cd "$(dirname "$0")/.."
export APPLE_KEYCHAIN_PROFILE="${APPLE_KEYCHAIN_PROFILE:-billerbook}"
npm ci
# sharp ships one native build per CPU: add the other Mac architecture so both DMGs work.
npm install --no-save --os=darwin --cpu=x64 @img/sharp-darwin-x64 @img/sharp-libvips-darwin-x64
npm install --no-save --os=darwin --cpu=arm64 @img/sharp-darwin-arm64 @img/sharp-libvips-darwin-arm64
if [[ "${1:-}" == "--publish" ]]; then
  export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"
  npx electron-builder --mac --publish always
else
  npx electron-builder --mac --publish never
fi
ls -lh dist/*.dmg dist/*.zip
