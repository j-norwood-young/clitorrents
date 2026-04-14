import EventEmitter from 'node:events';
import fs from 'node:fs';
import WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';
import type { AppConfig, TorrentOverridesFile } from '../config.js';
import {
  getMergedTorrentPolicy,
  loadTorrentOverrides,
  saveTorrentOverrides,
  setTorrentOverride,
} from '../config.js';

const HISTORY_LEN = 48;

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

export class TorrentEngine extends EventEmitter {
  private client: InstanceType<typeof WebTorrent>;
  private config: AppConfig;
  private overrides: TorrentOverridesFile;
  private meta = new Map<
    string,
    { dlPaused: boolean; history: number[]; limitNotified: boolean }
  >();
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.overrides = loadTorrentOverrides();
    fs.mkdirSync(config.downloadDir, { recursive: true });
    this.client = new WebTorrent({
      downloadLimit: normLimit(config.globalDownloadLimitBps),
      uploadLimit: normLimit(config.globalUploadLimitBps),
    });
    this.applyGlobalThrottle();
    this.startTick();
  }

  getClientDownloadSpeed(): number {
    return this.client.downloadSpeed;
  }

  getClientUploadSpeed(): number {
    return this.client.uploadSpeed;
  }

  setConfig(config: AppConfig): void {
    this.config = config;
    fs.mkdirSync(config.downloadDir, { recursive: true });
    this.applyGlobalThrottle();
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

  private startTick(): void {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => this.emitSnapshot(), 400);
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

  async add(torrentId: string | Uint8Array): Promise<void> {
    const tor = this.client.add(torrentId as unknown, {
      path: this.config.downloadDir,
    });

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
        this.meta.set(ih, { dlPaused: false, history: [], limitNotified: false });
        // Do not subscribe to `download` / `upload` — WebTorrent fires them very often (often per
        // piece) and calling into React each time starves stdin so Ink stops receiving keys. The
        // 400ms tick + this one snapshot after metadata are enough for the UI.
        this.emitSnapshot();
      });

      setImmediate(safeResolve);
    });
  }

  pauseDownload(infoHash: string): void {
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
    this.meta.set(infoHash, m);
    this.emit('update');
  }

  resumeDownload(infoHash: string): void {
    const t = this.findTorrent(infoHash);
    if (!t?.ready) return;
    const n = t.pieces.length;
    if (n > 0) t.select(0, n - 1, 0);
    t.resume();
    const m = this.meta.get(infoHash);
    if (m) m.dlPaused = false;
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
    this.stopTick();
    await this.client.destroy();
  }
}

function normLimit(bps: number): number {
  return bps < 0 ? -1 : bps;
}
