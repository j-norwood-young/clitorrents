import type { Server } from 'node:http';
import { createDaemonServer } from '../daemon/http-server.js';
import type { TorrentEngine } from '../engine/torrent-engine.js';
import type { AppConfig } from '../config.js';
import { closeServer, listenOnFreePort } from './helpers.js';

export type DaemonFixture = {
  server: Server;
  url: string;
  port: number;
  /** Config whose daemon host/port point at this server. */
  config: AppConfig;
  shutdownCalls: number;
  close(): Promise<void>;
};

/** createDaemonServer on 127.0.0.1:<random>; accepts a real TorrentEngine or a FakeEngine. */
export async function startDaemonFixture(
  engine: unknown,
  config: AppConfig,
  port = 0
): Promise<DaemonFixture> {
  const fx = { shutdownCalls: 0 } as DaemonFixture;
  // Port is filled in after listen; /api/status reads it from the config object.
  const cfg: AppConfig = { ...config, daemon: { host: '127.0.0.1', port: port || 1 } };
  const server = createDaemonServer(engine as TorrentEngine, cfg, {
    onShutdown: () => {
      fx.shutdownCalls++;
    },
  });
  const actual = await listenOnFreePort(server, port);
  cfg.daemon!.port = actual;
  return Object.assign(fx, {
    server,
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    config: cfg,
    close: () => closeServer(server),
  });
}
