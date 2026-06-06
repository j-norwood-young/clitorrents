import { getDaemonBaseUrl, type AppConfig } from '../config.js';
import type { DaemonState, DaemonStatus } from '../daemon/http-server.js';
import { pingDaemon } from '../daemon/ensure-daemon.js';
import { isProcessRunning, readDaemonPid } from '../daemon/instance.js';
import { formatDuration, formatSpeed } from '../utils/format.js';

export type DaemonStatusOffline = {
  running: false;
  url: string;
  pidFile: number | null;
  pidFileStale: boolean;
  message: string;
};

function pidLine(status: DaemonStatus): string {
  if (!status.pid) return '  PID:       unknown';
  if (!status.pidFileMatches) return `  PID:       ${status.pid} (pid file mismatch!)`;
  if (status.sseClients === undefined) {
    return `  PID:       ${status.pid} (from pid file)`;
  }
  return `  PID:       ${status.pid}`;
}

export function formatDaemonStatus(status: DaemonStatus): string {
  const lines = [
    'clitorrents daemon: running',
    `  URL:       ${status.url}`,
    pidLine(status),
    `  Uptime:    ${status.uptimeMs != null ? formatDuration(status.uptimeMs) : '— (restart daemon to track)'}`,
    `  Transfers: ${status.transferCount}`,
    `  Clients:   ${
      status.sseClients != null
        ? `${status.sseClients} SSE (TUI / MCP / download)`
        : '— (restart daemon to track)'
    }`,
    `  Network:   ${status.networkOnline ? 'online' : 'offline'}`,
    `  Speed:     DL ${formatSpeed(status.downloadSpeed)}  UL ${formatSpeed(status.uploadSpeed)}`,
    `  Save dir:  ${status.baseDownloadDir}`,
  ];
  if (status.sseClients === undefined) {
    lines.push('  Note:      rebuild + restart daemon for uptime and client count');
  }
  return lines.join('\n');
}

export function formatDaemonStatusOffline(status: DaemonStatusOffline): string {
  const lines = ['clitorrents daemon: not running', `  URL:     ${status.url}`];
  if (status.pidFile != null) {
    lines.push(
      `  PID file: ${status.pidFile}${status.pidFileStale ? ' (stale — process exited)' : ' (process alive but API unreachable)'}`
    );
  }
  lines.push(`  ${status.message}`);
  return lines.join('\n');
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function buildStatusFromHealthAndState(
  baseUrl: string,
  configUrl: string
): Promise<DaemonStatus | null> {
  const root = baseUrl.replace(/\/$/, '');
  const [health, state] = await Promise.all([
    fetchJson<{ version?: string }>(`${root}/api/health`),
    fetchJson<DaemonState>(`${root}/api/state`),
  ]);
  if (!health || !state) return null;

  const pidFile = readDaemonPid();
  return {
    running: true,
    version: health.version ?? 'unknown',
    pid: pidFile ?? 0,
    startedAt: '',
    url: configUrl,
    transferCount: state.snapshots.length,
    networkOnline: state.networkOnline,
    downloadSpeed: state.downloadSpeed,
    uploadSpeed: state.uploadSpeed,
    baseDownloadDir: state.baseDownloadDir,
    pidFileMatches: pidFile != null && isProcessRunning(pidFile),
  };
}

export async function fetchDaemonStatus(
  baseUrl: string,
  configUrl = baseUrl
): Promise<DaemonStatus | null> {
  const root = baseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${root}/api/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return (await res.json()) as DaemonStatus;
    if (res.status === 404 && (await pingDaemon(baseUrl))) {
      return buildStatusFromHealthAndState(baseUrl, configUrl);
    }
    return null;
  } catch {
    if (await pingDaemon(baseUrl)) {
      return buildStatusFromHealthAndState(baseUrl, configUrl);
    }
    return null;
  }
}

export async function runStatusCommand(config: AppConfig): Promise<number> {
  const baseUrl = getDaemonBaseUrl(config);
  const live = await fetchDaemonStatus(baseUrl);
  if (live) {
    console.log(formatDaemonStatus(live));
    return 0;
  }

  const pidFile = readDaemonPid();
  const offline: DaemonStatusOffline = {
    running: false,
    url: baseUrl,
    pidFile,
    pidFileStale: pidFile != null && !isProcessRunning(pidFile),
    message: 'Start with: clitorrents daemon  (or launch the TUI / MCP)',
  };
  console.log(formatDaemonStatusOffline(offline));
  return pidFile != null && !offline.pidFileStale ? 2 : 1;
}
