import type { AppConfig } from '../config.js';
import { getMagnetForTorrent, searchCliflixStyle } from '../search/cliflix-search.js';
import { resolveTorrentId } from '../search/resolve-torrent-id.js';
import type { TorrentEngine } from '../engine/torrent-engine.js';
import { formatCategoryLabel, planDownloadLocation } from '../media/classify.js';
import { formatBytes, formatEta, formatSpeed } from '../utils/format.js';

export type DownloadCommandOpts = {
  target: string;
  dir?: string;
  provider?: string;
  pick?: number;
  ratio?: number | null;
  downloadLimit?: number;
  uploadLimit?: number;
};

export async function runDownloadCommand(
  engine: TorrentEngine,
  config: AppConfig,
  opts: DownloadCommandOpts
): Promise<number> {
  if (opts.downloadLimit !== undefined || opts.uploadLimit !== undefined) {
    engine.setGlobalLimits(
      opts.downloadLimit ?? config.globalDownloadLimitBps,
      opts.uploadLimit ?? config.globalUploadLimitBps
    );
  }
  if (opts.ratio !== undefined) {
    engine.setDefaultMaxRatio(opts.ratio);
  }

  let magnetOrId: string | Uint8Array;
  let displayName: string;

  const target = opts.target.trim();
  const isDirect =
    target.startsWith('magnet:') ||
    /^[a-f0-9]{40}$/i.test(target) ||
    /^[a-z2-7]{32}$/i.test(target) ||
    /^https?:\/\//i.test(target);

  if (isDirect) {
    displayName = target.slice(0, 60);
    magnetOrId = await resolveTorrentId(target);
  } else {
    const pick = Math.max(1, opts.pick ?? 1) - 1;
    const { rows, info } = await searchCliflixStyle(target, {
      limit: config.torrents.limit,
      activeProvider: opts.provider ?? config.torrents.providers.active,
      availableProviders: config.torrents.providers.available,
      categoryByProvider: config.torrents.categoryByProvider,
    });
    if (rows.length === 0) {
      console.error(`No results — ${info}`);
      return 1;
    }
    const row = rows[pick];
    if (!row) {
      console.error(`Pick ${pick + 1} out of range (${rows.length} results)`);
      return 1;
    }
    displayName = row.title;
    console.log(`Selected: ${displayName}`);
    const magnet = await getMagnetForTorrent(row._torrent);
    if (!magnet) {
      console.error('Could not resolve magnet for selected result.');
      return 1;
    }
    magnetOrId = magnet;
  }

  const plan = planDownloadLocation(displayName, config, engine.getBaseDownloadDir());
  const dir = opts.dir ?? plan.dir;

  console.log(`Adding: ${displayName}`);
  if (config.categories?.enabled) {
    console.log(`Category: ${formatCategoryLabel(plan.category)}`);
  }
  console.log(`Save to: ${dir}`);

  await engine.add(magnetOrId, {
    name: displayName,
    downloadDir: opts.dir,
  });

  return new Promise<number>((resolve) => {
    const onUpdate = (): void => {
      const snaps = engine.getSnapshots();
      const s = snaps[snaps.length - 1];
      if (!s) return;
      const pct = (s.progress * 100).toFixed(1);
      process.stdout.write(
        `\r${pct}% DL ${formatSpeed(s.downloadSpeed)} UL ${formatSpeed(s.uploadSpeed)} ETA ${formatEta(s.timeRemaining)} peers ${s.numPeers}   `
      );
      if (s.done) {
        engine.off('update', onUpdate);
        console.log(`\nDone — ${formatBytes(s.length)} saved to ${s.downloadPath}`);
        void engine.destroy().then(() => resolve(0));
      }
    };
    engine.on('update', onUpdate);
    onUpdate();
  });
}
