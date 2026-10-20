import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import {
  fetchDaemonStatus,
  formatDaemonStatus,
  formatDaemonStatusOffline,
  runStatusCommand,
} from './status-cmd.js';
import { getDaemonPidPath } from '../config.js';
import { startDaemonFixture } from '../test/daemon-fixture.js';
import {
  captureOutput,
  FakeEngine,
  makeConfig,
  sendJson,
  spawnSleeper,
  startStubServer,
  withTempConfigDir,
} from '../test/helpers.js';
import type { DaemonStatus } from '../daemon/http-server.js';

describe('formatDaemonStatus', () => {
  it('prints pid, uptime, transfers, and SSE clients', () => {
    const status: DaemonStatus = {
      running: true,
      version: '0.4.1',
      pid: 4242,
      startedAt: new Date().toISOString(),
      uptimeMs: 125_000,
      url: 'http://127.0.0.1:17359',
      transferCount: 4,
      sseClients: 2,
      networkOnline: true,
      downloadSpeed: 512_000,
      uploadSpeed: 32_000,
      baseDownloadDir: '/home/user/Downloads',
      pidFileMatches: true,
    };
    const text = formatDaemonStatus(status);
    assert.match(text, /running/);
    assert.match(text, /PID:\s+4242/);
    assert.match(text, /2m 5s/);
    assert.match(text, /Transfers:\s+4/);
    assert.match(text, /Clients:\s+2 SSE/);
  });

  it('shows placeholders when uptime and clients are unavailable', () => {
    const status: DaemonStatus = {
      running: true,
      version: '0.4.1',
      pid: 4242,
      startedAt: '',
      url: 'http://127.0.0.1:17359',
      transferCount: 4,
      networkOnline: true,
      downloadSpeed: 0,
      uploadSpeed: 0,
      baseDownloadDir: '/home/user/Downloads',
      pidFileMatches: true,
    };
    const text = formatDaemonStatus(status);
    assert.match(text, /Uptime:\s+—/);
    assert.match(text, /Clients:\s+—/);
  });
});

describe('formatDaemonStatus edge cases', () => {
  const base: DaemonStatus = {
    running: true,
    version: '0.4.2',
    pid: 1,
    startedAt: '',
    uptimeMs: 0,
    url: 'http://x',
    transferCount: 0,
    sseClients: 0,
    networkOnline: false,
    downloadSpeed: 0,
    uploadSpeed: 0,
    baseDownloadDir: '/d',
    pidFileMatches: false,
  };

  it('flags a pid file mismatch and offline network', () => {
    const text = formatDaemonStatus(base);
    assert.match(text, /PID:\s+1 \(pid file mismatch!\)/);
    assert.match(text, /Network:\s+offline/);
  });

  it('shows unknown pid', () => {
    assert.match(formatDaemonStatus({ ...base, pid: 0 }), /PID:\s+unknown/);
  });
});

describe('formatDaemonStatusOffline', () => {
  it('includes stale and alive pid-file hints', () => {
    const stale = formatDaemonStatusOffline({
      running: false,
      url: 'http://x',
      pidFile: 5,
      pidFileStale: true,
      message: 'hint',
    });
    assert.match(stale, /not running/);
    assert.match(stale, /PID file: 5 \(stale/);
    assert.match(stale, /hint/);
    const alive = formatDaemonStatusOffline({
      running: false,
      url: 'http://x',
      pidFile: 5,
      pidFileStale: false,
      message: 'hint',
    });
    assert.match(alive, /process alive but API unreachable/);
  });
});

describe('fetchDaemonStatus', () => {
  it('reads /api/status from a live daemon', async () => {
    const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
    try {
      const status = await fetchDaemonStatus(daemon.url);
      assert.equal(status?.pid, process.pid);
    } finally {
      await daemon.close();
    }
  });

  it('falls back to health + state for daemons without /api/status', async () => {
    await withTempConfigDir(async () => {
      const stub = await startStubServer({
        'GET /api/health': (_req, res) => sendJson(res, 200, { ok: true, version: '0.3.0' }),
        'GET /api/state': (_req, res) =>
          sendJson(res, 200, {
            snapshots: [{}, {}],
            downloadSpeed: 1,
            uploadSpeed: 2,
            networkOnline: true,
            config: makeConfig(),
            baseDownloadDir: '/legacy',
          }),
      });
      try {
        const status = await fetchDaemonStatus(stub.url, 'http://configured');
        assert.equal(status?.version, '0.3.0');
        assert.equal(status?.transferCount, 2);
        assert.equal(status?.url, 'http://configured');
        assert.equal(status?.baseDownloadDir, '/legacy');
        assert.equal(status?.uptimeMs, undefined);
        assert.equal(status?.pidFileMatches, false);
      } finally {
        await stub.close();
      }
    });
  });

  it('returns null when nothing is listening', async () => {
    assert.equal(await fetchDaemonStatus('http://127.0.0.1:9'), null);
  });
});

describe('runStatusCommand', () => {
  const dead = makeConfig({ daemon: { host: '127.0.0.1', port: 9 } });
  const writePid = (pid: number) => {
    fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
    fs.writeFileSync(getDaemonPidPath(), String(pid));
  };

  it('prints status and returns 0 for a running daemon', async () => {
    const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
    try {
      const { result, stdout } = await captureOutput(() => runStatusCommand(daemon.config));
      assert.equal(result, 0);
      assert.match(stdout, /clitorrents daemon: running/);
    } finally {
      await daemon.close();
    }
  });

  it('returns 1 when not running', async () => {
    await withTempConfigDir(async () => {
      const { result, stdout } = await captureOutput(() => runStatusCommand(dead));
      assert.equal(result, 1);
      assert.match(stdout, /not running/);
      assert.match(stdout, /Start with: clitorrents daemon/);
    });
  });

  it('returns 1 for a stale pid file and 2 for a live but unreachable process', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      writePid(child.pid);
      try {
        const alive = await captureOutput(() => runStatusCommand(dead));
        assert.equal(alive.result, 2);
        assert.match(alive.stdout, /process alive but API unreachable/);
      } finally {
        child.kill();
        await child.exited;
      }
      const stale = await captureOutput(() => runStatusCommand(dead));
      assert.equal(stale.result, 1);
      assert.match(stale.stdout, /stale/);
    });
  });
});
