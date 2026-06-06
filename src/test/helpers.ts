import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { TorrentSnapshot } from '../engine/torrent-engine.js';
import type { AppConfig } from '../config.js';

/** Temp XDG config dir for isolated config tests */
export async function withTempConfigDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clitorrents-test-'));
  const prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  try {
    return await fn(dir);
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Minimal fake engine for CLI/MCP handler tests */
export class FakeEngine extends EventEmitter {
  snapshots: TorrentSnapshot[] = [];
  config: AppConfig;
  baseDir: string;
  globalLimits = { download: -1, upload: -1 };
  defaultRatio: number | null = null;
  paused = new Set<string>();
  removed: { infoHash: string; destroyFiles: boolean }[] = [];
  added: { name?: string; dir?: string }[] = [];

  constructor(config: AppConfig, baseDir = process.cwd()) {
    super();
    this.config = config;
    this.baseDir = baseDir;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getBaseDownloadDir(): string {
    return this.baseDir;
  }

  isNetworkOnline(): boolean {
    return true;
  }

  getClientDownloadSpeed(): number {
    return 0;
  }

  getClientUploadSpeed(): number {
    return 0;
  }

  getSnapshots(): TorrentSnapshot[] {
    return this.snapshots;
  }

  setConfig(config: AppConfig): void {
    this.config = config;
  }

  setGlobalLimits(downloadBps: number, uploadBps: number): void {
    this.globalLimits = { download: downloadBps, upload: uploadBps };
  }

  setDefaultMaxRatio(ratio: number | null): void {
    this.defaultRatio = ratio;
  }

  async add(_id: string | Uint8Array, opts?: { name?: string; downloadDir?: string }): Promise<void> {
    this.added.push({ name: opts?.name, dir: opts?.downloadDir });
    const snap: TorrentSnapshot = {
      infoHash: 'abc',
      name: opts?.name ?? 'test',
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      timeRemaining: 0,
      downloaded: 0,
      uploaded: 0,
      length: 1000,
      ratio: 0,
      downloadPath: opts?.downloadDir ?? this.baseDir,
      done: false,
      paused: false,
      dlPaused: false,
      history: [],
      maxRatio: null,
      maxUploadBytes: null,
    };
    this.snapshots.push(snap);
    this.emit('update');
  }

  pauseDownload(infoHash: string): void {
    this.paused.add(infoHash);
  }

  resumeDownload(infoHash: string): void {
    this.paused.delete(infoHash);
  }

  async removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void> {
    this.removed.push({ infoHash, destroyFiles });
    this.snapshots = this.snapshots.filter((s) => s.infoHash !== infoHash);
  }

  updateTorrentPolicy(): void {}

  async destroy(): Promise<void> {}
}
