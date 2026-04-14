# clitorrents

Terminal UI for searching and downloading torrents.

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

## Configuration

On first run, a template config is written to:

`~/.config/clitorrents/config.json` (or `$XDG_CONFIG_HOME/clitorrents/config.json`)

Per-torrent overrides (ratio caps from the detail view, etc.) are stored in:

`~/.config/clitorrents/torrent-overrides.json`

### Config fields

| Field | Meaning |
|--------|---------|
| `downloadDir` | Where downloaded files are stored |
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

## Keybindings

| Key | Action |
|-----|--------|
| Tab | Switch between Search and Transfers panes |
| Enter | Run search (search pane, type mode) / add selected result (pick mode) / open torrent detail (transfers) |
| p | Toggle pause / resume download (piece deselect + pause) |
| o | Open download folder (or reveal file on macOS) |
| x | Remove torrent, **keep** files on disk |
| X | Remove torrent and **delete** downloaded data |
| [ ] | In detail: cycle per-torrent max seed ratio preset |
| Esc | Back from detail view (or leave result pick mode with `i`) |
| i | In search pick mode: return to typing query |
| q | Quit |

## Manual check

1. Review `config.json` provider settings.
2. Search for `sintel` and add a result.
3. Confirm progress, ETA, peer list, and sparkline update.
4. Press `o` to open the download directory.

## WebTorrent behavior

This client uses WebTorrent, not libtorrent. Pause uses **deselecting pieces** plus `torrent.pause()`, so behavior may differ from desktop clients like qBittorrent. Global bandwidth limits apply to the whole client; per-torrent speed caps are not implemented in v1 (only ratio / upload-byte policies and global throttles).

## Tests

```bash
npm test
```

## Development reference

The `cliflix/` directory is a vendored copy of the original Cliflix app for comparison only; this project does not depend on it at runtime.
