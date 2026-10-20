import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import WebTorrent from 'webtorrent';
import type { Torrent } from 'webtorrent';
// @ts-expect-error -- bittorrent-tracker ships no types
import { Server as TrackerServer } from 'bittorrent-tracker';

/** WebTorrent options that keep a client off DHT/LSD/UPnP so it only finds peers via the mock tracker. */
export const LOCAL_ONLY_CLIENT_OPTIONS: Record<string, unknown> = {
  dht: false,
  lsd: false,
  utPex: false,
  natUpnp: false,
  natPmp: false,
  utp: false,
  webSeeds: false,
};

export type MockTorrentSpec = {
  /** Torrent name (also the search title). */
  name: string;
  /** Files relative to the torrent root; one entry = single-file torrent named `name`. */
  files: { path: string; size: number }[];
  seeds?: number;
  peers?: number;
};

export type MockTorrent = {
  name: string;
  infoHash: string;
  magnet: string;
  torrentFile: Buffer;
  /** Absolute paths of the seeded source files. */
  sourceFiles: string[];
  /** Relative path → sha1 hex of contents. */
  sha1s: Record<string, string>;
  length: number;
  seeds: number;
  peers: number;
};

export type MockSearchRow = {
  title: string;
  seeds: number;
  peers: number;
  size: string;
  time: string;
  desc: string;
  infoHash: string;
};

export type MockTorrentServer = {
  /** Base URL of the HTTP API (search, magnets, .torrent files). */
  url: string;
  trackerUrl: string;
  torrents: MockTorrent[];
  /** Search requests received, for assertions. */
  searches: string[];
  close(): Promise<void>;
};

export const DEFAULT_MOCK_TORRENTS: MockTorrentSpec[] = [
  {
    name: 'Mock.Movie.2024.1080p.mkv',
    files: [{ path: 'Mock.Movie.2024.1080p.mkv', size: 256 * 1024 }],
    seeds: 42,
    peers: 7,
  },
  {
    name: 'Mock.Show.S01E02.720p',
    files: [
      { path: 'Mock.Show.S01E02.720p.mkv', size: 192 * 1024 },
      { path: 'subs/en.srt', size: 4 * 1024 },
    ],
    seeds: 12,
    peers: 3,
  },
];

/** Deterministic pseudo-random bytes so file hashes are stable across runs. */
function deterministicBytes(seed: string, size: number): Buffer {
  const out = Buffer.alloc(size);
  let block = crypto.createHash('sha256').update(seed).digest();
  let offset = 0;
  while (offset < size) {
    const n = Math.min(block.length, size - offset);
    block.copy(out, offset, 0, n);
    offset += n;
    block = crypto.createHash('sha256').update(block).digest();
  }
  return out;
}

