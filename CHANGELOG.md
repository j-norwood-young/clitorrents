# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-06-06

### Added

- Quit modal on Ctrl+Q with step-by-step shutdown progress (network stop, per-transfer pause/remove, client teardown)
- `engine.shutdown()` reports progress callbacks for staged teardown

### Fixed

- Ctrl+Q works during splash and while searches/adds are in progress
- Splash screen fills the terminal height with vertically centered content

## [0.3.0] - 2026-06-06

### Added

- `planDownloadLocation()` — preview category and destination before adding a torrent
- Optional `categories.unknown` directory for releases that do not match TV/movie/music heuristics
- Results list route preview when category routing is enabled (`[TV→…/path]`)
- Auto-fill TV/Movies/Music folder defaults when enabling category routing in settings
- Settings field for “Other” (unknown) category directory
- Expanded name-based heuristics: season packs, audiobooks, multi-CD albums, documentary tags
- CLI `download` prints detected category and resolved save path before starting

### Changed

- Add confirmation status shows category and destination path
- Header indicates when category routing is active
- Bumped version to 0.3.0

## [0.2.0] - 2026-06-06

### Added

- TUI redesign: separate search bar, results list, and transfers panes with Tab / Shift+Tab focus
- Settings editor modal (Ctrl+O) with text fields, boolean toggles, and inline choice pickers
- Torrent detail modal with per-torrent stats, peers, and save path
- Web-like modal overlays: dimmed background, rounded dialog panel, drop shadow
- Context-sensitive footer hotkey help per pane and screen
- Default save location is the current working directory; optional permanent override via `config.json`
- Category routing for TV, movies, and music (name-based detection at add time)
- In-app and quick-key controls for global download/upload limits and default seed ratio
- Network disconnect detection: pauses torrents and slows polling until back online
- ASCII splash screen on startup
- Headless CLI: `clitorrents search` and `clitorrents download`
- MCP server mode (`clitorrents mcp`) with search, transfer, and config tools
- Automated test suite (config, classifier, connectivity, CLI parsing, UI components)

### Changed

- Bumped version to 0.2.0
- Search input only accepts keystrokes when the search pane is focused
- Quit is Ctrl+Q; settings is Ctrl+O (avoids conflicting with typed `c` / `q`)
- Header shows configured ratio caps and live transfer speeds
- Config `downloadDir` is optional (`null` = use cwd)

### Fixed

- Enter on results pane starts downloads instead of leaking into the search field
- Settings fields are editable via Enter / Space / choice picker with visible save feedback

[0.3.1]: https://github.com/j-norwood-young/clitorrents/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/j-norwood-young/clitorrents/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/j-norwood-young/clitorrents/compare/v0.1.0...v0.2.0
