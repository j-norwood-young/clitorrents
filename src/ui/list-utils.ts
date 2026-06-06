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

export type MainLayoutMetrics = {
  mainContentHeight: number;
  resultsVisible: number;
  transfersVisible: number;
  sparkW: number;
  searchColW: number;
  titleMax: number;
};

export function computeMainLayout(termRows: number, width: number): MainLayoutMetrics {
  const sparkW = Math.max(8, Math.min(32, Math.floor(width / 4)));
  const searchColW = Math.floor(width * 0.48);
  const titleMax = Math.max(16, searchColW - 6);
  const headerReserve = 3;
  const footerReserve = termRows < 22 ? 3 : 4;
  const mainContentHeight = Math.max(6, termRows - headerReserve - footerReserve);
  const resultsVisible = Math.max(3, Math.floor(mainContentHeight * 0.45));
  const transfersVisible = Math.max(2, Math.floor(mainContentHeight * 0.35));
  return { mainContentHeight, resultsVisible, transfersVisible, sparkW, searchColW, titleMax };
}

/** Number of result pages for a fixed page size (minimum 1). */
export function resultsPageCount(total: number, pageSize: number): number {
  if (total === 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Items on a given results page. */
export function resultsPageItemCount(page: number, total: number, pageSize: number): number {
  if (total === 0 || pageSize <= 0) return 0;
  const start = page * pageSize;
  if (start >= total) return 0;
  return Math.min(pageSize, total - start);
}

export type FocusPane = 'search' | 'results' | 'transfers';

export type AppView =
  | { kind: 'main' }
  | { kind: 'detail'; infoHash: string }
  | { kind: 'config' };

export function isTorrentUiPaused(s: { paused: boolean; dlPaused: boolean }): boolean {
  return s.paused || s.dlPaused;
}
