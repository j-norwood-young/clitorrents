import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput, usePaste, useApp, useWindowSize } from 'ink';
import type { TorrentEngine, TorrentSnapshot } from './engine/torrent-engine.js';
import type { AppConfig } from './config.js';
import {
  getMagnetForTorrent,
  searchCliflixStyle,
  type CliflixSearchRow,
} from './search/cliflix-search.js';
import { Sparkline } from './ui/sparkline.js';
import { formatBytes, formatEta, formatRatio, formatSpeed } from './utils/format.js';
import { openDownloadPath } from './utils/open-location.js';

type MainTab = 'search' | 'transfers';
type SearchMode = 'type' | 'pick';
type View = { kind: 'main' } | { kind: 'detail'; infoHash: string };

const RATIO_PRESETS: (number | null)[] = [null, 0.5, 1, 1.5, 2, 5];

function isTorrentUiPaused(s: TorrentSnapshot): boolean {
  return s.paused || s.dlPaused;
}

/** Keep selection index visible in a fixed-height window (no separate scroll state). */
function listScrollTop(
  itemCount: number,
  selectedIndex: number,
  visibleCount: number
): number {
  if (itemCount === 0 || visibleCount <= 0) return 0;
  const maxScroll = Math.max(0, itemCount - visibleCount);
  return Math.min(
    maxScroll,
    Math.max(0, selectedIndex - visibleCount + 1)
  );
}

/**
 * Left column height ≈ leftFix + searchRows (search box + gap + results box).
 * Transfers column ≈ 3 + 2×transferRows (border + title + two lines per torrent).
 */
function allocateColumnRows(
  mainHeight: number,
  leftFix: number,
  minTransferRows: number
): { searchRows: number; transferRows: number } {
  let searchRows = Math.max(0, Math.min(28, mainHeight - leftFix));
  let transferRows = Math.min(
    8,
    Math.max(minTransferRows, Math.floor((mainHeight - 3) / 2))
  );

  const leftH = (): number => leftFix + searchRows;
  const rightH = (): number => 3 + 2 * transferRows;

  while (Math.max(leftH(), rightH()) > mainHeight) {
    if (searchRows > 0 && leftH() >= rightH()) {
      searchRows -= 1;
    } else if (transferRows > minTransferRows) {
      transferRows -= 1;
    } else if (searchRows > 0) {
      searchRows -= 1;
    } else {
      break;
    }
  }

  transferRows = Math.max(minTransferRows, transferRows);
  while (
    searchRows > 0 &&
    Math.max(leftFix + searchRows, 3 + 2 * transferRows) > mainHeight
  ) {
    searchRows -= 1;
  }

  return {
    searchRows: Math.max(0, searchRows),
    transferRows: Math.max(minTransferRows, transferRows),
  };
}

