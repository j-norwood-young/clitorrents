import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import {
  acquireDaemonLock,
  DaemonLockError,
  isProcessRunning,
  readDaemonPid,
  releaseDaemonLock,
  stopDaemonProcess,
} from './instance.js';
import { getDaemonPidPath } from '../config.js';
import { spawnSleeper, withTempConfigDir } from '../test/helpers.js';

describe('daemon pid lock', () => {
  it('isProcessRunning detects live and dead pids', async () => {
    assert.equal(isProcessRunning(process.pid), true);
    const child = spawnSleeper();
    assert.equal(isProcessRunning(child.pid), true);
    child.kill();
    await child.exited;
    assert.equal(isProcessRunning(child.pid), false);
  });

  it('readDaemonPid returns null for missing or garbage pid files', async () => {
    await withTempConfigDir(() => {
      assert.equal(readDaemonPid(), null);
      fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
      fs.writeFileSync(getDaemonPidPath(), 'nope');
      assert.equal(readDaemonPid(), null);
      fs.writeFileSync(getDaemonPidPath(), '-4');
      assert.equal(readDaemonPid(), null);
      fs.writeFileSync(getDaemonPidPath(), ' 1234\n');
      assert.equal(readDaemonPid(), 1234);
    });
  });

  it('acquire writes our pid and release removes it', async () => {
    await withTempConfigDir(() => {
      acquireDaemonLock();
      assert.equal(readDaemonPid(), process.pid);
      releaseDaemonLock();
      assert.equal(fs.existsSync(getDaemonPidPath()), false);
    });
  });

  it('acquire throws DaemonLockError while another live process holds the lock', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      try {
        fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
        fs.writeFileSync(getDaemonPidPath(), String(child.pid));
        assert.throws(() => acquireDaemonLock(), (err: unknown) => {
          assert.ok(err instanceof DaemonLockError);
          assert.match(err.message, new RegExp(`pid ${child.pid}`));
          return true;
        });
        // Releasing someone else's lock is a no-op.
        releaseDaemonLock();
        assert.equal(readDaemonPid(), child.pid);
      } finally {
        child.kill();
        await child.exited;
      }
    });
  });

  it('acquire replaces a stale pid file', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      child.kill();
      await child.exited;
      fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
      fs.writeFileSync(getDaemonPidPath(), String(child.pid));
      acquireDaemonLock();
      assert.equal(readDaemonPid(), process.pid);
    });
  });
});

describe('stopDaemonProcess', () => {
  it('returns false without a pid file', async () => {
    await withTempConfigDir(async () => {
      assert.equal(await stopDaemonProcess(100), false);
    });
  });

  it('cleans up a stale pid file and returns false', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      child.kill();
      await child.exited;
      fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
      fs.writeFileSync(getDaemonPidPath(), String(child.pid));
      assert.equal(await stopDaemonProcess(100), false);
      assert.equal(fs.existsSync(getDaemonPidPath()), false);
    });
  });

  it('SIGTERMs the daemon and removes the pid file', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper();
      fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
      fs.writeFileSync(getDaemonPidPath(), String(child.pid));
      assert.equal(await stopDaemonProcess(5000), true);
      assert.equal(fs.existsSync(getDaemonPidPath()), false);
    });
  });

  it('returns false if the process ignores SIGTERM until the timeout', async () => {
    await withTempConfigDir(async () => {
      const child = spawnSleeper({ ignoreSigterm: true });
      try {
        await new Promise((r) => setTimeout(r, 200)); // let the handler install
        fs.mkdirSync(getDaemonPidPath().replace(/daemon\.pid$/, ''), { recursive: true });
        fs.writeFileSync(getDaemonPidPath(), String(child.pid));
        assert.equal(await stopDaemonProcess(300), false);
      } finally {
        child.kill();
        await child.exited;
      }
    });
  });
});
