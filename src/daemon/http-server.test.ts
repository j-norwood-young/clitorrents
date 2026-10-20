import assert from 'node:assert/strict';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import { VERSION } from '../constants.js';
import { loadConfig, loadTorrentOverrides, type AppConfig } from '../config.js';
import { createEngineFixture, waitForDone, type EngineFixture } from '../test/engine-fixture.js';
import { startDaemonFixture, type DaemonFixture } from '../test/daemon-fixture.js';
import { FakeEngine, makeConfig, readSse, waitFor } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';
import type { DaemonState, DaemonStatus } from './http-server.js';

async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('daemon HTTP API (real engine)', () => {
  let swarm: MockTorrentServer;
  let fx: EngineFixture;
  let daemon: DaemonFixture;

  before(async () => {
    swarm = await startMockTorrentServer();
  });

  after(async () => {
    await swarm.close();
  });

  afterEach(async () => {
    await daemon?.close();
    await fx?.cleanup();
  });

  const setup = async (): Promise<void> => {
    fx = createEngineFixture();
    daemon = await startDaemonFixture(fx.engine, fx.config);
  };

  const movie = () => swarm.torrents[0]!;

  it('GET /api/health reports the package version', async () => {
    await setup();
    const res = await fetch(`${daemon.url}/api/health`);
    assert.deepEqual(await res.json(), { ok: true, version: VERSION });
  });

  it('GET /api/status describes the running daemon', async () => {
    await setup();
    const status = (await (await fetch(`${daemon.url}/api/status`)).json()) as DaemonStatus;
    assert.equal(status.running, true);
    assert.equal(status.version, VERSION);
    assert.equal(status.pid, process.pid);
    assert.equal(status.url, daemon.url);
    assert.equal(status.transferCount, 0);
    assert.equal(status.sseClients, 0);
    assert.equal(status.networkOnline, true);
    assert.equal(status.baseDownloadDir, fx.downloadDir);
    assert.equal(status.pidFileMatches, false);
    assert.ok((status.uptimeMs ?? -1) >= 0);
  });

  it('GET /api/state returns snapshots and config', async () => {
    await setup();
    const state = (await (await fetch(`${daemon.url}/api/state`)).json()) as DaemonState;
    assert.deepEqual(state.snapshots, []);
    assert.equal(state.baseDownloadDir, fx.downloadDir);
    assert.equal(state.config.downloadDir, fx.downloadDir);
  });

  it('POST /api/add (magnet) downloads and streams state over SSE', async () => {
    await setup();
    const events = fetch(`${daemon.url}/api/events`).then((res) =>
      readSse(res, (evs) =>
        evs.some((e) => e.event === 'state' && (e.data as DaemonState).snapshots[0]?.done)
      )
    );
    await waitFor(async () => {
      const s = (await (await fetch(`${daemon.url}/api/status`)).json()) as DaemonStatus;
      return s.sseClients === 1;
    }, { message: 'SSE client registered' });

    const res = await post(`${daemon.url}/api/add`, {
      torrentId: movie().magnet,
      options: { name: movie().name },
    });
    assert.deepEqual(await res.json(), { ok: true });
    const received = await events;
    assert.equal(received[0]!.event, 'state');
    assert.equal((received.at(-1)!.data as DaemonState).snapshots[0]!.infoHash, movie().infoHash);
  });

  it('POST /api/add accepts a base64 .torrent and passes options through', async () => {
    await setup();
    const t = swarm.torrents[1]!;
    const dir = path.join(fx.downloadDir, 'override');
    const res = await post(`${daemon.url}/api/add`, {
      torrentIdBase64: t.torrentFile.toString('base64'),
      options: { downloadDir: dir },
    });
    assert.equal(res.status, 200);
    await waitForDone(fx.engine, t.infoHash);
    assert.equal(fx.engine.getSnapshots()[0]!.downloadPath, dir);
  });

  it('POST /api/add without a torrent id is a 400', async () => {
    await setup();
    const res = await post(`${daemon.url}/api/add`, {});
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /torrentId/);
  });

  it('POST /api/add reports engine errors as 500', async () => {
    await setup();
    await post(`${daemon.url}/api/add`, { torrentId: movie().magnet });
    const res = await post(`${daemon.url}/api/add`, { torrentId: movie().magnet });
    assert.equal(res.status, 500);
    assert.match(((await res.json()) as { error: string }).error, /already downloading/);
  });

  it('pause/resume return the updated state', async () => {
    await setup();
    await post(`${daemon.url}/api/add`, { torrentId: movie().magnet, options: { name: movie().name } });
    await waitForDone(fx.engine, movie().infoHash);

    const paused = (await (await post(`${daemon.url}/api/pause`, { infoHash: movie().infoHash })).json()) as {
      state: DaemonState;
    };
    assert.equal(paused.state.snapshots[0]!.dlPaused, true);

    const resumed = (await (await post(`${daemon.url}/api/resume`, { infoHash: movie().infoHash })).json()) as {
      state: DaemonState;
    };
    assert.equal(resumed.state.snapshots[0]!.dlPaused, false);
  });

  it('GET /api/has-active and /api/peers report per-torrent info', async () => {
    await setup();
    const ih = movie().infoHash;
    assert.deepEqual(await (await fetch(`${daemon.url}/api/has-active/${ih}`)).json(), { active: false });
    await post(`${daemon.url}/api/add`, { torrentId: movie().magnet });
    assert.deepEqual(await (await fetch(`${daemon.url}/api/has-active/${ih}`)).json(), { active: true });
    const peers = await (await fetch(`${daemon.url}/api/peers/${ih}`)).json();
    assert.ok(Array.isArray(peers));
  });

  it('POST /api/remove removes the torrent', async () => {
    await setup();
    await post(`${daemon.url}/api/add`, { torrentId: movie().magnet });
    await waitForDone(fx.engine, movie().infoHash);
    const res = await post(`${daemon.url}/api/remove`, { infoHash: movie().infoHash, destroyFiles: false });
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(fx.engine.getSnapshots(), []);
  });

  it('POST /api/config, /api/limits and /api/default-max-ratio update config', async () => {
    await setup();
    const cfgRes = await post(`${daemon.url}/api/config`, {
      config: { ...fx.config, onReachLimit: 'remove_keep_files' },
      persist: true,
    });
    assert.equal(((await cfgRes.json()) as AppConfig).onReachLimit, 'remove_keep_files');
    assert.equal(loadConfig().onReachLimit, 'remove_keep_files');

    const limits = (await (await post(`${daemon.url}/api/limits`, { downloadBps: 1000 })).json()) as AppConfig;
    assert.equal(limits.globalDownloadLimitBps, 1000);
    assert.equal(limits.globalUploadLimitBps, -1);

    const ratio = (await (await post(`${daemon.url}/api/default-max-ratio`, { ratio: 2 })).json()) as AppConfig;
    assert.equal(ratio.defaultMaxRatio, 2);
    const cleared = (await (await post(`${daemon.url}/api/default-max-ratio`, {})).json()) as AppConfig;
    assert.equal(cleared.defaultMaxRatio, null);
  });

  it('POST /api/config without config is a 400', async () => {
    await setup();
    const res = await post(`${daemon.url}/api/config`, {});
    assert.equal(res.status, 400);
  });

  it('POST /api/torrent-policy and /api/base-download-dir', async () => {
    await setup();
    const ih = movie().infoHash;
    await post(`${daemon.url}/api/torrent-policy`, { infoHash: ih, patch: { maxRatio: 3 } });
    assert.deepEqual(loadTorrentOverrides().byInfoHash[ih], { maxRatio: 3 });

    const dir = path.join(fx.downloadDir, 'base2');
    await post(`${daemon.url}/api/base-download-dir`, { dir });
    assert.equal(fx.engine.getBaseDownloadDir(), dir);
  });

  it('POST /api/restore-session returns the restore result', async () => {
    await setup();
    const res = await post(`${daemon.url}/api/restore-session`);
    assert.deepEqual(await res.json(), { restored: 0, failed: 0 });
  });

  it('unknown routes are a 404', async () => {
    await setup();
    const res = await fetch(`${daemon.url}/api/nope`);
    assert.equal(res.status, 404);
  });

  it('POST /api/shutdown streams progress, closes SSE clients and calls onShutdown', async () => {
    await setup();
    const sse = await fetch(`${daemon.url}/api/events`);
    const sseDone = readSse(sse);

    const res = await post(`${daemon.url}/api/shutdown`);
    const events = await readSse(res);
    assert.ok(events.some((e) => e.event === 'shutdown-progress'));
    assert.deepEqual(events.at(-1), { event: 'shutdown-done', data: { ok: true } });

    // The open SSE stream must end so server.close() can complete.
    await sseDone;
    await waitFor(() => daemon.shutdownCalls === 1, { message: 'onShutdown' });
  });
});

