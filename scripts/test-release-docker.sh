#!/usr/bin/env bash
# Test a release tarball in a clean Node Docker image (Homebrew-style layout).
#
# Usage:
#   ./scripts/test-release-docker.sh [version]     # build linux-x64 tarball locally if needed
#   DOWNLOAD=1 ./scripts/test-release-docker.sh 0.4.2   # fetch tarball from GitHub release
#   TARBALL=/path/to.tgz ./scripts/test-release-docker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo 0.4.2)}"
VERSION="${VERSION#v}"
PLATFORM="${PLATFORM:-linux-x64}"
IMAGE="${IMAGE:-node:22-bookworm-slim}"
REPO="${REPO:-j-norwood-young/clitorrents}"

if [[ -n "${TARBALL:-}" ]]; then
  TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
elif [[ "${DOWNLOAD:-}" == "1" ]]; then
  TARBALL="/tmp/clitorrents-${VERSION}-${PLATFORM}.tar.gz"
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/clitorrents-${VERSION}-${PLATFORM}.tar.gz"
  echo "Downloading ${URL}"
  curl -fsSL "$URL" -o "$TARBALL"
else
  TARBALL="$ROOT/clitorrents-${VERSION}-${PLATFORM}.tar.gz"
  if [[ ! -f "$TARBALL" ]]; then
    echo "No tarball at ${TARBALL}; building..."
    "$ROOT/scripts/package-release.sh" "$VERSION" "$PLATFORM"
  fi
  TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
fi

echo "Testing ${TARBALL} in ${IMAGE}"
docker run --rm \
  -v "${TARBALL}:/tmp/clitorrents.tar.gz:ro" \
  "$IMAGE" \
  bash -ec '
    set -euo pipefail
    mkdir -p /opt/clitorrents/libexec /opt/clitorrents/bin
    tar -xzf /tmp/clitorrents.tar.gz -C /opt/clitorrents/libexec --strip-components=1
    chmod 0755 /opt/clitorrents/libexec/dist/cli.js
    ln -sf /opt/clitorrents/libexec/dist/cli.js /opt/clitorrents/bin/clitorrents
    export PATH="/opt/clitorrents/bin:$PATH"
    test -x /opt/clitorrents/bin/clitorrents

    ADDON=/opt/clitorrents/libexec/node_modules/node-datachannel/build/Release/node_datachannel.node
  test -f "$ADDON" || { echo "missing native addon: $ADDON"; exit 1; }

    echo "==> clitorrents help"
    clitorrents help | head -3

    echo "==> clitorrents status (daemon stopped)"
    clitorrents status || test $? -eq 1

    echo "==> clitorrents daemon (webtorrent + node-datachannel)"
    clitorrents daemon &
    DAEMON_PID=$!
    sleep 2
    if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
      wait "$DAEMON_PID" || true
      echo "daemon exited early"
      exit 1
    fi
    clitorrents status || test $? -eq 2
    kill "$DAEMON_PID"
    wait "$DAEMON_PID" 2>/dev/null || true

    echo "OK — release tarball works in clean container"
  '
