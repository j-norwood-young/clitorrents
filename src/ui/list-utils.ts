/** Keep selection index visible in a fixed-height window. */
export function listScrollTop(
  itemCount: number,
  selectedIndex: number,
  visibleCount: number
): number {
  if (itemCount === 0 || visibleCount <= 0) return 0;
  const maxScroll = Math.max(0, itemCount - visibleCount);
  return Math.min(maxScroll, Math.max(0, selectedIndex - visibleCount + 1));
}

export type FocusPane = 'search' | 'results' | 'transfers';

export type AppView =
  | { kind: 'main' }
  | { kind: 'detail'; infoHash: string }
  | { kind: 'config' };

export function isTorrentUiPaused(s: { paused: boolean; dlPaused: boolean }): boolean {
  return s.paused || s.dlPaused;
}
