import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { runStopDaemonCommand } from './stop-daemon-cmd.js';
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

const configFor = (port: number) => makeConfig({ daemon: { host: '127.0.0.1', port } });

describe('runStopDaemonCommand', () => {
  it('asks a running daemon to shut down', async () => {
    const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
    const { result, stdout } = await captureOutput(() => runStopDaemonCommand(daemon.config));
    assert.equal(result, 0);
    assert.equal(stdout, 'Daemon stopped.\n');
    assert.equal(daemon.shutdownCalls, 1);
  });

  it('returns 1 when the shutdown request fails', async () => {
    const stub = await startStubServer({
      'GET /api/health': (_req, res) => sendJson(res, 200, { ok: true }),
      'POST /api/shutdown': (_req, res) => sendJson(res, 500, { error: 'boom' }),
    });
    try {
      const { result, stderr } = await captureOutput(() => runStopDaemonCommand(configFor(stub.port)));
      assert.equal(result, 1);
      assert.match(stderr, /shutdown request failed/);
    } finally {
      await stub.close();
    }
  });

  it('signals the pid-file process when the API is unreachable', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
      fs.writeFileSync(getDaemonPidPath(), String(child.pid));
      const { result, stdout } = await captureOutput(() => runStopDaemonCommand(configFor(9)));
      assert.equal(result, 0);
      assert.equal(stdout, 'Daemon stopped.\n');
      await child.exited;
    });
  });

  it('reports when no daemon is running', async () => {
    await withTempConfigDir(async () => {
      const { result, stdout } = await captureOutput(() => runStopDaemonCommand(configFor(9)));
      assert.equal(result, 0);
      assert.equal(stdout, 'No daemon running.\n');
    });
  });
});
