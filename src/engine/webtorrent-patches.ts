import Peer from 'webtorrent/lib/peer.js';

/**
 * webtorrent 3.0.21 bug: an incoming encrypted peer for a paused/destroyed torrent is
 * rejected by `_addIncomingPeer` (which nulls `peer.swarm`), but conn-pool still calls
 * `wire.setInfoHash()`, which completes the crypto handshake and calls `peer.handshake()`.
 * That dereferences the null swarm inside an async function — an unhandled rejection
 * that kills the daemon. Skip the handshake once the peer has been torn down.
 *
 * Upstream: https://github.com/webtorrent/webtorrent/issues/3113 (fix in PR #3120).
 * Remove this once a webtorrent release includes that fix.
 */
let applied = false;

export function applyWebTorrentPatches(): void {
  if (applied) return;
  applied = true;
  const original = Peer.prototype.handshake;
  Peer.prototype.handshake = function patchedHandshake(this: InstanceType<typeof Peer>) {
    if (!this.swarm || this.destroyed) return;
    return original.call(this);
  };
}
