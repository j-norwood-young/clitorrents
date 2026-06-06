import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planSessionSync } from './session-sync.js';

const hashA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const hashB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('planSessionSync', () => {
  it('plans pause when disk says paused and local is active', () => {
    const actions = planSessionSync(
      new Set([hashA]),
      new Set(),
      new Map([[hashA, false]]),
      {
        torrents: [
          {
            infoHash: hashA,
            magnet: `magnet:?xt=urn:btih:${hashA}`,
            downloadPath: '/dl',
            dlPaused: true,
          },
        ],
      }
    );
    assert.deepEqual(actions, [{ type: 'pause', infoHash: hashA }]);
  });

  it('plans resume when disk says active and local is paused', () => {
    const actions = planSessionSync(
      new Set([hashA]),
      new Set(),
      new Map([[hashA, true]]),
      {
        torrents: [
          {
            infoHash: hashA,
            magnet: `magnet:?xt=urn:btih:${hashA}`,
            downloadPath: '/dl',
            dlPaused: false,
          },
        ],
      }
    );
    assert.deepEqual(actions, [{ type: 'resume', infoHash: hashA }]);
  });

  it('plans add for disk entries not active or pending', () => {
    const entry = {
      infoHash: hashB,
      magnet: `magnet:?xt=urn:btih:${hashB}`,
      downloadPath: '/movies',
      dlPaused: false,
    };
    const actions = planSessionSync(new Set(), new Set(), new Map(), {
      torrents: [entry],
    });
    assert.deepEqual(actions, [{ type: 'add', entry }]);
  });

  it('skips add when hash is pending locally', () => {
    const actions = planSessionSync(
      new Set(),
      new Set([hashB]),
      new Map(),
      {
        torrents: [
          {
            infoHash: hashB,
            magnet: `magnet:?xt=urn:btih:${hashB}`,
            downloadPath: '/movies',
            dlPaused: false,
          },
        ],
      }
    );
    assert.deepEqual(actions, []);
  });

  it('plans remove when active torrent is missing from disk', () => {
    const actions = planSessionSync(
      new Set([hashA]),
      new Set(),
      new Map([[hashA, false]]),
      { torrents: [] }
    );
    assert.deepEqual(actions, [{ type: 'remove', infoHash: hashA }]);
  });
});
