import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyMedia, resolveDownloadDir } from './classify.js';
import type { AppConfig } from '../config.js';

const baseConfig = (): AppConfig => ({
  downloadDir: null,
  categories: {
    enabled: true,
    tv: '/media/tv',
    movies: '/media/movies',
    music: '/media/music',
  },
  torrents: {
    limit: 10,
    providers: { available: ['1337x'], active: '1337x' },
  },
  globalDownloadLimitBps: -1,
  globalUploadLimitBps: -1,
  onReachLimit: 'pause_seed',
});

describe('classifyMedia', () => {
  const cases: [string, ReturnType<typeof classifyMedia>][] = [
    ['Show.Name.S01E02.1080p.WEB-DL', 'tv'],
    ['Something.1x02.720p', 'tv'],
    ['Artist - Album [FLAC]', 'music'],
    ['Artist Album 320kbps MP3', 'music'],
    ['Movie.Title.2024.1080p.BluRay', 'movies'],
    ['Random Release 1080p', 'movies'],
    ['unknown pack', 'unknown'],
  ];

  for (const [name, expected] of cases) {
    it(`classifies "${name}" as ${expected}`, () => {
      assert.equal(classifyMedia(name), expected);
    });
  }
});

describe('resolveDownloadDir', () => {
  it('routes TV to tv dir when categories enabled', () => {
    const dir = resolveDownloadDir('Show S01E01', baseConfig(), '/downloads');
    assert.equal(dir, '/media/tv');
  });

  it('falls back to base when categories disabled', () => {
    const cfg = baseConfig();
    cfg.categories = { enabled: false };
    const dir = resolveDownloadDir('Show S01E01', cfg, '/downloads');
    assert.equal(dir, '/downloads');
  });

  it('uses config downloadDir as base', () => {
    const cfg = { ...baseConfig(), downloadDir: '/fixed' };
    cfg.categories = { enabled: false };
    assert.equal(resolveDownloadDir('anything', cfg), '/fixed');
  });
});
