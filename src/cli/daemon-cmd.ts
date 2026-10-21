import type { AppConfig } from '../config.js';
import { TorrentEngine } from '../engine/torrent-engine.js';
import { createDaemonServer, listenDaemonServer } from '../daemon/http-server.js';
import { acquireDaemonLock, releaseDaemonLock } from '../daemon/instance.js';

function logLine(message: string): void {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

function describeError(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

export async function runDaemonCommand(config: AppConfig): Promise<void> {
  acquireDaemonLock();
  // A stray peer/socket error shouldn't take down every download — log it and keep running.
  process.on('uncaughtException', (err) => {
    logLine(`uncaught exception: ${describeError(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    logLine(`unhandled rejection: ${describeError(reason)}`);
  });
  process.on('exit', (code) => {
    logLine(`daemon exiting (code ${code})`);
  });

  const engine = new TorrentEngine(config);
  engine.on('client-error', (err: Error) => {
    logLine(`torrent client error: ${describeError(err)}`);
  });
  for (const problem of engine.getDownloadDirProblems()) logLine(problem);
  engine.on('download-dir-problems', (problems: string[]) => {
    for (const problem of problems) logLine(problem);
  });
  engine.on('torrent-error', (e: { infoHash: string; name?: string; error: Error }) => {
    logLine(`torrent ${e.name || e.infoHash} stopped: ${describeError(e.error)}`);
  });

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
  logLine(`clitorrents daemon listening on http://${host}:${port} (pid ${process.pid})`);

  void engine.restoreSession().catch((err) => {
    logLine(`restore session failed: ${describeError(err)}`);
  });
}
