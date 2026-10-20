import type EventEmitter from 'node:events';
import type { AppConfig } from '../config.js';
import type {
  AddTorrentOptions,
  PeerRow,
  SessionRestoreResult,
  ShutdownProgress,
  TorrentSnapshot,
} from './torrent-engine.js';

/** Shared surface for local TorrentEngine and remote EngineClient. */
export interface EngineLike extends EventEmitter {
  getConfig(): AppConfig;
  getBaseDownloadDir(): string;
  isNetworkOnline(): boolean;
  /** Remote clients only: false while the daemon is unreachable. Emits 'daemon' on change. */
  isDaemonConnected?(): boolean;
  getClientDownloadSpeed(): number;
  getClientUploadSpeed(): number;
  setBaseDownloadDir(dir: string): void;
  setConfig(config: AppConfig, opts?: { persist?: boolean }): void;
  setGlobalLimits(downloadBps: number, uploadBps: number, persist?: boolean): void;
  setDefaultMaxRatio(ratio: number | null, persist?: boolean): void;
  restoreSession(): Promise<SessionRestoreResult>;
  getSnapshots(): TorrentSnapshot[];
  getPeers(infoHash: string): PeerRow[];
  hasActiveTorrent(infoHash: string): boolean;
  add(torrentId: string | Uint8Array, options?: AddTorrentOptions): Promise<void>;
  /** Resolves once the pause/resume is reflected in getSnapshots(). */
  pauseDownload(infoHash: string, opts?: { byOffline?: boolean }): void | Promise<void>;
  resumeDownload(infoHash: string): void | Promise<void>;
  removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void>;
  updateTorrentPolicy(
    infoHash: string,
    patch: { maxRatio?: number | null; maxUploadBytes?: number | null }
  ): void;
  shutdown(onProgress?: (progress: ShutdownProgress) => void): Promise<void>;
  destroy(): Promise<void>;
}
