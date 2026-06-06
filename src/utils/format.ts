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

/** Compact size label with one decimal for KB+ (e.g. 10.2KB, 1.4GB). */
export function formatBytesCompact1(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${Math.round(v)}B`;
  return `${v.toFixed(1)}${u[i]}`;
}

/** Downloaded/total pair for transfer rows (e.g. 10.2KB/10.1GB). */
export function formatTransferProgress(downloaded: number, total: number): string {
  const dl = formatBytesCompact1(downloaded);
  const tot = total > 0 ? formatBytesCompact1(total) : '—';
  return `${dl}/${tot}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return '—';
  return `${formatBytes(bps)}/s`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
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

export function shortenPath(filePath: string, max = 32): string {
  if (filePath.length <= max) return filePath;
  return '…' + filePath.slice(-(max - 1));
}

export function formatRatio(r: number): string {
  if (!Number.isFinite(r)) return '—';
  return r.toFixed(2);
}
