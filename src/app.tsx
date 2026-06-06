import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, usePaste, useApp, useWindowSize } from 'ink';
import type { EngineLike } from './engine/engine-like.js';
import type { AppConfig } from './config.js';
import {
  getMagnetForTorrent,
  searchCliflixStyle,
  type CliflixSearchRow,
} from './search/cliflix-search.js';
import { findActiveSnapshot } from './search/result-match.js';
import { infoHashFromMagnet } from './engine/session-utils.js';
import { formatGlobalLimitBps, formatSpeed, shortenPath } from './utils/format.js';
import { defaultCategoryPaths, formatCategoryLabel, planDownloadLocation } from './media/classify.js';
import { openDownloadPath } from './utils/open-location.js';
import {
  cyclePreset,
  cyclePresetBackward,
  RATIO_PRESETS,
  SPEED_LIMIT_PRESETS,
} from './constants.js';
import { SearchField } from './ui/text-input.js';
import { ResultsList } from './ui/results-list.js';
import { TransfersList } from './ui/transfers-list.js';
import { DetailPane } from './ui/detail-pane.js';
import { Splash } from './ui/splash.js';
import {
  ConfigEditor,
  CONFIG_FIELDS,
  applyChoiceSelection,
  getChoiceIndex,
  getChoiceOptions,
  getFieldKind,
  type ConfigField,
} from './ui/config-editor.js';
import { Modal } from './ui/modal.js';
import {
  computeMainLayout,
  isTorrentUiPaused,
  resultsPageCount,
  resultsPageItemCount,
  type AppView,
  type FocusPane,
} from './ui/list-utils.js';
import { getHotkeyHelp } from './ui/hotkey-help.js';
import { isQuitKey } from './ui/keys.js';

