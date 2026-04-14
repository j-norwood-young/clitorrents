import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

const configDir = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
  'clitorrents'
);

export const configPath = path.join(configDir, 'config.json');
export const torrentOverridesPath = path.join(configDir, 'torrent-overrides.json');

/** Same default list as cliflix — many sites change often; edit config if needed */
export const DEFAULT_TORRENT_PROVIDERS = [
  '1337x',
  'ThePirateBay',
  'ExtraTorrent',
  'Rarbg',
  'Torrent9',
  'KickassTorrents',
  'TorrentProject',
  'Torrentz2',
] as const;

export const AppConfigSchema = z.object({
  downloadDir: z.string(),
  torrents: z.object({
    limit: z.number().int().positive().default(30),
    providers: z.object({
      available: z.array(z.string()).default([...DEFAULT_TORRENT_PROVIDERS]),
      active: z.string().default('1337x'),
    }),
    /** Per-provider category for torrent-search-api (cliflix used Video for TPB/TorrentProject) */
    categoryByProvider: z.record(z.string(), z.string()).optional(),
  }),
  /** Bytes/sec; -1 = unlimited, 0 = blocked */
  globalDownloadLimitBps: z.number().int(),
  globalUploadLimitBps: z.number().int(),
  defaultMaxRatio: z.number().positive().nullable().optional(),
  defaultMaxUploadBytes: z.number().nonnegative().nullable().optional(),
  onReachLimit: z.enum(['pause_seed', 'remove_keep_files']).default('pause_seed'),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const TorrentOverrideSchema = z.object({
  maxRatio: z.union([z.number().positive(), z.null()]).optional(),
  maxUploadBytes: z.union([z.number().nonnegative(), z.null()]).optional(),
});

export type TorrentOverride = z.infer<typeof TorrentOverrideSchema>;

export const TorrentOverridesFileSchema = z.object({
  byInfoHash: z.record(z.string(), TorrentOverrideSchema).default({}),
});

export type TorrentOverridesFile = z.infer<typeof TorrentOverridesFileSchema>;

function defaultConfig(): AppConfig {
  return {
    downloadDir: path.join(os.homedir(), 'Downloads', 'clitorrents'),
    torrents: {
      limit: 30,
      providers: {
        available: [...DEFAULT_TORRENT_PROVIDERS],
        active: '1337x',
      },
      categoryByProvider: {
        ThePirateBay: 'Video',
        TorrentProject: 'Video',
      },
    },
    globalDownloadLimitBps: -1,
    globalUploadLimitBps: -1,
    defaultMaxRatio: null,
    defaultMaxUploadBytes: null,
    onReachLimit: 'pause_seed',
  };
}

function mergeWithDefaults(raw: Record<string, unknown>): AppConfig {
  const base = defaultConfig();
  const rt = raw.torrents as Record<string, unknown> | undefined;
  const rp = rt?.providers as Record<string, unknown> | undefined;
  const merged: Record<string, unknown> = {
    ...base,
    ...raw,
    torrents: {
      ...base.torrents,
      ...(rt ?? {}),
      providers: {
        ...base.torrents.providers,
        ...(rp ?? {}),
      },
      categoryByProvider: {
        ...base.torrents.categoryByProvider,
        ...(rt?.categoryByProvider as Record<string, string> | undefined),
      },
    },
  };
  delete merged.jackett;
  return AppConfigSchema.parse(merged);
}

export function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    return mergeWithDefaults(raw);
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function ensureConfigExists(): AppConfig {
  if (!fs.existsSync(configPath)) {
    const d = defaultConfig();
    saveConfig(d);
    return d;
  }
  return loadConfig();
}

export function loadTorrentOverrides(): TorrentOverridesFile {
  try {
    const raw = fs.readFileSync(torrentOverridesPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return TorrentOverridesFileSchema.parse(parsed);
  } catch {
    return { byInfoHash: {} };
  }
}

export function saveTorrentOverrides(data: TorrentOverridesFile): void {
  fs.mkdirSync(path.dirname(torrentOverridesPath), { recursive: true });
  fs.writeFileSync(torrentOverridesPath, JSON.stringify(data, null, 2), 'utf8');
}

export function getMergedTorrentPolicy(
  infoHash: string,
  config: AppConfig,
  overrides: TorrentOverridesFile
): { maxRatio: number | null; maxUploadBytes: number | null } {
  const o = overrides.byInfoHash[infoHash.toLowerCase()];
  const maxRatio =
    o && Object.prototype.hasOwnProperty.call(o, 'maxRatio')
      ? o.maxRatio ?? null
      : (config.defaultMaxRatio ?? null);
  const maxUploadBytes =
    o && Object.prototype.hasOwnProperty.call(o, 'maxUploadBytes')
      ? o.maxUploadBytes ?? null
      : (config.defaultMaxUploadBytes ?? null);
  return { maxRatio, maxUploadBytes };
}

export function setTorrentOverride(
  infoHash: string,
  patch: Partial<TorrentOverride>,
  overrides: TorrentOverridesFile
): TorrentOverridesFile {
  const key = infoHash.toLowerCase();
  const next = { ...overrides.byInfoHash[key], ...patch };
  const cleaned: TorrentOverride = {};
  if (next.maxRatio !== undefined) cleaned.maxRatio = next.maxRatio;
  if (next.maxUploadBytes !== undefined) cleaned.maxUploadBytes = next.maxUploadBytes;
  return {
    byInfoHash: {
      ...overrides.byInfoHash,
      [key]: cleaned,
    },
  };
}
