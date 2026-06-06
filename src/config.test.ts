import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDaemonBaseUrl,
  getMergedTorrentPolicy,
  resolveBaseDir,
  setTorrentOverride,
  type AppConfig,
} from './config.js';
import { withTempConfigDir } from './test/helpers.js';

const sampleConfig = (): AppConfig => ({
  downloadDir: null,
  categories: { enabled: false },
  torrents: {
    limit: 10,
    providers: { available: ['1337x'], active: '1337x' },
  },
  globalDownloadLimitBps: -1,
  globalUploadLimitBps: -1,
  defaultMaxRatio: null,
  defaultMaxUploadBytes: null,
  onReachLimit: 'pause_seed',
});

describe('resolveBaseDir', () => {
  it('uses cwd when downloadDir is null', () => {
    const cfg = sampleConfig();
    assert.equal(resolveBaseDir(cfg, '/tmp/foo'), '/tmp/foo');
  });

  it('uses explicit downloadDir override', () => {
    const cfg = { ...sampleConfig(), downloadDir: '/data/torrents' };
    assert.equal(resolveBaseDir(cfg, '/tmp/foo'), '/data/torrents');
  });
});

describe('getDaemonBaseUrl', () => {
  it('builds URL from daemon config', () => {
    const cfg = { ...sampleConfig(), daemon: { host: '127.0.0.1', port: 17359 } };
    assert.equal(getDaemonBaseUrl(cfg), 'http://127.0.0.1:17359');
  });
});

describe('config round-trip', () => {
  it('saves and loads config', async () => {
    await withTempConfigDir(async () => {
      const { saveConfig, loadConfig } = await import('./config.js');
      const cfg = { ...sampleConfig(), downloadDir: '/custom/path' };
      saveConfig(cfg);
      const loaded = loadConfig();
      assert.equal(loaded.downloadDir, '/custom/path');
      assert.equal(loaded.torrents.providers.active, '1337x');
    });
  });
});

describe('session round-trip', () => {
  it('saves and loads session torrents', async () => {
    await withTempConfigDir(async () => {
      const { saveSession, loadSession } = await import('./config.js');
      saveSession({
        torrents: [
          {
            infoHash: 'abc123',
            magnet: 'magnet:?xt=urn:btih:abc123',
            downloadPath: '/data/tv/show',
            name: 'Show S01E01',
            mediaCategory: 'tv',
            dlPaused: true,
          },
        ],
      });
      const loaded = loadSession();
      assert.equal(loaded.torrents.length, 1);
      assert.equal(loaded.torrents[0]?.infoHash, 'abc123');
      assert.equal(loaded.torrents[0]?.dlPaused, true);
    });
  });

  it('dedupes session entries by infoHash', async () => {
    await withTempConfigDir(async () => {
      const { saveSession, loadSession } = await import('./config.js');
      saveSession({
        torrents: [
          {
            infoHash: 'ABC',
            magnet: 'magnet:?xt=urn:btih:abc',
            downloadPath: '/old',
            dlPaused: false,
          },
          {
            infoHash: 'abc',
            magnet: 'magnet:?xt=urn:btih:abc',
            downloadPath: '/new',
            dlPaused: true,
          },
        ],
      });
      const loaded = loadSession();
      assert.equal(loaded.torrents.length, 1);
      assert.equal(loaded.torrents[0]?.downloadPath, '/new');
      assert.equal(loaded.torrents[0]?.dlPaused, true);
    });
  });

  it('persists multiple torrents', async () => {
    await withTempConfigDir(async () => {
      const { saveSession, loadSession } = await import('./config.js');
      saveSession({
        torrents: [
          {
            infoHash: 'aaa',
            magnet: 'magnet:?xt=urn:btih:aaa',
            downloadPath: '/one',
            dlPaused: false,
          },
          {
            infoHash: 'bbb',
            magnet: 'magnet:?xt=urn:btih:bbb',
            downloadPath: '/two',
            name: 'Second',
            dlPaused: true,
          },
        ],
      });
      const loaded = loadSession();
      assert.equal(loaded.torrents.length, 2);
      assert.equal(loaded.torrents[1]?.name, 'Second');
    });
  });
});

describe('torrent policy overrides', () => {
  it('merges per-torrent ratio over global default', () => {
    const cfg = { ...sampleConfig(), defaultMaxRatio: 2 };
    const overrides = setTorrentOverride('deadbeef', { maxRatio: 0.5 }, { byInfoHash: {} });
    const policy = getMergedTorrentPolicy('deadbeef', cfg, overrides);
    assert.equal(policy.maxRatio, 0.5);
  });

  it('inherits global when no override', () => {
    const cfg = { ...sampleConfig(), defaultMaxRatio: 1.5 };
    const policy = getMergedTorrentPolicy('deadbeef', cfg, { byInfoHash: {} });
    assert.equal(policy.maxRatio, 1.5);
  });
});
