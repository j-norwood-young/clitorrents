import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { App } from './app.js';
import { loadConfig, loadSearchHistory, saveSearchHistory, type AppConfig } from './config.js';
import { registerSearchProvider, removeSearchProvider } from './search/cliflix-search.js';
import { createMockProvider, MOCK_PROVIDER_NAME } from './search/mock-provider.js';
import { FakeEngine, makeConfig, makeSnapshot, makeTempDir, sleep, waitFor } from './test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from './test/mock-torrent-server.js';

const KEY = {
  enter: '\r',
  tab: '\t',
  shiftTab: '\x1b[Z',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  escape: '\x1b',
  backspace: '\x7f',
  ctrlO: '\x0f',
  ctrlD: '\x04',
  ctrlQ: '\x11',
};

describe('App', () => {
  let swarm: MockTorrentServer;
  let tmp: ReturnType<typeof makeTempDir>;
  let prevXdg: string | undefined;
  let engine: FakeEngine;
  let config: AppConfig;
  let app: ReturnType<typeof render> | undefined;

  before(async () => {
    swarm = await startMockTorrentServer();
    registerSearchProvider(createMockProvider(swarm.url));
  });

  after(async () => {
    removeSearchProvider(MOCK_PROVIDER_NAME);
    await swarm.close();
  });

  beforeEach(() => {
    tmp = makeTempDir();
    prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmp.dir;
    config = makeConfig({
      torrents: { limit: 10, providers: { active: MOCK_PROVIDER_NAME, available: [MOCK_PROVIDER_NAME] } },
      // Nothing listens here, so the daemon panel reports "not running".
      daemon: { host: '127.0.0.1', port: 9 },
    });
    engine = new FakeEngine(config, '/downloads');
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prevXdg;
    tmp.cleanup();
  });

  const frame = () => app?.lastFrame() ?? '';

  const start = async (): Promise<void> => {
    app = render(<App engine={engine} initialConfig={config} splashMs={0} />);
    await waitFor(() => frame().includes('Search'), { message: 'main view' });
  };

  /** Write keys one at a time so ink parses each as its own keypress. */
  const press = async (...keys: string[]): Promise<void> => {
    for (const k of keys) {
      app!.stdin.write(k);
      await sleep(k === KEY.escape ? 80 : 15);
    }
  };

  const type = async (text: string): Promise<void> => press(...text.split(''));

  const expectFrame = (re: RegExp, message = String(re)) =>
    waitFor(() => re.test(frame()), { timeoutMs: 3000, message: `${message}\n--- frame ---\n${frame()}` });

  it('renders the header, empty panes and status line', async () => {
    await start();
    assert.match(frame(), /clitorrents \| MockServer \| save: \/downloads/);
    assert.match(frame(), /No results — run a search/);
    assert.match(frame(), /No active torrents/);
  });

  it('searches, shows results and records history', async () => {
    await start();
    await type('mock');
    await expectFrame(/Search > mock/);
    await press(KEY.enter);
    await expectFrame(/2 results \(MockServer: 2\)/);
    assert.match(frame(), /Mock\.Movie\.2024\.1080p\.mkv/);
    assert.match(frame(), /Results \(2\) \*/);
    assert.deepEqual(loadSearchHistory(), ['mock']);
  });

  it('asks for a query when searching with an empty box', async () => {
    await start();
    await press(KEY.enter);
    await expectFrame(/Enter a search query\./);
  });

  it('reports provider errors in the status line', async () => {
    await start();
    await type('__error');
    await press(KEY.enter);
    await expectFrame(/No results — MockServer: error/);
  });

  it('edits the query with arrows, backspace and escape', async () => {
    await start();
    await type('abc');
    await press(KEY.left, KEY.backspace);
    await expectFrame(/Search > ac/);
    await press(KEY.escape);
    await expectFrame(/Search > {2}/);
  });

  it('accepts pasted text into the search box', async () => {
    await start();
    await press('\x1b[200~pasted\nquery\x1b[201~');
    await expectFrame(/Search > pastedquery/);
  });

  it('walks search history with up/down and restores the draft', async () => {
    saveSearchHistory(['newest', 'older']);
    await start();
    await type('draft');
    await press(KEY.up);
    await expectFrame(/Search > newest/);
    await press(KEY.up);
    await expectFrame(/Search > older/);
    await press(KEY.down, KEY.down);
    await expectFrame(/Search > draft/);
  });

  it('adds the selected result and refuses duplicates', async () => {
    await start();
    await type('mock');
    await press(KEY.enter);
    await expectFrame(/Results \(2\) \*/);
    await press(KEY.down, KEY.enter);
    await expectFrame(/Added → \/downloads/);
    assert.equal(engine.added[0]!.torrentId, swarm.torrents[1]!.magnet);
    assert.equal(engine.added[0]!.name, swarm.torrents[1]!.name);
    await expectFrame(/\[↓0%\] Mock\.Show/);

    await press(KEY.enter);
    await expectFrame(/Already downloading\./);
    assert.equal(engine.added.length, 1);
  });

  it('shows the category when routing is enabled and surfaces add errors', async () => {
    config = { ...config, categories: { enabled: true, movies: '/media/movies' } };
    engine = new FakeEngine(config, '/downloads');
    await start();
    assert.match(frame(), /routes: TV\/movies\/music/);
    await type('movie');
    await press(KEY.enter);
    await expectFrame(/Results \(1\)/);
    await press(KEY.enter);
    await expectFrame(/Added \(Movie\) → \/media\/movies/);

    engine.addError = new Error('disk full');
    engine.snapshots = [];
    await press(KEY.enter);
    await expectFrame(/Add failed: disk full/);
  });

  it('cycles focus with Tab and Shift+Tab', async () => {
    await start();
    await press(KEY.tab);
    await expectFrame(/Results \*/);
    await press(KEY.tab);
    await expectFrame(/Transfers \*/);
    await press(KEY.shiftTab, KEY.shiftTab);
    await expectFrame(/Search >/);
    assert.doesNotMatch(frame(), /Transfers \*|Results \*/);
  });

  const withTransfers = () => {
    engine.snapshots = [
      makeSnapshot({ infoHash: '1'.repeat(40), name: 'First', downloadPath: '/dl/first' }),
      makeSnapshot({ infoHash: '2'.repeat(40), name: 'Second' }),
    ];
  };

  it('pauses, resumes, adjusts ratio and removes transfers', async () => {
    withTransfers();
    await start();
    await press(KEY.tab, KEY.tab);
    await expectFrame(/Transfers \* \(1-2 of 2\)/);

    await press('p');
    await expectFrame(/Paused download/);
    assert.ok(engine.paused.has('1'.repeat(40)));
    await press('p');
    await expectFrame(/Resumed/);

    await press(']');
    await expectFrame(/maxRatio = 0\.5/);
    assert.deepEqual(engine.policies.at(-1), { infoHash: '1'.repeat(40), patch: { maxRatio: 0.5 } });
    await press('[');
    await expectFrame(/maxRatio = 5/);

    await press(KEY.down, 'X');
    await expectFrame(/Removed torrent and deleted data/);
    assert.deepEqual(engine.removed, [{ infoHash: '2'.repeat(40), destroyFiles: true }]);
    await press('x');
    await expectFrame(/Removed torrent \(files kept\)/);
    assert.deepEqual(engine.removed.at(-1), { infoHash: '1'.repeat(40), destroyFiles: false });
    await expectFrame(/No active torrents/);
  });

  it('explains why a resume did not take effect', async () => {
    engine.snapshots = [makeSnapshot({ infoHash: '1'.repeat(40), name: 'Stuck', dlPaused: true })];
    engine.resumeDownload = async () => {};
    engine.online = false;
    await start();
    await press(KEY.tab, KEY.tab, 'p');
    await expectFrame(/Network offline: will resume when the connection returns/);

    engine.online = true;
    await press('p');
    await expectFrame(/Could not resume\. If the daemon seems stuck/);
  });

  it('opens the detail view for a transfer and closes it with Esc', async () => {
    withTransfers();
    await start();
    await press(KEY.tab, KEY.tab, KEY.enter);
    await expectFrame(/Torrent detail/);
    assert.match(frame(), /Save to: \/dl\/first/);
    await press('p');
    await expectFrame(/Paused download/);
    await press(']');
    await expectFrame(/maxRatio = 0\.5/);
    await press(KEY.escape);
    await waitFor(() => !frame().includes('Torrent detail'), { message: 'detail closed' });
  });

  it('cycles global limits and default ratio from the quick keys', async () => {
    await start();
    await press(KEY.tab);
    await press('.');
    await expectFrame(/Global DL limit: 0 B\/s/);
    assert.deepEqual(engine.globalLimits, { download: 0, upload: -1 });
    await press(',', ',');
    await expectFrame(/Global DL limit: 9\.5 MB\/s/); // 10_000_000 B/s in binary units
    await press('>');
    await expectFrame(/Global UL limit: 0 B\/s/);
    await press('<', '<');
    await expectFrame(/Global UL limit: 4\.8 MB\/s/);
    await press('}');
    await expectFrame(/Default max ratio: 0\.5/);
    assert.equal(engine.defaultRatio, 0.5);
    await press('{', '{');
    await expectFrame(/Default max ratio: 5/);
  });

  it('shows offline and daemon banners from engine events', async () => {
    let connected = true;
    engine.isDaemonConnected = () => connected;
    await start();
    engine.online = false;
    engine.emit('network', 'offline');
    await expectFrame(/Offline — torrents paused/);

    connected = false;
    engine.emit('daemon', 'disconnected');
    await expectFrame(/Daemon not running — reconnecting/);

    connected = true;
    engine.online = true;
    engine.emit('daemon', 'connected');
    await expectFrame(/Connected to daemon/);
    assert.doesNotMatch(frame(), /Daemon not running|Offline/);
  });

  it('reports session restore results on startup', async () => {
    engine.restoreSession = async () => ({ restored: 2, failed: 1 });
    await start();
    await expectFrame(/Restored 2 transfer\(s\) from last session · 1 could not be restored/);
  });

  it('edits text settings, picks choices and toggles categories in the config view', async () => {
    await start();
    await press(KEY.ctrlO);
    await expectFrame(/Settings/);

    // Download dir (text field)
    await press(KEY.enter);
    await type('/new');
    await expectFrame(/Download dir \(blank=cwd\): \/new ▌/);
    await press(KEY.enter);
    await waitFor(() => engine.config.downloadDir === '/new', { message: 'downloadDir applied' });

    // Category routing (boolean) is the 6th field
    await press(KEY.down, KEY.down, KEY.down, KEY.down, KEY.down, ' ');
    await expectFrame(/Category routing on — TV\/Movies\/Music/);
    assert.equal(engine.config.categories?.enabled, true);
    assert.equal(engine.config.categories?.tv, '/downloads/TV');

    // On reach limit (choice) is the last field
    for (let i = 0; i < 6; i++) await press(KEY.down);
    await press(KEY.enter);
    // At 24 rows the modal clips some picker rows, so wait on the picker hotkey hint instead.
    await expectFrame(/choose option/);
    await press(KEY.down, KEY.enter);
    await waitFor(() => engine.config.onReachLimit === 'remove_keep_files', { message: 'choice applied' });

    await press(KEY.escape);
    await expectFrame(/Settings saved\./);
    assert.doesNotMatch(frame(), /Category routing:/);
  });

  it('cancels config edits and pickers with Esc before closing', async () => {
    await start();
    await press(KEY.ctrlO, KEY.enter);
    await type('/zzz');
    await press(KEY.escape);
    await expectFrame(/Download dir \(blank=cwd\): \(empty = cwd\)/);
    assert.equal(engine.config.downloadDir, null);
    await press(KEY.escape);
    await expectFrame(/Settings saved\./);
  });

  it('opens the daemon panel and runs actions', async () => {
    await start();
    await press(KEY.ctrlD);
    await expectFrame(/Daemon/);
    await expectFrame(/not running/);
    await press(KEY.escape);
    await waitFor(() => !/not running/.test(frame()), { message: 'daemon panel closed' });
    // Stop with no daemon and no pid file is a quick no-op.
    await press(KEY.ctrlD, 'x');
    await expectFrame(/Daemon not running/);
  });

  it('quits with Ctrl+Q and destroys the engine', async () => {
    await start();
    await press(KEY.ctrlQ);
    await waitFor(() => engine.destroyed, { message: 'engine destroyed' });
  });

  it('does not persist config on startup', async () => {
    await start();
    assert.equal(loadConfig().torrents.providers.active, '1337x');
  });
});
