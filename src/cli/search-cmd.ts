import type { AppConfig } from '../config.js';
import { searchCliflixStyle } from '../search/cliflix-search.js';
import { formatBytes } from '../utils/format.js';

export async function runSearchCommand(
  query: string,
  config: AppConfig,
  opts?: { provider?: string; limit?: number }
): Promise<number> {
  const { rows, info } = await searchCliflixStyle(query, {
    limit: opts?.limit ?? config.torrents.limit,
    activeProvider: opts?.provider ?? config.torrents.providers.active,
    availableProviders: config.torrents.providers.available,
    categoryByProvider: config.torrents.categoryByProvider,
  });

  if (rows.length === 0) {
    console.error(`No results — ${info}`);
    return 1;
  }

  console.log(`# ${rows.length} results (${info})\n`);
  rows.forEach((r, i) => {
    const size =
      typeof r.size === 'string'
        ? r.size
        : typeof r.size === 'number'
          ? formatBytes(r.size)
          : '?';
    console.log(`${i + 1}. ${r.title}`);
    console.log(`   seeders: ${r.seeders ?? '?'}  size: ${size}`);
  });
  return 0;
}
