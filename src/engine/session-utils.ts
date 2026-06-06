import type { Torrent } from 'webtorrent';

/** Extract lowercase info hash from a magnet URI (hex btih only). */
export function infoHashFromMagnet(magnet: string): string | null {
  const match = magnet.match(/[?&]xt=urn:btih:([a-f0-9]{40})/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** Stable session map key for a magnet before metadata is ready. */
export function sessionKeyForMagnet(magnet: string): string {
  const hash = infoHashFromMagnet(magnet);
  if (hash) return hash;
  let h = 0;
  for (let i = 0; i < magnet.length; i++) {
    h = (h * 31 + magnet.charCodeAt(i)) >>> 0;
  }
  return `pending:${h.toString(16)}`;
}

export function whenTorrentReady(tor: Torrent, fn: () => void): void {
  if (tor.ready) {
    setImmediate(fn);
  } else {
    tor.once('ready', fn);
  }
}
