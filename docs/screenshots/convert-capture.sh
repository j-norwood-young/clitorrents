#!/usr/bin/env bash
# Convert a screencast (.mov) into README / website assets.
# Usage: ./docs/screenshots/convert-capture.sh [path/to/capture.mov]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${1:-$ROOT/clitorrents-capture.mov}"
DEST="$ROOT/docs/screenshots"

if [[ ! -f "$SRC" ]]; then
  echo "Source not found: $SRC" >&2
  echo "Usage: $0 [capture.mov]" >&2
  exit 1
fi

echo "Converting $SRC → $DEST/tui.{mp4,gif,start.png,end.png}"

ffmpeg -y -i "$SRC" \
  -an -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p -movflags +faststart \
  -vf "scale=1100:-2:flags=lanczos" \
  "$DEST/tui.mp4"

ffmpeg -y -i "$SRC" \
  -an \
  -vf "fps=15,scale=900:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  "$DEST/tui.gif"

ffmpeg -y -ss 00:00:06 -i "$DEST/tui.mp4" -frames:v 1 -update 1 "$DEST/tui-start.png"
ffmpeg -y -sseof -3 -i "$DEST/tui.mp4" -frames:v 1 -update 1 "$DEST/tui-end.png"

python3 - "$DEST" <<'PY'
import sys
from pathlib import Path
from PIL import Image

def trim_black_border(path: Path, thresh: int = 30) -> None:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    pixels = im.load()

    def row_has_content(y: int) -> bool:
        return any(any(c > thresh for c in pixels[x, y]) for x in range(w))

    def col_has_content(x: int) -> bool:
        return any(any(c > thresh for c in pixels[x, y]) for y in range(h))

    top = next(y for y in range(h) if row_has_content(y))
    bottom = next(y for y in range(h - 1, -1, -1) if row_has_content(y))
    left = next(x for x in range(w) if col_has_content(x))
    right = next(x for x in range(w - 1, -1, -1) if col_has_content(x))
    im.crop((left, top, right + 1, bottom + 1)).save(path)

dest = Path(sys.argv[1])
for name in ("tui-start.png", "tui-end.png"):
    trim_black_border(dest / name)
PY

ls -lh "$DEST/tui.mp4" "$DEST/tui.gif" "$DEST/tui-start.png" "$DEST/tui-end.png"
