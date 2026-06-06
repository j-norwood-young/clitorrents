import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';
import type { AppConfig, TorrentOverridesFile } from '../config.js';
import {
  getMergedTorrentPolicy,
  loadTorrentOverrides,
  resolveBaseDir,
  saveConfig,
  saveTorrentOverrides,
  setTorrentOverride,
} from '../config.js';
import { planDownloadLocation } from '../media/classify.js';
import { ConnectivityMonitor } from '../net/connectivity.js';

const HISTORY_LEN = 48;
const TICK_MS_ONLINE = 400;
const TICK_MS_OFFLINE = 5000;

export type PeerRow = {
  key: string;
  remoteAddress: string;
  remotePort: number;
  downSpeed: number;
  upSpeed: number;
  downloaded: number;
  uploaded: number;
};

export type TorrentSnapshot = {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  timeRemaining: number;
  downloaded: number;
  uploaded: number;
  length: number;
  ratio: number;
  downloadPath: string;
  done: boolean;
  paused: boolean;
  dlPaused: boolean;
  history: readonly number[];
  maxRatio: number | null;
  maxUploadBytes: number | null;
  mediaCategory?: string;
};

export type AddTorrentOptions = {
  /** Used for category routing at add time; destination is fixed once added. */
  name?: string;
  /** Override base/category resolution for this add only */
  downloadDir?: string;
};

type WireLike = {
  peerId?: string;
  remoteAddress?: string;
  remotePort?: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: () => number;
  uploadSpeed: () => number;
};

type TorrentMeta = {
  dlPaused: boolean;
  history: number[];
  limitNotified: boolean;
  mediaCategory?: string;
  pausedByOffline?: boolean;
};

export class TorrentEngine extends EventEmitter {
  private client: InstanceType<typeof WebTorrent>;
  private config: AppConfig;
  private overrides: TorrentOverridesFile;
  private baseDownloadDir: string;
  private meta = new Map<string, TorrentMeta>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private tickMs = TICK_MS_ONLINE;
  private connectivity: ConnectivityMonitor;
  private networkOnline = true;

