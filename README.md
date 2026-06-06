# clitorrents

Terminal UI for searching and downloading torrents.

## Quickstart

```bash
npx clitorrents
```

Requires Node.js 20+. No install needed — `npx` downloads and runs the latest release.

**Warning:** Only use this for content you have the right to access.

## Requirements

- Node.js 20+

## Install

Install globally from npm:

```bash
npm install -g clitorrents
```

Then run `clitorrents` from any directory.

Install from a local clone:

```bash
cd /path/to/clitorrents
npm install
npm install -g .
```

Development run (without global install):

```bash
cd /path/to/clitorrents
npm install
npm run build
npm start
# or: node dist/cli.js
```

## Operating modes

| Command | Description |
|---------|-------------|
| `clitorrents` | Interactive TUI (default) |
| `clitorrents search "<query>"` | Print search results to stdout |
| `clitorrents download "<query\|magnet\|hash\|url>"` | Download and stream progress until done |
| `clitorrents mcp` | MCP server on stdio (for AI tooling) |

### CLI examples

```bash
clitorrents search sintel --provider 1337x --limit 10
clitorrents download "magnet:?xt=urn:btih:..."
clitorrents download sintel --pick 1 --dir ./downloads
clitorrents download sintel --ratio 1.5 --download-limit 5000000
```

## Configuration

On first run, a template config is written to:

`~/.config/clitorrents/config.json` (or `$XDG_CONFIG_HOME/clitorrents/config.json`)

Per-torrent overrides (ratio caps from the detail view, etc.) are stored in:

`~/.config/clitorrents/torrent-overrides.json`

Active transfers are persisted to `session.json` in the same directory whenever you add, pause, resume, or remove a torrent. Restart the TUI (or MCP server) to resume downloads from where they left off — including partial progress on disk. Quitting with Ctrl+Q keeps your session; only explicit remove (`x` / `X`) drops a torrent from the session.

You can also edit settings in the TUI with Ctrl+O.

### Save location

- **Default:** current working directory (`process.cwd()`)
- **Permanent override:** set `downloadDir` in `config.json` (applies whenever you run clitorrents)
- **Category routing:** enable `categories` to send TV, movies, and music to separate folders (detected from torrent names at add time). Turning routing on in settings auto-fills `TV`, `Movies`, and `Music` subfolders under your save directory.
- Destination is fixed when a torrent is added; changing `downloadDir` only affects new downloads

### Category detection (name heuristics)

Detection runs on the torrent title at add time (TV is checked first, then music, then movies):

| Category | Typical patterns |
|----------|------------------|
| **TV** | `S01E02`, `1x02`, `Season N`, `complete series`, `mini series` |
| **Music** | `FLAC`, `MP3`, `320kbps`, `album`, `discography`, `audiobook`, `.flac`/`.mp3` extensions |
| **Movies** | `(2024)` with quality tags, `BluRay`/`WEB-DL`/`remux`, `movie`, `documentary` |
| **Other** | Anything else — optional `categories.unknown` dir, otherwise the base save dir |

Use `categories.unknown` for a catch-all inbox (software, games, etc.) without mislabeling them as movies.

### Config fields

| Field | Meaning |
|--------|---------|
| `downloadDir` | Permanent save dir override (`null` = use cwd) |
| `categories.enabled` | Route TV/movies/music to separate dirs |
| `categories.tv` / `movies` / `music` | Category directory paths |
| `categories.unknown` | Optional folder for unmatched titles |
| `torrents.limit` | Max results returned by provider search |
| `torrents.providers.active` | Provider used first (fallback starts here) |
| `torrents.providers.available` | Provider fallback order list |
| `torrents.categoryByProvider` | Optional provider -> category override (`torrent-search-api`) |
| `globalDownloadLimitBps` / `globalUploadLimitBps` | `-1` = unlimited, `0` = blocked |
| `defaultMaxRatio` | Stop policy when ratio reached |
| `defaultMaxUploadBytes` | Optional upload cap in bytes |
| `onReachLimit` | `pause_seed` (deselect + pause) or `remove_keep_files` |

### Provider notes

- Default provider list is based on cliflix behavior and can break over time as sites change.
- If search returns no rows, try switching `torrents.providers.active` or reordering `torrents.providers.available`.
- Status text after search includes per-provider results/errors to help diagnose provider failures.

## Keybindings (TUI)

| Key | Action |
|-----|--------|
| Tab | Cycle focus: Search → Results → Transfers |
| Enter | Search (search focus) / add result (results) / open detail (transfers) |
| ↑↓ | Navigate results or transfers (when that pane is focused) |
| ← → | Previous / next results page (results focus) |
| p | Toggle pause / resume download |
| o | Open download folder (or reveal file on macOS) |
| x | Remove torrent, **keep** files on disk |
| X | Remove torrent and **delete** downloaded data |
| [ ] | Cycle per-torrent max seed ratio (detail/transfers) |
| , . | Cycle global download limit down/up |
| < > | Cycle global upload limit down/up |
| { } | Cycle default max ratio down/up |
| Ctrl+O | Open settings editor (saved to config.json) |
| Esc | Back from detail or settings |
| Ctrl+Q | Quit |

Search is always editable — type anytime without switching modes.

## MCP server

```bash
clitorrents mcp
```

Tools: `search`, `add_torrent`, `list_transfers`, `transfer_status`, `pause_torrent`, `resume_torrent`, `remove_torrent`, `set_limits`, `get_config`, `set_config`.

## Manual check

1. Review `config.json` provider settings.
2. Search for `sintel` and add a result.
3. Confirm progress, ETA, peer list, sparkline, and save path update.
4. Press `o` to open the download directory.
5. Press Ctrl+O to verify settings editor saves.

## WebTorrent behavior

This client uses WebTorrent, not libtorrent. Pause uses **deselecting pieces** plus `torrent.pause()`, so behavior may differ from desktop clients like qBittorrent. Global bandwidth limits apply to the whole client; per-torrent speed caps are not implemented (only ratio / upload-byte policies and global throttles).

When the network is unavailable, clitorrents detects offline status, pauses torrents, and polls at a reduced rate to save power until connectivity returns.

## Tests

```bash
npm test
```

Runs unit tests for config, media classification, connectivity monitoring, CLI parsing, and UI components — all offline, suitable for CI.

## Development reference

The `cliflix/` directory is a vendored copy of the original Cliflix app for comparison only; this project does not depend on it at runtime.
