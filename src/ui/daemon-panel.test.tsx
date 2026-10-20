import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { DaemonPanel } from './daemon-panel.js';

describe('DaemonPanel', () => {
  let unmount: (() => void) | undefined;

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('shows running status and actions', () => {
    const r = render(
      <DaemonPanel
        status={{
          running: true,
          version: '0.4.2',
          pid: 4242,
          startedAt: '',
          uptimeMs: 65_000,
          url: 'http://127.0.0.1:17359',
          transferCount: 3,
          sseClients: 2,
          networkOnline: true,
          downloadSpeed: 0,
          uploadSpeed: 0,
          baseDownloadDir: '/tmp',
          pidFileMatches: true,
        }}
        busy={null}
        progress=""
      />
    );
    unmount = r.unmount;
    const out = r.lastFrame() ?? '';
    assert.match(out, /running/);
    assert.match(out, /pid 4242/);
    assert.match(out, /up 1m 5s/);
    assert.match(out, /r restart/);
  });

  it('shows not running and in-flight progress', () => {
    const r = render(
      <DaemonPanel
        status={{ running: false, url: 'http://127.0.0.1:17359', orphanPid: 99 }}
        busy="restart"
        progress="Starting daemon…"
      />
    );
    unmount = r.unmount;
    const out = r.lastFrame() ?? '';
    assert.match(out, /not running/);
    assert.match(out, /pid 99 alive but API unreachable/);
    assert.match(out, /Starting daemon/);
    assert.doesNotMatch(out, /r restart/);
  });
});
