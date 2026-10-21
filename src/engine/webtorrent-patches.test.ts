import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Peer from 'webtorrent/lib/peer.js';
import { applyWebTorrentPatches } from './webtorrent-patches.js';

describe('applyWebTorrentPatches', () => {
  it('skips the handshake for a peer whose swarm was torn down', () => {
    applyWebTorrentPatches();
    let handshakes = 0;
    const peer = {
      swarm: null,
      destroyed: true,
      wire: { handshake: () => handshakes++ },
    };
    assert.doesNotThrow(() => Peer.prototype.handshake.call(peer as never));
    assert.equal(handshakes, 0);
  });

  it('still handshakes for a live peer', () => {
    applyWebTorrentPatches();
    let handshakes = 0;
    const peer = {
      swarm: { private: false, infoHash: 'abc', client: { dht: null, peerId: 'id' } },
      destroyed: false,
      wire: { handshake: () => handshakes++ },
    };
    Peer.prototype.handshake.call(peer as never);
    assert.equal(handshakes, 1);
  });
});