  constructor(config: AppConfig, opts?: { connectivity?: ConnectivityMonitor }) {
    super();
    this.config = config;
    this.overrides = loadTorrentOverrides();
    this.baseDownloadDir = resolveBaseDir(config);
    fs.mkdirSync(this.baseDownloadDir, { recursive: true });
    this.client = new WebTorrent({
      downloadLimit: normLimit(config.globalDownloadLimitBps),
      uploadLimit: normLimit(config.globalUploadLimitBps),
    });
    this.applyGlobalThrottle();
    this.connectivity = opts?.connectivity ?? new ConnectivityMonitor();
    this.connectivity.on('offline', () => this.handleOffline());
    this.connectivity.on('online', () => this.handleOnline());
    this.connectivity.start();
    this.startTick();
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getBaseDownloadDir(): string {
    return this.baseDownloadDir;
  }

  isNetworkOnline(): boolean {
    return this.networkOnline;
  }

  getClientDownloadSpeed(): number {
    return this.client.downloadSpeed;
  }

  getClientUploadSpeed(): number {
    return this.client.uploadSpeed;
  }

  /** Applies to new torrents only; in-flight destinations are unchanged. */
  setBaseDownloadDir(dir: string): void {
    this.baseDownloadDir = pathResolve(dir);
    fs.mkdirSync(this.baseDownloadDir, { recursive: true });
    this.emit('update');
  }

  setConfig(config: AppConfig, opts?: { persist?: boolean }): void {
    this.config = config;
    this.baseDownloadDir = resolveBaseDir(config);
    fs.mkdirSync(this.baseDownloadDir, { recursive: true });
    this.applyGlobalThrottle();
    if (opts?.persist) saveConfig(config);
    this.emit('update');
  }

  setGlobalLimits(downloadBps: number, uploadBps: number, persist = false): void {
    this.config = {
      ...this.config,
      globalDownloadLimitBps: downloadBps,
      globalUploadLimitBps: uploadBps,
    };
    this.applyGlobalThrottle();
    if (persist) saveConfig(this.config);
    this.emit('update');
  }

  setDefaultMaxRatio(ratio: number | null, persist = false): void {
    this.config = { ...this.config, defaultMaxRatio: ratio };
    if (persist) saveConfig(this.config);
    this.emit('update');
  }

  reloadOverrides(): void {
    this.overrides = loadTorrentOverrides();
  }

  private applyGlobalThrottle(): void {
    const d = this.config.globalDownloadLimitBps;
    const u = this.config.globalUploadLimitBps;
    this.client.throttleDownload(d < 0 ? -1 : d);
    this.client.throttleUpload(u < 0 ? -1 : u);
  }

  private handleOffline(): void {
    this.networkOnline = false;
    this.setTickInterval(TICK_MS_OFFLINE);
    for (const t of this.client.torrents) {
      const m = this.meta.get(t.infoHash);
      if (!m || m.dlPaused || t.done) continue;
      this.pauseDownload(t.infoHash, { byOffline: true });
    }
    this.emit('network', 'offline');
    this.emit('update');
  }

  private handleOnline(): void {
    this.networkOnline = true;
    this.setTickInterval(TICK_MS_ONLINE);
    for (const t of this.client.torrents) {
      const m = this.meta.get(t.infoHash);
      if (m?.pausedByOffline && m.dlPaused) {
        this.resumeDownload(t.infoHash);
        m.pausedByOffline = false;
      }
    }
    this.emit('network', 'online');
    this.emit('update');
  }

  private setTickInterval(ms: number): void {
    this.tickMs = ms;
    this.stopTick();
    this.startTick();
  }

  private startTick(): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => this.emitSnapshot(), this.tickMs);
  }

  stopTick(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private emitSnapshot(): void {
    for (const t of this.client.torrents) {
      this.updateHistory(t);
      this.enforceLimits(t);
    }
    this.emit('update');
  }

  private updateHistory(t: Torrent): void {
    const ih = t.infoHash;
    let m = this.meta.get(ih);
    if (!m) {
      m = { dlPaused: false, history: [], limitNotified: false };
      this.meta.set(ih, m);
    }
    const spd = t.downloadSpeed;
    m.history.push(spd);
    if (m.history.length > HISTORY_LEN) m.history.shift();
  }

  private enforceLimits(t: Torrent): void {
    const ih = t.infoHash;
    const m = this.meta.get(ih);
    if (!m || m.limitNotified || !t.ready) return;
    const policy = getMergedTorrentPolicy(ih, this.config, this.overrides);
    const hitRatio = policy.maxRatio != null && t.ratio >= policy.maxRatio;
    const hitUp =
      policy.maxUploadBytes != null && t.uploaded >= policy.maxUploadBytes;
    if (!hitRatio && !hitUp) return;
    m.limitNotified = true;
    void this.applyLimitAction(t);
  }

  private async applyLimitAction(t: Torrent): Promise<void> {
    if (this.config.onReachLimit === 'remove_keep_files') {
      this.meta.delete(t.infoHash);
      await this.client.remove(t, { destroyStore: false });
    } else {
      const n = t.pieces.length;
      if (n > 0) t.deselect(0, n - 1);
      t.pause();
      const m = this.meta.get(t.infoHash);
      if (m) m.dlPaused = true;
    }
    this.emit('update');
  }

  getSnapshots(): TorrentSnapshot[] {
    return this.client.torrents.map((t) => this.snapshot(t));
  }

  private snapshot(t: Torrent): TorrentSnapshot {
    const ih = t.infoHash;
    const m = this.meta.get(ih);
    const policy = getMergedTorrentPolicy(ih, this.config, this.overrides);
    return {
      infoHash: ih,
      name: t.name,
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      numPeers: t.numPeers,
      timeRemaining: t.timeRemaining,
      downloaded: t.downloaded,
      uploaded: t.uploaded,
      length: t.length,
      ratio: t.ratio,
      downloadPath: t.path,
      done: t.done,
      paused: t.paused,
      dlPaused: m?.dlPaused ?? false,
      history: Object.freeze([...(m?.history ?? [])]) as readonly number[],
      maxRatio: policy.maxRatio,
      maxUploadBytes: policy.maxUploadBytes,
      mediaCategory: m?.mediaCategory,
    };
  }

  getPeers(infoHash: string): PeerRow[] {
    const t = this.client.torrents.find((x) => x.infoHash === infoHash);
    if (!t) return [];
    const wires = (t as unknown as { wires: WireLike[] }).wires ?? [];
    return wires.map((w, i) => ({
      key: `${w.remoteAddress ?? 'peer'}:${w.remotePort ?? i}`,
      remoteAddress: w.remoteAddress ?? '?',
      remotePort: w.remotePort ?? 0,
      downSpeed: typeof w.downloadSpeed === 'function' ? w.downloadSpeed() : 0,
      upSpeed: typeof w.uploadSpeed === 'function' ? w.uploadSpeed() : 0,
      downloaded: w.downloaded,
      uploaded: w.uploaded,
    }));
  }

  findTorrent(infoHash: string): Torrent | undefined {
    return this.client.torrents.find((x) => x.infoHash === infoHash);
  }

  async add(torrentId: string | Uint8Array, options: AddTorrentOptions = {}): Promise<void> {
    const name = options.name ?? '';
    const plan = name
      ? planDownloadLocation(name, this.config, this.baseDownloadDir)
      : { category: 'unknown' as const, dir: this.baseDownloadDir };
    const dir = options.downloadDir ?? plan.dir;
    fs.mkdirSync(dir, { recursive: true });

    const mediaCategory = name ? plan.category : undefined;

    const tor = this.client.add(torrentId as unknown, { path: dir });

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeResolve = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      tor.once('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      tor.once('ready', () => {
        const ih = tor.infoHash;
        this.meta.set(ih, {
          dlPaused: false,
          history: [],
          limitNotified: false,
          mediaCategory,
        });
        this.emitSnapshot();
      });

      setImmediate(safeResolve);
    });
  }

  pauseDownload(infoHash: string, opts?: { byOffline?: boolean }): void {
    const t = this.findTorrent(infoHash);
    if (!t?.ready) return;
    const n = t.pieces.length;
    if (n > 0) t.deselect(0, n - 1);
    t.pause();
    const m = this.meta.get(infoHash) ?? {
      dlPaused: false,
      history: [],
      limitNotified: false,
    };
    m.dlPaused = true;
    if (opts?.byOffline) m.pausedByOffline = true;
    this.meta.set(infoHash, m);
    this.emit('update');
  }

  resumeDownload(infoHash: string): void {
    const t = this.findTorrent(infoHash);
    if (!t?.ready) return;
    if (!this.networkOnline) return;
    const n = t.pieces.length;
    if (n > 0) t.select(0, n - 1, 0);
    t.resume();
    const m = this.meta.get(infoHash);
    if (m) {
      m.dlPaused = false;
      m.pausedByOffline = false;
    }
    this.emit('update');
  }

  async removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void> {
    const t = this.findTorrent(infoHash);
    if (!t) return;
    this.meta.delete(infoHash);
    await this.client.remove(t, { destroyStore: destroyFiles });
    this.emit('update');
  }

  updateTorrentPolicy(
    infoHash: string,
    patch: { maxRatio?: number | null; maxUploadBytes?: number | null }
  ): void {
    this.overrides = setTorrentOverride(infoHash, patch, this.overrides);
    saveTorrentOverrides(this.overrides);
    const m = this.meta.get(infoHash);
    if (m) m.limitNotified = false;
    this.emit('update');
  }

  async destroy(): Promise<void> {
    this.connectivity.stop();
    this.stopTick();
    await this.client.destroy();
  }
}

function normLimit(bps: number): number {
  return bps < 0 ? -1 : bps;
}

function pathResolve(dir: string): string {
  const expanded = dir.startsWith('~')
    ? path.join(os.homedir(), dir.slice(1))
    : dir;
  return path.resolve(expanded);
}
