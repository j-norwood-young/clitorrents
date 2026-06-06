import EventEmitter from 'node:events';
import type { AppConfig } from '../config.js';
import type { EngineLike } from './engine-like.js';
import type {
  AddTorrentOptions,
  PeerRow,
  SessionRestoreResult,
  ShutdownProgress,
  TorrentSnapshot,
} from './torrent-engine.js';
import { parseSseBlock } from '../daemon/sse.js';
import type { DaemonState } from '../daemon/http-server.js';

async function postJson(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export class EngineClient extends EventEmitter implements EngineLike {
  private baseUrl: string;
  private state: DaemonState;
  private sseAbort: AbortController | null = null;
  private connected = false;

  constructor(baseUrl: string, initialState: DaemonState) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.state = initialState;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.sseAbort = new AbortController();
    void this.readEvents(this.sseAbort.signal);
  }

  close(): void {
    this.sseAbort?.abort();
    this.sseAbort = null;
    this.connected = false;
  }

  async destroy(): Promise<void> {
    this.close();
  }

  private applyState(state: DaemonState): void {
    this.state = state;
    this.emit('update');
  }

  private async readEvents(signal: AbortSignal): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/events`, { signal });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const parsed = parseSseBlock(block);
          if (parsed) this.handleSse(parsed.event, parsed.data);
          split = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        this.emit('error', err);
      }
    }
  }

  private handleSse(event: string, data: unknown): void {
    if (event === 'state') {
      this.applyState(data as DaemonState);
      return;
    }
    if (event === 'network') {
      const state = (data as { state?: 'online' | 'offline' }).state;
      if (state) this.emit('network', state);
      return;
    }
    if (event === 'session-restored') {
      this.emit('session-restored', data as SessionRestoreResult);
    }
  }

  getConfig(): AppConfig {
    return this.state.config;
  }

  getBaseDownloadDir(): string {
    return this.state.baseDownloadDir;
  }

  isNetworkOnline(): boolean {
    return this.state.networkOnline;
  }

  getClientDownloadSpeed(): number {
    return this.state.downloadSpeed;
  }

  getClientUploadSpeed(): number {
    return this.state.uploadSpeed;
  }

  getSnapshots(): TorrentSnapshot[] {
    return this.state.snapshots;
  }

  private peersByHash = new Map<string, PeerRow[]>();
  private peersInflight = new Set<string>();

  getPeers(infoHash: string): PeerRow[] {
    const key = infoHash.toLowerCase();
    void this.refreshPeers(key);
    return this.peersByHash.get(key) ?? [];
  }

  private async refreshPeers(infoHash: string): Promise<void> {
    const key = infoHash.toLowerCase();
    if (this.peersInflight.has(key)) return;
    this.peersInflight.add(key);
    try {
      const res = await fetch(`${this.baseUrl}/api/peers/${encodeURIComponent(key)}`);
      if (!res.ok) return;
      const peers = (await res.json()) as PeerRow[];
      this.peersByHash.set(key, peers);
      this.emit('update');
    } finally {
      this.peersInflight.delete(key);
    }
  }

  hasActiveTorrent(infoHash: string): boolean {
    const key = infoHash.toLowerCase();
    return this.state.snapshots.some((s) => s.infoHash === key);
  }

  setBaseDownloadDir(dir: string): void {
    void postJson(this.baseUrl, '/api/base-download-dir', { dir });
  }

  setConfig(config: AppConfig, opts?: { persist?: boolean }): void {
    void postJson(this.baseUrl, '/api/config', { config, persist: opts?.persist });
  }

  setGlobalLimits(downloadBps: number, uploadBps: number, persist = false): void {
    void postJson(this.baseUrl, '/api/limits', { downloadBps, uploadBps, persist });
  }

  setDefaultMaxRatio(ratio: number | null, persist = false): void {
    void postJson(this.baseUrl, '/api/default-max-ratio', { ratio, persist });
  }

  async restoreSession(): Promise<SessionRestoreResult> {
    const res = await postJson(this.baseUrl, '/api/restore-session', {});
    return (await res.json()) as SessionRestoreResult;
  }

  async add(torrentId: string | Uint8Array, options: AddTorrentOptions = {}): Promise<void> {
    const body =
      torrentId instanceof Uint8Array
        ? { torrentIdBase64: Buffer.from(torrentId).toString('base64'), options }
        : { torrentId, options };
    const res = await postJson(this.baseUrl, '/api/add', body);
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? `Add failed (${res.status})`);
    }
  }

  pauseDownload(infoHash: string, _opts?: { byOffline?: boolean }): void {
    void postJson(this.baseUrl, '/api/pause', { infoHash });
  }

  resumeDownload(infoHash: string): void {
    void postJson(this.baseUrl, '/api/resume', { infoHash });
  }

  async removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void> {
    await postJson(this.baseUrl, '/api/remove', { infoHash, destroyFiles });
  }

  updateTorrentPolicy(
    infoHash: string,
    patch: { maxRatio?: number | null; maxUploadBytes?: number | null }
  ): void {
    void postJson(this.baseUrl, '/api/torrent-policy', { infoHash, patch });
  }

  async shutdown(onProgress?: (progress: ShutdownProgress) => void): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/shutdown`, { method: 'POST' });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const parsed = parseSseBlock(block);
        if (parsed?.event === 'shutdown-progress') {
          onProgress?.(parsed.data as ShutdownProgress);
        }
        split = buffer.indexOf('\n\n');
      }
    }
    this.close();
  }
}
