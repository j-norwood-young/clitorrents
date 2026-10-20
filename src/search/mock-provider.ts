import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TorrentProvider = require('torrent-search-api/lib/TorrentProvider') as new (
  definition: Record<string, unknown>
) => object;

export const MOCK_PROVIDER_NAME = 'MockServer';

type MockRow = Record<string, unknown> & { infoHash?: string };

/**
 * torrent-search-api provider backed by the local mock torrent server
 * (see src/test/mock-torrent-server.ts). Enabled via CLITORRENTS_MOCK_SERVER.
 */
export function createMockProvider(baseUrl: string, name = MOCK_PROVIDER_NAME): object {
  const base = baseUrl.replace(/\/$/, '');

  class MockServerProvider extends TorrentProvider {
    constructor() {
      super({ name, baseUrl: base, categories: { All: '', Video: '' }, defaultCategory: 'All' });
    }

    async search(query: string, _category: string, limit: number): Promise<MockRow[]> {
      const url = `${base}/search?q=${encodeURIComponent(query)}&limit=${limit || 0}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Mock search failed (${res.status})`);
      const rows = (await res.json()) as MockRow[];
      return rows.map((r) => ({ ...r, provider: name }));
    }

    async getMagnet(torrent: MockRow): Promise<string | undefined> {
      if (!torrent.infoHash) return undefined;
      const res = await fetch(`${base}/magnet/${torrent.infoHash}`);
      return res.ok ? res.text() : undefined;
    }
  }

  return new MockServerProvider();
}

/**
 * When CLITORRENTS_MOCK_SERVER is set, register the mock provider and make it the only
 * search provider for this process (config on disk is untouched).
 */
export function applyMockServerEnv<T extends { torrents: { providers: { active: string; available: string[] } } }>(
  config: T,
  register: (provider: object) => void,
  env: NodeJS.ProcessEnv = process.env
): T {
  const url = env.CLITORRENTS_MOCK_SERVER?.trim();
  if (!url) return config;
  register(createMockProvider(url));
  return {
    ...config,
    torrents: {
      ...config.torrents,
      providers: { active: MOCK_PROVIDER_NAME, available: [MOCK_PROVIDER_NAME] },
    },
  };
}
