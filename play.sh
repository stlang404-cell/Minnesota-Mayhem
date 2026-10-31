#!/bin/sh
# macOS / Linux launcher
cd "$(dirname "$0")"
[ -f dist/index.html ] || npm run build
node server.mjs --open "$@"
