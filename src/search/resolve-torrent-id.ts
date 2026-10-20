import parseTorrent, { toMagnetURI } from 'parse-torrent';
import { VERSION } from '../constants.js';

/** True for magnets, hex/base32 info hashes and http(s) .torrent URLs (anything that isn't a search query). */
export function isDirectTorrentTarget(target: string): boolean {
  const s = target.trim();
  return (
    s.startsWith('magnet:') ||
    /^[a-f0-9]{40}$/i.test(s) ||
    /^[a-z2-7]{32}$/i.test(s) ||
    /^https?:\/\//i.test(s)
  );
}

/** Resolve magnet URI, info hash, or .torrent URL into something WebTorrent can add. */
export async function resolveTorrentId(linkOrMagnet: string): Promise<string | Uint8Array> {
  const s = linkOrMagnet.trim();
  if (s.startsWith('magnet:')) return s;
  if (/^[a-f0-9]{40}$/i.test(s) || /^[a-z2-7]{32}$/i.test(s)) {
    const parsed = await parseTorrent(s);
    return toMagnetURI(parsed);
  }

  const res = await fetch(s, {
    redirect: 'follow',
    headers: {
      'User-Agent': `clitorrents/${VERSION}`,
      Accept: 'application/x-bittorrent, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download torrent metadata (${res.status})`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = await parseTorrent(buf);
  return toMagnetURI(parsed);
}
