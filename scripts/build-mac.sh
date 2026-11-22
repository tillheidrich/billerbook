#!/bin/bash
# Build signed + notarized Billerbook DMGs (arm64 and x64) on a Mac.
# Signing: "Developer ID Application" certificate in the login keychain.
# Notarization: notarytool keychain profile, name in APPLE_KEYCHAIN_PROFILE (default: billerbook).
#   xcrun notarytool store-credentials billerbook --apple-id <id> --team-id <team> --password <app-specific-password>
# Without notarization (e.g. agreement pending): NOTARIZE=0 ./scripts/build-mac.sh
# Publishing to GitHub Releases: ./scripts/build-mac.sh --publish  (needs GH_TOKEN, e.g. GH_TOKEN=$(gh auth token))
set -euo pipefail
cd "$(dirname "$0")/.."
export APPLE_KEYCHAIN_PROFILE="${APPLE_KEYCHAIN_PROFILE:-billerbook}"
# A shell-wide NODE_ENV=production would make npm skip electron and electron-builder.
unset NODE_ENV
npm ci --include=dev --no-audit --no-fund
# sharp ships one native build per CPU: add the other Mac architecture so both DMGs work.
# --force: npm refuses packages for a foreign CPU otherwise.
# Versions must match what the installed sharp expects, so read them from its package.json.
SHARP_PKGS=$(node -e 'const o=JSON.parse(require("fs").readFileSync("node_modules/sharp/package.json","utf8")).optionalDependencies;console.log(["sharp-darwin-x64","sharp-libvips-darwin-x64","sharp-darwin-arm64","sharp-libvips-darwin-arm64"].map(n=>"@img/"+n+"@"+o["@img/"+n]).join(" "))')
echo "sharp natives: $SHARP_PKGS"
# shellcheck disable=SC2086
npm install --no-save --force --include=dev --no-audit --no-fund $SHARP_PKGS
ls node_modules/@img/
EXTRA=()
if [[ "${NOTARIZE:-1}" == "0" ]]; then EXTRA+=(-c.mac.notarize=false); fi
if [[ "${1:-}" == "--publish" ]]; then
  export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"
  npx electron-builder --mac --publish always ${EXTRA[@]+"${EXTRA[@]}"}
else
  npx electron-builder --mac --publish never ${EXTRA[@]+"${EXTRA[@]}"}
fi
ls -lh dist/*.dmg dist/*.zip
