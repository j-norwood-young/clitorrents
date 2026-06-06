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
  pauseDownload(infoHash: string, opts?: { byOffline?: boolean }): void;
  resumeDownload(infoHash: string): void;
  removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void>;
  updateTorrentPolicy(
    infoHash: string,
    patch: { maxRatio?: number | null; maxUploadBytes?: number | null }
  ): void;
  shutdown(onProgress?: (progress: ShutdownProgress) => void): Promise<void>;
  destroy(): Promise<void>;
}