function sha1(buf: Buffer): string {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function seed(client: InstanceType<typeof WebTorrent>, input: string, opts: Record<string, unknown>): Promise<Torrent> {
  return new Promise((resolve, reject) => {
    const c = client as unknown as {
      seed(input: string, opts: Record<string, unknown>, cb: (t: Torrent) => void): Torrent;
    };
    const t = c.seed(input, opts, (tor) => resolve(tor));
    t.once('error', (err) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

function destroyClient(client: InstanceType<typeof WebTorrent>): Promise<void> {
  return new Promise((resolve) => client.destroy(() => resolve()));
}

/**
 * Seeder that accepts uTP as well as TCP (real clients like the daemon dial uTP first).
 * With torrentPort 0, WebTorrent binds TCP to a free port and then uTP to the same number,
 * which can collide under parallel test runs — retry until both bind.
 */
async function createSeeder(): Promise<InstanceType<typeof WebTorrent>> {
  for (let attempt = 1; ; attempt++) {
    const client = new WebTorrent({ ...LOCAL_ONLY_CLIENT_OPTIONS, utp: true, torrentPort: 0 });
    const bound = await new Promise<boolean>((resolve) => {
      client.once('listening', () => resolve(true));
      client.once('error', () => resolve(false));
    });
    if (bound) return client;
    await destroyClient(client);
    if (attempt >= 10) throw new Error('Mock seeder could not bind a TCP+uTP port');
  }
}

/**
 * Local BitTorrent swarm + search API for tests and manual TUI runs.
 * Tracker, seeder and HTTP API all bind to 127.0.0.1; nothing touches the internet.
 */
export async function startMockTorrentServer(
  opts: { specs?: MockTorrentSpec[]; port?: number } = {}
): Promise<MockTorrentServer> {
  const specs = opts.specs ?? DEFAULT_MOCK_TORRENTS;
  const contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clitorrents-mock-'));

  const tracker = new TrackerServer({ udp: false, ws: false, stats: false, http: true });
  const trackerPort = await new Promise<number>((resolve, reject) => {
    tracker.once('error', reject);
    tracker.listen(0, '127.0.0.1', () => {
      const addr = tracker.http.address() as AddressInfo;
      resolve(addr.port);
    });
  });
  const trackerUrl = `http://127.0.0.1:${trackerPort}/announce`;

  const seeder = await createSeeder();
  const torrents: MockTorrent[] = [];

  for (const spec of specs) {
    const single = spec.files.length === 1 && spec.files[0]!.path === spec.name;
    const root = single ? contentDir : path.join(contentDir, spec.name);
    const sha1s: Record<string, string> = {};
    const sourceFiles: string[] = [];
    for (const f of spec.files) {
      const abs = path.join(root, f.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const data = deterministicBytes(`${spec.name}/${f.path}`, f.size);
      fs.writeFileSync(abs, data);
      sha1s[f.path] = sha1(data);
      sourceFiles.push(abs);
    }
    const input = single ? sourceFiles[0]! : root;
    const tor = await seed(seeder, input, {
      name: spec.name,
      announce: [trackerUrl],
      private: false,
      createdBy: 'clitorrents-mock',
      creationDate: 1_700_000_000,
    });
    const t = tor as Torrent & { magnetURI: string; torrentFile: Uint8Array };
    torrents.push({
      name: spec.name,
      infoHash: t.infoHash.toLowerCase(),
      magnet: t.magnetURI,
      torrentFile: Buffer.from(t.torrentFile),
      sourceFiles,
      sha1s,
      length: spec.files.reduce((n, f) => n + f.size, 0),
      seeds: spec.seeds ?? 1,
      peers: spec.peers ?? 0,
    });
  }

  const searches: string[] = [];
  const api = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const send = (status: number, body: unknown, type = 'application/json'): void => {
      const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length });
      res.end(data);
    };

    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') ?? '').trim();
      const limit = Number(url.searchParams.get('limit') ?? 0);
      searches.push(q);
      if (q === '__error') return send(500, { error: 'mock failure' });
      if (q === '__empty') return send(200, []);
      const respond = (): void => {
        const needle = q.toLowerCase();
        let rows: MockSearchRow[] = torrents
          .filter((t) => !needle || t.name.toLowerCase().includes(needle))
          .map((t) => ({
            title: t.name,
            seeds: t.seeds,
            peers: t.peers,
            size: formatSize(t.length),
            time: '2024-01-01',
            desc: `${url.origin}/torrent/${t.infoHash}.torrent`,
            infoHash: t.infoHash,
          }));
        if (limit > 0) rows = rows.slice(0, limit);
        send(200, rows);
      };
      if (q === '__slow') setTimeout(respond, 500);
      else respond();
      return;
    }

    const magnetMatch = /^\/magnet\/([a-f0-9]{40})$/i.exec(url.pathname);
    if (magnetMatch) {
      const t = torrents.find((x) => x.infoHash === magnetMatch[1]!.toLowerCase());
      return t ? send(200, t.magnet, 'text/plain') : send(404, { error: 'not found' });
    }

    const fileMatch = /^\/torrent\/([a-f0-9]{40})\.torrent$/i.exec(url.pathname);
    if (fileMatch) {
      const t = torrents.find((x) => x.infoHash === fileMatch[1]!.toLowerCase());
      return t ? send(200, t.torrentFile, 'application/x-bittorrent') : send(404, { error: 'not found' });
    }

    send(404, { error: 'not found' });
  });
  const apiPort = await listen(api, opts.port ?? 0);

  return {
    url: `http://127.0.0.1:${apiPort}`,
    trackerUrl,
    torrents,
    searches,
    async close() {
      api.closeAllConnections();
      await new Promise<void>((resolve) => api.close(() => resolve()));
      await destroyClient(seeder);
      await new Promise<void>((resolve) => tracker.close(() => resolve()));
      fs.rmSync(contentDir, { recursive: true, force: true });
    },
  };
}
