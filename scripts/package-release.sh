#!/usr/bin/env bash
# Build a platform tarball for Homebrew / direct install (no npm install on the user machine).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?Usage: package-release.sh <version> <platform>}"
PLATFORM="${2:?Usage: package-release.sh <version> <platform>}"
VERSION="${VERSION#v}"

cd "$ROOT"
npm ci
npm test
npm run build
npm prune --omit=dev

STAGE="clitorrents-${VERSION}-${PLATFORM}"
rm -rf "$STAGE" "${STAGE}.tar.gz"
mkdir -p "$STAGE"
cp package.json "$STAGE/"
cp -R dist "$STAGE/"
cp -R node_modules "$STAGE/"

tar -czf "${STAGE}.tar.gz" "$STAGE"
sha256sum "${STAGE}.tar.gz"
echo "Wrote ${STAGE}.tar.gz"
