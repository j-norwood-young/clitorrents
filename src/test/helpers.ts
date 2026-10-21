import fs from 'node:fs';
import { spawn } from 'node:child_process';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import type {
  AddTorrentOptions,
  PeerRow,
  SessionRestoreResult,
  ShutdownProgress,
  TorrentSnapshot,
} from '../engine/torrent-engine.js';
import type { EngineLike } from '../engine/engine-like.js';
import { defaultConfig, type AppConfig } from '../config.js';
import { ConnectivityMonitor } from '../net/connectivity.js';

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

/** Fresh temp directory, removed by the returned cleanup. */
export function makeTempDir(prefix = 'clitorrents-test-'): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function makeConfig(patch: Partial<AppConfig> = {}): AppConfig {
  return { ...defaultConfig(), ...patch };
}

export function makeSnapshot(patch: Partial<TorrentSnapshot> = {}): TorrentSnapshot {
  return {
    infoHash: 'a'.repeat(40),
    name: 'test',
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    numPeers: 0,
    timeRemaining: 0,
    downloaded: 0,
    uploaded: 0,
    length: 1000,
    ratio: 0,
    downloadPath: '/tmp',
    done: false,
    paused: false,
    dlPaused: false,
    history: [],
    maxRatio: null,
    maxUploadBytes: null,
    ...patch,
  };
}

/** Poll until `predicate` is truthy or time out. */
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  { timeoutMs = 10_000, intervalMs = 20, message = 'condition' } = {}
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await predicate();
    if (v) return v as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture console.log/error while `fn` runs. `stream` collects anything written to it
 * (pass it where code would write to process.stdout). Never patch process.stdout itself:
 * the node:test runner reports through it.
 */
export async function captureOutput<T>(
  fn: (stream: { write: (chunk: string | Uint8Array) => boolean }) => T | Promise<T>
): Promise<{ result: T; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    stdout += `${args.map(String).join(' ')}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.map(String).join(' ')}\n`;
  };
  const stream = {
    write: (chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    },
  };
  try {
    const result = await fn(stream);
    return { result, stdout, stderr };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

/** Connectivity monitor whose state is set by the test (no DNS lookups, no timers). */
export function fakeConnectivity(initial = true): ConnectivityMonitor & { setOnline(v: boolean): Promise<void> } {
  let online = initial;
  const monitor = new ConnectivityMonitor({
    probe: async () => online,
    onlineIntervalMs: 3_600_000,
    offlineIntervalMs: 3_600_000,
  }) as ConnectivityMonitor & { setOnline(v: boolean): Promise<void> };
  monitor.setOnline = async (v: boolean) => {
    online = v;
    await monitor.checkNow();
  };
  return monitor;
}

export type StubRoute = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** Minimal HTTP server on 127.0.0.1:<random> for client tests. Routes keyed by "METHOD /path". */
export async function startStubServer(
  routes: Record<string, StubRoute>
): Promise<{ url: string; port: number; server: Server; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return route(req, res);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  const port = await listenOnFreePort(server);
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    close: () => closeServer(server),
  };
}

