#!/usr/bin/env bash
# Downloads flag-icons (MIT) at a pinned version and uploads all flags to the private R2 bucket.
set -euo pipefail
BUCKET="cloudflare-assignment-flags"
VERSION="v7.5.0"
TMP=$(mktemp -d)

curl -sL "https://github.com/lipis/flag-icons/archive/refs/tags/${VERSION}.tar.gz" | tar xz -C "$TMP"
cd "$(dirname "$0")/../worker"

for f in "$TMP"/flag-icons-*/flags/4x3/*.svg; do
  code=$(basename "$f" .svg | tr '[:lower:]' '[:upper:]')
  ./node_modules/.bin/wrangler r2 object put "$BUCKET/$code.svg" \
    --file "$f" --content-type image/svg+xml --remote
done
echo "Done."