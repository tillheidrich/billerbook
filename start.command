#!/bin/bash
# Doppelklick im Finder startet Billerbook.
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js 22.13+ fehlt: https://nodejs.org"; read -r; exit 1; fi
[ -d node_modules ] || npm install --omit=dev
node --disable-warning=ExperimentalWarning server.mjs --open