export function listenOnFreePort(server: Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/** Fake engine implementing EngineLike; records calls for assertions. */
export class FakeEngine extends EventEmitter implements EngineLike {
  snapshots: TorrentSnapshot[] = [];
  config: AppConfig;
  baseDir: string;
  online = true;
  downloadDirProblems: string[] = [];
  globalLimits = { download: -1, upload: -1 };
  defaultRatio: number | null = null;
  paused = new Set<string>();
  removed: { infoHash: string; destroyFiles: boolean }[] = [];
  added: { torrentId: string | Uint8Array; name?: string; dir?: string; options?: AddTorrentOptions }[] = [];
  policies: { infoHash: string; patch: { maxRatio?: number | null; maxUploadBytes?: number | null } }[] = [];
  peers: Record<string, PeerRow[]> = {};
  destroyed = false;
  /** When set, add() rejects with this error. */
  addError: Error | null = null;
  /** When set, the next add() completes the torrent immediately (progress 1, done). */
  completeOnAdd = false;

  constructor(config: AppConfig = defaultConfig(), baseDir = process.cwd()) {
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

  getDownloadDirProblems(): string[] {
    return this.downloadDirProblems;
  }

  setBaseDownloadDir(dir: string): void {
    this.baseDir = dir;
    this.emit('update');
  }

  isNetworkOnline(): boolean {
    return this.online;
  }

  isDaemonConnected?(): boolean;

  getClientDownloadSpeed(): number {
    return 0;
  }

  getClientUploadSpeed(): number {
    return 0;
  }

  getSnapshots(): TorrentSnapshot[] {
    return this.snapshots;
  }

  getPeers(infoHash: string): PeerRow[] {
    return this.peers[infoHash] ?? [];
  }

  hasActiveTorrent(infoHash: string): boolean {
    return this.snapshots.some((s) => s.infoHash === infoHash.toLowerCase());
  }

  setConfig(config: AppConfig): void {
    this.config = config;
    this.emit('update');
  }

  setGlobalLimits(downloadBps: number, uploadBps: number): void {
    this.globalLimits = { download: downloadBps, upload: uploadBps };
    this.config = { ...this.config, globalDownloadLimitBps: downloadBps, globalUploadLimitBps: uploadBps };
  }

  setDefaultMaxRatio(ratio: number | null): void {
    this.defaultRatio = ratio;
    this.config = { ...this.config, defaultMaxRatio: ratio };
  }

  async add(torrentId: string | Uint8Array, opts?: AddTorrentOptions): Promise<void> {
    if (this.addError) throw this.addError;
    this.added.push({ torrentId, name: opts?.name, dir: opts?.downloadDir, options: opts });
    const hashMatch = typeof torrentId === 'string' ? /btih:([a-f0-9]{40})/i.exec(torrentId) : null;
    const done = this.completeOnAdd;
    const snap = makeSnapshot({
      infoHash: hashMatch?.[1]?.toLowerCase() ?? `${this.snapshots.length}`.padStart(40, '0'),
      name: opts?.name ?? 'test',
      progress: done ? 1 : 0,
      downloaded: done ? 1000 : 0,
      downloadPath: opts?.downloadDir ?? this.baseDir,
      done,
    });
    this.snapshots.push(snap);
    this.emit('update');
  }

  async pauseDownload(infoHash: string): Promise<void> {
    this.paused.add(infoHash);
    this.snapshots = this.snapshots.map((s) => (s.infoHash === infoHash ? { ...s, dlPaused: true } : s));
    this.emit('update');
  }

  async resumeDownload(infoHash: string): Promise<void> {
    this.paused.delete(infoHash);
    this.snapshots = this.snapshots.map((s) => (s.infoHash === infoHash ? { ...s, dlPaused: false } : s));
    this.emit('update');
  }

  async removeTorrent(infoHash: string, destroyFiles: boolean): Promise<void> {
    this.removed.push({ infoHash, destroyFiles });
    this.snapshots = this.snapshots.filter((s) => s.infoHash !== infoHash);
    this.emit('update');
  }

  updateTorrentPolicy(
    infoHash: string,
    patch: { maxRatio?: number | null; maxUploadBytes?: number | null }
  ): void {
    this.policies.push({ infoHash, patch });
  }

  async shutdown(onProgress?: (progress: ShutdownProgress) => void): Promise<void> {
    onProgress?.({ message: 'Stopping…', phase: 'torrent' });
    onProgress?.({ message: 'Done', phase: 'done' });
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  async restoreSession(): Promise<SessionRestoreResult> {
    return { restored: 0, failed: 0 };
  }
}

/** Read SSE events from a streaming response until `until` returns true (or the stream ends). */
export async function readSse(
  res: Response,
  until: (events: { event: string; data: unknown }[]) => boolean = () => false,
  timeoutMs = 10_000
): Promise<{ event: string; data: unknown }[]> {
  const { parseSseBlock } = await import('../daemon/sse.js');
  const events: { event: string; data: unknown }[] = [];
  if (!res.body) return events;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const timer = setTimeout(() => void reader.cancel(), timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        const parsed = parseSseBlock(buffer.slice(0, split));
        buffer = buffer.slice(split + 2);
        if (parsed) events.push(parsed);
        split = buffer.indexOf('\n\n');
      }
      if (until(events)) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return events;
}

/** Long-lived child process (stand-in for a daemon pid). Kill it with the returned function. */
export function spawnSleeper(opts: { ignoreSigterm?: boolean } = {}): { pid: number; kill: () => void; exited: Promise<void> } {
  const script = opts.ignoreSigterm
    ? "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"
    : 'setInterval(()=>{},1000)';
  const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return {
    pid: child.pid!,
    kill: () => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    },
    exited,
  };
}