describe('daemon HTTP API (fake engine)', () => {
  it('broadcasts network and session-restored events to SSE clients', async () => {
    const engine = new FakeEngine(makeConfig());
    const daemon = await startDaemonFixture(engine, makeConfig());
    try {
      const res = await fetch(`${daemon.url}/api/events`);
      const events = readSse(res, (evs) => evs.some((e) => e.event === 'session-restored'));
      await waitFor(() => engine.listenerCount('network') > 0);
      await new Promise((r) => setTimeout(r, 50));
      engine.emit('network', 'offline');
      engine.emit('session-restored', { restored: 2, failed: 1 });
      const got = await events;
      assert.deepEqual(
        got.map((e) => e.event).slice(0, 4),
        ['state', 'network', 'state', 'session-restored']
      );
      assert.deepEqual(got[1]!.data, { state: 'offline' });
      assert.deepEqual(got[3]!.data, { restored: 2, failed: 1 });
    } finally {
      await daemon.close();
    }
  });

  it('treats an empty body as {} and invalid JSON as a 500', async () => {
    const engine = new FakeEngine(makeConfig());
    const daemon = await startDaemonFixture(engine, makeConfig());
    try {
      const empty = await fetch(`${daemon.url}/api/pause`, { method: 'POST' });
      assert.equal(empty.status, 200);
      assert.ok(engine.paused.has(''));

      const bad = await fetch(`${daemon.url}/api/pause`, { method: 'POST', body: '{nope' });
      assert.equal(bad.status, 500);
    } finally {
      await daemon.close();
    }
  });
});
