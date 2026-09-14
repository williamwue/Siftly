#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export NEXT_TELEMETRY_DISABLED=1
exec ./node_modules/.bin/next start --hostname 127.0.0.1 --port 7310
