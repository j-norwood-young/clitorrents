export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return '—';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0 || ms === Infinity) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function formatGlobalLimitBps(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return '∞';
  if (bps === 0) return '0';
  return formatSpeed(bps);
}

export function formatRatio(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return r.toFixed(2);
}