export function App({
  engine,
  initialConfig,
}: {
  engine: EngineLike;
  initialConfig: AppConfig;
}): React.ReactNode {
  const { exit } = useApp();
  const { columns: width = 80, rows: termRows = 24 } = useWindowSize();
  const layout = computeMainLayout(termRows, width);
  const [, setTick] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const quittingRef = useRef(false);

  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [view, setView] = useState<AppView>({ kind: 'main' });
  const [focus, setFocus] = useState<FocusPane>('search');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<CliflixSearchRow[]>([]);
  const [resultsPage, setResultsPage] = useState(0);
  const [ri, setRi] = useState(0);
  const [ti, setTi] = useState(0);
  const [busy, setBusy] = useState<'idle' | 'search' | 'add'>('idle');
  const [status, setStatus] = useState('');
  const [networkState, setNetworkState] = useState<'online' | 'offline'>(
    engine.isNetworkOnline() ? 'online' : 'offline'
  );

  const [configField, setConfigField] = useState<ConfigField>('downloadDir');
  const [configEditing, setConfigEditing] = useState(false);
  const [configEditText, setConfigEditText] = useState('');
  const [configPickerOpen, setConfigPickerOpen] = useState(false);
  const [configPickerIndex, setConfigPickerIndex] = useState(0);

  useEffect(() => {
    const onUp = (): void => setTick((x) => x + 1);
    const onNet = (s: 'online' | 'offline'): void => setNetworkState(s);
    engine.on('update', onUp);
    engine.on('network', onNet);
    return () => {
      engine.off('update', onUp);
      engine.off('network', onNet);
    };
  }, [engine]);

  useEffect(() => {
    const pageCount = resultsPageCount(results.length, layout.resultsVisible);
    setResultsPage((p) => Math.min(p, pageCount - 1));
  }, [results.length, layout.resultsVisible]);

  useEffect(() => {
    const len = resultsPageItemCount(resultsPage, results.length, layout.resultsVisible);
    setRi((i) => (len === 0 ? 0 : Math.min(i, len - 1)));
  }, [resultsPage, results.length, layout.resultsVisible]);

  useEffect(() => {
    let cancelled = false;
    void engine.restoreSession().then((result) => {
      if (cancelled) return;
      if (result.restored > 0) {
        setStatus(`Restored ${result.restored} transfer(s) from last session`);
      }
      if (result.failed > 0) {
        setStatus((prev) =>
          result.restored > 0
            ? `${prev} · ${result.failed} could not be restored`
            : `${result.failed} transfer(s) could not be restored`
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  const snaps = engine.getSnapshots();
  const selectedSnap = snaps[Math.min(ti, Math.max(0, snaps.length - 1))];

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      setStatus('Enter a search query.');
      return;
    }
    setBusy('search');
    setStatus('Searching…');
    try {
      const { rows, info } = await searchCliflixStyle(query, {
        limit: config.torrents.limit,
        activeProvider: config.torrents.providers.active,
        availableProviders: config.torrents.providers.available,
        categoryByProvider: config.torrents.categoryByProvider,
      });
      setResults(rows);
      setResultsPage(0);
      setRi(0);
      setFocus('results');
      const detail = info.slice(0, 220);
      setStatus(rows.length ? `${rows.length} results (${detail})` : `No results — ${detail}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Search failed: ${msg}`);
      setResults([]);
    } finally {
      setBusy('idle');
    }
  }, [query, config]);

  const quitApp = useCallback(() => {
    if (quittingRef.current) return;
    quittingRef.current = true;
    setShowSplash(false);
    void engine.destroy().finally(() => exit());
  }, [engine, exit]);

  const addSelected = useCallback(async () => {
    const pageSize = layout.resultsVisible;
    const row = results[resultsPage * pageSize + ri];
    if (!row) return;
    if (findActiveSnapshot(row, engine.getSnapshots())) {
      setStatus('Already downloading.');
      return;
    }
    setBusy('add');
    setStatus('Fetching magnet…');
    try {
      const magnet = await getMagnetForTorrent(row._torrent);
      if (!magnet) {
        setStatus('Could not get magnet link for this result (try another).');
        return;
      }
      const hash = infoHashFromMagnet(magnet);
      if (hash && engine.hasActiveTorrent(hash)) {
        setStatus('Already downloading.');
        return;
      }
      await engine.add(magnet, { name: row.title });
      const plan = planDownloadLocation(row.title, config, engine.getBaseDownloadDir());
      const cat = config.categories?.enabled ? formatCategoryLabel(plan.category) : null;
      setStatus(
        cat
          ? `Added (${cat}) → ${shortenPath(plan.dir, 52)}`
          : `Added → ${shortenPath(plan.dir, 52)}`
      );
      const list = engine.getSnapshots();
      setTi(Math.max(0, list.length - 1));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg === 'Torrent is already downloading' ? 'Already downloading.' : `Add failed: ${msg}`);
    } finally {
      setBusy('idle');
    }
  }, [results, resultsPage, ri, layout.resultsVisible, engine, config]);

  const applyConfigFromState = useCallback(
    (next: AppConfig) => {
      setConfig(next);
      engine.setConfig(next, { persist: true });
      if (!next.downloadDir) {
        engine.setBaseDownloadDir(process.cwd());
      }
    },
    [engine]
  );

  const saveConfigView = useCallback(() => {
    applyConfigFromState(config);
    setView({ kind: 'main' });
    setStatus('Settings saved.');
  }, [applyConfigFromState, config]);

  const searchInputActive =
    busy === 'idle' && view.kind === 'main' && focus === 'search';

  usePaste(
    (text) => {
      if (!searchInputActive) return;
      const chunk = text.replace(/[\r\n\u0000]/g, '');
      if (!chunk) return;
      setQuery((q) => {
        const before = q.slice(0, cursor);
        const after = q.slice(cursor);
        return before + chunk + after;
      });
      setCursor((c) => c + chunk.length);
    },
    { isActive: searchInputActive }
  );

  useInput(
    (input, key) => {
      if (isQuitKey(input, key)) {
        quitApp();
        return;
      }

      if (quittingRef.current) return;

      if (key.ctrl && input === 'o') {
        if (view.kind !== 'config') {
          setView({ kind: 'config' });
          setConfigField('downloadDir');
          setConfigEditing(false);
          setConfigEditText('');
          setConfigPickerOpen(false);
          setConfigPickerIndex(0);
        }
        return;
      }

      if (view.kind === 'config') {
        handleConfigInput(input, key);
        return;
      }

      if (busy !== 'idle') return;

      if (view.kind === 'detail') {
        handleDetailInput(input, key);
        return;
      }

      if (key.shift && key.tab) {
        cycleFocusBackward();
        return;
      }
      if (key.tab && !key.shift) {
        cycleFocusForward();
        return;
      }

      // Quick limit/ratio keys (not while typing in search)
      if (view.kind === 'main' && focus !== 'search') {
        if (input === ',') {
          const next = cyclePresetBackward(SPEED_LIMIT_PRESETS.download, config.globalDownloadLimitBps);
          const updated = { ...config, globalDownloadLimitBps: next };
          setConfig(updated);
          engine.setGlobalLimits(next, config.globalUploadLimitBps, true);
          setStatus(`Global DL limit: ${next < 0 ? '∞' : formatSpeed(next)}`);
          return;
        }
        if (input === '.') {
          const next = cyclePreset(SPEED_LIMIT_PRESETS.download, config.globalDownloadLimitBps);
          const updated = { ...config, globalDownloadLimitBps: next };
          setConfig(updated);
          engine.setGlobalLimits(next, config.globalUploadLimitBps, true);
          setStatus(`Global DL limit: ${next < 0 ? '∞' : formatSpeed(next)}`);
          return;
        }
        if (input === '<') {
          const next = cyclePresetBackward(SPEED_LIMIT_PRESETS.upload, config.globalUploadLimitBps);
          const updated = { ...config, globalUploadLimitBps: next };
          setConfig(updated);
          engine.setGlobalLimits(config.globalDownloadLimitBps, next, true);
          setStatus(`Global UL limit: ${next < 0 ? '∞' : formatSpeed(next)}`);
          return;
        }
        if (input === '>') {
          const next = cyclePreset(SPEED_LIMIT_PRESETS.upload, config.globalUploadLimitBps);
          const updated = { ...config, globalUploadLimitBps: next };
          setConfig(updated);
          engine.setGlobalLimits(config.globalDownloadLimitBps, next, true);
          setStatus(`Global UL limit: ${next < 0 ? '∞' : formatSpeed(next)}`);
          return;
        }
        if (input === '{') {
          const next = cyclePresetBackward(RATIO_PRESETS, config.defaultMaxRatio ?? null);
          const updated = { ...config, defaultMaxRatio: next };
          setConfig(updated);
          engine.setDefaultMaxRatio(next, true);
          setStatus(`Default max ratio: ${next ?? 'unlimited'}`);
          return;
        }
        if (input === '}') {
          const next = cyclePreset(RATIO_PRESETS, config.defaultMaxRatio ?? null);
          const updated = { ...config, defaultMaxRatio: next };
          setConfig(updated);
          engine.setDefaultMaxRatio(next, true);
          setStatus(`Default max ratio: ${next ?? 'unlimited'}`);
          return;
        }
      }

      // Search typing only when search pane is focused
      if (focus === 'search' && handleSearchInput(input, key)) return;

      if (focus === 'results') {
        const pageSize = layout.resultsVisible;
        const pageCount = resultsPageCount(results.length, pageSize);
        const pageLen = resultsPageItemCount(resultsPage, results.length, pageSize);
        if (key.upArrow) {
          setRi((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setRi((i) => (pageLen === 0 ? 0 : Math.min(pageLen - 1, i + 1)));
          return;
        }
        if (key.leftArrow && resultsPage > 0) {
          const nextPage = resultsPage - 1;
          setResultsPage(nextPage);
          setRi((i) => Math.min(i, resultsPageItemCount(nextPage, results.length, pageSize) - 1));
          return;
        }
        if (key.rightArrow && resultsPage < pageCount - 1) {
          const nextPage = resultsPage + 1;
          setResultsPage(nextPage);
          setRi((i) => Math.min(i, resultsPageItemCount(nextPage, results.length, pageSize) - 1));
          return;
        }
        if (key.return) {
          void addSelected();
          return;
        }
      }

      if (focus === 'transfers') {
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
          togglePause(selectedSnap.infoHash);
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
        if ((input === '[' || input === ']') && selectedSnap) {
          adjustTorrentRatio(selectedSnap.infoHash, input === ']');
          return;
        }
      }
    }
  );

  function cycleFocusForward(): void {
    setFocus((f) => (f === 'search' ? 'results' : f === 'results' ? 'transfers' : 'search'));
  }

  function cycleFocusBackward(): void {
    setFocus((f) => (f === 'search' ? 'transfers' : f === 'transfers' ? 'results' : 'search'));
  }

  function handleSearchInput(
    input: string,
    key: {
      return?: boolean;
      backspace?: boolean;
      delete?: boolean;
      leftArrow?: boolean;
      rightArrow?: boolean;
      meta?: boolean;
      ctrl?: boolean;
    }
  ): boolean {
    if (key.return) {
      void runSearch();
      return true;
    }

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return true;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(query.length, c + 1));
      return true;
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setQuery((q) => q.slice(0, cursor - 1) + q.slice(cursor));
        setCursor((c) => c - 1);
      }
      return true;
    }

    if (input && input.length === 1 && !key.meta && !key.ctrl && !isControlChar(input)) {
      setQuery((q) => q.slice(0, cursor) + input + q.slice(cursor));
      setCursor((c) => c + 1);
      return true;
    }
    return false;
  }

  function isControlChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127;
  }

  function togglePause(infoHash: string): void {
    const snap = engine.getSnapshots().find((s) => s.infoHash === infoHash);
    if (!snap) return;
    if (isTorrentUiPaused(snap)) {
      engine.resumeDownload(infoHash);
      const after = engine.getSnapshots().find((s) => s.infoHash === infoHash);
      setStatus(after && !isTorrentUiPaused(after) ? 'Resumed' : 'Could not resume (offline or still loading)');
    } else {
      engine.pauseDownload(infoHash);
      setStatus('Paused download');
    }
  }

  function adjustTorrentRatio(infoHash: string, forward: boolean): void {
    const cur = engine.getSnapshots().find((s) => s.infoHash === infoHash)?.maxRatio;
    const next = forward
      ? cyclePreset(RATIO_PRESETS, cur ?? null)
      : cyclePresetBackward(RATIO_PRESETS, cur ?? null);
    engine.updateTorrentPolicy(infoHash, { maxRatio: next });
    setStatus(`maxRatio = ${next ?? 'inherit global'}`);
  }

  function handleDetailInput(input: string, key: { escape?: boolean }): void {
    if (view.kind !== 'detail') return;
    const ih = view.infoHash;
    if (key.escape) {
      setView({ kind: 'main' });
      return;
    }
    if (input === 'p') togglePause(ih);
    if (input === 'o') {
      const snap = engine.getSnapshots().find((s) => s.infoHash === ih);
      if (snap?.downloadPath) openDownloadPath(snap.downloadPath);
    }
    if (input === '[') adjustTorrentRatio(ih, false);
    if (input === ']') adjustTorrentRatio(ih, true);
  }

  function handleConfigInput(
    input: string,
    key: {
      escape?: boolean;
      return?: boolean;
      upArrow?: boolean;
      downArrow?: boolean;
      backspace?: boolean;
      delete?: boolean;
    }
  ): void {
    if (key.escape) {
      if (configPickerOpen) {
        setConfigPickerOpen(false);
        return;
      }
      if (configEditing) {
        setConfigEditing(false);
        setConfigEditText('');
        return;
      }
      saveConfigView();
      return;
    }

    const fieldIdx = CONFIG_FIELDS.indexOf(configField);
    const kind = getFieldKind(configField);

    if (configPickerOpen) {
      const options = getChoiceOptions(configField, config);
      if (key.upArrow) {
        setConfigPickerIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setConfigPickerIndex((i) => Math.min(options.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const selected = options[configPickerIndex];
        if (selected) {
          const next = applyChoiceSelection(configField, config, selected);
          applyFieldUpdate(next);
        }
        setConfigPickerOpen(false);
        return;
      }
      return;
    }

    if (key.upArrow && !configEditing) {
      setConfigField(CONFIG_FIELDS[Math.max(0, fieldIdx - 1)]!);
      return;
    }
    if (key.downArrow && !configEditing) {
      setConfigField(CONFIG_FIELDS[Math.min(CONFIG_FIELDS.length - 1, fieldIdx + 1)]!);
      return;
    }

    if (input === ' ' && kind === 'boolean' && !configEditing) {
      const enabling = !(config.categories?.enabled ?? false);
      const base = engine.getBaseDownloadDir();
      const defaults = defaultCategoryPaths(base);
      const next = {
        ...config,
        categories: {
          ...config.categories,
          enabled: enabling,
          tv: config.categories?.tv ?? (enabling ? defaults.tv : undefined),
          movies: config.categories?.movies ?? (enabling ? defaults.movies : undefined),
          music: config.categories?.music ?? (enabling ? defaults.music : undefined),
          unknown: config.categories?.unknown,
        },
      };
      applyFieldUpdate(next);
      setStatus(
        enabling
          ? `Category routing on — TV/Movies/Music under ${shortenPath(base, 40)}`
          : 'Category routing off'
      );
      return;
    }

    if (key.return) {
      if (configEditing) {
        commitConfigField(configField, configEditText);
        setConfigEditing(false);
        setConfigEditText('');
        return;
      }
      if (kind === 'choice') {
        setConfigPickerIndex(getChoiceIndex(configField, config));
        setConfigPickerOpen(true);
        return;
      }
      if (kind === 'text') {
        setConfigEditing(true);
        setConfigEditText(getFieldText(config, configField));
        return;
      }
      return;
    }

    if (configEditing) {
      if (key.backspace || key.delete) {
        setConfigEditText((t) => t.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !isControlChar(input)) {
        setConfigEditText((t) => t + input);
      }
    }
  }

  function applyFieldUpdate(next: AppConfig): void {
    setConfig(next);
    engine.setConfig(next);
    if (!next.downloadDir) engine.setBaseDownloadDir(process.cwd());
  }

  function getFieldText(cfg: AppConfig, field: ConfigField): string {
    switch (field) {
      case 'downloadDir':
        return cfg.downloadDir ?? '';
      case 'activeProvider':
        return cfg.torrents.providers.active;
      case 'defaultMaxRatio':
        return cfg.defaultMaxRatio == null ? '' : String(cfg.defaultMaxRatio);
      case 'categoryTv':
        return cfg.categories?.tv ?? '';
      case 'categoryMovies':
        return cfg.categories?.movies ?? '';
      case 'categoryMusic':
        return cfg.categories?.music ?? '';
      case 'categoryUnknown':
        return cfg.categories?.unknown ?? '';
      default:
        return '';
    }
  }

  function commitConfigField(field: ConfigField, text: string): void {
    const next = { ...config };
    switch (field) {
      case 'downloadDir':
        next.downloadDir = text.trim() === '' ? null : text.trim();
        break;
      case 'activeProvider':
        next.torrents = {
          ...next.torrents,
          providers: { ...next.torrents.providers, active: text.trim() || next.torrents.providers.active },
        };
        break;
      case 'defaultMaxRatio':
        next.defaultMaxRatio = text.trim() === '' ? null : Number(text.trim());
        break;
      case 'categoryTv':
        next.categories = { ...next.categories, enabled: next.categories?.enabled ?? false, tv: text.trim() || undefined };
        break;
      case 'categoryMovies':
        next.categories = { ...next.categories, enabled: next.categories?.enabled ?? false, movies: text.trim() || undefined };
        break;
      case 'categoryMusic':
        next.categories = { ...next.categories, enabled: next.categories?.enabled ?? false, music: text.trim() || undefined };
        break;
      case 'categoryUnknown':
        next.categories = { ...next.categories, enabled: next.categories?.enabled ?? false, unknown: text.trim() || undefined };
        break;
      default:
        break;
    }
    applyFieldUpdate(next);
  }

  if (showSplash) {
    return <Splash onDone={() => setShowSplash(false)} />;
  }

  const sparkW = layout.sparkW;
  const searchColW = layout.searchColW;
  const titleMax = layout.titleMax;
  const mainContentHeight = layout.mainContentHeight;
  const resultsVisible = layout.resultsVisible;
  const transfersVisible = layout.transfersVisible;
  const resultsPageTotal = resultsPageCount(results.length, resultsVisible);
  const resultsPageRows = results.slice(
    resultsPage * resultsVisible,
    resultsPage * resultsVisible + resultsPageItemCount(resultsPage, results.length, resultsVisible)
  );

  const detailPeerLines = Math.max(2, Math.min(6, mainContentHeight - 12));

  const modalOpen = view.kind !== 'main';
  const configPickerOptionCount = configPickerOpen
    ? getChoiceOptions(configField, config).length
    : 0;
  const configModalHeight = configPickerOpen
    ? Math.min(mainContentHeight - 2, 12 + configPickerOptionCount)
    : Math.min(mainContentHeight - 2, 16);
  const detailModalHeight = Math.min(mainContentHeight - 2, 10 + detailPeerLines);

  const hotkeyHelp = getHotkeyHelp({
        view,
        focus,
        configEditing,
        configPickerOpen,
        compact: termRows < 22,
      });

  return (
    <Box height={termRows} flexDirection="column" overflow="hidden">
      <Box marginBottom={0} flexDirection="column">
        <Text dimColor={modalOpen}>
          <Text bold color="cyan">
            clitorrents
          </Text>
          {' '}
          | {config.torrents.providers.active} | save: {engine.getBaseDownloadDir()}
          {config.categories?.enabled ? (
            <>
              {' '}
              | routes: TV/movies/music
            </>
          ) : null}
        </Text>
        <Text dimColor={modalOpen}>
          ratio {config.defaultMaxRatio ?? '∞'} | cap DL{' '}
          {formatGlobalLimitBps(config.globalDownloadLimitBps)} UL{' '}
          {formatGlobalLimitBps(config.globalUploadLimitBps)} | live DL{' '}
          {formatSpeed(engine.getClientDownloadSpeed())} UL{' '}
          {formatSpeed(engine.getClientUploadSpeed())}
        </Text>
      </Box>

      {networkState === 'offline' ? (
        <Text bold color="red">
          Offline — torrents paused, waiting for network…
        </Text>
      ) : null}

      <Box
        position="relative"
        flexGrow={1}
        height={mainContentHeight}
        flexDirection="column"
      >
        <Box flexDirection="row" flexGrow={1}>
          <Box width={searchColW} flexDirection="column">
            <Box
              borderStyle="single"
              borderColor={!modalOpen && focus === 'search' ? 'cyan' : 'gray'}
              paddingX={1}
            >
              <SearchField
                value={query}
                cursor={cursor}
                focused={!modalOpen && focus === 'search'}
                dimmed={modalOpen}
              />
            </Box>
            <ResultsList
              results={resultsPageRows}
              selectedIndex={ri}
              page={resultsPage}
              pageCount={resultsPageTotal}
              totalCount={results.length}
              pageSize={resultsVisible}
              focused={!modalOpen && focus === 'results'}
              dimmed={modalOpen}
              titleMax={titleMax}
              activeSnapshots={snaps}
            />
          </Box>
          <Box width={Math.floor(width * 0.52)} marginLeft={1}>
            <TransfersList
              snaps={snaps}
              selectedIndex={ti}
              focused={!modalOpen && focus === 'transfers'}
              dimmed={modalOpen}
              visibleRows={transfersVisible}
              sparkW={sparkW}
            />
          </Box>
        </Box>

        {view.kind === 'config' ? (
          <Modal
            title="Settings"
            areaWidth={width}
            areaHeight={mainContentHeight}
            modalWidth={Math.min(width - 4, 72)}
            modalHeight={configModalHeight}
            borderColor="magenta"
          >
            <ConfigEditor
              config={config}
              selectedField={configField}
              editing={configEditing}
              editingText={configEditText}
              pickerOpen={configPickerOpen}
              pickerIndex={configPickerIndex}
              baseDirLive={engine.getBaseDownloadDir()}
            />
          </Modal>
        ) : null}

        {view.kind === 'detail' ? (
          <Modal
            title="Torrent detail"
            areaWidth={width}
            areaHeight={mainContentHeight}
            modalWidth={Math.min(width - 4, 76)}
            modalHeight={detailModalHeight}
            borderColor="yellow"
          >
            <DetailPane
              engine={engine}
              infoHash={view.infoHash}
              width={Math.min(width - 8, 72)}
              sparkW={sparkW}
              maxPeerLines={detailPeerLines}
            />
          </Modal>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{status}</Text>
        {view.kind === 'config' ? (
          <Text>
            ratio {config.defaultMaxRatio ?? '∞'} · DL cap{' '}
            {formatGlobalLimitBps(config.globalDownloadLimitBps)} · UL cap{' '}
            {formatGlobalLimitBps(config.globalUploadLimitBps)}
          </Text>
        ) : null}
        <Text dimColor>{hotkeyHelp}</Text>
      </Box>
    </Box>
  );
}
