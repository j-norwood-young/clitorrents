import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { infoHashFromMagnet, sessionKeyForMagnet, whenTorrentReady } from './session-utils.js';

describe('infoHashFromMagnet', () => {
  it('parses hex btih from magnet URI', () => {
    const hash = infoHashFromMagnet(
      'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=test'
    );
    assert.equal(hash, '0123456789abcdef0123456789abcdef01234567');
  });
});

describe('sessionKeyForMagnet', () => {
  it('uses info hash when present', () => {
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
    assert.equal(sessionKeyForMagnet(magnet), '0123456789abcdef0123456789abcdef01234567');
  });
});

describe('whenTorrentReady', () => {
  it('runs immediately when torrent is already ready', async () => {
    let called = false;
    whenTorrentReady({ ready: true, once: () => undefined } as never, () => {
      called = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(called, true);
  });

  it('waits for ready event when not ready yet', () => {
    let called = false;
    const handlers = new Map<string, () => void>();
    const tor = {
      ready: false,
      once: (event: string, fn: () => void) => {
        handlers.set(event, fn);
      },
    };
    whenTorrentReady(tor as never, () => {
      called = true;
    });
    assert.equal(called, false);
    handlers.get('ready')?.();
    assert.equal(called, true);
  });
});
