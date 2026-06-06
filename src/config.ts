import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

function getConfigDir(): string {
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    'clitorrents'
  );
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function getTorrentOverridesPath(): string {
  return path.join(getConfigDir(), 'torrent-overrides.json');
}

export function getSessionPath(): string {
  return path.join(getConfigDir(), 'session.json');
}

/** @deprecated use getConfigPath() */
export const configPath = getConfigPath();
/** @deprecated use getTorrentOverridesPath() */
export const torrentOverridesPath = getTorrentOverridesPath();

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

export const CategoriesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  tv: z.string().optional(),
  movies: z.string().optional(),
  music: z.string().optional(),
  /** Optional folder for names that do not match TV/movie/music heuristics */
  unknown: z.string().optional(),
});

export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>;

export const AppConfigSchema = z.object({
  /** When null/omitted, downloads use process.cwd() unless overridden in-app */
  downloadDir: z.string().nullable().optional(),
  categories: CategoriesConfigSchema.optional(),
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

export const SessionTorrentSchema = z.object({
  infoHash: z.string().min(1),
  magnet: z.string().min(1),
  downloadPath: z.string().min(1),
  name: z.string().optional(),
  mediaCategory: z.string().optional(),
  dlPaused: z.boolean().default(false),
});

export type SessionTorrent = z.infer<typeof SessionTorrentSchema>;

export const SessionFileSchema = z.object({
  torrents: z.array(SessionTorrentSchema).default([]),
});

export type SessionFile = z.infer<typeof SessionFileSchema>;

function defaultConfig(): AppConfig {
  return {
    downloadDir: null,
    categories: { enabled: false },
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
  const rc = raw.categories as Record<string, unknown> | undefined;
  const merged: Record<string, unknown> = {
    ...base,
    ...raw,
    categories: {
      ...base.categories,
      ...(rc ?? {}),
    },
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

/** Base download dir: explicit config override, else cwd. */
export function resolveBaseDir(config: AppConfig, cwd = process.cwd()): string {
  if (config.downloadDir) return path.resolve(config.downloadDir);
  return path.resolve(cwd);
}

export function loadConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as Record<string, unknown>;
    return mergeWithDefaults(raw);
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AppConfig): void {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
}

export function ensureConfigExists(): AppConfig {
  if (!fs.existsSync(getConfigPath())) {
    const d = defaultConfig();
    saveConfig(d);
    return d;
  }
  return loadConfig();
}

export function loadTorrentOverrides(): TorrentOverridesFile {
  try {
    const raw = fs.readFileSync(getTorrentOverridesPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return TorrentOverridesFileSchema.parse(parsed);
  } catch {
    return { byInfoHash: {} };
  }
}

export function saveTorrentOverrides(data: TorrentOverridesFile): void {
  const p = getTorrentOverridesPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

export function getSessionMtimeMs(): number | null {
  try {
    return fs.statSync(getSessionPath()).mtimeMs;
  } catch {
    return null;
  }
}

export function loadSession(): SessionFile {
  try {
    const raw = JSON.parse(fs.readFileSync(getSessionPath(), 'utf8')) as unknown;
    const parsed = SessionFileSchema.parse(raw);
    const byHash = new Map<string, SessionTorrent>();
    for (const entry of parsed.torrents) {
      const key = entry.infoHash.toLowerCase();
      byHash.set(key, { ...entry, infoHash: key });
    }
    return { torrents: [...byHash.values()] };
  } catch {
    return { torrents: [] };
  }
}

export function saveSession(data: SessionFile): void {
  const p = getSessionPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const normalized = SessionFileSchema.parse(data);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmp, p);
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

export function updateGlobalLimits(
  config: AppConfig,
  patch: { globalDownloadLimitBps?: number; globalUploadLimitBps?: number }
): AppConfig {
  return {
    ...config,
    globalDownloadLimitBps: patch.globalDownloadLimitBps ?? config.globalDownloadLimitBps,
    globalUploadLimitBps: patch.globalUploadLimitBps ?? config.globalUploadLimitBps,
  };
}

export function updateDefaultRatio(config: AppConfig, ratio: number | null): AppConfig {
  return { ...config, defaultMaxRatio: ratio };
}
