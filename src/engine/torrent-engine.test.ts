import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import { getConfigPath, loadConfig, loadSession, loadTorrentOverrides } from '../config.js';
import { createEngineFixture, sha1File, waitForDone, type EngineFixture } from '../test/engine-fixture.js';
import { sleep, waitFor } from '../test/helpers.js';
import { startMockTorrentServer, type MockTorrentServer } from '../test/mock-torrent-server.js';
import type { ShutdownProgress } from './torrent-engine.js';

describe('TorrentEngine (mock swarm)', () => {
  let server: MockTorrentServer;
  let fx: EngineFixture | undefined;

  before(async () => {
    server = await startMockTorrentServer();
  });

  after(async () => {
    await server.close();
  });

  afterEach(async () => {
    await fx?.cleanup();
    fx = undefined;
  });

  const movie = () => server.torrents[0]!;
  const show = () => server.torrents[1]!;

  it('downloads a magnet from the local seeder and verifies contents', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    await waitForDone(fx.engine, t.infoHash);

    const snap = fx.engine.getSnapshots()[0]!;
    assert.equal(snap.infoHash, t.infoHash);
    assert.equal(snap.name, t.name);
    assert.equal(snap.progress, 1);
    assert.equal(snap.length, t.length);
    assert.equal(snap.downloadPath, fx.downloadDir);
    assert.equal(snap.mediaCategory, 'movies');
    assert.equal(sha1File(path.join(fx.downloadDir, t.name)), t.sha1s[t.name]);
  });

  it('downloads a multi-file torrent added from a .torrent buffer', async () => {
    fx = createEngineFixture();
    const t = show();
    await fx.engine.add(new Uint8Array(t.torrentFile));
    await waitForDone(fx.engine, t.infoHash);
    for (const [rel, hash] of Object.entries(t.sha1s)) {
      assert.equal(sha1File(path.join(fx.downloadDir, t.name, rel)), hash, rel);
    }
  });

  it('persists the torrent to session.json as soon as it is added', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    const entry = loadSession().torrents.find((e) => e.infoHash === t.infoHash);
    assert.ok(entry);
    assert.equal(entry.downloadPath, fx.downloadDir);
    assert.equal(entry.name, t.name);
    assert.equal(entry.dlPaused, false);
  });

  it('rejects adding the same magnet twice and reports it as active', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    assert.equal(fx.engine.hasActiveTorrent(t.infoHash.toUpperCase()), true);
    await assert.rejects(fx.engine.add(t.magnet), /already downloading/);
  });

  it('routes downloads into category folders when enabled', async () => {
    fx = createEngineFixture();
    const moviesDir = path.join(fx.downloadDir, 'Movies');
    const tvDir = path.join(fx.downloadDir, 'TV');
    fx.engine.setConfig({
      ...fx.config,
      categories: { enabled: true, movies: moviesDir, tv: tvDir },
    });
    await fx.engine.add(movie().magnet, { name: movie().name });
    await fx.engine.add(show().magnet, { name: show().name });
    await waitForDone(fx.engine, movie().infoHash);
    await waitForDone(fx.engine, show().infoHash);
    assert.ok(fs.existsSync(path.join(moviesDir, movie().name)));
    assert.ok(fs.existsSync(path.join(tvDir, show().name, 'subs', 'en.srt')));
    const byHash = new Map(fx.engine.getSnapshots().map((s) => [s.infoHash, s]));
    assert.equal(byHash.get(show().infoHash)?.mediaCategory, 'tv');
  });

  it('honours an explicit downloadDir over category routing', async () => {
    fx = createEngineFixture();
    const custom = path.join(fx.downloadDir, 'custom');
    await fx.engine.add(movie().magnet, { name: movie().name, downloadDir: custom });
    await waitForDone(fx.engine, movie().infoHash);
    assert.ok(fs.existsSync(path.join(custom, movie().name)));
  });

  it('starts paused when restoreDlPaused is set, then completes on resume', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name, restoreDlPaused: true });
    await waitFor(() => fx!.engine.getSnapshots()[0]?.dlPaused, { message: 'paused snapshot' });
    await sleep(300);
    assert.equal(fx.engine.getSnapshots()[0]!.done, false);

    fx.engine.resumeDownload(t.infoHash);
    assert.equal(fx.engine.getSnapshots()[0]!.dlPaused, false);
    await waitForDone(fx.engine, t.infoHash);
  });

  it('pause/resume updates snapshot and session.json', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    await waitForDone(fx.engine, t.infoHash);

    fx.engine.pauseDownload(t.infoHash);
    assert.equal(fx.engine.getSnapshots()[0]!.dlPaused, true);
    assert.equal(loadSession().torrents[0]!.dlPaused, true);

    fx.engine.resumeDownload(t.infoHash);
    assert.equal(fx.engine.getSnapshots()[0]!.dlPaused, false);
    assert.equal(loadSession().torrents[0]!.dlPaused, false);
  });

  it('ignores pause/resume/remove for unknown torrents', async () => {
    fx = createEngineFixture();
    fx.engine.pauseDownload('f'.repeat(40));
    fx.engine.resumeDownload('f'.repeat(40));
    await fx.engine.removeTorrent('f'.repeat(40), true);
    assert.deepEqual(fx.engine.getSnapshots(), []);
  });

  it('removeTorrent keeps files unless destroyFiles is set', async () => {
    fx = createEngineFixture();
    await fx.engine.add(movie().magnet, { name: movie().name });
    await fx.engine.add(new Uint8Array(show().torrentFile));
    await waitForDone(fx.engine, movie().infoHash);
    await waitForDone(fx.engine, show().infoHash);

    await fx.engine.removeTorrent(movie().infoHash, false);
    assert.ok(fs.existsSync(path.join(fx.downloadDir, movie().name)));

    await fx.engine.removeTorrent(show().infoHash, true);
    assert.equal(fs.existsSync(path.join(fx.downloadDir, show().name, Object.keys(show().sha1s)[0]!)), false);

    assert.deepEqual(fx.engine.getSnapshots(), []);
    assert.deepEqual(loadSession().torrents, []);
  });

  it('restores torrents from session.json in a new engine', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    await waitForDone(fx.engine, t.infoHash);
    fx.engine.pauseDownload(t.infoHash);
    await fx.engine.shutdown();

    const next = fx.reopen();
    const restoredEvents: unknown[] = [];
    next.on('session-restored', (r) => restoredEvents.push(r));
    const result = await next.restoreSession();
    assert.deepEqual(result, { restored: 1, failed: 0 });
    assert.deepEqual(restoredEvents, [{ restored: 1, failed: 0 }]);
    await waitFor(() => next.getSnapshots()[0]?.dlPaused, { message: 'restored paused state' });
    assert.equal(next.getSnapshots()[0]!.mediaCategory, 'movies');

    // Second restore is a no-op because the torrent is already active.
    assert.deepEqual(await next.restoreSession(), { restored: 0, failed: 0 });
  });

  it('pauses on reaching an upload limit (pause_seed)', async () => {
    fx = createEngineFixture();
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    await waitForDone(fx.engine, t.infoHash);

    fx.engine.updateTorrentPolicy(t.infoHash, { maxUploadBytes: 0 });
    assert.deepEqual(loadTorrentOverrides().byInfoHash[t.infoHash], { maxUploadBytes: 0 });
    assert.equal(fx.engine.getSnapshots()[0]!.maxUploadBytes, 0);

    await waitFor(() => fx!.engine.getSnapshots()[0]?.dlPaused, { message: 'limit pause' });
    assert.equal(loadSession().torrents[0]!.dlPaused, true);
  });

  it('removes but keeps files on reaching a ratio limit (remove_keep_files)', async () => {
    fx = createEngineFixture({ onReachLimit: 'remove_keep_files' });
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    await waitForDone(fx.engine, t.infoHash);

    fx.engine.updateTorrentPolicy(t.infoHash, { maxRatio: 0 });
    await waitFor(() => fx!.engine.getSnapshots().length === 0, { message: 'limit removal' });
    assert.ok(fs.existsSync(path.join(fx.downloadDir, t.name)));
    assert.deepEqual(loadSession().torrents, []);
  });

  it('auto-pauses active downloads when offline and resumes when back online', async () => {
    // Throttle so the download is still running when connectivity drops.
    fx = createEngineFixture({ globalDownloadLimitBps: 4_000 });
    const t = movie();
    const network: string[] = [];
    fx.engine.on('network', (s: string) => network.push(s));
    await fx.engine.add(t.magnet, { name: t.name });
    await waitFor(() => fx!.engine.getSnapshots()[0]?.length, { message: 'metadata' });

    await fx.connectivity.setOnline(false);
    assert.equal(fx.engine.isNetworkOnline(), false);
    assert.equal(fx.engine.getSnapshots()[0]!.dlPaused, true);
    // Offline pauses are not persisted as user pauses.
    assert.equal(loadSession().torrents[0]!.dlPaused, false);

    await fx.connectivity.setOnline(true);
    assert.equal(fx.engine.isNetworkOnline(), true);
    assert.equal(fx.engine.getSnapshots()[0]!.dlPaused, false);
    assert.deepEqual(network.slice(-2), ['offline', 'online']);
  });

  it('reports connected peers for an active download', async () => {
    fx = createEngineFixture({ globalDownloadLimitBps: 4_000 });
    const t = movie();
    await fx.engine.add(t.magnet, { name: t.name });
    const peers = await waitFor(() => {
      const p = fx!.engine.getPeers(t.infoHash);
      return p.length > 0 ? p : null;
    }, { message: 'peers' });
    assert.equal(peers[0]!.remoteAddress, '127.0.0.1');
    assert.ok(peers[0]!.remotePort > 0);
    assert.deepEqual(fx.engine.getPeers('0'.repeat(40)), []);
  });

  it('records a download-speed history per torrent', async () => {
    fx = createEngineFixture();
    await fx.engine.add(movie().magnet, { name: movie().name });
    await waitFor(() => (fx!.engine.getSnapshots()[0]?.history.length ?? 0) >= 2, {
      message: 'history samples',
    });
    assert.ok(Object.isFrozen(fx.engine.getSnapshots()[0]!.history));
  });

  it('persists global limits, default ratio and config when asked', async () => {
    fx = createEngineFixture();
    fx.engine.setGlobalLimits(1_000_000, 500_000);
    assert.equal(fs.existsSync(getConfigPath()), false);

    fx.engine.setGlobalLimits(2_000_000, 250_000, true);
    assert.equal(loadConfig().globalDownloadLimitBps, 2_000_000);
    assert.equal(loadConfig().globalUploadLimitBps, 250_000);

    fx.engine.setDefaultMaxRatio(1.5, true);
    assert.equal(loadConfig().defaultMaxRatio, 1.5);
    assert.equal(fx.engine.getConfig().defaultMaxRatio, 1.5);

    const other = path.join(fx.downloadDir, 'elsewhere');
    fx.engine.setConfig({ ...fx.engine.getConfig(), downloadDir: other }, { persist: true });
    assert.equal(fx.engine.getBaseDownloadDir(), other);
    assert.equal(loadConfig().downloadDir, other);
  });

  it('setBaseDownloadDir creates the directory and applies to new adds', async () => {
    fx = createEngineFixture();
    const dir = path.join(fx.downloadDir, 'new-base');
    let updates = 0;
    fx.engine.on('update', () => updates++);
    fx.engine.setBaseDownloadDir(dir);
    assert.equal(fx.engine.getBaseDownloadDir(), dir);
    assert.ok(fs.existsSync(dir));
    assert.ok(updates > 0);
    await fx.engine.add(movie().magnet, { name: movie().name });
    await waitForDone(fx.engine, movie().infoHash);
    assert.ok(fs.existsSync(path.join(dir, movie().name)));
  });

  it('rejects invalid torrent ids', async () => {
    fx = createEngineFixture();
    await assert.rejects(fx.engine.add('definitely not a torrent'));
  });

  it('reports shutdown progress through every phase', async () => {
    fx = createEngineFixture();
    await fx.engine.add(movie().magnet, { name: movie().name });
    await waitForDone(fx.engine, movie().infoHash);
    const progress: ShutdownProgress[] = [];
    await fx.engine.shutdown((p) => progress.push(p));
    const phases = [...new Set(progress.map((p) => p.phase))];
    assert.deepEqual(phases, ['network', 'torrent', 'client', 'done']);
    assert.ok(progress.some((p) => p.message.startsWith('Stopping Mock.Movie')));
  });

  it('reports "No active transfers" when shutting down empty', async () => {
    fx = createEngineFixture();
    const progress: ShutdownProgress[] = [];
    await fx.engine.shutdown((p) => progress.push(p));
    assert.ok(progress.some((p) => p.message === 'No active transfers'));
  });
});
