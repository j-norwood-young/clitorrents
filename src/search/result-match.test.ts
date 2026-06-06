import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import {
  findActiveSnapshot,
  formatActiveResultBadge,
  infoHashFromSearchResult,
} from './result-match.js';
import type { CliflixSearchRow } from './cliflix-search.js';

const snap = (overrides: Partial<TorrentSnapshot>): TorrentSnapshot => ({
  infoHash: 'abc',
  name: 'Test Release 1080p',
  progress: 0.5,
  downloadSpeed: 0,
  uploadSpeed: 0,
  numPeers: 0,
  timeRemaining: 0,
  downloaded: 0,
  uploaded: 0,
  length: 1000,
  ratio: 0,
  downloadPath: '/tmp',
  done: false,
  paused: false,
  dlPaused: false,
  history: [],
  maxRatio: null,
  maxUploadBytes: null,
  ...overrides,
});

describe('infoHashFromSearchResult', () => {
  it('reads hash from magnet field', () => {
    const hash = infoHashFromSearchResult({
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    });
    assert.equal(hash, '0123456789abcdef0123456789abcdef01234567');
  });

  it('reads hash from info_hash field', () => {
    const hash = infoHashFromSearchResult({
      info_hash: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
    });
    assert.equal(hash, 'abcdef0123456789abcdef0123456789abcdef01');
  });
});

describe('findActiveSnapshot', () => {
  const row: CliflixSearchRow = {
    title: 'Test Release 1080p',
    _torrent: {
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    },
  };

  it('matches by info hash', () => {
    const found = findActiveSnapshot(row, [
      snap({ infoHash: '0123456789abcdef0123456789abcdef01234567', name: 'Other name' }),
    ]);
    assert.equal(found?.infoHash, '0123456789abcdef0123456789abcdef01234567');
  });

  it('falls back to normalized title', () => {
    const found = findActiveSnapshot(
      { title: 'Test.Release.1080p', _torrent: {} },
      [snap({ infoHash: 'deadbeef', name: 'Test Release 1080p' })]
    );
    assert.equal(found?.infoHash, 'deadbeef');
  });
});

describe('formatActiveResultBadge', () => {
  it('shows progress while downloading', () => {
    assert.equal(formatActiveResultBadge(snap({ progress: 0.423 })), '[↓42%]');
  });

  it('shows paused and done states', () => {
    assert.equal(formatActiveResultBadge(snap({ dlPaused: true })), '[‖]');
    assert.equal(formatActiveResultBadge(snap({ done: true })), '[✓]');
  });
});
