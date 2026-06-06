import EventEmitter from 'node:events';
import dns from 'node:dns/promises';

export type ConnectivityState = 'online' | 'offline' | 'unknown';

export type ConnectivityProbe = () => Promise<boolean>;

const DEFAULT_HOSTS = ['1.1.1.1', '8.8.8.8'];

/** Lightweight DNS lookup probe — no HTTP, works offline-tolerant in tests via injection. */
export async function defaultConnectivityProbe(
  hosts: string[] = DEFAULT_HOSTS
): Promise<boolean> {
  for (const host of hosts) {
    try {
      await dns.lookup(host);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

export type ConnectivityMonitorOptions = {
  probe?: ConnectivityProbe;
  onlineIntervalMs?: number;
  offlineIntervalMs?: number;
  maxOfflineIntervalMs?: number;
};

/**
 * Polls network reachability with backoff while offline.
 * Emits `online`, `offline`, and `change` (with state).
 */
export class ConnectivityMonitor extends EventEmitter {
  private state: ConnectivityState = 'unknown';
  private probe: ConnectivityProbe;
  private onlineIntervalMs: number;
  private offlineIntervalMs: number;
  private maxOfflineIntervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentIntervalMs: number;
  private running = false;

  constructor(opts: ConnectivityMonitorOptions = {}) {
    super();
    this.probe = opts.probe ?? defaultConnectivityProbe;
    this.onlineIntervalMs = opts.onlineIntervalMs ?? 15_000;
    this.offlineIntervalMs = opts.offlineIntervalMs ?? 5_000;
    this.maxOfflineIntervalMs = opts.maxOfflineIntervalMs ?? 60_000;
    this.currentIntervalMs = this.onlineIntervalMs;
  }

  getState(): ConnectivityState {
    return this.state;
  }

  isOnline(): boolean {
    return this.state === 'online';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.checkNow();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async checkNow(): Promise<ConnectivityState> {
    const ok = await this.probe();
    const next: ConnectivityState = ok ? 'online' : 'offline';
    if (next !== this.state) {
      this.state = next;
      this.currentIntervalMs =
        next === 'online' ? this.onlineIntervalMs : this.offlineIntervalMs;
      this.emit('change', next);
      this.emit(next);
    } else if (next === 'offline') {
      this.currentIntervalMs = Math.min(
        this.currentIntervalMs * 1.5,
        this.maxOfflineIntervalMs
      );
    }
    this.scheduleNext();
    return this.state;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.checkNow();
    }, this.currentIntervalMs);
  }
}
