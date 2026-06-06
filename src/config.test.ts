import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
