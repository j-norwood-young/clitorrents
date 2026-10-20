import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import {
  defaultConfig,
  ensureConfigExists,
  getConfigPath,
  getSearchHistoryPath,
  getSessionPath,
  getTorrentOverridesPath,
  loadConfig,
  loadSearchHistory,
  loadSession,
  loadTorrentOverrides,
  saveSearchHistory,
  saveTorrentOverrides,
  updateDefaultRatio,
  updateGlobalLimits,
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

describe('config loading edge cases', () => {
  it('ensureConfigExists writes defaults on first run, then loads from disk', async () => {
    await withTempConfigDir(() => {
      assert.equal(fs.existsSync(getConfigPath()), false);
      assert.deepEqual(ensureConfigExists(), defaultConfig());
      assert.equal(fs.existsSync(getConfigPath()), true);
      fs.writeFileSync(getConfigPath(), JSON.stringify({ globalDownloadLimitBps: 7 }));
      assert.equal(ensureConfigExists().globalDownloadLimitBps, 7);
    });
  });

  it('merges partial config with defaults (nested providers and categories)', async () => {
    await withTempConfigDir(() => {
      fs.mkdirSync(getConfigPath().replace(/config\.json$/, ''), { recursive: true });
      fs.writeFileSync(
        getConfigPath(),
        JSON.stringify({
          torrents: { providers: { active: 'Yts' }, categoryByProvider: { Yts: 'Movies' } },
          categories: { enabled: true },
          jackett: { url: 'legacy' },
        })
      );
      const cfg = loadConfig();
      assert.equal(cfg.torrents.providers.active, 'Yts');
      assert.ok(cfg.torrents.providers.available.length > 1);
      assert.equal(cfg.torrents.categoryByProvider?.Yts, 'Movies');
      assert.equal(cfg.torrents.categoryByProvider?.ThePirateBay, 'Video');
      assert.equal(cfg.categories?.enabled, true);
      assert.equal(cfg.globalUploadLimitBps, -1);
      assert.equal('jackett' in cfg, false);
    });
  });

  it('falls back to defaults for corrupt or invalid files', async () => {
    await withTempConfigDir(() => {
      fs.mkdirSync(getConfigPath().replace(/config\.json$/, ''), { recursive: true });
      fs.writeFileSync(getConfigPath(), '{not json');
      assert.deepEqual(loadConfig(), defaultConfig());
      fs.writeFileSync(getConfigPath(), JSON.stringify({ globalDownloadLimitBps: 'fast' }));
      assert.deepEqual(loadConfig(), defaultConfig());

      fs.writeFileSync(getSessionPath(), '{"torrents": "nope"}');
      assert.deepEqual(loadSession(), { torrents: [] });
      fs.writeFileSync(getTorrentOverridesPath(), 'garbage');
      assert.deepEqual(loadTorrentOverrides(), { byInfoHash: {} });
      fs.writeFileSync(getSearchHistoryPath(), '[1, 2]');
      assert.deepEqual(loadSearchHistory(), []);
    });
  });
});

describe('search history and overrides persistence', () => {
  it('round-trips search history', async () => {
    await withTempConfigDir(() => {
      assert.deepEqual(loadSearchHistory(), []);
      saveSearchHistory(['newest', 'older']);
      assert.deepEqual(loadSearchHistory(), ['newest', 'older']);
    });
  });

  it('round-trips torrent overrides', async () => {
    await withTempConfigDir(() => {
      const data = setTorrentOverride('ABC', { maxRatio: 2, maxUploadBytes: null }, { byInfoHash: {} });
      saveTorrentOverrides(data);
      assert.deepEqual(loadTorrentOverrides(), { byInfoHash: { abc: { maxRatio: 2, maxUploadBytes: null } } });
    });
  });
});

describe('policy and limit helpers', () => {
  it('per-torrent null override disables an inherited limit', () => {
    const cfg = { ...sampleConfig(), defaultMaxRatio: 2, defaultMaxUploadBytes: 1000 };
    const overrides = setTorrentOverride('AA', { maxRatio: null }, { byInfoHash: {} });
    assert.deepEqual(getMergedTorrentPolicy('aa', cfg, overrides), { maxRatio: null, maxUploadBytes: 1000 });
  });

  it('setTorrentOverride merges patches; an explicit undefined clears that key', () => {
    let o = setTorrentOverride('aa', { maxRatio: 1 }, { byInfoHash: {} });
    o = setTorrentOverride('aa', { maxUploadBytes: 50 }, o);
    assert.deepEqual(o.byInfoHash.aa, { maxRatio: 1, maxUploadBytes: 50 });
    o = setTorrentOverride('aa', { maxRatio: undefined }, o);
    assert.deepEqual(o.byInfoHash.aa, { maxUploadBytes: 50 });
  });

  it('updateGlobalLimits and updateDefaultRatio return new configs', () => {
    const cfg = sampleConfig();
    const next = updateGlobalLimits(cfg, { globalUploadLimitBps: 10 });
    assert.equal(next.globalUploadLimitBps, 10);
    assert.equal(next.globalDownloadLimitBps, -1);
    assert.notEqual(next, cfg);
    assert.equal(updateDefaultRatio(cfg, 3).defaultMaxRatio, 3);
    assert.equal(cfg.defaultMaxRatio, null);
  });

  it('getDaemonBaseUrl falls back to defaults', () => {
    assert.equal(getDaemonBaseUrl(sampleConfig()), 'http://127.0.0.1:17359');
  });
});
