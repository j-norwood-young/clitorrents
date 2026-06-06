import fs from 'node:fs';
import path from 'node:path';
import { getDaemonPidPath } from '../config.js';

export class DaemonLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonLockError';
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    return true;
  }
}

export function readDaemonPid(): number | null {
  const pidPath = getDaemonPidPath();
  try {
    const pid = Number.parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function acquireDaemonLock(): void {
  const pidPath = getDaemonPidPath();
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  const existing = readDaemonPid();
  if (existing != null && isProcessRunning(existing)) {
    throw new DaemonLockError(`Daemon already running (pid ${existing})`);
  }
  if (existing != null) {
    fs.rmSync(pidPath, { force: true });
  }
  fs.writeFileSync(pidPath, String(process.pid), 'utf8');
}

export function releaseDaemonLock(): void {
  const pidPath = getDaemonPidPath();
  const existing = readDaemonPid();
  if (existing === process.pid) {
    fs.rmSync(pidPath, { force: true });
  }
}

export async function stopDaemonProcess(timeoutMs = 8000): Promise<boolean> {
  const pid = readDaemonPid();
  if (pid == null) return false;
  if (!isProcessRunning(pid)) {
    fs.rmSync(getDaemonPidPath(), { force: true });
    return false;
  }
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      fs.rmSync(getDaemonPidPath(), { force: true });
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessRunning(pid);
}
