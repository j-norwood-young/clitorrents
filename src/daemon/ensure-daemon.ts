import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.js';
import { getDaemonBaseUrl, getDaemonLogPath } from '../config.js';
import { EngineClient } from '../engine/engine-client.js';
import type { EngineLike } from '../engine/engine-like.js';
import { readDaemonPid, stopDaemonProcess } from './instance.js';
import type { DaemonState } from './http-server.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pingDaemon(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchDaemonState(baseUrl: string): Promise<DaemonState> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/state`);
  if (!res.ok) {
    throw new Error(`Daemon state unavailable (${res.status})`);
  }
  return (await res.json()) as DaemonState;
}

function daemonSpawnArgs(): string[] {
  // pkg bundles a single executable — re-exec it with the daemon subcommand.
  if ('pkg' in process) {
    return ['daemon'];
  }
  const entry = fileURLToPath(new URL('../cli.js', import.meta.url));
  return [entry, 'daemon'];
}

export async function spawnDaemon(): Promise<void> {
  const args = daemonSpawnArgs();
  // Send the detached daemon's output to a log file so crashes leave a trace.
  const logPath = getDaemonLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, 'a');
  try {
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: process.cwd(),
    });
    child.unref();
  } finally {
    fs.closeSync(logFd);
  }
}

export async function ensureDaemonRunning(config: AppConfig): Promise<string> {
  const baseUrl = getDaemonBaseUrl(config);
  if (await pingDaemon(baseUrl)) return baseUrl;

  if (readDaemonPid() != null) {
    await stopDaemonProcess();
  }

  await spawnDaemon();
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await pingDaemon(baseUrl)) return baseUrl;
  }
  throw new Error(
    `Could not reach clitorrents daemon at ${baseUrl}. Try: clitorrents daemon`
  );
}

export async function connectEngine(config: AppConfig): Promise<EngineLike> {
  const baseUrl = await ensureDaemonRunning(config);
  const state = await fetchDaemonState(baseUrl);
  const client = new EngineClient(baseUrl, state);
  await client.connect();
  return client;
}

export function resolveCliPath(): string {
  return path.dirname(fileURLToPath(new URL('../cli.js', import.meta.url)));
}
