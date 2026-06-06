import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppConfig } from '../config.js';
import { getDaemonBaseUrl } from '../config.js';
import type { TorrentEngine } from '../engine/torrent-engine.js';
import { readDaemonPid } from './instance.js';
import { broadcastSse, writeSse } from './sse.js';

export type DaemonState = {
  snapshots: ReturnType<TorrentEngine['getSnapshots']>;
  downloadSpeed: number;
  uploadSpeed: number;
  networkOnline: boolean;
  config: AppConfig;
  baseDownloadDir: string;
};

export type DaemonStatus = {
  running: true;
  version: string;
  pid: number;
  startedAt: string;
  /** Omitted when the running daemon predates /api/status (use health+state fallback). */
  uptimeMs?: number;
  url: string;
  transferCount: number;
  /** Omitted when the running daemon predates /api/status. */
  sseClients?: number;
  networkOnline: boolean;
  downloadSpeed: number;
  uploadSpeed: number;
  baseDownloadDir: string;
  pidFileMatches: boolean;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function buildState(engine: TorrentEngine): DaemonState {
  return {
    snapshots: engine.getSnapshots(),
    downloadSpeed: engine.getClientDownloadSpeed(),
    uploadSpeed: engine.getClientUploadSpeed(),
    networkOnline: engine.isNetworkOnline(),
    config: engine.getConfig(),
    baseDownloadDir: engine.getBaseDownloadDir(),
  };
}

export function createDaemonServer(
  engine: TorrentEngine,
  config: AppConfig,
  opts?: { onShutdown?: () => void }
): Server {
  const sseClients = new Set<ServerResponse>();
  const startedAt = Date.now();

  const pushState = (): void => {
    broadcastSse(sseClients, 'state', buildState(engine));
  };

  engine.on('update', pushState);
  engine.on('network', (state: 'online' | 'offline') => {
    broadcastSse(sseClients, 'network', { state });
    pushState();
  });
  engine.on('session-restored', (result) => {
    broadcastSse(sseClients, 'session-restored', result);
    pushState();
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    const path = url.pathname;

    try {
      if (method === 'GET' && path === '/api/health') {
        json(res, 200, { ok: true, version: '0.4.0' });
        return;
      }

      if (method === 'GET' && path === '/api/status') {
        const pidFile = readDaemonPid();
        json(res, 200, {
          running: true,
          version: '0.4.0',
          pid: process.pid,
          startedAt: new Date(startedAt).toISOString(),
          uptimeMs: Date.now() - startedAt,
          url: getDaemonBaseUrl(config),
          transferCount: engine.getSnapshots().length,
          sseClients: sseClients.size,
          networkOnline: engine.isNetworkOnline(),
          downloadSpeed: engine.getClientDownloadSpeed(),
          uploadSpeed: engine.getClientUploadSpeed(),
          baseDownloadDir: engine.getBaseDownloadDir(),
          pidFileMatches: pidFile === process.pid,
        } satisfies DaemonStatus);
        return;
      }

      if (method === 'GET' && path === '/api/state') {
        json(res, 200, buildState(engine));
        return;
      }

      if (method === 'GET' && path === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });
        writeSse(res, 'state', buildState(engine));
        return;
      }

      if (method === 'GET' && path.startsWith('/api/peers/')) {
        const infoHash = decodeURIComponent(path.slice('/api/peers/'.length));
        json(res, 200, engine.getPeers(infoHash));
        return;
      }

      if (method === 'GET' && path.startsWith('/api/has-active/')) {
        const infoHash = decodeURIComponent(path.slice('/api/has-active/'.length));
        json(res, 200, { active: engine.hasActiveTorrent(infoHash) });
        return;
      }

      if (method === 'POST' && path === '/api/restore-session') {
        const result = await engine.restoreSession();
        pushState();
        json(res, 200, result);
        return;
      }

      if (method === 'POST' && path === '/api/add') {
        const body = await readJson<{
          torrentId?: string;
          torrentIdBase64?: string;
          options?: Record<string, unknown>;
        }>(req);
        let torrentId: string | Uint8Array;
        if (body.torrentIdBase64) {
          torrentId = Buffer.from(body.torrentIdBase64, 'base64');
        } else if (body.torrentId) {
          torrentId = body.torrentId;
        } else {
          json(res, 400, { error: 'torrentId or torrentIdBase64 required' });
          return;
        }
        const options = body.options ?? {};
        await engine.add(torrentId, {
          name: options.name ? String(options.name) : undefined,
          downloadDir: options.downloadDir ? String(options.downloadDir) : undefined,
          sessionRestore: Boolean(options.sessionRestore),
          mediaCategory: options.mediaCategory ? String(options.mediaCategory) : undefined,
          restoreDlPaused: options.restoreDlPaused ? Boolean(options.restoreDlPaused) : undefined,
        });
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/pause') {
        const body = await readJson<{ infoHash?: string }>(req);
        engine.pauseDownload(String(body.infoHash ?? ''));
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/resume') {
        const body = await readJson<{ infoHash?: string }>(req);
        engine.resumeDownload(String(body.infoHash ?? ''));
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/remove') {
        const body = await readJson<{ infoHash?: string; destroyFiles?: boolean }>(req);
        await engine.removeTorrent(String(body.infoHash ?? ''), Boolean(body.destroyFiles));
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/config') {
        const body = await readJson<{ config?: AppConfig; persist?: boolean }>(req);
        if (!body.config) {
          json(res, 400, { error: 'config required' });
          return;
        }
        engine.setConfig(body.config, { persist: Boolean(body.persist) });
        pushState();
        json(res, 200, engine.getConfig());
        return;
      }

      if (method === 'POST' && path === '/api/base-download-dir') {
        const body = await readJson<{ dir?: string }>(req);
        engine.setBaseDownloadDir(String(body.dir ?? ''));
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/limits') {
        const body = await readJson<{
          downloadBps?: number;
          uploadBps?: number;
          persist?: boolean;
        }>(req);
        const cfg = engine.getConfig();
        engine.setGlobalLimits(
          body.downloadBps ?? cfg.globalDownloadLimitBps,
          body.uploadBps ?? cfg.globalUploadLimitBps,
          Boolean(body.persist)
        );
        pushState();
        json(res, 200, engine.getConfig());
        return;
      }

      if (method === 'POST' && path === '/api/default-max-ratio') {
        const body = await readJson<{ ratio?: number | null; persist?: boolean }>(req);
        engine.setDefaultMaxRatio(body.ratio ?? null, Boolean(body.persist));
        pushState();
        json(res, 200, engine.getConfig());
        return;
      }

      if (method === 'POST' && path === '/api/torrent-policy') {
        const body = await readJson<{
          infoHash?: string;
          patch?: { maxRatio?: number | null; maxUploadBytes?: number | null };
        }>(req);
        engine.updateTorrentPolicy(String(body.infoHash ?? ''), body.patch ?? {});
        pushState();
        json(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && path === '/api/shutdown') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        await engine.shutdown((progress) => {
          writeSse(res, 'shutdown-progress', progress);
        });
        writeSse(res, 'shutdown-done', { ok: true });
        res.end();
        server.close(() => {
          opts?.onShutdown?.();
        });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: msg });
    }
  });

  server.on('close', () => {
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
  });

  return server;
}

export function listenDaemonServer(
  server: Server,
  config: AppConfig
): Promise<void> {
  const host = config.daemon?.host ?? '127.0.0.1';
  const port = config.daemon?.port ?? 17359;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}
