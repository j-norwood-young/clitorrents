import type { AppConfig } from '../config.js';
import { TorrentEngine } from '../engine/torrent-engine.js';
import { createDaemonServer, listenDaemonServer } from '../daemon/http-server.js';
import { acquireDaemonLock, releaseDaemonLock } from '../daemon/instance.js';

export async function runDaemonCommand(config: AppConfig): Promise<void> {
  acquireDaemonLock();
  const engine = new TorrentEngine(config);

  const finish = (): void => {
    releaseDaemonLock();
    process.exit(0);
  };

  const server = createDaemonServer(engine, config, { onShutdown: finish });
  process.on('SIGINT', () => {
    void engine.shutdown().then(() => server.close(finish));
  });
  process.on('SIGTERM', () => {
    void engine.shutdown().then(() => server.close(finish));
  });

  await listenDaemonServer(server, config);
  const host = config.daemon?.host ?? '127.0.0.1';
  const port = config.daemon?.port ?? 17359;
  console.error(`clitorrents daemon listening on http://${host}:${port}`);

  void engine.restoreSession().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
  });
}
