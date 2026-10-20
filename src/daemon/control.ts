import { getDaemonBaseUrl, type AppConfig } from '../config.js';
import { fetchDaemonStatus } from '../cli/status-cmd.js';
import type { ShutdownProgress } from '../engine/torrent-engine.js';
import { ensureDaemonRunning, pingDaemon } from './ensure-daemon.js';
import type { DaemonStatus } from './http-server.js';
import { isProcessRunning, readDaemonPid, stopDaemonProcess } from './instance.js';
import { parseSseBlock } from './sse.js';

export type DaemonPanelStatus =
  | DaemonStatus
  | {
      running: false;
      url: string;
      /** PID from the pid file when the process is alive but the API is unreachable. */
      orphanPid: number | null;
    };

/** Graceful shutdown can hang when the engine is wedged — fall back to signals after this. */
const GRACEFUL_STOP_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getDaemonPanelStatus(config: AppConfig): Promise<DaemonPanelStatus> {
  const baseUrl = getDaemonBaseUrl(config);
  const live = await fetchDaemonStatus(baseUrl);
  if (live) return live;
  const pid = readDaemonPid();
  return {
    running: false,
    url: baseUrl,
    orphanPid: pid != null && isProcessRunning(pid) ? pid : null,
  };
}

async function requestShutdown(
  baseUrl: string,
  onProgress?: (progress: ShutdownProgress) => void
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(GRACEFUL_STOP_MS),
    });
    if (!res.ok || !res.body) return false;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        const parsed = parseSseBlock(buffer.slice(0, split));
        buffer = buffer.slice(split + 2);
        if (parsed?.event === 'shutdown-progress') {
          onProgress?.(parsed.data as ShutdownProgress);
        }
        if (parsed?.event === 'shutdown-done') return true;
        split = buffer.indexOf('\n\n');
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop the daemon: graceful API shutdown first, then SIGTERM, then SIGKILL.
 * Returns a short description of how it stopped.
 */
export async function stopDaemon(
  config: AppConfig,
  onProgress?: (message: string) => void
): Promise<string> {
  const baseUrl = getDaemonBaseUrl(config);
  const pid = readDaemonPid();

  if (await pingDaemon(baseUrl)) {
    onProgress?.('Stopping transfers…');
    const graceful = await requestShutdown(baseUrl, (p) =>
      onProgress?.(`Stopping transfers… ${p.message}`)
    );
    if (graceful) {
      const exited = (): boolean => pid == null || !isProcessRunning(pid);
      for (let i = 0; i < 40 && !exited(); i++) await sleep(250);
      if (exited() && !(await pingDaemon(baseUrl))) return 'Daemon stopped';
    }
    onProgress?.('Daemon did not shut down cleanly — sending SIGTERM…');
  }

  if (pid == null || !isProcessRunning(pid)) {
    return (await pingDaemon(baseUrl)) ? 'Daemon still responding (unknown pid)' : 'Daemon not running';
  }
  if (await stopDaemonProcess(5000)) return 'Daemon stopped (SIGTERM)';

  onProgress?.('Daemon ignored SIGTERM — sending SIGKILL…');
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
  await stopDaemonProcess(2000);
  return 'Daemon killed (SIGKILL)';
}

export async function startDaemon(config: AppConfig): Promise<string> {
  const baseUrl = getDaemonBaseUrl(config);
  if (await pingDaemon(baseUrl)) return 'Daemon already running';
  await ensureDaemonRunning(config);
  return 'Daemon started';
}

export async function restartDaemon(
  config: AppConfig,
  onProgress?: (message: string) => void
): Promise<string> {
  await stopDaemon(config, onProgress);
  onProgress?.('Starting daemon…');
  await ensureDaemonRunning(config);
  return 'Daemon restarted';
}
