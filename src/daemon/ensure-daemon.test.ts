import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connectEngine, ensureDaemonRunning, fetchDaemonState, pingDaemon, resolveCliPath } from './ensure-daemon.js';
import { EngineClient } from '../engine/engine-client.js';
import { startDaemonFixture } from '../test/daemon-fixture.js';
import { FakeEngine, makeConfig, makeSnapshot, sendJson, startStubServer } from '../test/helpers.js';

describe('ensure-daemon', () => {
  it('pingDaemon is true for a healthy daemon and false otherwise', async () => {
    const stub = await startStubServer({
      'GET /api/health': (_req, res) => sendJson(res, 200, { ok: true }),
    });
    try {
      assert.equal(await pingDaemon(`${stub.url}/`), true);
    } finally {
      await stub.close();
    }
    assert.equal(await pingDaemon(stub.url), false);

    const failing = await startStubServer({
      'GET /api/health': (_req, res) => sendJson(res, 500, {}),
    });
    try {
      assert.equal(await pingDaemon(failing.url), false);
    } finally {
      await failing.close();
    }
  });

  it('fetchDaemonState returns state or throws with the status code', async () => {
    const engine = new FakeEngine(makeConfig(), '/dl');
    engine.snapshots = [makeSnapshot({ name: 'x' })];
    const daemon = await startDaemonFixture(engine, makeConfig());
    try {
      const state = await fetchDaemonState(daemon.url);
      assert.equal(state.snapshots[0]!.name, 'x');
      assert.equal(state.baseDownloadDir, '/dl');
    } finally {
      await daemon.close();
    }

    const stub = await startStubServer({});
    try {
      await assert.rejects(fetchDaemonState(stub.url), /Daemon state unavailable \(404\)/);
    } finally {
      await stub.close();
    }
  });

  it('ensureDaemonRunning and connectEngine reuse a running daemon without spawning', async () => {
    const engine = new FakeEngine(makeConfig(), '/dl');
    const daemon = await startDaemonFixture(engine, makeConfig());
    try {
      assert.equal(await ensureDaemonRunning(daemon.config), daemon.url);
      const client = await connectEngine(daemon.config);
      try {
        assert.ok(client instanceof EngineClient);
        assert.equal(client.getBaseDownloadDir(), '/dl');
      } finally {
        await client.destroy();
      }
    } finally {
      await daemon.close();
    }
  });

  it('resolveCliPath points at the directory containing cli.js', () => {
    assert.match(resolveCliPath(), /src$|dist$/);
  });
});