export function App({
  engine,
  initialConfig,
}: {
  engine: TorrentEngine;
  initialConfig: AppConfig;
}): React.ReactNode {
  const { exit } = useApp();
  const { columns: width = 80, rows: termRows = 24 } = useWindowSize();
  const [, setTick] = useState(0);

  const [config] = useState<AppConfig>(initialConfig);
  const [view, setView] = useState<View>({ kind: 'main' });
  const [tab, setTab] = useState<MainTab>('search');
  const [searchMode, setSearchMode] = useState<SearchMode>('type');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CliflixSearchRow[]>([]);
  const [ri, setRi] = useState(0);
  const [ti, setTi] = useState(0);
  const [busy, setBusy] = useState<'idle' | 'search' | 'add'>('idle');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const onUp = (): void => setTick((x) => x + 1);
    engine.on('update', onUp);
    return () => {
      engine.off('update', onUp);
    };
  }, [engine]);

  const snaps = engine.getSnapshots();
  const selectedSnap = snaps[Math.min(ti, Math.max(0, snaps.length - 1))];

  const runSearch = useCallback(async () => {
      const cfg = config;
      if (!query.trim()) {
        setStatus('Enter a search query.');
        return;
      }
      setBusy('search');
      setStatus('Searching (torrent-search-api)…');
      try {
        const { rows, info } = await searchCliflixStyle(query, {
          limit: cfg.torrents.limit,
          activeProvider: cfg.torrents.providers.active,
          availableProviders: cfg.torrents.providers.available,
          categoryByProvider: cfg.torrents.categoryByProvider,
        });
        setResults(rows);
        setRi(0);
        setSearchMode('pick');
        const detail = info.slice(0, 220);
        setStatus(
          rows.length
            ? `${rows.length} results (${detail})`
            : `No results — ${detail}`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Search failed: ${msg}`);
        setResults([]);
      } finally {
        setBusy('idle');
      }
  }, [query, config]);

  const addSelected = useCallback(async () => {
    const row = results[ri];
    if (!row) return;
    setBusy('add');
    setStatus('Fetching magnet…');
    try {
      const magnet = await getMagnetForTorrent(row._torrent);
      if (!magnet) {
        setStatus('Could not get magnet link for this result (try another).');
        return;
      }
      await engine.add(magnet);
      setStatus(`Added: ${row.title.slice(0, 60)}`);
      setTab('transfers');
      const list = engine.getSnapshots();
      setTi(Math.max(0, list.length - 1));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Add failed: ${msg}`);
    } finally {
      setBusy('idle');
    }
  }, [results, ri, engine]);

  const pasteActive =
    busy === 'idle' &&
    view.kind === 'main' &&
    tab === 'search' &&
    searchMode === 'type';

  usePaste(
    (text) => {
      if (busy !== 'idle') return;
      if (view.kind !== 'main') return;
      if (tab !== 'search' || searchMode !== 'type') return;
      const chunk = text.replace(/[\r\n\u0000]/g, '');
      if (chunk) setQuery((q) => q + chunk);
    },
    { isActive: pasteActive }
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        void engine.destroy().finally(() => exit());
        return;
      }

      if (busy !== 'idle') return;

      if (view.kind === 'detail') {
        const ih = view.infoHash;
        if (key.escape) {
          setView({ kind: 'main' });
          return;
        }
        if (input === 'p') {
          const snap = engine.getSnapshots().find((s) => s.infoHash === ih);
          if (!snap) return;
          if (isTorrentUiPaused(snap)) {
            engine.resumeDownload(ih);
            setStatus('Resumed');
          } else {
            engine.pauseDownload(ih);
            setStatus('Paused download (piece deselect + pause)');
          }
          return;
        }
        if (input === 'o') {
          const t = engine.findTorrent(ih);
          if (t?.files?.[0]) {
            openDownloadPath(t.files[0].path);
          } else if (t?.path) {
            openDownloadPath(t.path);
          }
          return;
        }
        if (input === '[') {
          const cur = engine
            .getSnapshots()
            .find((s) => s.infoHash === ih)?.maxRatio;
          const idx = RATIO_PRESETS.findIndex((r) => r === cur);
          const nextIdx = idx <= 0 ? RATIO_PRESETS.length - 1 : idx - 1;
          const next = RATIO_PRESETS[nextIdx];
          engine.updateTorrentPolicy(ih, { maxRatio: next });
          setStatus(`maxRatio = ${next ?? 'inherit global'}`);
          return;
        }
        if (input === ']') {
          const cur = engine
            .getSnapshots()
            .find((s) => s.infoHash === ih)?.maxRatio;
          const idx = RATIO_PRESETS.findIndex((r) => r === cur);
          const nextIdx = (idx < 0 ? 0 : idx + 1) % RATIO_PRESETS.length;
          const next = RATIO_PRESETS[nextIdx];
          engine.updateTorrentPolicy(ih, { maxRatio: next });
          setStatus(`maxRatio = ${next ?? 'inherit global'}`);
          return;
        }
        return;
      }

      if (input === 'q') {
        void engine.destroy().finally(() => exit());
        return;
      }

      if (key.tab) {
        setTab((t) => (t === 'search' ? 'transfers' : 'search'));
        return;
      }

      if (tab === 'search') {
        if (searchMode === 'type') {
          if (key.return) {
            void runSearch();
            return;
          }
          if (key.backspace || key.delete) {
            setQuery((q) => q.slice(0, -1));
            return;
          }
          if (input && input.length === 1 && !key.meta && !key.ctrl) {
            setQuery((q) => q + input);
            return;
          }
        } else {
          if (key.upArrow) {
            setRi((i) => Math.max(0, i - 1));
            return;
          }
          if (key.downArrow) {
            setRi((i) =>
              results.length === 0
                ? 0
                : Math.min(results.length - 1, i + 1)
            );
            return;
          }
          if (key.return) {
            void addSelected();
            return;
          }
          if (input === 'i' || key.escape) {
            setSearchMode('type');
            return;
          }
        }
      }

      if (tab === 'transfers') {
        if (key.upArrow) {
          setTi((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setTi((i) => Math.min(snaps.length - 1, i + 1));
          return;
        }
        if (key.return && selectedSnap) {
          setView({ kind: 'detail', infoHash: selectedSnap.infoHash });
          return;
        }
        if (input === 'p' && selectedSnap) {
          if (isTorrentUiPaused(selectedSnap)) {
            engine.resumeDownload(selectedSnap.infoHash);
            setStatus('Resumed');
          } else {
            engine.pauseDownload(selectedSnap.infoHash);
            setStatus('Paused download (piece deselect + pause)');
          }
          return;
        }
        if (input === 'x' && selectedSnap) {
          void engine.removeTorrent(selectedSnap.infoHash, false);
          setStatus('Removed torrent (files kept)');
          setTi((t) => Math.max(0, t - 1));
          return;
        }
        if (input === 'X' && selectedSnap) {
          void engine.removeTorrent(selectedSnap.infoHash, true);
          setStatus('Removed torrent and deleted data');
          setTi((t) => Math.max(0, t - 1));
          return;
        }
        if (input === 'o' && selectedSnap) {
          openDownloadPath(selectedSnap.downloadPath);
          return;
        }
      }

      if (input === '/' && tab === 'search') {
        setSearchMode('type');
        setTab('search');
      }
    },
    { isActive: true }
  );

  const sparkW = Math.max(8, Math.min(32, Math.floor(width / 4)));
  const searchColW = Math.floor(width * 0.48);
  const titleMax = Math.max(16, searchColW - 6);

  const headerReserve = 2;
  const footerReserve = termRows < 22 ? 3 : 4;
  const mainContentHeight = Math.max(4, termRows - headerReserve - footerReserve);
  const searchTier: 'full' | 'compact' | 'mini' =
    mainContentHeight < 13 ? 'mini' : mainContentHeight < 20 ? 'compact' : 'full';
  const leftFix =
    searchTier === 'mini' ? 7 : searchTier === 'compact' ? 8 : 9;
  const minTransferRows = snaps.length > 0 ? 1 : 0;
  const { searchRows: searchResultVisible, transferRows: transferVisible } =
    allocateColumnRows(mainContentHeight, leftFix, minTransferRows);

  const searchRowsShown =
    results.length === 0 ? 0 : Math.max(1, searchResultVisible);
  const searchScrollTop = listScrollTop(results.length, ri, searchRowsShown);
  const searchWindowEnd = Math.min(
    results.length,
    searchScrollTop + searchRowsShown
  );
  const searchResultsRangeLabel =
    results.length === 0
      ? 'Results'
      : `Results ${searchScrollTop + 1}-${searchWindowEnd} of ${results.length}`;

  const transferRowsShown =
    snaps.length === 0 ? 0 : Math.max(1, transferVisible);
  const transferScrollTop = listScrollTop(snaps.length, ti, transferRowsShown);
  const transferWindowEnd = Math.min(
    snaps.length,
    transferScrollTop + transferRowsShown
  );

  const detailPeerLines =
    view.kind === 'detail'
      ? Math.max(3, termRows - headerReserve - footerReserve - 12)
      : 12;

  return (
    <Box height={termRows} flexDirection="column" overflow="hidden">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          clitorrents
        </Text>
        <Text>
          {' '}
          | search: {config.torrents.providers.active} | DL{' '}
          {formatSpeed(engine.getClientDownloadSpeed())} UL{' '}
          {formatSpeed(engine.getClientUploadSpeed())} | cfg: global limits{' '}
          {config.globalDownloadLimitBps < 0
            ? '∞'
            : formatSpeed(config.globalDownloadLimitBps)}{' '}
          /{' '}
          {config.globalUploadLimitBps < 0
            ? '∞'
            : formatSpeed(config.globalUploadLimitBps)}
        </Text>
      </Box>

      {view.kind === 'detail' && (
        <DetailPane
          engine={engine}
          infoHash={view.infoHash}
          width={width}
          sparkW={sparkW}
          maxPeerLines={detailPeerLines}
        />
      )}

      {view.kind === 'main' && (
        <Box flexDirection="row">
          <Box width={searchColW} flexDirection="column">
            <Box
              flexDirection="column"
              borderStyle="single"
              borderColor={tab === 'search' ? 'cyan' : 'gray'}
              paddingX={1}
            >
              {searchTier === 'mini' ? (
                <Text bold={tab === 'search'}>
                  Search {tab === 'search' ? '*' : ''}{' '}
                  <Text dimColor>&gt; </Text>
                  {query}
                  {searchMode === 'type' ? '▌' : ''}
                </Text>
              ) : (
                <>
                  <Text bold={tab === 'search'}>
                    Search {tab === 'search' ? '*' : ''}
                  </Text>
                  {searchTier === 'full' ? (
                    <Text dimColor>
                      {searchMode === 'type'
                        ? '(type query, Enter)'
                        : '(arrows, Enter=add, i=edit query)'}
                    </Text>
                  ) : null}
                  <Text>
                    <Text dimColor>&gt; </Text>
                    {query}
                    {searchMode === 'type' ? '▌' : ''}
                  </Text>
                </>
              )}
            </Box>

            <Box
              marginTop={1}
              flexDirection="column"
              borderStyle="single"
              borderColor={tab === 'search' ? 'cyan' : 'gray'}
              paddingX={1}
            >
              <Text bold dimColor>
                {searchResultsRangeLabel}
              </Text>
              {results.length === 0 ? (
                <Text dimColor>
                  {searchMode === 'pick'
                    ? 'No results for this query'
                    : 'Run a search (Enter)'}
                </Text>
              ) : (
                results
                  .slice(searchScrollTop, searchScrollTop + searchRowsShown)
                  .map((r, j) => {
                    const i = searchScrollTop + j;
                    return (
                      <Text
                        key={`${i}-${r.title.slice(0, 48)}`}
                        inverse={searchMode === 'pick' && i === ri}
                      >
                        {r.title.slice(0, titleMax)}{' '}
                        <Text dimColor>
                          {r.seeders ?? '?'}S{' '}
                          {typeof r.size === 'string'
                            ? r.size
                            : typeof r.size === 'number'
                              ? formatBytes(r.size)
                              : '?'}
                        </Text>
                      </Text>
                    );
                  })
              )}
            </Box>
          </Box>

          <Box width={Math.floor(width * 0.52)} flexDirection="column" marginLeft={1}>
            <Box
              flexDirection="column"
              borderStyle="single"
              borderColor={tab === 'transfers' ? 'green' : 'gray'}
              paddingX={1}
            >
              <Text bold={tab === 'transfers'}>
                Transfers {tab === 'transfers' ? '*' : ''}
              </Text>
              {snaps.length === 0 ? (
                <Text dimColor>No active torrents</Text>
              ) : (
                snaps
                  .slice(transferScrollTop, transferWindowEnd)
                  .map((s, j) => {
                  const i = transferScrollTop + j;
                  const paused = isTorrentUiPaused(s);
                  return (
                  <Box key={s.infoHash} flexDirection="column">
                    <Text inverse={tab === 'transfers' && i === ti}>
                      {paused ? (
                        <>
                          <Text bold color="yellow">
                            PAUSED{' '}
                          </Text>
                          <Text>
                            {s.name.slice(0, 34)} {(s.progress * 100).toFixed(1)}%
                          </Text>
                        </>
                      ) : (
                        `${s.name.slice(0, 40)} ${(s.progress * 100).toFixed(1)}% ${formatSpeed(s.downloadSpeed)} ETA ${formatEta(s.timeRemaining)}`
                      )}
                    </Text>
                    <Text dimColor>
                      {'  '}
                      <Sparkline values={s.history} width={sparkW} /> peers {s.numPeers}
                    </Text>
                  </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{status}</Text>
        {termRows < 22 ? (
          <Text dimColor>
            Tab | Enter | p | o | x/X | [ ] | q | cfg ~/.config/clitorrents/config.json
          </Text>
        ) : (
          <Text dimColor>
            Tab switch pane | Enter detail / add | p pause/resume | o open | x remove (keep
            files) X wipe | [ ] ratio (detail) | q quit | edit ~/.config/clitorrents/config.json
            for providers
          </Text>
        )}
      </Box>
    </Box>
  );
}

function DetailPane({
  engine,
  infoHash,
  width,
  sparkW,
  maxPeerLines = 12,
}: {
  engine: TorrentEngine;
  infoHash: string;
  width: number;
  sparkW: number;
  maxPeerLines?: number;
}): React.ReactNode {
  const s = engine.getSnapshots().find((x) => x.infoHash === infoHash);
  const peers = engine.getPeers(infoHash);
  const paused = s ? isTorrentUiPaused(s) : false;
  if (!s) {
    return (
      <Box marginBottom={1}>
        <Text color="red">Torrent not found (finished or removed). Press Esc.</Text>
      </Box>
    );
  }
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color="yellow">
        Torrent detail — Esc back
      </Text>
      <Text>{s.name}</Text>
      <Text>
        Progress {((s.progress ?? 0) * 100).toFixed(1)}% | DL {formatSpeed(s.downloadSpeed ?? 0)} | UL{' '}
        {formatSpeed(s.uploadSpeed ?? 0)} | ETA {formatEta(s.timeRemaining ?? 0)}
        {paused ? (
          <Text bold color="yellow">
            {' '}
            | Paused
          </Text>
        ) : null}
      </Text>
      <Text>
        Peers {s.numPeers} | Ratio {formatRatio(s.ratio ?? 0)} | maxRatio{' '}
        {s.maxRatio ?? 'inherit global'} | maxUp{' '}
        {s.maxUploadBytes == null ? 'inherit global' : formatBytes(s.maxUploadBytes)}
      </Text>
      <Text dimColor>Path {s.downloadPath}</Text>
      <Box marginY={1}>
        <Sparkline values={s.history ?? []} width={sparkW} />
      </Box>
      <Text bold>Peers ({peers.length})</Text>
      {peers
        .slice(
          0,
          Math.min(maxPeerLines, width > 100 ? 20 : 10)
        )
        .map((p) => (
        <Text key={p.key}>
          {p.remoteAddress}:{p.remotePort} ↓{formatSpeed(p.downSpeed)} ↑
          {formatSpeed(p.upSpeed)}
        </Text>
      ))}
    </Box>
  );
}
