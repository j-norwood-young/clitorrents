import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { getDaemonPanelStatus, startDaemon, stopDaemon } from './control.js';
import { getDaemonPidPath } from '../config.js';
import { startDaemonFixture } from '../test/daemon-fixture.js';
import { FakeEngine, makeConfig, spawnSleeper, withTempConfigDir } from '../test/helpers.js';

const deadConfig = () => makeConfig({ daemon: { host: '127.0.0.1', port: 9 } });

function writePid(pid: number): void {
  fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
  fs.writeFileSync(getDaemonPidPath(), String(pid));
}

describe('daemon control', () => {
  it('getDaemonPanelStatus returns live status from a running daemon', async () => {
    await withTempConfigDir(async () => {
      const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
      try {
        const status = await getDaemonPanelStatus(daemon.config);
        assert.equal(status.running, true);
        if (status.running) assert.equal(status.pid, process.pid);
      } finally {
        await daemon.close();
      }
    });
  });

  it('getDaemonPanelStatus reports not running, with an orphan pid when alive', async () => {
    await withTempConfigDir(async () => {
      assert.deepEqual(await getDaemonPanelStatus(deadConfig()), {
        running: false,
        url: 'http://127.0.0.1:9',
        orphanPid: null,
      });
      const child = spawnSleeper();
      try {
        writePid(child.pid);
        const status = await getDaemonPanelStatus(deadConfig());
        assert.equal(status.running, false);
        if (!status.running) assert.equal(status.orphanPid, child.pid);
      } finally {
        child.kill();
        await child.exited;
      }
    });
  });

  it('stopDaemon shuts down gracefully over the API', async () => {
    await withTempConfigDir(async () => {
      const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
      const progress: string[] = [];
      const result = await stopDaemon(daemon.config, (m) => progress.push(m));
      assert.equal(result, 'Daemon stopped');
      assert.equal(progress[0], 'Stopping transfers…');
      assert.ok(progress.some((m) => m.includes('Done')));
      assert.equal(daemon.shutdownCalls, 1);
    });
  });

  it('stopDaemon reports not running when there is no daemon or pid', async () => {
    await withTempConfigDir(async () => {
      assert.equal(await stopDaemon(deadConfig()), 'Daemon not running');
    });
  });

  it('stopDaemon falls back to SIGTERM for an unreachable daemon process', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      writePid(child.pid);
      assert.equal(await stopDaemon(deadConfig()), 'Daemon stopped (SIGTERM)');
      await child.exited;
    });
  });

  it('startDaemon is a no-op when the daemon already answers', async () => {
    await withTempConfigDir(async () => {
      const daemon = await startDaemonFixture(new FakeEngine(makeConfig()), makeConfig());
      try {
        assert.equal(await startDaemon(daemon.config), 'Daemon already running');
      } finally {
        await daemon.close();
      }
    });
  });
});
