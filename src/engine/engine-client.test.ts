import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { EngineClient } from './engine-client.js';
import type { ShutdownProgress } from './torrent-engine.js';
import { loadTorrentOverrides } from '../config.js';
import { fetchDaemonState } from '../daemon/ensure-daemon.js';
import { createEngineFixture, waitForDone, type EngineFixture } from '../test/engine-fixture.js';
import { startDaemonFixture, type DaemonFixture } from '../test/daemon-fixture.js';
import { FakeEngine, makeConfig, makeSnapshot, waitFor } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';
import type { DaemonState } from '../daemon/http-server.js';

const emptyState = (): DaemonState => ({
  snapshots: [],
  downloadSpeed: 0,
  uploadSpeed: 0,
  networkOnline: true,
  config: makeConfig(),
  baseDownloadDir: '/tmp',
});

describe('EngineClient against a real daemon', () => {
  let swarm: MockTorrentServer;
  let fx: EngineFixture;
  let daemon: DaemonFixture;
  let client: EngineClient | undefined;

  before(async () => {
    swarm = await startMockTorrentServer();
  });

  after(async () => {
    await swarm.close();
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await daemon?.close();
    await fx?.cleanup();
  });

  const connect = async (): Promise<EngineClient> => {
    fx = createEngineFixture();
    daemon = await startDaemonFixture(fx.engine, fx.config);
    client = new EngineClient(`${daemon.url}/`, await fetchDaemonState(daemon.url));
    await client.connect();
    return client;
  };

  const movie = () => swarm.torrents[0]!;

  it('mirrors daemon state and receives SSE updates as a download completes', async () => {
    const c = await connect();
    assert.equal(c.getBaseDownloadDir(), fx.downloadDir);
    assert.equal(c.isNetworkOnline(), true);
    assert.equal(c.isDaemonConnected(), true);
    assert.deepEqual(c.getSnapshots(), []);

    await c.add(movie().magnet, { name: movie().name });
    await waitFor(() => c.getSnapshots()[0]?.done, { message: 'client sees done' });
    assert.equal(c.hasActiveTorrent(movie().infoHash.toUpperCase()), true);
    assert.equal(c.getClientDownloadSpeed() >= 0, true);
    assert.equal(c.getClientUploadSpeed() >= 0, true);
  });

  it('adds Uint8Array torrents via base64', async () => {
    const c = await connect();
    const t = swarm.torrents[1]!;
    await c.add(new Uint8Array(t.torrentFile));
    await waitForDone(fx.engine, t.infoHash);
  });

  it('surfaces the daemon error message when add fails', async () => {
    const c = await connect();
    await c.add(movie().magnet);
    await assert.rejects(c.add(movie().magnet), /already downloading/);
  });

  it('applies state immediately after pause/resume', async () => {
    const c = await connect();
    await c.add(movie().magnet, { name: movie().name });
    await waitForDone(fx.engine, movie().infoHash);
    await c.pauseDownload(movie().infoHash);
    assert.equal(c.getSnapshots()[0]!.dlPaused, true);
    await c.resumeDownload(movie().infoHash);
    assert.equal(c.getSnapshots()[0]!.dlPaused, false);
  });

  it('forwards config, limits, ratio, base dir and policy changes', async () => {
    const c = await connect();
    // Setters are fire-and-forget; wait for each to land before the next so POSTs can't reorder.
    c.setConfig({ ...fx.config, onReachLimit: 'remove_keep_files' });
    await waitFor(() => c.getConfig().onReachLimit === 'remove_keep_files', { message: 'config' });
    c.setGlobalLimits(1000, 2000);
    await waitFor(() => c.getConfig().globalUploadLimitBps === 2000, { message: 'limits' });
    c.setDefaultMaxRatio(1.5);
    await waitFor(() => c.getConfig().defaultMaxRatio === 1.5, { message: 'ratio' });
    c.setBaseDownloadDir(`${fx.downloadDir}/b`);
    await waitFor(() => c.getBaseDownloadDir() === `${fx.downloadDir}/b`, { message: 'base dir' });
    c.updateTorrentPolicy(movie().infoHash, { maxRatio: 2 });
    await waitFor(() => loadTorrentOverrides().byInfoHash[movie().infoHash], {
      message: 'policy',
    });
    assert.equal(fx.engine.getConfig().globalDownloadLimitBps, 1000);
  });

  it('removes torrents and restores sessions', async () => {
    const c = await connect();
    await c.add(movie().magnet);
    await c.removeTorrent(movie().infoHash, false);
    assert.equal(fx.engine.getSnapshots().length, 0);
    // Removal also drops the session entry, so there is nothing to restore.
    assert.deepEqual(await c.restoreSession(), { restored: 0, failed: 0 });
  });

  it('fetches peers in the background and caches them', async () => {
    const c = await connect();
    await fx.engine.add(movie().magnet);
    assert.deepEqual(c.getPeers(movie().infoHash), []);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(Array.isArray(c.getPeers(movie().infoHash)));
  });

  it('streams shutdown progress and closes', async () => {
    const c = await connect();
    const progress: ShutdownProgress[] = [];
    await c.shutdown((p) => progress.push(p));
    assert.equal(progress.at(-1)?.phase, 'done');
  });
});

describe('EngineClient connectivity', () => {
  it('emits daemon disconnected/connected across a daemon restart', async () => {
    const engine = new FakeEngine(makeConfig());
    let daemon = await startDaemonFixture(engine, makeConfig());
    const port = daemon.port;
    const client = new EngineClient(daemon.url, emptyState());
    const events: string[] = [];
    client.on('daemon', (s: string) => events.push(s));
    try {
      await client.connect();
      await client.connect(); // idempotent
      await waitFor(() => engine.listenerCount('update') > 0);

      engine.snapshots = [makeSnapshot({ name: 'from-daemon' })];
      engine.emit('update');
      await waitFor(() => client.getSnapshots()[0]?.name === 'from-daemon', { message: 'SSE state' });

      engine.emit('network', 'offline');
      await new Promise<void>((resolve) => client.once('network', () => resolve()));

      await daemon.close();
      await waitFor(() => !client.isDaemonConnected(), { message: 'disconnect' });

      daemon = await startDaemonFixture(engine, makeConfig(), port);
      await waitFor(() => client.isDaemonConnected(), { timeoutMs: 5000, message: 'reconnect' });
      assert.deepEqual(events, ['disconnected', 'connected']);
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('never throws when the daemon is unreachable', async () => {
    const client = new EngineClient('http://127.0.0.1:9', emptyState());
    await client.pauseDownload('x');
    await client.resumeDownload('x');
    await client.removeTorrent('x', true);
    assert.deepEqual(await client.restoreSession(), { restored: 0, failed: 0 });
    client.setGlobalLimits(1, 1);
    await assert.rejects(client.add('magnet:?xt=urn:btih:' + 'a'.repeat(40)), /Daemon is not running/);
    await client.destroy();
  });
});
