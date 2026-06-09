import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDaemonStatus } from './status-cmd.js';
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
