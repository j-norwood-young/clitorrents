import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const torrentSearch = require('torrent-search-api') as {
  disableAllProviders(): void;
  enableProvider(name: string): void;
  search(query: string, category: string, limit: number): Promise<TorrentApiResult[]>;
  getMagnet(torrent: TorrentApiResult): Promise<string | undefined>;
};

/** Raw result from torrent-search-api (shape varies by provider) */
export type TorrentApiResult = Record<string, unknown> & {
  title?: string;
};

export type CliflixSearchRow = {
  title: string;
  seeders?: number;
  peers?: number;
  size?: string | number;
  time?: string;
  /** Pass-through for torrent-search-api.getMagnet */
  _torrent: TorrentApiResult;
};

export type CliflixSearchOptions = {
  limit: number;
  activeProvider: string;
  availableProviders: readonly string[];
  /** Per-provider Torznab-style category; default Video for some like cliflix */
  categoryByProvider?: Readonly<Record<string, string>>;
};

const DEFAULT_CATEGORY_MAP: Record<string, string> = {
  ThePirateBay: 'Video',
  TorrentProject: 'Video',
};

/**
 * Search like cliflix: enable one provider, search; on failure or empty, try other providers in order.
 */
export async function searchCliflixStyle(
  query: string,
  opts: CliflixSearchOptions
): Promise<{ rows: CliflixSearchRow[]; info: string }> {
  const q = query.trim();
  if (!q) return { rows: [], info: 'empty query' };

  const catMap = { ...DEFAULT_CATEGORY_MAP, ...opts.categoryByProvider };
  const order = uniqueOrder(opts.activeProvider, opts.availableProviders);

  const parts: string[] = [];
  for (const provider of order) {
    try {
      torrentSearch.disableAllProviders();
      torrentSearch.enableProvider(provider);
      const category = catMap[provider] ?? 'All';
      const torrents = await torrentSearch.search(q, category, opts.limit);
      if (torrents?.length) {
        const rows = torrents.map((t) => toRow(t));
        parts.push(`${provider}: ${rows.length}`);
        return { rows, info: parts.join(' | ') };
      }
      parts.push(`${provider}: 0`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      parts.push(`${provider}: error ${msg.slice(0, 80)}`);
    }
  }

  return { rows: [], info: parts.join(' | ') || 'no providers' };
}

function uniqueOrder(active: string, list: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [active, ...list]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function toRow(t: TorrentApiResult): CliflixSearchRow {
  const title = typeof t.title === 'string' ? t.title : String(t.title ?? '');
  return {
    title,
    seeders: num(t.seeders ?? t.seeds),
    peers: num(t.peers),
    size:
      typeof t.size === 'string' || typeof t.size === 'number'
        ? (t.size as string | number)
        : undefined,
    time: typeof t.time === 'string' ? t.time : undefined,
    _torrent: t,
  };
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function getMagnetForTorrent(
  torrent: TorrentApiResult
): Promise<string | undefined> {
  try {
    const m = await torrentSearch.getMagnet(torrent);
    return typeof m === 'string' && m.startsWith('magnet:') ? m : undefined;
  } catch {
    return undefined;
  }
}
