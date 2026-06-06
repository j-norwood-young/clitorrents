import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import { infoHashFromMagnet } from '../engine/session-utils.js';
import type { CliflixSearchRow, TorrentApiResult } from './cliflix-search.js';

/** Best-effort info hash from a provider search row (magnet or info_hash fields). */
export function infoHashFromSearchResult(torrent: TorrentApiResult): string | null {
  const magnet = typeof torrent.magnet === 'string' ? torrent.magnet : null;
  if (magnet?.startsWith('magnet:')) {
    const fromMagnet = infoHashFromMagnet(magnet);
    if (fromMagnet) return fromMagnet;
  }

  const raw = torrent.info_hash ?? torrent.infoHash;
  if (typeof raw === 'string' && /^[a-f0-9]{40}$/i.test(raw)) {
    return raw.toLowerCase();
  }

  return null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Find an in-flight transfer matching this search result, if any. */
export function findActiveSnapshot(
  row: CliflixSearchRow,
  snapshots: readonly TorrentSnapshot[]
): TorrentSnapshot | undefined {
  const hash = infoHashFromSearchResult(row._torrent);
  if (hash) {
    const byHash = snapshots.find((s) => s.infoHash.toLowerCase() === hash);
    if (byHash) return byHash;
  }

  const normalized = normalizeTitle(row.title);
  if (!normalized) return undefined;
  return snapshots.find((s) => normalizeTitle(s.name) === normalized);
}

export function formatActiveResultBadge(snap: TorrentSnapshot): string {
  if (snap.done) return '[✓]';
  if (snap.dlPaused || snap.paused) return '[‖]';
  return `[↓${Math.round(snap.progress * 100)}%]`;
}
